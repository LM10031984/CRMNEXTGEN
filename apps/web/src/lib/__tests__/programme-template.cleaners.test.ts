import { describe, it, expect } from 'vitest';
import { cleanObjectifs, cleanAccessConditions, replaceDepartedContact } from '../programme-template';

describe('cleanObjectifs', () => {
  it('retire l\'amorce dupliquée en tête', () => {
    const r = cleanObjectifs([
      'A l’issue de la formation le stagiaire sera capable de :',
      '● Maîtriser les prompts.',
    ]);
    expect(r).toEqual(['Maîtriser les prompts.']);
  });

  it('remplace « Comprendre » par « Identifier » (verbe évaluable)', () => {
    const r = cleanObjectifs(['● Comprendre le fonctionnement de l’IA.']);
    expect(r[0]).toBe('Identifier le fonctionnement de l’IA.');
  });

  it('ne touche pas les verbes déjà évaluables', () => {
    expect(cleanObjectifs(['Optimiser la prospection.'])[0]).toBe('Optimiser la prospection.');
    expect(cleanObjectifs(['Maîtriser la création de prompts.'])[0]).toBe('Maîtriser la création de prompts.');
  });

  it('retire les puces ● de tête', () => {
    expect(cleanObjectifs(['● Utiliser l’IA.'])[0]).toBe('Utiliser l’IA.');
  });
});

describe('replaceDepartedContact', () => {
  it('retire Julien LAFITTE et remplace son numéro', () => {
    const r = replaceDepartedContact('contacter : Julien LAFITTE  formation@start-academy.fr  07 80 91 95 31');
    expect(r).not.toMatch(/Julien/i);
    expect(r).not.toMatch(/07 80 91 95 31/);
    expect(r).toMatch(/formation@start-academy\.fr/);
    expect(r).toMatch(/06 31 05 63 90/);
  });
});

describe('cleanAccessConditions', () => {
  it('coupe le bloc handicap embarqué (doublon)', () => {
    const txt =
      'Pour vous inscrire, contacter Julien LAFITTE 07 80 91 95 31.\nACCESSIBILITÉ AUX PERSONNES EN SITUATION DE HANDICAP\nLa loi...';
    const r = cleanAccessConditions(txt);
    expect(r).not.toMatch(/ACCESSIBILIT/i);
    expect(r).not.toMatch(/Julien/i);
    expect(r).toMatch(/Pour vous inscrire/);
  });
});
