/**
 * Source unique pour la regle horaire Start Academy (Laurent, 25/05/2026).
 *
 * Regle metier canonique :
 *  - Toute formation demarre a 9h00.
 *  - Pause dejeuner stricte 13h00-14h00 (1h pile) des que la journee >= 5h.
 *  - Journee 8h = 9h00-13h00 + 14h00-18h00.
 *
 * Consomme par : ollama-generators.ts (deroule IA), parse-programme-to-deroule.ts
 * (parser retro-compat), qualiopi-prompts.ts et ai-fill-product.ts utilisent la
 * meme regle ecrite en clair dans le prompt systeme (lisibilite prompt eng).
 */

export const PAUSE_DEJEUNER = {
  start: '13h00',
  end: '14h00',
  durationMin: 60,
} as const;

export const FORMATION_START = '9h00' as const;

export function getDayStartEnd(heuresParJour: number): {
  start: string;
  end: string;
  hasPause: boolean;
  pauseStart: string;
  pauseEnd: string;
} {
  const hasPause = heuresParJour >= 5;
  const endHour = 9 + heuresParJour + (hasPause ? 1 : 0);
  return {
    start: FORMATION_START,
    end: `${endHour}h00`,
    hasPause,
    pauseStart: PAUSE_DEJEUNER.start,
    pauseEnd: PAUSE_DEJEUNER.end,
  };
}

export function formatHoraireLabel(start: string, end: string, durationLabel?: string): string {
  const base = `${start}–${end}`;
  return durationLabel ? `${base} (${durationLabel})` : base;
}
