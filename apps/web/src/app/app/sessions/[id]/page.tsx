import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Euro, Users, Briefcase, ClipboardCheck, Check, Minus, Package, ChevronRight, FileText, AlertCircle, Plus } from 'lucide-react';
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
import { SessionOnlyDocsBlock } from '@/components/sessions/qualiopi-matrix/session-only-docs-block';
import { ParticipantDocMatrix } from '@/components/sessions/qualiopi-matrix/participant-doc-matrix';
import { TresoStatusBlock } from '@/components/sessions/treso-status-block';
// Phase 11 Plan 11-09 — Cross-nav D-07 : bloc Factures sur fiche session.
import { SessionInvoicesBlock } from '@/components/sessions/session-invoices-block';
import { SessionTasksPanel } from '@/components/sessions/session-tasks-panel';
import { SessionDatesEditor } from '@/components/sessions/session-dates-editor';

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
        // grille observation consolidée (C3.i11), check-list formation (C4.i17)
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'session',
            entityId: session.id,
            type: { in: ['GRILLE_OBS_SESSION', 'CHECKLIST_FORMATION'] },
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

  return (
    <div className="space-y-6 max-w-5xl">
      <RecordRecentVisit
        kind="session"
        id={session.id}
        title={session.name ?? session.code}
        subtitle={`${session.code} · ${start.toLocaleDateString('fr-FR')}`}
        href={`/app/sessions/${session.id}`}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackToListLink fallbackHref="/app/sessions" label="Retour aux sessions" />
          <SessionCompletenessBadge completeness={sessionCompleteness} />
        </div>
        <div className="flex items-center gap-2">
          {/* Quick task 260523-oze — Bouton "Modifier" (icône Pencil) pour
              ADMIN+MANAGER : modale d'édition des 9 champs scalaires
              (name, dates, capacités, modalité, prix HT, langue, notes).
              Les autres champs (statut, lieu, formateurs, logistique) restent
              éditables individuellement depuis la fiche. */}
          {['ADMIN', 'MANAGER'].includes(user.role) && (
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

          {/* Action contextuelle selon le statut — guide l'utilisateur sur la
              "prochaine étape logique" (Marquer terminée / Voir le pack).
              Le bouton "Préparer la formation" a été retiré (quick task
              260525-kl5) : la préparation est désormais auto-déclenchée à
              la création de la session et le bloc PreparationPedagogiqueBlock
              en bas de fiche montre l'état + CTA "Compléter" si besoin. */}
          {(() => {
            switch (session.status) {
              case 'DRAFT':
              case 'PLANNED':
              case 'OPEN':
              case 'VALIDATED':
                return null;
              case 'IN_PROGRESS':
                return (
                  <MarkCompletedButton
                    sessionId={session.id}
                    participantCount={session.participants.length}
                  />
                );
              case 'COMPLETED':
                if (latestBatch) {
                  return (
                    <Link
                      href={`/app/sessions/${session.id}/closure/${latestBatch.id}` as Route}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors"
                    >
                      <Package className="h-4 w-4" /> Voir le pack
                    </Link>
                  );
                }
                return null;
              case 'CANCELLED':
              default:
                return null;
            }
          })()}

          {/* 📦 Pack fin de formation — TOUJOURS visible, c'est le bouton
              le plus utilisé de la fiche session. Le cacher dans le kebab
              cassait la mémoire musculaire ; on le garde en primaire bleu
              en permanence. Disabled si pas d'apprenant éligible. */}
          <GenerateClosurePackButton
            sessionId={session.id}
            participantCount={session.participants.length}
            blockers={sessionCompleteness.blockers}
          />

          {/* Kebab — uniquement les actions destructives ou rarement utilisées
              (dupliquer / supprimer) pour ne pas encombrer la barre d'action. */}
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
        </div>
      </div>

      <PageHeader
        title={session.name ?? '(session sans nom)'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="muted" className="font-mono">{session.code}</Badge>
            <SessionStatusSelect sessionId={session.id} currentStatus={session.status} />
            <SessionDatesEditor
              sessionId={session.id}
              initialStart={session.startDate}
              initialEnd={session.endDate}
            />
            {session.product?.durationHours ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {session.product.durationHours}h
              </span>
            ) : null}
            {Number(session.pricePerLearner ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Euro className="h-3.5 w-3.5" /> {Number(session.pricePerLearner).toFixed(0)} € total session
              </span>
            )}
          </span>
        }
      />

      {/* Auto-refresh + progress bar visible quand un pack closure tourne */}
      {latestBatch && (
        <BatchProgressAutoRefresh
          status={latestBatch.status}
          totalDocs={latestBatch.totalDocs}
          doneDocs={latestBatch.doneDocs}
          errorDocs={latestBatch.errorDocs}
        />
      )}

      {/* Tasks TODO sur cette session (signalisation 🔴 formateur, etc.) */}
      <SessionTasksPanel sessionId={session.id} tenantId={user.tenantId} />

      {/* Vue d'ensemble dossier Qualiopi — % complétion + ce qui manque le plus */}
      {totalP > 0 && (
        <section className={`rounded-2xl border-2 p-5 ${
          completionPct >= 90 ? 'border-emerald-200 bg-emerald-50/30'
          : completionPct >= 50 ? 'border-amber-200 bg-amber-50/30'
          : 'border-red-200 bg-red-50/30'
        }`}>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" /> Dossier Qualiopi
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {totalCompleted}/{totalExpected} docs ({totalP} apprenant{totalP > 1 ? 's' : ''} × {PERSONAL_DOC_TOTAL} docs)
              </p>
            </div>
            <div className="text-3xl font-bold tabular-nums" style={{
              color: completionPct >= 90 ? '#059669' : completionPct >= 50 ? '#D97706' : '#DC2626',
            }}>
              {completionPct}%
            </div>
          </div>
          <div className="h-2 rounded-full bg-white border border-border overflow-hidden mb-4">
            <div
              className={`h-full transition-all ${completionPct >= 90 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${completionPct}%` }}
            />
          </div>
          {docsMissingMost.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-foreground/70 mb-2 uppercase tracking-wide">
                ⚠ Ce qui manque le plus
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {docsMissingMost.map((d) => (
                  <li key={d.type} className="bg-white border border-border rounded-md px-3 py-2 text-xs flex items-center justify-between">
                    <span className="font-medium">{d.label}</span>
                    <span className={`font-semibold tabular-nums ${d.count === 0 ? 'text-red-600' : 'text-amber-700'}`}>
                      {d.count}/{d.total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-emerald-700 font-medium">✓ Dossier complet pour tous les apprenants</p>
          )}
        </section>
      )}

      {/* Phase 9.1 Plan 03 — Documents session (3 cards horizontales D-04 bloc séparé) */}
      <SessionOnlyDocsBlock
        sessionId={session.id}
        productId={session.productId}
        deroulePdfRef={derouleProductDocId ? { id: derouleProductDocId } : undefined}
        grilleObsPdfRef={sessionDocsMap.get('GRILLE_OBS_SESSION')}
        checklistPdfRef={sessionDocsMap.get('CHECKLIST_FORMATION')}
        grilleObsAssetCount={grilleObsAssetCount}
        canWrite={['ADMIN', 'MANAGER'].includes(user.role)}
      />

      {/* Quick task 260525-kl5 — bloc agrégé "Préparation pédagogique" :
          remplace le bouton "Préparer la formation" retiré de la barre
          d'action. Affiche l'état des 6 catégories de docs pré-formation
          (3 partagés + 3 par stagiaire) + CTA "Compléter" idempotent. */}
      <PreparationPedagogiqueBlock
        sessionId={session.id}
        initialStatus={preparationStatus}
        canWrite={['ADMIN', 'MANAGER', 'COMMERCIAL'].includes(user.role)}
      />

      {/* Phase 9.1 Plan 03 — Matrice Documents participants (CENTRAL-01 / CENTRAL-02) */}
      {/* BUG-17 anchor — completeness badge link vers cette section */}
      <div id="section-participants" className="scroll-mt-20" />
      <ParticipantDocMatrix
        sessionId={session.id}
        userRole={user.role}
        hasAgeficeParticipant={hasAgeficeParticipant}
        participants={matrixParticipants}
        productDocs={productDocsMap}
        sessionDocs={sessionDocsMap}
      />

      {/* Audit 2026-05-23 — Bloc Trésorerie : 4 statuts encaissement importés
          depuis l'Excel "Tréso AGEFICE" (source de vérité, SmartOF est faux). */}
      <TresoStatusBlock
        participants={session.participants.map((p) => ({
          id: p.id,
          personName: `${p.person.firstName} ${p.person.lastName}`,
          factureEnvoyee: p.factureEnvoyee,
          validationOpco: p.validationOpco,
          remboursementOpco: p.remboursementOpco,
          paiementClient: p.paiementClient,
        }))}
      />

      {/* Phase 11 Plan 11-09 — Cross-nav D-07 : factures liées à cette session
          (sessionId direct OU via participant.sessionId). Placé après la
          matrice docs Phase 9.1 (anti-régression CENTRAL-01/02 : matrice +
          SessionOnlyDocsBlock + Inscrits préservés). */}
      <SessionInvoicesBlock sessionId={session.id} tenantId={user.tenantId} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border gap-3">
              <h2 className="font-semibold inline-flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Inscrits ({session.participants.length})
              </h2>
              <div className="flex items-center gap-2">
                {eiCount > 0 && (
                  <Badge variant="primary">
                    {eiCount} auto-entrepreneur{eiCount > 1 ? 's' : ''}
                  </Badge>
                )}
                <CreatePersonButton
                  enrollInSessionId={session.id}
                  defaultPrice={Number(session.pricePerLearner ?? 0)}
                  buttonLabel="Nouvel apprenant"
                />
                <AddParticipantDialog
                  sessionId={session.id}
                  defaultPrice={Number(session.pricePerLearner ?? 0)}
                  excludePersonIds={session.participants.map((p) => p.personId)}
                />
              </div>
            </div>
            {session.participants.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun apprenant inscrit. Probablement non matché à l'import (homonymie ou nom tronqué dans l'export Excel).
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(() => {
                  // Groupement par sponsorOrg : 1 facture = 1 sponsor (EI = 1 ligne, SARL = N salariés)
                  const groups = new Map<string, { sponsor: typeof session.participants[number]['sponsorOrg']; participants: typeof session.participants }>();
                  for (const p of session.participants) {
                    const k = p.sponsorOrg.id;
                    if (!groups.has(k)) groups.set(k, { sponsor: p.sponsorOrg, participants: [] });
                    groups.get(k)!.participants.push(p);
                  }
                  return Array.from(groups.values()).map((g) => {
                    const isEi = SOLO_FORMS.includes(g.sponsor.legalForm);
                    const totalHT = g.participants.reduce((s, p) => s + Number(p.priceHT), 0);
                    const allInvoiced = g.participants.every((p) => p.invoiceSent);
                    return (
                      <div key={g.sponsor.id} className="p-4 hover:bg-muted/30 transition-colors">
                        {/* Header sponsor */}
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                          <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
                            <Briefcase className="h-3 w-3" />
                            <span>Sponsor :</span>
                            <Link
                              href={`/app/organisations/${g.sponsor.id}`}
                              className="text-foreground font-medium hover:text-primary"
                            >
                              {g.sponsor.legalName}
                            </Link>
                            <Badge variant={isEi ? 'primary' : 'muted'}>
                              {isEi ? 'Auto-entrepreneur' : g.sponsor.legalForm}
                            </Badge>
                            {g.sponsor.opcoCode && <Badge variant="info">{formatFunderCode(g.sponsor.opcoCode)}</Badge>}
                            {g.participants.length > 1 && (
                              <Badge variant="warning">{g.participants.length} salariés groupés</Badge>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-3">
                            <span className="text-sm font-medium tabular-nums">{totalHT.toFixed(2)} € HT</span>
                            <CreateSponsorInvoiceButton
                              sessionId={session.id}
                              sponsorOrgId={g.sponsor.id}
                              sponsorName={g.sponsor.legalName}
                              participantCount={g.participants.length}
                              totalHT={totalHT}
                              allInvoiced={allInvoiced}
                            />
                          </div>
                        </div>

                        {/* Lignes participants du groupe */}
                        <ul className="space-y-2">
                          {g.participants.map((p) => (
                            <li key={p.id} className="flex items-start gap-3 ml-2">
                              <div className="h-7 w-7 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold text-[10px] shrink-0">
                                {p.person.firstName.charAt(0)}
                                {p.person.lastName.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <Link
                                  href={`/app/apprenants/${p.person.id}`}
                                  className="text-sm font-medium hover:text-primary transition-colors"
                                >
                                  {p.person.firstName} {p.person.lastName.toUpperCase()}
                                </Link>
                                <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-2 flex-wrap">
                                  <span className="tabular-nums">{Number(p.priceHT).toFixed(2)} €</span>
                                  <span>·</span>
                                  <span>{p.enrollmentStatus}</span>
                                  {(() => {
                                    // Badge "X/11 docs prêts" — couleur progressive (rouge < 30%, ambre < 80%, vert sinon).
                                    // Permet de voir d'un coup d'œil quels apprenants nécessitent encore une génération
                                    // sans dérouler la matrice détaillée.
                                    const n = docCompletionByParticipant.get(p.id) ?? 0;
                                    const ratio = n / PERSONAL_DOC_TOTAL;
                                    const cls =
                                      ratio >= 0.8
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : ratio >= 0.3
                                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                                          : 'border-slate-200 bg-slate-50 text-slate-600';
                                    return (
                                      <Link
                                        href={`/app/apprenants/${p.person.id}?tab=documents` as Route}
                                        title={`${n}/${PERSONAL_DOC_TOTAL} documents personnels générés — cliquer pour ouvrir la fiche apprenant`}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium tabular-nums hover:bg-opacity-80 ${cls}`}
                                      >
                                        {n}/{PERSONAL_DOC_TOTAL} docs
                                      </Link>
                                    );
                                  })()}
                                  {invoiceByParticipant.get(p.id) ? (
                                    <Link
                                      href={`/app/factures/${invoiceByParticipant.get(p.id)!.id}` as Route}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-medium hover:bg-emerald-100"
                                      title="Ouvrir la facture"
                                    >
                                      Facture {invoiceByParticipant.get(p.id)!.number}
                                    </Link>
                                  ) : p.invoiceSent ? (
                                    <Badge variant="success">Facturé</Badge>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <ParticipantActionsMenu
                                  participantId={p.id}
                                  participantName={`${p.person.firstName} ${p.person.lastName}`}
                                  showAgefice={isEi || g.sponsor.opcoCode === 'AGEFICE'}
                                  initialDocs={{
                                    CONVENTION: docsByParticipant.get(p.id)?.get('CONVENTION') ?? null,
                                    PROGRAMME: docsByParticipant.get(p.id)?.get('PROGRAMME') ?? null,
                                    AGEFICE: docsByParticipant.get(p.id)?.get('AGEFICE') ?? null,
                                  }}
                                />
                                <EditParticipantButton
                                  participantId={p.id}
                                  currentPriceHT={Number(p.priceHT)}
                                  currentStatus={p.enrollmentStatus}
                                  currentFinancingRequestDate={p.financingRequestDate}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </section>

          {/* Formateurs de la session — étoile = formateur principal qui signe les docs Qualiopi */}
          {/* BUG-17 anchor — completeness badge link vers cette section.
              BUG-18 (suite) : on rend TOUJOURS la section (avec un état vide
              actionnable) pour que l'anchor #section-formateurs mène à du
              contenu visible — sinon le scroll arrive sur du vide. */}
          <section
            id="section-formateurs"
            className="rounded-2xl border border-border bg-white p-5 scroll-mt-20 target:ring-2 target:ring-primary target:ring-offset-2"
          >
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">
              Formateurs
            </h2>
            {session.trainers.length === 0 ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-orange-700">
                  <AlertCircle className="inline h-4 w-4 mr-1 align-text-bottom" aria-hidden="true" />
                  Aucun formateur rattaché. Qualiopi indic 21 — formateur identifié obligatoire pour générer les docs.
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
                      <div className="flex-1">
                        <span className="font-medium text-sm">
                          {t.person.firstName} {t.person.lastName}
                        </span>
                        {t.role && (
                          <span className="text-xs text-muted-foreground ml-2">· {t.role}</span>
                        )}
                      </div>
                      {t.isPrimary && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          Principal — signe les docs Qualiopi
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
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Ajouter un autre formateur :</p>
                  <SessionTrainerPicker sessionId={session.id} setAsPrimary={false} />
                </div>
              </>
            )}
          </section>

          {/* Lieu de formation — visible toujours pour permettre à l'anchor
              #section-lieu du blocker no_location de mener vers du contenu
              actionnable (BUG-18). */}
          <section
            id="section-lieu"
            className="rounded-2xl border border-border bg-white p-5 scroll-mt-20"
          >
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">
              Lieu de formation
            </h2>
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
                      <div className="text-muted-foreground mt-1">
                        {[addr.street, [addr.postalCode, addr.city].filter(Boolean).join(' ')]
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    );
                  })()}
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    Changer de lieu
                  </summary>
                  <div className="mt-2">
                    <SessionLocationPicker sessionId={session.id} />
                  </div>
                </details>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <p className="text-sm text-orange-700">
                  <AlertCircle className="inline h-4 w-4 mr-1 align-text-bottom" aria-hidden="true" />
                  {session.modality === 'DISTANCIEL'
                    ? 'Aucun lieu défini (distanciel — facultatif).'
                    : 'Aucun lieu de formation défini. Indispensable pour les sessions présentielles (Qualiopi indic 17).'}
                </p>
                <SessionLocationPicker sessionId={session.id} />
              </div>
            )}
          </section>

          {/* Satisfaction agrégée — calcul live à partir des satisfactions chaud individuelles */}
          <SessionSatisfactionPanel sessionId={session.id} tenantId={user.tenantId} />

          {/* Logistique session (C4.i17 Qualiopi) */}
          {/* BUG-17 anchor — completeness badge link vers cette section (tarif/dates/lieu) */}
          <div id="section-logistique" className="scroll-mt-20" />
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

          {/* Conformité Qualiopi : matrice apprenant × document.
              Repliable par défaut via <details> HTML5 (zéro JS, accessible).
              Les compteurs agrégés viennent des variables `totalCompleted`,
              `totalExpected`, `completionPct` calculés en haut du composant
              (cf docCompletionByParticipant) — utilisées aussi dans les
              badges par-ligne de la liste des inscrits. */}
          {session.participants.length > 0 && (
            <details className="rounded-2xl border border-border bg-white overflow-hidden group">
              <summary className="flex items-center justify-between p-5 border-b border-border cursor-pointer hover:bg-muted/20 transition-colors list-none [&::-webkit-details-marker]:hidden">
                <h2 className="font-semibold inline-flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" /> Conformité Qualiopi
                  <span className="text-xs font-normal text-muted-foreground ml-2 tabular-nums">
                    {totalCompleted}/{totalExpected} docs · {completionPct}%
                  </span>
                </h2>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="hidden group-open:inline">Replier</span>
                  <span className="inline group-open:hidden">Voir la matrice détaillée</span>
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Apprenant</th>
                      <th className="px-2 py-2 font-semibold text-center">Check-list (C4.i17)</th>
                      <th className="px-2 py-2 font-semibold text-center">Convention</th>
                      <th className="px-2 py-2 font-semibold text-center">Programme</th>
                      <th className="px-2 py-2 font-semibold text-center">AGEFICE</th>
                      <th className="px-2 py-2 font-semibold text-center">Analyse besoin</th>
                      <th className="px-2 py-2 font-semibold text-center">Positionnement</th>
                      <th className="px-2 py-2 font-semibold text-center">Émargement</th>
                      <th className="px-2 py-2 font-semibold text-center">Déroulé péda</th>
                      <th className="px-2 py-2 font-semibold text-center">Grille obs.</th>
                      <th className="px-2 py-2 font-semibold text-center">Grille session (C3.i11)</th>
                      <th className="px-2 py-2 font-semibold text-center">QCM</th>
                      <th className="px-2 py-2 font-semibold text-center">Sat. chaud</th>
                      <th className="px-2 py-2 font-semibold text-center">Sat. froid</th>
                      <th className="px-2 py-2 font-semibold text-center">Attestation</th>
                      <th className="px-2 py-2 font-semibold text-center">Certificat</th>
                      <th className="px-2 py-2 font-semibold text-center">Facture</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {session.participants.map((p) => {
                      const docs = docsByParticipant.get(p.id);
                      const assets = assetsByParticipant.get(p.id);
                      const invoice = invoiceByParticipant.get(p.id);
                      const cells: { label: string; href?: string }[] = [
                        { label: 'Check-list session', href: checklistDocId ? `/api/documents/${checklistDocId}` : undefined },
                        { label: 'Convention', href: docs?.get('CONVENTION') ? `/api/documents/${docs.get('CONVENTION')}` : undefined },
                        // Programme + Déroulé pédagogique = assets PRODUIT partagés
                        // par tous les apprenants (1 lien identique sur toutes les lignes).
                        { label: 'Programme (produit)', href: programmeProductDocId ? `/api/documents/${programmeProductDocId}` : undefined },
                        { label: 'AGEFICE', href: docs?.get('AGEFICE') ? `/api/documents/${docs.get('AGEFICE')}` : undefined },
                        { label: 'Analyse besoin', href: assets?.get('ANALYSE_BESOIN') ? `/api/pedagogical-assets/${assets.get('ANALYSE_BESOIN')}` : undefined },
                        { label: 'Positionnement', href: assets?.get('POSITIONNEMENT') ? `/api/pedagogical-assets/${assets.get('POSITIONNEMENT')}` : undefined },
                        { label: 'Émargement', href: assets?.get('EMARGEMENT') ? `/api/pedagogical-assets/${assets.get('EMARGEMENT')}` : undefined },
                        { label: 'Déroulé péda. (produit)', href: derouleProductDocId ? `/api/documents/${derouleProductDocId}` : undefined },
                        { label: 'Grille observation (formateur)', href: assets?.get('GRILLE_OBS') ? `/api/pedagogical-assets/${assets.get('GRILLE_OBS')}` : undefined },
                        { label: 'Grille session (C3.i11)', href: grilleSessionDocId ? `/api/documents/${grilleSessionDocId}` : undefined },
                        { label: 'QCM', href: assets?.get('QCM') ? `/api/pedagogical-assets/${assets.get('QCM')}` : undefined },
                        { label: 'Satisfaction à chaud', href: assets?.get('SATISFACTION_CHAUD') ? `/api/pedagogical-assets/${assets.get('SATISFACTION_CHAUD')}` : undefined },
                        { label: 'Satisfaction à froid', href: assets?.get('SATISFACTION_FROID') ? `/api/pedagogical-assets/${assets.get('SATISFACTION_FROID')}` : undefined },
                        { label: 'Attestation', href: docs?.get('ATTESTATION_FIN') ? `/api/documents/${docs.get('ATTESTATION_FIN')}` : undefined },
                        { label: 'Certificat', href: docs?.get('CERTIFICAT_REALISATION') ? `/api/documents/${docs.get('CERTIFICAT_REALISATION')}` : undefined },
                        { label: invoice?.number ?? 'Facture', href: invoice ? `/app/factures/${invoice.id}` : undefined },
                      ];
                      return (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2">
                            <Link
                              href={`/app/apprenants/${p.person.id}?tab=documents`}
                              className="text-sm hover:text-primary"
                            >
                              {p.person.firstName} {p.person.lastName.toUpperCase()}
                            </Link>
                          </td>
                          {cells.map((c, i) => (
                            <td key={i} className="px-2 py-2 text-center">
                              {c.href ? (
                                <a
                                  href={c.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`${c.label} — clic pour ouvrir`}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span
                                  title={`${c.label} — non généré`}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* Pack fin de formation — dernier en exergue + historique replié
              (BUG-4 : éviter l'accumulation visuelle des anciens batches qui
              prêtait à confusion). Lien vers la page hub pour voir tous. */}
          {closureBatches.length > 0 && (() => {
            const [latest, ...previous] = closureBatches;
            if (!latest) return null;
            const variantOf = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'muted' =>
              status === 'COMPLETED'
                ? 'success'
                : status === 'PARTIAL'
                  ? 'warning'
                  : status === 'FAILED'
                    ? 'danger'
                    : status === 'RUNNING'
                      ? 'info'
                      : 'muted';
            const renderRow = (b: typeof latest) => (
              <Link
                href={`/app/sessions/${session.id}/closure/${b.id}` as Route}
                className="flex items-center gap-3 p-4 hover:bg-muted/20 transition-colors"
              >
                <Badge variant={variantOf(b.status)}>{b.status}</Badge>
                <span className="text-sm flex-1">
                  {b.doneDocs} / {b.totalDocs} docs
                  {b.errorDocs > 0 && <span className="text-red-600"> · {b.errorDocs} erreur(s)</span>}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {new Date(b.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            );
            return (
              <section className="rounded-2xl border border-border bg-white overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-semibold inline-flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" /> Pack fin de formation
                  </h2>
                  <Link
                    href={`/app/sessions/${session.id}/closure` as Route}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    Voir l&apos;historique complet <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                <ul className="divide-y divide-border">
                  <li key={latest.id}>{renderRow(latest)}</li>
                </ul>
                {previous.length > 0 && (
                  <details className="border-t border-border">
                    <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors px-5 py-3 list-none [&::-webkit-details-marker]:hidden">
                      ▸ Historique ({previous.length} pack{previous.length > 1 ? 's' : ''} précédent{previous.length > 1 ? 's' : ''})
                    </summary>
                    <ul className="divide-y divide-border bg-muted/10">
                      {previous.map((b) => (
                        <li key={b.id}>{renderRow(b)}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })()}
        </div>

        <div className="space-y-6">
          {/* BUG-17 anchor — completeness badge link vers la section Produit (fallback si pas de productId) */}
          <div id="section-produit" className="scroll-mt-20" />
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Produit de formation
            </h2>
            {session.product ? (
              <Link
                href={`/app/produits/${session.product.id}`}
                className="block p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="font-medium">{session.product.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <Badge variant="muted" className="font-mono mr-2">{session.product.code}</Badge>
                  {session.product.durationHours}h · {session.product.modality}
                </div>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground italic">—</p>
            )}
          </section>

          {/* Documents partagés par TOUS les apprenants (un seul PDF par
              session/produit, accessible en un clic — évite de chercher
              dans la matrice 17-col).
              Programme + Déroulé = niveau PRODUIT
              Grille obs session + Check-list = niveau SESSION */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documents partagés
            </h2>
            <ul className="space-y-1.5 text-sm">
              {[
                { label: 'Programme de formation', href: programmeProductDocId ? `/api/documents/${programmeProductDocId}` : null, scope: 'Produit' },
                { label: 'Déroulé pédagogique', href: derouleProductDocId ? `/api/documents/${derouleProductDocId}` : null, scope: 'Produit' },
                { label: 'Grille observation (C3.i11)', href: grilleSessionDocId ? `/api/documents/${grilleSessionDocId}` : null, scope: 'Session' },
                { label: 'Check-list formation (C4.i17)', href: checklistDocId ? `/api/documents/${checklistDocId}` : null, scope: 'Session' },
              ].map((d) => (
                <li key={d.label} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0 border-border/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">{d.label}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.scope}</div>
                  </div>
                  {d.href ? (
                    <a
                      href={d.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                    >
                      Ouvrir
                      <ChevronRight className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic shrink-0">Non généré</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {session.internalNotes && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
                Notes internes
              </h2>
              <p className="text-xs text-muted-foreground whitespace-pre-line">
                {session.internalNotes}
              </p>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
