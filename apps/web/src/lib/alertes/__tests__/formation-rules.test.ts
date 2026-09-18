import { describe, expect, it } from 'vitest';
import {
  formationDaysUntil,
  missingFormationDocuments,
  shouldAlertFormation,
} from '../formation-rules';

describe('formation deadlines', () => {
  it('compares Paris calendar days across daylight saving changes', () => {
    expect(
      formationDaysUntil(
        new Date('2026-11-02T00:00:00+01:00'),
        new Date('2026-10-12T23:30:00+02:00'),
      ),
    ).toBe(21);
  });
  it('includes J-21, late enrollments and today, excludes future, past and cancelled', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    for (const start of ['2026-10-09', '2026-09-20', '2026-09-18'])
      expect(shouldAlertFormation(new Date(start), 'OPEN', now)).toBe(true);
    for (const start of ['2026-10-10', '2026-09-17'])
      expect(shouldAlertFormation(new Date(start), 'OPEN', now)).toBe(false);
    expect(shouldAlertFormation(now, 'CANCELLED', now)).toBe(false);
  });
  it('waits a full seven days between actual sends', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    expect(shouldAlertFormation(now, 'OPEN', now, new Date('2026-09-12T12:00:00Z'))).toBe(false);
    expect(shouldAlertFormation(now, 'OPEN', now, new Date('2026-09-11T12:00:00Z'))).toBe(true);
  });
  it('names each missing piece and accepts a complete dossier', () => {
    expect(
      missingFormationDocuments({ cni: false, rib: true, cfp: false, convention: false }),
    ).toEqual(['CNI', 'attestation CFP', 'convention signée']);
    expect(
      missingFormationDocuments({ cni: true, rib: true, cfp: true, convention: true }),
    ).toEqual([]);
  });
});
