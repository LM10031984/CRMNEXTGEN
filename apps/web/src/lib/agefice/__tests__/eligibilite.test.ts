import { describe, it, expect } from 'vitest';
import { estEligibleAgefice, OU_AGEFICE } from '../eligibilite';

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

  it('expose les deux mêmes voies au filtre Prisma', () => {
    // Le filtre et le prédicat doivent décrire la même population : si l'un
    // gagne une voie, l'autre doit suivre.
    expect(OU_AGEFICE).toHaveLength(2);
    expect(OU_AGEFICE[0]).toEqual({ sponsorOrg: { opcoCode: 'AGEFICE' } });
    expect(JSON.stringify(OU_AGEFICE[1])).toContain('ageficeProfile');
  });
});
