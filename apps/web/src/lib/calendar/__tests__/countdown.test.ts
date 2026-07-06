import { describe, it, expect } from 'vitest';
import { countdownLabel, daysBetween } from '../countdown';

describe('countdownLabel', () => {
  it("renvoie \"aujourd'hui\" pour 0", () => {
    expect(countdownLabel(0)).toBe("aujourd'hui");
  });

  it('renvoie "demain" pour 1', () => {
    expect(countdownLabel(1)).toBe('demain');
  });

  it('renvoie "dans 2 jours" pour 2', () => {
    expect(countdownLabel(2)).toBe('dans 2 jours');
  });

  it('renvoie "dans 15 jours" pour 15', () => {
    expect(countdownLabel(15)).toBe('dans 15 jours');
  });

  it('clampe les valeurs négatives sur 0', () => {
    expect(countdownLabel(-3)).toBe("aujourd'hui");
  });
});

describe('daysBetween', () => {
  it('compte les jours calendaires entiers (UTC, floor)', () => {
    const from = new Date('2026-06-01T00:00:00Z');
    const to = new Date('2026-06-16T00:00:00Z');
    expect(daysBetween(from, to)).toBe(15);
  });

  it('ignore la composante horaire (floor sur la différence)', () => {
    const from = new Date('2026-06-01T18:30:00Z');
    const to = new Date('2026-06-02T09:00:00Z');
    expect(daysBetween(from, to)).toBe(1);
  });

  it('retourne 0 le jour même', () => {
    const from = new Date('2026-06-01T08:00:00Z');
    const to = new Date('2026-06-01T20:00:00Z');
    expect(daysBetween(from, to)).toBe(0);
  });
});
