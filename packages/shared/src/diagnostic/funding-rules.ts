/**
 * Référentiel de financement — clés et valeurs initiales.
 *
 * Règle d'architecture (spec §8) : AUCUN de ces nombres ne doit apparaître en
 * dur dans un moteur, un template ou un prompt. Les moteurs lisent `FundingRule`
 * par sa clé ; ce fichier ne sert qu'à (a) typer les clés et (b) semer les
 * valeurs de départ. Réviser une valeur en production = fermer la ligne active
 * (`validTo`) et en ouvrir une neuve, pas éditer ce fichier.
 *
 * Pourquoi c'est daté : une proposition signée en septembre doit rester
 * explicable en mars, même si le plafond AGEFICE a bougé entre-temps.
 */

export const FUNDING_RULE_KEYS = [
  'AGEFICE_THRESHOLD_CA_N1',
  'AGEFICE_ANNUAL_CAP',
  'AGEFICE_ANNUAL_CAP_REDUCED',
  'AGEFICE_HOURLY_PRESENTIEL',
  'AGEFICE_HOURLY_DISTANCIEL',
  'AGEFICE_LEAD_DAYS_MIN',
  'AGEFICE_INDEMNITY_MIN',
  'AGEFICE_INDEMNITY_MAX',
  'OPCO_EP_ENVELOPE_LT_11',
  'OPCO_EP_ENVELOPE_11_TO_50',
  'OPCO_EP_RATE_REGLEMENTAIRE',
  'OPCO_EP_RATE_COEUR_METIER',
  'PRICE_PER_HOUR_PER_PARTICIPANT',
  'HALF_DAY_ONSITE_HOURS',
  'TRAINER_COUNT_DEFAULT',
  'CONSUMPTION_LEVER_PERCENT',
  'DISCOUNT_WARNING_PERCENT',
  'PROPOSAL_VALIDITY_DAYS',
] as const;

export type FundingRuleKey = (typeof FUNDING_RULE_KEYS)[number];

export interface FundingRuleSeed {
  key: FundingRuleKey;
  valueNumeric: number;
  /** Ce que la valeur veut dire, et d'où elle sort. Recopié en base (`notes`). */
  notes: string;
}

/**
 * Valeurs initiales — arbitrages Laurent du 01/09/2026 et PRD OPCO EP du repo diag.
 * Vérifiées le 01/09/2026 ; à re-vérifier à chaque campagne annuelle AGEFICE.
 */
export const FUNDING_RULE_SEEDS: readonly FundingRuleSeed[] = [
  // ── AGEFICE (indépendants, TNS) ──────────────────────────────────────────
  {
    key: 'AGEFICE_THRESHOLD_CA_N1',
    valueNumeric: 7000,
    notes:
      "Seuil de CA N-1 (€) au-delà duquel un indé est POTENTIELLEMENT éligible. C'est un proxy commercial utilisé en R1, quand la CFP n'est pas connue. Dès que le CRM porte AgeficeProfile.lastCfpEligibleBudget, c'est la CFP réelle qui fait foi — jamais ce seuil.",
  },
  {
    key: 'AGEFICE_ANNUAL_CAP',
    valueNumeric: 3000,
    notes:
      "Enveloppe annuelle par indé éligible (€). PLAFOND DUR : la prise en charge affichée ne le dépasse jamais, même si heures × taux donne davantage (72 h × 42 = 3 024 → retenu 3 000, l'écart part en reste à charge). Afficher au-dessus serait une mention trompeuse de financement.",
  },
  {
    key: 'AGEFICE_ANNUAL_CAP_REDUCED',
    valueNumeric: 600,
    notes:
      'Enveloppe annuelle réduite quand la CFP déclarée est faible (< 7 €). Aligné sur AgeficeProfile.lastCfpEligibleBudget (3000 | 600 | 0).',
  },
  {
    key: 'AGEFICE_HOURLY_PRESENTIEL',
    valueNumeric: 42,
    notes: 'Taux horaire de prise en charge AGEFICE en présentiel (€/h). Vérifié le 01/09/2026.',
  },
  {
    key: 'AGEFICE_HOURLY_DISTANCIEL',
    valueNumeric: 35,
    notes: 'Taux horaire AGEFICE en distanciel synchrone (€/h).',
  },
  {
    key: 'AGEFICE_LEAD_DAYS_MIN',
    valueNumeric: 15,
    notes:
      "Délai minimal (jours calendaires) entre le dépôt du dossier et le démarrage. C'est ce qui fixe la deadline « pièces réunies au plus tard le … » affichée aux participants.",
  },
  {
    key: 'AGEFICE_INDEMNITY_MIN',
    valueNumeric: 700,
    notes:
      "Borne basse de l'indemnisation perçue PAR l'agent formé (€). Argument commercial : à afficher comme une fourchette, jamais comme un montant garanti.",
  },
  {
    key: 'AGEFICE_INDEMNITY_MAX',
    valueNumeric: 800,
    notes: "Borne haute de l'indemnisation perçue par l'agent formé (€).",
  },

  // ── OPCO EP (salariés, IDCC 1527) ────────────────────────────────────────
  {
    key: 'OPCO_EP_ENVELOPE_LT_11',
    valueNumeric: 2500,
    notes:
      "Enveloppe annuelle de L'ENTREPRISE (€) pour moins de 11 salariés — pas par salarié. Au-delà de 50 salariés : aucune valeur automatique, le moteur affiche « à valider manuellement avec l'OPCO EP ».",
  },
  {
    key: 'OPCO_EP_ENVELOPE_11_TO_50',
    valueNumeric: 4500,
    notes:
      "Enveloppe annuelle de l'entreprise (€) de 11 à 50 salariés. D-7 : 4 500 (dit le 01/09) retenu contre ≈ 4 000 (proposition OPTIMO du 11/08) — modifiable ici sans redéploiement.",
  },
  {
    key: 'OPCO_EP_RATE_REGLEMENTAIRE',
    valueNumeric: 40,
    notes:
      'Taux horaire OPCO EP (€/h) pour les contenus réglementaires UNIQUEMENT : TRACFIN, non-discrimination, déontologie. Piloté par TrainingProduct.fundingType, jamais par un test sur le code produit.',
  },
  {
    key: 'OPCO_EP_RATE_COEUR_METIER',
    valueNumeric: 30,
    notes:
      'Taux horaire OPCO EP (€/h) pour tout le reste (défaut). Présentiel uniquement : un module distanciel donne 0 € et une alerte.',
  },

  // ── Tarification Start Academy ───────────────────────────────────────────
  {
    key: 'PRICE_PER_HOUR_PER_PARTICIPANT',
    valueNumeric: 84,
    notes:
      "Tarif de vente tout compris, € HT par heure SUR SITE et par participant — PAS par heure conventionnée. Attention au piège : le prix se calcule sur les heures sur site (4 h × 84 = 336 € la demi-journée), le financement sur les heures conventionnées (8 h × 42 = 336 €). Les deux bases diffèrent d'un facteur TRAINER_COUNT_DEFAULT et tombent sur le même montant : les confondre double ou divise par deux un devis. C'est la main de Laurent sur le prix.",
  },
  {
    key: 'HALF_DAY_ONSITE_HOURS',
    valueNumeric: 4,
    notes:
      "Durée SUR SITE d'une demi-journée (h) — l'unité de vente et de dimensionnement, et l'assiette du prix. Les heures conventionnées, elles, valent ce nombre × TRAINER_COUNT_DEFAULT.",
  },
  {
    key: 'TRAINER_COUNT_DEFAULT',
    valueNumeric: 2,
    notes:
      "Nombre de formateurs en co-animation. Heures conventionnées = heures sur site × ce nombre. LIGNE ROUGE : la valeur obtenue est LA référence unique — proposition, convention, émargement, attestation et dossier financeur portent le même nombre d'heures. L'émargement doit refléter les 2 formateurs. Multiplicateur assumé, à faire valider une fois par l'expert-comptable / l'auditeur Qualiopi (D-6).",
  },

  // ── Seuils de pilotage ───────────────────────────────────────────────────
  {
    key: 'CONSUMPTION_LEVER_PERCENT',
    valueNumeric: 30,
    notes:
      "Sous ce taux de consommation des droits sur 24 mois, on affiche le levier « vos droits sont sous-utilisés ». Toujours formulé « environ X % » — c'est un déclaratif.",
  },
  {
    key: 'DISCOUNT_WARNING_PERCENT',
    valueNumeric: 15,
    notes:
      "Au-delà de ce % du RESTE À CHARGE, une remise exige la validation d'un MANAGER/ADMIN et bloque l'envoi tant qu'elle n'est pas approuvée (D-3 : MANAGER suffit).",
  },
  {
    key: 'PROPOSAL_VALIDITY_DAYS',
    valueNumeric: 30,
    notes: "Validité par défaut d'une proposition (jours). Relance automatique à J-5 (lot H).",
  },
];
