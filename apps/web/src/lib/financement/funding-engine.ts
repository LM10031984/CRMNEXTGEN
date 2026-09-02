/**
 * Moteur budget & tarification (spec §8) — fonction pure.
 *
 * Le renversement commercial qu'il encode : on ne vend pas un prix, on
 * dimensionne une formation à la hauteur des droits disponibles. Le moteur
 * PROPOSE un volume ; le commercial l'ajuste librement ensuite.
 *
 * Trois règles qui ne se négocient pas :
 *   • une prise en charge affichée ne dépasse JAMAIS le plafond du régime ;
 *   • AGEFICE et OPCO EP se calculent séparément et s'affichent consolidés
 *     (deux dossiers administratifs distincts, UN reste à charge) ;
 *   • un surplus au-delà d'une enveloppe est un reste à charge, pas une
 *     répartition automatique entre participants — l'arbitrage est humain.
 */

import type {
  BudgetSource,
  FundingAlert,
  FundingComputeInput,
  FundingParticipantInput,
  FundingParticipantResult,
  FundingSynthesis,
  ParticipantRegime,
} from './types';

/** Arrondi au centime — évite les 12095.999999999998 en bout de chaîne. */
function euros(n: number): number {
  return Math.round(n * 100) / 100;
}

function regimeOf(p: FundingParticipantInput): ParticipantRegime {
  // Un dirigeant est TNS dans l'immense majorité des agences : il relève de
  // l'AGEFICE comme les agents commerciaux. Un salarié n'y a droit que si
  // l'éligibilité OPCO a été confirmée.
  if (p.statut === 'INDEPENDANT' || p.statut === 'DIRIGEANT') return 'AGEFICE';
  if (p.statut === 'SALARIE' && p.opcoEligible === true) return 'OPCO_EP';
  return 'AUCUN';
}

/**
 * Droits AGEFICE d'une personne.
 *
 * Ordre de vérité : la CFP réelle lue au CRM l'emporte toujours sur le seuil
 * déclaratif de production N-1, qui n'est qu'un proxy commercial utilisable
 * tant qu'on ne connaît pas la personne. Promettre 3 000 € sur un déclaratif
 * quand la CFP n'en ouvre que 600 est la faute qui coûte un dossier.
 */
function ageficeBudget(
  p: FundingParticipantInput,
  rules: FundingComputeInput['rules'],
): { budget: number; source: BudgetSource } {
  const consumed = p.consumedThisYear ?? 0;
  if (p.cfpEligibleBudget !== null) {
    return { budget: Math.max(0, p.cfpEligibleBudget - consumed), source: 'cfp_verifiee' };
  }
  if (p.caN1 === null) return { budget: 0, source: 'aucun' };
  if (p.caN1 > rules.AGEFICE_THRESHOLD_CA_N1) {
    return {
      budget: Math.max(0, rules.AGEFICE_ANNUAL_CAP - consumed),
      source: 'estimation_ca_n1',
    };
  }
  return { budget: 0, source: 'aucun' };
}

/**
 * Enveloppe annuelle de l'ENTREPRISE au titre de l'OPCO EP — pas un droit
 * individuel. Au-delà de 50 salariés, aucune valeur n'est calculable : on rend
 * `null`, jamais un montant plausible.
 */
function opcoEnvelope(
  employeeCount: number | null,
  rules: FundingComputeInput['rules'],
): { envelope: number | null; manual: boolean } {
  if (employeeCount === null) return { envelope: null, manual: true };
  if (employeeCount > 50) return { envelope: null, manual: true };
  if (employeeCount < 11) return { envelope: rules.OPCO_EP_ENVELOPE_LT_11, manual: false };
  return { envelope: rules.OPCO_EP_ENVELOPE_11_TO_50, manual: false };
}

export function computeFunding(input: FundingComputeInput): FundingSynthesis {
  const { rules, modality, fundingType } = input;
  const computedAt = input.computedAt ?? new Date().toISOString();
  const alerts: FundingAlert[] = [];

  const participants = input.participants.filter((p) => p.includedInProposal);

  const onsiteHoursPerHalfDay = rules.HALF_DAY_ONSITE_HOURS;
  const conventionedHoursPerHalfDay = onsiteHoursPerHalfDay * rules.TRAINER_COUNT_DEFAULT;
  const pricePerHalfDay = onsiteHoursPerHalfDay * rules.PRICE_PER_HOUR_PER_PARTICIPANT;

  const ageficeRate =
    modality === 'DISTANCIEL' ? rules.AGEFICE_HOURLY_DISTANCIEL : rules.AGEFICE_HOURLY_PRESENTIEL;
  const opcoRate =
    fundingType === 'REGLEMENTAIRE'
      ? rules.OPCO_EP_RATE_REGLEMENTAIRE
      : rules.OPCO_EP_RATE_COEUR_METIER;

  // ── Droits, par participant puis par régime ────────────────────────────────
  const { envelope, manual } = opcoEnvelope(input.employeeCount, rules);
  const opcoBudget =
    envelope === null ? 0 : Math.max(0, envelope - (input.companyOpcoConsumed ?? 0));

  const rows = participants.map((p) => {
    const regime = regimeOf(p);
    if (regime === 'AGEFICE') {
      const { budget, source } = ageficeBudget(p, rules);
      return { p, regime, budget, source, hourlyRate: ageficeRate };
    }
    if (regime === 'OPCO_EP') {
      return {
        p,
        regime,
        budget: 0, // le droit est à l'entreprise, pas à la personne
        source: 'enveloppe_entreprise' as BudgetSource,
        hourlyRate: opcoRate,
      };
    }
    return { p, regime, budget: 0, source: 'aucun' as BudgetSource, hourlyRate: 0 };
  });

  const ageficeRows = rows.filter((r) => r.regime === 'AGEFICE');
  const opcoRows = rows.filter((r) => r.regime === 'OPCO_EP');

  // ── Dimensionnement : le budget fabrique le volume ─────────────────────────
  //
  // Pour chaque participant, on convertit ses droits en heures finançables, on
  // en prend la moyenne (le groupe avance ensemble, tout le monde fait les
  // mêmes demi-journées), et on arrondit à la demi-journée LA PLUS PROCHE.
  //
  // L'arrondi au plus proche, et non à l'inférieur, est un choix assumé : c'est
  // lui qui produit les 9 demi-journées de la fixture canonique (71,4 h de
  // droits ÷ 8 h = 8,93). Arrondir à l'inférieur donnerait 8 demi-journées et
  // laisserait 312 € de droits par agent inutilisés ; arrondir au plus proche
  // consomme les droits et fait apparaître 24 €/agent de dépassement, visible
  // en reste à charge. On préfère un écart montré à des droits perdus.
  let halfDays: number;
  if (input.halfDaysOverride !== undefined && input.halfDaysOverride !== null) {
    halfDays = Math.max(0, Math.round(input.halfDaysOverride));
  } else if (participants.length === 0) {
    halfDays = 0;
  } else {
    const opcoShareHours =
      opcoRows.length > 0 && opcoRate > 0 ? opcoBudget / opcoRows.length / opcoRate : 0;
    const fundableHours = rows.map((r) =>
      r.regime === 'OPCO_EP' ? opcoShareHours : r.hourlyRate > 0 ? r.budget / r.hourlyRate : 0,
    );
    const average = fundableHours.reduce((s, h) => s + h, 0) / fundableHours.length;
    halfDays = Math.max(0, Math.round(average / conventionedHoursPerHalfDay));
  }

  const onsiteHours = halfDays * onsiteHoursPerHalfDay;
  const conventionedHours = halfDays * conventionedHoursPerHalfDay;
  const pricePerParticipant = euros(halfDays * pricePerHalfDay);

  // ── Prise en charge ────────────────────────────────────────────────────────
  let ageficeCapped = false;

  const ageficeResults: FundingParticipantResult[] = ageficeRows.map((r) => {
    const uncapped = euros(conventionedHours * r.hourlyRate);
    const coverage = euros(Math.min(uncapped, r.budget, pricePerParticipant));
    if (coverage < uncapped && r.budget > 0) ageficeCapped = true;
    return {
      id: r.p.id,
      regime: r.regime,
      budget: euros(r.budget),
      budgetSource: r.source,
      hourlyRate: r.hourlyRate,
      coverageUncapped: uncapped,
      coverage,
      price: pricePerParticipant,
      remainder: euros(pricePerParticipant - coverage),
    };
  });

  // OPCO EP : l'enveloppe est GLOBALE. On sert dans l'ordre des participants
  // jusqu'à épuisement, sans jamais répartir « équitablement » de nous-mêmes :
  // arbitrer qui passe et qui attend est une décision commerciale, pas une
  // règle de calcul (spec §5 L-14).
  const opcoCovered = modality === 'DISTANCIEL' || manual ? 0 : opcoBudget;
  let opcoRemaining = opcoCovered;
  let opcoOverflow = false;

  const opcoResults: FundingParticipantResult[] = opcoRows.map((r) => {
    const uncapped = euros(conventionedHours * r.hourlyRate);
    const grant = euros(Math.min(uncapped, opcoRemaining, pricePerParticipant));
    opcoRemaining = euros(opcoRemaining - grant);
    if (grant < Math.min(uncapped, pricePerParticipant)) opcoOverflow = true;
    return {
      id: r.p.id,
      regime: r.regime,
      budget: euros(opcoBudget),
      budgetSource: r.source,
      hourlyRate: r.hourlyRate,
      coverageUncapped: uncapped,
      coverage: grant,
      price: pricePerParticipant,
      remainder: euros(pricePerParticipant - grant),
    };
  });

  const noneResults: FundingParticipantResult[] = rows
    .filter((r) => r.regime === 'AUCUN')
    .map((r) => ({
      id: r.p.id,
      regime: r.regime,
      budget: 0,
      budgetSource: 'aucun' as BudgetSource,
      hourlyRate: 0,
      coverageUncapped: 0,
      coverage: 0,
      price: pricePerParticipant,
      remainder: pricePerParticipant,
    }));

  // On restitue les participants dans l'ordre d'entrée : la grille équipe à
  // l'écran ne doit pas se réordonner toute seule sous les yeux du commercial.
  const byId = new Map([...ageficeResults, ...opcoResults, ...noneResults].map((r) => [r.id, r]));
  const results = participants.map((p) => byId.get(p.id)!);

  const totalPrice = euros(results.reduce((s, r) => s + r.price, 0));
  const ageficeCoverage = euros(ageficeResults.reduce((s, r) => s + r.coverage, 0));
  const opcoCoverage = euros(opcoResults.reduce((s, r) => s + r.coverage, 0));
  const totalCoverage = euros(ageficeCoverage + opcoCoverage);
  const totalRemainder = euros(totalPrice - totalCoverage);

  // ── Taux de consommation sur 24 mois ───────────────────────────────────────
  //
  // Une absence de déclaration n'est pas un zéro : sans aucun montant saisi, on
  // n'affiche rien plutôt que d'annoncer « 0 % de vos droits consommés », qui
  // serait un argument construit sur du vide.
  const declared = participants.filter((p) => p.trainings24mFunded !== null);
  const theoretical24m = ageficeRows.reduce((s, r) => s + r.budget, 0) * 2;
  const consumed24m = declared.reduce((s, p) => s + (p.trainings24mFunded ?? 0), 0);
  const consumptionRate24m =
    declared.length === 0 || theoretical24m <= 0
      ? null
      : Math.round((consumed24m / theoretical24m) * 1000) / 10;

  // ── Alertes ────────────────────────────────────────────────────────────────
  const push = (a: FundingAlert) => {
    if (!alerts.some((x) => x.code === a.code)) alerts.push(a);
  };

  if (ageficeRows.some((r) => r.p.caN1 === null && r.p.cfpEligibleBudget === null)) {
    push({
      code: 'agefice_ca_n1_manquant',
      label:
        'Production N-1 manquante pour au moins un indépendant — ses droits ne peuvent pas être estimés.',
      severity: 'warning',
      audience: 'internal',
    });
  }
  if (ageficeResults.some((r) => r.budgetSource === 'estimation_ca_n1')) {
    push({
      code: 'agefice_estimation_non_acquise',
      label:
        "Droits AGEFICE estimés à partir de la production déclarée. À confirmer par l'attestation CFP — une estimation n'est pas un droit acquis.",
      severity: 'info',
      audience: 'client',
    });
  }
  if (ageficeRows.some((r) => r.p.statut === 'DIRIGEANT' && r.p.cfpEligibleBudget === null)) {
    push({
      code: 'agefice_dirigeant_sous_reserve_cfp',
      label: 'Financement du dirigeant sous réserve de sa contribution formation professionnelle.',
      severity: 'info',
      audience: 'client',
    });
  }
  if (ageficeCapped) {
    push({
      code: 'agefice_plafond_atteint',
      label:
        "Le volume dépasse le plafond annuel AGEFICE : l'écart apparaît en reste à charge, il n'est pas pris en charge.",
      severity: 'warning',
      audience: 'client',
    });
  }
  if (manual && opcoRows.length > 0) {
    push({
      code: 'opco_ep_effectif_superieur_50',
      label:
        "Plus de 50 salariés : l'enveloppe OPCO EP est à valider manuellement avec l'opérateur.",
      severity: 'blocking',
      audience: 'internal',
    });
  }
  if (modality === 'DISTANCIEL' && opcoRows.length > 0) {
    push({
      code: 'opco_ep_distanciel_non_pris_en_charge',
      label:
        "L'OPCO EP ne prend en charge que le présentiel : ce format n'ouvre aucun financement salarié.",
      severity: 'warning',
      audience: 'client',
    });
  }
  if (opcoOverflow && !manual && modality !== 'DISTANCIEL') {
    push({
      code: 'opco_ep_enveloppe_depassee',
      label:
        "L'enveloppe entreprise ne couvre pas tous les salariés du groupe. Répartir, réduire le volume ou assumer le reste à charge : c'est un arbitrage à prendre, pas un calcul.",
      severity: 'warning',
      audience: 'internal',
    });
  }
  if (ageficeRows.length > 0 && opcoRows.length > 0) {
    push({
      code: 'deux_dossiers_distincts',
      label:
        'Deux dossiers administratifs distincts seront montés (AGEFICE pour les indépendants, OPCO EP pour les salariés) — pour un seul reste à charge.',
      severity: 'info',
      audience: 'client',
    });
  }
  if (consumptionRate24m !== null && consumptionRate24m < rules.CONSUMPTION_LEVER_PERCENT) {
    push({
      code: 'droits_sous_utilises',
      label: `Environ ${consumptionRate24m} % des financements mobilisables ont été utilisés ces deux dernières années.`,
      severity: 'info',
      audience: 'client',
      context: { rate: consumptionRate24m, threshold: rules.CONSUMPTION_LEVER_PERCENT },
    });
  }
  if (participants.length > 0 && totalCoverage === 0) {
    push({
      code: 'aucun_droit_mobilisable',
      label:
        "Aucun financement mobilisable en l'état — vérifier les statuts, les CFP et l'éligibilité OPCO.",
      severity: 'warning',
      audience: 'internal',
    });
  }

  return {
    halfDays,
    onsiteHours,
    conventionedHours,
    participants: results,
    agefice: {
      participantCount: ageficeRows.length,
      budget: euros(ageficeRows.reduce((s, r) => s + r.budget, 0)),
      coverage: ageficeCoverage,
    },
    opcoEp: {
      participantCount: opcoRows.length,
      envelope,
      manualValidationRequired: manual && opcoRows.length > 0,
      budget: euros(opcoBudget),
      coverage: opcoCoverage,
    },
    totalPrice,
    totalCoverage,
    totalRemainder,
    consumptionRate24m,
    alerts,
    computedAt,
  };
}
