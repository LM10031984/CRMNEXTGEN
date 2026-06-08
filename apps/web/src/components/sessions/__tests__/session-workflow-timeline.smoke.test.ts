import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test SessionWorkflowTimeline — verrouille la conformité Qualiopi
 * en mode collapsé par défaut (commit ui-e3 #4).
 *
 * La barre 9 indicateurs polluait la vue principale hors-audit. Elle vit
 * désormais dans un <details> sans `open=true` — chip score X/Y visible
 * dans le summary, détail révélé au clic.
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const src = stripComments(
  readFileSync(
    path.join(__dirname, '..', 'session-workflow-timeline.tsx'),
    'utf8',
  ),
);

describe('SessionWorkflowTimeline — Conformité Qualiopi collapsée par défaut (ui-e3 #4)', () => {
  it('utilise <ConformityToggle> pour wrap la barre 9 indicateurs', () => {
    expect(src).toMatch(/<ConformityToggle/);
  });

  it('ConformityToggle utilise <details> natif HTML (pas de state React)', () => {
    // Le pattern <details> évite un client component pour un simple
    // toggle. Cohérent avec les autres collapsibles de la page.
    expect(src).toMatch(/<details/);
  });

  it("aucun <details> avec attribute `open` — cachée par défaut", () => {
    // Anti-régression : si quelqu'un ajoute `open` au <details>, on perd
    // le comportement "cachée par défaut" et la barre repollue la vue
    // principale.
    expect(src).not.toMatch(/<details[^>]*\sopen[\s/>]/);
  });

  it('summary expose un score X/Y visible sans ouvrir', () => {
    // Le chip score reste lisible en summary pour la lecture audit
    // rapide — ne PAS le cacher entièrement.
    expect(src).toMatch(/\{okCount\}\/\{total\}/);
  });

  it("9 indicateurs métier listés (1, 6, 8, 9, 10, 11, 17, 27, 30)", () => {
    // Anti-régression : computeQualiopiPillars doit retourner ces 9
    // indicateurs précis (Qualiopi métier Start Academy).
    for (const ind of ['1', '6', '8', '9', '10', '11', '17', '27', '30']) {
      // Format attendu dans computeQualiopiPillars : `ind: 'Ind X'`
      expect(src).toMatch(new RegExp(`['"]Ind ${ind}['"]`));
    }
  });
});
