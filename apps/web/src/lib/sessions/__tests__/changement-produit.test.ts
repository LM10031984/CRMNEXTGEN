import { describe, it, expect } from 'vitest';

/**
 * Le garde-fou du changement de PROGRAMME d'une session.
 *
 * ⚠ CE QUI EST EN JEU. Une convention signée annonce un programme ; le
 * certificat de réalisation en annonce un autre si on a changé le produit
 * entre-temps. C'est un refus de prise en charge AGEFICE, et une
 * non-conformité Qualiopi indicateur 1 (« information exacte sur la
 * prestation »). D'où la règle figée avec Laurent le 15/09/2026 :
 * BROUILLON ET AUCUNE FACTURE ÉMISE, sinon on ne touche à rien.
 *
 * LE TEST DE PUISSANCE est le refus, pas l'autorisation : un module qui dirait
 * toujours « oui » passerait les cas nominaux sans qu'aucun test ne rougisse.
 * Chaque refus est donc testé avec sa raison, et chaque avertissement avec son
 * contenu — un avertissement vide serait pire que pas d'avertissement, il
 * donnerait l'illusion d'avoir prévenu.
 */

import {
  verifierChangementProduit,
  type ChangementProduitInput,
} from '../changement-produit';

const base: ChangementProduitInput = {
  sessionStatus: 'DRAFT',
  facturesEmises: 0,
  dureeActuelleHeures: 72,
  dureeCibleHeures: 72,
  creneaux: 18,
  documentsGeneres: 0,
};

describe('verifierChangementProduit — refus', () => {
  it("refuse dès qu'une facture est émise, même au brouillon", () => {
    const v = verifierChangementProduit({ ...base, facturesEmises: 2 });
    expect(v.autorise).toBe(false);
    if (v.autorise) throw new Error('inattendu');
    expect(v.raison).toContain('2');
    expect(v.raison.toLowerCase()).toContain('facture');
  });

  it.each(['PLANNED', 'OPEN', 'VALIDATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])(
    'refuse une session au statut %s',
    (statut) => {
      const v = verifierChangementProduit({ ...base, sessionStatus: statut });
      expect(v.autorise).toBe(false);
      if (v.autorise) throw new Error('inattendu');
      expect(v.raison).toContain('brouillon');
    },
  );
});

describe('verifierChangementProduit — autorisations', () => {
  it('autorise sans un mot quand tout est identique et rien de généré', () => {
    const v = verifierChangementProduit(base);
    expect(v.autorise).toBe(true);
    if (!v.autorise) throw new Error('inattendu');
    expect(v.avertissements).toEqual([]);
  });

  it('autorise mais prévient quand la durée change, en citant les deux durées', () => {
    const v = verifierChangementProduit({ ...base, dureeCibleHeures: 40 });
    expect(v.autorise).toBe(true);
    if (!v.autorise) throw new Error('inattendu');
    const texte = v.avertissements.join(' | ');
    expect(texte).toContain('40');
    expect(texte).toContain('72');
  });

  it('cite le NOMBRE de créneaux devenus faux — sinon on ne sait pas quoi refaire', () => {
    const v = verifierChangementProduit({ ...base, dureeCibleHeures: 40, creneaux: 18 });
    expect(v.autorise).toBe(true);
    if (!v.autorise) throw new Error('inattendu');
    expect(v.avertissements.join(' | ')).toContain('18');
  });

  it('ne parle pas de créneaux quand il n’y en a aucun', () => {
    const v = verifierChangementProduit({ ...base, dureeCibleHeures: 40, creneaux: 0 });
    expect(v.autorise).toBe(true);
    if (!v.autorise) throw new Error('inattendu');
    expect(v.avertissements.join(' | ').toLowerCase()).not.toContain('créneau');
  });

  it('prévient que les documents déjà générés citent l’ancien programme', () => {
    const v = verifierChangementProduit({ ...base, documentsGeneres: 3 });
    expect(v.autorise).toBe(true);
    if (!v.autorise) throw new Error('inattendu');
    const texte = v.avertissements.join(' | ');
    expect(texte).toContain('3');
    expect(texte.toLowerCase()).toContain('document');
  });

  it('ne prévient pas sur la durée quand la durée actuelle est inconnue', () => {
    // Session sans produit (donnée importée incomplète) : on ne peut pas
    // comparer, et inventer « 0h → 72h » ferait paniquer pour rien.
    const v = verifierChangementProduit({ ...base, dureeActuelleHeures: null });
    expect(v.autorise).toBe(true);
    if (!v.autorise) throw new Error('inattendu');
    expect(v.avertissements.join(' | ')).not.toContain('72');
  });
});

/**
 * Ce qui SUIT le produit, et ce qui ne le suit pas.
 *
 * `TrainingSession.name` et `pricePerLearner` sont COPIÉS du produit à la
 * création (`createSession` : `name: product.title`, `pricePerLearner:
 * product.priceHT`). Changer le produit sans les toucher laisserait une
 * session intitulée « Communication digitale » sur un programme d'IA.
 *
 * Mais les écraser aveuglément est pire : un nom saisi à la main (« IA — promo
 * OPTIMMO ») ou un tarif négocié seraient perdus sans un mot. D'où la règle
 * déjà éprouvée ailleurs dans le dépôt (renommage auto-entreprise) : on ne
 * remplace QUE si la valeur actuelle est EXACTEMENT celle héritée de l'ancien
 * produit. Sinon on n'y touche pas — et on le dit.
 */

import { suiviDuProduit } from '../changement-produit';

describe('suiviDuProduit — le nom', () => {
  it("adopte le nouveau titre quand le nom n'a jamais été personnalisé", () => {
    const r = suiviDuProduit({
      nomActuel: 'Communication digitale',
      titreAncienProduit: 'Communication digitale',
      titreNouveauProduit: "L'intelligence artificielle au service des conseillers",
      prixActuel: null,
      prixAncienProduit: null,
      prixNouveauProduit: null,
    });
    expect(r.nouveauNom).toBe("L'intelligence artificielle au service des conseillers");
  });

  it('ne touche pas à un nom saisi à la main, et le signale', () => {
    const r = suiviDuProduit({
      nomActuel: 'IA — promo OPTIMMO',
      titreAncienProduit: 'Communication digitale',
      titreNouveauProduit: "L'intelligence artificielle",
      prixActuel: null,
      prixAncienProduit: null,
      prixNouveauProduit: null,
    });
    expect(r.nouveauNom).toBeNull();
    expect(r.avertissements.join(' | ')).toContain('IA — promo OPTIMMO');
  });

  it('ignore les espaces de bord — un titre recopié avec un blanc reste hérité', () => {
    const r = suiviDuProduit({
      nomActuel: '  Communication digitale  ',
      titreAncienProduit: 'Communication digitale',
      titreNouveauProduit: 'IA',
      prixActuel: null,
      prixAncienProduit: null,
      prixNouveauProduit: null,
    });
    expect(r.nouveauNom).toBe('IA');
  });
});

describe('suiviDuProduit — le tarif', () => {
  it('adopte le nouveau tarif quand le tarif est celui hérité', () => {
    const r = suiviDuProduit({
      nomActuel: 'X', titreAncienProduit: 'X', titreNouveauProduit: 'X',
      prixActuel: 3024, prixAncienProduit: 3024, prixNouveauProduit: 1800,
    });
    expect(r.nouveauPrix).toBe(1800);
  });

  it('ne touche pas à un tarif négocié, et le signale avec les deux montants', () => {
    const r = suiviDuProduit({
      nomActuel: 'X', titreAncienProduit: 'X', titreNouveauProduit: 'X',
      prixActuel: 2500, prixAncienProduit: 3024, prixNouveauProduit: 1800,
    });
    expect(r.nouveauPrix).toBeNull();
    const texte = r.avertissements.join(' | ');
    expect(texte).toContain('2500');
    expect(texte).toContain('1800');
  });

  it('ne propose rien quand les deux produits ont le même tarif', () => {
    // Cas réel SES-0114 : PROD-00661 et PROD-0042 sont tous deux à 3024 €.
    const r = suiviDuProduit({
      nomActuel: 'X', titreAncienProduit: 'X', titreNouveauProduit: 'X',
      prixActuel: 3024, prixAncienProduit: 3024, prixNouveauProduit: 3024,
    });
    expect(r.nouveauPrix).toBeNull();
    expect(r.avertissements.join(' | ')).not.toContain('3024');
  });

  it('ne se prononce pas quand le tarif de session est vide', () => {
    // Session importée de SmartOF : tarif VIDE. Y poser le prix produit
    // inventerait un chiffre d'affaires que personne n'a négocié.
    const r = suiviDuProduit({
      nomActuel: 'X', titreAncienProduit: 'X', titreNouveauProduit: 'X',
      prixActuel: null, prixAncienProduit: 3024, prixNouveauProduit: 1800,
    });
    expect(r.nouveauPrix).toBeNull();
  });
});
