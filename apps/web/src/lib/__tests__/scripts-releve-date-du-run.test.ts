/**
 * GARDE — aucun script n'écrit un relevé sous une date EN DUR.
 *
 * Pendant du test `releve-fichier.test.ts` : celui-là vérifie que la bonne
 * fonction existe, celui-ci qu'aucun script ne la contourne. Sans lui, le
 * prochain générateur naîtrait avec le même défaut et on recommencerait.
 *
 * MOTIF employé : un littéral de chaîne contenant `.planning/` suivi de six
 * chiffres et d'un tiret — la forme `AAMMJJ-` des relevés du dépôt.
 * POPULATION : les fichiers `.ts` de `apps/web/scripts` et
 * `packages/db/scripts`, hors `__tests__`.
 *
 * Ce que ce garde NE dit PAS : qu'un script écrit au bon endroit. Il dit
 * seulement qu'aucun n'y écrit sous une date que le run n'a pas choisie.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../..', '..', '..');
const DOSSIERS = ['apps/web/scripts', 'packages/db/scripts'];

/** `.planning/260911-…` dans un littéral — la date est figée dans le code. */
const DATE_EN_DUR = /['"`][^'"`]*\.planning\/\d{6}-/;

function listerScripts(dir: string): string[] {
  const abs = path.join(RACINE, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.includes('__tests__'))
    .map((f) => path.join(dir, f));
}

describe('les relevés portent la date de leur run', () => {
  it('la population balayée n\'est pas vide', () => {
    expect(DOSSIERS.flatMap(listerScripts).length).toBeGreaterThan(40);
  });

  it('aucun script ne fige la date d\'un relevé dans un chemin', () => {
    const coupables: string[] = [];
    for (const rel of DOSSIERS.flatMap(listerScripts)) {
      const source = fs.readFileSync(path.join(RACINE, rel), 'utf8');
      for (const [i, ligne] of source.split('\n').entries()) {
        if (DATE_EN_DUR.test(ligne)) coupables.push(`${rel}:${i + 1} — ${ligne.trim()}`);
      }
    }
    expect(coupables, `Chemin de relevé à date figée :\n${coupables.join('\n')}`).toEqual([]);
  });
});
