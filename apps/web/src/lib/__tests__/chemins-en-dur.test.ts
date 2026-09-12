/**
 * GARDE — aucun chemin de machine en dur dans un script vivant.
 *
 * ## Ce qui a rendu ce test nécessaire (11/09/2026)
 *
 * Deux dégâts le même jour, tous deux dus à un chemin écrit en dur dans un script
 * que personne ne relisait :
 *
 * 1. **Le lanceur de bureau de Laurent ne marchait plus.** `launch-qualiof.sh` et
 *    `stop-qualiof.sh` portaient `/Users/laurentmarx/Documents/CRM Next gen/files`.
 *    Le dépôt est sorti d'iCloud vers `~/Projects`, et l'ancien dossier EXISTE
 *    encore : iCloud y a laissé une coquille qui ne contient que `apps/`. Le `cd`
 *    réussissait, puis tout échouait — sans message utile.
 * 2. **Une extraction a perdu deux programmes en silence.** `FAROS_DIR` pointait
 *    `~/Documents/nxt-coach/Formation Faros`, devenu un dossier VIDE.
 *    `existsSync` réussissait, `readdirSync` rendait zéro paquet, et l'instantané
 *    est sorti à 74 programmes au lieu de 76 sans un avertissement.
 *
 * Le motif dangereux n'est donc pas « le chemin n'existe plus » : c'est **« il
 * existe encore et ne porte plus rien »**. C'est la même famille que l'index GIN
 * et que `scripts-sous-tsc.test.ts` — un garde-fou auquel on fait confiance et qui
 * ne garde rien. Ce test-ci garde les CHEMINS.
 *
 * ## Ce qu'il interdit
 *
 * Deux motifs, sur tous les scripts suivis par git (`.ts` comme `.sh`) :
 *   • un chemin absolu propre à une machine — `/Users/<quelqu'un>` ;
 *   • les deux racines qui ont DÉMÉNAGÉ — `Documents/CRM Next gen`,
 *     `Documents/nxt-coach`.
 *
 * Et il porte un second test, aussi important que le premier : le recensement
 * doit DIRE VRAI. Un garde qui passe au vert parce que sa liste d'exceptions a
 * tout avalé, ou parce qu'une exception périmée le fait taire, ne garde rien.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../..', '..', '..');

/** Un chemin absolu propre à une machine. */
const CHEMIN_MACHINE = /\/Users\/[A-Za-z0-9._-]+/;
/** Les deux racines qui ont déménagé hors d'iCloud le 11/09/2026. */
const RACINE_DEMENAGEE = /Documents\/(CRM Next gen|nxt-coach)/;

function porteUnCheminEnDur(contenu: string): boolean {
  return CHEMIN_MACHINE.test(contenu) || RACINE_DEMENAGEE.test(contenu);
}

/**
 * La LISTE D'EXCEPTIONS — explicite, datée, et vérifiée non périmée.
 *
 * • `packages/db/scripts/lib/corpus-local.ts` est le SEUL endroit du dépôt qui
 *   nomme encore l'ancien emplacement `~/Documents`, et c'est délibéré : il le
 *   garde comme SECOND candidat, après `~/Projects`. Sans lui, une machine qui
 *   n'a pas encore déménagé sa matière ne trouverait plus rien.
 *
 * • Les autres sont des scripts JETABLES du 11/09/2026 et d'avant, déjà joués
 *   (analyses de trésorerie, générations de documents pour une session nommée,
 *   lectures de classeurs Excel d'export). Les réécrire serait du bruit : ils ne
 *   tourneront plus. **Aucun nouveau n'entre dans cette liste.**
 *   Deux d'entre eux ne portent le chemin qu'en COMMENTAIRE, comme exemple
 *   d'usage : `apps/web/scripts/ecrire-modules-rediges.ts` et
 *   `packages/db/scripts/import-veille-from-xlsx.ts`.
 */
const EXCEPTIONS = [
  // Le seul endroit légitime — second candidat délibéré (cf. corpus-local.ts).
  'packages/db/scripts/lib/corpus-local.ts',
  // Scripts jetables déjà joués — 11/09/2026 et avant.
  'apps/web/scripts/_export-qualiopi-produit-xlsx.ts',
  'apps/web/scripts/_froid-et-indicateurs-ses0086.ts',
  'apps/web/scripts/_gen-assalit-experta-analyses.ts',
  'apps/web/scripts/_gen-assalit-experta-docs.ts',
  'apps/web/scripts/_gen-ics-rappels.ts',
  'apps/web/scripts/_gen-optimmo-152h-docs.ts',
  'apps/web/scripts/_gen-optimmo-analyse-besoins.ts',
  'apps/web/scripts/_gen-session-pack.ts',
  'apps/web/scripts/_reconcile-certificats-drive.ts',
  'apps/web/scripts/_regen-emargement-ses0101.ts',
  'apps/web/scripts/analyse-treso-agefice.ts',
  'apps/web/scripts/assign-session-trainers.ts',
  'apps/web/scripts/check-exports-sessions.ts',
  'apps/web/scripts/check-formateur-col.ts',
  'apps/web/scripts/check-totaux-treso.ts',
  'apps/web/scripts/compare-templates.ts',
  'apps/web/scripts/extract-programme-examples.ts',
  'apps/web/scripts/extract-trainers-from-tableau.ts',
  'apps/web/scripts/map-docx-to-products.ts',
  'apps/web/scripts/read-tableau-agents.ts',
  // Chemin en COMMENTAIRE seulement (exemple d'usage).
  'apps/web/scripts/ecrire-modules-rediges.ts',
  'packages/db/scripts/import-veille-from-xlsx.ts',
];

function scriptsSuivis(): string[] {
  return execFileSync('git', ['ls-files', '*/scripts/*', 'scripts/*'], {
    cwd: RACINE,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|sh|mjs|cjs|js)$/.test(f))
    .filter((f) => !f.includes('__tests__'));
}

describe('GARDE — aucun chemin de machine en dur dans un script vivant', () => {
  it('aucun script suivi par git hors exceptions ne porte de chemin en dur', () => {
    const coupables = scriptsSuivis().filter((f) => {
      if (EXCEPTIONS.includes(f)) return false;
      return porteUnCheminEnDur(fs.readFileSync(path.join(RACINE, f), 'utf8'));
    });

    expect(
      coupables,
      `Ces scripts portent un chemin /Users/… ou Documents/{CRM Next gen,nxt-coach} en dur.\n` +
        `Dériver le chemin de l'emplacement du script, ou passer par ` +
        `premierEmplacementPorteur() — pas l'ajouter aux exceptions :\n  ${coupables.join('\n  ')}\n`,
    ).toEqual([]);
  });

  it('le recensement dit vrai — le balayage trouve bien des scripts', () => {
    // Un garde qui ne balaie plus rien passerait au vert en ne gardant rien.
    const scripts = scriptsSuivis();
    expect(scripts.length).toBeGreaterThan(40);
    expect(scripts).toContain('scripts/launch-qualiof.sh');
    expect(scripts).toContain('scripts/stop-qualiof.sh');
  });

  it('aucune exception périmée — chacune existe ET porte réellement un chemin en dur', () => {
    // Le second mode d'échec : une exception qui ne sert plus fait taire le garde
    // sur un fichier qu'il devrait surveiller. Elle doit donc rougir.
    const perimees = EXCEPTIONS.filter((f) => {
      const abs = path.join(RACINE, f);
      if (!fs.existsSync(abs)) return true;
      return !porteUnCheminEnDur(fs.readFileSync(abs, 'utf8'));
    });
    expect(
      perimees,
      `Ces exceptions ne servent plus — les RETIRER de la liste :\n  ${perimees.join('\n  ')}\n`,
    ).toEqual([]);
  });

  it('la liste d’exceptions n’est pas vide, et n’avale pas tout', () => {
    expect(EXCEPTIONS.length).toBeGreaterThan(0);
    expect(EXCEPTIONS.length).toBeLessThan(scriptsSuivis().length / 2);
  });
});
