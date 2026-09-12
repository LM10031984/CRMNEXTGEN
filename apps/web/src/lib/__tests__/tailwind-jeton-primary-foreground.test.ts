/**
 * La classe fantôme `text-primary-foreground` — retour d'écran Laurent, 11/09/2026.
 *
 * LE DIAGNOSTIC, POSÉ UNE FOIS POUR TOUTES. Tailwind résout
 * `text-primary-foreground` en `theme.colors.primary.foreground`. L'objet
 * `primary` de `tailwind.config.ts` portait DEFAULT, 50, 100, 500, 600, 700,
 * 900 — et pas `foreground`. Le `foreground: '#0F172A'` de la config est un
 * FRÈRE de `primary`, jamais son enfant : la classe ne produisait donc AUCUNE
 * règle CSS, et le texte des boutons héritait du gris ardoise ambiant.
 *
 * CE FICHIER NE TESTE PAS UNE CONSTANTE, IL TESTE UN CONTRASTE. Un test qui se
 * contenterait de `expect(primary.foreground).toBe('#FFFFFF')` resterait vert
 * devant n'importe quelle autre couleur illisible. On calcule donc le ratio
 * WCAG 2.1 réel (luminance relative), et on exige le seuil AAA sur les deux
 * fonds des boutons de signature — l'état normal et l'état survolé.
 *
 * Le troisième test garde la MESURE DU DÉFAUT : gris ardoise sur bleu Start
 * Academy = 2,12:1, en dessous du seuil AA de 4,5:1. Il est là pour que la
 * raison du changement reste lisible, et pour que le calcul lui-même soit
 * vérifiable sur une valeur connue.
 */

import { describe, it, expect } from 'vitest';
import config from '../../../tailwind.config';

/** Canal sRGB linéarisé — WCAG 2.1, définition de la luminance relative. */
function canalLineaire(octet: number): number {
  const c = octet / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const r = canalLineaire(parseInt(n.slice(0, 2), 16));
  const v = canalLineaire(parseInt(n.slice(2, 4), 16));
  const b = canalLineaire(parseInt(n.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

/** Le ratio de contraste WCAG entre deux couleurs opaques. */
function ratio(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (haut + 0.05) / (bas + 0.05);
}

const couleurs = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
const primary = (couleurs.primary ?? {}) as Record<string, string>;

describe('jeton `primary.foreground` — la classe fantôme du 11/09/2026', () => {
  it('la clé existe SOUS `primary` : sans elle, `text-primary-foreground` ne produit aucune règle', () => {
    expect(Object.keys(primary)).toContain('foreground');
  });

  it('le texte des boutons primaires atteint le seuil AAA sur le fond normal ET sur le survol', () => {
    // Les deux fonds réellement portés par les boutons de signature.
    expect(ratio(primary.foreground!, primary.DEFAULT!)).toBeGreaterThanOrEqual(7);
    expect(ratio(primary.foreground!, primary['600']!)).toBeGreaterThanOrEqual(7);
  });

  it('le `foreground` racine est un FRÈRE de `primary` — et il échouait à 2,12:1', () => {
    const ardoise = couleurs.foreground as string;
    expect(ardoise).toBe('#0F172A');
    // La mesure du défaut constaté à l'écran : sous le seuil AA de 4,5:1.
    expect(ratio(ardoise, primary.DEFAULT!)).toBeLessThan(4.5);
    expect(ratio(ardoise, primary.DEFAULT!)).toBeCloseTo(2.12, 2);
  });
});
