/**
 * Le lien d'une campagne de RDV (spec §7.2) — module PUR.
 *
 * Ni `'use server'`, ni `'use client'`, ni import Prisma : la page publique, les
 * server actions et la fiche campagne posent la même question — « ce lien
 * ouvre-t-il encore ? » — et doivent recevoir la même réponse. Une seule
 * définition, donc une seule façon de refuser.
 *
 * CE QUE CE LIEN EST, ET CE QU'IL N'EST PAS (précision de Laurent, 10/09/2026)
 *
 * Le lien de campagne ne porte AUCUN formulaire. Il distribue des liens
 * individuels : chaque participant qui l'ouvre repart avec SA pré-inscription
 * et son propre lien `/preinscription/[token]`. La raison est que tout le
 * pipeline existant — OCR, extraction, validation admin, motif de rejet,
 * relances — est accroché à une pré-inscription individuelle. Faire porter un
 * formulaire au lien partagé aurait construit un second pipeline à côté du
 * premier, exactement ce que le lot F doit éviter (§13 : « campagne par RDV
 * au-dessus, pas un second pipeline »).
 *
 * Conséquence de sécurité, et elle est la vraie raison du quota : un lien
 * partagé qu'on transfère est un lien qui fabrique des pré-inscriptions. D'où
 * `maxUses`, la révocation, et l'expiration — trois freins indépendants.
 */

export type CampagneLinkState =
  | 'ouverte'
  | 'expiree'
  | 'annulee'
  | 'cloturee'
  | 'quota-atteint';

export interface CampagneLinkInput {
  status: string;
  expiresAt: Date;
  /** null = pas de quota (le lien ne se ferme que par date ou révocation). */
  maxUses: number | null;
  usedCount: number;
}

/**
 * Ordre de priorité volontaire, du plus définitif au plus circonstanciel :
 * une révocation l'emporte sur tout, puis la clôture, puis l'expiration, et le
 * quota en dernier. Un quota relevé rouvre le lien ; une révocation, jamais —
 * sinon « annuler » ne voudrait rien dire.
 */
export function campagneLinkState(input: CampagneLinkInput, now: Date): CampagneLinkState {
  if (input.status === 'ANNULEE') return 'annulee';
  if (input.status === 'CLOTUREE') return 'cloturee';
  if (input.expiresAt.getTime() <= now.getTime()) return 'expiree';
  if (input.maxUses !== null && input.usedCount >= input.maxUses) return 'quota-atteint';
  return 'ouverte';
}

/** Ce qu'on montre au participant. Jamais le motif technique. */
export const CAMPAGNE_LINK_MESSAGE: Record<Exclude<CampagneLinkState, 'ouverte'>, string> = {
  expiree: 'Ce lien a expiré. Rapprochez-vous de votre responsable pour en obtenir un nouveau.',
  annulee: 'Ce lien n’est plus actif.',
  cloturee: 'Les inscriptions pour cette session sont closes.',
  'quota-atteint':
    'Le nombre d’inscriptions prévues pour ce lien est atteint. Rapprochez-vous de votre responsable.',
};

/**
 * Quota par défaut : 3 × l'effectif attendu (§4, `maxUses`).
 *
 * Trois et pas un, parce qu'un participant se trompe, recommence, ou ouvre le
 * lien sur son téléphone après l'avoir ouvert sur son poste. Un quota trop
 * serré transforme le premier faux pas en appel au support.
 */
export function defaultMaxUses(effectifAttendu: number): number {
  return Math.max(1, Math.ceil(effectifAttendu)) * 3;
}

export function buildCampagneUrl(token: string, baseUrl?: string): string {
  const root =
    baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  return `${root.replace(/\/+$/, '')}/rdv/${token}`;
}
