import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Euro, Users, Briefcase, ClipboardCheck, Check, Minus, Package, FileText, AlertCircle, Plus, ExternalLink, ClipboardList, MapPin, ListChecks, StickyNote, SmilePlus } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { formatFunderCode } from '@/lib/funder-codes';
import { PED_KIND_TO_DOC_TYPE } from '@/lib/doc-scope';
import { SessionParticipantsList } from '@/components/sessions/session-participants-list';
import { GenerateClosurePackButton } from '@/components/sessions/generate-closure-pack-button';
import { SessionCompletenessBadge } from '@/components/sessions/session-completeness-badge';
import { getSessionCompleteness } from '@/lib/sessions/completeness';
import { PreparationPedagogiqueBlock } from '@/components/sessions/preparation-pedagogique-block';
import { ClosureFormationBlock } from '@/components/sessions/closure-formation-block';
import { SessionWorkflowTimeline } from '@/components/sessions/session-workflow-timeline';
import { StepCreation } from '@/components/sessions/step-creation';
import { StepPendantFormation } from '@/components/sessions/step-pendant-formation';
import { StepFacturation } from '@/components/sessions/step-facturation';
import { buildDocDockItems } from '@/lib/sessions/doc-dock-items';
import { buildParticipantPhaseGroups } from '@/lib/sessions/participant-phase-items';
import { buildClosureCompletionItems } from '@/lib/sessions/build-closure-completion-items';
import { SessionHeaderBar } from '@/components/sessions/session-header-bar';
import { NextActionHero } from '@/components/sessions/next-action-hero';
import { sessionStage } from '@/lib/sessions/session-stage';
import { getSessionClosureStatus } from '@/server/actions/closure-status';
import { getSessionEvaluationStats } from '@/lib/evaluation-stats';
import { SessionEvaluationBlock } from '@/components/sessions/session-evaluation-block';
import { getSessionPreparationStatus } from '@/server/actions/prepare-training';
import { MarkCompletedButton } from '@/components/sessions/mark-completed-button';
import { SessionActionsMenu } from '@/components/sessions/session-actions-menu';
import { EditSessionDetailsDialog } from '@/components/sessions/edit-session-details-dialog';
import { CreatePersonButton } from '@/components/forms/create-person-button';
import { SessionStatusSelect } from '@/components/sessions/session-status-select';
import { SessionLogisticsEditor } from '@/components/sessions/session-logistics-editor';
import { SessionLocationPicker } from '@/components/sessions/session-location-picker';
import { SessionTrainerPicker } from '@/components/sessions/session-trainer-picker';
import { PrimaryTrainerToggle } from '@/components/sessions/primary-trainer-toggle';
import { RemoveTrainerButton } from '@/components/sessions/remove-trainer-button';
import { SessionSatisfactionPanel } from '@/components/sessions/session-satisfaction-panel';
import { BatchProgressAutoRefresh } from '@/components/sessions/batch-progress-auto-refresh';
import { StageCtaLink } from '@/components/sessions/stage-cta-link';
import { AddParticipantDialog } from '@/components/sessions/add-participant-dialog';
import { EditParticipantButton } from '@/components/sessions/edit-participant-button';
import { DeleteSessionButton } from '@/components/sessions/delete-session-button';
import { DuplicateSessionButton } from '@/components/sessions/duplicate-session-button';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { RecordRecentVisit } from '@/components/command-palette/record-recent-visit';
import { TresoStatusBlock } from '@/components/sessions/treso-status-block';
import { SessionTasksPanel } from '@/components/sessions/session-tasks-panel';
import { SessionDatesEditor } from '@/components/sessions/session-dates-editor';
import { SessionTitleInline } from '@/components/sessions/session-title-inline';
import { SessionPriceInline } from '@/components/sessions/session-price-inline';
import { SessionNotesInline } from '@/components/sessions/session-notes-inline';
import { SettingsButton } from '@/components/sessions/settings-button';
import { SettingsDrawerSection } from '@/components/sessions/settings-drawer';
import { SessionEnrollmentBlock } from '@/components/sessions/session-enrollment-block';
import { SessionEnrollmentRequests } from '@/components/sessions/session-enrollment-requests';
import { publicLinkState, buildPublicEnrollmentUrl } from '@/lib/enrollment/public-link';
// Régime de signature (spec 2026-09-04 §3 bis, D-10 ; lot C.2b-1) — le MÊME
// chemin que le moteur d'envoi, pour que l'écran ne promette jamais un envoi
// que `planifierEnvoi` ne planifie pas.
import { chargerReglesSignature } from '@/lib/signature/catalogue-regime';
import {
  codesFinanceursDe,
  colonneAgeficeVisible,
  docTypesSansObjet,
  participantPourEnvoi,
  type ParticipantLu,
} from '@/lib/signature/participants-regime';
import { docTypesEnRegime } from '@/lib/signature/regime';
import { planifierEnvoi } from '@/lib/signature/plan-envoi';
// Correction n°4 (11/09/2026) — « qui signe, et à quelle adresse » sur la ligne
// du bloc « Signature ». MÊME module que le moteur d'envoi : deux cascades pour
// une question, c'est un écran qui annonce un signataire et un lien qui part
// ailleurs.
import {
  formeDuDocument,
  resoudreSignataireClient,
  type ParticipantPourSignataire,
} from '@/lib/signature/signataire-de-la-piece';
// Bloc « Signature » des onglets Avant / Après (lot C.2b-2) : la VUE est
// calculée ici, côté serveur, pour que « le bouton existe ou n'existe pas »
// reste sous test unitaire au lieu d'être une inspection visuelle du JSX.
import {
  construireVueSignature,
  type ContexteAvertissement,
  type DocumentDeLaPiece,
  type VueSignature,
} from '@/lib/sessions/bloc-signature-vue';
import { contributionFromExtractedData } from '@/lib/enrollment/agefice-rights';
import { SessionTabs } from '@/components/sessions/tabs/session-tabs';
import { coerceTab } from '@/components/sessions/tabs/session-tabs-config';
// Phase 15 Lot 2 — onglets remplis (réembarquement + suppression des doublons).
import { TabAvant } from '@/components/sessions/tabs/tab-avant';
import { ConventionEntreprisePanel } from '@/components/sessions/convention-entreprise-panel';
import { releveDeLaConvention } from '@/lib/sessions/payer-rule';
import {
  blocagesDocsEntreprise,
  type BlocageDocEntreprise,
} from '@/lib/docs/blocages-docs-entreprise';
import { resolveConventionDateIso } from '@/lib/closure/convention-date';
import {
  GROUP_CONVENTION_ENTITY_TYPES,
  expandGroupConventions,
} from '@/lib/docs/convention-coverage';
import { TabApres } from '@/components/sessions/tabs/tab-apres';
import { TabTousDocuments } from '@/components/sessions/tabs/tab-tous-documents';
import { TabAgenda } from '@/components/sessions/tabs/tab-agenda';
import { analyzeSessionDocuments } from '@/lib/docs/session-document-analysis';

// Vercel Pro — rendu PDF synchrone via doc-engine Railway (Phase 21 APP-01)
export const maxDuration = 300;

const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'];

/**
 * Cet inscrit relève-t-il de la convention d'entreprise ?
 *
 * L'affichage doit dire EXACTEMENT ce que les cœurs feront : une garde d'écran
 * plus permissive que le générateur promet un bouton qui échouera, une plus
 * stricte cache un document légitime. On délègue donc au même prédicat, en lui
 * donnant le rôle de l'apprenant CHEZ SON COMMANDITAIRE — et pas une casquette
 * au hasard : dans l'immobilier un apprenant en porte souvent deux (son EI et
 * son enseigne).
 */
function releveDeLaConventionPour(p: {
  sponsorOrgId: string;
  sponsorOrg: { legalForm: string };
  person: { legalLinks: { role: string; organizationId: string }[] };
}): boolean {
  return releveDeLaConvention({
    sponsorLegalForm: p.sponsorOrg.legalForm,
    roleChezSponsor:
      p.person.legalLinks.find((l) => l.organizationId === p.sponsorOrgId)?.role ?? null,
  });
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;
  // Phase 15 Lot 1 — onglet actif lu côté serveur pour le deep-link initial
  // (?tab=apres). Le conteneur client <SessionTabs> relit ensuite ?tab= via
  // useSearchParams (survie au router.refresh()).
  const sp = await searchParams;

  const session = await prisma.trainingSession.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      product: true,
      location: true,
      participants: {
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              // Correction n°4 (11/09/2026) : l'adresse du signataire se lit
              // désormais SUR LA LIGNE du bloc « Signature ». Quand c'est
              // l'apprenant qui signe (dossier de financement, attestation
              // d'assiduité), c'est celle de sa fiche.
              email: true,
              // Les liens juridiques ne servent PLUS à décider du régime
              // (dérivation élargie BUG-11 retirée le 10/09/2026, lot C.2b-1 :
              // c'est le financeur du commanditaire qui décide, et lui seul).
              // Ils restent chargés pour les SIGNAUX du garde-fou « régime
              // incohérent » — une EI rattachée, une autre organisation dont le
              // financeur ouvre la pièce — qui rend l'anomalie bruyante au lieu
              // de faire disparaître un dossier de l'écran.
              legalLinks: {
                select: {
                  role: true,
                  // Ajouté le 02/09 : sans l'id de l'organisation, impossible
                  // de savoir QUELLE casquette relie l'apprenant à son
                  // commanditaire — et donc si celui-ci est son employeur.
                  organizationId: true,
                  organization: { select: { opcoCode: true } },
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
              opcoCode: true,
              // Garde-fous AVANT génération des documents d'entreprise (28/08) :
              // le représentant signe la convention et porte le recueil du
              // besoin ; à défaut, le contact principal en tient lieu.
              representative: true,
              // ⚠ ORDRE EXIGÉ PAR LE CONTRAT DE `representant.ts` : le contact
              // principal d'abord, le plus ancien ensuite — la cascade ne
              // rejoue pas ce tri, elle s'y fie. Le `where: { isPrimary }` de
              // naguère ne servait qu'au garde-fou `aContactPrincipal` ; il
              // empêchait de résoudre l'adresse du représentant, qui peut être
              // portée par un contact non principal du MÊME nom.
              contacts: {
                orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                select: { id: true, firstName: true, lastName: true, email: true, isPrimary: true },
              },
            },
          },
        },
      },
      trainers: {
        include: { person: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      },
    },
  });
  if (!session) notFound();

  // Documents Qualiopi déjà générés pour cette session, indexés par participant + type
  const sessionParticipantIds = session.participants.map((p) => p.id);
  const [sessionDocs, sessionAssets, sessionInvoices, productAssets, sessionSharedDocs] = sessionParticipantIds.length
    ? await Promise.all([
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            sessionId: session.id,
            OR: [
              { participantId: { in: sessionParticipantIds } },
              // Convention ENTREPRISE (quick 260817-mm0) : UN document couvre
              // tout le groupe d'un commanditaire, donc participantId=null.
              // Sans ce OR elle n'est pas chargée et chaque salarié du groupe
              // afficherait « convention manquante » alors qu'elle existe.
              // Quick 260821-md8 : les DEUX formes de stockage sont chargées —
              // `organization` (appli) et `session` (scripts `_gen-*`, présente
              // en production sur SES-0107 / SES-0108). Bornée au type
              // CONVENTION : les autres documents de niveau session (check-list,
              // grille, satisfaction) sont chargés par `sessionSharedDocs`.
              { entityType: { in: [...GROUP_CONVENTION_ENTITY_TYPES] }, type: 'CONVENTION' },
            ],
          },
          select: {
            id: true,
            type: true,
            participantId: true,
            entityType: true,
            entityId: true,
            // Lot C.2b-2 — l'état de SIGNATURE de la pièce, pas seulement son
            // existence. `status` distingue « parti » de « prêt à partir » ;
            // `signedPdfUrl` dit qu'une preuve existe déjà (webhook C.3 comme
            // scan du lot A) ; `signatureRequestId` porte l'annulation, qui
            // s'applique à la DEMANDE et non au document. Aucune requête de
            // plus : ce `findMany` charge déjà les documents participants ET
            // les conventions de groupe, toutes formes de stockage confondues.
            status: true,
            signedPdfUrl: true,
            signatureRequestId: true,
          },
        }),
        prisma.pedagogicalAsset.findMany({
          where: {
            tenantId: user.tenantId,
            sessionId: session.id,
            pdfUrl: { not: null },
            OR: [
              { participantId: { in: sessionParticipantIds } },
              // Analyse des besoins d'ENTREPRISE (28/08) : UN asset couvre tout
              // le groupe, donc `participantId = null`. Sans ce OR, les 8
              // salariés d'ASSALIT affichent « analyse manquante » alors que le
              // document exigé — celui de la structure — existe.
              { participantId: null },
            ],
          },
          select: { id: true, kind: true, participantId: true },
        }),
        prisma.invoice.findMany({
          where: {
            tenantId: user.tenantId,
            OR: [
              { participantId: { in: sessionParticipantIds } },
              { sessionId: session.id },
            ],
          },
          select: { id: true, number: true, participantId: true, participantIds: true },
        }),
        // Assets produit partagés par tous les apprenants : Programme + Déroulé
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'product',
            entityId: session.product?.id,
            type: { in: ['PROGRAMME', 'DEROULE_PEDAGOGIQUE'] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true },
        }),
        // Assets niveau session partagés par tous les apprenants :
        // grille observation consolidée (C3.i11), check-list formation (C4.i17),
        // bilan satisfaction session (ind. 30 — ajouté A5 pour le rendu carte).
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'session',
            entityId: session.id,
            type: { in: ['GRILLE_OBS_SESSION', 'CHECKLIST_FORMATION', 'SATISFACTION_SESSION', 'PROGRAMME'] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true },
        }),
      ])
    : [[], [], [], [], []];

  // Index des assets produit par type — 1 lien partagé pour toutes les lignes
  // de la matrice (programme + déroulé sont identiques pour tous les inscrits).
  const productDocByType = new Map<string, string>();
  for (const d of productAssets) {
    if (!productDocByType.has(d.type)) productDocByType.set(d.type, d.id);
  }
  const programmeProductDocId = productDocByType.get('PROGRAMME');
  const derouleProductDocId = productDocByType.get('DEROULE_PEDAGOGIQUE');

  const sessionSharedDocByType = new Map<string, string>();
  for (const d of sessionSharedDocs) {
    if (!sessionSharedDocByType.has(d.type)) sessionSharedDocByType.set(d.type, d.id);
  }
  // Le programme DE SESSION prime sur celui du catalogue : quand un tarif a été
  // négocié, c'est lui qui porte le bon montant et qui part au dossier OPCO.
  const programmeDocId =
    sessionSharedDocByType.get('PROGRAMME') ?? programmeProductDocId;
  const grilleSessionDocId = sessionSharedDocByType.get('GRILLE_OBS_SESSION');
  const checklistDocId = sessionSharedDocByType.get('CHECKLIST_FORMATION');
  const satisfactionSessionDocId = sessionSharedDocByType.get('SATISFACTION_SESSION');

  // Indexe par participant pour lookup en O(1) côté rendu
  const docsByParticipant = new Map<string, Map<string, string>>(); // partId → Map(type → docId)
  const assetsByParticipant = new Map<string, Map<string, string>>(); // partId → Map(kind → assetId)
  for (const d of sessionDocs) {
    if (!d.participantId) continue;
    const m = docsByParticipant.get(d.participantId) ?? new Map();
    m.set(d.type, d.id);
    docsByParticipant.set(d.participantId, m);
  }
  // Convention ENTREPRISE : le document groupe est rattaché à l'organisation
  // commanditaire, pas à un participant. On le reporte sur chaque salarié du
  // groupe, sinon la fiche annonce « convention manquante » pour les 11
  // salariées d'OPTIMMO alors que la convention existe.
  // Résolution déléguée au helper partagé (revue Codex PR #13) : opco-submission
  // et le statut de préparation utilisent exactement la même règle.
  const groupConventionByParticipant = expandGroupConventions(
    sessionDocs,
    session.participants.map((p) => ({ id: p.id, sponsorOrgId: p.sponsorOrg.id })),
  );
  for (const [participantId, docId] of groupConventionByParticipant) {
    const m = docsByParticipant.get(participantId) ?? new Map();
    // Ne jamais écraser une convention individuelle déjà en place.
    if (!m.has('CONVENTION')) m.set('CONVENTION', docId);
    docsByParticipant.set(participantId, m);
  }
  for (const a of sessionAssets) {
    if (!a.participantId) continue;
    const m = assetsByParticipant.get(a.participantId) ?? new Map();
    m.set(a.kind, a.id);
    assetsByParticipant.set(a.participantId, m);
  }
  // Analyse des besoins d'ENTREPRISE : asset de niveau session, reporté sur
  // chaque salarié dont le payeur est une personne morale — même mécanique que
  // la convention de groupe. Les auto-payeurs gardent leur analyse nominative.
  const analyseEntrepriseAssetId =
    sessionAssets.find((a) => !a.participantId && a.kind === 'ANALYSE_BESOIN')?.id ?? null;
  if (analyseEntrepriseAssetId) {
    for (const p of session.participants) {
      if (!releveDeLaConventionPour(p)) continue;
      const m = assetsByParticipant.get(p.id) ?? new Map();
      // Ne jamais écraser une analyse nominative déjà rendue.
      if (!m.has('ANALYSE_BESOIN')) m.set('ANALYSE_BESOIN', analyseEntrepriseAssetId);
      assetsByParticipant.set(p.id, m);
    }
  }

  // Indexe les factures par participant. Une facture peut couvrir plusieurs
  // inscrits (groupage sponsor via Invoice.participantIds Json[]) ou un seul
  // (via Invoice.participantId).
  const invoiceByParticipant = new Map<string, { id: string; number: string }>();
  for (const inv of sessionInvoices) {
    const ids: string[] = [];
    if (inv.participantId) ids.push(inv.participantId);
    if (Array.isArray(inv.participantIds)) {
      for (const x of inv.participantIds) {
        if (typeof x === 'string') ids.push(x);
      }
    }
    for (const pid of ids) {
      if (!invoiceByParticipant.has(pid)) {
        invoiceByParticipant.set(pid, { id: inv.id, number: inv.number });
      }
    }
  }

  // ─── Phase 9.1 Plan 03 — Chargement bulk pour la matrice qualiopi ──────────
  // 4 queries parallèles tenant-scopées :
  //   - participantDocs : Document.entityType='participant' (per-participant)
  //   - productDocs     : Document.entityType='product'     (1 PDF / N statuts — Bug P0)
  //   - sessionDocs     : Document.entityType='session'     (session-only)
  //   - pedagogicalAssets : PedagogicalAsset per participant
  const [participantDocsRaw, productDocsRaw, sessionDocsRaw, pedAssetsRaw] = sessionParticipantIds.length
    ? await Promise.all([
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'participant',
            entityId: { in: sessionParticipantIds },
          },
          select: { id: true, type: true, entityId: true },
        }),
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'product',
            entityId: session.productId ?? '',
          },
          select: { id: true, type: true },
        }),
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'session',
            entityId: session.id,
          },
          select: { id: true, type: true },
        }),
        prisma.pedagogicalAsset.findMany({
          where: { tenantId: user.tenantId, sessionId: session.id },
          select: { id: true, participantId: true, kind: true },
        }),
      ])
    : [[], [], [], []];

  // Map<docType, {id}> pour productDocs / sessionDocs.
  const productDocsMap = new Map<string, { id: string }>(
    productDocsRaw.map((d) => [d.type as string, { id: d.id }]),
  );
  const sessionDocsMap = new Map<string, { id: string }>(
    sessionDocsRaw.map((d) => [d.type as string, { id: d.id }]),
  );

  // Map<participantId, Map<docType, {id}>>
  const participantDocsByPid = new Map<string, Map<string, { id: string }>>();
  for (const d of participantDocsRaw) {
    if (!d.entityId) continue;
    let inner = participantDocsByPid.get(d.entityId);
    if (!inner) {
      inner = new Map();
      participantDocsByPid.set(d.entityId, inner);
    }
    inner.set(d.type as string, { id: d.id });
  }

  // Map<participantId, Map<kind, {id}>>
  const pedAssetsByPid = new Map<string, Map<string, { id: string }>>();
  for (const a of pedAssetsRaw) {
    if (!a.participantId) continue;
    let inner = pedAssetsByPid.get(a.participantId);
    if (!inner) {
      inner = new Map();
      pedAssetsByPid.set(a.participantId, inner);
    }
    // Indexer par le DocType de colonne de la matrice, pas le kind brut :
    // le QCM a kind='QCM' mais sa colonne est 'EVALUATION_ACQUIS' (les autres
    // kinds sont identité). Sans ce mapping, la cellule QCM restait rouge alors
    // que l'asset existait. Le contrat de deriveCellState attend une map DocType→asset.
    const assetDocType = PED_KIND_TO_DOC_TYPE[a.kind as string] ?? (a.kind as string);
    inner.set(assetDocType, { id: a.id });
  }

  // ══ Régime de financement — spec signature §3 bis (D-10), lot C.2b-1 ═══════
  //
  // CE QUI A CHANGÉ LE 10/09/2026 (décision Laurent). Cette page décidait
  // elle-même « ce participant relève-t-il d'AGEFICE ? » avec la dérivation
  // élargie BUG-11 : commanditaire AGEFICE **ou** lien `EI_SELF` **ou** autre
  // organisation rattachée à ce financeur. Pendant ce temps, le moteur d'envoi
  // (lot C.2a) lisait les trois colonnes d'`OpcoCatalog`. Deux règles pour une
  // question : l'écran promettait des envois que `planifierEnvoi` ne planifiait
  // pas. Le RÉGIME fait foi désormais — un seul financeur par participant, celui
  // du commanditaire DE CETTE INSCRIPTION.
  //
  // La contrepartie est l'avertissement « régime incohérent » (`regime.ts`) :
  // il ne déclenche aucun envoi, il rend l'anomalie bruyante au lieu de faire
  // disparaître un dossier de l'écran. Son AFFICHAGE nominatif est le lot
  // C.2b-2 (bloc « Signature ») ; ici il sert déjà à garder la colonne AGEFICE.
  //
  // Même chemin que le moteur, à la ligne près : `codesFinanceursDe` →
  // `chargerReglesSignature` → `participantPourEnvoi`. Une seule requête
  // `OpcoCatalog` pour toute la page.
  const participantsLus: ParticipantLu[] = session.participants.map((p) => ({
    participantId: p.id,
    nomAffiche: `${p.person.firstName} ${p.person.lastName.toUpperCase()}`,
    sponsorOrgId: p.sponsorOrg.id,
    sponsorOrgLabel: p.sponsorOrg.brandName ?? p.sponsorOrg.legalName,
    sponsorOpcoCode: p.sponsorOrg.opcoCode,
    liens: p.person.legalLinks,
  }));
  const reglesSignature = await chargerReglesSignature(codesFinanceursDe(participantsLus));
  const regimeParParticipant = new Map(
    participantsLus.map((lu) => {
      const pourLePlan = participantPourEnvoi(lu, reglesSignature);
      return [
        lu.participantId,
        {
          pourLePlan,
          enRegime: docTypesEnRegime(pourLePlan.regle),
          // `docTypesSansObjet`, PAS `docTypesHorsRegime` : un commanditaire
          // sans code financeur doit toujours sa convention (cf. le module).
          sansObjet: docTypesSansObjet(pourLePlan.regle) as ReadonlySet<string>,
        },
      ] as const;
    }),
  );

  // Le scope AVANT est le seul à porter AGEFICE (`PIECES_PAR_SCOPE`).
  const planSignatureAvant = planifierEnvoi({
    scope: 'BEFORE',
    participants: [...regimeParParticipant.values()].map((r) => r.pourLePlan),
  });
  const planSignatureApres = planifierEnvoi({
    scope: 'AFTER',
    participants: [...regimeParParticipant.values()].map((r) => r.pourLePlan),
  });
  /**
   * Ce que l'avertissement « régime incohérent » doit DIRE, et que
   * `AnomalieEnvoi` ne transporte pas (correction n°3, Laurent 11/09/2026) :
   * l'organisation de l'inscription, et les financeurs des organisations
   * rattachées à l'apprenant.
   *
   * AUCUNE RÈGLE ICI — la décision « cette pièce est incohérente » reste
   * entièrement dans `regime.ts`. On recopie trois faits déjà chargés, sans
   * reconnaître aucun code financeur au passage : ce sont les codes tels que le
   * catalogue les porte qui ressortent à l'écran.
   */
  const contexteAvertissementParParticipant = new Map<string, ContexteAvertissement>(
    participantsLus.map((lu) => {
      const codesRattaches = [
        ...new Set(
          lu.liens
            .filter((lien) => lien.organizationId !== lu.sponsorOrgId)
            .map((lien) => (lien.organization?.opcoCode ?? '').trim())
            .filter((code) => code.length > 0),
        ),
      ];
      return [
        lu.participantId,
        {
          // L'id, PAS seulement le libellé : c'est la fiche que le lien du cas A
          // ouvre (`/app/organisations/{id}`). Sans lui, l'avertissement
          // retomberait sur le formulaire d'inscription — le comportement que la
          // correction n°7 bis supprime.
          sponsorOrgId: lu.sponsorOrgId,
          sponsorOrgLabel: lu.sponsorOrgLabel,
          // `regle === null` = financeur absent ou hors catalogue : aucune
          // pièce en régime. C'est ce qui distingue « n'a aucun régime de
          // financement » de « n'ouvre pas ces pièces ».
          financeurSansRegime:
            (regimeParParticipant.get(lu.participantId)?.pourLePlan.regle ?? null) === null,
          financeursRattaches: codesRattaches,
        },
      ] as const;
    }),
  );

  const avertissementsRegimeAvant = planSignatureAvant.avertissements;
  const participantsAvertisAgefice = new Set(
    avertissementsRegimeAvant.filter((a) => a.docType === 'AGEFICE').map((a) => a.participantId),
  );

  // Construit le tableau matrixParticipants pour ParticipantDocMatrix.
  const matrixParticipants = session.participants.map((p) => {
    const regime = regimeParParticipant.get(p.id);
    return {
      id: p.id,
      personId: p.person.id,
      fullName: `${p.person.firstName} ${p.person.lastName.toUpperCase()}`,
      sponsorOrgId: p.sponsorOrg.id,
      sponsorOrgLabel: p.sponsorOrg.brandName ?? p.sponsorOrg.legalName,
      sponsorOrgOpcoCode: p.sponsorOrg.opcoCode,
      financingMode: p.financingMode as string | null,
      docStatus: (p.docStatus as Record<string, unknown> | null) ?? null,
      isAgefice: regime?.enRegime.has('AGEFICE') ?? false,
      docTypesHorsRegime: regime?.sansObjet,
      participantDocs: participantDocsByPid.get(p.id) ?? new Map<string, { id: string }>(),
      pedagogicalAssets: pedAssetsByPid.get(p.id) ?? new Map<string, { id: string }>(),
    };
  });

  // ⚠ TROIS raisons de garder la colonne, et la deuxième est la contrepartie du
  // changement de règle : un dossier AGEFICE DÉJÀ GÉNÉRÉ ne disparaît pas de
  // l'écran parce que le régime a cessé de reconnaître son porteur. Un dossier
  // qui disparaît de l'écran ne se corrige jamais.
  const hasAgeficeParticipant = colonneAgeficeVisible({
    participants: matrixParticipants.map((p) => ({
      participantId: p.id,
      enRegime: regimeParParticipant.get(p.id)?.enRegime ?? new Set(),
    })),
    participantsAvecDocumentAgefice: new Set(
      matrixParticipants.filter((p) => p.participantDocs.has('AGEFICE')).map((p) => p.id),
    ),
    participantsAvertisAgefice,
  });

  // ══ Bloc « Signature » des onglets Avant / Après — lot C.2b-2 ══════════════
  //
  // RBAC : `ADMIN | MANAGER`, le MÊME ensemble que `canEdit` (défini plus bas
  // pour l'édition des champs structurants) — calculé ici parce que le bloc en a
  // besoin avant. ⚠ SURTOUT PAS `canWrite`, qui inclut `COMMERCIAL` : les trois
  // server actions de signature refusent ce rôle. Un bouton visible pour un rôle
  // refusé est un bouton qui ment.
  const canSign = ['ADMIN', 'MANAGER'].includes(user.role);

  // L'état de signature de chaque document déjà chargé, indexé par id.
  const etatDocParId = new Map<string, DocumentDeLaPiece>(
    sessionDocs.map((d) => [
      d.id,
      {
        id: d.id,
        status: d.status,
        signedPdfUrl: d.signedPdfUrl,
        signatureRequestId: d.signatureRequestId,
      },
    ]),
  );

  // Le dépôt manuel du lot A ne touche PAS `Document.status` : il écrit
  // `SessionParticipant.docStatus[docType].state = 'MANUAL_OK'`. Lu ici depuis
  // la même source que `deriveCellState`, pour que la ligne du bloc ne dise
  // jamais autre chose que la cellule de la matrice.
  const docStatusParParticipant = new Map<string, Record<string, string | null>>(
    session.participants.map((p) => {
      const brut = (p.docStatus as Record<string, unknown> | null) ?? {};
      const etats: Record<string, string | null> = {};
      for (const [type, valeur] of Object.entries(brut)) {
        const state = (valeur as { state?: unknown } | null)?.state;
        etats[type] = typeof state === 'string' ? state : null;
      }
      return [p.id, etats] as const;
    }),
  );

  /**
   * Les inscriptions dans la forme attendue par la résolution du signataire.
   *
   * `releveDeLaConvention` est appelé par `releveDeLaConventionPour`, le
   * helper déjà présent en tête de ce fichier — la MÊME règle payeur du 12/08
   * qui a décidé de la forme du document au moment de sa génération.
   */
  const participantsPourSignataire: ParticipantPourSignataire[] = session.participants.map((p) => ({
    id: p.id,
    nom: `${p.person.firstName} ${p.person.lastName.toUpperCase()}`,
    apprenant: {
      firstName: p.person.firstName,
      lastName: p.person.lastName,
      email: p.person.email,
    },
    org: {
      id: p.sponsorOrg.id,
      legalName: p.sponsorOrg.legalName,
      representative: p.sponsorOrg.representative,
      contacts: p.sponsorOrg.contacts.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        isPrimary: c.isPrimary,
      })),
    },
    estEiSelfChezSponsor:
      p.person.legalLinks.find((l) => l.organizationId === p.sponsorOrgId)?.role === 'EI_SELF',
    relevantDeLaConvention: releveDeLaConventionPour(p),
  }));
  const participantPourSignataireParId = new Map(
    participantsPourSignataire.map((p) => [p.id, p] as const),
  );

  /**
   * Le couple nom + adresse de chaque pièce du plan.
   *
   * ⚠ AUCUNE RÈGLE ICI. On assemble les inscrits couverts, puis on appelle les
   * DEUX fonctions du moteur (`formeDuDocument`, puis `resoudreSignataireClient`).
   * Une pièce dont la cascade n'aboutit pas n'entre pas dans la map : la ligne
   * dira « signataire à déterminer », et le récapitulatif rendra le refus
   * nominatif complet au moment d'envoyer.
   */
  const signataireParCle = (plan: ReturnType<typeof planifierEnvoi>) => {
    const parCle = new Map<string, { nom: string; email: string }>();
    for (const envoi of plan.envois) {
      const couverts = envoi.participantIds.flatMap((id) => {
        const p = participantPourSignataireParId.get(id);
        return p === undefined ? [] : [p];
      });
      const forme = formeDuDocument(envoi, couverts);
      if (!forme.ok) continue;
      const client = resoudreSignataireClient({
        docType: envoi.docType,
        forme: forme.forme,
        envoi,
        couverts,
      });
      if (!client.ok) continue;
      parCle.set(envoi.cle, { nom: client.signataire.nom, email: client.signataire.email });
    }
    return parCle;
  };

  /**
   * La vue d'un scope. Le document d'une pièce est celui du PREMIER participant
   * couvert : `docsByParticipant` reporte déjà la convention de groupe sur
   * chaque salarié (`expandGroupConventions`), donc tous les couverts pointent
   * le même document — en lire un suffit, et en lire plusieurs inventerait un
   * arbitrage que le moteur ne fait pas.
   */
  const vuePourScope = (plan: ReturnType<typeof planifierEnvoi>): VueSignature => {
    const documentParCle = new Map<string, DocumentDeLaPiece>();
    const docStatusParCle = new Map<string, string | null>();
    for (const envoi of plan.envois) {
      const premier = envoi.participantIds[0];
      if (premier === undefined) continue;
      const docId = docsByParticipant.get(premier)?.get(envoi.docType);
      const etat = docId === undefined ? undefined : etatDocParId.get(docId);
      if (etat !== undefined) documentParCle.set(envoi.cle, etat);
      const manuel = docStatusParParticipant.get(premier)?.[envoi.docType] ?? null;
      docStatusParCle.set(envoi.cle, manuel);
    }
    return construireVueSignature({
      plan,
      documentParCle,
      docStatusParCle,
      canSign,
      contexteAvertissementParParticipant,
      signataireParCle: signataireParCle(plan),
    });
  };
  const vueSignatureAvant = vuePourScope(planSignatureAvant);
  const vueSignatureApres = vuePourScope(planSignatureApres);

  // Lot 0 (audit 28/08, E-1) — état documentaire de la session : périmé,
  // non vérifiable (produit avant le suivi des empreintes), engagé. Une seule
  // lecture des documents, jamais de N+1, et jamais bloquant : en cas d'échec
  // on n'affiche aucun avertissement plutôt que de faire tomber la page.
  const docAnalysis = await analyzeSessionDocuments(
    user.tenantId,
    session.id,
    session.product?.id ?? null,
  );

  // Lot 0 · 0.3 (audit 28/08, E-3) — les documents au contenu GÉNÉRIQUE : l'IA
  // a échoué et un texte de remplacement a été servi, identique d'un stagiaire
  // à l'autre. Filtré côté Postgres (`rawJson.source`) pour ne pas charger les
  // JSON de tous les assets de la session.
  const stubAssets = await prisma.pedagogicalAsset.findMany({
    where: {
      tenantId: user.tenantId,
      sessionId: session.id,
      rawJson: { path: ['source'], equals: 'stub' },
    },
    select: { id: true },
  });
  const stubAssetIds = new Set(stubAssets.map((a) => a.id));

  // Bug I — proxy de présence aligné sur deriveCellState (derive-cell-state.ts L70-71).
  // La matrice considère la grille obs comme générée dès qu'un PedagogicalAsset existe
  // par participant ; on reflète ça côté sidebar pour cohérence visuelle.
  const grilleObsAssetCount = pedAssetsRaw.filter((a) => a.kind === 'GRILLE_OBS').length;

  // Derniers batches pack fin de formation pour cette session (audit trail)
  const closureBatches = await prisma.closureBatch.findMany({
    where: { tenantId: user.tenantId, sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      totalDocs: true,
      doneDocs: true,
      errorDocs: true,
      createdAt: true,
      completedAt: true,
    },
  });

  const eiCount = session.participants.filter((p) => SOLO_FORMS.includes(p.sponsorOrg.legalForm)).length;
  const start = new Date(session.startDate);
  const end = new Date(session.endDate);

  // Pour chaque participant, compteur de docs personnels générés (exclut les
  // docs partagés produit/session : Programme, Déroulé, Grille session,
  // Check-list). Affiché à la fois dans la liste des inscrits (badge ligne)
  // ET dans le header de la matrice repliable (résumé agrégé).
  const PERSONAL_DOC_TYPES = ['CONVENTION', 'AGEFICE', 'ATTESTATION_FIN', 'CERTIFICAT_REALISATION'] as const;
  const PERSONAL_ASSET_KINDS = ['ANALYSE_BESOIN', 'POSITIONNEMENT', 'EMARGEMENT', 'GRILLE_OBS', 'QCM', 'SATISFACTION_CHAUD', 'SATISFACTION_FROID'] as const;
  const PERSONAL_DOC_TOTAL = PERSONAL_DOC_TYPES.length + PERSONAL_ASSET_KINDS.length; // 11
  const docCompletionByParticipant = new Map<string, number>();
  for (const p of session.participants) {
    const docs = docsByParticipant.get(p.id);
    const assets = assetsByParticipant.get(p.id);
    let n = 0;
    for (const t of PERSONAL_DOC_TYPES) if (docs?.has(t)) n++;
    for (const k of PERSONAL_ASSET_KINDS) if (assets?.has(k)) n++;
    docCompletionByParticipant.set(p.id, n);
  }
  const totalCompleted = Array.from(docCompletionByParticipant.values()).reduce((s, x) => s + x, 0);
  const totalExpected = session.participants.length * PERSONAL_DOC_TOTAL;
  const completionPct = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;

  // Détail par type de doc — combien de participants ont chaque doc.
  // Permet d'afficher "ce qui manque le plus" en un coup d'œil.
  const DOC_LABEL_BY_TYPE: Record<string, string> = {
    CONVENTION: 'Conventions',
    AGEFICE: 'AGEFICE',
    ATTESTATION_FIN: 'Attestations fin',
    CERTIFICAT_REALISATION: 'Certificats',
    ANALYSE_BESOIN: 'Analyses besoin',
    POSITIONNEMENT: 'Positionnements',
    EMARGEMENT: 'Émargements',
    GRILLE_OBS: 'Grilles obs',
    QCM: 'QCM',
    SATISFACTION_CHAUD: 'Satisfactions chaud',
    SATISFACTION_FROID: 'Satisfactions froid',
  };
  const docCountByType: Array<{ type: string; label: string; count: number; total: number; pct: number }> = [];
  const totalP = session.participants.length;
  for (const t of PERSONAL_DOC_TYPES) {
    let count = 0;
    for (const p of session.participants) {
      if (docsByParticipant.get(p.id)?.has(t)) count++;
    }
    docCountByType.push({ type: t, label: DOC_LABEL_BY_TYPE[t] ?? t, count, total: totalP, pct: totalP > 0 ? Math.round((count / totalP) * 100) : 0 });
  }
  for (const k of PERSONAL_ASSET_KINDS) {
    let count = 0;
    for (const p of session.participants) {
      if (assetsByParticipant.get(p.id)?.has(k)) count++;
    }
    docCountByType.push({ type: k, label: DOC_LABEL_BY_TYPE[k] ?? k, count, total: totalP, pct: totalP > 0 ? Math.round((count / totalP) * 100) : 0 });
  }
  // Top manquants : <100% triés par count croissant (premier = manque le plus)
  const docsMissingMost = docCountByType
    .filter((d) => d.count < d.total)
    .sort((a, b) => a.count - b.count)
    .slice(0, 5);

  // Latest closure batch (premier de la liste déjà triée par createdAt desc).
  // Utilisé pour le CTA primaire quand la session est COMPLETED.
  const latestBatch = closureBatches[0] ?? null;

  // BUG-5 — indicateur visuel de complétude session pour guider l'utilisateur
  // avant qu'il clique 'Pack fin de formation' avec une session bancale.
  // BUG-17 — chaque blocker contient un lien direct (anchor #section-X ou URL)
  // vers l'élément à corriger.
  const sessionCompleteness = getSessionCompleteness({
    startDate: session.startDate,
    endDate: session.endDate,
    pricePerLearner: session.pricePerLearner,
    locationId: session.locationId,
    location: session.location,
    modality: session.modality,
    trainers: session.trainers.map((t) => ({ isPrimary: t.isPrimary })),
    product: session.product
      ? { programMd: session.product.programMd, aiDraftedAt: session.product.aiDraftedAt }
      : null,
    participantsCount: session.participants.length,
    productId: session.product?.id ?? null,
    stubDocsCount: stubAssetIds.size,
  });

  // Drapeaux passés à la matrice — regroupés pour ne pas dépendre de l'ordre
  // des paramètres (cf. CellFlagSets).
  const matrixFlags = {
    stale: docAnalysis.stale,
    unverifiable: docAnalysis.unverifiable,
    engaged: docAnalysis.engaged,
    stub: stubAssetIds,
  };

  // Quick task 260525-kl5 — état agrégé des 6 catégories de docs de préparation
  // pédagogique pour le bloc PreparationPedagogiqueBlock. La server action est
  // tenant-scopée via validateRequest (déjà résolue ci-dessus).
  const preparationStatus = await getSessionPreparationStatus(session.id);
  const closureStatus = await getSessionClosureStatus(session.id);
  const sessionEvalStats = await getSessionEvaluationStats(session.id, user.tenantId);

  // ─── Données complémentaires pour la timeline 5 étapes ─────────────────
  // SessionSlot : pour step 3 "Pendant la formation" (créneaux + émargements signés)
  // Invoices détaillées : pour step 5 (table compacte CA / facturé / encaissé)
  const [sessionSlotsAgg, timelineInvoices, latestOpcoSubmission] = await Promise.all([
    prisma.sessionSlot.findMany({
      where: { sessionId: session.id, session: { tenantId: user.tenantId } },
      select: {
        id: true,
        // Phase 15 Lot 3 — champs pour l'affichage lecture de l'onglet Agenda.
        date: true,
        startTime: true,
        endTime: true,
        halfDay: true,
        attendances: { select: { signedAt: true }, take: 1 },
      },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [{ sessionId: session.id }, { participant: { sessionId: session.id } }],
      },
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        amountTTC: true,
        amountPaid: true,
        originalInvoiceId: true,
        participant: { select: { person: { select: { firstName: true, lastName: true } } } },
        payerOrg: { select: { legalName: true } },
      },
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
    }),
    prisma.opcoSubmission.findFirst({
      where: { tenantId: user.tenantId, participant: { sessionId: session.id } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  const totalSlots = sessionSlotsAgg.length;
  const signedSlots = sessionSlotsAgg.filter((s) => s.attendances.length > 0).length;

  // Phase 15 Lot 3 — créneaux sérialisés (date ISO) pour l'onglet Agenda (lecture).
  const agendaSlots = sessionSlotsAgg.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    startTime: s.startTime,
    endTime: s.endTime,
    halfDay: s.halfDay,
  }));
  const isPastSession = new Date(session.endDate) < new Date();

  const primaryTrainer = session.trainers.find((t) => t.isPrimary) ?? null;
  const primaryTrainerName = primaryTrainer
    ? `${primaryTrainer.person.firstName} ${primaryTrainer.person.lastName}`
    : null;
  const coTrainerCount = session.trainers.filter((t) => !t.isPrimary).length;
  const pricePerLearnerNum = session.pricePerLearner === null ? null : Number(session.pricePerLearner);
  const caTotalHT = (pricePerLearnerNum ?? 0) * session.participants.length;

  // ── Inscriptions publiques par session (spec 2026-08-28) ──────────────
  // Demandes reçues via le lien public et pas encore traitées : elles
  // occupent une place au même titre qu'un inscrit (le formulaire refuse
  // au-delà de capacityMax).
  const enrollmentRequests = await prisma.preEnrollment.findMany({
    where: { intendedSessionId: session.id },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      submittedAt: true,
      companyName: true,
      professionalStatus: true,
      cniKey: true,
      cniVersoKey: true,
      extractedData: true,
      ribKey: true,
      cfpKey: true,
    },
  });
  const pendingEnrollmentCount = enrollmentRequests.filter((r) =>
    ['SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'VALIDATED'].includes(r.status),
  ).length;
  const enrollmentRequestRows = enrollmentRequests.map((r) => ({
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    status: r.status,
    submittedAt: r.submittedAt,
    companyName: r.companyName,
    professionalStatus: r.professionalStatus,
    hasCni: Boolean(r.cniKey),
    hasCniVerso: Boolean(r.cniVersoKey),
    contributionCfp: contributionFromExtractedData(r.extractedData),
    hasRib: Boolean(r.ribKey),
    hasCfp: Boolean(r.cfpKey),
  }));
  const enrollmentLinkState = publicLinkState({
    publicToken: session.publicToken,
    publicFormClosedAt: session.publicFormClosedAt,
    sessionStatus: session.status,
    capacityMax: session.capacityMax,
    participantCount: session.participants.length,
    pendingRequestCount: pendingEnrollmentCount,
  });
  const enrollmentUrl = session.publicToken
    ? buildPublicEnrollmentUrl(session.publicToken)
    : null;

  const timelineInvoiceRows = timelineInvoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    amountTTC: Number(inv.amountTTC),
    amountPaid: Number(inv.amountPaid),
    issueDate: inv.issueDate,
    beneficiary:
      inv.participant?.person
        ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
        : (inv.payerOrg?.legalName ?? '—'),
    isCreditNote: inv.status === 'CREDIT_NOTE',
  }));

  const locationLabel = session.location?.name ?? null;
  const productLabel = session.product?.title ?? null;
  const productCode = session.product?.code ?? null;
  const productDuration = session.product?.durationHours ?? null;

  // Lot A signature (spec 2026-09-04 §5 A) — stagiaires de la zone de dépôt des
  // scans signés. `stateByDocType` montre à l'admin ce qu'il s'apprête à écraser
  // (« Signé (scan) » l'emporte sur « Généré », même priorité que deriveCellState).
  const dropZoneParticipants = matrixParticipants.map((p) => {
    const generated = participantDocsByPid.get(p.id);
    const stateByDocType: Record<string, string> = {};
    for (const docType of ['EMARGEMENT', 'CONVENTION', 'AGEFICE', 'CONVOCATION']) {
      const manual = (p.docStatus?.[docType] as { state?: string } | undefined)?.state;
      if (manual === 'MANUAL_OK') stateByDocType[docType] = 'Signé (scan)';
      else if (generated?.has(docType)) stateByDocType[docType] = 'Généré';
    }
    return { id: p.id, fullName: p.fullName, stateByDocType };
  });

  // Items pré-formation Qualiopi (source unique) — alimentent l'onglet « Avant »
  // (TabAvant) qui réembarque les actions dispatchGenerate* de l'ancien drawer.
  const docDockItems = buildDocDockItems({
    programmeProductDocId: programmeDocId,
    derouleProductDocId,
    checklistDocId,
    participants: matrixParticipants.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      isAgefice: p.isAgefice,
    })),
    docsByParticipant,
    assetsByParticipant,
    analyseBesoinInProgress: preparationStatus.analyseBesoinInProgress,
    analyseBesoinPending: preparationStatus.analyseBesoinPending,
  });

  // Phase 15 Lot 2 — l'onglet « Avant » n'agit que sur les docs PAR STAGIAIRE
  // (Convention/Convocation/AGEFICE/Analyse besoin/Assiduité AGEFICE). Les docs
  // partagés produit/session (Programme/Déroulé/Checklist) vivent côté
  // produit / onglet « Après » (1 doc = 1 maison) — on les retire d'ici pour ne
  // pas dupliquer la surface d'action.
  const avantItems = docDockItems.filter((it) => it.section !== 'shared');

  // Phase 15 Lot 2 — onglet « Après » : compteur « manquants » dérivé de la
  // MÊME source que la matrice (`docCompletion`), via buildClosureCompletionItems.
  const closureItems = buildClosureCompletionItems({
    participantsCount: closureStatus.participantsCount,
    ageficeEligibleCount: closureStatus.ageficeEligibleCount,
    programmeProductDocId: programmeDocId,
    grilleObsSession: closureStatus.grilleObsSession,
    bilanSatisfaction: closureStatus.bilanSatisfaction,
    attestations: closureStatus.attestations,
    certificats: closureStatus.certificats,
    qcm: closureStatus.qcm,
    positionnements: closureStatus.positionnements,
    satisfactionChaud: closureStatus.satisfactionChaud,
    satisfactionFroid: closureStatus.satisfactionFroid,
    assiduites: closureStatus.assiduites,
  });

  // Laurent 2026-09-10 — blocs NOMINATIFS des phases « pendant » et « après ».
  // L'onglet Après n'en avait aucun : il n'y avait donc aucune ligne « nom
  // d'apprenant » sur laquelle poser un bouton par apprenant. Dérivés avec le
  // MÊME `deriveCellState` que la matrice, à partir des mêmes maps.
  //
  // Les deux pièces d'ENTREPRISE sont reportées ici comme la route ZIP les
  // reporte (convention de groupe, analyse des besoins collective) : le
  // compteur du bouton « Télécharger (N) » doit annoncer EXACTEMENT le nombre
  // de fichiers que l'archive contiendra, pas le nombre de lignes à l'écran.
  const phaseParticipantsInput = matrixParticipants.map((p) => {
    const raw = session.participants.find((sp) => sp.id === p.id);
    const participantDocs = new Map(p.participantDocs);
    const conventionGroupeId = groupConventionByParticipant.get(p.id);
    if (conventionGroupeId && !participantDocs.has('CONVENTION')) {
      participantDocs.set('CONVENTION', { id: conventionGroupeId });
    }
    const pedagogicalAssets = new Map(p.pedagogicalAssets);
    if (
      analyseEntrepriseAssetId &&
      !pedagogicalAssets.has('ANALYSE_BESOIN') &&
      raw &&
      releveDeLaConventionPour(raw)
    ) {
      pedagogicalAssets.set('ANALYSE_BESOIN', { id: analyseEntrepriseAssetId });
    }
    return {
      id: p.id,
      fullName: p.fullName,
      sponsorOrgLabel: p.sponsorOrgLabel,
      isAgefice: p.isAgefice,
      docStatus: p.docStatus,
      participantDocs,
      pedagogicalAssets,
    };
  });
  // « Avant » : l'onglet affiche ses lignes depuis `buildDocDockItems` (elles
  // portent les actions de génération), mais son bouton de téléchargement doit
  // compter ce que l'archive embarque — d'où ce groupe dérivé de la table des
  // phases, source unique partagée avec la route ZIP.
  const avantGroups = buildParticipantPhaseGroups({
    phase: 'avant',
    participants: phaseParticipantsInput,
    productDocs: productDocsMap,
    sessionDocs: sessionDocsMap,
  });
  const pendantGroups = buildParticipantPhaseGroups({
    phase: 'pendant',
    participants: phaseParticipantsInput,
    productDocs: productDocsMap,
    sessionDocs: sessionDocsMap,
  });
  const apresGroups = buildParticipantPhaseGroups({
    phase: 'apres',
    participants: phaseParticipantsInput,
    productDocs: productDocsMap,
    sessionDocs: sessionDocsMap,
  });

  // État des 4 docs niveau session pour les boutons unitaires de l'onglet Après.
  // grilleObs : proxy aligné sur la matrice (Document GRILLE_OBS_SESSION OU
  // ≥1 PedagogicalAsset GRILLE_OBS par participant — cf. grilleObsAssetCount).
  const apresSessionDocs = {
    deroule: {
      state: (derouleProductDocId ? 'generated' : 'missing') as 'generated' | 'missing',
      pdfUrl: derouleProductDocId ? `/api/documents/${derouleProductDocId}` : undefined,
    },
    grilleObs: {
      state: (grilleSessionDocId || grilleObsAssetCount > 0 ? 'generated' : 'missing') as
        | 'generated'
        | 'missing',
      pdfUrl: grilleSessionDocId ? `/api/documents/${grilleSessionDocId}` : undefined,
    },
    checklist: {
      state: (checklistDocId ? 'generated' : 'missing') as 'generated' | 'missing',
      pdfUrl: checklistDocId ? `/api/documents/${checklistDocId}` : undefined,
    },
    satisfactionSession: {
      state: (satisfactionSessionDocId ? 'generated' : 'missing') as 'generated' | 'missing',
      pdfUrl: satisfactionSessionDocId ? `/api/documents/${satisfactionSessionDocId}` : undefined,
    },
  };

  // Source UNIQUE pour l'étape courante — header + hero + timeline + drawer
  // lisent tous depuis ici (commit ui-a 2026-06-05).
  const stage = sessionStage({
    status: session.status,
    startDate: session.startDate,
    endDate: session.endDate,
    participantsCount: session.participants.length,
    primaryTrainerName,
    productAiDraftPending: Boolean(session.product?.aiDraftedAt),
    // Volet 3 (12/08) : le CTA « Valider le programme » mène à la fiche
    // produit (?tab=programme) où vit le vrai bouton de validation.
    productId: session.product?.id ?? null,
    prep: preparationStatus,
    closure: closureStatus,
  });
  const canWrite = ['ADMIN', 'MANAGER', 'COMMERCIAL'].includes(user.role);
  // Quick 260817-mm0 — commanditaires PERSONNES MORALES de la session, pour la
  // convention groupe. Les auto-payeurs sont exclus : ils relèvent du contrat
  // de formation individuel (chantier suivant du todo du 12/08).
  const conventionGroupes = (() => {
    const map = new Map<
      string,
      {
        sponsorOrgId: string;
        sponsorName: string;
        participantCount: number;
        hasConvention: boolean;
        /** Convention groupe déjà en base — sert à l'ouvrir depuis le panneau. */
        conventionDocId: string | null;
        /** Analyse des besoins d'entreprise (asset de niveau session), si rendue. */
        analyseAssetId: string | null;
        /** Représentant légal connu, pour la saisie express depuis le panneau. */
        representant: string | null;
        /** Date de signature proposée (ISO), modifiable avant génération. */
        dateSignatureParDefaut: string;
        /** Ce qui manque AVANT de générer — mêmes règles que les cœurs. */
        blocages: BlocageDocEntreprise[];
      }
    >();
    for (const p of session.participants) {
      if (!releveDeLaConventionPour(p)) continue;
      const g =
        map.get(p.sponsorOrgId) ??
        {
          sponsorOrgId: p.sponsorOrgId,
          sponsorName: p.sponsorOrg.legalName,
          participantCount: 0,
          // Couverture lue via le helper partagé (28/08) : il reconnaît les
          // DEUX formes de convention groupe (`organization` écrite par
          // l'appli, `session` produite par les scripts `_gen-*`). Le filtre
          // maison sur `entityType === 'organization'` manquait la seconde,
          // présente en production sur SES-0107 / SES-0108.
          hasConvention: groupConventionByParticipant.has(p.id),
          conventionDocId: groupConventionByParticipant.get(p.id) ?? null,
          analyseAssetId: analyseEntrepriseAssetId,
          representant: (p.sponsorOrg.representative ?? '').trim() || null,
          // Date proposée = la règle (J-15 ouvrés, plafonnée au jour même).
          // Affichée dans le panneau, modifiable avant de générer : aucune
          // règle ne connaît la date réellement négociée avec le client.
          dateSignatureParDefaut: resolveConventionDateIso(
            session.startDate.toISOString().slice(0, 10),
            new Date().toISOString().slice(0, 10),
          ),
          // Rempli plus bas, une fois tous les salariés du groupe connus.
          blocages: [] as BlocageDocEntreprise[],
        };
      g.participantCount += 1;
      map.set(p.sponsorOrgId, g);
    }
    // Ce qui manque AVANT de cliquer (28/08) : mêmes règles que les cœurs, dites
    // à l'avance. Sans ce pré-contrôle, le manque n'apparaissait qu'après un
    // aller-retour — et, pour l'analyse, après un appel IA payé pour rien.
    for (const [orgId, g] of map) {
      const membres = session.participants.filter((p) => p.sponsorOrgId === orgId);
      const org = membres[0]!.sponsorOrg;
      g.blocages = blocagesDocsEntreprise({
        org: {
          id: orgId,
          legalName: org.legalName,
          representative: org.representative,
          // ⚠ `.some(isPrimary)`, plus `.length > 0` : la requête charge
          // désormais TOUS les contacts (cf. le `select`), donc compter les
          // lignes ne dirait plus « il existe un contact principal ».
          aContactPrincipal: org.contacts.some((c) => c.isPrimary),
        },
        participants: membres.map((p) => ({
          nom: `${p.person.firstName} ${p.person.lastName.toUpperCase()}`,
          priceHT: Number(p.priceHT),
        })),
        produitPresent: Boolean(session.product),
      });
    }
    // Entreprises multi-apprenants d'abord (pattern OPTIMMO), puis par nom.
    return [...map.values()].sort(
      (a, b) =>
        b.participantCount - a.participantCount ||
        a.sponsorName.localeCompare(b.sponsorName, 'fr'),
    );
  })();
  // Volet 2 (12/08) : émission de factures — miroir du RBAC des server
  // actions createInvoiceFromParticipant / createInvoiceForSponsorGroup.
  const canInvoice = ['ADMIN', 'MANAGER', 'COMPTABLE'].includes(user.role);
  // Groupes payeurs pour les boutons d'émission de l'étape 5 : par sponsorOrg,
  // entreprises multi-apprenants d'abord (pattern OPTIMMO), puis EI par nom.
  const billingGroups = (() => {
    const map = new Map<
      string,
      {
        sponsorOrgId: string;
        sponsorName: string;
        participants: { id: string; label: string; priceHT: number; invoiceSent: boolean }[];
      }
    >();
    for (const p of session.participants) {
      const g =
        map.get(p.sponsorOrgId) ??
        { sponsorOrgId: p.sponsorOrgId, sponsorName: p.sponsorOrg.legalName, participants: [] };
      g.participants.push({
        id: p.id,
        label: `${p.person.firstName} ${p.person.lastName}`,
        priceHT: Number(p.priceHT),
        invoiceSent: p.invoiceSent,
      });
      map.set(p.sponsorOrgId, g);
    }
    return [...map.values()].sort(
      (a, b) =>
        b.participants.length - a.participants.length ||
        a.sponsorName.localeCompare(b.sponsorName, 'fr'),
    );
  })();
  // canEdit : seuls ADMIN/MANAGER éditent les champs structurants (titre,
  // tarif, notes, capacités, dates). COMMERCIAL peut écrire (inscrire,
  // générer docs) mais pas modifier la structure de la session.
  // Même ensemble que `canSign` (lot C.2b-2), calculé plus haut parce que le
  // bloc « Signature » en a besoin avant : une seule source, pas deux listes de
  // rôles à faire diverger.
  const canEdit = canSign;

  return (
    <div className="space-y-6 max-w-5xl">
      <RecordRecentVisit
        kind="session"
        id={session.id}
        title={session.name ?? session.code}
        subtitle={`${session.code} · ${start.toLocaleDateString('fr-FR')}`}
        href={`/app/sessions/${session.id}`}
      />
      {/* Refonte UI V2 — Header hiérarchisé sticky + NextActionHero, tous
          deux pilotés par sessionStage() (source unique). Remplace l'ancien
          PageHeader + actions toolbar. Commit ui-b 2026-06-05. */}
      <SessionHeaderBar
        title={
          canEdit ? (
            <SessionTitleInline
              sessionId={session.id}
              value={session.name}
              displayClassName="block min-w-0"
            />
          ) : (
            session.name ?? '(session sans nom)'
          )
        }
        code={session.code}
        status={session.status}
        startDate={session.startDate}
        endDate={session.endDate}
        durationHours={session.product?.durationHours ?? null}
        pricePerLearner={pricePerLearnerNum}
        priceSlot={
          canEdit ? (
            <SessionPriceInline sessionId={session.id} value={pricePerLearnerNum} />
          ) : undefined
        }
        locationLabel={locationLabel}
        participantsCount={session.participants.length}
        backLink={
          <div className="flex items-center gap-3">
            <BackToListLink fallbackHref="/app/sessions" label="Retour aux sessions" />
            <SessionCompletenessBadge completeness={sessionCompleteness} />
          </div>
        }
        actionsSecondary={
          <>
            {canEdit && (
              <EditSessionDetailsDialog
                sessionId={session.id}
                initial={{
                  name: session.name,
                  startDate: session.startDate,
                  endDate: session.endDate,
                  capacityMin: session.capacityMin,
                  capacityMax: session.capacityMax,
                  modality: session.modality,
                  pricePerLearner:
                    session.pricePerLearner === null ? null : Number(session.pricePerLearner),
                  language: session.language,
                  internalNotes: session.internalNotes,
                }}
              />
            )}
            {/* Phase 15 Lot 2 — <DocsButton>/<DocDockDrawer> SUPPRIMÉ : ses
                actions uniques (dispatchGenerateMissing/dispatchGenerateDoc) sont
                réembarquées dans l'onglet « Avant » (TabAvant). Le moteur (server
                actions) est conservé, seule l'UI du drawer disparaît. */}
            {/* Phase 15 Lot 3 — le toggle de synchro agenda (variante en-tête) est
                RETIRÉ : sa maison unique est désormais l'onglet Agenda (TabAgenda).
                « 1 surface = 1 endroit ». Le moteur (syncSessionCalendarAction,
                Phase 14) est conservé et appelé depuis l'onglet Agenda. */}
            {/* Hub Paramètres — ouvre <SettingsDrawer> (commit ui-e3).
                Remplace le <details> "Paramètres avancés" en bas de page. */}
            <SettingsButton>
              <SettingsDrawerSection
                title="Tâches session"
                anchorId="section-tasks"
                icon={<ListChecks className="h-3 w-3" aria-hidden="true" />}
              >
                <SessionTasksPanel sessionId={session.id} tenantId={user.tenantId} />
              </SettingsDrawerSection>

              <SettingsDrawerSection
                title="Formateurs"
                anchorId="section-formateurs"
                icon={<Users className="h-3 w-3" aria-hidden="true" />}
              >
                {session.trainers.length === 0 ? (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-orange-700">
                      <AlertCircle className="inline h-4 w-4 mr-1 align-text-bottom" aria-hidden="true" />
                      Aucun formateur rattaché. Indispensable pour générer les docs Qualiopi.
                    </p>
                    <SessionTrainerPicker sessionId={session.id} setAsPrimary />
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border">
                      {session.trainers.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-2">
                          <PrimaryTrainerToggle
                            sessionId={session.id}
                            personId={t.person.id}
                            personName={`${t.person.firstName} ${t.person.lastName}`}
                            isPrimary={t.isPrimary}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm truncate">
                              {t.person.firstName} {t.person.lastName}
                            </span>
                          </div>
                          {t.isPrimary && (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded shrink-0">
                              Principal
                            </span>
                          )}
                          <RemoveTrainerButton
                            sessionId={session.id}
                            personId={t.person.id}
                            personName={`${t.person.firstName} ${t.person.lastName}`}
                          />
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">Ajouter un autre formateur :</p>
                      <SessionTrainerPicker sessionId={session.id} setAsPrimary={false} />
                    </div>
                  </>
                )}
              </SettingsDrawerSection>

              <SettingsDrawerSection
                title="Lieu de formation"
                anchorId="section-lieu"
                icon={<MapPin className="h-3 w-3" aria-hidden="true" />}
              >
                {session.location ? (
                  <div className="space-y-3">
                    <div className="text-sm">
                      {/* Raison sociale en tête : c'est elle que l'AGEFICE
                          contrôle sur la feuille d'émargement. */}
                      {session.location.legalName ? (
                        <div className="font-medium">{session.location.legalName}</div>
                      ) : null}
                      <div
                        className={
                          session.location.legalName
                            ? 'text-muted-foreground text-xs'
                            : 'font-medium'
                        }
                      >
                        {session.location.name}
                      </div>
                      {(() => {
                        const addr = session.location.address as
                          | { street?: string; postalCode?: string; city?: string }
                          | null;
                        if (!addr) return null;
                        return (
                          <div className="text-muted-foreground text-xs mt-1">
                            {[addr.street, [addr.postalCode, addr.city].filter(Boolean).join(' ')]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="pt-2 border-t border-border/60">
                      <p className="text-xs text-muted-foreground mb-2">Changer pour un autre lieu :</p>
                      <SessionLocationPicker
                        sessionId={session.id}
                        currentLocation={session.location}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-orange-700">
                      <AlertCircle className="inline h-4 w-4 mr-1 align-text-bottom" aria-hidden="true" />
                      {session.modality === 'DISTANCIEL'
                        ? 'Aucun lieu défini (distanciel — facultatif).'
                        : 'Aucun lieu défini. Indispensable en présentiel.'}
                    </p>
                    <SessionLocationPicker sessionId={session.id} />
                  </div>
                )}
              </SettingsDrawerSection>

              <SettingsDrawerSection
                title="Logistique (PSH + hébergement)"
                anchorId="section-logistique"
                icon={<ClipboardList className="h-3 w-3" aria-hidden="true" />}
              >
                <SessionLogisticsEditor
                  sessionId={session.id}
                  initial={{
                    needsTrainerLodging: session.needsTrainerLodging,
                    trainerLodgingPlace: session.trainerLodgingPlace,
                    trainerLodgingDates: session.trainerLodgingDates,
                    hasDisabledLearner: session.hasDisabledLearner,
                    disabilityAdaptations: session.disabilityAdaptations,
                  }}
                />
              </SettingsDrawerSection>

              {/* Phase 15 Lot 3 — section « Agenda / Rappels » RETIRÉE des Paramètres :
                  le toggle de synchro agenda vivait ici en doublon. Sa maison unique
                  est désormais l'onglet Agenda (TabAgenda). Moteur Phase 14 inchangé. */}

              <SettingsDrawerSection
                title="Notes internes"
                icon={<StickyNote className="h-3 w-3" aria-hidden="true" />}
              >
                <SessionNotesInline
                  sessionId={session.id}
                  value={session.internalNotes}
                  disabled={!canEdit}
                />
              </SettingsDrawerSection>

              <SettingsDrawerSection
                title="Satisfaction (post-formation)"
                icon={<SmilePlus className="h-3 w-3" aria-hidden="true" />}
              >
                <SessionSatisfactionPanel sessionId={session.id} tenantId={user.tenantId} />
              </SettingsDrawerSection>
            </SettingsButton>
            {/* GenerateClosurePackButton toujours accessible en actionsSecondary
                (P1 conformité ui-e3, Laurent test 2026-06-08) : les docs
                niveau session (GRILLE_OBS_SESSION ind 11 + SATISFACTION_SESSION
                ind 30) ne sont PAS dans DispatchableDocType — donc ingénérables
                à l'unité. Sans cette affordance bulk visible, ces 2 docs
                deviennent un trou conformité Qualiopi. Conditionné : on évite
                le doublon quand sessionStage l'élit déjà en actionPrimary. */}
            {canWrite
              && session.participants.length > 0
              && stage.cta?.kind !== 'generate_pack' && (
              <GenerateClosurePackButton
                sessionId={session.id}
                participantCount={session.participants.length}
                blockers={sessionCompleteness.generationBlockers}
              />
            )}
            {session.status === 'IN_PROGRESS' && (
              <MarkCompletedButton
                sessionId={session.id}
                participantCount={session.participants.length}
              />
            )}
          </>
        }
        actionPrimary={
          /* Action primaire — toujours pilotée par sessionStage.cta.
             L'exception "vrai bouton vs anchor" porte sur l'IDENTITÉ du CTA
             (cta.kind), pas sur status === COMPLETED en bloc. Sinon une
             session COMPLETED avec pack 10/10 afficherait encore "Générer
             le pack" alors que sessionStage l'a fait passer à étape 5. */
          stage.cta && canWrite ? (
            stage.cta.kind === 'generate_pack' ? (
              <GenerateClosurePackButton
                sessionId={session.id}
                participantCount={session.participants.length}
                blockers={sessionCompleteness.generationBlockers}
              />
            ) : (
              <StageCtaLink
                href={stage.cta.href}
                className={
                  stage.cta.primary
                    ? 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm'
                    : 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors'
                }
              >
                {stage.cta.label}
              </StageCtaLink>
            )
          ) : null
        }
        kebab={
          <SessionActionsMenu>
            <DuplicateSessionButton
              sessionId={session.id}
              sessionCode={session.code}
              sourceStartDate={session.startDate}
            />
            <DeleteSessionButton
              sessionId={session.id}
              sessionCode={session.code}
              participantCount={session.participants.length}
            />
          </SessionActionsMenu>
        }
      />

      {/* NextActionHero — point focal qui re-énonce la prochaine action.
          Lit la MÊME sessionStage.cta que le bouton primaire de la sticky
          bar (re-atteignable après scroll). Si cta.kind='generate_pack',
          on injecte le vrai <GenerateClosurePackButton> via primaryActionSlot. */}
      <NextActionHero
        stage={stage}
        canWrite={canWrite}
        primaryActionSlot={
          stage.cta?.kind === 'generate_pack' ? (
            <GenerateClosurePackButton
              sessionId={session.id}
              participantCount={session.participants.length}
              blockers={sessionCompleteness.generationBlockers}
            />
          ) : null
        }
      />

      {/* ════════════════════════════════════════════════════════════════
          Phase 15 Lot 1 — Coquille à 5 onglets (?tab=).
          ENVELOPPEMENT SEULEMENT : les blocs métier EXISTANTS sont regroupés
          tels quels en 5 panneaux passés en props à <SessionTabs> ; AUCUN
          contenu n'est modifié, AUCUN composant supprimé. Le réembarquement
          propre + la suppression des doublons = Lot 2.

          En-tête persistant (RecordRecentVisit + SessionHeaderBar +
          NextActionHero) reste AU-DESSUS des onglets (allègement fin = Lot 4).
          SessionEvaluationBlock + StepFacturation restent HORS onglets
          (déféré, cf. 15-CONTEXT §deferred) — conservés en bas de page.
          ════════════════════════════════════════════════════════════════ */}
      <SessionTabs
        defaultTab={coerceTab(sp.tab)}
        session={
          <div className="space-y-6 pt-4">
            <SessionEnrollmentBlock
              sessionId={session.id}
              etat={enrollmentLinkState}
              url={enrollmentUrl}
              participantCount={session.participants.length}
              pendingCount={pendingEnrollmentCount}
              capacityMax={session.capacityMax}
              canWrite={canWrite}
            />
            <SessionEnrollmentRequests
              requests={enrollmentRequestRows}
              canWrite={canWrite}
            />
            {/* Status select + dates editor — gardés sous le hero pour édition
                rapide sans ouvrir la modale Modifier. Discrets.
                Anchor #section-status : cible du CTA sessionStage "Marquer comme
                terminée" quand endDate < now et status pré-COMPLETED. */}
            <div id="section-status" className="flex items-center gap-2 flex-wrap text-xs scroll-mt-20">
              <SessionStatusSelect sessionId={session.id} currentStatus={session.status} />
              <SessionDatesEditor
                sessionId={session.id}
                initialStart={session.startDate}
                initialEnd={session.endDate}
              />
            </div>

            {/* SessionWorkflowTimeline conservé ICI (Lot 1 = enveloppement) : il
                porte la barre conformité Qualiopi (9 indicateurs) + l'étape
                Création + la liste nominative des inscrits. La décomposition fine
                de la timeline (étapes réparties par onglet) = Lot 2. */}
            <div id="section-formateurs" className="scroll-mt-20" />
            <SessionWorkflowTimeline
              sessionStatus={session.status}
              prep={preparationStatus}
              closure={closureStatus}
              canLaunchPack={sessionCompleteness.ready}
              participantsCount={session.participants.length}
              primaryTrainerName={primaryTrainerName}
              productAiDraftPending={Boolean(session.product?.aiDraftedAt)}
              canWrite={canWrite}
            >
              <div id="step-1" className="scroll-mt-20" />
              <StepCreation
                state={stage.stagesState[1] === 'active' ? 'active' : stage.stagesState[1] === 'done' ? 'done' : 'todo'}
                expanded={stage.stagesState[1] === 'active'}
                blockerMessage={stage.status === 'blocked' && stage.current === 1 ? stage.blocker : undefined}
                productId={session.product?.id ?? null}
                productLabel={productLabel}
                productCode={productCode}
                productAiDraftedAt={session.product?.aiDraftedAt ?? null}
                productProgrammePdfId={programmeDocId ?? null}
                durationHours={productDuration}
                startDate={session.startDate}
                endDate={session.endDate}
                locationLabel={locationLabel}
                primaryTrainerName={primaryTrainerName}
                coTrainerCount={coTrainerCount}
                participantsCount={session.participants.length}
                pricePerLearner={pricePerLearnerNum}
                actions={
                  <>
                    {canEdit && (
                      <EditSessionDetailsDialog
                        sessionId={session.id}
                        initial={{
                          name: session.name,
                          startDate: session.startDate,
                          endDate: session.endDate,
                          capacityMin: session.capacityMin,
                          capacityMax: session.capacityMax,
                          modality: session.modality,
                          pricePerLearner:
                            session.pricePerLearner === null ? null : Number(session.pricePerLearner),
                          language: session.language,
                          internalNotes: session.internalNotes,
                        }}
                      />
                    )}
                    {canWrite && (
                      <AddParticipantDialog
                        sessionId={session.id}
                        defaultPrice={session.pricePerLearner === null ? null : Number(session.pricePerLearner)}
                        excludePersonIds={session.participants.map((p) => p.personId)}
                      />
                    )}
                  </>
                }
              />

              {/* Liste nominative des inscrits + désinscription. Avant : seulement un
                  compteur "N apprenants" + la matrice 14 colonnes où le menu d'actions
                  était hors écran. Frustration Laurent 15/06. */}
              <div className="mt-3">
                <SessionParticipantsList
                  canManage={canWrite}
                  participants={matrixParticipants.map((p) => {
                    const raw = session.participants.find((sp) => sp.id === p.id);
                    return {
                      id: p.id,
                      personId: p.personId,
                      fullName: p.fullName,
                      sponsorOrgLabel: p.sponsorOrgLabel,
                      docCount: docCompletionByParticipant.get(p.id) ?? 0,
                      docTotal: PERSONAL_DOC_TOTAL,
                      // Édition inscription (audit 2026-08-12)
                      priceHT: raw ? Number(raw.priceHT) : undefined,
                      enrollmentStatus: raw?.enrollmentStatus,
                      financingMode: p.financingMode,
                      financingRequestDate: raw?.financingRequestDate ?? null,
                    };
                  })}
                />
              </div>
            </SessionWorkflowTimeline>

            {/* <ParticipantDocsCards> supprimé (commit ui-e3 #5) — le DocDockDrawer
                porte la même affordance "clic génère ce doc".
                L'anchor #section-participants est conservé en ghost pour les
                CTAs sessionStage qui pointent ici ("Ajouter un apprenant"). */}
            <div id="section-participants" className="scroll-mt-20" />
          </div>
        }
        avant={
          <div className="space-y-6 pt-4">
            {/* Vue d'ensemble préparation (badge X/Y + CTA bulk « Lancer la
                préparation »). Lignes docs = STATUT seulement (pas d'action par
                doc) → pas de doublon de surface avec TabAvant. */}
            <div id="step-2" className="scroll-mt-20" />
            <PreparationPedagogiqueBlock
              sessionId={session.id}
              initialStatus={preparationStatus}
              canWrite={canWrite}
              isActive={stage.stagesState[2] === 'active'}
              expanded={stage.stagesState[2] === 'active'}
              programmePdfHref={programmeDocId ? `/api/documents/${programmeDocId}` : undefined}
              deroulePdfHref={derouleProductDocId ? `/api/documents/${derouleProductDocId}` : undefined}
              checklistPdfHref={checklistDocId ? `/api/documents/${checklistDocId}` : undefined}
            />

            {/* Quick 260817-mm0 — convention UNIQUE par entreprise commanditaire
                (règle 12/08 : jamais une par salarié). Ne s'affiche que si la
                session compte au moins un commanditaire personne morale. */}
            {canWrite && (
              <ConventionEntreprisePanel
                sessionId={session.id}
                groupes={conventionGroupes}
              />
            )}

            {/* Phase 15 Lot 2 — actions par doc/stagiaire réembarquées depuis le
                drawer supprimé : « Tout générer » + 1 ligne par doc (Convention/
                Convocation/AGEFICE/Analyse besoin/Assiduité AGEFICE). */}
            <TabAvant
              sessionId={session.id}
              items={avantItems}
              canGenerate={canWrite}
              dropZoneParticipants={dropZoneParticipants}
              avantGroups={avantGroups}
              vueSignature={vueSignatureAvant}
            />
          </div>
        }
        apres={
          <TabApres
            sessionId={session.id}
            productId={session.product?.id ?? null}
            canWrite={canWrite}
            sessionDocs={apresSessionDocs}
            closureItems={closureItems}
            dropZoneParticipants={dropZoneParticipants}
            pendantGroups={pendantGroups}
            apresGroups={apresGroups}
            vueSignature={vueSignatureApres}
            batch={
              latestBatch
                ? {
                    status: latestBatch.status,
                    totalDocs: latestBatch.totalDocs,
                    doneDocs: latestBatch.doneDocs,
                    errorDocs: latestBatch.errorDocs,
                  }
                : null
            }
            packCta={
              <GenerateClosurePackButton
                sessionId={session.id}
                participantCount={session.participants.length}
                blockers={sessionCompleteness.generationBlockers}
              />
            }
            pendantBlock={
              <>
                <div id="step-3" className="scroll-mt-20" />
                <StepPendantFormation
                  state={stage.stagesState[3] === 'active' ? 'active' : stage.stagesState[3] === 'done' ? 'done' : 'inactive'}
                  expanded={stage.stagesState[3] === 'active'}
                  participantsCount={session.participants.length}
                  emargementsGenerated={closureStatus.emargements}
                  totalSlots={totalSlots}
                  signedSlots={signedSlots}
                  startDateISO={session.startDate.toISOString()}
                  endDateISO={session.endDate.toISOString()}
                />
              </>
            }
            closureBlock={
              <>
                <div id="step-4" className="scroll-mt-20" />
                <ClosureFormationBlock
                  sessionId={session.id}
                  status={closureStatus}
                  isActive={stage.stagesState[4] === 'active'}
                  expanded={stage.stagesState[4] === 'active'}
                  programmeProductDocId={programmeDocId ?? null}
                  grilleObsSessionDocId={grilleSessionDocId ?? null}
                  bilanSatisfactionDocId={satisfactionSessionDocId ?? null}
                />
              </>
            }
          />
        }
        docs={
          <TabTousDocuments
            sessionId={session.id}
            userRole={user.role}
            hasAgeficeParticipant={hasAgeficeParticipant}
            participants={matrixParticipants}
            productDocs={productDocsMap}
            sessionDocs={sessionDocsMap}
            flags={matrixFlags}
            stubCount={stubAssetIds.size}
            zipBatchId={latestBatch && latestBatch.doneDocs > 0 ? latestBatch.id : null}
          />
        }
        agenda={
          <TabAgenda
            sessionId={session.id}
            isPastSession={isPastSession}
            slots={agendaSlots}
            canEdit={canEdit}
          />
        }
      />

      {/* ════════════════════════════════════════════════════════════════
          HORS flux onglets (déféré, cf. 15-CONTEXT §deferred) — conservés en
          bas de page, ni supprimés ni modifiés (Lot 1). Évaluation/stats +
          Facturation seront rebranchés dans un 2ᵉ temps.
          ════════════════════════════════════════════════════════════════ */}
      <SessionEvaluationBlock evalStats={sessionEvalStats} />

      <div id="step-5" className="scroll-mt-20" />
      <StepFacturation
        state={stage.stagesState[5] === 'active' ? 'active' : stage.stagesState[5] === 'done' ? 'done' : 'todo'}
        expanded={stage.stagesState[5] === 'active'}
        invoices={timelineInvoiceRows}
        caTotalHT={caTotalHT}
        opcoSubmissionId={latestOpcoSubmission?.id ?? null}
        sessionId={session.id}
        billingGroups={billingGroups}
        canInvoice={canInvoice}
      />
    </div>
  );
}
