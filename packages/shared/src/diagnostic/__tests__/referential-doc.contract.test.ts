import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LIGHT_QUESTION_SET } from '../light-set';
import { DIAGNOSTIC_QUESTIONS, REFERENTIAL_VERSION } from '../questions';
import { renderReferentialDoc } from '../render-referential-doc';

/**
 * Contrat code ⇄ doc.
 *
 * Dans le repo d'origine, le document métier et le code ont divergé sans que
 * personne ne s'en aperçoive : des questions figuraient au doc sans exister en
 * base, d'autres se posaient en rendez-vous sans être documentées. Comme le doc
 * était présenté comme la source de vérité, plus personne ne savait laquelle
 * des deux disait vrai.
 *
 * Ici : le code est la source, le doc en est le rendu commité, et ce test
 * échoue tant que les deux ne coïncident pas au caractère près.
 */
const DOC_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/referentiel-questions-diagnostic.md',
);

function readDoc(): string {
  return readFileSync(DOC_PATH, 'utf8');
}

/**
 * Régénération : `UPDATE_REFERENTIAL_DOC=1 pnpm --filter @qualiof/shared test`.
 * Le test lui-même écrit le document — pas d'outil supplémentaire à installer,
 * et pas de commande qui pourrit dès qu'une dépendance bouge.
 */
if (process.env.UPDATE_REFERENTIAL_DOC === '1') {
  writeFileSync(DOC_PATH, `${renderReferentialDoc()}\n`, 'utf8');
  console.log(`Référentiel régénéré : ${DOC_PATH}`);
}

describe('Contrat référentiel — code ⇄ document', () => {
  it('le document commité est exactement le rendu du code', () => {
    const expected = `${renderReferentialDoc()}\n`;
    expect(
      readDoc(),
      'docs/referentiel-questions-diagnostic.md est périmé. Régénérer :\n' +
        '  pnpm --filter @qualiof/shared exec tsx src/diagnostic/write-referential-doc.ts',
    ).toBe(expected);
  });

  it('le document expose la volumétrie réelle (compte des questions et du set léger)', () => {
    const doc = readDoc();
    expect(doc).toContain(`${DIAGNOSTIC_QUESTIONS.length} questions sur 11 chapitres`);
    expect(doc).toContain(`set LÉGER : ${LIGHT_QUESTION_SET.length} questions`);
  });

  it('le document porte la version du référentiel', () => {
    expect(readDoc()).toContain(`\`${REFERENTIAL_VERSION}\``);
  });

  it('chaque ID du code apparaît dans le document, et réciproquement', () => {
    const doc = readDoc();
    // Les IDs du doc : ceux de la colonne ID des tableaux (début de ligne).
    const documented = new Set(
      [...doc.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1] as string),
    );
    const coded = DIAGNOSTIC_QUESTIONS.map((q) => q.id);

    const missingFromDoc = coded.filter((id) => !documented.has(id));
    expect(
      missingFromDoc,
      `Questions du code absentes du doc : ${missingFromDoc.join(', ')}`,
    ).toEqual([]);

    const codedSet = new Set(coded);
    const orphansInDoc = [...documented].filter((id) => !codedSet.has(id));
    expect(
      orphansInDoc,
      `Questions du doc qui n'existent plus : ${orphansInDoc.join(', ')}`,
    ).toEqual([]);

    expect(documented.size).toBe(coded.length);
  });

  it('le document marque comme LÉGER exactement les questions du set léger', () => {
    const doc = readDoc();
    const flaggedLight = new Set(
      [...doc.matchAll(/^\| `([a-z0-9-]+)` \|[^\n]*?\| (?:O|F) \| ✅ \|/gm)].map(
        (m) => m[1] as string,
      ),
    );
    expect([...flaggedLight].sort()).toEqual([...LIGHT_QUESTION_SET].sort());
  });
});
