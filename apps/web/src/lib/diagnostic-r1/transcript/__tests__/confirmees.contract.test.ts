import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test de contrat — « rien de non confirmé ne sort » (spec §14).
 *
 * Ce que ce test protège : le jour où quelqu'un ajoutera un sixième endroit qui
 * lit les réponses d'un diagnostic — un export, un écran de synthèse, une
 * relance — il devra décider explicitement s'il lit le confirmé ou tout. Sans
 * ce garde, il copiera le `select` d'à côté, et une réponse qu'aucun humain
 * n'a relue partira dans un document remis à un client.
 *
 * Le test lit le CODE, pas la base : c'est le seul moyen de couvrir des chemins
 * qui n'existent pas encore. Même famille que les tests de référentiel.
 *
 * PROTOCOLE DE MUTATION : dans `diagnostic-audit.ts`, remplacer
 * `answers: REPONSES_CONFIRMEES` par un `select` nu → ce test DOIT virer rouge.
 */

const RACINE = join(process.cwd(), 'src');

/** Un fichier qui lit les réponses d'un diagnostic. */
const LECTEUR = /answers:\s*(\{|REPONSES_CONFIRMEES)|diagnosticAnswer\.[a-zA-Z]+\(/;

/** La marque d'un choix explicite. */
const FILTRE = /REPONSES_CONFIRMEES|CONFIRMEE|estConfirmee/;

/**
 * Les lecteurs qui voient DÉLIBÉRÉMENT les réponses non confirmées, et
 * pourquoi. Toute entrée ici est une décision, pas un oubli.
 */
const DEROGATIONS: Record<string, string> = {
  'app/app/diagnostics/[id]/transcript/page.tsx':
    "l'écran de revue : c'est précisément là qu'on relit ce qui n'est pas confirmé",
  'app/app/diagnostics/[id]/chapitre/[chapitre]/page.tsx':
    "l'écran de saisie : la valeur extraite s'affiche badgée « à confirmer », c'est là qu'on la corrige",
  'server/actions/diagnostic-transcript.ts':
    "les actions du lot C : elles écrivent et confirment, elles ne calculent rien",
};

function fichiersSource(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === '__tests__' || nom === 'node_modules') continue;
      fichiersSource(chemin, acc);
      continue;
    }
    if (/\.tsx?$/.test(nom)) acc.push(chemin);
  }
  return acc;
}

describe('Aucun lecteur de réponses n’oublie le filtre', () => {
  const lecteurs = fichiersSource(RACINE)
    .map((chemin) => ({ chemin, source: readFileSync(chemin, 'utf8') }))
    .filter(({ source }) => LECTEUR.test(source))
    .map(({ chemin, source }) => ({
      relatif: chemin.slice(RACINE.length + 1),
      source,
    }));

  it('en trouve — sinon le test ne garde rien', () => {
    expect(lecteurs.length).toBeGreaterThanOrEqual(5);
  });

  it.each(lecteurs.map((l) => l.relatif))('%s décide explicitement', (relatif) => {
    const lecteur = lecteurs.find((l) => l.relatif === relatif)!;
    const derogation = DEROGATIONS[relatif.split('\\').join('/')];
    if (derogation) {
      expect(derogation.length).toBeGreaterThan(20);
      return;
    }
    expect(
      FILTRE.test(lecteur.source),
      `${relatif} lit les réponses d'un diagnostic sans filtrer les extractions non confirmées.\n` +
        "Soit il utilise REPONSES_CONFIRMEES / CONFIRMEE, soit il rejoint DEROGATIONS avec sa raison.",
    ).toBe(true);
  });

  it('les documents remis au client filtrent, sans dérogation possible', () => {
    for (const relatif of ['server/actions/diagnostic-audit.ts', 'server/actions/propositions.ts']) {
      const lecteur = lecteurs.find((l) => l.relatif === relatif);
      expect(lecteur, `${relatif} ne lit plus les réponses — vérifier ce test`).toBeDefined();
      expect(lecteur!.source).toContain('REPONSES_CONFIRMEES');
      expect(DEROGATIONS[relatif]).toBeUndefined();
    }
  });
});
