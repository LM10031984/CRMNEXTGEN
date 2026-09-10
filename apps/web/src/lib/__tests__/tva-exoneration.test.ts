import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { CODE_VATEX_EXONERATION_TVA, MENTION_EXONERATION_TVA } from '../tva-exoneration';

/**
 * La mention d'exonération : sa valeur exacte, et la garde qui empêche qu'on
 * la réécrive ailleurs.
 *
 * Avant ce module, la même phrase existait en huit formulations dans le dépôt
 * (deux ponctuations, deux longueurs, un placeholder écrit à la main). Rien ne
 * garantissait qu'un client lise la même chose sur sa convention et sur sa
 * facture. Une consigne en commentaire se re-viole en six mois ; un test rouge,
 * non — d'où la garde de la fin de ce fichier.
 *
 * Les assertions de valeur sont volontairement STRICTES (`toBe`, pas
 * `toContain`) : cette chaîne est imprimée sur des pièces comptables, un
 * caractère de différence est une différence.
 */

describe("la mention d'exonération de TVA", () => {
  it('vaut exactement la formulation déjà imprimée sur les factures', () => {
    expect(MENTION_EXONERATION_TVA).toBe(
      "TVA non applicable en vertu de l'article 261-4-4° du CGI",
    );
  });

  it("ne se termine PAS par un point — c'est l'appelant qui ponctue sa phrase", () => {
    // D-J4 : un point collé dans la constante casserait la parenthèse de la
    // convention (« (… du CGI.) ») et le tiret du programme. Les templates qui
    // terminent une phrase ajoutent le point chez eux.
    expect(MENTION_EXONERATION_TVA.endsWith('.')).toBe(false);
  });

  it("n'utilise que l'apostrophe droite U+0027, jamais la typographique U+2019", () => {
    // Les 31 factures déjà émises portent l'apostrophe droite. Une variante
    // typographique divergerait de ce qui est déjà imprimé.
    expect(MENTION_EXONERATION_TVA).toContain("l'article");
    expect(MENTION_EXONERATION_TVA).not.toContain('’');
  });

  it("ne contient aucun caractère HTML-spécial : les templates l'interpolent sans échappement", () => {
    // invoice-template, convention-template, programme-template et
    // proposition-template l'injectent dans du HTML rendu par Gotenberg /
    // WeasyPrint sans passer par escapeHtml. Une esperluette casserait le rendu.
    for (const c of ['&', '<', '>', '"']) {
      expect(MENTION_EXONERATION_TVA).not.toContain(c);
    }
  });
});

describe('le code VATEX', () => {
  it("vaut VATEX-EU-132-1I — D-2 tranchée le 10/09/2026", () => {
    expect(CODE_VATEX_EXONERATION_TVA).toBe('VATEX-EU-132-1I');
  });
});

// ── Garde anti-duplication ────────────────────────────────────────────────

const RACINE_WEB = path.resolve(__dirname, '..', '..', '..'); // apps/web
const DOSSIERS_SCANNES = ['src', 'scripts'];
const DOSSIERS_IGNORES = new Set(['node_modules', '.next', 'dist', '.turbo']);

/** Les deux seuls fichiers autorisés à écrire la phrase en toutes lettres. */
const FICHIERS_AUTORISES = new Set([
  'src/lib/tva-exoneration.ts',
  'src/lib/__tests__/tva-exoneration.test.ts',
]);

/**
 * `T.V.A. non applicable ou exonérée` de `invoice-template.ts` ne matche
 * volontairement pas : c'est le libellé de rubrique normalisé d'une facture
 * française (avec ses points d'abréviation), pas la mention fiscale.
 */
const FORMULATIONS_INTERDITES = [/TVA non applicable/, /exonérée de TVA/];

function fichiersSources(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (DOSSIERS_IGNORES.has(entree.name)) continue;
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) fichiersSources(chemin, acc);
    else if (/\.tsx?$/.test(entree.name)) acc.push(chemin);
  }
  return acc;
}

describe('garde : une seule source pour la mention', () => {
  it("échoue en nommant tout fichier qui réécrit la mention en dur", () => {
    const fautifs: string[] = [];

    for (const dossier of DOSSIERS_SCANNES) {
      for (const fichier of fichiersSources(path.join(RACINE_WEB, dossier))) {
        const relatif = path.relative(RACINE_WEB, fichier);
        if (FICHIERS_AUTORISES.has(relatif)) continue;

        const lignes = readFileSync(fichier, 'utf-8').split('\n');
        lignes.forEach((ligne, i) => {
          if (FORMULATIONS_INTERDITES.some((r) => r.test(ligne))) {
            fautifs.push(`${relatif}:${i + 1}  ${ligne.trim().slice(0, 120)}`);
          }
        });
      }
    }

    // Un message de garde qui dit juste « false !== true » ne sert à personne :
    // celui qui le lit doit savoir quelle ligne réparer.
    expect(
      fautifs,
      `La mention d'exonération est réécrite en dur hors de lib/tva-exoneration.ts.\n` +
        `Importer MENTION_EXONERATION_TVA depuis '@/lib/tva-exoneration' dans :\n` +
        fautifs.map((f) => `  ${f}`).join('\n') +
        '\n',
    ).toEqual([]);
  });
});
