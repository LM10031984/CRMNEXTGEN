import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 09.3-03-fix CORRECTION 1 — GATE grep « 0 littéral Ind 27 ».
 *
 * Le checkpoint visuel 09.3-03 a été rejeté notamment pour des badges « Ind 27 »
 * (sous-traitance, NA pour la fin de formation) collés en dur dans les fiches
 * session. SOURCE UNIQUE : tout indicateur doit venir du catalogue `doc-scope.ts`.
 *
 * Ce test scanne récursivement `components/sessions/` et `lib/sessions/` et asserte
 * qu'AUCUN fichier ne contient le littéral d'indicateur de doc `Ind 27` ni un
 * indicateur nu `'27'`/`"27"`. Il s'exclut lui-même. Si quelqu'un réintroduit un
 * badge « Ind 27 » en dur, ce test casse.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  path.resolve(HERE, '..'), // components/sessions
  path.resolve(HERE, '../../../lib/sessions'), // lib/sessions
];

/** Liste récursive des fichiers .ts/.tsx (hors __tests__ et hors ce fichier). */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('CORRECTION 1 — 0 littéral « Ind 27 » dans les fiches session', () => {
  const files = ROOTS.flatMap((r) => listSourceFiles(r));

  it('au moins quelques fichiers source scannés (sanity)', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('aucun fichier ne contient le littéral de chaîne « Ind 27 » (valeur, pas commentaire)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      // On ignore les lignes de commentaire (// ou *) : la cible est la VALEUR
      // d'indicateur affichée, pas les commentaires expliquant qu'on l'a retirée.
      const codeLines = readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
      // Littéral de chaîne entre quotes contenant « Ind 27 » (badge en dur).
      if (codeLines.some((l) => /['"`]\s*Ind\s*27\b/.test(l))) {
        offenders.push(path.relative(process.cwd(), f));
      }
    }
    expect(offenders, `« Ind 27 » littéral résiduel dans : ${offenders.join(', ')}`).toHaveLength(0);
  });

  it("aucun fichier n'utilise un indicateur nu '27'/\"27\" comme valeur de prop indic", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // indic: '27' / indic="27" / ind: '27' — formes d'affectation d'indicateur nu.
      if (/\b(indic|ind)\s*[:=]\s*['"]27['"]/.test(src)) {
        offenders.push(path.relative(process.cwd(), f));
      }
    }
    expect(offenders, `indicateur nu '27' dans : ${offenders.join(', ')}`).toHaveLength(0);
  });
});
