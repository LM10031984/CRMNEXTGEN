/**
 * Utilitaires jours ouvrés FR — utilisé par le wizard de session pour
 * calculer la date de fin à partir de la date de début + durée formation.
 *
 * Règle métier Start Academy :
 *   - 8h de formation = 1 journée ouvrée
 *   - skip samedi, dimanche, jours fériés français
 *
 * Les dates sont manipulées en strings ISO (YYYY-MM-DD) côté input HTML.
 */

/**
 * Calcule la date de Pâques (dimanche) pour une année donnée.
 * Algorithme de Meeus/Jones/Butcher (computus grégorien).
 */
function easterSunday(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function utcDate(year: number, monthIdx: number, day: number): Date {
  return new Date(Date.UTC(year, monthIdx, day));
}

function addUtcDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function isoFromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const holidayCache = new Map<number, Set<string>>();

/**
 * Retourne les jours fériés français pour une année (en ISO YYYY-MM-DD).
 * Inclut les fêtes fixes + variables (basées sur Pâques).
 */
export function frenchHolidaysISO(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const set = new Set<string>([
    isoFromUtc(utcDate(year, 0, 1)), // Jour de l'an
    isoFromUtc(addUtcDays(easter, 1)), // Lundi de Pâques
    isoFromUtc(utcDate(year, 4, 1)), // Fête du Travail
    isoFromUtc(utcDate(year, 4, 8)), // Victoire 1945
    isoFromUtc(addUtcDays(easter, 39)), // Jeudi de l'Ascension
    isoFromUtc(addUtcDays(easter, 50)), // Lundi de Pentecôte
    isoFromUtc(utcDate(year, 6, 14)), // Fête nationale
    isoFromUtc(utcDate(year, 7, 15)), // Assomption
    isoFromUtc(utcDate(year, 10, 1)), // Toussaint
    isoFromUtc(utcDate(year, 10, 11)), // Armistice 1918
    isoFromUtc(utcDate(year, 11, 25)), // Noël
  ]);
  holidayCache.set(year, set);
  return set;
}

/** True si la date (string ISO) est samedi/dimanche/férié FR. */
export function isBusinessDayISO(iso: string): boolean {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=dim, 6=sam
  if (dow === 0 || dow === 6) return false;
  if (frenchHolidaysISO(d.getUTCFullYear()).has(iso)) return false;
  return true;
}

/**
 * Ajoute `n` jours ouvrés à une date ISO. n=0 retourne la même date
 * (même si non ouvrée).
 */
export function addBusinessDaysISO(startIso: string, n: number): string {
  if (n <= 0) return startIso;
  let cur = new Date(startIso + 'T00:00:00Z');
  let added = 0;
  while (added < n) {
    cur = addUtcDays(cur, 1);
    const iso = isoFromUtc(cur);
    if (isBusinessDayISO(iso)) added++;
  }
  return isoFromUtc(cur);
}

/**
 * Retire `n` jours ouvrés à une date ISO (miroir de addBusinessDaysISO).
 * Le résultat est garanti ouvré (sam/dim/fériés exclus). n<=0 → même date.
 */
export function subtractBusinessDaysISO(startIso: string, n: number): string {
  if (n <= 0) return startIso;
  let cur = new Date(startIso + 'T00:00:00Z');
  let removed = 0;
  while (removed < n) {
    cur = addUtcDays(cur, -1);
    if (isBusinessDayISO(isoFromUtc(cur))) removed++;
  }
  return isoFromUtc(cur);
}

/**
 * Calcule la date de fin d'une session : `startDate` + (nbJours - 1)
 * jours ouvrés, où nbJours = ceil(durationHours / 8) selon la règle
 * Start Academy (8h = 1 journée).
 *
 * Exemples :
 *   computeEndDate('2026-05-04', 8)  → '2026-05-04' (lundi, 1 jour)
 *   computeEndDate('2026-05-04', 21) → '2026-05-06' (lun→mer, 3 jours)
 *   computeEndDate('2026-05-07', 21) → '2026-05-12' (jeu→mar, skip W-E)
 */
export function computeEndDateISO(startIso: string, durationHours: number): string {
  if (!startIso || !durationHours || durationHours <= 0) return startIso;
  const days = Math.max(1, Math.ceil(durationHours / 8));
  return addBusinessDaysISO(startIso, days - 1);
}
