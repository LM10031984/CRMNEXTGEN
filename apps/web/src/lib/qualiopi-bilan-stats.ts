// Stub — module absent du commit. À remplacer par l'agrégation Qualiopi réelle.
export interface QualiopiBilanData {
  rows: Array<Record<string, unknown>>;
}

export async function getQualiopiBilan(_tenantId: string): Promise<QualiopiBilanData> {
  return { rows: [] };
}
