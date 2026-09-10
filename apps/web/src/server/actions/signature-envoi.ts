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
  preparerEnvoiSignatureSchema,
  sendForSignatureSchema,
  signatureSignersSchema,
  type CibleEnvoiSignature,
} from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { DOCS_BUCKET, downloadFile } from '@/lib/storage';
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
import type { DocTypeSignable } from '@/lib/signature/regime';
import { chargerReglesSignature } from '@/lib/signature/catalogue-regime';
import {
  codesFinanceursDe,
  participantPourEnvoi,
  type ParticipantLu,
} from '@/lib/signature/participants-regime';
import {
  nomAffiche,
  resoudreEmailRepresentant,
  resoudreRepresentantEntreprise,
  resoudreRepresentantIndividuel,
  resoudreStagiaire,
  type OrganisationRepresentee,
} from '@/lib/signature/representant';
import { resolveTenantSignatory } from '@/lib/signature/signatory';
import { getSignatureProvider, SignatureNotConfiguredError } from '@/lib/signature/provider';
import type { SignatureSignerInput } from '@/lib/signature/port';
import {
  messageAucunChampDeSignature,
  messageCleInconnue,
  messageDejaSigne,
  messageDocNonGenere,
  messageDocumentModifie,
  messageEnvoiEnCours,
  messageErreurPrestataire,
  messageRegenerationImpossible,
  ofSigneLaPiece,
  roleAncreClient,
  roleAncreOf,
  type DocumentAEnvoyer,
  type Empechement,
  type EnvoiEffectue,
  type EnvoiPrepare,
  type PreparerEnvoiSignatureResult,
  type RefusEnvoi,
  type SendForSignatureResult,
  type SignataireResolu,
} from '@/lib/signature/envoi-contrats';

/** Statuts de `Document.status` qui interdisent de toucher au PDF. */
const STATUT_SIGNE = 'signed';
const STATUT_ENVOYE = 'sent_for_signature';

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
    const roleOf = roleAncreOf(envoi.docType);
    if (roleOf !== null && !signataireOf.ok) {
      refuser('SIGNATAIRE_OF_INCOMPLET', signataireOf.error);
      continue;
    }
    // D-3 / D-8 : séquentiel, l'OF signe APRÈS le client par défaut.
    const ofAvant = signataireOf.ok && signataireOf.signatory.order === 'BEFORE';
    const rangClient = roleOf !== null && ofAvant ? 1 : 0;
    signers.push({
      role: roleAncreClient(envoi.docType),
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

    envoyes.push({
      cle: envoi.cle,
      docType: envoi.docType,
      signatureRequestId,
      providerId: creation.providerId,
      documentId: doc.id,
      hash: doc.hashSha256,
      signataire: {
        nom: client.signataire.nom,
        email: client.signataire.email,
        source: client.signataire.sourceEmail,
      },
    });
  }

  if (envoyes.length > 0) {
    revalidatePath(`/app/sessions/${sessionId}`);
    // La liste des sessions porte un filtre de signature : elle lit la même donnée.
    revalidatePath('/app/sessions');
  }

  return { ok: true, envoyes, refus };
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
