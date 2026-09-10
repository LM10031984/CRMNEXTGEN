/**
 * Les créneaux d'une campagne de RDV — module PUR (spec §7.1, règle §8.1).
 *
 * Pourquoi ce module existe : la campagne proposait 09:00–17:00 par défaut,
 * c'est-à-dire une journée pleine. Or l'unité de vente de Start Academy n'est
 * pas la journée, c'est la DEMI-JOURNÉE — 4 h sur site co-animées par deux
 * formateurs, soit 8 h conventionnées, 336 € HT par participant. Un écran qui
 * propose spontanément une journée fait dire à la campagne autre chose que ce
 * que la proposition facture et que ce que la convention déclarera.
 *
 * Ce module ne corrige pas seulement un défaut : il rend le compte VISIBLE.
 * Chaque date affiche ce qu'elle vaut — demi-journées, heures sur site, heures
 * conventionnées — côté admin comme côté participant.
 *
 * ── Ligne rouge §8.1 ────────────────────────────────────────────────────────
 * Les heures conventionnées ne sont JAMAIS recalculées ici. Elles viennent de
 * `conventionedHoursPerHalfDay`, le helper qu'utilise déjà `computePricing`.
 * Une deuxième formule, même juste le jour où on l'écrit, finit par diverger de
 * la première le jour où un paramètre bouge — et c'est alors la convention qui
 * ment, ou le dossier financeur. Une seule source, par construction.
 *
 * ── L'arrondi, et pourquoi il n'est pas « au supérieur » sur le temps écoulé ──
 * Le nombre de demi-journées se déduit de la durée du créneau arrondie AU PLUS
 * PROCHE, pas au supérieur. Le cas qui tranche est la journée réelle : 09:00 →
 * 18:00 fait 9 h écoulées pause déjeuner comprise, ce qui vaut 2 demi-journées
 * vendues et non 3. Un arrondi supérieur sur le temps écoulé facturerait la
 * pause. Aux durées courtes, l'effet recherché par D-11 est conservé par le
 * plancher : un créneau plus court qu'une demi-journée en compte quand même
 * une, et 6 h (1,5) donnent bien 2.
 */

import { conventionedHoursPerHalfDay } from '@/lib/proposition/pricing';
import type { FundingRuleValues } from '@/lib/financement/types';

/** Ce dont le module a besoin — un sous-ensemble des règles du tenant. */
export type CreneauRules = Pick<
  FundingRuleValues,
  'HALF_DAY_ONSITE_HOURS' | 'TRAINER_COUNT_DEFAULT'
>;

export interface Creneau {
  startsAt: Date;
  endsAt: Date;
}

export interface CreneauMesure {
  /** Durée réelle du créneau, en heures. Ce qui est au calendrier. */
  onsiteHours: number;
  /** Ce que le créneau vaut à la vente. Jamais zéro. */
  halfDays: number;
  /** Ce qui partira sur la convention, l'émargement et le dossier financeur. */
  conventionedHours: number;
}

export type CreneauPreset = 'MATIN' | 'APRES_MIDI' | 'JOURNEE' | 'PERSONNALISE';

const MS_PAR_HEURE = 3_600_000;

/** Arrondi au centième — évite les 4.000000000000001 en bout de soustraction. */
function heures(ms: number): number {
  return Math.round((ms / MS_PAR_HEURE) * 100) / 100;
}

export function mesurerCreneau(creneau: Creneau, rules: CreneauRules): CreneauMesure {
  const onsiteHours = Math.max(0, heures(creneau.endsAt.getTime() - creneau.startsAt.getTime()));
  const parDemiJournee = rules.HALF_DAY_ONSITE_HOURS;

  // Plancher à 1 : un créneau, même court, occupe une demi-journée de formateurs.
  const halfDays =
    parDemiJournee > 0 ? Math.max(1, Math.round(onsiteHours / parDemiJournee)) : 1;

  return {
    onsiteHours,
    halfDays,
    conventionedHours: halfDays * conventionedHoursPerHalfDay(rules as FundingRuleValues),
  };
}

/** "09:00" + 4 h → "13:00". Reste dans la journée : un créneau ne déborde pas. */
function ajouterHeures(hhmm: string, h: number): string {
  const [hh = '0', mm = '0'] = hhmm.split(':');
  const total = Number(hh) * 60 + Number(mm) + Math.round(h * 60);
  const borne = Math.min(total, 23 * 60 + 59);
  return `${String(Math.floor(borne / 60)).padStart(2, '0')}:${String(borne % 60).padStart(2, '0')}`;
}

const DEBUT_MATIN = '09:00';
const DEBUT_APRES_MIDI = '14:00';

/**
 * Le créneau proposé quand on ajoute une date : UNE demi-journée le matin.
 *
 * C'est le défaut le plus fréquent et le moins mensonger. Vouloir la journée
 * reste à un clic (préréglage « Journée »), mais il faut alors le dire.
 */
export function creneauDefaut(rules: CreneauRules): { debut: string; fin: string } {
  return { debut: DEBUT_MATIN, fin: ajouterHeures(DEBUT_MATIN, rules.HALF_DAY_ONSITE_HOURS) };
}

export interface CreneauPresetOption {
  key: Exclude<CreneauPreset, 'PERSONNALISE'>;
  label: string;
  debut: string;
  fin: string;
  halfDays: number;
}

/**
 * Les trois préréglages de l'écran.
 *
 * « Journée » vaut délibérément 2 demi-journées et le dit dans son libellé :
 * c'est le point exact où la relecture du 10/09 a trouvé l'écran trompeur.
 */
export function CRENEAU_PRESETS(rules: CreneauRules): CreneauPresetOption[] {
  const duree = rules.HALF_DAY_ONSITE_HOURS;
  return [
    {
      key: 'MATIN',
      label: `Matin (${formaterHeures(duree)} h)`,
      debut: DEBUT_MATIN,
      fin: ajouterHeures(DEBUT_MATIN, duree),
      halfDays: 1,
    },
    {
      key: 'APRES_MIDI',
      label: `Après-midi (${formaterHeures(duree)} h)`,
      debut: DEBUT_APRES_MIDI,
      fin: ajouterHeures(DEBUT_APRES_MIDI, duree),
      halfDays: 1,
    },
    {
      key: 'JOURNEE',
      label: `Journée (2 × ${formaterHeures(duree)} h)`,
      debut: DEBUT_MATIN,
      fin: ajouterHeures(DEBUT_MATIN, duree * 2),
      halfDays: 2,
    },
  ];
}

/** Relit un créneau enregistré pour retrouver le bouton à allumer. */
export function presetDuCreneau(creneau: Creneau, rules: CreneauRules): CreneauPreset {
  const debut = formaterHeureLocale(creneau.startsAt);
  const fin = formaterHeureLocale(creneau.endsAt);
  const trouve = CRENEAU_PRESETS(rules).find((p) => p.debut === debut && p.fin === fin);
  return trouve?.key ?? 'PERSONNALISE';
}

export function formaterHeureLocale(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 4 → "4", 2.5 → "2,5". Français, et sans décimale inutile. */
export function formaterHeures(h: number): string {
  return String(Math.round(h * 100) / 100).replace('.', ',');
}

/**
 * La phrase unique — même texte sur la fiche campagne, sur le formulaire de
 * création et sur la page publique. Trois formulations différentes du même
 * créneau, c'est trois occasions de se contredire.
 */
export function decrireCreneau(m: CreneauMesure): string {
  const dj = `${m.halfDays} demi-journée${m.halfDays > 1 ? 's' : ''}`;
  return `${dj} · ${formaterHeures(m.onsiteHours)} h sur site · ${formaterHeures(m.conventionedHours)} h conventionnées`;
}
