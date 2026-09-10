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

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { preparerEnvoiSignatureSchema } from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { loadOfConfig } from '@/lib/of-config';
import { groupConventionAnyShapeWhere } from '@/lib/docs/convention-coverage';
import { releveDeLaConvention } from '@/lib/sessions/payer-rule';
import {
  generateConventionCore,
  generateConventionEntrepriseCore,
} from '@/lib/closure/convention-core';
import { generateAgeficeForParticipant } from './agefice-generator';
import { generateAgeficeAttendanceForParticipant } from './agefice-attendance-generator';
import {
  planifierEnvoi,
  type AnomalieEnvoi,
  type EnvoiPlanifie,
  type ParticipantPourEnvoi,
  type ScopeEnvoi,
} from '@/lib/signature/plan-envoi';
import type { DocTypeSignable, RegleSignatureFinanceur } from '@/lib/signature/regime';
import {
  nomAffiche,
  resoudreEmailRepresentant,
  resoudreRepresentantEntreprise,
  resoudreRepresentantIndividuel,
  resoudreStagiaire,
  type OrganisationRepresentee,
} from '@/lib/signature/representant';
import { resolveTenantSignatory } from '@/lib/signature/signatory';
import {
  messageDejaSigne,
  messageDocNonGenere,
  messageEnvoiEnCours,
  messageRegenerationImpossible,
  ofSigneLaPiece,
  type DocumentAEnvoyer,
  type Empechement,
  type EnvoiPrepare,
  type PreparerEnvoiSignatureResult,
  type SignataireResolu,
} from '@/lib/signature/envoi-contrats';

/** Statuts de `Document.status` qui interdisent de toucher au PDF. */
const STATUT_SIGNE = 'signed';
const STATUT_ENVOYE = 'sent_for_signature';

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

  // Tous les codes financeurs rencontrés — celui du commanditaire ET ceux des
  // autres organisations rattachées, qui servent au garde-fou « régime
  // incohérent ». Un seul aller-retour, quel que soit le nombre d'inscrits.
  const codes = new Set<string>();
  for (const p of session.participants) {
    const duSponsor = p.sponsorOrg?.opcoCode?.trim();
    if (duSponsor) codes.add(duSponsor);
    for (const lien of p.person.legalLinks) {
      const code = lien.organization?.opcoCode?.trim();
      if (code) codes.add(code);
    }
  }

  // ⚠ PAS de `tenantId` ici, et ce n'est pas un oubli de scope : `OpcoCatalog`
  // est un RÉFÉRENTIEL GLOBAL (aucune colonne `tenantId` au schéma), partagé par
  // tous les organismes. Les six financeurs y sont seedés.
  const catalogue =
    codes.size === 0
      ? []
      : await prisma.opcoCatalog.findMany({
          where: { code: { in: [...codes] } },
          select: {
            code: true,
            conventionSigner: true,
            ageficeSigner: true,
            assiduiteSigner: true,
          },
        });

  const reglesParCode = new Map<string, RegleSignatureFinanceur>();
  for (const ligne of catalogue) {
    reglesParCode.set(ligne.code, {
      conventionSigner: ligne.conventionSigner,
      ageficeSigner: ligne.ageficeSigner,
      assiduiteSigner: ligne.assiduiteSigner,
    });
  }
  /** Financeur inconnu ⇒ `null` : l'inconnu ne vaut pas trois signatures par défaut. */
  const regleDe = (code: string | null | undefined): RegleSignatureFinanceur | null =>
    reglesParCode.get((code ?? '').trim()) ?? null;

  const participants: ParticipantCharge[] = session.participants.map((p) => {
    const nom = nomAffiche(p.person);
    const lienSponsor = p.person.legalLinks.find((l) => l.organizationId === p.sponsorOrgId);
    const autresLiens = p.person.legalLinks.filter((l) => l.organizationId !== p.sponsorOrgId);

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
      pourLePlan: {
        participantId: p.id,
        nomAffiche: nom,
        sponsorOrgId: p.sponsorOrgId ?? null,
        sponsorOrgLabel: p.sponsorOrg?.brandName ?? p.sponsorOrg?.legalName ?? null,
        regle: regleDe(p.sponsorOrg?.opcoCode),
        signauxDossierPropre: {
          aLienEiSelfHorsSponsor: autresLiens.some((l) => l.role === 'EI_SELF'),
          reglesAutresOrgs: autresLiens
            .map((l) => regleDe(l.organization?.opcoCode))
            .filter((r): r is RegleSignatureFinanceur => r !== null),
        },
      },
    };
  });

  return {
    sessionId: session.id,
    sessionCode: session.code,
    participants,
    plan: planifierEnvoi({ scope, participants: participants.map((p) => p.pourLePlan) }),
  };
}

// ─── Quel Document porte cet envoi ───────────────────────────────────────────

/**
 * Une convention prend deux formes selon la règle payeur du 12/08 : GROUPE
 * (l'entreprise commande pour ses salariés) ou INDIVIDUEL (l'apprenant se forme
 * à ses frais). On ne devine pas : on interroge `releveDeLaConvention`, la même
 * fonction qui a décidé de la forme AU MOMENT DE LA GÉNÉRATION.
 */
type FormeDocument =
  | { forme: 'GROUPE'; organizationId: string }
  | { forme: 'INDIVIDUEL'; participantId: string };

function formeDuDocument(
  envoi: EnvoiPlanifie,
  couverts: ParticipantCharge[],
): { ok: true; forme: FormeDocument } | { ok: false; error: string } {
  if (envoi.cible.kind === 'PARTICIPANT') {
    return { ok: true, forme: { forme: 'INDIVIDUEL', participantId: envoi.cible.participantId } };
  }
  if (couverts.some((p) => p.relevantDeLaConvention)) {
    return { ok: true, forme: { forme: 'GROUPE', organizationId: envoi.cible.organizationId } };
  }
  // Aucun salarié : la pièce est un contrat individuel. Un seul inscrit ⇒ c'est
  // le sien. Plusieurs ⇒ ils ont chacun le leur et une pièce unique ne peut pas
  // les couvrir : on le DIT, plutôt que d'en envoyer une au hasard.
  const premier = couverts[0];
  if (couverts.length === 1 && premier !== undefined) {
    return { ok: true, forme: { forme: 'INDIVIDUEL', participantId: premier.id } };
  }
  const noms = couverts.map((p) => p.nom).join(', ');
  return {
    ok: false,
    error:
      `${noms} se forment à leurs frais sous la même organisation : chacun a son propre ` +
      `contrat de formation, aucune pièce unique ne peut les couvrir. Envoyez-les séparément.`,
  };
}

interface DocumentCharge {
  id: string;
  pdfUrl: string;
  hashSha256: string;
  status: string;
}

async function trouverDocument(
  tenantId: string,
  sessionId: string,
  docType: DocTypeSignable,
  forme: FormeDocument,
): Promise<DocumentCharge | null> {
  const select = { id: true, pdfUrl: true, hashSha256: true, status: true };

  if (docType === 'CONVENTION' && forme.forme === 'GROUPE') {
    // Les DEUX formes de stockage d'une convention de groupe — source unique
    // `convention-coverage.ts`, jamais un filtre `entityType` écrit à la main.
    return prisma.document.findFirst({
      where: groupConventionAnyShapeWhere(tenantId, sessionId, forme.organizationId),
      orderBy: { createdAt: 'desc' },
      select,
    });
  }

  return prisma.document.findFirst({
    where: {
      tenantId,
      type: docType,
      participantId: forme.forme === 'INDIVIDUEL' ? forme.participantId : undefined,
    },
    orderBy: { createdAt: 'desc' },
    select,
  });
}

// ─── Régénération avec ancres ────────────────────────────────────────────────

type ResultatGenerateur = { ok: boolean; error?: string };

/**
 * Qui régénère quoi. TABLE de données : brancher une pièce signable de plus se
 * fait ici, pas dans un `if` au milieu de la boucle.
 *
 * `signatureTags: true` est passé À L'IDENTIQUE aux trois gabarits : ce n'est
 * pas au moteur de savoir lequel garde son tampon. Le formulaire AGEFICE
 * conserve l'image de signature de l'OF (une seule partie y signe), la
 * convention et l'attestation la retirent — chaque gabarit tranche chez lui.
 */
const REGENERATION_PAR_PIECE: Record<
  DocTypeSignable,
  (a: { tenantId: string; sessionId: string; forme: FormeDocument }) => Promise<ResultatGenerateur>
> = {
  CONVENTION: async ({ tenantId, sessionId, forme }) =>
    forme.forme === 'GROUPE'
      ? generateConventionEntrepriseCore(tenantId, sessionId, forme.organizationId, null, {
          signatureTags: true,
        })
      : generateConventionCore(tenantId, forme.participantId, { signatureTags: true }),
  AGEFICE: async ({ forme }) =>
    forme.forme === 'INDIVIDUEL'
      ? generateAgeficeForParticipant(forme.participantId, { signatureTags: true })
      : { ok: false, error: 'Un dossier AGEFICE est toujours nominatif.' },
  ASSIDUITE: async ({ forme }) =>
    forme.forme === 'INDIVIDUEL'
      ? generateAgeficeAttendanceForParticipant(forme.participantId, { signatureTags: true })
      : { ok: false, error: "Une attestation d'assiduité est toujours nominative." },
};

// ─── Résolution du signataire côté bénéficiaire ──────────────────────────────

function resoudreSignataireClient(a: {
  docType: DocTypeSignable;
  forme: FormeDocument;
  envoi: EnvoiPlanifie;
  couverts: ParticipantCharge[];
  emailSaisi?: string | null;
}): { ok: true; signataire: SignataireResolu } | { ok: false; error: string } {
  const premier = a.couverts[0];
  if (premier === undefined) {
    return {
      ok: false,
      error: `Aucun inscrit rattaché à « ${a.envoi.libelle} » : rien à envoyer.`,
    };
  }

  // Le Document EXISTANT décide de la cascade — pas une heuristique. Le
  // signataire est ainsi, par construction, celui que le PDF nomme.
  const org: OrganisationRepresentee = premier.org ?? {
    id: a.envoi.cible.kind === 'ORGANISATION' ? a.envoi.cible.organizationId : premier.id,
    legalName: a.envoi.libelle,
    representative: null,
    contacts: [],
  };

  const nomResolu =
    a.docType === 'CONVENTION' && a.forme.forme === 'GROUPE'
      ? resoudreRepresentantEntreprise(org)
      : a.envoi.role === 'DIRIGEANT'
        ? resoudreRepresentantIndividuel({
            org,
            apprenant: premier.apprenant,
            estEiSelf: premier.estEiSelfChezSponsor,
          })
        : resoudreStagiaire(premier.apprenant);
  if (!nomResolu.ok) return { ok: false, error: nomResolu.error };

  const email = resoudreEmailRepresentant({
    nom: nomResolu.nom,
    source: nomResolu.source,
    org,
    apprenant: premier.apprenant,
    emailSaisi: a.emailSaisi ?? null,
  });
  if (!email.ok) return { ok: false, error: email.error };

  return {
    ok: true,
    signataire: {
      nom: email.nom,
      email: email.email,
      sourceNom: nomResolu.source,
      sourceEmail: email.source,
    },
  };
}

async function resoudreSignataireOf(tenantId: string) {
  const [tenant, of] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        signatoryName: true,
        signatoryEmail: true,
        signatoryTitle: true,
        signatoryOrder: true,
      },
    }),
    loadOfConfig(tenantId),
  ]);
  if (!tenant) {
    return {
      ok: false as const,
      error: 'Organisme introuvable : impossible de résoudre son signataire.',
    };
  }
  return resolveTenantSignatory(tenant, of);
}

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
      const resultat = await REGENERATION_PAR_PIECE[envoi.docType]({
        tenantId: user.tenantId,
        sessionId,
        forme: forme.forme,
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
          // Écrit hors transaction, sciemment : le remplacement du Document est
          // fait par les générateurs, partagés avec cinq autres appels. Les
          // envelopper d'une transaction depuis ici demanderait de les réécrire.
          // La trace suit donc l'écriture au lieu de l'accompagner.
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

// ─── Petits utilitaires ──────────────────────────────────────────────────────
