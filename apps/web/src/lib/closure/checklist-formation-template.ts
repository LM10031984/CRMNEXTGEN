// Stub — module absent du commit. À remplacer par le vrai template HTML.
export interface ChecklistAdministratif {
  [key: string]: unknown;
}
export interface ChecklistRepas {
  [key: string]: unknown;
}
export interface ChecklistMateriel {
  [key: string]: unknown;
}
export interface ChecklistFormationData {
  administratif?: ChecklistAdministratif;
  repas?: ChecklistRepas;
  materiel?: ChecklistMateriel;
  [key: string]: unknown;
}

export function renderChecklistFormationHtml(_data: ChecklistFormationData): string {
  return '<html><body><p>Checklist non implémentée (stub)</p></body></html>';
}
