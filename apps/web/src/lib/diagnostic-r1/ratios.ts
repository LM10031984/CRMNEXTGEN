/**
 * Moteur ratios & alertes du diagnostic (lot D) — fonction pure.
 *
 * Porté du `ratios-service` du repo diag, réaligné sur le référentiel 94
 * questions de QualiOF : les données de contexte (CA N-1, ventes, effectifs) ne
 * viennent plus de colonnes SQL mais de réponses `identity-*` / `team-*`.
 *
 * Séparation assumée avec `pipeline.ts` : le pipeline est la synthèse COURTE
 * montrée en rendez-vous après le chapitre 8. Ici on calcule tout ce que le
 * rapport d'audit doit porter, chapitre par chapitre.
 *
 * Deux règles qui gouvernent tout le fichier :
 *   • une donnée absente n'est jamais un zéro. `null` se propage, et se dit ;
 *   • une alerte porte son audience. Les manques de données sont du pilotage
 *     interne, pas un constat à remettre au dirigeant.
 */

import { DEFAULT_BENCHMARKS, type BenchmarksOverride } from './benchmarks';

export type AlertSeverity = 'info' | 'warning' | 'error';

/**
 * `client` = constat métier, présentable dans l'audit remis.
 * `internal` = pilotage commercial (donnée manquante, précondition non
 * satisfaite). Distinguable structurellement pour qu'aucun filtrage par
 * texte ne soit nécessaire côté rendu.
 */
export type AlertAudience = 'client' | 'internal';

export interface DiagnosticAlert {
  code: string;
  chapter: number | null;
  label: string;
  severity: AlertSeverity;
  audience: AlertAudience;
  observed: number | null;
  threshold: number | null;
}

export interface RatiosInput {
  answers: Record<string, unknown>;
  participants: {
    statut: 'INDEPENDANT' | 'SALARIE' | 'DIRIGEANT';
    caN1: number | null;
    trainings24mFunded: number | null;
  }[];
  benchmarks?: BenchmarksOverride;
  /** Plafond annuel par indépendant, pour le taux de consommation 24 mois. */
  ageficeAnnualCap?: number;
  consumptionLeverPercent?: number;
}

export interface RatiosOutput {
  ratios: Record<string, number | null>;
  /** Libellés prêts à afficher — « environ » quand c'est une estimation. */
  labels: Record<string, string>;
  alerts: DiagnosticAlert[];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[%€\s ]/g, '').replace(',', '.');
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function computeRatios(input: RatiosInput): RatiosOutput {
  const b = { ...DEFAULT_BENCHMARKS, ...(input.benchmarks ?? {}) };
  const a = input.answers;
  const alerts: DiagnosticAlert[] = [];
  const ratios: Record<string, number | null> = {};
  const labels: Record<string, string> = {};

  const push = (alert: DiagnosticAlert) => {
    if (!alerts.some((x) => x.code === alert.code)) alerts.push(alert);
  };

  // ── Contexte ───────────────────────────────────────────────────────────────
  const ventesN1 = num(a['identity-sales-n1']);
  const caN1 = num(a['identity-revenue-n1']);
  const collaborateurs = num(a['team-total-count']);
  const independants = num(a['team-independents-count']);
  const salaries = num(a['team-employees-count']);
  const transactionAncien = num(a['identity-transaction-ancien-percent']);

  ratios.caMoyenParVente = ratio(caN1, ventesN1);
  if (ratios.caMoyenParVente !== null) {
    labels.caMoyenParVente = `${eur.format(ratios.caMoyenParVente)} par vente`;
  }

  ratios.caParCollaborateur = ratio(caN1, collaborateurs);
  if (ratios.caParCollaborateur !== null) {
    labels.caParCollaborateur = `${eur.format(ratios.caParCollaborateur)} par collaborateur`;
  }

  // Les ventes se font par les commerciaux, pas par l'assistante : le
  // dénominateur est l'effectif commercial, pas l'effectif total.
  const commerciaux =
    independants !== null || salaries !== null ? (independants ?? 0) + (salaries ?? 0) : null;
  ratios.ventesParAgent = ratio(ventesN1, commerciaux);
  if (ratios.ventesParAgent !== null) {
    labels.ventesParAgent = `${ratios.ventesParAgent} ventes par commercial et par an`;
  }

  if (transactionAncien !== null && transactionAncien < b.transactionAncienMinPercent) {
    push({
      code: 'transaction_ancien_lt_50',
      chapter: 1,
      label: `La transaction dans l'ancien ne pèse que ${transactionAncien} % de votre activité : nos repères, calibrés sur l'ancien, sont à lire avec cette réserve.`,
      severity: 'info',
      audience: 'client',
      observed: transactionAncien,
      threshold: b.transactionAncienMinPercent,
    });
  }

  // ── Chaîne commerciale ─────────────────────────────────────────────────────
  const contacts = num(a['prospecting-contacts-per-month']);
  const rdv = num(a['seller-meetings-per-month']);
  const mandats = num(a['mandates-per-month']);
  const visites = num(a['visits-per-month']);
  const offres = num(a['offers-per-month']);
  const compromis = num(a['compromis-per-month']);
  const actes = num(a['actes-per-month']);

  ratios.contactsToRdvPercent = pct(rdv, contacts);
  ratios.rdvToMandatPercent = pct(mandats, rdv);
  ratios.offresToCompromisPercent = pct(compromis, offres);
  ratios.compromisToActePercent = pct(actes, compromis);
  ratios.visitesParVente = ratio(visites, actes);
  ratios.exclusivityPercent = num(a['mandates-exclusivity-percent']);

  const belowBenchmark = (
    key: string,
    value: number | null,
    threshold: number,
    chapter: number,
    label: string,
  ) => {
    if (value !== null && value < threshold) {
      push({
        code: key,
        chapter,
        label,
        severity: 'warning',
        audience: 'client',
        observed: value,
        threshold,
      });
    }
  };

  belowBenchmark(
    'contacts_to_rdv_below_benchmark',
    ratios.contactsToRdvPercent,
    b.contactsToRdvPercent,
    3,
    `Sur 100 contacts vendeurs, ${ratios.contactsToRdvPercent} obtiennent un rendez-vous, contre ${b.contactsToRdvPercent} attendus.`,
  );
  belowBenchmark(
    'rdv_to_mandat_below_benchmark',
    ratios.rdvToMandatPercent,
    b.rdvToMandatPercent,
    4,
    `${ratios.rdvToMandatPercent} % de vos rendez-vous estimation se transforment en mandat, contre ${b.rdvToMandatPercent} % attendus.`,
  );
  belowBenchmark(
    'exclusivity_below_benchmark',
    ratios.exclusivityPercent,
    b.exclusivityPercent,
    5,
    `L'exclusivité représente ${ratios.exclusivityPercent} % de vos rentrées, contre ${b.exclusivityPercent} % attendus.`,
  );
  belowBenchmark(
    'offres_to_compromis_below_benchmark',
    ratios.offresToCompromisPercent,
    b.offresToCompromisPercent,
    8,
    `${ratios.offresToCompromisPercent} % de vos offres se concrétisent en compromis, contre ${b.offresToCompromisPercent} % attendus.`,
  );
  belowBenchmark(
    'compromis_to_acte_below_benchmark',
    ratios.compromisToActePercent,
    b.compromisToActePercent,
    8,
    `${ratios.compromisToActePercent} % de vos compromis vont jusqu'à l'acte, contre ${b.compromisToActePercent} % attendus : chaque point perdu ici est une vente déjà gagnée qui s'annule.`,
  );

  if (ratios.visitesParVente !== null && ratios.visitesParVente > b.visitsPerActe) {
    push({
      code: 'visits_per_vente_high',
      chapter: 8,
      label: `Il faut ${ratios.visitesParVente} visites pour une vente, contre ${b.visitsPerActe} attendues : le temps commercial part en visites qui n'aboutissent pas.`,
      severity: 'warning',
      audience: 'client',
      observed: ratios.visitesParVente,
      threshold: b.visitsPerActe,
    });
  }

  // ── Pratiques ──────────────────────────────────────────────────────────────
  if (a['prospecting-who'] === 'personne') {
    push({
      code: 'no_one_prospects',
      chapter: 3,
      label:
        'Personne ne prospecte activement : toutes les entrées vendeurs dépendent de sources que vous ne pilotez pas.',
      severity: 'error',
      audience: 'client',
      observed: null,
      threshold: null,
    });
  }
  if (a['seller-discovery-formalized'] === 'no') {
    push({
      code: 'seller_discovery_not_formalized',
      chapter: 4,
      label:
        "La découverte vendeur n'est pas formalisée : la qualité du rendez-vous dépend de qui le mène.",
      severity: 'warning',
      audience: 'client',
      observed: null,
      threshold: null,
    });
  }
  if (a['buyers-financing-verified'] === 'no') {
    push({
      code: 'buyer_financing_not_verified',
      chapter: 7,
      label:
        "Le financement des acquéreurs n'est pas vérifié en amont : c'est la première cause de compromis qui tombe.",
      severity: 'warning',
      audience: 'client',
      observed: null,
      threshold: null,
    });
  }
  const followup = a['commercial-followup-frequency'];
  if (followup === 'a_la_demande' || followup === 'jamais') {
    push({
      code: 'seller_followup_weak',
      chapter: 6,
      label:
        "Le suivi vendeur n'est pas ritualisé : sans point régulier, la baisse de prix se négocie dans l'urgence, quand le mandat est déjà froid.",
      severity: 'warning',
      audience: 'client',
      observed: null,
      threshold: null,
    });
  }
  const indicateurs = a['mgmt-indicators-followed'];
  if (Array.isArray(indicateurs) && indicateurs.length === 0) {
    push({
      code: 'no_indicators_followed',
      chapter: 11,
      label: "Aucun indicateur n'est suivi : l'agence se pilote au ressenti.",
      severity: 'warning',
      audience: 'client',
      observed: null,
      threshold: null,
    });
  }

  // ── E-réputation ───────────────────────────────────────────────────────────
  const avis = num(a['google-reviews-count']);
  ratios.avisParVentePercent = pct(avis, ventesN1);
  if (
    ratios.avisParVentePercent !== null &&
    ratios.avisParVentePercent < b.reviewsPerVentePercent
  ) {
    push({
      code: 'reviews_per_vente_below_benchmark',
      chapter: 9,
      label: `Vous avez ${avis} avis pour ${ventesN1} ventes l'an dernier : la satisfaction réelle de vos clients ne se voit pas en ligne.`,
      severity: 'warning',
      audience: 'client',
      observed: ratios.avisParVentePercent,
      threshold: b.reviewsPerVentePercent,
    });
  }

  // ── Consommation des droits sur 24 mois ────────────────────────────────────
  const cap = input.ageficeAnnualCap ?? 3000;
  const lever = input.consumptionLeverPercent ?? b.consumptionLeverPercent;
  const eligibles = input.participants.filter(
    (p) => p.statut !== 'SALARIE' && p.caN1 !== null && p.caN1 > 0,
  );
  const declared = input.participants.filter((p) => p.trainings24mFunded !== null);
  const mobilisable24m = eligibles.length * cap * 2;
  const consomme24m = declared.reduce((s, p) => s + (p.trainings24mFunded ?? 0), 0);
  ratios.consumptionRatePercent =
    declared.length === 0 || mobilisable24m <= 0 ? null : pct(consomme24m, mobilisable24m);
  if (ratios.consumptionRatePercent !== null) {
    // « Environ » systématique : c'est un déclaratif de rendez-vous, pas un relevé.
    labels.consumptionRatePercent = `Environ ${ratios.consumptionRatePercent} % de vos droits mobilisés sur 24 mois`;
    if (ratios.consumptionRatePercent < lever) {
      push({
        code: 'funding_rights_underused',
        chapter: 2,
        label: `Vous n'avez utilisé qu'environ ${ratios.consumptionRatePercent} % des financements mobilisables ces deux dernières années.`,
        severity: 'info',
        audience: 'client',
        observed: ratios.consumptionRatePercent,
        threshold: lever,
      });
    }
  }

  return { ratios, labels, alerts };
}
