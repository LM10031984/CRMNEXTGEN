import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Toute page qui déclenche une génération IA doit déclarer `maxDuration`.
 *
 * Constat du 28/08 (« pourquoi c'est si long, c'est quoi le problème ? ») :
 * sur Vercel, une fonction sans `maxDuration` explicite est coupée à 60 s. Une
 * génération de programme — dix champs dont un programme jour par jour, jusqu'à
 * 8192 tokens de réponse — dépasse régulièrement ce seuil : Vercel tue la
 * requête AVANT le timeout applicatif, et l'utilisateur reçoit une erreur
 * opaque après une longue attente.
 *
 * `sessions/[id]` et `produits/[id]` le déclaraient déjà. Les pages d'où
 * partent les générations ajoutées ce jour — liste des produits, liste des
 * devis, wizard de session — ne le faisaient pas.
 *
 * Test de puissance : retirer un `export const maxDuration` fait virer ROUGE.
 */

const RACINE = join(__dirname, '..');

/** Pages depuis lesquelles une génération IA peut être lancée. */
const PAGES_IA = [
  'app/produits/page.tsx',
  'app/produits/[id]/page.tsx',
  'app/devis/page.tsx',
  'app/sessions/[id]/page.tsx',
  'app/sessions/nouvelle/page.tsx',
];

describe('maxDuration sur les pages qui déclenchent une génération IA', () => {
  it.each(PAGES_IA)('%s déclare maxDuration', (relatif) => {
    const source = readFileSync(join(RACINE, relatif), 'utf8');
    expect(source).toMatch(/export const maxDuration\s*=\s*\d+/);
  });

  it('la valeur reste dans la limite du plan Vercel (300 s)', () => {
    for (const relatif of PAGES_IA) {
      const source = readFileSync(join(RACINE, relatif), 'utf8');
      const valeur = Number(source.match(/export const maxDuration\s*=\s*(\d+)/)?.[1] ?? 0);
      expect(valeur).toBeGreaterThanOrEqual(120);
      expect(valeur).toBeLessThanOrEqual(300);
    }
  });
});
