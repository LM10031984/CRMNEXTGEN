/**
 * Qui relève de l'AGEFICE ? — SOURCE UNIQUE.
 *
 * Règle métier : un travailleur non salarié cotise à l'AGEFICE au titre de la
 * contribution à la formation professionnelle ; un salarié cotise à un OPCO
 * d'entreprise. Seuls les premiers ouvrent droit aux pièces AGEFICE — demande
 * de prise en charge et attestation d'assiduité.
 *
 * On les reconnaît de deux façons, l'une n'impliquant pas l'autre :
 *  - le PAYEUR de l'inscription est une structure rattachée à l'AGEFICE (cas
 *    courant : l'auto-entreprise du stagiaire est son propre commanditaire) ;
 *  - ou le stagiaire est lié à une structure qui porte un dossier AGEFICE
 *    (`AgeficeProfile`), en entreprise individuelle ou en agent commercial —
 *    le pattern récurrent de l'immobilier.
 *
 * PROBLÈME RÉSOLU (11/09/2026) : cette règle vivait en TROIS exemplaires —
 * `prepare-training` (deux fois), `closure-status`, et une version PLUS ÉTROITE
 * dans `closure-pack`, qui ne regardait que le payeur. Conséquence : la fiche
 * session annonçait « Attestation d'assiduité AGEFICE » comme attendue pour
 * N stagiaires, et le pack de fin de formation n'en produisait aucune (SES-0112,
 * 4 stagiaires AGEFICE, 2 attestations faites à la main). Un compteur et un
 * générateur qui ne parlent pas de la même population finissent toujours par
 * mentir à quelqu'un.
 */

import type { Prisma } from '@qualiof/db';

/**
 * Filtre Prisma sur `SessionParticipant`. À fusionner avec le `where` de
 * l'appelant — il ne porte PAS le `sessionId`, qui reste à sa charge.
 *
 * `import type` : le type seul, aucun import à l'exécution — ce module reste
 * utilisable dans les tests qui remplacent `@qualiof/db` par un mock.
 */
export const OU_AGEFICE: Prisma.SessionParticipantWhereInput[] = [
  { sponsorOrg: { opcoCode: 'AGEFICE' } },
  {
    person: {
      legalLinks: {
        some: {
          role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] },
          organization: { ageficeProfile: { isNot: null } },
        },
      },
    },
  },
];

/** Forme minimale d'un participant déjà chargé, vu par la règle. */
export interface ParticipantAgeficeLike {
  sponsorOrg?: { opcoCode?: string | null } | null;
  person?: {
    legalLinks?: { role: string; organization?: { ageficeProfile?: unknown } | null }[] | null;
  } | null;
}

/**
 * Même règle, appliquée en mémoire à un participant DÉJÀ chargé — pour les
 * appelants qui ont la liste sous la main et ne veulent pas d'une requête de
 * plus. Le résultat doit rester identique à celui de `OU_AGEFICE`.
 */
export function estEligibleAgefice(p: ParticipantAgeficeLike): boolean {
  if (p.sponsorOrg?.opcoCode === 'AGEFICE') return true;
  return (p.person?.legalLinks ?? []).some(
    (l) =>
      (l.role === 'EI_SELF' || l.role === 'AGENT_COMMERCIAL') &&
      l.organization?.ageficeProfile != null,
  );
}
