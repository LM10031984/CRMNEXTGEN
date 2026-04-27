/**
 * Référentiel Qualiopi : 32 indicateurs.
 * Source : référentiel national qualité des prestataires d'actions concourant
 * au développement des compétences (RNCQ).
 *
 * Pour le MVP, on ne matérialise pas tous les indicateurs en DB — on garde
 * uniquement ceux qui sont mappés à des documents (table QualiopiDocCatalog).
 * Cette liste sert à la mise en feu tricolore (lot 3 / vision long terme).
 */

export interface QualiopiIndicator {
  code: string; // "Indicateur 7"
  number: number;
  title: string;
  category: 'Conditions' | 'Moyens' | 'Mise en œuvre' | 'Résultats' | 'Enregistrement';
}

export const QUALIOPI_INDICATORS: ReadonlyArray<QualiopiIndicator> = [
  { code: 'Indicateur 1', number: 1, title: "Information du public sur les prestations proposées", category: 'Conditions' },
  { code: 'Indicateur 2', number: 2, title: "Diffusion d'indicateurs de résultats", category: 'Conditions' },
  { code: 'Indicateur 3', number: 3, title: "Information sur les modalités, prix et conditions", category: 'Conditions' },
  { code: 'Indicateur 4', number: 4, title: "Analyse du besoin du bénéficiaire", category: 'Conditions' },
  { code: 'Indicateur 5', number: 5, title: "Définition des objectifs opérationnels et évaluables", category: 'Conditions' },
  { code: 'Indicateur 6', number: 6, title: "Information du bénéficiaire sur les conditions de déroulement", category: 'Conditions' },
  { code: 'Indicateur 7', number: 7, title: "Information du bénéficiaire sur le contenu pédagogique", category: 'Conditions' },
  { code: 'Indicateur 8', number: 8, title: "Adaptation aux publics bénéficiaires", category: 'Moyens' },
  { code: 'Indicateur 9', number: 9, title: "Adéquation des moyens pédagogiques, techniques et d'encadrement", category: 'Moyens' },
  { code: 'Indicateur 10', number: 10, title: "Coordination des intervenants", category: 'Moyens' },
  { code: 'Indicateur 11', number: 11, title: "Évaluation des acquis des bénéficiaires", category: 'Mise en œuvre' },
  { code: 'Indicateur 12', number: 12, title: "Engagement et assiduité du bénéficiaire", category: 'Mise en œuvre' },
  // ... (les autres indicateurs sont ajoutés au fil des besoins, non-MVP)
  { code: 'Indicateur 30', number: 30, title: "Recueil des appréciations et réclamations", category: 'Résultats' },
  { code: 'Indicateur 31', number: 31, title: "Mesures d'amélioration suite aux appréciations et réclamations", category: 'Résultats' },
  { code: 'Indicateur 32', number: 32, title: "Veille légale, réglementaire et qualité", category: 'Enregistrement' },
];
