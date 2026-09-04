/**
 * Alerte A-2 — « ce lead dort depuis 24 h » (spec §11.1) — fonction pure.
 *
 * Aucun import prisma/next : la décision d'alerter se raisonne sur un statut,
 * deux dates et un seuil. C'est ce qui permet de la tester sans cron ni base —
 * et une alerte qu'on ne peut pas tester finit par mitrailler ou par se taire.
 *
 * Trois règles, et elles tiennent en une phrase chacune :
 *   • on n'alerte que sur un lead réellement DÉLAISSÉ — statut NEW, aucune
 *     action enregistrée. Un lead contacté puis mis en attente n'est pas
 *     oublié, il est suivi ;
 *   • **une seule alerte par lead** : `staleAlertedAt` est le marqueur, et
 *     c'est tout son objet. Un cron horaire qui repasse ne doit pas produire
 *     une alerte horaire ;
 *   • le marqueur se remet à null dès qu'une action est enregistrée, pour
 *     qu'un lead re-délaissé puisse ré-alerter. Sinon la deuxième négligence
 *     passerait inaperçue.
 */

/** Seuil par défaut, en heures. Paramétrable (spec §11.1). */
export const LEAD_STALE_HOURS = 24;

export interface LeadStaleInput {
  status: string;
  createdAt: Date;
  /** Dernière action commerciale enregistrée sur le lead. */
  lastActionAt: Date | null;
  /** Nombre de `LeadAction` — une seule suffit à considérer le lead pris en main. */
  actionCount: number;
  /** Marqueur d'alerte déjà envoyée. */
  staleAlertedAt: Date | null;
}

export type LeadStaleDecision =
  | { alert: false; reason: 'pas_nouveau' | 'deja_traite' | 'trop_recent' | 'deja_alerte' }
  | { alert: true; hoursIdle: number };

export function decideLeadStaleAlert(
  lead: LeadStaleInput,
  now: Date,
  thresholdHours: number = LEAD_STALE_HOURS,
): LeadStaleDecision {
  if (lead.status !== 'NEW') return { alert: false, reason: 'pas_nouveau' };
  if (lead.actionCount > 0 || lead.lastActionAt !== null) {
    return { alert: false, reason: 'deja_traite' };
  }
  if (lead.staleAlertedAt !== null) return { alert: false, reason: 'deja_alerte' };

  const hoursIdle = (now.getTime() - lead.createdAt.getTime()) / 3_600_000;
  if (hoursIdle < thresholdHours) return { alert: false, reason: 'trop_recent' };

  return { alert: true, hoursIdle: Math.floor(hoursIdle) };
}

/**
 * Qui reçoit l'alerte.
 *
 * Le commercial assigné d'abord — c'est son lead. Les MANAGER en escalade,
 * toujours : une alerte de négligence qui n'arrive qu'à la personne qui a
 * négligé ne sert à rien. Un lead sans propriétaire part à tous les commerciaux
 * ET aux managers : personne ne peut se dire que c'était à quelqu'un d'autre.
 */
export function leadStaleRecipients(args: {
  ownerUserId: string | null;
  users: readonly { id: string; role: string; email: string | null }[];
}): string[] {
  const managers = args.users.filter((u) => u.role === 'MANAGER' || u.role === 'ADMIN');
  const cible = args.ownerUserId
    ? args.users.filter((u) => u.id === args.ownerUserId)
    : args.users.filter((u) => u.role === 'COMMERCIAL');

  return [...new Set([...cible, ...managers].map((u) => u.id))];
}

/**
 * Qui reçoit l'alerte A-1 « nouveau lead ».
 *
 * Assigné → lui seul, c'est son lead et il n'a pas besoin d'un comité. Non
 * assigné → tous les commerciaux et les managers, parce qu'un lead qui n'est
 * à personne est un lead que personne ne prendra.
 */
export function newLeadRecipients(args: {
  ownerUserId: string | null;
  users: readonly { id: string; role: string; email: string | null }[];
}): string[] {
  if (args.ownerUserId) {
    return args.users.filter((u) => u.id === args.ownerUserId).map((u) => u.id);
  }
  return args.users
    .filter((u) => u.role === 'COMMERCIAL' || u.role === 'MANAGER')
    .map((u) => u.id);
}
