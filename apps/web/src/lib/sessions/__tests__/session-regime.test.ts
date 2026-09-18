import { describe, expect, it } from 'vitest';
import {
  sessionTotalHT,
  allocateCompanyPrice,
  refusalForSessionPayer,
  sessionFunding,
} from '../session-regime';
const enterprise = { regime: 'ENTREPRISE' as const, priceTotalHT: 240 };
describe('le régime de la session décide du montant', () => {
  it('garde le forfait de 240 € avec deux, trois ou zéro stagiaire', () => {
    for (const participants of [
      [],
      [{ priceHT: 120 }, { priceHT: 120 }],
      [{ priceHT: 120 }, { priceHT: 120 }, { priceHT: 120 }],
    ]) {
      expect(sessionTotalHT(enterprise, participants)).toBe(240);
    }
  });
  it('laisse exactement le calcul historique aux sessions sans régime', () => {
    expect(
      sessionTotalHT({ regime: null }, [{ priceHT: 120 }, { priceHT: 120 }, { priceHT: 120 }]),
    ).toBe(360);
    expect(sessionTotalHT({ regime: 'INDIVIDUEL' }, [{ priceHT: 120 }, { priceHT: 140 }])).toBe(
      260,
    );
  });
  it('refuse un forfait absent au lieu de le déduire du produit ou des inscrits', () => {
    expect(() => sessionTotalHT({ regime: 'ENTREPRISE' }, [{ priceHT: 120 }])).toThrow(/total/);
  });
  it('ventile le forfait en centimes sans perdre ni créer un centime', () => {
    expect(allocateCompanyPrice(100, ['b', 'a', 'c'])).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
    expect(allocateCompanyPrice(240, ['a', 'b', 'c'])).toEqual({ a: 80, b: 80, c: 80 });
  });
});
describe('garde payeur uniquement quand le régime est déclaré', () => {
  it('accepte l’agent commercial dont la société commanditaire paie', () => {
    expect(
      refusalForSessionPayer('ENTREPRISE', {
        sponsorLegalForm: 'SAS',
        roleChezSponsor: 'AGENT_COMMERCIAL',
        name: 'Test',
      }),
    ).toBeNull();
  });
  it('refuse l’auto-payeur en entreprise et indique la correction', () => {
    expect(
      refusalForSessionPayer('ENTREPRISE', {
        sponsorLegalForm: 'EI',
        roleChezSponsor: 'EI_SELF',
        name: 'Test',
      }),
    ).toMatch(/Test.*fiche.*INDIVIDUEL/s);
    expect(
      refusalForSessionPayer('INDIVIDUEL', {
        sponsorLegalForm: 'SAS',
        roleChezSponsor: 'DIRIGEANT',
        name: 'Test',
      }),
    ).toMatch(/ENTREPRISE/);
  });
  it('ne refuse jamais une session historique sans régime', () => {
    expect(
      refusalForSessionPayer(null, { sponsorLegalForm: null, roleChezSponsor: null, name: 'Test' }),
    ).toBeNull();
  });
});
describe('financeur séparé du régime, résolu depuis la période du payeur', () => {
  const links = [
    {
      organizationId: 'agency',
      role: 'AGENT_COMMERCIAL',
      endDate: '2026-01-31',
      organization: { opcoCode: 'AGEFICE' },
    },
    {
      organizationId: 'agency',
      role: 'SALARIE',
      startDate: '2026-02-01',
      organization: { opcoCode: 'AGEFICE' },
    },
    { organizationId: 'ei', role: 'EI_SELF', organization: { opcoCode: 'AGEFICE' } },
  ];
  it('ne réutilise pas l’EI personnelle pour une inscription salariée payée par une autre structure', () => {
    expect(
      sessionFunding({
        sponsorOrgId: 'agency',
        sponsorOpcoCode: 'OPCO_EP',
        links,
        session: { startDate: '2026-11-20', endDate: '2026-11-20' },
      }),
    ).toBe('OPCO_EP');
  });
  it('conserve le fonds de janvier et accepte l’autofinancement en individuel', () => {
    expect(
      sessionFunding({
        sponsorOrgId: 'agency',
        sponsorOpcoCode: 'AGEFICE',
        links,
        session: { startDate: '2026-01-20', endDate: '2026-01-20' },
      }),
    ).toBe('AGEFICE');
    expect(
      sessionFunding({
        sponsorOrgId: 'ei',
        sponsorOpcoCode: 'AGEFICE',
        links,
        financingMode: 'AUTOFINANCEMENT',
        session: { startDate: '2026-11-20', endDate: '2026-11-20' },
      }),
    ).toBeNull();
  });
});

it('refuse un montant total sub-centime plutôt que l’arrondir en base', () => {
  expect(() => sessionTotalHT({ regime: 'ENTREPRISE', priceTotalHT: 240.001 }, [])).toThrow(
    /décimales/,
  );
});
