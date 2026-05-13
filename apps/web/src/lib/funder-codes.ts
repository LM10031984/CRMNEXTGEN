/**
 * Mapping centralisé code financeur → libellé user-friendly.
 *
 * Audit 2026-05-12 UX-12 : les codes raw (`OPCOMMERCE`, `OPCO_EP`) apparaissaient
 * tels quels dans les badges UI, créant une perception d'incohérence. La BDD
 * stocke toujours les codes raw (clés étrangères stables pour migrations OPCO),
 * seule la couche d'affichage les transforme en labels lisibles.
 *
 * Source des codes : `OpcoCatalog.code` (cf seed.ts + Prisma schema).
 */
export const FUNDER_LABELS: Record<string, string> = {
  AGEFICE: 'AGEFICE',
  OPCO_EP: 'OPCO EP',
  OPCOMMERCE: 'OPCO Commerce',
  ATLAS: 'ATLAS',
  AKTO: 'AKTO',
  AFDAS: 'AFDAS',
  CONSTRUCTYS: 'Constructys',
  FIFPL: 'FIFPL',
  CPF: 'CPF',
  POLE_EMPLOI: 'Pôle Emploi',
  OF: 'OF (auto-financé)',
};

/**
 * Retourne le label affichable pour un code financeur.
 * - Si le code est connu (cf FUNDER_LABELS) → label user-friendly
 * - Si inconnu → renvoie le code raw (pas de transformation)
 * - Si null/undefined → renvoie '—'
 */
export function formatFunderCode(code: string | null | undefined): string {
  if (!code) return '—';
  return FUNDER_LABELS[code] ?? code;
}
