import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formationAlertsStartDate,
  reimbursementReminderClosed,
  formationDaysAfter,
  formationDaysUntil,
  missingFormationDocuments,
  missingReimbursementDocuments,
  shouldAlertReimbursement,
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
    const now = new Date('2026-10-18T12:00:00Z');
    for (const start of ['2026-11-08', '2026-10-20', '2026-10-18'])
      expect(shouldAlertFormation(new Date(start), 'OPEN', now)).toBe(true);
    for (const start of ['2026-11-09', '2026-10-17'])
      expect(shouldAlertFormation(new Date(start), 'OPEN', now)).toBe(false);
    expect(shouldAlertFormation(now, 'CANCELLED', now)).toBe(false);
  });
  it('waits until the next Paris calendar day', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    expect(shouldAlertFormation(now, 'OPEN', now, new Date('2026-10-18T08:00:00Z'))).toBe(false);
    expect(shouldAlertFormation(now, 'OPEN', now, new Date('2026-10-17T12:00:00Z'))).toBe(true);
  });
  it('repeats after seven Paris calendar days even when DST made the interval one hour shorter', () => {
    expect(
      shouldAlertFormation(
        new Date('2027-04-05T10:00:00+02:00'),
        'OPEN',
        new Date('2027-03-30T00:15:00+02:00'),
        new Date('2027-03-23T23:45:00+01:00'),
      ),
    ).toBe(true);
  });
  it('names each missing piece and accepts a complete dossier', () => {
    expect(
      missingFormationDocuments({
        cni: false,
        rib: true,
        cfp: false,
        convention: false,
        ageficeForm: false,
        programme: false,
      }),
    ).toEqual([
      'CNI',
      'attestation CFP',
      'convention signée',
      'formulaire AGEFICE signé',
      'programme de formation',
    ]);
    expect(
      missingFormationDocuments({
        cni: true,
        rib: true,
        cfp: true,
        convention: true,
        ageficeForm: true,
        programme: true,
      }),
    ).toEqual([]);
  });

  it('compares Paris calendar days after the end across the spring DST change', () => {
    expect(
      formationDaysAfter(
        new Date('2027-03-29T00:00:00+01:00'),
        new Date('2027-03-30T00:30:00+02:00'),
      ),
    ).toBe(1);
  });

  it('starts reimbursement reminders at J+1 and repeats once per calendar day', () => {
    const end = new Date('2026-10-17T15:00:00+02:00');
    const now = new Date('2026-10-18T08:00:00+02:00');
    expect(shouldAlertReimbursement(end, now)).toBe(true);
    expect(shouldAlertReimbursement(end, now, new Date('2026-10-18T07:00:00+02:00'))).toBe(false);
    expect(shouldAlertReimbursement(end, now, new Date('2026-10-17T08:00:00+02:00'))).toBe(true);
    expect(shouldAlertReimbursement(new Date('2026-10-18T15:00:00+02:00'), now)).toBe(false);
  });

  it('names the four reimbursement pieces from their current state', () => {
    expect(
      missingReimbursementDocuments({
        rib: true,
        attendance: false,
        assiduity: false,
        paidInvoice: true,
      }),
    ).toEqual(['émargement signé', 'assiduité signée']);
  });
});

afterEach(() => vi.unstubAllEnvs());
it('applique une borne commune configurable en jours Paris', () => {
  expect(shouldAlertFormation(new Date('2026-09-30'), 'OPEN', new Date('2026-09-20'))).toBe(false);
  expect(shouldAlertReimbursement(new Date('2026-09-30'), new Date('2026-10-20'))).toBe(false);
  expect(
    shouldAlertFormation(new Date('2026-09-30T22:00:00Z'), 'OPEN', new Date('2026-09-20')),
  ).toBe(true);
  vi.stubEnv('FORMATION_ALERTS_START_DATE', '2026-11-01');
  expect(shouldAlertFormation(new Date('2026-10-31'), 'OPEN', new Date('2026-10-20'))).toBe(false);
  vi.stubEnv('FORMATION_ALERTS_START_DATE', '2026-02-31');
  expect(() => formationAlertsStartDate()).toThrow('date valide');
});

it.each(['opcoApproved', 'opcoReimbursed', 'validationOpco', 'remboursementOpco'])(
  'respecte aussi le marqueur historique %s',
  (field) => {
    expect(
      reimbursementReminderClosed({
        financingStatus: 'NOT_STARTED',
        opcoSubmissions: [],
        [field]: true,
      }),
    ).toBe(true);
  },
);
