'use server';

/**
 * Moteur d'envoi en signature électronique — lot C.2a-2.
 * Spec `2026-09-04-signature-electronique-docs-signes.md` §5 lot C.
 *
 * DEUX ACTIONS, ET NON UNE (décision Laurent, 10/09/2026) :
 *
 *   « la régénération avec ancres se fait à l'ouverture du récapitulatif, qui
 *     affiche un aperçu du PDF exact qui partira ; le clic Envoyer confirme ce
 *     PDF-là, jamais une autre version. »
 *
 *  1. `preparerEnvoiSignature` calcule le plan, RÉGÉNÈRE les pièces concernées
 *     avec leurs ancres, écrase `pdfUrl`, recalcule `hashSha256`, journalise
 *     `document.regenerated_for_signature`, et rend de quoi afficher l'aperçu :
 *     les documents avec leur hash, les signataires résolus, ce qui bloque.
 *  2. `sendForSignature` envoie EXACTEMENT ce qui a été confirmé.
 *
 * LE POINT QUI FAIT TENIR LA PROMESSE. « Le clic confirme CE PDF-là » ne peut
 * pas reposer sur l'ordre des écrans : deux admins en parallèle, ou une
 * régénération déclenchée ailleurs entre l'aperçu et le clic, enverraient autre
 * chose que ce qui a été relu. `sendForSignature` reçoit donc les hashes vus à
 * l'aperçu et REFUSE dès qu'un hash a bougé. C'est un contrôle, pas une
 * convention d'appel.
 *
 * UN SEUL OBJET, JAMAIS DEUX. Il n'existe pas de second `Document` pour la
 * version à ancres : les générateurs remplacent la pièce, `pdfUrl` pointe la
 * version qui partira et `hashSha256` la décrit. Garder deux objets ferait
 * mentir le hash sur ce qui est réellement parti en signature.
 *
 * CE FICHIER N'INVENTE AUCUNE RÈGLE. Il charge, il appelle (`planifierEnvoi`,
 * les cascades de `representant.ts`, les générateurs existants), il garde, il
 * écrit. Qui signe quoi vient des trois colonnes d'`OpcoCatalog` ; qui signe
 * pour une organisation vient de la MÊME cascade que celle qui imprime
 * « Représentée par X » sur la convention ; quelles ancres porte une pièce vient
 * de `ANCRES_PAR_PIECE`, lecture des gabarits.
 *
 * HORS PÉRIMÈTRE, ASSUMÉ : aucun email n'est envoyé (D-9 → lot C.2c). Le
 * `signUrl` rendu par le prestataire est persisté dans `SignatureRequest.signers`
 * — rien n'est perdu — mais personne n'est prévenu tant que C.2c n'est pas livré.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import {
  annulerEnvoiSignatureSchema,
  preparerEnvoiSignatureSchema,
  sendForSignatureSchema,
  signatureSignersSchema,
  type CibleEnvoiSignature,
} from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { DOCS_BUCKET, downloadFile } from '@/lib/storage';
import {
  groupConventionAnyShapeWhere,
  GROUP_CONVENTION_ENTITY_TYPE,
} from '@/lib/docs/convention-coverage';
import { releveDeLaConvention } from '@/lib/sessions/payer-rule';
import {
  generateConventionCore,
  generateConventionEntrepriseCore,
} from '@/lib/closure/convention-core';
import {
  REGENERATION_PAR_PIECE,
  STATUT_ENVOYE,
  STATUT_GENERE,
  STATUT_SIGNE,
  estPieceSignable,
  formeDuDocumentEnBase,
  relacherPieces,
  trouverDocument,
} from '@/server/signature-relacher';
import {
  planifierEnvoi,
  type AnomalieEnvoi,
  type EnvoiPlanifie,
  type ParticipantPourEnvoi,
  type ScopeEnvoi,
} from '@/lib/signature/plan-envoi';
import { DOC_TYPES_SIGNABLES, type DocTypeSignable } from '@/lib/signature/regime';
import { chargerReglesSignature } from '@/lib/signature/catalogue-regime';
import {
  codesFinanceursDe,
  participantPourEnvoi,
  type ParticipantLu,
} from '@/lib/signature/participants-regime';
// ⚠ Les QUATRE cascades (`resoudreRepresentantEntreprise`,
// `resoudreRepresentantIndividuel`, `resoudreStagiaire`,
// `resoudreEmailRepresentant`) ne sont plus appelées ici : elles le sont par
// `signataire-de-la-piece.ts`, qui a repris la résolution du signataire côté
// bénéficiaire. Ce fichier ne garde que ce qu'il utilise encore — un import
// mort finit par faire croire qu'une règle vit à deux endroits.
import { nomAffiche, type OrganisationRepresentee } from '@/lib/signature/representant';
import {
  formeDuDocument,
  resoudreSignataireClient,
  type FormeDocument,
} from '@/lib/signature/signataire-de-la-piece';
// ⚠ LA résolution du signataire OF, et la SEULE : `signataire-of.ts` la porte
// pour le moteur comme pour la fiche session (11/09/2026).
import { resoudreSignataireOf, signataireOfPrevu } from '@/lib/signature/signataire-of';
import { getSignatureProvider, SignatureNotConfiguredError } from '@/lib/signature/provider';
import type { SignatureSignerInput } from '@/lib/signature/port';
import {
  messageAnnulationPrestataireImpossible,
  messageAucunChampDeSignature,
  messageCleInconnue,
  messageDemandeNonAnnulable,
  messagePreuveConservee,
  messageRegenerationApresAnnulationImpossible,
  messageDejaSigne,
  messageDocNonGenere,
  messageDocumentModifie,
  messageEnvoiEnCours,
  messageErreurPrestataire,
  messageRegenerationImpossible,
  texteMotifAnnulation,
  ofSigneLaPiece,
  roleAncreClient,
  roleAncreOf,
  type AnnulerEnvoiSignatureResult,
  type DocumentAEnvoyer,
  type Empechement,
  type EnvoiEffectue,
  type PieceRelachee,
  type EnvoiPrepare,
  type SignataireEnvoye,
  type SignataireOfPrevu,
  type PreparerEnvoiSignatureResult,
  type RefusEnvoi,
  type SendForSignatureResult,
  type ResultatNotification,
} from '@/lib/signature/envoi-contrats';
import { notifierSignataire } from '@/lib/signature/notifier';
import { loadOfConfig } from '@/lib/of-config';

/**
 * Les états de demande qu'une annulation peut encore atteindre (lot C.2b-bis).
 *
 * `DONE` en est exclu : une demande signée porte une preuve, l'annuler la
 * retirerait. `CANCELED` aussi : il n'y a rien à annuler deux fois. `DECLINED`
 * et `EXPIRED` y sont, eux, parce qu'ils laissent le `Document` gelé en
 * `sent_for_signature` : sans annulation, la pièce resterait bloquée pour un
 * motif déjà clos.
 */
const DEMANDES_ANNULABLES: ReadonlySet<string> = new Set([
  'DRAFT',
  'SENT',
  'PARTIALLY_SIGNED',
  'DECLINED',
  'EXPIRED',
]);

/**
 * Durée de validité d'une demande (spec §5 lot C, filet `signature-sync` :
 * « marque EXPIRED au-delà de `expiresAt`, 30 j par défaut »). Sans date, une
 * demande jamais signée resterait `SENT` indéfiniment.
 */
const VALIDITE_DEMANDE_JOURS = 30;

// ─── Chargement ──────────────────────────────────────────────────────────────

interface ParticipantCharge {
  id: string;
  personId: string;
  sponsorOrgId: string | null;
  nom: string;
  apprenant: { firstName: string; lastName: string; email: string | null };
  /** L'organisation bénéficiaire, dans la forme attendue par la cascade. */
  org: OrganisationRepresentee | null;
  estEiSelfChezSponsor: boolean;
  /** Règle du 12/08 : cet inscrit relève-t-il de la convention d'entreprise ? */
  relevantDeLaConvention: boolean;
  pourLePlan: ParticipantPourEnvoi;
}

interface ContexteEnvoi {
  sessionId: string;
  sessionCode: string;
  /** Le titre du produit — les emails de signature le nomment (lot C.2c). */
  formationTitre: string;
  participants: ParticipantCharge[];
  plan: ReturnType<typeof planifierEnvoi>;
}

async function chargerContexte(
  tenantId: string,
  sessionId: string,
  scope: ScopeEnvoi,
): Promise<ContexteEnvoi | null> {
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId },
    select: {
      id: true,
      code: true,
      // Lot C.2c : l'email nomme la formation, pour qu'un responsable qui
      // reçoit trois demandes le même jour sache laquelle il ouvre.
      product: { select: { title: true } },
      participants: {
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        select: {
          id: true,
          sponsorOrgId: true,
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              legalLinks: {
                select: {
                  role: true,
                  organizationId: true,
                  organization: { select: { id: true, opcoCode: true } },
                },
              },
            },
          },
          sponsorOrg: {
            select: {
              id: true,
              legalName: true,
              brandName: true,
              legalForm: true,
              representative: true,
              opcoCode: true,
              // Ordre EXIGÉ par le contrat de `representant.ts` : le contact
              // principal d'abord, le plus ancien ensuite. La cascade ne
              // rejoue pas ce tri, elle s'y fie.
              contacts: {
                orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                select: { firstName: true, lastName: true, email: true, isPrimary: true },
              },
            },
          },
        },
      },
    },
  });
  if (!session) return null;

  // Le régime se lit par le MÊME chemin que la fiche session (lot C.2b-1) :
  // `codesFinanceursDe` → `chargerReglesSignature` → `participantPourEnvoi`.
  // Deux mappers pour une question, c'est la divergence que C.2a avait déjà
  // supprimée pour `representant.ts` — un seul aller-retour vers `OpcoCatalog`,
  // quel que soit le nombre d'inscrits.
  const lus: ParticipantLu[] = session.participants.map((p) => ({
    participantId: p.id,
    nomAffiche: nomAffiche(p.person),
    sponsorOrgId: p.sponsorOrgId ?? null,
    sponsorOrgLabel: p.sponsorOrg?.brandName ?? p.sponsorOrg?.legalName ?? null,
    sponsorOpcoCode: p.sponsorOrg?.opcoCode ?? null,
    liens: p.person.legalLinks,
  }));
  const reglesParCode = await chargerReglesSignature(codesFinanceursDe(lus));

  const participants: ParticipantCharge[] = session.participants.map((p, index) => {
    const nom = nomAffiche(p.person);
    const lienSponsor = p.person.legalLinks.find((l) => l.organizationId === p.sponsorOrgId);
    const lu = lus[index]!;

    return {
      id: p.id,
      personId: p.person.id,
      sponsorOrgId: p.sponsorOrgId ?? null,
      nom,
      apprenant: {
        firstName: p.person.firstName,
        lastName: p.person.lastName,
        email: p.person.email,
      },
      org: p.sponsorOrg
        ? {
            id: p.sponsorOrg.id,
            legalName: p.sponsorOrg.legalName,
            representative: p.sponsorOrg.representative,
            contacts: p.sponsorOrg.contacts.map((c) => ({
              firstName: c.firstName,
              lastName: c.lastName,
              email: c.email,
              isPrimary: c.isPrimary,
            })),
          }
        : null,
      estEiSelfChezSponsor: lienSponsor?.role === 'EI_SELF',
      relevantDeLaConvention: releveDeLaConvention({
        sponsorLegalForm: p.sponsorOrg?.legalForm,
        roleChezSponsor: lienSponsor?.role ?? null,
      }),
      pourLePlan: participantPourEnvoi(lu, reglesParCode),
    };
  });

  return {
    sessionId: session.id,
    sessionCode: session.code,
    formationTitre: session.product.title,
    participants,
    plan: planifierEnvoi({ scope, participants: participants.map((p) => p.pourLePlan) }),
  };
}

// ─── Quel Document porte cet envoi ───────────────────────────────────────────

/**
 * ⚠ `FormeDocument`, `formeDuDocument` et `resoudreSignataireClient` ONT
 * DÉMÉNAGÉ dans `@/lib/signature/signataire-de-la-piece.ts` (correction n°4 du
 * 11/09/2026) — extraction à comportement constant, pas réécriture.
 *
 * Motif : la fiche session doit afficher « qui signe, et à quelle adresse » sur
 * la ligne du bloc « Signature », et un fichier `'use server'` ne peut exporter
 * que des server actions. La seule alternative était de recopier la cascade
 * dans `page.tsx` — donc une DEUXIÈME règle « qui signe », et un écran qui
 * finirait par annoncer un signataire différent de celui qui reçoit le lien.
 */

// ─── Régénération avec ancres ────────────────────────────────────────────────

// ─── Résolution du signataire côté bénéficiaire ──────────────────────────────
//
// `resoudreSignataireClient` vit désormais dans `signataire-de-la-piece.ts`
// (voir la note plus haut). Le signataire de l'ORGANISME, lui, a quitté ce
// fichier le 11/09/2026 pour `@/lib/signature/signataire-of` : la fiche session
// doit l'annoncer sur chaque ligne du bloc « Signature », et `'use server'`
// interdit d'exporter d'ici autre chose qu'une server action. DÉPLACÉ, jamais
// dupliqué — deux lectures de `Tenant.signatory*` divergeraient, et l'écran
// finirait par annoncer un signataire différent de celui qui reçoit le lien.

// ─── Action 1 — préparer (= régénérer + rendre l'aperçu) ─────────────────────

/**
 * Ouvre le récapitulatif d'envoi : régénère les pièces avec leurs ancres et rend
 * le PDF EXACT qui partira, hash compris.
 *
 * Cette action ÉCRIT (elle remplace des documents) : elle exige donc le même
 * rôle que l'envoi lui-même.
 */
export async function preparerEnvoiSignature(
  input: unknown,
): Promise<PreparerEnvoiSignatureResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = preparerEnvoiSignatureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Demande de préparation invalide : ${Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .join(', ')}`,
    };
  }
  const { sessionId, scope, cles } = parsed.data;

  const contexte = await chargerContexte(user.tenantId, sessionId, scope);
  if (!contexte) {
    return {
      ok: false,
      error:
        'Session introuvable dans cet espace : impossible de préparer un envoi pour une session ' +
        "qui n'appartient pas à votre organisme.",
    };
  }

  const demandes =
    cles === undefined
      ? contexte.plan.envois
      : contexte.plan.envois.filter((e) => cles.includes(e.cle));

  const signataireOf = await resoudreSignataireOf(user.tenantId);
  /**
   * Ce que l'écran doit ANNONCER de l'organisme (demande n°2, 11/09/2026).
   *
   * ⚠ RÉSOLU UNE FOIS, ICI, et seulement PROJETÉ sur chaque pièce : c'est le
   * même objet que celui que `sendForSignature` enverra au prestataire. Le
   * recalculer côté écran serait une seconde résolution, et le récapitulatif
   * finirait par annoncer un signataire différent de celui qui signe.
   */
  const ofPourAffichage: SignataireOfPrevu | null = signataireOfPrevu(signataireOf);
  /** `null` dès que la pièce n'ouvre pas d'ancre OF — la table tranche. */
  const ofDeLaPiece = (docType: DocTypeSignable): SignataireOfPrevu | null =>
    ofSigneLaPiece(docType) ? ofPourAffichage : null;

  const envois: EnvoiPrepare[] = [];
  let auMoinsUneRegeneration = false;

  for (const envoi of demandes) {
    const couverts = contexte.participants.filter((p) => envoi.participantIds.includes(p.id));
    const empechements: Empechement[] = [];

    const forme = formeDuDocument(envoi, couverts);
    if (!forme.ok) {
      envois.push({
        cle: envoi.cle,
        docType: envoi.docType,
        libelle: envoi.libelle,
        role: envoi.role,
        participantIds: envoi.participantIds,
        document: null,
        signataire: null,
        signataireOf: ofDeLaPiece(envoi.docType),
        empechements: [{ raison: 'REGENERATION_IMPOSSIBLE', message: forme.error }],
      });
      continue;
    }

    const avant = await trouverDocument(user.tenantId, sessionId, envoi.docType, forme.forme);

    // Un document déjà parti ou déjà signé n'est JAMAIS régénéré : tous les
    // générateurs commencent par un `deleteMany`, la pièce en cours de signature
    // disparaîtrait avec sa demande.
    const intouchable =
      avant?.status === STATUT_SIGNE || avant?.status === STATUT_ENVOYE ? avant.status : null;
    if (intouchable === STATUT_SIGNE) {
      empechements.push({ raison: 'DEJA_SIGNE', message: messageDejaSigne(envoi.libelle) });
    }
    if (intouchable === STATUT_ENVOYE) {
      empechements.push({ raison: 'ENVOI_EN_COURS', message: messageEnvoiEnCours(envoi.libelle) });
    }

    let document: DocumentAEnvoyer | null =
      avant === null
        ? null
        : { documentId: avant.id, pdfUrl: avant.pdfUrl, hash: avant.hashSha256, regenere: false };

    if (intouchable === null) {
      // TRACE D'INTENTION, écrite AVANT la régénération et validée seule
      // (décision Laurent, 10/09/2026).
      //
      // Pourquoi elle existe : la trace de RÉSULTAT ne peut pas partager la
      // transaction du remplacement du Document — celui-ci est fait par les
      // générateurs, partagés avec cinq autres appelants (dette ouverte en
      // lot H). Si cette trace de résultat échouait, un document se retrouverait
      // remplacé — `pdfUrl` et `hashSha256` changés — sans trace, sur un outil
      // dont un auditeur Qualiopi lit le journal.
      //
      // L'intention ferme ce trou par l'autre bout : elle dit « on s'apprête à
      // régénérer CETTE pièce, dont le hash vaut CECI ». Couplée à
      // `signature.sent` — transactionnel, et porteur des hashes réellement
      // confirmés — elle permet de reconstituer ce qui s'est passé même si la
      // trace de résultat manque.
      //
      // Elle est écrite même quand la régénération ne changera rien : avant de
      // l'avoir faite, on ne peut pas le savoir. C'est le prix de l'antériorité.
      await prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'Document',
          // `AuditLog.entityId` n'est PAS nullable au schéma. Une pièce pas
          // encore générée n'a pas d'id de Document : on inscrit la clé du plan
          // (« AGEFICE:part-3 »), qui désigne la pièce visée aussi précisément.
          // Écrire `null` faisait tomber la préparation de toute pièce absente —
          // exactement le cas où l'admin ouvre le récapitulatif pour la première
          // fois. Corrigé le 10/09/2026 (lot C.2b-1), régression de C.2a-2.
          entityId: avant?.id ?? envoi.cle,
          action: 'document.regeneration_requested',
          diff: {
            cle: envoi.cle,
            docType: envoi.docType,
            motif:
              "Régénération avec ancres de signature demandée à l'ouverture du récapitulatif d'envoi.",
            // L'ANCIEN hash : c'est lui qui permet de dire, après coup, sur quelle
            // version portait l'intention.
            hashAvant: avant?.hashSha256 ?? null,
            pdfUrlAvant: avant?.pdfUrl ?? null,
          },
        },
      });

      const resultat = await REGENERATION_PAR_PIECE[envoi.docType]({
        tenantId: user.tenantId,
        sessionId,
        forme: forme.forme,
        signatureTags: true,
      });
      const apres = resultat.ok
        ? await trouverDocument(user.tenantId, sessionId, envoi.docType, forme.forme)
        : null;

      if (!resultat.ok) {
        empechements.push({
          raison: 'REGENERATION_IMPOSSIBLE',
          message: messageRegenerationImpossible(
            envoi.libelle,
            resultat.error ?? 'cause inconnue.',
          ),
        });
      } else if (apres === null) {
        empechements.push({
          raison: 'DOC_NON_GENERE',
          message: messageDocNonGenere(envoi.libelle),
        });
      } else {
        const aChange = apres.hashSha256 !== avant?.hashSha256;
        document = {
          documentId: apres.id,
          pdfUrl: apres.pdfUrl,
          hash: apres.hashSha256,
          regenere: aChange,
        };
        if (aChange) {
          auMoinsUneRegeneration = true;
          // Pas d'AuditLog quand le PDF n'a pas bougé : un journal qui répète
          // « rien n'a changé » se cesse d'être lu.
          //
          // TRACE DE RÉSULTAT. Écrite hors transaction, sciemment : le
          // remplacement du Document est fait par les générateurs, partagés avec
          // cinq autres appelants — les envelopper depuis ici demanderait de les
          // réécrire (dette ouverte en lot H de la spec). La trace suit donc
          // l'écriture au lieu de l'accompagner ; c'est la trace d'intention
          // ci-dessus, écrite avant et validée seule, qui couvre l'intervalle.
          await prisma.auditLog.create({
            data: {
              tenantId: user.tenantId,
              userId: user.id,
              entity: 'Document',
              entityId: apres.id,
              action: 'document.regenerated_for_signature',
              diff: {
                cle: envoi.cle,
                docType: envoi.docType,
                motif:
                  "Régénération avec ancres de signature à l'ouverture du récapitulatif d'envoi.",
                pdfUrl: { before: avant?.pdfUrl ?? null, after: apres.pdfUrl },
                hashSha256: { before: avant?.hashSha256 ?? null, after: apres.hashSha256 },
              },
            },
          });
        }
      }
    }

    if (document === null && empechements.length === 0) {
      empechements.push({ raison: 'DOC_NON_GENERE', message: messageDocNonGenere(envoi.libelle) });
    }

    const client = resoudreSignataireClient({
      docType: envoi.docType,
      forme: forme.forme,
      envoi,
      couverts,
    });
    if (!client.ok) {
      empechements.push({ raison: 'SIGNATAIRE_SANS_EMAIL', message: client.error });
    }

    // Le signataire de l'organisme est vérifié DÈS L'APERÇU : découvrir au clic
    // que Paramètres organisme est incomplet obligerait à annuler une demande
    // déjà créée chez le prestataire.
    if (ofSigneLaPiece(envoi.docType) && !signataireOf.ok) {
      empechements.push({ raison: 'SIGNATAIRE_OF_INCOMPLET', message: signataireOf.error });
    }

    envois.push({
      cle: envoi.cle,
      docType: envoi.docType,
      libelle: envoi.libelle,
      role: envoi.role,
      participantIds: envoi.participantIds,
      document,
      signataire: client.ok ? client.signataire : null,
      signataireOf: ofDeLaPiece(envoi.docType),
      empechements,
    });
  }

  if (auMoinsUneRegeneration) {
    revalidatePath(`/app/sessions/${sessionId}`);
  }

  return {
    ok: true,
    sessionId,
    envois,
    blocages: contexte.plan.blocages satisfies AnomalieEnvoi[],
    avertissements: contexte.plan.avertissements,
  };
}

// ─── Action 2 — envoyer exactement ce qui a été confirmé ─────────────────────

/**
 * Envoie en signature les pièces confirmées au récapitulatif.
 *
 * Chaque cible porte le `hashConfirme` vu à l'aperçu. Un hash qui a bougé fait
 * REFUSER cette pièce : ni appel prestataire, ni écriture. C'est ce contrôle —
 * pas l'ordre des écrans — qui garantit que le clic confirme le PDF relu.
 *
 * Un refus ne fait pas tomber le lot : les autres pièces partent, et le refus
 * est rendu nommé.
 */
export async function sendForSignature(input: unknown): Promise<SendForSignatureResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = sendForSignatureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Demande d'envoi invalide : ${Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .join(', ')}`,
    };
  }
  const { sessionId, scope, cibles, force } = parsed.data;

  // Fail-closed : sans provider configuré, on ne « tente » pas. Le message est
  // écrit pour être lu par un humain — on le rend tel quel.
  let provider;
  try {
    provider = getSignatureProvider();
  } catch (e) {
    if (e instanceof SignatureNotConfiguredError) return { ok: false, error: e.message };
    throw e;
  }

  const contexte = await chargerContexte(user.tenantId, sessionId, scope);
  if (!contexte) {
    return {
      ok: false,
      error:
        "Session introuvable dans cet espace : aucun envoi n'est parti pour une session qui " +
        "n'appartient pas à votre organisme.",
    };
  }

  const planParCle = new Map(contexte.plan.envois.map((e) => [e.cle, e]));
  const signataireOf = await resoudreSignataireOf(user.tenantId);
  // UNE fois, hors de la boucle : une session de 8 dossiers AGEFICE ferait
  // sinon 8 lectures identiques de la même configuration d'organisme.
  const of = await loadOfConfig(user.tenantId);

  const envoyes: EnvoiEffectue[] = [];
  const refus: RefusEnvoi[] = [];

  // Ordre du PLAN, pas ordre de saisie : deux envois identiques doivent produire
  // le même journal.
  const parOrdreDuPlan = [...cibles].sort(
    (g, d) => indexDansLePlan(contexte.plan.envois, g) - indexDansLePlan(contexte.plan.envois, d),
  );

  for (const cible of parOrdreDuPlan) {
    const envoi = planParCle.get(cible.cle);
    if (envoi === undefined) {
      refus.push({
        cle: cible.cle,
        docType: null,
        raison: 'CLE_INCONNUE',
        message: messageCleInconnue(cible.cle),
      });
      continue;
    }

    const refuser = (raison: RefusEnvoi['raison'], message: string) => {
      refus.push({ cle: envoi.cle, docType: envoi.docType, raison, message });
    };

    const couverts = contexte.participants.filter((p) => envoi.participantIds.includes(p.id));
    const forme = formeDuDocument(envoi, couverts);
    if (!forme.ok) {
      refuser('REGENERATION_IMPOSSIBLE', forme.error);
      continue;
    }

    const doc = await trouverDocument(user.tenantId, sessionId, envoi.docType, forme.forme);
    if (doc === null) {
      refuser('DOC_NON_GENERE', messageDocNonGenere(envoi.libelle));
      continue;
    }

    // LE contrôle. Il vient AVANT les garde-fous d'état : si le PDF n'est plus
    // celui qui a été relu, le reste de la décision a été prise sur autre chose.
    if (doc.hashSha256 !== cible.hashConfirme) {
      refuser('DOCUMENT_MODIFIE', messageDocumentModifie(envoi.libelle));
      continue;
    }

    if (doc.status === STATUT_SIGNE && !force) {
      refuser('DEJA_SIGNE', messageDejaSigne(envoi.libelle));
      continue;
    }
    if (doc.status === STATUT_ENVOYE) {
      refuser('ENVOI_EN_COURS', messageEnvoiEnCours(envoi.libelle));
      continue;
    }

    const client = resoudreSignataireClient({
      docType: envoi.docType,
      forme: forme.forme,
      envoi,
      couverts,
      emailSaisi: cible.emailSaisi,
    });
    if (!client.ok) {
      refuser('SIGNATAIRE_SANS_EMAIL', client.error);
      continue;
    }

    const signers: SignatureSignerInput[] = [];
    const roleClient = roleAncreClient(envoi.docType);
    const roleOf = roleAncreOf(envoi.docType);
    if (roleOf !== null && !signataireOf.ok) {
      refuser('SIGNATAIRE_OF_INCOMPLET', signataireOf.error);
      continue;
    }
    // D-3 / D-8 : séquentiel, l'OF signe APRÈS le client par défaut.
    const ofAvant = signataireOf.ok && signataireOf.signatory.order === 'BEFORE';
    const rangClient = roleOf !== null && ofAvant ? 1 : 0;
    signers.push({
      role: roleClient,
      name: client.signataire.nom,
      email: client.signataire.email,
      order: rangClient,
    });
    if (roleOf !== null && signataireOf.ok) {
      signers.push({
        role: roleOf,
        name: signataireOf.signatory.name,
        email: signataireOf.signatory.email,
        order: rangClient === 0 ? 1 : 0,
      });
    }
    signers.sort((g, d) => g.order - d.order);

    let pdf: Buffer;
    try {
      pdf = await downloadFile(DOCS_BUCKET, doc.pdfUrl);
    } catch (e) {
      refuser(
        'ERREUR_PRESTATAIRE',
        messageErreurPrestataire(envoi.libelle, messageDe(e) + ' (lecture du PDF stocké).'),
      );
      continue;
    }

    // Id pré-généré AVANT l'appel réseau : la corrélation `externalId` existe
    // même si la transaction échoue ensuite, donc la submission reste
    // identifiable pour être annulée.
    const signatureRequestId = randomUUID();
    const expiresAt = new Date(Date.now() + VALIDITE_DEMANDE_JOURS * 24 * 60 * 60 * 1000);

    let creation;
    try {
      creation = await provider.createRequest({
        name: `${envoi.libelle} — ${contexte.sessionCode}`,
        documents: [{ name: `${envoi.libelle}.pdf`, pdf }],
        signers,
        externalId: signatureRequestId,
        expiresAt,
      });
    } catch (e) {
      refuser('ERREUR_PRESTATAIRE', messageErreurPrestataire(envoi.libelle, messageDe(e)));
      continue;
    }

    // Écart n°6 du lot B : l'échec des ancres est SILENCIEUX chez le
    // prestataire. Zéro champ = personne n'a rien à signer.
    if (creation.signatureFieldCount === 0) {
      await annulerSansBruit(provider, creation.providerId);
      refuser('AUCUN_CHAMP_DE_SIGNATURE', messageAucunChampDeSignature(envoi.libelle));
      continue;
    }

    const signersJson = signatureSignersSchema.parse(
      creation.signers.map((s) => ({
        role: s.role,
        name: s.name,
        email: s.email,
        providerSignerId: s.providerSignerId,
        status: s.status,
        signedAt: s.signedAt === null ? null : s.signedAt.toISOString(),
        // D-9 : le lien est PERSISTÉ ici ; c'est le lot C.2c qui l'enverra.
        signUrl: s.signUrl,
      })),
    );

    try {
      await prisma.$transaction(async (tx) => {
        await tx.signatureRequest.create({
          data: {
            id: signatureRequestId,
            tenantId: user.tenantId,
            provider: provider.name,
            providerId: creation.providerId,
            status: 'SENT',
            sessionId,
            signers: signersJson,
            // Lot C.3 — le régime qui a décidé CET envoi. Le webhook en aura
            // besoin des mois plus tard pour nommer le destinataire, et le
            // recalculer alors dirait ce qu'on enverrait aujourd'hui, pas ce
            // qui est parti.
            signerRole: envoi.role,
            sentAt: new Date(),
            expiresAt: creation.expiresAt ?? expiresAt,
          },
        });
        await tx.document.update({
          where: { id: doc.id },
          data: { status: STATUT_ENVOYE, signatureRequestId },
        });
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'Document',
            entityId: doc.id,
            action: 'signature.sent',
            diff: {
              cle: envoi.cle,
              docType: envoi.docType,
              providerId: creation.providerId,
              signatureRequestId,
              participantIds: envoi.participantIds,
              hashSha256: doc.hashSha256,
              // Le COUPLE retenu, nom ET email, avec sa provenance : c'est la
              // contrepartie de la dérogation « adresse saisie par l'admin ».
              signataire: {
                nom: client.signataire.nom,
                email: client.signataire.email,
                sourceNom: client.signataire.sourceNom,
                sourceEmail: client.signataire.sourceEmail,
              },
              status: { before: doc.status, after: STATUT_ENVOYE },
            },
          },
        });
      });
    } catch (e) {
      // Refus APRÈS création de la submission : on annule chez le prestataire,
      // sinon une demande fantôme reste ouverte et le prochain envoi fait doublon.
      await annulerSansBruit(provider, creation.providerId);
      refuser('ERREUR_PRESTATAIRE', messageErreurPrestataire(envoi.libelle, messageDe(e)));
      continue;
    }

    /**
     * L'ORDRE RÉELLEMENT PARTI — demande n°2 de Laurent (11/09/2026).
     *
     * Construit sur `signers` (ce que QualiOF a envoyé, DÉJÀ TRIÉ par `order`)
     * et non sur `creation.signers` (ce que le prestataire a rendu, dans un
     * ordre qui lui appartient). C'est l'ordre de signature qui est promis à
     * l'écran : le lire chez le prestataire le ferait dépendre de son API.
     *
     * `partie` se déduit du nom de rôle que NOUS avons posé, pas d'une
     * heuristique sur le libellé : `roleOf` vaut `null` quand la pièce n'ouvre
     * pas d'ancre organisme, et la comparaison est alors toujours fausse.
     */
    const signatairesEnvoyes: SignataireEnvoye[] = signers.map((parti) => {
      const rendu = creation.signers.find((s) => s.role === parti.role);
      return {
        partie: roleOf !== null && parti.role === roleOf ? 'OF' : 'CLIENT',
        role: parti.role,
        nom: parti.name,
        email: parti.email,
        signUrl: rendu?.signUrl ?? null,
        signedAt: rendu?.signedAt?.toISOString() ?? null,
      };
    });

    /**
     * L'EMAIL — lot C.2c. APRÈS la transaction, jamais dedans : un `await`
     * réseau SMTP dans un `prisma.$transaction` tiendrait la transaction
     * ouverte le temps du timeout SMTP.
     *
     * Et enveloppé : un email qui échoue ne doit PAS faire tomber l'envoi. La
     * demande est créée chez le prestataire ; l'annuler pour un SMTP en panne
     * serait disproportionné, et le lien reste copiable à l'écran.
     */
    let notification: ResultatNotification;
    try {
      notification = await notifierSignataire({
        tenantId: user.tenantId,
        sessionId,
        signatureRequestId,
        documentId: doc.id,
        libellePiece: envoi.libelle,
        piece: envoi.docType,
        concerne: envoi.concerne,
        organisation: envoi.organisation,
        formationTitre: contexte.formationTitre,
        sessionCode: contexte.sessionCode,
        dateLimite: creation.expiresAt ?? expiresAt,
        role: envoi.role,
        signataires: signatairesEnvoyes,
        of,
        // Le MÊME signataire que celui qui signe le document : jamais une
        // seconde résolution, qui finirait par donner un autre nom.
        signataireOfNom: signataireOf.ok ? signataireOf.signatory.name : null,
      });
    } catch (e) {
      console.error(
        `[signature] email non parti pour « ${envoi.libelle} » :`,
        e instanceof Error ? e.message : e,
      );
      notification = {
        envoye: false,
        destinataire: signatairesEnvoyes[0]?.email ?? '',
        partie: signatairesEnvoyes[0]?.partie ?? 'CLIENT',
        motif: 'erreur-smtp',
      };
    }

    envoyes.push({
      cle: envoi.cle,
      docType: envoi.docType,
      // Demande n°3 : l'écran résultat nomme la pièce, il ne l'immatricule pas.
      libelle: envoi.libelle,
      signatureRequestId,
      providerId: creation.providerId,
      documentId: doc.id,
      hash: doc.hashSha256,
      signataire: {
        nom: client.signataire.nom,
        email: client.signataire.email,
        source: client.signataire.sourceEmail,
      },
      // D-9, lot C.2b-bis : le lien EXISTAIT déjà en base sans qu'aucun chemin
      // ne l'expose. Le rendre ici est ce qui permet à l'admin de le
      // communiquer à la main tant que l'envoi des emails (C.2c) n'est pas
      // livré — sans lui, un clic « Envoyer » ne prévenait personne et ne
      // POUVAIT prévenir personne.
      //
      // ⚠ PROJECTION, PLUS UNE SECONDE LECTURE : il vaut exactement le lien du
      // signataire client de la liste ci-dessus. Deux `find` distincts sur la
      // même intention finiraient par diverger.
      signUrl: signatairesEnvoyes.find((s) => s.partie === 'CLIENT')?.signUrl ?? null,
      signataires: signatairesEnvoyes,
      notification,
    });
  }

  if (envoyes.length > 0) {
    revalidatePath(`/app/sessions/${sessionId}`);
    // La liste des sessions porte un filtre de signature : elle lit la même donnée.
    revalidatePath('/app/sessions');
  }

  return { ok: true, envoyes, refus };
}

// ─── Action 3 — annuler un envoi en cours (lot C.2b-bis) ─────────────────────

/**
 * Annule une demande de signature et REND la pièce à l'état d'avant l'envoi.
 *
 * POURQUOI ELLE EXISTE. Un envoi réussi pose `Document.status =
 * 'sent_for_signature'`. Dès lors `preparerEnvoiSignature` refuse de régénérer
 * la pièce et `sendForSignature` refuse de la renvoyer (`ENVOI_EN_COURS`, que
 * `force` ne lève pas). Le webhook qui lèverait ce statut est le lot C.3, et il
 * ne se déclenchera pas tant que personne n'a reçu de lien (lot C.2c) : la
 * pièce est GELÉE SANS RECOURS. `messageEnvoiEnCours` promettait d'ailleurs
 * « Annulez l'envoi en cours », un geste qui n'existait nulle part.
 *
 * L'ORDRE N'EST PAS DÉCORATIF — LE PRESTATAIRE D'ABORD. Marquer `CANCELED` en
 * local pendant que la demande reste ouverte chez DocuSeal laisserait quelqu'un
 * signer une pièce que QualiOF croit annulée, et le webhook du lot C.3
 * apposerait cette signature sur un document entre-temps régénéré. Un refus du
 * prestataire n'écrit donc RIEN : fail-closed, et dit.
 *
 * LA RÉGÉNÉRATION EN SENS INVERSE (arbitrage Laurent, 10/09/2026). Après
 * annulation, le document est resté dans sa version À ANCRES, et donc — pour la
 * convention et l'attestation d'assiduité — SANS le tampon de l'organisme. Un
 * admin qui le téléchargerait récupérerait une pièce non signée par l'OF :
 * régression par rapport à l'état d'avant l'envoi. On régénère donc avec
 * `signatureTags: false`, symétriquement, par LE MÊME chemin
 * (`REGENERATION_PAR_PIECE`), avec sa trace.
 *
 * LE MOTIF EST PORTÉ PAR LE CONTRAT (lot C.2b-3, Laurent 11/09/2026). Cette
 * action a désormais DEUX appelants : le bouton « Annuler l'envoi » du bloc
 * « Signature », et le dépôt d'un scan signé sur une pièce partie en signature
 * (« une pièce, un seul chemin ouvert »). Le second passe `motif:
 * 'scan_deposited'`. Sans ce champ, les deux produiraient la même ligne de
 * journal — or c'est la première question qu'un auditeur pose devant deux
 * preuves d'une même pièce. Le champ est ÉNUMÉRÉ (Zod) et non du texte libre :
 * un journal doit rester interrogeable.
 *
 * SAUF QUAND CE SERAIT DÉTRUIRE UNE PREUVE. Tous les générateurs commencent par
 * un `deleteMany` : régénérer une pièce qui porte déjà un exemplaire signé
 * (`signedPdfUrl`, ou un renvoi forcé d'un document `signed`) l'effacerait. On
 * s'abstient alors, et `raisonNonRegeneree` le DIT — un document laissé à
 * ancres est un document sans tampon, ce qui doit se savoir avant remise.
 */
export async function annulerEnvoiSignature(
  input: unknown,
): Promise<AnnulerEnvoiSignatureResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = annulerEnvoiSignatureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Demande d'annulation invalide : ${Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .join(', ')}`,
    };
  }
  const { signatureRequestId, motif } = parsed.data;

  // Fail-closed, comme l'envoi : sans prestataire configuré, on ne « tente » pas
  // une annulation qui laisserait la demande ouverte chez lui.
  let provider;
  try {
    provider = getSignatureProvider();
  } catch (e) {
    if (e instanceof SignatureNotConfiguredError) return { ok: false, error: e.message };
    throw e;
  }

  const demande = await prisma.signatureRequest.findFirst({
    where: { id: signatureRequestId, tenantId: user.tenantId },
    select: {
      id: true,
      providerId: true,
      status: true,
      sessionId: true,
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
  if (demande === null) {
    return {
      ok: false,
      error:
        "Demande de signature introuvable dans cet espace : aucune annulation n'a été tentée " +
        "pour une demande qui n'appartient pas à votre organisme.",
    };
  }

  if (!DEMANDES_ANNULABLES.has(demande.status)) {
    return { ok: false, error: messageDemandeNonAnnulable(demande.status) };
  }

  // L'ORDRE : LE PRESTATAIRE D'ABORD. Marquer `CANCELED` en local pendant que la
  // demande reste ouverte chez lui laisserait quelqu'un signer une pièce que
  // QualiOF croit annulée, et le webhook du lot C.3 apposerait cette signature
  // sur un document entre-temps régénéré. Un refus n'écrit donc RIEN.
  try {
    await provider.cancel(demande.providerId);
  } catch (e) {
    return { ok: false, error: messageAnnulationPrestataireImpossible(messageDe(e)) };
  }

  // ⚠ LA PARTIE LOCALE EST PARTAGÉE avec le webhook du lot C.3 (refus et
  // expiration relâchent la pièce de la MÊME façon). Trois implémentations
  // auraient divergé à la première correction — et un document laissé dans sa
  // version à ancres est un document sans le tampon de l'organisme.
  const pieces = await relacherPieces({
    tenantId: user.tenantId,
    userId: user.id,
    demande: {
      id: demande.id,
      providerId: demande.providerId,
      status: demande.status,
      sessionId: demande.sessionId,
      documents: demande.documents,
    },
    statutDemande: 'CANCELED',
    action: 'signature.canceled',
    diff: {
      // Le CODE pour interroger le journal, la PHRASE pour le lire. Les deux,
      // parce qu'une annulation volontaire et une annulation provoquée par un
      // dépôt de scan ne se distinguaient jusqu'ici par rien (lot C.2b-3).
      motif,
      motifTexte: texteMotifAnnulation(motif),
    },
    regeneration: {
      action: 'document.regenerated_after_cancel',
      motif:
        "Régénération SANS zones de signature après annulation de l'envoi — symétrique " +
        "de la régénération avec ancres faite à l'ouverture du récapitulatif. Sans elle, " +
        "le document resterait sans le tampon de l'organisme.",
    },
  });

  revalidatePath(`/app/sessions/${demande.sessionId}`);
  // La liste des sessions porte un filtre de signature : elle lit la même donnée.
  revalidatePath('/app/sessions');

  return { ok: true, signatureRequestId: demande.id, sessionId: demande.sessionId, pieces };
}

// ─── Petits utilitaires ──────────────────────────────────────────────────────

function indexDansLePlan(envois: EnvoiPlanifie[], cible: CibleEnvoiSignature): number {
  const i = envois.findIndex((e) => e.cle === cible.cle);
  // Les clés inconnues finissent à la fin : elles ne portent pas d'ordre.
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

function messageDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Annulation « au mieux ». Si elle échoue à son tour, on le journalise sans
 * masquer le refus d'origine : l'admin doit voir POURQUOI rien n'est parti, pas
 * une seconde erreur technique par-dessus.
 */
async function annulerSansBruit(
  provider: { cancel: (id: string) => Promise<void> },
  providerId: string,
): Promise<void> {
  try {
    await provider.cancel(providerId);
  } catch (e) {
    console.error(
      `[signature] annulation de la demande ${providerId} impossible : ${messageDe(e)}`,
    );
  }
}
