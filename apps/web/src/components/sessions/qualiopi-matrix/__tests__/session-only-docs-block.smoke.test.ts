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

/**
 * LOT 3b — garde-fou RBAC. Le bloc « Documents session » est désormais rendu
 * pour TOUS (la consultation est ouverte aux LECTEURs), donc la GÉNÉRATION doit
 * rester strictement gardée par `canWrite` à l'intérieur du composant : un
 * lecteur ne doit JAMAIS voir « Générer » ni « Re-générer ».
 *
 * Vérification source : tout bouton portant un libellé de génération
 * (« Générer … » / « Re-générer ») est précédé d'un garde `canWrite && (`.
 */
describe('SessionOnlyDocsBlock — génération gardée par canWrite (garde-fou RBAC LOT 3b)', () => {
  // src brut (commentaires retirés) pour matcher la structure réelle.
  it('le bouton « Re-générer » est dans une branche `{canWrite && (` ', () => {
    // La branche hasPdf : canWrite && (<button>…Re-générer)
    expect(src).toMatch(/canWrite\s*&&\s*\([\s\S]*?Re-générer/);
  });

  it('le bouton « Générer … » (doc absent) est dans une branche `{canWrite && (` ', () => {
    // La branche !hasPdf : canWrite && (<button>…Générer ${article} ${shortLabel})
    expect(src).toMatch(/canWrite\s*&&\s*\([\s\S]*?Générer\s*\$\{card\.article\}/);
  });

  it('le lien « Voir le PDF » n\'est PAS gardé par canWrite (consultation ouverte à tous)', () => {
    // Voir le PDF est rendu dans la branche `pdf ? ( … )`, sans canWrite.
    // On vérifie qu'aucun `canWrite` n'introduit le lien de consultation :
    // le fragment entre `pdf ? (` et `Voir le PDF` ne contient pas `canWrite`.
    const m = src.match(/pdf\s*\?\s*\(([\s\S]*?)Voir le PDF/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/canWrite/);
  });
});
