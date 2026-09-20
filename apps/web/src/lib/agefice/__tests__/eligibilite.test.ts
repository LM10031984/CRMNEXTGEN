import { describe, it, expect } from 'vitest';
import { estEligibleAgefice, filterAgeficeCandidates, OU_AGEFICE } from '../eligibilite';

/**
 * La règle « qui relève de l'AGEFICE » vivait en trois exemplaires, dont un
 * plus étroit dans le pack de fin de formation : il ne regardait que le payeur.
 * La fiche session annonçait donc des attestations d'assiduité que le pack ne
 * produisait jamais (SES-0112, 11/09/2026 : 4 stagiaires AGEFICE, 0 attestation
 * dans le pack, 2 rattrapées à la main).
 *
 * Ces tests verrouillent les deux voies d'éligibilité, et surtout la voie que
 * la version étroite ignorait.
 *
 * Test de puissance : réduire `estEligibleAgefice` au seul test du payeur fait
 * virer ROUGE « un agent commercial porteur d'un dossier AGEFICE ».
 */

describe('estEligibleAgefice', () => {
  it('reconnaît le cas courant : le payeur est rattaché à l’AGEFICE', () => {
    expect(estEligibleAgefice({ sponsorOrg: { opcoCode: 'AGEFICE' } })).toBe(true);
  });

  it('reconnaît une entreprise individuelle porteuse d’un dossier AGEFICE', () => {
    expect(
      estEligibleAgefice({
        sponsorOrg: { opcoCode: null },
        person: { legalLinks: [{ role: 'EI_SELF', organization: { ageficeProfile: { id: 'ap-1' } } }] },
      }),
    ).toBe(true);
  });

  it('reconnaît un agent commercial porteur d’un dossier AGEFICE', () => {
    // Exactement ce que la version étroite du pack laissait passer à la trappe.
    expect(
      estEligibleAgefice({
        sponsorOrg: { opcoCode: null },
        person: {
          legalLinks: [{ role: 'AGENT_COMMERCIAL', organization: { ageficeProfile: { id: 'ap-2' } } }],
        },
      }),
    ).toBe(true);
  });

  it('écarte un salarié dont l’employeur relève d’un OPCO d’entreprise', () => {
    expect(
      estEligibleAgefice({
        sponsorOrg: { opcoCode: 'OPCO_EP' },
        person: { legalLinks: [{ role: 'SALARIE', organization: { ageficeProfile: null } }] },
      }),
    ).toBe(false);
  });

  it('écarte un rattachement sans dossier AGEFICE', () => {
    expect(
      estEligibleAgefice({
        sponsorOrg: { opcoCode: null },
        person: { legalLinks: [{ role: 'EI_SELF', organization: { ageficeProfile: null } }] },
      }),
    ).toBe(false);
  });

  it('tolère un participant sans payeur ni rattachement', () => {
    expect(estEligibleAgefice({})).toBe(false);
    expect(estEligibleAgefice({ sponsorOrg: null, person: { legalLinks: null } })).toBe(false);
  });

  it('charge les périodes déclarées puis les deux voies historiques', () => {
    // Le filtre et le prédicat doivent décrire la même population : si l'un
    // gagne une voie, l'autre doit suivre.
    expect(OU_AGEFICE).toHaveLength(3);
    expect(OU_AGEFICE[0]).toEqual({ session: { regime: { not: null } } });
    expect(OU_AGEFICE[1]).toEqual({ sponsorOrg: { opcoCode: 'AGEFICE' } });
    expect(JSON.stringify(OU_AGEFICE[2])).toContain('ageficeProfile');
  });
});

it('session déclarée : une EI annexe ne rend pas le salarié éligible chez son payeur', () => {
  const p = { sponsorOrgId: 'sas', sponsorOrg: { opcoCode: 'OPCO_EP' }, session: { regime: 'ENTREPRISE' as const, startDate: new Date('2026-11-20'), endDate: new Date('2026-11-20') }, person: { legalLinks: [{ organizationId: 'sas', role: 'SALARIE', startDate: new Date('2026-02-01') }, { organizationId: 'ei', role: 'EI_SELF', organization: { ageficeProfile: {} } }] } };
  expect(estEligibleAgefice(p)).toBe(false);
});
it('le même payeur peut porter le dossier TNS en janvier puis un salarié sans AGEFICE', () => {
  const p = { sponsorOrgId: 'org', sponsorOrg: { opcoCode: 'OPCO_EP', ageficeProfile: {} }, session: { regime: 'ENTREPRISE' as const, startDate: new Date('2026-01-20'), endDate: new Date('2026-01-20') }, person: { legalLinks: [{ organizationId: 'org', role: 'DIRIGEANT', endDate: new Date('2026-01-31') }, { organizationId: 'org', role: 'SALARIE', startDate: new Date('2026-02-01') }] } };
  expect(estEligibleAgefice(p)).toBe(true);
  expect(estEligibleAgefice({ ...p, session: { ...p.session, startDate: new Date('2026-11-20'), endDate: new Date('2026-11-20') } })).toBe(false);
  expect(estEligibleAgefice({ ...p, financingMode: 'AUTOFINANCEMENT' })).toBe(false);
});

it('session historique : le rôle chez le payeur prime sur une EI annexe, selon la date', () => {
  const p = {
    sponsorOrgId: 'agence', sponsorOrg: { opcoCode: 'OPCO_EP' },
    session: { regime: null, startDate: '2026-11-20', endDate: '2026-11-20' },
    person: { legalLinks: [
      { organizationId: 'agence', role: 'AGENT_COMMERCIAL', endDate: '2026-04-30' },
      { organizationId: 'agence', role: 'SALARIE', startDate: '2026-05-01' },
      { organizationId: 'ei', role: 'EI_SELF', organization: { ageficeProfile: {} } },
    ] },
  };
  expect(estEligibleAgefice(p)).toBe(false);
  expect(filterAgeficeCandidates([p])).toEqual([]);
  expect(estEligibleAgefice({ ...p, session: { ...p.session, startDate: '2026-01-20', endDate: '2026-01-20' } })).toBe(true);
  expect(estEligibleAgefice({ ...p, sponsorOrgId: 'ei', sponsorOrg: { opcoCode: 'AGEFICE' } })).toBe(true);
});
