/**
 * Alerte A-2 — regrouper les leads dormants en UN envoi — fonction pure.
 *
 * PROBLÈME RÉSOLU (11/09/2026) : le cron envoyait un email PAR lead dormant.
 * Au premier passage sur un historique — ou le lendemain d'un salon, quand
 * trente contacts sont entrés d'un coup — c'est une avalanche dans la boîte,
 * et une avalanche ne se lit pas. Le digest existait déjà pour les dossiers
 * déposés (A-3) ; il manquait ici.
 *
 * POURQUOI GROUPER PAR DESTINATAIRES, et non « un seul mail pour tous »
 *
 * Le ciblage d'A-2 a un sens : le lead part à son commercial, et aux managers
 * en escalade. Un mail unique adressé à toute l'équipe enverrait à chacun les
 * leads des autres, et tout le monde apprendrait à l'ignorer.
 *
 * On regroupe donc par ENSEMBLE DE DESTINATAIRES : chaque groupe reçoit un
 * digest de ce qui le concerne. Quand toute l'équipe est ADMIN — le cas de
 * Start Academy aujourd'hui, où les managers reçoivent tout — cela donne bien
 * un seul mail par passage, sans avoir figé cette hypothèse dans le code.
 *
 * Aucun import prisma/next : on décide sur une liste déjà chargée.
 */

export interface LeadDormant {
  id: string;
  nom: string;
  hoursIdle: number;
  source: string | null;
  ownerUserId: string | null;
}

export interface GroupeAlerteLeadsDormants {
  /** Destinataires de ce digest, triés — la clé de regroupement. */
  userIds: string[];
  /** Les leads qui les concernent, du plus ancien au plus récent. */
  leads: LeadDormant[];
}

/**
 * Regroupe les leads dormants par ensemble de destinataires.
 *
 * @param destinatairesDe rend les `User.id` à prévenir pour un lead donné —
 *   injecté plutôt qu'importé, pour que la règle de ciblage reste chez elle
 *   (`leadStaleRecipients`) et que cette fonction n'ait rien à en savoir.
 */
export function grouperLeadsDormants(
  leads: readonly LeadDormant[],
  destinatairesDe: (lead: LeadDormant) => string[],
): GroupeAlerteLeadsDormants[] {
  const groupes = new Map<string, GroupeAlerteLeadsDormants>();

  for (const lead of leads) {
    const userIds = [...new Set(destinatairesDe(lead))].sort();
    // Un lead que personne ne doit recevoir n'est pas une alerte : l'ignorer
    // ici évite un groupe fantôme, et surtout un `staleAlertedAt` posé sur un
    // lead dont personne n'a jamais été prévenu.
    if (userIds.length === 0) continue;

    const cle = userIds.join('|');
    const existant = groupes.get(cle);
    if (existant) existant.leads.push(lead);
    else groupes.set(cle, { userIds, leads: [lead] });
  }

  // Le plus dormant en tête : c'est celui qu'il faut traiter en premier.
  for (const g of groupes.values()) {
    g.leads.sort((a, b) => b.hoursIdle - a.hoursIdle);
  }
  return [...groupes.values()];
}
