import { describe, expect, it } from 'vitest';

import { nomAgence } from '../nom-agence';

/**
 * Une seule résolution du nom de l'agence, pour toutes les pièces.
 *
 * Elle existait en trois exemplaires, dont un — celui de la sonde de
 * composition — repliait sur le littéral « Agence ». C'est ce qui a fait relire
 * à Laurent, le 14/09/2026, un programme intitulé « Parcours sur mesure —
 * Agence » pendant que la proposition portait « BATI BATI OURMIERES ».
 */

const base = {
  organization: null,
  lead: { notes: null, firstName: null, lastName: null },
  reference: 'DIAG-0001',
};

describe('nomAgence — une seule résolution', () => {
  it('préfère la raison sociale de l’organisation', () => {
    expect(
      nomAgence({ ...base, organization: { legalName: 'BATI BATI OURMIERES' } }),
    ).toBe('BATI BATI OURMIERES');
  });

  it('retombe sur la note du lead, préfixe « Agence : » retiré', () => {
    expect(nomAgence({ ...base, lead: { ...base.lead, notes: 'Agence : BATI BATI OURMIERES' } })).toBe(
      'BATI BATI OURMIERES',
    );
  });

  it('retombe sur le nom du contact', () => {
    expect(nomAgence({ ...base, lead: { notes: null, firstName: 'Jean', lastName: 'Dupont' } })).toBe(
      'Jean Dupont',
    );
  });

  /**
   * Le défaut du `??` d'origine.
   *
   * `[null, null].filter(Boolean).join(' ')` rend `''`, qui n'est PAS nullish :
   * le repli sur la référence ne se déclenchait donc jamais, et un dossier sans
   * aucun nom sortait en CHAÎNE VIDE. Une absence rendue comme une valeur vide,
   * §4 quinquies une fois de plus.
   */
  it('ne rend JAMAIS une chaîne vide — il retombe sur la référence du dossier', () => {
    expect(nomAgence(base)).toBe('DIAG-0001');
    expect(nomAgence({ ...base, lead: { notes: '   ', firstName: '', lastName: '' } })).toBe(
      'DIAG-0001',
    );
  });

  it('ne retient pas une note qui ne contient QUE le préfixe', () => {
    expect(nomAgence({ ...base, lead: { ...base.lead, notes: 'Agence : ' } })).toBe('DIAG-0001');
  });
});
