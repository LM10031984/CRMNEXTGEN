import type { ReactNode } from 'react';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import type { SessionPreparationStatus } from '@/server/actions/prepare-training';
import type { SessionClosureStatus } from '@/server/actions/closure-status';

/**
 * Orchestrateur visuel de la fiche session.
 *
 * 3 zones coordonnées :
 *   1. Hero "Prochaine étape" — détecte l'étape attendue selon statut session
 *      + état préparation + état pack closure. Affiche un CTA contextuel énorme.
 *   2. Barre conformité Qualiopi — 9 indicateurs métier (1, 6, 8, 9, 10, 11,
 *      17, 27, 30), score X/9, vert/ambre/gris par indic.
 *   3. Timeline 5 étapes (children) — passés en props pour que la page session
 *      composer ait la main sur les blocks à afficher.
 *
 * Le composant est server-side : pas de state, juste du calcul.
 */

type SessionStatus = 'DRAFT' | 'PLANNED' | 'OPEN' | 'VALIDATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | string;

interface QualiopiPillar {
  ind: string;
  label: string;
  done: boolean;
  hint?: string;
}

interface Props {
  sessionStatus: SessionStatus;
  prep: SessionPreparationStatus;
  closure: SessionClosureStatus;
  /** Le pack closure est lançable (= getSessionCompleteness.ready) */
  canLaunchPack: boolean;
  participantsCount: number;
  primaryTrainerName: string | null;
  /** Programme produit IA en attente de validation humaine (BUG-P0-02) */
  productAiDraftPending: boolean;
  /** L'utilisateur peut-il lancer des actions ? */
  canWrite: boolean;
  /** Children = les 5 TimelineStep dans l'ordre */
  children: ReactNode;
}

export function SessionWorkflowTimeline({
  sessionStatus,
  prep,
  closure,
  canLaunchPack,
  participantsCount,
  primaryTrainerName,
  productAiDraftPending,
  canWrite,
  children,
}: Props) {
  // NextStepHero interne SUPPRIMÉ (commit ui-b 2026-06-05) — remplacé par
  // <NextActionHero> au-dessus de la timeline, qui lit la source unique
  // sessionStage(). Ne plus dupliquer la détection ici. Les paramètres
  // sessionStatus/prep/closure/participantsCount/primaryTrainerName/
  // canLaunchPack/productAiDraftPending sont conservés temporairement
  // pour compat — ils ne servent plus qu'à computeQualiopiPillars.
  void sessionStatus;
  void participantsCount;
  void primaryTrainerName;
  void canLaunchPack;
  void productAiDraftPending;
  void canWrite;

  // Conformité Qualiopi (9 piliers) — sera mis derrière toggle en commit ui-e
  const pillars = computeQualiopiPillars(prep, closure);
  const okCount = pillars.filter((p) => p.done).length;

  return (
    <div className="space-y-6">
      {/* Barre conformité Qualiopi — vue audit en un coup d'œil */}
      <QualiopiPillarBar pillars={pillars} okCount={okCount} />

      {/* Timeline 5 étapes — les blocks sont composés par la page session */}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Sous-composants
   ════════════════════════════════════════════════════════════════════ */

interface NextStep {
  stepNumber: number;
  title: string;
  reason: string;
  cta?: { label: string; href: string; primary?: boolean };
  variant: 'action' | 'wait' | 'done' | 'blocker';
}

function NextStepHero({ step, canWrite }: { step: NextStep; canWrite: boolean }) {
  const palette = {
    action: {
      bg: 'bg-gradient-to-br from-primary-50 via-white to-primary-50/50',
      border: 'border-primary-200',
      accent: 'bg-primary text-white',
      icon: <Sparkles className="h-5 w-5" />,
    },
    wait: {
      bg: 'bg-gradient-to-br from-sky-50 via-white to-sky-50/50',
      border: 'border-sky-200',
      accent: 'bg-sky-500 text-white',
      icon: <Sparkles className="h-5 w-5" />,
    },
    done: {
      bg: 'bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50',
      border: 'border-emerald-200',
      accent: 'bg-emerald-500 text-white',
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    blocker: {
      bg: 'bg-gradient-to-br from-amber-50 via-white to-amber-50/50',
      border: 'border-amber-200',
      accent: 'bg-amber-500 text-white',
      icon: <Sparkles className="h-5 w-5" />,
    },
  }[step.variant];

  return (
    <section
      aria-labelledby="next-step-hero"
      className={`relative overflow-hidden rounded-2xl border-2 ${palette.border} ${palette.bg} p-5 sm:p-6`}
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div
          className={`h-12 w-12 rounded-xl ${palette.accent} inline-flex items-center justify-center shrink-0 shadow-sm`}
          aria-hidden="true"
        >
          {palette.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            Étape {step.stepNumber} · Prochaine action
          </p>
          <h2
            id="next-step-hero"
            className="text-xl sm:text-2xl font-bold tracking-tight"
          >
            {step.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{step.reason}</p>
        </div>
        {step.cta && canWrite && (
          <a
            href={step.cta.href}
            className={`inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow-md ${
              step.cta.primary ? palette.accent : 'bg-white border border-border text-foreground hover:bg-muted/30'
            }`}
          >
            {step.cta.label}
            <ArrowRight className="h-4 w-4" />
          </a>
        )}
      </div>
    </section>
  );
}

function QualiopiPillarBar({
  pillars,
  okCount,
}: {
  pillars: QualiopiPillar[];
  okCount: number;
}) {
  const total = pillars.length;
  const pct = total > 0 ? Math.round((okCount / total) * 100) : 0;
  return (
    <section
      aria-labelledby="qualiopi-pillars"
      className="rounded-2xl border border-border bg-white p-5"
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <h2
            id="qualiopi-pillars"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Conformité Qualiopi — 9 indicateurs clés
          </h2>
        </div>
        <div className="text-sm">
          <span className="tabular-nums font-bold text-foreground">{okCount}</span>
          <span className="text-muted-foreground">/{total} couverts</span>
          <span className="ml-2 text-xs text-muted-foreground">({pct}%)</span>
        </div>
      </div>

      {/* Barre par indicateur — visuellement claire pour audit */}
      <ul
        className="grid grid-cols-3 sm:grid-cols-9 gap-1.5"
        aria-label="Indicateurs Qualiopi"
      >
        {pillars.map((p) => (
          <li
            key={p.ind}
            title={`${p.ind} — ${p.label}${p.hint ? ' · ' + p.hint : ''}`}
            className={`rounded-md px-2 py-1.5 text-center border transition-colors ${
              p.done
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            <div className="text-[10px] font-mono font-semibold leading-tight">{p.ind}</div>
            <div className="text-[9px] leading-tight mt-0.5 truncate">{p.label}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Logique métier
   ════════════════════════════════════════════════════════════════════ */

function detectNextStep(input: {
  sessionStatus: SessionStatus;
  prep: SessionPreparationStatus;
  closure: SessionClosureStatus;
  participantsCount: number;
  primaryTrainerName: string | null;
  canLaunchPack: boolean;
  productAiDraftPending: boolean;
}): NextStep {
  const {
    sessionStatus,
    prep,
    closure,
    participantsCount,
    primaryTrainerName,
    canLaunchPack,
    productAiDraftPending,
  } = input;

  // Bloqueur fondamental : pas d'inscrits
  if (participantsCount === 0) {
    return {
      stepNumber: 1,
      title: 'Inscris au moins un apprenant',
      reason: 'La préparation pédagogique et le pack fin nécessitent au moins 1 inscrit.',
      cta: { label: 'Ajouter un apprenant', href: '#section-participants', primary: true },
      variant: 'blocker',
    };
  }

  // Bloqueur : pas de formateur principal
  if (!primaryTrainerName) {
    return {
      stepNumber: 1,
      title: 'Définis le formateur principal',
      reason: 'Le formateur signataire des docs Qualiopi doit être identifié (étoile).',
      cta: { label: 'Choisir le formateur', href: '#section-formateurs', primary: true },
      variant: 'blocker',
    };
  }

  // Bloqueur : brouillon IA programme à valider (bloque le pack fin)
  if (productAiDraftPending) {
    return {
      stepNumber: 1,
      title: 'Valide le programme du produit',
      reason: 'Le programme a été généré par IA. Sans validation humaine, le pack fin est bloqué.',
      cta: { label: 'Valider en 1 clic ↓', href: '#step-1', primary: true },
      variant: 'blocker',
    };
  }

  // Étape 2 : préparation pédagogique
  const prepComplete = isPrepComplete(prep);
  if (!prepComplete) {
    const empty = prep.programme === false && prep.deroule === false && prep.checklist === false;
    return {
      stepNumber: 2,
      title: empty ? 'Lance la préparation pédagogique' : 'Complète la préparation pédagogique',
      reason: empty
        ? 'Programme, déroulé, conventions, convocations, analyse besoin et AGEFICE sont générés automatiquement (~30s).'
        : `${countMissingPrep(prep)} document(s) restant(s) à générer pour clôturer la préparation.`,
      cta: { label: empty ? 'Lancer la préparation' : 'Compléter', href: '#step-2', primary: true },
      variant: 'action',
    };
  }

  // Étape 3 : pendant la formation (session en cours ou prévue)
  if (sessionStatus === 'DRAFT' || sessionStatus === 'PLANNED' || sessionStatus === 'OPEN' || sessionStatus === 'VALIDATED') {
    return {
      stepNumber: 3,
      title: 'En attente du démarrage de la formation',
      reason: "La préparation est complète. À J0, le formateur peut commencer la formation et faire signer l'émargement.",
      variant: 'wait',
    };
  }
  if (sessionStatus === 'IN_PROGRESS') {
    return {
      stepNumber: 3,
      title: 'Formation en cours',
      reason: "Émargement à signer chaque demi-journée. Le pack fin sera disponible à la clôture.",
      variant: 'wait',
    };
  }

  // Étape 4 : pack fin
  const closureComplete = isClosureComplete(closure);
  if (sessionStatus === 'COMPLETED' && !closureComplete && canLaunchPack) {
    return {
      stepNumber: 4,
      title: 'Génère le pack fin de formation',
      reason: '10 documents Qualiopi (attestation, certificat, QCM, satisfaction…) en 1 clic. ~12 min pour 5 stagiaires.',
      cta: { label: 'Générer le pack fin', href: '#step-4', primary: true },
      variant: 'action',
    };
  }
  if (closureComplete) {
    return {
      stepNumber: 5,
      title: 'Session prête pour la facturation',
      reason: 'Tous les documents Qualiopi sont générés. Il reste à émettre les factures et suivre les encaissements.',
      cta: { label: 'Voir les factures', href: '#step-5' },
      variant: 'done',
    };
  }

  return {
    stepNumber: 4,
    title: 'Pack fin de formation à finaliser',
    reason: 'La session est marquée terminée mais des documents Qualiopi sont encore manquants.',
    cta: { label: 'Compléter le pack', href: '#step-4' },
    variant: 'action',
  };
}

function isPrepComplete(s: SessionPreparationStatus): boolean {
  const N = s.participantsCount;
  if (N === 0) return s.programme && s.deroule && s.checklist;
  return (
    s.programme &&
    s.deroule &&
    s.checklist &&
    s.conventionsCount >= N &&
    s.convocationsCount >= N &&
    s.analyseBesoinDone >= N &&
    s.ageficeCount >= s.ageficeEligibleCount
  );
}

function countMissingPrep(s: SessionPreparationStatus): number {
  const N = s.participantsCount;
  return (
    (s.programme ? 0 : 1) +
    (s.deroule ? 0 : 1) +
    (s.checklist ? 0 : 1) +
    Math.max(0, N - s.conventionsCount) +
    Math.max(0, N - s.convocationsCount) +
    Math.max(0, N - s.analyseBesoinDone) +
    Math.max(0, s.ageficeEligibleCount - s.ageficeCount)
  );
}

function isClosureComplete(s: SessionClosureStatus): boolean {
  if (s.participantsCount === 0) return false;
  const allShared = s.grilleObsSession && s.bilanSatisfaction;
  const allPer =
    s.attestations >= s.participantsCount &&
    s.certificats >= s.participantsCount &&
    s.qcm >= s.participantsCount &&
    s.positionnements >= s.participantsCount &&
    s.satisfactionChaud >= s.participantsCount &&
    s.satisfactionFroid >= s.participantsCount &&
    s.assiduites >= s.ageficeEligibleCount;
  return allShared && allPer;
}

/**
 * 9 piliers Qualiopi clés tracés sur la fiche session.
 * Heuristique : pillar OK si AU MOINS un doc principal qui le couvre est généré.
 */
function computeQualiopiPillars(
  prep: SessionPreparationStatus,
  closure: SessionClosureStatus,
): QualiopiPillar[] {
  const N = prep.participantsCount;
  return [
    {
      ind: 'Ind 1',
      label: 'Info pub.',
      done: prep.programme,
      hint: 'Programme de formation publié',
    },
    {
      ind: 'Ind 6',
      label: 'Adaptation',
      done: prep.programme && prep.conventionsCount > 0,
      hint: 'Programme + convention',
    },
    {
      ind: 'Ind 8',
      label: 'Modalités',
      done: prep.conventionsCount > 0,
      hint: 'Convention de formation',
    },
    {
      ind: 'Ind 9',
      label: 'Info appren.',
      done: prep.convocationsCount > 0,
      hint: 'Convocation envoyée',
    },
    {
      ind: 'Ind 10',
      label: 'Pédagogie',
      done: prep.deroule,
      hint: 'Déroulé pédagogique',
    },
    {
      ind: 'Ind 11',
      label: 'Évaluation',
      done: closure.qcm > 0 || closure.positionnements > 0 || prep.analyseBesoinDone > 0,
      hint: 'Analyse besoin / QCM / positionnement',
    },
    {
      ind: 'Ind 17',
      label: 'Moyens',
      done: prep.checklist,
      hint: 'Check-list formation',
    },
    {
      ind: 'Ind 27',
      label: 'Attestation',
      done: N > 0 && closure.attestations >= N && closure.certificats >= N,
      hint: 'Attestation + certificat par stagiaire',
    },
    {
      ind: 'Ind 30',
      label: 'Satisfaction',
      done: closure.satisfactionChaud > 0 && closure.satisfactionFroid > 0,
      hint: 'Satisfaction chaud + froid',
    },
  ];
}
