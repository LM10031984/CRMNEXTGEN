import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke A6 2026-06-09 — SessionOnlyDocsBlock contient les 4 cartes
 * niveau session (Déroulé, Grille obs, Checklist, Bilan satisfaction).
 *
 * Le bilan satisfaction session (ind. 30) a été ajouté par A5. Sans
 * cette carte, l'unique chemin de régénération était de relancer le
 * pack complet — trou conformité.
 *
 * Anti-régression : si quelqu'un retire la 4ᵉ carte ou démonte le
 * bloc, le filet bipe.
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const src = stripComments(
  readFileSync(
    path.join(__dirname, '..', 'session-only-docs-block.tsx'),
    'utf8',
  ),
);

describe('SessionOnlyDocsBlock — A5/A6 : 4 cartes session', () => {
  it('expose les 4 clés CardKey (DEROULE, GRILLE_OBS, CHECKLIST, SATISFACTION_SESSION)', () => {
    for (const k of ['DEROULE', 'GRILLE_OBS', 'CHECKLIST', 'SATISFACTION_SESSION']) {
      expect(src).toMatch(new RegExp(`['"]${k}['"]`));
    }
  });

  it('importe les 4 server actions de génération à l\'unité', () => {
    expect(src).toMatch(/generateDerouleForProduct/);
    expect(src).toMatch(/generateGrilleObsSessionForSession/);
    expect(src).toMatch(/generateChecklistForSession/);
    expect(src).toMatch(/generateSatisfactionSessionForSession/);
  });

  it('expose la prop satisfactionPdfRef (lien PDF si déjà généré)', () => {
    expect(src).toMatch(/satisfactionPdfRef\?:\s*PdfRef/);
  });

  it('handleGenerate branche SATISFACTION_SESSION → generateSatisfactionSessionForSession', () => {
    expect(src).toMatch(/generateSatisfactionSessionForSession\(sessionId\)/);
  });
});
