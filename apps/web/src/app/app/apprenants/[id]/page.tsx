import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Mail, Phone, MapPin, GraduationCap, Briefcase, Calendar, FileText, Clock, Wallet,
  ChevronRight,
} from 'lucide-react';
import { prisma, decryptSensitive } from '@qualiof/db';
import { formatAddress } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { DeleteEntityButton } from '@/components/forms/delete-entity-button';
import { EditPersonButton } from '@/components/forms/edit-person-button';
import { Badge } from '@/components/ui/badge';
import { LegalLinkEditor } from '@/components/editors/legal-link-editor';
import { LearnerTabs } from '@/components/apprenants/learner-tabs';
import { BudgetAgefice } from '@/components/apprenants/budget-agefice';
import { LearnerCompletenessBadge } from '@/components/apprenants/learner-completeness-badge';
import { IdentityDocsCard } from '@/components/apprenants/identity-docs-card';
import { GenerateClosureForParticipantButton } from '@/components/apprenants/generate-closure-for-participant';
import { ParticipantActionsMenu } from '@/components/sessions/participant-actions-menu';
import { computeLearnerCompleteness } from '@/lib/learner-completeness';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { formatFunderCode } from '@/lib/funder-codes';
import { RecordRecentVisit } from '@/components/command-palette/record-recent-visit';
// Phase 9.1 Plan 04 — Timeline + PrioCards + Alert banner + helpers stats.
import { LearnerPrioCards } from '@/components/apprenants/timeline/learner-prio-cards';
import { LearnerAlertsBanner } from '@/components/apprenants/timeline/learner-alerts-banner';
import { LearnerTimeline } from '@/components/apprenants/timeline/learner-timeline';
import {
  groupParticipationsByYear,
  computeLearnerHours,
  detectLearnerAlerts,
  findFirstIncompleteSessionId,
  countParticipationFilledDocs,
  type ParticipationForStats,
} from '@/lib/learner-stats';
import { MATRIX_DOC_TYPES } from '@/lib/doc-scope';
// Phase 11 Plan 11-09 — Cross-nav D-07 : bloc Factures sur fiche apprenant.
import { LearnerInvoicesBlock } from '@/components/learners/learner-invoices-block';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export default async function ApprenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ageficeYear?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? 'info';
  // UX-06 : sélecteur d'année du Budget AGEFICE (fallback année courante)
  const ageficeYearParam = sp.ageficeYear ? parseInt(sp.ageficeYear, 10) : NaN;
  const selectedAgeficeYear = Number.isFinite(ageficeYearParam)
    ? ageficeYearParam
    : new Date().getFullYear();

  const person = await prisma.person.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      legalLinks: {
        orderBy: { isPrimary: 'desc' },
        include: {
          organization: {
            select: {
              id: true,
              legalName: true,
              legalForm: true,
              siret: true,
              opcoCode: true,
              ageficeProfile: { select: { cfpAttestationKey: true } },
            },
          },
        },
      },
      sensitiveData: true,
      participations: {
        include: {
          // Phase 9.1 Plan 04 — étendu pour timeline + detectLearnerAlerts.
          // Ajout : endDate, status, productId (lookup product docs).
          session: {
            select: {
              id: true,
              code: true,
              name: true,
              startDate: true,
              endDate: true,
              status: true,
              productId: true,
              product: { select: { id: true, title: true, durationHours: true } },
            },
          },
          sponsorOrg: { select: { legalName: true, opcoCode: true } },
        },
        orderBy: { session: { startDate: 'desc' } },
      },
    },
  });
  if (!person) notFound();

  // Sprint 1 — Sécurité : déchiffrement on-demand du N° SS pour affichage.
  // Garde RBAC : seuls ADMIN et MANAGER voient la donnée en clair (la section
  // affichait déjà "visibles uniquement par les administrateurs" mais sans
  // contrôle réel — bug existant, corrigé ici).
  const canSeeSensitive = user.role === 'ADMIN' || user.role === 'MANAGER';
  const decryptedSsn = canSeeSensitive
    ? await decryptSensitive(person.sensitiveData?.socialSecurityNb)
    : null;

  // Documents liés à cet apprenant via ses participations
  const participantIds = person.participations.map((p) => p.id);
  const sessionIds = Array.from(new Set(person.participations.map((p) => p.session.id)));
  // Phase 9.1 Plan 04 — productIds des sessions suivies (pour productDocs lookup
  // — Bug P0 anti-régression : 1 PDF Programme stocké session-wide).
  const productIds = Array.from(
    new Set(person.participations.map((p) => p.session.productId)),
  );
  const [rawDocs, rawAssets, rawInvoices, rawProductDocs, rawSessionDocs] = participantIds.length
    ? await Promise.all([
        prisma.document.findMany({
          where: { tenantId: user.tenantId, participantId: { in: participantIds } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true, createdAt: true, sessionId: true, participantId: true },
        }),
        prisma.pedagogicalAsset.findMany({
          where: { tenantId: user.tenantId, participantId: { in: participantIds } },
          orderBy: { generatedAt: 'desc' },
          select: { id: true, kind: true, generatedAt: true, sessionId: true, participantId: true, pdfUrl: true },
        }),
        prisma.invoice.findMany({
          where: {
            tenantId: user.tenantId,
            OR: [
              { participantId: { in: participantIds } },
              ...(sessionIds.length ? [{ sessionId: { in: sessionIds } } as const] : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, number: true, createdAt: true, sessionId: true, participantId: true, participantIds: true, status: true },
        }),
        // Phase 9.1 Plan 04 — docs au niveau produit (Bug P0 anti-régression :
        // 1 PDF Programme stocké session-wide via entityType='product').
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'product',
            entityId: { in: productIds },
          },
          select: { id: true, type: true, entityId: true },
        }),
        // Phase 9.1 Plan 04 — docs au niveau session (Déroulé / Grille obs / Checklist).
        prisma.document.findMany({
          where: {
            tenantId: user.tenantId,
            entityType: 'session',
            entityId: { in: sessionIds },
          },
          select: { id: true, type: true, entityId: true },
        }),
      ])
    : [[], [], [], [], []];

  // Filtre les factures groupées qui ne concernent pas vraiment cet apprenant
  // (cas Invoice.sessionId match mais participant pas dans la liste)
  const participantIdSet = new Set(participantIds);
  const filteredInvoices = rawInvoices.filter((inv) => {
    if (inv.participantId && participantIdSet.has(inv.participantId)) return true;
    if (Array.isArray(inv.participantIds)) {
      return inv.participantIds.some((x) => typeof x === 'string' && participantIdSet.has(x));
    }
    return false;
  });

  // Mapping libellés humains pour les types Qualiopi
  const DOC_TYPE_LABELS: Record<string, string> = {
    CONVENTION: 'Convention de formation',
    PROGRAMME: 'Programme de formation',
    CONVOCATION: 'Convocation',
    EMARGEMENT: "Feuille d'émargement",
    ASSIDUITE: "Attestation d'assiduité",
    ATTESTATION_FIN: 'Attestation de fin de formation',
    CERTIFICAT_REALISATION: 'Certificat de réalisation',
    AGEFICE: 'Demande de prise en charge AGEFICE',
    EVALUATION_ACQUIS: 'Évaluation des acquis',
    SATISFACTION: 'Évaluation de satisfaction',
    SUPPORT_PEDAGOGIQUE: 'Support pédagogique',
    PRE_ACCORD_OPCO: 'Pré-accord OPCO',
    VALIDATION_OPCO: 'Validation OPCO',
    FACTURE: 'Facture',
    CUSTOM: 'Document personnalisé',
  };
  const PEDAGOGICAL_KIND_LABELS: Record<string, string> = {
    ANALYSE_BESOIN: 'Analyse des besoins',
    QCM: "QCM d'évaluation",
    GRILLE_OBS: "Grille d'observation",
    COMPETENCES: 'Référentiel de compétences',
    DEROULE: 'Déroulé pédagogique',
    POSITIONNEMENT: 'Questionnaire de positionnement',
    SATISFACTION_CHAUD: 'Évaluation de satisfaction à chaud',
    SATISFACTION_FROID: 'Évaluation de satisfaction à froid',
    EMARGEMENT: "Fiche d'émargement",
  };

  // Document unifié pour la liste : type Document + type PedagogicalAsset
  type DocItem = {
    key: string;
    label: string;
    href: string;
    sessionId: string | null;
    createdAt: Date;
    pillarKey: 'qualiopi' | 'admin' | 'pedagogique' | 'finance';
    sortGroup: number;
  };

  const QUALIOPI_PILLAR: Record<string, DocItem['pillarKey']> = {
    CONVENTION: 'admin',
    PROGRAMME: 'qualiopi',
    CONVOCATION: 'admin',
    EMARGEMENT: 'qualiopi',
    ASSIDUITE: 'qualiopi',
    ATTESTATION_FIN: 'qualiopi',
    CERTIFICAT_REALISATION: 'qualiopi',
    AGEFICE: 'finance',
    EVALUATION_ACQUIS: 'pedagogique',
    SATISFACTION: 'pedagogique',
    SUPPORT_PEDAGOGIQUE: 'pedagogique',
    PRE_ACCORD_OPCO: 'finance',
    VALIDATION_OPCO: 'finance',
    FACTURE: 'finance',
  };

  const documents: DocItem[] = [
    ...rawDocs.map((d) => ({
      key: `doc:${d.id}`,
      label: DOC_TYPE_LABELS[d.type] ?? d.type,
      href: `/api/documents/${d.id}`,
      sessionId: d.sessionId,
      createdAt: d.createdAt,
      pillarKey: QUALIOPI_PILLAR[d.type] ?? 'admin',
      sortGroup: 0,
    })),
    ...rawAssets
      .filter((a) => a.pdfUrl)
      .map((a) => ({
        key: `asset:${a.id}`,
        label: PEDAGOGICAL_KIND_LABELS[a.kind] ?? a.kind,
        href: `/api/pedagogical-assets/${a.id}`,
        sessionId: a.sessionId,
        createdAt: a.generatedAt,
        pillarKey: 'pedagogique' as const,
        sortGroup: 1,
      })),
    ...filteredInvoices.map((inv) => ({
      key: `invoice:${inv.id}`,
      label: `Facture ${inv.number}${inv.status === 'PAID' ? ' (payée)' : ''}`,
      href: `/app/factures/${inv.id}`,
      sessionId: inv.sessionId,
      createdAt: inv.createdAt,
      pillarKey: 'finance' as const,
      sortGroup: 2,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Map sessionId → code+title pour grouper visuellement
  const sessionMeta = sessionIds.length
    ? await prisma.trainingSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, code: true, name: true, product: { select: { title: true } } },
      })
    : [];
  const sessionMetaById = new Map(sessionMeta.map((s) => [s.id, s]));

  const address = (person.personalAddress ?? null) as null | {
    street?: string;
    street2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };

  const isEi = person.legalLinks.some((l) => l.role === 'EI_SELF');

  // Calculs activité
  const totalParticipations = person.participations.length;
  const totalHours = person.participations.reduce(
    (s, p) => s + (p.session.product?.durationHours ?? 0),
    0,
  );

  // Phase 9.1 Plan 04 — Construction des maps pour detectLearnerAlerts +
  // groupement timeline. Toutes les sources matrice sont déjà chargées via
  // le Promise.all bulk au-dessus (rawDocs / rawAssets / rawProductDocs /
  // rawSessionDocs). On indexe pour passage à `deriveCellState` (Plan 01).
  const participantDocsByPid = new Map<string, Map<string, { id: string }>>();
  for (const d of rawDocs) {
    if (!d.participantId) continue;
    let inner = participantDocsByPid.get(d.participantId);
    if (!inner) {
      inner = new Map();
      participantDocsByPid.set(d.participantId, inner);
    }
    inner.set(d.type as string, { id: d.id });
  }
  const pedAssetsByPid = new Map<string, Map<string, { id: string }>>();
  for (const a of rawAssets) {
    if (!a.participantId) continue;
    let inner = pedAssetsByPid.get(a.participantId);
    if (!inner) {
      inner = new Map();
      pedAssetsByPid.set(a.participantId, inner);
    }
    // Le `kind` PedagogicalAsset utilise les mêmes labels (QCM, EMARGEMENT, …)
    // que DOC_TYPE_TO_PED_KIND (cf doc-scope.ts) — la lookup par docType remontant
    // est gérée côté deriveCellState via DOC_TYPE_TO_PED_KIND mapping.
    inner.set(a.kind as string, { id: a.id });
  }
  // sessionDocs indexé par sessionId (entityType='session' → entityId = sessionId)
  const sessionDocsBySid = new Map<string, Map<string, { id: string }>>();
  for (const d of rawSessionDocs) {
    let inner = sessionDocsBySid.get(d.entityId);
    if (!inner) {
      inner = new Map();
      sessionDocsBySid.set(d.entityId, inner);
    }
    inner.set(d.type as string, { id: d.id });
  }
  // productDocs indexé par sessionId (le doc est attaché au productId mais on
  // l'expose par sessionId pour faciliter la lookup côté deriveCellState ;
  // chaque session pointe vers son productId via p.session.productId).
  const productDocsBySid = new Map<string, Map<string, { id: string }>>();
  for (const d of rawProductDocs) {
    // Re-router le productDoc vers toutes les sessions du même produit suivies
    // par cet apprenant (cohérence avec deriveCellState lookup par sessionId).
    for (const p of person.participations) {
      if (p.session.productId !== d.entityId) continue;
      let inner = productDocsBySid.get(p.session.id);
      if (!inner) {
        inner = new Map();
        productDocsBySid.set(p.session.id, inner);
      }
      inner.set(d.type as string, { id: d.id });
    }
  }

  // Phase 9.1 Plan 04 — Adaptation participation → ParticipationForStats
  // (forme minimale typée pour les helpers purs `learner-stats.ts`).
  const participationsForStats: ParticipationForStats[] = person.participations.map((p) => ({
    id: p.id,
    paymentStatus: p.paymentStatus,
    docStatus: (p.docStatus as Record<string, unknown> | null) ?? null,
    session: {
      id: p.session.id,
      startDate: p.session.startDate,
      product: {
        durationHours: p.session.product?.durationHours ?? 0,
        title: p.session.product?.title ?? '(sans titre)',
      },
    },
  }));

  // Stats timeline + alertes
  const currentYearForTimeline = new Date().getFullYear();
  const totalHoursForTimeline = computeLearnerHours(participationsForStats);
  const currentYearHours = computeLearnerHours(participationsForStats, currentYearForTimeline);
  const byYear = groupParticipationsByYear(participationsForStats);
  const firstYear =
    [...byYear.keys()].sort((a, b) => a - b)[0] ?? currentYearForTimeline;
  const { missingDocsCount, pendingPaymentsCount } = detectLearnerAlerts(
    participationsForStats,
    productDocsBySid,
    sessionDocsBySid,
    participantDocsByPid,
    pedAssetsByPid,
  );
  const firstIncompleteSessionId = findFirstIncompleteSessionId(
    participationsForStats,
    productDocsBySid,
    sessionDocsBySid,
    participantDocsByPid,
    pedAssetsByPid,
  );

  // Map sponsorOrg.opcoCode par participationId → funderCode pour timeline
  // (le funder n'existe pas sur TrainingSession — il est porté par sponsorOrg
  // de la participation, cf existing UX-12).
  const funderByPid = new Map<string, string>();
  for (const p of person.participations) {
    if (p.sponsorOrg?.opcoCode) funderByPid.set(p.id, p.sponsorOrg.opcoCode);
  }

  // Build groups timeline (chaque session devient une TimelineSessionCardData)
  const timelineGroups = [...byYear.entries()].map(([year, parts]) => ({
    year,
    sessions: parts.map((pStats) => {
      const full = person.participations.find((pp) => pp.id === pStats.id)!;
      return {
        id: full.session.id,
        productTitle: full.session.product?.title ?? full.session.name ?? '(sans titre)',
        startDate: full.session.startDate,
        endDate: full.session.endDate,
        durationHours: full.session.product?.durationHours ?? 0,
        funderCode: funderByPid.get(full.id) ?? null,
        cancelled: full.session.status === 'CANCELLED',
        docsFilled: countParticipationFilledDocs(
          pStats,
          productDocsBySid,
          sessionDocsBySid,
          participantDocsByPid,
          pedAssetsByPid,
        ),
        docsTotal: MATRIX_DOC_TYPES.length,
      };
    }),
  }));

  // Budget AGEFICE de l'année où le dossier a été monté (financingRequestDate),
  // PAS l'année de la session (cf feedback_budget_agefice_annee_dossier).
  // Fallback session.startDate quand financingRequestDate est null : la majorité
  // des inscriptions importées de SmartOF n'ont pas cette date, on prend la
  // date de la session comme proxy raisonnable. Dès que la vraie date du dossier
  // est saisie, elle prend la priorité.
  const currentYear = new Date().getFullYear();
  const allAgeficeParticipations = person.participations.filter(
    (p) => p.sponsorOrg?.opcoCode === 'AGEFICE',
  );
  const ageficeAvailableYears = Array.from(
    new Set(
      allAgeficeParticipations.map((p) => {
        const refDate = p.financingRequestDate ?? p.session.startDate;
        return new Date(refDate).getFullYear();
      }),
    ),
  ).sort((a, b) => b - a);
  const ageficeParticipations = allAgeficeParticipations.filter((p) => {
    const refDate = p.financingRequestDate ?? p.session.startDate;
    return new Date(refDate).getFullYear() === selectedAgeficeYear;
  });
  const ageficeConsumed = ageficeParticipations.reduce(
    (s, p) => s + Number(p.priceHT),
    0,
  );
  // UX-04 : on annote chaque session AGEFICE avec hasFicheAgefice pour le CTA
  const ficheAgeficeByParticipantId = new Set(
    rawDocs.filter((d) => d.type === 'AGEFICE').map((d) => d.participantId).filter((x): x is string => !!x),
  );
  const ageficeSessions = ageficeParticipations.map((p) => ({
    participantId: p.id,
    sessionId: p.session.id,
    sessionCode: p.session.code,
    sessionName: p.session.name ?? p.session.product?.title ?? '',
    startDate: p.session.startDate,
    amountHT: Number(p.priceHT),
    hasFicheAgefice: ficheAgeficeByParticipantId.has(p.id),
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <RecordRecentVisit
        kind="person"
        id={person.id}
        title={`${person.lastName.toUpperCase()} ${person.firstName}`}
        subtitle={person.professionalStatus}
        href={`/app/apprenants/${person.id}`}
      />
      {/* UX-10 : Breadcrumb (remplace l'ancien BackToListLink, plus contextuel) */}
      <Breadcrumb
        items={[
          { label: 'Apprenants', href: '/app/apprenants' },
          { label: `${person.lastName.toUpperCase()} ${person.firstName}` },
        ]}
      />
      <BackToListLink fallbackHref="/app/apprenants" label="Retour à la liste" />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {person.lastName.toUpperCase()} {person.firstName}
              {isEi && <Badge variant="primary">EI / multi-casquettes</Badge>}
              {person.requiresCleanup && <Badge variant="warning">à corriger</Badge>}
            </span>
          }
          subtitle={person.professionalStatus ?? undefined}
        />
        <EditPersonButton
          personId={person.id}
          current={{
            civility: person.civility,
            firstName: person.firstName,
            lastName: person.lastName,
            birthName: person.birthName,
            birthDate: person.birthDate,
            email: person.email,
            phone: person.phone,
            educationLevel: person.educationLevel,
            diplomas: person.diplomas,
            professionalExperience: person.professionalExperience,
            professionalStatus: person.professionalStatus,
            bpfDefaultStatus: person.bpfDefaultStatus,
          }}
        />
        <DeleteEntityButton
          entity="person"
          entityId={person.id}
          entityName={`${person.firstName} ${person.lastName}`}
          redirectTo="/app/apprenants"
          variant="button"
        />
      </div>

      <LearnerCompletenessBadge result={computeLearnerCompleteness(person)} />

      {/* Phase 9.1 Plan 04 — Bandeau alerte conditionnel (null si 0 alertes) */}
      <LearnerAlertsBanner
        missingDocsCount={missingDocsCount}
        pendingPaymentsCount={pendingPaymentsCount}
        firstIncompleteSessionId={firstIncompleteSessionId}
      />

      {/* Phase 9.1 Plan 04 — 3 PrioCards top fiche apprenant (D-09) */}
      <LearnerPrioCards
        totalHours={totalHoursForTimeline}
        sessionsCount={person.participations.length}
        currentYear={currentYearForTimeline}
        currentYearHours={currentYearHours}
        firstYear={firstYear}
      />

      {/* Phase 9.1 Plan 04 — Timeline verticale années (D-08) */}
      <LearnerTimeline
        groups={timelineGroups}
        personHrefForEmpty={`/app/apprenants/${person.id}?tab=activity`}
      />

      {/* Phase 11 Plan 11-09 — Cross-nav D-07 : factures liées à cet apprenant
          (1-2 clics vers fiche facture). Placé après la timeline et avant les
          onglets pour cohérence layout Phase 9.1 (anti-régression CENTRAL-03). */}
      <LearnerInvoicesBlock personId={person.id} tenantId={user.tenantId} />

      <LearnerTabs
        tabs={[
          { key: 'info', label: 'Informations', iconKey: 'info' },
          {
            key: 'activity',
            label: 'Activité formation',
            iconKey: 'activity',
            badge: totalParticipations,
            badgeTitle: `${totalParticipations} inscription${totalParticipations > 1 ? 's' : ''} en session`,
          },
          {
            key: 'documents',
            label: 'Documents',
            iconKey: 'documents',
            badge: documents.length,
            badgeTitle: `${documents.length} document${documents.length > 1 ? 's' : ''} généré${documents.length > 1 ? 's' : ''}`,
          },
        ]}
      />

      {tab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6">
              <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
                Coordonnées
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
                <Field icon={Mail} label="Email" value={person.email ?? '—'} muted={!person.email} />
                <Field icon={Phone} label="Téléphone" value={person.phone ?? '—'} muted={!person.phone} />
                <Field
                  icon={MapPin}
                  label="Adresse"
                  value={formatAddress(address) || '—'}
                  muted={!address?.street}
                  multiline
                />
                <Field
                  icon={Calendar}
                  label="Date de naissance"
                  value={
                    person.birthDate ? new Date(person.birthDate).toLocaleDateString('fr-FR') : '—'
                  }
                  muted={!person.birthDate}
                />
              </dl>
            </section>

            <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  Liens juridiques ({person.legalLinks.length})
                </h2>
                {person.legalLinks.length >= 2 && (
                  <Badge variant="primary">Cas multi-casquettes</Badge>
                )}
              </div>
              <LegalLinkEditor personId={person.id} links={person.legalLinks} />
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6">
              <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
                Profil pédagogique
              </h2>
              <dl className="space-y-3 text-sm">
                <Field
                  icon={GraduationCap}
                  label="Niveau d'étude"
                  value={person.educationLevel ?? '—'}
                  muted={!person.educationLevel}
                />
                <Field icon={FileText} label="Diplômes" value={person.diplomas ?? '—'} multiline muted={!person.diplomas} />
                <Field
                  icon={Calendar}
                  label="Expérience pro"
                  value={person.professionalExperience ?? '—'}
                  muted={!person.professionalExperience}
                />
                <Field
                  icon={FileText}
                  label="Statut BPF"
                  value={person.bpfDefaultStatus ?? '—'}
                  muted={!person.bpfDefaultStatus}
                />
              </dl>
            </section>

            <IdentityDocsCard
              personId={person.id}
              cniKey={person.sensitiveData?.idDocumentUrl ?? null}
              ribKey={person.ribKey ?? null}
              cfpKey={
                person.legalLinks.find((l) => l.role === 'EI_SELF')?.organization
                  .ageficeProfile?.cfpAttestationKey ?? null
              }
            />

            {person.requiresCleanup && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                <h3 className="font-semibold mb-1">À corriger</h3>
                <p>{person.cleanupNotes ?? "Cette fiche a été flaggée à l'import SmartOF."}</p>
              </section>
            )}

            {canSeeSensitive && decryptedSsn && (
              <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6">
                <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
                  Données sensibles (RGPD)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chiffrées at-rest (pgcrypto). Accès limité aux rôles ADMIN/MANAGER.
                </p>
                <div className="mt-3 text-sm">
                  <span className="text-muted-foreground">N° sécurité sociale : </span>
                  <code className="font-mono text-xs">{decryptedSsn}</code>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-6">
          {/* KPIs activité — UX-05 : Sessions + Heures cliquables (anchor vers liste inscriptions) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI
              label="Sessions"
              value={String(totalParticipations)}
              icon={Calendar}
              href="#inscriptions-list"
            />
            <KPI
              label="Heures formées"
              value={`${totalHours} h`}
              icon={Clock}
              href="#inscriptions-list"
            />
            <KPI
              label="CA généré"
              value={fmtEUR.format(person.participations.reduce((s, p) => s + Number(p.priceHT), 0))}
              icon={Wallet}
            />
            <KPI
              label={`AGEFICE ${selectedAgeficeYear}`}
              value={fmtEUR.format(ageficeConsumed)}
              icon={Wallet}
              accent={ageficeConsumed > 3000 ? 'red' : ageficeConsumed > 2700 ? 'orange' : 'default'}
              href="#budget-agefice"
            />
          </div>

          {/* Budget AGEFICE détaillé — UX-06 sélecteur année + UX-04 CTA dépôt */}
          <div id="budget-agefice">
            <BudgetAgefice
              year={selectedAgeficeYear}
              consomme={ageficeConsumed}
              sessions={ageficeSessions}
              availableYears={ageficeAvailableYears}
              basePath={`/app/apprenants/${person.id}`}
            />
          </div>

          {/* Historique sessions — id pour anchor des KPI cliquables (UX-05) */}
          <section id="inscriptions-list" className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden scroll-mt-20">
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Toutes les inscriptions ({totalParticipations})
              </h2>
            </div>
            {totalParticipations === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground italic">
                Aucune inscription enregistrée pour cet apprenant.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {person.participations.map((p) => (
                  <li key={p.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/app/sessions/${p.session.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0 group"
                      >
                        <Badge variant="muted" className="font-mono text-xs">
                          {p.session.code}
                        </Badge>
                        <span className="font-medium flex-1 min-w-0 truncate group-hover:text-primary">
                          {p.session.name ?? p.session.product?.title ?? '(sans nom)'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.session.startDate).toLocaleDateString('fr-FR')}
                        </span>
                        <Badge variant="muted" className="text-[10px]">
                          {p.session.product?.durationHours ?? 0}h
                        </Badge>
                        {p.sponsorOrg?.opcoCode && (
                          <Badge variant="info" className="text-[10px]">
                            {formatFunderCode(p.sponsorOrg.opcoCode)}
                          </Badge>
                        )}
                        <span className="font-medium text-sm tabular-nums">
                          {fmtEUR.format(Number(p.priceHT))}
                        </span>
                        <Badge variant="muted" className="text-[10px]">
                          {p.enrollmentStatus}
                        </Badge>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                      <GenerateClosureForParticipantButton
                        sessionId={p.session.id}
                        participantId={p.id}
                        sessionLabel={p.session.code}
                      />
                      <ParticipantActionsMenu
                        participantId={p.id}
                        participantName={`${person.firstName} ${person.lastName}`}
                        showAgefice={p.sponsorOrg?.opcoCode === 'AGEFICE'}
                        initialDocs={{
                          CONVENTION: rawDocs.find((d) => d.participantId === p.id && d.type === 'CONVENTION')?.id ?? null,
                          PROGRAMME: rawDocs.find((d) => d.participantId === p.id && d.type === 'PROGRAMME')?.id ?? null,
                          AGEFICE: rawDocs.find((d) => d.participantId === p.id && d.type === 'AGEFICE')?.id ?? null,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'documents' && (() => {
        // Group docs par session pour donner un sens Qualiopi (par formation suivie)
        const bySession = new Map<string | null, DocItem[]>();
        for (const d of documents) {
          const list = bySession.get(d.sessionId) ?? [];
          list.push(d);
          bySession.set(d.sessionId, list);
        }
        const PILLAR_LABELS = {
          qualiopi: { label: 'Qualiopi', cls: 'bg-emerald-100 text-emerald-800' },
          pedagogique: { label: 'Pédagogique', cls: 'bg-blue-100 text-blue-800' },
          admin: { label: 'Administratif', cls: 'bg-slate-100 text-slate-700' },
          finance: { label: 'Financier', cls: 'bg-amber-100 text-amber-800' },
        } as const;
        // UX-03 : CTA pour générer un document si l'apprenant a au moins une participation
        const hasParticipations = person.participations.length > 0;
        return (
          <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
            <div className="p-5 border-b border-border flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  Documents générés ({documents.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Groupés par session — clic sur un document pour l'ouvrir.
                </p>
              </div>
              {hasParticipations && (
                <Link
                  href={`/app/apprenants/${person.id}?tab=activity#inscriptions-list`}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-primary/40 bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-all duration-300 ease-out active:scale-[0.97]"
                  title="Aller à l'onglet Activité — chaque session a un menu Actions pour générer ses documents"
                >
                  <FileText className="h-4 w-4" />
                  Générer un document
                </Link>
              )}
            </div>
            {documents.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground italic">
                Aucun document généré. Les documents apparaîtront ici dès qu'une fiche AGEFICE,
                programme, attestation, certificat, QCM, grille d'observation ou facture sera
                produite pour cet apprenant.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {Array.from(bySession.entries()).map(([sId, items]) => {
                  const meta = sId ? sessionMetaById.get(sId) : null;
                  return (
                    <div key={sId ?? 'no-session'} className="p-4">
                      <div className="text-xs text-muted-foreground mb-2 inline-flex items-center gap-2 flex-wrap">
                        {meta ? (
                          <>
                            <Link
                              href={`/app/sessions/${meta.id}`}
                              className="font-mono text-[11px] bg-muted/60 px-2 py-0.5 rounded hover:bg-muted"
                            >
                              {meta.code}
                            </Link>
                            <span className="text-foreground">{meta.product?.title ?? meta.name}</span>
                          </>
                        ) : (
                          <span className="italic">Hors session</span>
                        )}
                        <span className="text-[11px]">· {items.length} doc{items.length > 1 ? 's' : ''}</span>
                      </div>
                      <ul className="space-y-1.5 ml-1">
                        {items.map((d) => {
                          const pillar = PILLAR_LABELS[d.pillarKey];
                          return (
                            <li key={d.key}>
                              <a
                                href={d.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-2.5 rounded-md border border-border hover:bg-muted/30 hover:border-primary/30 transition-colors"
                              >
                                <FileText className="h-4 w-4 text-primary shrink-0" />
                                <span className="flex-1 font-medium text-sm truncate">{d.label}</span>
                                <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${pillar.cls}`}>
                                  {pillar.label}
                                </span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                                </span>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })()}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  muted,
  multiline,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </div>
        <div className={muted ? 'text-muted-foreground italic' : multiline ? 'whitespace-pre-line' : ''}>
          {value}
        </div>
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'default' | 'orange' | 'red';
  /** Si fourni : KPI rendu en <a> cliquable (UX-05 — drill-down). */
  href?: string;
}) {
  const cls =
    accent === 'red'
      ? 'border-red-200 bg-red-50/50'
      : accent === 'orange'
        ? 'border-orange-200 bg-orange-50/50'
        : 'border-border bg-white';
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className={`rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/20 cursor-pointer ${cls}`}
      >
        {inner}
      </a>
    );
  }
  return <div className={`rounded-xl border p-4 ${cls}`}>{inner}</div>;
}
