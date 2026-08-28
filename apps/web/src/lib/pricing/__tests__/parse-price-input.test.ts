import { describe, it, expect } from 'vitest';
import { parsePriceInput } from '../parse-price-input';

/**
 * Trou relevé par la recherche Phase 23 : `AddParticipantDialog` envoyait
 * `parseFloat(price) || 0`, donc TOUJOURS un prix explicite — et un champ vide
 * partait à 0 €. `addParticipant` fait `input.priceHT ?? defaut`, donc ce 0
 * gagnait contre la cascade : E-2 rouvert par l'interface, sur une session sans
 * `pricePerLearner`.
 *
 * La distinction que porte cette fonction : « rien saisi » (⇒ laisser la
 * cascade décider) n'est PAS « zéro saisi » (⇒ choix explicite, respecté).
 */

describe('parsePriceInput', () => {
  it('champ vide : aucune valeur, la cascade décidera', () => {
    expect(parsePriceInput('')).toBeUndefined();
    expect(parsePriceInput('   ')).toBeUndefined();
  });

  it('zéro saisi : choix explicite, respecté', () => {
    expect(parsePriceInput('0')).toBe(0);
    expect(parsePriceInput('0,00')).toBe(0);
  });

  it('accepte la virgule décimale française et les espaces de milliers', () => {
    expect(parsePriceInput('1400,50')).toBe(1400.5);
    expect(parsePriceInput('1 400,50')).toBe(1400.5);
    expect(parsePriceInput('4500')).toBe(4500);
  });

  it('saisie inexploitable : aucune valeur, jamais 0', () => {
    expect(parsePriceInput('abc')).toBeUndefined();
    expect(parsePriceInput('€')).toBeUndefined();
  });

  it('refuse un montant négatif plutôt que de le laisser passer', () => {
    expect(parsePriceInput('-100')).toBeUndefined();
  });
});
