import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Euro, Users, Briefcase, ClipboardCheck, Check, Minus, Package, ChevronRight, FileText, AlertCircle, Plus, ExternalLink, ClipboardList, MapPin, ListChecks, StickyNote, SmilePlus } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { formatFunderCode } from '@/lib/funder-codes';
import { ParticipantActionsMenu } from '@/components/sessions/participant-actions-menu';
import { GenerateClosurePackButton } from '@/components/sessions/generate-closure-pack-button';
import { SessionCompletenessBadge } from '@/components/sessions/session-completeness-badge';
import { getSessionCompleteness } from '@/lib/sessions/completeness';
import { PreparationPedagogiqueBlock } from '@/components/sessions/preparation-pedagogique-block';
import { ClosureFormationBlock } from '@/components/sessions/closure-formation-block';
import { SessionWorkflowTimeline } from '@/components/sessions/session-workflow-timeline';
import { StepCreation } from '@/components/sessions/step-creation';
import { StepPendantFormation } from '@/components/sessions/step-pendant-formation';
import { StepFacturation } from '@/components/sessions/step-facturation';
import { DocsButton } from '@/components/sessions/docs-button';
import { buildDocDockItems } from '@/lib/sessions/doc-dock-items';
import { SessionHeaderBar } from '@/components/sessions/session-header-bar';
import { NextActionHero } from '@/components/sessions/next-action-hero';
import { sessionStage } from '@/lib/sessions/session-stage';
import { getSessionClosureStatus } from '@/server/actions/closure-status';
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
import { CreateSponsorInvoiceButton } from '@/components/invoices/create-sponsor-invoice-button';
import { AddParticipantDialog } from '@/components/sessions/add-participant-dialog';
import { EditParticipantButton } from '@/components/sessions/edit-participant-button';
import { DeleteSessionButton } from '@/components/sessions/delete-session-button';
import { DuplicateSessionButton } from '@/components/sessions/duplicate-session-button';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { RecordRecentVisit } from '@/components/command-palette/record-recent-visit';
import { ParticipantDocMatrix } from '@/components/sessions/qualiopi-matrix/participant-doc-matrix';
import { SessionOnlyDocsBlock } from '@/components/sessions/qualiopi-matrix/session-only-docs-block';
import { TresoStatusBlock } from '@/components/sessions/treso-status-block';
import { SessionTasksPanel } from '@/components/sessions/session-tasks-panel';
import { SessionDatesEditor } from '@/components/sessions/session-dates-editor';
import { SessionTitleInline } from '@/components/sessions/session-title-inline';
import { SessionPriceInline } from '@/components/sessions/session-price-inline';
import { SessionNotesInline } from '@/components/sessions/session-notes-inline';
import { SettingsButton } from '@/components/sessions/settings-button';
import { SettingsDrawerSection } from '@/components/sessions/settings-drawer';

const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'];

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

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
              // BUG-11 — pour permettre AGEFICE même si sponsorOrg n'est pas
              // AGEFICE : on lit les LegalLinks pour détecter EI_SELF (TNS)
              // ou un autre rattachement à une org AGEFICE.
              legalLinks: {
                select: {
                  role: true,
                  organization: { select: { opcoCode: true } },
                },
              },
            },
          },
          sponsorOrg: { select: { id: true, legalName: true, brandName: true, legalForm: true, opcoCode: true } },
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
          where: { tenantId: user.tenantId, sessionId: session.id, participantId: { in: sessionParticipantIds } },
          select: { id: true, type: true, participantId: true },
        }),
        prisma.pedagogicalAsset.findMany({
          where: { tenantId: user.tenantId, sessionId: session.id, participantId: { in: sessionParticipantIds }, pdfUrl: { not: null } },
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
            type: { in: ['GRILLE_OBS_SESSION', 'CHECKLIST_FORMATION', 'SATISFACTION_SESSION'] },
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
  for (const a of sessionAssets) {
    if (!a.participantId) continue;
    const m = assetsByParticipant.get(a.participantId) ?? new Map();
    m.set(a.kind, a.id);
    assetsByParticipant.set(a.participantId, m);
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
    inner.set(a.kind as string, { id: a.id });
  }

  // Construit le tableau matrixParticipants pour ParticipantDocMatrix.
  const matrixParticipants = session.participants.map((p) => ({
    id: p.id,
    personId: p.person.id,
    fullName: `${p.person.firstName} ${p.person.lastName.toUpperCase()}`,
    sponsorOrgId: p.sponsorOrg.id,
    sponsorOrgLabel: p.sponsorOrg.brandName ?? p.sponsorOrg.legalName,
    sponsorOrgOpcoCode: p.sponsorOrg.opcoCode,
    financingMode: p.financingMode as string | null,
    docStatus: (p.docStatus as Record<string, unknown> | null) ?? null,
    // BUG-11 — élargi : participant éligible AGEFICE si SOIT son sponsor est
    // AGEFICE, SOIT il a un LegalLink EI_SELF (auto-entrepreneur TNS), SOIT
    // il a une autre org rattachée avec opcoCode=AGEFICE. Permet de
    // générer le dossier AGEFICE depuis la matrice même si le sponsor de la
    // session est un OPCO classique (cas Florent HAUSSWIRTH / Imagimmo OPCO_EP
    // qui est aussi auto-entrepreneur AGEFICE en parallèle).
    isAgefice:
      p.sponsorOrg.opcoCode === 'AGEFICE' ||
      p.person.legalLinks.some(
        (l) =>
          l.role === 'EI_SELF' || l.organization?.opcoCode === 'AGEFICE',
      ),
    participantDocs: participantDocsByPid.get(p.id) ?? new Map<string, { id: string }>(),
    pedagogicalAssets: pedAssetsByPid.get(p.id) ?? new Map<string, { id: string }>(),
  }));

  const hasAgeficeParticipant = matrixParticipants.some((p) => p.isAgefice);

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
    modality: session.modality,
    trainers: session.trainers.map((t) => ({ isPrimary: t.isPrimary })),
    product: session.product
      ? { programMd: session.product.programMd, aiDraftedAt: session.product.aiDraftedAt }
      : null,
    participantsCount: session.participants.length,
    productId: session.product?.id ?? null,
  });

  // Quick task 260525-kl5 — état agrégé des 6 catégories de docs de préparation
  // pédagogique pour le bloc PreparationPedagogiqueBlock. La server action est
  // tenant-scopée via validateRequest (déjà résolue ci-dessus).
  const preparationStatus = await getSessionPreparationStatus(session.id);
  const closureStatus = await getSessionClosureStatus(session.id);

  // ─── Données complémentaires pour la timeline 5 étapes ─────────────────
  // SessionSlot : pour step 3 "Pendant la formation" (créneaux + émargements signés)
  // Invoices détaillées : pour step 5 (table compacte CA / facturé / encaissé)
  const [sessionSlotsAgg, timelineInvoices, latestOpcoSubmission] = await Promise.all([
    prisma.sessionSlot.findMany({
      where: { sessionId: session.id, session: { tenantId: user.tenantId } },
      select: {
        id: true,
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

  const primaryTrainer = session.trainers.find((t) => t.isPrimary) ?? null;
  const primaryTrainerName = primaryTrainer
    ? `${primaryTrainer.person.firstName} ${primaryTrainer.person.lastName}`
    : null;
  const coTrainerCount = session.trainers.filter((t) => !t.isPrimary).length;
  const pricePerLearnerNum = session.pricePerLearner === null ? null : Number(session.pricePerLearner);
  const caTotalHT = (pricePerLearnerNum ?? 0) * session.participants.length;

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

  // 🪄 Items du DocDock — bouton magique bas-droite pour générer/télécharger
  // n'importe quel doc pré-formation Qualiopi en 1 clic. Résout Laurent
  // 2026-06-04 : "il manque le doc AGEFICE SES-0094, je ne vois pas comment
  // la générer · trouver les docs c'est compliqué".
  const docDockItems = buildDocDockItems({
    programmeProductDocId,
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

  // Source UNIQUE pour l'étape courante — header + hero + timeline + drawer
  // lisent tous depuis ici (commit ui-a 2026-06-05).
  const stage = sessionStage({
    status: session.status,
    startDate: session.startDate,
    endDate: session.endDate,
    participantsCount: session.participants.length,
    primaryTrainerName,
    productAiDraftPending: Boolean(session.product?.aiDraftedAt),
    prep: preparationStatus,
    closure: closureStatus,
  });
  const canWrite = ['ADMIN', 'MANAGER', 'COMMERCIAL'].includes(user.role);
  // canEdit : seuls ADMIN/MANAGER éditent les champs structurants (titre,
  // tarif, notes, capacités, dates). COMMERCIAL peut écrire (inscrire,
  // générer docs) mais pas modifier la structure de la session.
  const canEdit = ['ADMIN', 'MANAGER'].includes(user.role);

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
            {/* Hub Documents — ouvre <DocDockDrawer> avec compteur manquants */}
            <DocsButton
              sessionId={session.id}
              items={docDockItems}
              canGenerate={canWrite}
            />
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
                      <div className="font-medium">{session.location.name}</div>
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
                      <SessionLocationPicker sessionId={session.id} />
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
                blockers={sessionCompleteness.blockers}
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
                blockers={sessionCompleteness.blockers}
              />
            ) : (
              <a
                href={stage.cta.href}
                className={
                  stage.cta.primary
                    ? 'inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm'
                    : 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors'
                }
              >
                {stage.cta.label}
              </a>
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
              blockers={sessionCompleteness.blockers}
            />
          ) : null
        }
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

      {/* Auto-refresh + progress bar visible quand un pack closure tourne */}
      {latestBatch && (
        <BatchProgressAutoRefresh
          status={latestBatch.status}
          totalDocs={latestBatch.totalDocs}
          doneDocs={latestBatch.doneDocs}
          errorDocs={latestBatch.errorDocs}
        />
      )}

      {/* SessionTasksPanel migré dans le <SettingsDrawer> (commit ui-e3).
          Le badge tasks reste accessible via le bouton "Paramètres" du
          SessionHeaderBar. */}

      {/* Bloc "Dossier Qualiopi %" supprimé — redondant avec la barre conformité
          Qualiopi du Hero (9 indicateurs) qui couvre déjà cette info, et son
          calcul X/N était bugué après refonte (Laurent 2026-06-04 : "il dit 0/3
          alors que les docs ont été générés"). */}

      {/* ════════════════════════════════════════════════════════════════
          Refonte UX 2026-06-04 — Timeline 5 étapes process Qualiopi
          Remplace : SessionOnlyDocsBlock + PreparationPedagogiqueBlock +
          ClosureFormationBlock + TresoStatusBlock + SessionInvoicesBlock
          (qui étaient juxtaposés sans cohérence). Tout est désormais sous
          un axe linéaire unique : Création → Préparation → Pendant →
          Pack fin → Facturation. Avec Hero "Prochaine étape" intelligent
          et barre conformité Qualiopi en haut.
          ════════════════════════════════════════════════════════════════ */}
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
          productProgrammePdfId={programmeProductDocId ?? null}
          canValidateAi={canEdit}
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
                  defaultPrice={Number(session.pricePerLearner ?? 0)}
                  excludePersonIds={session.participants.map((p) => p.personId)}
                />
              )}
            </>
          }
        />

        <div id="step-2" className="scroll-mt-20" />
        <PreparationPedagogiqueBlock
          sessionId={session.id}
          initialStatus={preparationStatus}
          canWrite={canWrite}
          isActive={stage.stagesState[2] === 'active'}
          expanded={stage.stagesState[2] === 'active'}
          programmePdfHref={programmeProductDocId ? `/api/documents/${programmeProductDocId}` : undefined}
          deroulePdfHref={derouleProductDocId ? `/api/documents/${derouleProductDocId}` : undefined}
          checklistPdfHref={checklistDocId ? `/api/documents/${checklistDocId}` : undefined}
        />

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

        <div id="step-4" className="scroll-mt-20" />
        <ClosureFormationBlock
          sessionId={session.id}
          status={closureStatus}
          isActive={stage.stagesState[4] === 'active'}
          expanded={stage.stagesState[4] === 'active'}
          programmeProductDocId={programmeProductDocId ?? null}
        />

        <div id="step-5" className="scroll-mt-20" />
        <StepFacturation
          state={stage.stagesState[5] === 'active' ? 'active' : stage.stagesState[5] === 'done' ? 'done' : 'todo'}
          expanded={stage.stagesState[5] === 'active'}
          invoices={timelineInvoiceRows}
          caTotalHT={caTotalHT}
          opcoSubmissionId={latestOpcoSubmission?.id ?? null}
        />
      </SessionWorkflowTimeline>

      {/* A5 — SessionOnlyDocsBlock remonté en sidebar de la page. Couvre les
          4 docs niveau session avec génération à l'unité : Déroulé (produit),
          Grille obs session (ind. 11 🔴), Checklist formation (ind. 17), et
          Bilan satisfaction session (ind. 30 — 4ᵉ carte A5). Sans ce bloc,
          ces 2 docs majeurs ne sont régénérables qu'en relançant le pack
          complet — trou conformité identifié par le plan. Lot B le
          déplacera en onglet Clôture, ici interim. */}
      {canWrite && (
        <SessionOnlyDocsBlock
          sessionId={session.id}
          productId={session.product?.id ?? null}
          deroulePdfRef={derouleProductDocId ? { id: derouleProductDocId } : undefined}
          grilleObsPdfRef={grilleSessionDocId ? { id: grilleSessionDocId } : undefined}
          checklistPdfRef={checklistDocId ? { id: checklistDocId } : undefined}
          satisfactionPdfRef={satisfactionSessionDocId ? { id: satisfactionSessionDocId } : undefined}
          grilleObsAssetCount={grilleObsAssetCount}
          canWrite={canWrite}
        />
      )}

      {/* <ParticipantDocsCards> supprimé (commit ui-e3 #5) — le DocDockDrawer
          porte la même affordance "clic génère ce doc" (smoke gate
          doc-dock-drawer.smoke.test.ts : 6 tests verts l'attestent).
          L'anchor #section-participants est conservé en ghost pour les
          CTAs sessionStage qui pointent ici ("Ajouter un apprenant"). */}
      <div id="section-participants" className="scroll-mt-20" />

      {/* <details> "Paramètres avancés" supprimé (commit ui-e3) — tout le
          contenu (Formateurs/Lieu/Logistique/Notes/Satisfaction/Tasks) vit
          désormais dans <SettingsDrawer>, ouvert via le bouton "Paramètres"
          du SessionHeaderBar (à côté de "Documents"). Les CTAs sessionStage
          pointant vers #section-formateurs/lieu/logistique ouvrent le drawer
          automatiquement via hash-detection (SettingsButton useEffect). */}

      {/* Vue tableau Qualiopi — matrice ParticipantDocMatrix réintroduite ici
          (commit ui-d). Cible du lien "Vue tableau" du DocDockDrawer footer.
          Repliée par défaut pour ne pas polluer la vue principale — ouverte
          via le drawer ou un anchor direct. */}
      <details id="section-doc-matrix" className="group rounded-2xl border border-border bg-white overflow-hidden scroll-mt-20">
        <summary className="cursor-pointer list-none p-4 flex items-center gap-2 hover:bg-muted/20 transition-colors [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Vue tableau Qualiopi · matrice apprenant × document
          </span>
        </summary>
        <div className="border-t border-border p-4 sm:p-5 bg-muted/10">
          <ParticipantDocMatrix
            sessionId={session.id}
            userRole={user.role}
            hasAgeficeParticipant={hasAgeficeParticipant}
            participants={matrixParticipants}
            productDocs={productDocsMap}
            sessionDocs={sessionDocsMap}
          />
        </div>
      </details>

      {/* DocDock floating SUPPRIMÉ (commit ui-d). Remplacé par <DocsButton>
          dans la barre actions du SessionHeaderBar qui ouvre <DocDockDrawer>
          (drawer side panel z-60 avec backdrop / ESC / scroll-lock / focus-trap).
          Fichier doc-dock.tsx encore présent — sera supprimé en commit ui-e. */}
    </div>
  );
}
