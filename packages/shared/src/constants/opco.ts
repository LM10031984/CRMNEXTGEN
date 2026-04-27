/** Référentiel OPCO normalisé (mappage des libellés humains vers les codes du CRM). */

export const OPCO_CODES = {
  AGEFICE: 'AGEFICE',
  OPCO_EP: 'OPCO_EP',
  ATLAS: 'ATLAS',
  CPF: 'CPF',
  AKTO: 'AKTO',
  CONSTRUCTYS: 'CONSTRUCTYS',
  AUTRE: 'AUTRE',
} as const;

export type OpcoCode = (typeof OPCO_CODES)[keyof typeof OPCO_CODES];

/**
 * Reconnaît un OPCO depuis un texte libre (export SmartOF, Airtable).
 * Renvoie le code canonique ou null.
 */
export function detectOpco(input: string | null | undefined): OpcoCode | null {
  if (!input) return null;
  const norm = input.trim().toLowerCase();
  if (norm.includes('agefice')) return OPCO_CODES.AGEFICE;
  if (norm.includes('opco ep') || norm.includes('opcoep')) return OPCO_CODES.OPCO_EP;
  if (norm.includes('atlas')) return OPCO_CODES.ATLAS;
  if (norm.includes('cpf') || norm.includes('mon compte formation')) return OPCO_CODES.CPF;
  if (norm.includes('akto')) return OPCO_CODES.AKTO;
  if (norm.includes('constructys')) return OPCO_CODES.CONSTRUCTYS;
  return null;
}
