/**
 * La campagne de pré-inscription par rendez-vous (spec §7) — fonctions pures.
 *
 * Aucun import prisma/next : la campagne se raisonne sur des comptes et des
 * dates, et ses règles se testent sans base.
 *
 * **Ce que la campagne EST** : un lien multi-usages, diffusé à l'équipe d'une
 * agence après le R1, qui distribue à chaque participant SON lien de
 * pré-inscription individuel. Rien de plus.
 *
 * **Ce qu'elle n'est PAS** : un second pipeline. Les pièces, l'OCR, la
 * validation admin et les relances restent ceux de `PreEnrollment` — la
 * campagne est la couche qui les déclenche et qui en agrège l'avancement.
 */

/** L'état d'une campagne, du point de vue de quelqu'un qui ouvre le lien. */
export type BatchState = 'ouverte' | 'expiree' | 'complete' | 'cloturee' | 'annulee';

export interface BatchStateInput {
  status: 'OUVERTE' | 'CLOTUREE' | 'ANNULEE';
  expiresAt: Date;
  /** null = pas de plafond. */
  maxUses: number | null;
  usedCount: number;
  now?: Date;
}

/**
 * L'ordre des tests porte la règle : une annulation ou une clôture l'emporte
 * toujours sur le reste. On ne rouvre jamais un lien « par surprise » parce
 * qu'une pré-inscription a été supprimée — même doctrine que le lien public
 * de session (`publicLinkState`).
 */
export function batchState(input: BatchStateInput): BatchState {
  const now = input.now ?? new Date();
  if (input.status === 'ANNULEE') return 'annulee';
  if (input.status === 'CLOTUREE') return 'cloturee';
  if (input.expiresAt <= now) return 'expiree';
  if (input.maxUses !== null && input.usedCount >= input.maxUses) return 'complete';
  return 'ouverte';
}

export function isBatchOpen(input: BatchStateInput): boolean {
  return batchState(input) === 'ouverte';
}

/** Ce que le participant lit quand le lien ne s'ouvre pas. Jamais un code. */
export const BATCH_STATE_MESSAGE: Record<Exclude<BatchState, 'ouverte'>, string> = {
  expiree:
    'Ce lien d’inscription a expiré. Votre responsable peut en demander un nouveau à votre organisme de formation.',
  complete:
    'Ce lien a atteint le nombre d’inscriptions prévu. Contactez votre responsable pour être ajouté.',
  cloturee: 'Les inscriptions pour cette session sont closes.',
  annulee: 'Ce lien n’est plus valide.',
};

/**
 * Le plafond d'usages par défaut : trois fois l'effectif attendu.
 *
 * Pourquoi trois et pas un : un participant qui se trompe, abandonne en cours
 * de route ou reprend sur un autre téléphone consomme un usage. Un plafond
 * serré transformerait le lien en piège, et c'est l'admin qui passerait la
 * soirée à en régénérer. Sans effectif connu, pas de plafond : mieux vaut un
 * lien ouvert qu'un lien qui bloque une équipe un vendredi soir.
 */
export function defaultMaxUses(expectedParticipants: number | null): number | null {
  if (expectedParticipants === null || expectedParticipants <= 0) return null;
  return expectedParticipants * 3;
}

/**
 * La deadline administrative — « pièces réunies au plus tard le … ».
 *
 * C'est la date de la PREMIÈRE session moins le délai de dépôt du financeur.
 * Elle n'est pas décorative : c'est l'argument qui fait bouger une équipe, et
 * c'est le même nombre de jours que la proposition annonce (§8, règle AGEFICE).
 */
export function piecesDeadline(startDates: readonly Date[], leadDays: number): Date | null {
  const futures = [...startDates].sort((a, b) => a.getTime() - b.getTime());
  const first = futures[0];
  if (!first) return null;
  const deadline = new Date(first);
  deadline.setDate(deadline.getDate() - leadDays);
  return deadline;
}

/** Statuts d'un `PreEnrollment`, vus par la campagne. */
export type PreEnrollmentStatusLike =
  | 'PENDING_FORM'
  | 'SUBMITTED'
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'VALIDATED'
  | 'REJECTED'
  | 'CONVERTED';

export interface BatchProgress {
  /** Liens ouverts, formulaire pas encore rendu. */
  attendus: number;
  /** Dossiers déposés, en cours de traitement ou en attente de validation. */
  aVerifier: number;
  /** Dossiers validés par l'admin (ou déjà convertis en apprenant). */
  valides: number;
  rejetes: number;
  total: number;
  /** Effectif annoncé au diagnostic — null si non renseigné. */
  expected: number | null;
  /** % de l'effectif attendu ayant un dossier validé. null si effectif inconnu. */
  percentValidated: number | null;
}

/**
 * L'écran « ce qui est bon ou pas bon », en un objet.
 *
 * Les quatre colonnes disent des choses différentes et ne se confondent pas :
 * un lien ouvert n'est pas un dossier déposé, et un dossier déposé n'est pas un
 * dossier bon. C'est exactement la distinction que l'admin vient chercher.
 */
export function computeBatchProgress(
  statuses: readonly PreEnrollmentStatusLike[],
  expected: number | null,
): BatchProgress {
  const count = (...s: PreEnrollmentStatusLike[]) =>
    statuses.filter((x) => s.includes(x)).length;

  const valides = count('VALIDATED', 'CONVERTED');
  const progress: BatchProgress = {
    attendus: count('PENDING_FORM'),
    aVerifier: count('SUBMITTED', 'EXTRACTING', 'EXTRACTED'),
    valides,
    rejetes: count('REJECTED'),
    total: statuses.length,
    expected,
    percentValidated:
      expected && expected > 0 ? Math.round((valides / expected) * 100) : null,
  };
  return progress;
}

export interface DateOptionTally {
  id: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
  isRetained: boolean;
  votes: number;
}

/**
 * Le dépouillement des dates.
 *
 * `votes` est un objet `{ preEnrollmentId: true }` sur chaque option : compter
 * les CLÉS plutôt qu'un compteur incrémenté rend le dépouillement idempotent —
 * un participant qui revient sur sa réponse ne vote pas deux fois.
 */
export function tallyDateOptions(
  options: readonly {
    id: string;
    label: string | null;
    startsAt: Date;
    endsAt: Date;
    isRetained: boolean;
    votes: unknown;
  }[],
): DateOptionTally[] {
  return options.map((o) => ({
    id: o.id,
    label: o.label ?? '',
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    isRetained: o.isRetained,
    votes:
      o.votes && typeof o.votes === 'object' && !Array.isArray(o.votes)
        ? Object.values(o.votes as Record<string, unknown>).filter(Boolean).length
        : 0,
  }));
}
