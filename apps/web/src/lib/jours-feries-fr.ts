/**
 * Jours fériés France métropolitaine — calcul algorithmique pour ne pas
 * hardcoder année par année. Pâques via algorithme de Gauss.
 */

import { subtractBusinessDaysISO } from './business-days';

function easterSunday(year: number): Date {
  // Algorithme de Gauss (computus grégorien)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Renvoie l'ensemble des dates fériées FR (YYYY-MM-DD) pour une année. */
export function joursFeriesFR(year: number): Set<string> {
  const easter = easterSunday(year);
  return new Set([
    `${year}-01-01`, // Jour de l'an
    ymd(addDays(easter, 1)), // Lundi de Pâques
    `${year}-05-01`, // Fête du travail
    `${year}-05-08`, // Victoire 1945
    ymd(addDays(easter, 39)), // Ascension
    ymd(addDays(easter, 50)), // Lundi de Pentecôte
    `${year}-07-14`, // Fête nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice
    `${year}-12-25`, // Noël
  ]);
}

/**
 * Vrai si la date est un dimanche (0) ou un jour férié français.
 */
export function isOffDayFR(d: Date): boolean {
  if (d.getUTCDay() === 0) return true; // dimanche
  const feries = joursFeriesFR(d.getUTCFullYear());
  return feries.has(ymd(d));
}

/**
 * Trouve une date "analyse réalisée le" pour un doc Qualiopi : au moins
 * `minDaysBefore` jours OUVRÉS avant `sessionStart` (samedi, dimanche et
 * fériés FR exclus du décompte ET du résultat). Règle Kaïna 16/06 : le recueil
 * du besoin se fait J-15 jours ouvrés en amont du 1er jour de session.
 *
 * Déterministe via un seed (ID participant) : variation de 0-7 jours ouvrés
 * en plus, pour que deux stagiaires d'une même session n'aient pas la même
 * date tout en gardant une date stable d'un render à l'autre.
 */
export function computeAnalyseDate(
  sessionStart: Date,
  minDaysBefore: number = 15,
  seed: string = '',
): Date {
  // Offset additionnel stable basé sur le seed : 0-7 jours OUVRÉS en plus.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const extraDays = h % 8; // 0-7

  const iso = subtractBusinessDaysISO(ymd(sessionStart), minDaysBefore + extraDays);
  return new Date(iso + 'T00:00:00Z');
}

const FORMATEURS_RESPONSABLES = ['Laurent MARX', 'Jean-Guy Ourmières'] as const;

/**
 * Choisit aléatoirement (déterministe via seed) entre les responsables
 * pédagogiques pour la signature des analyses de besoin.
 */
export function pickResponsablePedagogique(seed: string = ''): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FORMATEURS_RESPONSABLES[h % FORMATEURS_RESPONSABLES.length]!;
}
