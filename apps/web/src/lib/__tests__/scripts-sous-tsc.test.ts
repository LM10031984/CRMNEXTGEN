/**
 * GARDE — tout script qui ÉCRIT en base est vérifié par TypeScript.
 *
 * ## Ce qui a rendu ce test nécessaire (11/09/2026)
 *
 * `apps/web/scripts/**` n'était couvert par aucun `tsconfig`. Conséquence
 * observée, pas supposée : le mapping « ligne Prisma → `LibraryModule` » vivait
 * en quatre exemplaires, deux d'entre eux ont cessé de suivre, et une sonde a
 * rendu sur un dossier réel **un parcours vide en annonçant 9 demi-journées**.
 * Aucune barrière ne s'est levée, parce qu'il n'y en avait pas.
 *
 * En ouvrant la couverture, on a trouvé dans ces scripts : une création
 * `SessionTrainer` sans son champ obligatoire `role` (elle échouait à
 * l'exécution), un `Json` nullable passé à `null` au lieu de `Prisma.JsonNull`
 * dans l'importeur SmartOF (il aurait planté à la première personne sans
 * adresse), de l'arithmétique sur des `Decimal` dans un rapprochement de
 * **trésorerie**, un classeur vide qui importait silencieusement zéro ligne, et
 * deux assertions de type (`as never`, `as Array<…>`) qui se neutralisaient en
 * masquant une requête incomplète.
 *
 * ## Pourquoi ce test plutôt qu'une ligne dans un README
 *
 * C'est la même famille que l'index GIN et le `db push` en CI : **un garde-fou
 * qui ne garde pas est pire que pas de garde-fou, parce qu'on lui fait
 * confiance.** Un `tsconfig` qui couvre `src/` et qu'on croit couvrir le dépôt
 * est exactement ça. Le test vérifie donc la COUVERTURE, pas le code : il
 * échoue le jour où un nouveau dossier de scripts apparaît hors des `include`.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../..', '..', '..');

/** Les appels Prisma qui MODIFIENT la base. `findMany` et consorts sont hors sujet. */
const ECRITURE = /\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany|executeRaw|executeRawUnsafe)\s*\(/;

/**
 * Les dossiers de scripts du dépôt, et le `tsconfig` qui doit les couvrir.
 *
 * Ajouter un dossier ici est délibéré : c'est le moment où l'on décide qui le
 * vérifie. Le test refuse un dossier de scripts qu'aucun `tsconfig` ne couvre.
 */
const DOSSIERS = [
  { scripts: 'apps/web/scripts', tsconfig: 'apps/web/tsconfig.scripts.json' },
  { scripts: 'packages/db/scripts', tsconfig: 'packages/db/tsconfig.json' },
];

function listerScripts(dir: string): string[] {
  const abs = path.join(RACINE, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => path.join(dir, f));
}

function litInclude(tsconfig: string): string[] {
  const brut = fs.readFileSync(path.join(RACINE, tsconfig), 'utf8');
  // Les tsconfig du dépôt portent des commentaires ; JSON.parse ne les accepte pas.
  const sansCommentaires = brut.replace(/^\s*\/\/.*$/gm, '');
  return (JSON.parse(sansCommentaires) as { include?: string[] }).include ?? [];
}

describe('GARDE — les scripts qui écrivent en base sont vérifiés par tsc', () => {
  it('chaque dossier de scripts déclaré est couvert par son tsconfig', () => {
    for (const d of DOSSIERS) {
      const include = litInclude(d.tsconfig);
      const dossier = path.basename(d.scripts); // « scripts »
      const couvert = include.some((p) => p.startsWith(`${dossier}/`));
      expect(couvert, `${d.tsconfig} ne couvre pas ${d.scripts}`).toBe(true);
    }
  });

  it('aucun script écrivant en base ne vit hors des dossiers couverts', () => {
    // Le vrai risque n'est pas qu'un script existant sorte de la couverture :
    // c'est qu'un NOUVEAU dossier de scripts apparaisse ailleurs et échappe au
    // recensement. On balaie donc le dépôt, pas seulement ce qu'on connaît.
    const connus = DOSSIERS.map((d) => d.scripts);
    const candidats = execFileSync(
      'git',
      ['ls-files', '*/scripts/*.ts', 'scripts/*.ts'],
      { cwd: RACINE, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.endsWith('.d.ts'));

    const orphelins = candidats.filter((f) => {
      if (connus.some((c) => f.startsWith(`${c}/`))) return false;
      const contenu = fs.readFileSync(path.join(RACINE, f), 'utf8');
      return ECRITURE.test(contenu) && /@qualiof\/db|prisma/.test(contenu);
    });

    expect(
      orphelins,
      `Ces scripts écrivent en base et ne sont couverts par aucun tsconfig.\n` +
        `Les ajouter à DOSSIERS (et au tsconfig correspondant) — ou les déplacer ` +
        `dans un dossier déjà couvert :\n  ${orphelins.join('\n  ')}\n`,
    ).toEqual([]);
  });

  it('le recensement dit vrai — il trouve bien des scripts d’écriture', () => {
    // Un test de couverture qui ne trouve plus rien à couvrir passerait au vert
    // en ne gardant rien. C'est exactement le mode d'échec qu'on veut exclure.
    const ecrivains = DOSSIERS.flatMap((d) => listerScripts(d.scripts)).filter((f) =>
      ECRITURE.test(fs.readFileSync(path.join(RACINE, f), 'utf8')),
    );
    expect(ecrivains.length).toBeGreaterThan(20);
  });
});
