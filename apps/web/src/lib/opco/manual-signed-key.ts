/** Seul un dépôt avec fichier et date constitue une preuve ; un statut seul ne suffit pas. */
export function manualSignedKey(
  statuses: unknown,
  type: string,
  generatedAt?: Date,
): string | null {
  if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) return null;
  const entry = (statuses as Record<string, unknown>)[type];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const scan = entry as Record<string, unknown>;
  const key = typeof scan.uploadedSignedPdfKey === 'string' ? scan.uploadedSignedPdfKey.trim() : '';
  const date = typeof scan.uploadedSignedAt === 'string' ? Date.parse(scan.uploadedSignedAt) : NaN;
  return scan.state === 'MANUAL_OK' &&
    key &&
    Number.isFinite(date) &&
    (!generatedAt || date >= generatedAt.getTime())
    ? key
    : null;
}
