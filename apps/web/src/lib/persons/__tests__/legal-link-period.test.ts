import { describe, expect, it } from 'vitest';
import { legalLinkAtSession, planLegalLinkChange } from '../legal-link-period';
const link = {
  id: 'old',
  organizationId: 'agency',
  role: 'AGENT_COMMERCIAL',
  function: null,
  startDate: null,
  endDate: null,
  isPrimary: true,
};
const session = (startDate: string, endDate = startDate) => ({ startDate, endDate });
describe('rattachement à la date de la session', () => {
  const periods = [
    { ...link, endDate: '2026-01-31' },
    { ...link, id: 'new', role: 'SALARIE', startDate: '2026-02-01' },
    { ...link, id: 'ei', organizationId: 'own-ei', role: 'EI_SELF' },
  ];
  it('conserve le rôle de janvier malgré un emploi ultérieur et une EI toujours active', () => {
    expect(legalLinkAtSession(periods, 'agency', session('2026-01-20'))?.role).toBe(
      'AGENT_COMMERCIAL',
    );
    expect(legalLinkAtSession(periods, 'agency', session('2026-11-20'))?.role).toBe('SALARIE');
  });
  it('traite les dates absentes comme des périodes ouvertes et les bornes comme inclusives', () => {
    expect(legalLinkAtSession([link], 'agency', session('2024-01-01'))?.id).toBe('old');
    expect(legalLinkAtSession(periods, 'agency', session('2026-01-31T15:00:00Z'))?.id).toBe('old');
    expect(legalLinkAtSession(periods, 'agency', session('2026-02-01'))?.id).toBe('new');
  });
  it('ne prend ni un rôle futur, ni celui d’une autre organisation', () => {
    expect(legalLinkAtSession([periods[1]!], 'agency', session('2026-01-01'))).toBeNull();
    expect(legalLinkAtSession(periods, 'unrelated', session('2026-11-01'))).toBeNull();
  });
  it('refuse une transition pendant la session et des périodes ambiguës', () => {
    expect(() =>
      legalLinkAtSession(periods, 'agency', session('2026-01-30', '2026-02-02')),
    ).toThrow(/pendant/);
    expect(() =>
      legalLinkAtSession(
        [link, { ...link, id: 'other', role: 'SALARIE' }],
        'agency',
        session('2026-11-20'),
      ),
    ).toThrow(/Plusieurs/);
  });
});
describe('préparer un changement de rôle sans écraser l’ancien', () => {
  it('termine la veille et ouvre une nouvelle période à la date choisie', () => {
    const plan = planLegalLinkChange(link, { role: 'SALARIE', effectiveDate: '2026-02-01' });
    expect(plan.previous.endDate).toBe('2026-01-31');
    expect(plan.previous.role).toBe('AGENT_COMMERCIAL');
    expect(plan.next?.role).toBe('SALARIE');
    expect(plan.next?.startDate).toBe('2026-02-01');
    expect(link.endDate).toBeNull();
  });
  it('refuse une date invalide ou précédant le début du lien', () => {
    expect(() =>
      planLegalLinkChange(link, { role: 'SALARIE', effectiveDate: '2026-02-30' }),
    ).toThrow(/date/i);
    expect(() =>
      planLegalLinkChange(
        { ...link, startDate: '2026-03-01' },
        { role: 'SALARIE', effectiveDate: '2026-02-01' },
      ),
    ).toThrow(/début/);
  });
});

it('une session explicitement sans régime ne reçoit aucun nouveau refus pour des liens historiques ambigus', () => {
  const links = [
    { organizationId: 'org', role: 'AGENT_COMMERCIAL' },
    { organizationId: 'org', role: 'SALARIE' },
  ];
  expect(
    legalLinkAtSession(links, 'org', {
      startDate: '2026-11-20',
      endDate: '2026-11-20',
      regime: null,
    })?.role,
  ).toBe('AGENT_COMMERCIAL');
});
