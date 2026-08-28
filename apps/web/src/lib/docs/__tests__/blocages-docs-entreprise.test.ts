import { describe, it, expect } from 'vitest';
import { blocagesDocsEntreprise } from '../blocages-docs-entreprise';

/**
 * Garde-fous AVANT génération des documents d'entreprise — demande de Laurent
 * (28/08) : « est-ce que je peux retourner sur la session pour la modifier, ou
 * avoir des garde-fous qui me le disent avant la génération pour que je les
 * saisisse ».
 *
 * Jusqu'ici on l'apprenait APRÈS coup, par un message d'erreur du cœur, une
 * fois le PDF déjà tenté. Ce helper est la MÊME règle, énoncée avant : il
 * reflète exactement les refus de `generateConventionEntrepriseCore` et de
 * `generateAnalyseBesoinEntrepriseCore`. Les deux doivent rester d'accord —
 * un garde-fou qui laisse passer ce que le cœur refuse est pire que rien.
 *
 * Test de puissance : retirer la branche `representant` fait virer ROUGE
 * « signale le représentant manquant ».
 */

const ORG = {
  id: 'org-assalit',
  legalName: 'ASSALIT SYNDIC',
  representative: 'Gilles Blanchon',
  aContactPrincipal: false,
};
const PARTICIPANTS = [
  { nom: 'Alice MARTIN', priceHT: 1200 },
  { nom: 'Bruno DURAND', priceHT: 1300 },
];

describe('blocagesDocsEntreprise', () => {
  it('ne bloque rien quand tout est renseigné', () => {
    expect(
      blocagesDocsEntreprise({ org: ORG, participants: PARTICIPANTS, produitPresent: true }),
    ).toEqual([]);
  });

  it('signale le représentant manquant, et pointe la fiche entreprise', () => {
    const b = blocagesDocsEntreprise({
      org: { ...ORG, representative: null },
      participants: PARTICIPANTS,
      produitPresent: true,
    });
    expect(b).toHaveLength(1);
    expect(b[0]!.key).toBe('representant_manquant');
    expect(b[0]!.href).toBe('/app/organisations/org-assalit');
    // Il bloque LES DEUX documents : ils sont signés/recueillis auprès de lui.
    expect(b[0]!.documents).toEqual(['convention', 'analyse']);
  });

  it('accepte un contact principal en repli du représentant', () => {
    expect(
      blocagesDocsEntreprise({
        org: { ...ORG, representative: '   ', aContactPrincipal: true },
        participants: PARTICIPANTS,
        produitPresent: true,
      }),
    ).toEqual([]);
  });

  /**
   * Prix : la convention somme les priceHT BRUTS (aucun fallback produit), pour
   * ne jamais annoncer un montant différent de la facture groupée. L'analyse,
   * elle, ne parle pas d'argent — elle n'est donc pas bloquée.
   */
  it('nomme les salariés sans prix et ne bloque QUE la convention', () => {
    const b = blocagesDocsEntreprise({
      org: ORG,
      participants: [{ nom: 'Alice MARTIN', priceHT: 0 }, { nom: 'Bruno DURAND', priceHT: 1300 }],
      produitPresent: true,
    });
    expect(b).toHaveLength(1);
    expect(b[0]!.key).toBe('prix_manquants');
    expect(b[0]!.label).toContain('Alice MARTIN');
    expect(b[0]!.label).not.toContain('Bruno');
    expect(b[0]!.documents).toEqual(['convention']);
  });

  it('signale un produit manquant sur la session', () => {
    const b = blocagesDocsEntreprise({
      org: ORG,
      participants: PARTICIPANTS,
      produitPresent: false,
    });
    expect(b.map((x) => x.key)).toContain('produit_manquant');
  });

  it('cumule les manques sans en masquer aucun', () => {
    const b = blocagesDocsEntreprise({
      org: { ...ORG, representative: null },
      participants: [{ nom: 'Alice MARTIN', priceHT: 0 }],
      produitPresent: false,
    });
    expect(b.map((x) => x.key).sort()).toEqual([
      'prix_manquants',
      'produit_manquant',
      'representant_manquant',
    ]);
  });
});
