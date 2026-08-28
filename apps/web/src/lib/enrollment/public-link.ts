/**
 * Logique PURE du lien public d'inscription par session.
 *
 * Module neutre : ni 'use server', ni 'use client', ni import Prisma — il est
 * consommé à la fois par la page serveur publique, par les server actions et
 * (indirectement, via des props déjà calculées) par la fiche session.
 *
 * ⚠️ Pas d'import `node:crypto` ici : ce module doit rester importable des deux
 * côtés de la frontière RSC. `crypto.randomUUID()` est disponible en global
 * sur Node ≥ 19 comme dans le navigateur.
 */

export type PublicLinkState =
  | 'ouvert'
  | 'jamais-ouvert'
  | 'ferme'
  | 'session-terminee'
  | 'complet';

export interface PublicLinkInput {
  publicToken: string | null;
  publicFormClosedAt: Date | null;
  sessionStatus: string;
  capacityMax: number;
  /** Inscrits confirmés (SessionParticipant). */
  participantCount: number;
  /** Demandes reçues pas encore converties ni rejetées. */
  pendingRequestCount: number;
}

const STATUTS_CLOS = new Set(['COMPLETED', 'CANCELLED']);

export function generatePublicToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Ordre de priorité volontaire : une fermeture manuelle ou une session close
 * l'emporte toujours sur la disponibilité de places. On ne rouvre jamais un
 * lien « par surprise » parce qu'un participant a été désinscrit.
 */
export function publicLinkState(input: PublicLinkInput): PublicLinkState {
  if (!input.publicToken) return 'jamais-ouvert';
  if (input.publicFormClosedAt) return 'ferme';
  if (STATUTS_CLOS.has(input.sessionStatus)) return 'session-terminee';
  if (input.participantCount + input.pendingRequestCount >= input.capacityMax) {
    return 'complet';
  }
  return 'ouvert';
}

export function buildPublicEnrollmentUrl(token: string, baseUrl?: string): string {
  const root =
    baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    'http://localhost:3000';
  return `${root.replace(/\/+$/, '')}/inscription/${token}`;
}
