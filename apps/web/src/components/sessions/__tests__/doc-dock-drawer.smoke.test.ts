import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test DocDockDrawer — locke l'affordance "clic génère ce doc"
 * AVANT la suppression de ParticipantDocsCards (commit ui-e3 #5).
 *
 * Garde-fou Laurent ui-e3 :
 *   "Lien avec #5 : les ParticipantDocsCards que #5 doit supprimer sont
 *   précisément ce qui porte la génération à l'unité aujourd'hui.
 *   Condition de gate pour #5 : le DocDock reprend l'affordance 'clic
 *   génère ce doc' AVANT toute suppression, sinon on perd la
 *   fonctionnalité. À écrire dans le plan #5, pas à découvrir au moment
 *   du rm."
 *
 * Ces assertions doivent rester vertes AVANT et APRÈS la suppression.
 * Si elles cassent, c'est que l'affordance a régressé — bloque #5.
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const drawerSrc = stripComments(
  readFileSync(
    path.join(__dirname, '..', 'doc-dock-drawer.tsx'),
    'utf8',
  ),
);

describe('DocDockDrawer — affordance "clic génère ce doc" (gate ui-e3 #5)', () => {
  it('importe dispatchGenerateDoc + dispatchGenerateMissing (server actions)', () => {
    expect(drawerSrc).toMatch(/dispatchGenerateDoc/);
    expect(drawerSrc).toMatch(/dispatchGenerateMissing/);
  });

  it('expose un handleGenerate par item (clic = appel server action)', () => {
    // L'utilisateur clique sur "Générer" d'un item missing → dispatchGenerateDoc
    // est appelé avec le bon sessionId + docType + participantId.
    expect(drawerSrc).toMatch(/function handleGenerate/);
    expect(drawerSrc).toMatch(/dispatchGenerateDoc\(/);
  });

  it('expose un handleGenerateAll (bouton "Tout générer" bulk)', () => {
    // Bouton de bulk pour les missing en lot — équivalent à la génération
    // par-stagiaire mais multiplexée.
    expect(drawerSrc).toMatch(/function handleGenerateAll/);
    expect(drawerSrc).toMatch(/dispatchGenerateMissing\(/);
  });

  it('rend un bouton "Générer" inline par item missing (UI affordance)', () => {
    // Sans ce bouton, l'utilisateur ne voit pas comment générer un doc
    // manquant individuellement — c'est l'UI que ParticipantDocsCards
    // fournit aujourd'hui et que le drawer doit reprendre.
    expect(drawerSrc).toMatch(/onGenerate/);
    expect(drawerSrc).toMatch(/Générer/);
  });

  it('rend un bouton "Régénérer" (force=true) sur les items déjà generated', () => {
    // Permet de re-générer un doc existant (ex: après correction du
    // programme). ParticipantDocsCards porte aussi cette affordance.
    expect(drawerSrc).toMatch(/onRegenerate/);
    expect(drawerSrc).toMatch(/force/);
  });

  it('router.refresh() après save (propage à toute la fiche)', () => {
    // Sans refresh, les compteurs des step blocks et la matrice restent
    // figés — divergence visible immédiate.
    expect(drawerSrc).toMatch(/router\.refresh\(\)/);
  });
});
