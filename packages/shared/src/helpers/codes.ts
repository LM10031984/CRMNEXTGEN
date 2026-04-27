/**
 * Génération de codes lisibles : sessions, documents, factures.
 * Formats inspirés de SmartOF / Airtable existants.
 */

/** Code session : SES-YYYY-NNN (ex: SES-2026-001) */
export function sessionCode(year: number, sequence: number): string {
  return `SES-${year}-${String(sequence).padStart(3, '0')}`;
}

/** Code formation produit : PROD-NNNN (ex: PROD-0027) */
export function productCode(sequence: number): string {
  return `PROD-${String(sequence).padStart(4, '0')}`;
}

/** Code document : <TYPE>-YYYY-NNNN (ex: CONV-2026-0001) */
export function documentCode(type: string, year: number, sequence: number): string {
  const prefix = type.substring(0, 4).toUpperCase();
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}

/** Numéro de facture : FAC-YYYY-NNNNNN — numérotation continue exigée par le code de commerce. */
export function invoiceNumber(year: number, sequence: number): string {
  return `FAC-${year}-${String(sequence).padStart(6, '0')}`;
}
