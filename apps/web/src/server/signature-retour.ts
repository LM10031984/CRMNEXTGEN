/**
 * LE RETOUR — ce que QualiOF fait d'un événement du prestataire (lot C.3).
 *
 * C'est ici que la boucle se ferme : depuis le lot C.2a une pièce PART, depuis
 * C.2c quelqu'un est PRÉVENU, et jusqu'ici rien ne REVENAIT. Le PDF signé et son
 * certificat rentrent par cette porte, et par elle seule.
 *
 * ⚠ CE MODULE N'EST PAS UNE SERVER ACTION. Un webhook n'a pas d'utilisateur, pas
 * de session, pas de `requireRole` : son autorisation est la signature HMAC du
 * prestataire, vérifiée par la route AVANT d'arriver ici. Les `AuditLog` écrits
 * portent donc `userId: null` — c'est la vérité, et l'inventer serait pire.
 *
 * TROIS PROPRIÉTÉS QUI NE SE NÉGOCIENT PAS :
 *
 *  1. **IDEMPOTENT.** Un prestataire rejoue ses webhooks. Sans mémoire,
 *     `submission.completed` rejoué re-téléchargerait le PDF, réécrirait le
 *     document et renverrait « voici votre exemplaire » — deux fois. La table
 *     `SignatureWebhookEvent` porte la mémoire, et sa clé inclut le SIGNATAIRE.
 *  2. **JAMAIS DE DEVINETTE.** Le signataire visé est retrouvé par identifiant,
 *     sinon par email, sinon pas du tout. « Le premier qui n'a pas signé »
 *     poserait la signature du client sur la ligne de l'organisme si deux
 *     événements arrivaient dans le désordre.
 *  3. **UNE PANNE D'EMAIL NE PERD PAS UNE SIGNATURE.** Le document et sa preuve
 *     sont écrits DANS une transaction ; les emails partent après, et leur échec
 *     est rendu, jamais propagé.
 */

import crypto from 'node:crypto';
import { prisma, type Prisma, type SignerRole } from '@qualiof/db';
import { parseSignatureSigners, type SignatureSigner } from '@qualiof/shared';
import { DOCS_BUCKET, uploadFile } from '@/lib/storage';
import { loadOfConfig } from '@/lib/of-config';
import { resoudreSignataireOf } from '@/lib/signature/signataire-of';
import { notifierExemplaireSigne, notifierSignataire } from '@/lib/signature/notifier';
import { NOM_DE_PIECE } from '@/lib/mailer-templates/signature-email-commun';
import { roleAncreOf } from '@/lib/signature/envoi-contrats';
import type { SignataireEnvoye } from '@/lib/signature/envoi-contrats';
import type { DocTypeSignable } from '@/lib/signature/regime';
import type { SignatureEvent, SignatureProvider } from '@/lib/signature/port';
import {
  appliquerRefus,
  appliquerSignature,
  cheminsSigne,
  prochainAPrevenir,
  statutApresRetour,
  trouverSignataire,
} from '@/lib/signature/retour';
import { estPieceSignable, relacherPieces } from '@/server/signature-relacher';

/** Ce que la route rend au prestataire, et ce que les logs gardent. */
export interface ResultatRetour {
  traite: boolean;
  motif: string;
}

/**
 * Les échecs qui MÉRITENT que le prestataire rejoue.
 *
 * ⚠ ET QUI EXIGENT D'OUBLIER L'ÉVÉNEMENT. La mémoire d'idempotence est écrite
 * AVANT le traitement — c'est ce qui empêche deux livraisons simultanées de
 * s'exécuter toutes les deux. Mais laisser la ligne après un échec temporaire
 * (le prestataire n'a pas encore produit le PDF signé) ferait DÉDUPLIQUER le
 * rejeu : la pièce resterait à jamais sans sa preuve, et personne ne le verrait.
 * On efface donc la mémoire de cet événement-là, et lui seul.
 */
const ECHECS_REJOUABLES: ReadonlySet<string> = new Set([
  'telechargement-impossible',
  'aucun-document-signe',
]);

/** Le statut `Document.status` posé quand la preuve est revenue. */
const STATUT_SIGNE = 'signed';

interface DemandeChargee {
  id: string;
  tenantId: string;
  providerId: string;
  status: string;
  sessionId: string;
  signers: Prisma.JsonValue;
  expiresAt: Date | null;
  signerRole: SignerRole | null;
  session: { code: string; product: { title: string } };
  documents: Array<{
    id: string;
    type: string;
    entityType: string;
    entityId: string;
    sessionId: string | null;
    participantId: string | null;
    status: string;
    signedPdfUrl: string | null;
  }>;
}

async function chargerDemande(providerId: string): Promise<DemandeChargee | null> {
  return prisma.signatureRequest.findUnique({
    where: { providerId },
    select: {
      id: true,
      tenantId: true,
      providerId: true,
      status: true,
      sessionId: true,
      signers: true,
      expiresAt: true,
      signerRole: true,
      session: { select: { code: true, product: { select: { title: true } } } },
      documents: {
        select: {
          id: true,
          type: true,
          entityType: true,
          entityId: true,
          sessionId: true,
          participantId: true,
          status: true,
          signedPdfUrl: true,
        },
      },
    },
  });
}

/**
 * Mémorise l'événement, ou dit qu'il est DÉJÀ passé.
 *
 * L'insertion EST le verrou : c'est la contrainte unique de la base qui
 * tranche, pas un `findFirst` suivi d'un `create` — entre les deux, une seconde
 * livraison du même webhook passerait.
 */
async function premierPassage(a: {
  tenantId: string;
  providerId: string;
  typeBrut: string;
  signerKey: string;
}): Promise<boolean> {
  try {
    await prisma.signatureWebhookEvent.create({
      data: {
        tenantId: a.tenantId,
        providerId: a.providerId,
        eventType: a.typeBrut,
        signerKey: a.signerKey,
      },
    });
    return true;
  } catch (e) {
    // P2002 = violation d'unicité : cet événement est déjà traité.
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      return false;
    }
    throw e;
  }
}

/** `SignataireEnvoye` — les signataires avec leur CAMP, pour les gabarits. */
function signatairesDe(signers: SignatureSigner[], docType: string): SignataireEnvoye[] {
  const roleOf = estPieceSignable(docType) ? roleAncreOf(docType) : null;
  return signers.map((s) => ({
    partie: roleOf !== null && s.role === roleOf ? 'OF' : 'CLIENT',
    role: s.role,
    nom: s.name,
    email: s.email,
    signUrl: s.signUrl,
    signedAt: s.signedAt,
  }));
}

function nomAffiche(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName.toUpperCase()}`.trim();
}

function libelleOrg(o: { legalName: string; brandName: string | null }): string {
  const enseigne = (o.brandName ?? '').trim();
  return enseigne.length > 0 ? enseigne : o.legalName;
}

/**
 * QUI la pièce concerne, et sous quelle organisation — re-dérivé du `Document`.
 *
 * ⚠ RE-DÉRIVÉ, PAS RE-DEVINÉ : mêmes sources que le plan d'envoi
 * (`sponsorOrgLabel`, `nomAffiche`). Le plan, lui, n'est pas persisté — le
 * reconstruire entièrement exigerait de rejouer le régime de toute la session,
 * des mois après, avec une donnée qui a pu changer. Le libellé produit ici ne
 * porte donc pas le compte de participants du plan : c'est voulu, un objet
 * d'email n'a que faire de « (2 participants) ».
 */
async function quiEstConcerne(doc: {
  entityType: string;
  entityId: string;
  participantId: string | null;
}): Promise<{ concerne: string; organisation: string | null }> {
  if (doc.participantId !== null) {
    const p = await prisma.sessionParticipant.findUnique({
      where: { id: doc.participantId },
      select: {
        person: { select: { firstName: true, lastName: true } },
        sponsorOrg: { select: { legalName: true, brandName: true } },
      },
    });
    return {
      concerne: p === null ? 'cet apprenant' : nomAffiche(p.person),
      organisation: p?.sponsorOrg == null ? null : libelleOrg(p.sponsorOrg),
    };
  }
  if (doc.entityType === 'organization') {
    const o = await prisma.organization.findUnique({
      where: { id: doc.entityId },
      select: { legalName: true, brandName: true },
    });
    const nom = o === null ? 'cette organisation' : libelleOrg(o);
    return { concerne: nom, organisation: o === null ? null : nom };
  }
  return { concerne: 'cette session', organisation: null };
}

/** Une notification cloche pour CHAQUE ADMIN du tenant. */
async function prevenirAdmins(
  tenantId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { tenantId, role: 'ADMIN' },
      select: { id: true },
    });
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((u) => ({
        tenantId,
        userId: u.id,
        type,
        payload: payload as Prisma.InputJsonValue,
      })),
    });
  } catch (e) {
    // Une cloche perdue est ennuyeuse ; faire échouer le retour d'une signature
    // parce que la cloche n'a pas sonné le serait davantage.
    console.error('[signature:retour] notification non créée :', e instanceof Error ? e.message : e);
  }
}

// ─── Événement 1 — un signataire a signé ─────────────────────────────────────

/**
 * `form.completed` : UN signataire vient de signer.
 *
 * ⚠ CET ÉVÉNEMENT NE PASSE JAMAIS LA DEMANDE EN `DONE`, même quand il concerne
 * le dernier signataire. `DONE` signifie « la preuve est revenue » — le PDF
 * signé et son certificat sont en bucket. Les poser ici rendrait la cellule
 * verte alors qu'aucun fichier n'est encore arrivé, et un admin qui la
 * téléchargerait récupérerait la version À ANCRES, sans signature. C'est
 * `submission.completed` qui apporte la preuve, et lui seul qui clôt.
 */
async function signataireASigne(
  demande: DemandeChargee,
  event: SignatureEvent,
): Promise<ResultatRetour> {
  const signers = parseSignatureSigners(demande.signers);
  const cible = trouverSignataire(signers, {
    signerId: event.signerId,
    email: event.signerEmail,
  });
  if (cible === null) {
    await prisma.signatureRequest.update({
      where: { id: demande.id },
      data: {
        lastError:
          `Signataire introuvable pour un événement de signature (id « ${event.signerId ?? '—'} », ` +
          `email « ${event.signerEmail ?? '—'} »). Rien n'a été écrit : poser cette signature ` +
          `sur une autre ligne dirait le contraire du certificat.`,
      },
    });
    return { traite: false, motif: 'signataire-introuvable' };
  }

  const apres = appliquerSignature(signers, cible, event.occurredAt);
  const statut = statutApresRetour(apres) === 'SENT' ? 'SENT' : 'PARTIALLY_SIGNED';

  await prisma.$transaction(async (tx) => {
    await tx.signatureRequest.update({
      where: { id: demande.id },
      data: { signers: apres as unknown as Prisma.InputJsonValue, status: statut, lastError: null },
    });
    await tx.auditLog.create({
      data: {
        tenantId: demande.tenantId,
        userId: null,
        entity: 'Document',
        entityId: demande.documents[0]?.id ?? demande.id,
        action: 'signature.signer_completed',
        diff: {
          signatureRequestId: demande.id,
          providerId: demande.providerId,
          signataire: { role: cible.role, nom: cible.name, email: cible.email },
          signedAt: event.occurredAt.toISOString(),
          demande: { before: demande.status, after: statut },
        },
      },
    });
  });

  // « À votre tour » — au suivant, s'il y en a un et s'il a un lien.
  const suivant = prochainAPrevenir(apres);
  if (suivant === null) return { traite: true, motif: 'signature-enregistree' };

  const doc = demande.documents[0];
  if (doc === undefined || !estPieceSignable(doc.type)) {
    return { traite: true, motif: 'signature-enregistree-sans-email' };
  }
  const { concerne, organisation } = await quiEstConcerne(doc);
  const of = await loadOfConfig(demande.tenantId);
  const signataireOf = await resoudreSignataireOf(demande.tenantId);

  await notifierSignataire({
    tenantId: demande.tenantId,
    sessionId: demande.sessionId,
    signatureRequestId: demande.id,
    documentId: doc.id,
    libellePiece: `${NOM_DE_PIECE[doc.type].titre} — ${concerne}`,
    piece: doc.type,
    concerne,
    organisation,
    formationTitre: demande.session.product.title,
    sessionCode: demande.session.code,
    dateLimite: demande.expiresAt ?? event.occurredAt,
    role: demande.signerRole ?? 'DIRIGEANT',
    // Le notifier prévient le RANG 0 de la liste qu'on lui donne : on lui donne
    // donc celui-là, et lui seul. Ré-appliquer ici la règle « qui est le
    // suivant » serait une seconde règle de choix.
    signataires: signatairesDe([suivant], doc.type),
    of,
    signataireOfNom: signataireOf.ok ? signataireOf.signatory.name : null,
  });

  return { traite: true, motif: 'signature-enregistree' };
}

// ─── Événement 2 — tout le monde a signé ─────────────────────────────────────

/**
 * `submission.completed` : la preuve revient.
 *
 * L'ORDRE EST LA RÈGLE. On télécharge D'ABORD (le PDF signé ET le certificat),
 * on écrit ENSUITE, dans une transaction. Poser `status = signed` avant d'avoir
 * les octets laisserait une cellule verte devant un bucket vide — et le PDF
 * signé fait foi (règle métier n°2).
 */
async function demandeTerminee(
  demande: DemandeChargee,
  event: SignatureEvent,
  provider: SignatureProvider,
): Promise<ResultatRetour> {
  const doc = demande.documents[0];
  if (doc === undefined) return { traite: false, motif: 'demande-sans-document' };

  let signes;
  let certificat: Buffer;
  try {
    signes = await provider.downloadSignedDocument(demande.providerId);
    certificat = await provider.downloadAuditTrail(demande.providerId);
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    await prisma.signatureRequest.update({
      where: { id: demande.id },
      data: {
        lastError:
          `Signatures recueillies, mais le document signé n'a pas pu être récupéré : ${cause} ` +
          `Rien n'a été écrit — le cron « signature-sync » réessaiera.`,
      },
    });
    return { traite: false, motif: 'telechargement-impossible' };
  }

  const pdf = signes[0]?.pdf;
  if (pdf === undefined || pdf.length === 0) {
    await prisma.signatureRequest.update({
      where: { id: demande.id },
      data: { lastError: "Le prestataire n'a rendu aucun document signé." },
    });
    return { traite: false, motif: 'aucun-document-signe' };
  }

  const sha8 = crypto.createHash('sha256').update(pdf).digest('hex').slice(0, 8);
  const chemins = cheminsSigne({
    tenantId: demande.tenantId,
    sessionCode: demande.session.code,
    docType: doc.type,
    entityId: doc.participantId ?? doc.entityId,
    sha8,
  });
  await uploadFile(DOCS_BUCKET, chemins.pdf, pdf, 'application/pdf');
  await uploadFile(DOCS_BUCKET, chemins.auditTrail, certificat, 'application/pdf');

  const signers = parseSignatureSigners(demande.signers);
  const tousSignes = signers.map((s) => ({
    ...s,
    signedAt: s.signedAt ?? event.occurredAt.toISOString(),
    status: s.declinedAt === null ? 'completed' : s.status,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: doc.id },
      data: {
        signedPdfUrl: chemins.pdf,
        signedAt: event.occurredAt,
        signatureKind: 'E_SIGNATURE',
        status: STATUT_SIGNE,
      },
    });
    await tx.signatureRequest.update({
      where: { id: demande.id },
      data: {
        status: 'DONE',
        completedAt: event.occurredAt,
        auditTrailUrl: chemins.auditTrail,
        signers: tousSignes as unknown as Prisma.InputJsonValue,
        lastError: null,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: demande.tenantId,
        userId: null,
        entity: 'Document',
        entityId: doc.id,
        action: 'signature.completed',
        diff: {
          signatureRequestId: demande.id,
          providerId: demande.providerId,
          docType: doc.type,
          signedPdfUrl: chemins.pdf,
          // Le certificat est une PIÈCE, pas une annexe technique : c'est lui
          // que les AGEFICE réclament (règle métier n°3).
          auditTrailUrl: chemins.auditTrail,
          signataires: signers.map((s) => ({ role: s.role, nom: s.name, email: s.email })),
          status: { before: doc.status, after: STATUT_SIGNE },
          demande: { before: demande.status, after: 'DONE' },
        },
      },
    });
  });

  await prevenirAdmins(demande.tenantId, 'signature.completed', {
    signatureRequestId: demande.id,
    sessionId: demande.sessionId,
    sessionCode: demande.session.code,
    documentId: doc.id,
    docType: doc.type,
  });

  // Les emails APRÈS la transaction : une panne SMTP ne doit pas faire perdre
  // une signature déjà revenue.
  if (estPieceSignable(doc.type)) {
    const { concerne, organisation } = await quiEstConcerne(doc);
    const of = await loadOfConfig(demande.tenantId);
    const signataireOf = await resoudreSignataireOf(demande.tenantId);
    const nomFichier = chemins.pdf.split('/').pop() ?? 'document-signe.pdf';
    const nomCertificat = chemins.auditTrail.split('/').pop() ?? 'certificat.audit-trail.pdf';
    try {
      await notifierExemplaireSigne({
        tenantId: demande.tenantId,
        sessionId: demande.sessionId,
        signatureRequestId: demande.id,
        documentId: doc.id,
        piece: doc.type,
        concerne,
        organisation,
        libellePiece: `${NOM_DE_PIECE[doc.type].titre} — ${concerne}`,
        formationTitre: demande.session.product.title,
        sessionCode: demande.session.code,
        signeLe: event.occurredAt,
        role: demande.signerRole,
        destinataires: signatairesDe(signers, doc.type),
        of,
        signataireOfNom: signataireOf.ok ? signataireOf.signatory.name : null,
        piecesJointes: [
          { filename: nomFichier, content: pdf },
          { filename: nomCertificat, content: certificat },
        ],
      });
    } catch (e) {
      console.error(
        '[signature:retour] exemplaire non envoyé :',
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { traite: true, motif: 'signature-terminee' };
}

// ─── Événements 3 et 4 — refus et expiration ─────────────────────────────────

/**
 * `form.declined` et `submission.expired` : la pièce doit SORTIR DU GEL.
 *
 * Elle repasse au statut que le journal lui connaissait avant l'envoi et
 * retrouve sa version SANS ancres — donc avec le tampon de l'organisme. C'est
 * exactement ce que fait l'annulation, par le MÊME chemin (`relacherPieces`) :
 * trois implémentations auraient divergé, et un document resté à ancres est un
 * document sans tampon qu'aucun écran ne signale.
 *
 * ⚠ On n'appelle PAS `provider.cancel` : la demande est déjà close chez lui.
 */
async function demandeFermee(
  demande: DemandeChargee,
  event: SignatureEvent,
  statut: 'DECLINED' | 'EXPIRED',
): Promise<ResultatRetour> {
  const signers = parseSignatureSigners(demande.signers);
  let signersApres = signers;
  let refusant: SignatureSigner | null = null;

  if (statut === 'DECLINED') {
    refusant = trouverSignataire(signers, { signerId: event.signerId, email: event.signerEmail });
    if (refusant !== null) signersApres = appliquerRefus(signers, refusant, event.occurredAt);
  }

  const cause =
    statut === 'DECLINED'
      ? refusant === null
        ? 'Un signataire a refusé de signer.'
        : `${refusant.name} a refusé de signer.`
      : "La demande a expiré : personne n'a signé dans le délai.";

  await prisma.signatureRequest.update({
    where: { id: demande.id },
    data: { signers: signersApres as unknown as Prisma.InputJsonValue },
  });

  await relacherPieces({
    tenantId: demande.tenantId,
    userId: null,
    demande: {
      id: demande.id,
      providerId: demande.providerId,
      status: demande.status,
      sessionId: demande.sessionId,
      documents: demande.documents,
    },
    statutDemande: statut,
    action: statut === 'DECLINED' ? 'signature.declined' : 'signature.expired',
    diff: {
      cause,
      refusant: refusant === null ? null : { role: refusant.role, nom: refusant.name, email: refusant.email },
      survenuLe: event.occurredAt.toISOString(),
    },
    lastError: cause,
    regeneration: {
      action:
        statut === 'DECLINED'
          ? 'document.regenerated_after_decline'
          : 'document.regenerated_after_expiry',
      motif:
        `Régénération SANS zones de signature après ${statut === 'DECLINED' ? 'refus' : 'expiration'} — ` +
        `symétrique de la régénération avec ancres faite à l'ouverture du récapitulatif. Sans elle, ` +
        `le document resterait sans le tampon de l'organisme.`,
    },
  });

  await prevenirAdmins(demande.tenantId, `signature.${statut.toLowerCase()}`, {
    signatureRequestId: demande.id,
    sessionId: demande.sessionId,
    sessionCode: demande.session.code,
    cause,
  });

  return { traite: true, motif: statut === 'DECLINED' ? 'refus-enregistre' : 'expiration-enregistree' };
}

// ─── L'aiguillage ────────────────────────────────────────────────────────────

export async function traiterEvenementSignature(a: {
  event: SignatureEvent;
  /** Le type BRUT du prestataire — c'est lui qui identifie la livraison. */
  typeBrut: string;
  provider: SignatureProvider;
}): Promise<ResultatRetour> {
  const { event, typeBrut, provider } = a;
  if (event.providerId.trim().length === 0) {
    return { traite: false, motif: 'sans-identifiant' };
  }

  const demande = await chargerDemande(event.providerId);
  // Une demande inconnue n'est pas une erreur : ce peut être un envoi fait
  // depuis l'interface du prestataire, ou une demande supprimée. On rend 200
  // pour qu'il cesse de rejouer — un 500 le ferait boucler.
  if (demande === null) return { traite: false, motif: 'demande-inconnue' };

  if (
    !(await premierPassage({
      tenantId: demande.tenantId,
      providerId: event.providerId,
      typeBrut,
      signerKey: event.signerId ?? '',
    }))
  ) {
    return { traite: false, motif: 'deja-traite' };
  }

  const oublier = async () => {
    await prisma.signatureWebhookEvent
      .deleteMany({
        where: {
          providerId: event.providerId,
          eventType: typeBrut,
          signerKey: event.signerId ?? '',
        },
      })
      .catch(() => undefined);
  };

  let resultat: ResultatRetour;
  try {
    resultat = await dispatcher(demande, event, typeBrut, provider);
  } catch (e) {
    // Une exception est par nature rejouable : on oublie avant de relancer,
    // sinon le rejeu serait dédupliqué et la pièce resterait sans sa preuve.
    await oublier();
    throw e;
  }
  if (ECHECS_REJOUABLES.has(resultat.motif)) await oublier();
  return resultat;
}

async function dispatcher(
  demande: DemandeChargee,
  event: SignatureEvent,
  typeBrut: string,
  provider: SignatureProvider,
): Promise<ResultatRetour> {
  switch (event.type) {
    case 'signer.completed':
      return signataireASigne(demande, event);
    case 'request.completed':
      return demandeTerminee(demande, event, provider);
    case 'signer.declined':
      return demandeFermee(demande, event, 'DECLINED');
    case 'request.expired':
      return demandeFermee(demande, event, 'EXPIRED');
    default:
      // Un événement qu'on ne traite pas est MÉMORISÉ quand même (il est passé
      // par `premierPassage`) : c'est ce qui empêche un type inconnu de revenir
      // en boucle, et la ligne garde la trace de ce que le prestataire envoie.
      return { traite: false, motif: `evenement-ignore:${typeBrut}` };
  }
}

/** Cet échec mérite-t-il que le prestataire rejoue ? */
export function estRejouable(motif: string): boolean {
  return ECHECS_REJOUABLES.has(motif);
}
