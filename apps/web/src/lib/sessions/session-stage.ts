/**
 * sessionStage() — Source UNIQUE de vérité pour "l'étape courante" d'une
 * session dans le process Qualiopi (5 étapes).
 *
 * Consommée par :
 *   - <SessionHeaderBar> : badge de statut affiché
 *   - <NextActionHero>   : titre + CTA "Prochaine action"
 *   - <TimelineStep>     : expansion (only current is expanded) + state visuel
 *   - <DocDockDrawer>    : titre contextuel + filtres
 *
 * Sans cette source unique, le badge dit "DRAFT", le hero dit "Étape 3" et
 * la timeline déplie l'étape 2 — incohérence d'origine pré-refactor.
 *
 * Helper PUR (aucun I/O Prisma). Tous les inputs sont sérialisables, tous
 * les outputs aussi. Testé en isolation (vitest).
 */

import type { SessionPreparationStatus } from '@/server/actions/prepare-training';
import type { SessionClosureStatus } from '@/server/actions/closure-status';

export type SessionStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'OPEN'
  | 'VALIDATED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type StageNumber = 1 | 2 | 3 | 4 | 5;
export type StageStatus = 'todo' | 'active' | 'done' | 'blocked';
export type StageVisualState = 'done' | 'active' | 'todo';

/**
 * Type du CTA — pilote le RENDU côté UI :
 *   - 'anchor'        : lien de navigation (#step-N) — rendu par <a> simple
 *   - 'generate_pack' : déclenche le worker BullMQ closure pack — rendu par
 *                       <GenerateClosurePackButton> (vrai bouton avec action)
 *
 * Garde-fou Laurent 2026-06-05 : l'exception "vrai bouton vs anchor" doit
 * porter sur l'identité du CTA, pas sur status === 'COMPLETED' en bloc.
 * Sinon une session COMPLETED avec pack à 10/10 afficherait encore
 * "Générer le pack" alors que sessionStage l'a fait passer à "Émettre la facture".
 */
export type StageCtaKind = 'anchor' | 'generate_pack';

export interface StageCta {
  label: string;
  /** Anchor "#step-N" ou URL absolue (utilisé quand kind='anchor') */
  href: string;
  primary: boolean;
  kind: StageCtaKind;
}

export interface SessionStage {
  /** Étape "où on en est" — sur laquelle l'utilisateur doit cliquer. */
  current: StageNumber;
  /** Status global du process pour cette session. */
  status: StageStatus;
  /** Phrase courte pour l'utilisateur ("Lance la préparation"). */
  reason: string;
  /** Si status='blocked', le label précis du bloqueur. */
  blocker?: string;
  /** CTA principal (Hero). Absent si rien à faire (done / wait). */
  cta?: StageCta;
  /** État visuel de CHAQUE étape (pour timeline expansion + checks). */
  stagesState: Record<StageNumber, StageVisualState>;
}

export interface SessionStageInput {
  status: SessionStatus | string;
  startDate: Date;
  endDate: Date;
  participantsCount: number;
  primaryTrainerName: string | null;
  productAiDraftPending: boolean;
  prep: SessionPreparationStatus;
  closure: SessionClosureStatus;
  /**
   * Référence "maintenant" — injectable pour tests reproductibles.
   * Défaut côté impl : `new Date()`. Préserve la pureté du helper.
   * Ajouté ui-e3 (Laurent test 2026-06-08) : bug NextActionHero qui
   * affichait "ÉTAPE 3 · EN ATTENTE — à J0" à J+7 parce que sessionStage
   * lisait le `status` BDD seul, sans vérifier si la date était passée.
   */
  now?: Date;
}

/* ── Helpers privés ──────────────────────────────────────────────────── */

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

/* ── Helper principal ────────────────────────────────────────────────── */

export function sessionStage(input: SessionStageInput): SessionStage {
  const {
    status,
    startDate,
    endDate,
    participantsCount,
    primaryTrainerName,
    productAiDraftPending,
    prep,
    closure,
    now = new Date(),
  } = input;

  // ── Étape 1. BLOCKERS (priorité absolue) ──────────────────────────
  // Bloqueurs fondamentaux qui empêchent toute progression du process.
  if (participantsCount === 0) {
    return {
      current: 1,
      status: 'blocked',
      reason: 'Inscris au moins un apprenant pour démarrer la préparation.',
      blocker: 'Aucun apprenant inscrit',
      cta: { label: 'Ajouter un apprenant', href: '#section-participants', primary: true, kind: 'anchor' },
      stagesState: { 1: 'active', 2: 'todo', 3: 'todo', 4: 'todo', 5: 'todo' },
    };
  }

  if (!primaryTrainerName) {
    return {
      current: 1,
      status: 'blocked',
      reason: 'Définis le formateur principal — il signe les docs Qualiopi.',
      blocker: 'Formateur principal manquant',
      cta: { label: 'Choisir le formateur', href: '#section-formateurs', primary: true, kind: 'anchor' },
      stagesState: { 1: 'active', 2: 'todo', 3: 'todo', 4: 'todo', 5: 'todo' },
    };
  }

  if (productAiDraftPending) {
    return {
      current: 1,
      status: 'blocked',
      reason: "Valide le programme IA — sans validation humaine, le pack fin est bloqué.",
      blocker: 'Programme IA non validé',
      cta: { label: 'Valider en 1 clic', href: '#step-1', primary: true, kind: 'anchor' },
      stagesState: { 1: 'active', 2: 'todo', 3: 'todo', 4: 'todo', 5: 'todo' },
    };
  }

  // ── Étape 2. PRÉPARATION ──────────────────────────────────────────
  const prepComplete = isPrepComplete(prep);
  if (!prepComplete) {
    const empty = !prep.programme && !prep.deroule && !prep.checklist;
    const missing = countMissingPrep(prep);
    return {
      current: 2,
      status: 'active',
      reason: empty
        ? 'Lance la préparation pédagogique — 7 docs générés en 1 clic.'
        : `Complète la préparation — ${missing} document(s) restant(s).`,
      cta: { label: empty ? 'Lancer la préparation' : 'Compléter', href: '#step-2', primary: true, kind: 'anchor' },
      stagesState: { 1: 'done', 2: 'active', 3: 'todo', 4: 'todo', 5: 'todo' },
    };
  }

  // ── Étape 3. PENDANT LA FORMATION ─────────────────────────────────

  // Garde-fou date dépassée (Laurent ui-e3) : si endDate < now et le
  // status BDD est encore pré-COMPLETED (utilisateur n'a pas cliqué
  // « Marquer comme terminée »), on signale explicitement plutôt
  // que d'afficher le message stale « À J0 le formateur démarre ».
  const isAfterEnd = endDate < now;
  if (isAfterEnd && status !== 'COMPLETED' && status !== 'CANCELLED') {
    return {
      current: 3,
      status: 'active',
      reason:
        'Formation passée — passe la session en « Terminée » pour pouvoir générer le pack fin.',
      cta: {
        label: 'Marquer comme terminée',
        href: '#section-status',
        primary: true,
        kind: 'anchor',
      },
      stagesState: { 1: 'done', 2: 'done', 3: 'active', 4: 'todo', 5: 'todo' },
    };
  }

  // Garde-fou « formation en cours » dérivé des dates (Laurent A2 2026-06-08) :
  // si startDate ≤ now ≤ endDate, on est dans la fenêtre d'exécution même
  // si le status BDD est resté en pré-IN_PROGRESS (VALIDATED le plus souvent,
  // mais aussi PLANNED/OPEN/DRAFT). Sans cette branche, la session retombait
  // dans `isBeforeStart` et le hero affichait « À J0 le formateur démarre »
  // alors qu'on est déjà à J+N. Le bord supérieur (now === endDate) reste
  // dans le in-window — la bascule sur « Marquer comme terminée » fire à
  // l'instant suivant (now > endDate), pas de double-CTA à la frontière.
  const isInWindow = startDate <= now && now <= endDate;
  if (isInWindow && status !== 'COMPLETED' && status !== 'CANCELLED') {
    return {
      current: 3,
      status: 'active',
      reason: 'Formation en cours — émargement à signer chaque demi-journée.',
      stagesState: { 1: 'done', 2: 'done', 3: 'active', 4: 'todo', 5: 'todo' },
    };
  }

  // Pré-formation : DRAFT/PLANNED/OPEN/VALIDATED + prep complète + startDate
  // toujours dans le futur → wait J0. (Si on arrive ici, isAfterEnd et
  // isInWindow sont tous deux faux, donc startDate > now par déduction.)
  const isBeforeStart =
    status === 'DRAFT' || status === 'PLANNED' || status === 'OPEN' || status === 'VALIDATED';
  if (isBeforeStart) {
    return {
      current: 3,
      status: 'todo',
      reason: 'Préparation complète. À J0, le formateur démarre et fait signer l\'émargement.',
      stagesState: { 1: 'done', 2: 'done', 3: 'active', 4: 'todo', 5: 'todo' },
    };
  }

  // Filet de sécurité : IN_PROGRESS hors fenêtre (startDate > now — peu
  // probable mais possible si on a cliqué « Démarrer » trop tôt).
  if (status === 'IN_PROGRESS') {
    return {
      current: 3,
      status: 'active',
      reason: 'Formation en cours — émargement à signer chaque demi-journée.',
      stagesState: { 1: 'done', 2: 'done', 3: 'active', 4: 'todo', 5: 'todo' },
    };
  }

  // ── Étape 4. PACK FIN DE FORMATION ────────────────────────────────
  const closureComplete = isClosureComplete(closure);
  if (status === 'COMPLETED' && !closureComplete) {
    return {
      current: 4,
      status: 'active',
      reason: 'Génère le pack fin — 10 docs Qualiopi en 1 clic.',
      cta: { label: 'Générer le pack fin', href: '#step-4', primary: true, kind: 'generate_pack' },
      stagesState: { 1: 'done', 2: 'done', 3: 'done', 4: 'active', 5: 'todo' },
    };
  }

  // ── Étape 5. FACTURATION (pack complet) ───────────────────────────
  if (closureComplete) {
    return {
      current: 5,
      status: 'active',
      reason: 'Tous les docs Qualiopi sont générés. Émets les factures et suis les encaissements.',
      cta: { label: 'Voir les factures', href: '#step-5', primary: false, kind: 'anchor' },
      stagesState: { 1: 'done', 2: 'done', 3: 'done', 4: 'done', 5: 'active' },
    };
  }

  // Fallback : session COMPLETED sans batch closure visible
  return {
    current: 4,
    status: 'active',
    reason: 'Session terminée — finalise le pack fin de formation.',
    cta: { label: 'Compléter le pack', href: '#step-4', primary: true, kind: 'generate_pack' },
    stagesState: { 1: 'done', 2: 'done', 3: 'done', 4: 'active', 5: 'todo' },
  };
}
