import { describe, it, expect } from 'vitest';
import {
  PAUSE_DEJEUNER,
  FORMATION_START,
  getDayStartEnd,
  formatHoraireLabel,
} from '../formation-horaires';

describe('formation-horaires — constantes', () => {
  it('PAUSE_DEJEUNER expose 13h00–14h00 (60 min)', () => {
    expect(PAUSE_DEJEUNER.start).toBe('13h00');
    expect(PAUSE_DEJEUNER.end).toBe('14h00');
    expect(PAUSE_DEJEUNER.durationMin).toBe(60);
  });

  it('FORMATION_START === 9h00', () => {
    expect(FORMATION_START).toBe('9h00');
  });
});

describe('formation-horaires — getDayStartEnd', () => {
  it('4h sans pause → 9h00 – 13h00', () => {
    expect(getDayStartEnd(4)).toEqual({
      start: '9h00',
      end: '13h00',
      hasPause: false,
      pauseStart: '13h00',
      pauseEnd: '14h00',
    });
  });

  it('3h sans pause (limite basse)', () => {
    const r = getDayStartEnd(3);
    expect(r.hasPause).toBe(false);
    expect(r.end).toBe('12h00');
  });

  it('5h avec pause → 9h00 – 15h00', () => {
    expect(getDayStartEnd(5)).toEqual({
      start: '9h00',
      end: '15h00',
      hasPause: true,
      pauseStart: '13h00',
      pauseEnd: '14h00',
    });
  });

  it('6h avec pause → 9h00 – 16h00', () => {
    const r = getDayStartEnd(6);
    expect(r.start).toBe('9h00');
    expect(r.end).toBe('16h00');
    expect(r.hasPause).toBe(true);
  });

  it('7h avec pause → 9h00 – 17h00', () => {
    const r = getDayStartEnd(7);
    expect(r.end).toBe('17h00');
    expect(r.hasPause).toBe(true);
  });

  it('8h avec pause → 9h00 – 18h00 (cas Laurent canonique)', () => {
    expect(getDayStartEnd(8)).toEqual({
      start: '9h00',
      end: '18h00',
      hasPause: true,
      pauseStart: '13h00',
      pauseEnd: '14h00',
    });
  });
});

describe('formation-horaires — formatHoraireLabel', () => {
  it('sans durationLabel → "start–end" (en-dash)', () => {
    expect(formatHoraireLabel('9h00', '13h00')).toBe('9h00–13h00');
  });

  it('avec durationLabel → "start–end (dur)"', () => {
    expect(formatHoraireLabel('9h00', '13h00', '4h')).toBe('9h00–13h00 (4h)');
  });
});
