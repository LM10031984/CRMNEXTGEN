import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Recette « 0 drift » du régime de signature — lot C.1
 * (spec `2026-09-04-signature-electronique-docs-signes.md` §3 bis, décision D-10).
 *
 * Ce que ce fichier garde : les 6 lignes signataires du catalogue financeur,
 * telles que tranchées par Laurent le 10/09/2026. `OpcoCatalog.conventionSigner`
 * / `ageficeSigner` / `assiduiteSigner` sont LA règle « qui signe quoi » ; le
 * jour où une ligne dévie, c'est un envoi en signature qui part de travers ou un
 * document qui disparaît de la matrice.
 *
 * POURQUOI SIX TESTS NOMMÉS plutôt qu'une boucle `it.each` : le rouge doit
 * désigner le financeur fautif. Un `it.each` sur un tableau rend « seed
 * signataires > cas 3 » — il faut alors rouvrir le tableau pour savoir de qui on
 * parle. Ici le nom du test EST le diagnostic.
 *
 * POURQUOI LIRE LE FICHIER SOURCE plutôt qu'importer le seed : `seed.ts` est un
 * script exécutable `@qualiof/db` (top-level `loadEnv`, `main()` auto-invoqué,
 * `@prisma/client`), non importable proprement depuis un test `apps/web`. Même
 * raison — et même patron — que `src/lib/docs/__tests__/seed-catalog.test.ts`.
 *
 * POURQUOI LES VALEURS SONT ÉCRITES EN DUR ICI et non importées d'une constante
 * d'application : une constante importable des deux côtés redeviendrait le
 * moteur de règles en dur que ce lot supprime — le test et le seed s'accorderaient
 * toujours, y compris sur une erreur.
 */

const SEED_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../packages/db/prisma/seed.ts',
);

/** Valeur d'une colonne signataire : un rôle, `null` (hors régime), ou absente du seed. */
type ValeurSignataire = 'DIRIGEANT' | 'STAGIAIRE' | null | undefined;

interface Signataires {
  conventionSigner: ValeurSignataire;
  ageficeSigner: ValeurSignataire;
  assiduiteSigner: ValeurSignataire;
}

/** Bloc de la fonction `seedOpcoCatalog` (du nom jusqu'à la 1ʳᵉ accolade fermante en colonne 0). */
function readSeedBlock(): string {
  const src = readFileSync(SEED_PATH, 'utf8');
  const start = src.indexOf('function seedOpcoCatalog');
  expect(start, 'fonction seedOpcoCatalog introuvable dans seed.ts').toBeGreaterThan(-1);
  const after = src.slice(start);
  const end = after.search(/\n}/);
  return after.slice(0, end);
}

/** Découpe le bloc en une tranche de texte par financeur (de son `code:` au suivant). */
function tranchesParCode(block: string): Map<string, string> {
  const tranches = new Map<string, string>();
  // `code: opco.code` (boucle upsert) n'a pas de quote : il ne matche pas.
  // Le tiret de `FI-FPL` doit passer, d'où le `-` dans la classe.
  const codeRe = /code:\s*'([A-Z0-9_-]+)'/g;
  const reperes: Array<{ code: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(block)) !== null) {
    reperes.push({ code: m[1]!, index: m.index });
  }
  for (const [i, repere] of reperes.entries()) {
    const fin = reperes[i + 1]?.index ?? block.length;
    tranches.set(repere.code, block.slice(repere.index, fin));
  }
  return tranches;
}

/** Extrait les 3 colonnes signataires de chaque tranche. Absente = `undefined`. */
function parseSignataires(block: string): Map<string, Signataires> {
  const map = new Map<string, Signataires>();
  for (const [code, tranche] of tranchesParCode(block)) {
    const entree: Signataires = {
      conventionSigner: undefined,
      ageficeSigner: undefined,
      assiduiteSigner: undefined,
    };
    const champRe = /(conventionSigner|ageficeSigner|assiduiteSigner):\s*(null|SignerRole\.(\w+))/g;
    let m: RegExpExecArray | null;
    while ((m = champRe.exec(tranche)) !== null) {
      const champ = m[1] as keyof Signataires;
      entree[champ] = m[2] === 'null' ? null : ((m[3] ?? null) as ValeurSignataire);
    }
    map.set(code, entree);
  }
  return map;
}

describe('seed OpcoCatalog — régime de signature (spec §3 bis, D-10)', () => {
  const block = readSeedBlock();
  const tranches = tranchesParCode(block);
  const seed = parseSignataires(block);

  // Garde de parseur : sans elle, un `readSeedBlock` cassé rendrait une Map vide
  // et les six tests ci-dessous seraient verts sur du néant.
  it('les 6 financeurs sont parsés (sanity)', () => {
    expect([...seed.keys()].sort()).toEqual(
      ['AGEFICE', 'ATLAS', 'CPF', 'FI-FPL', 'OPCOMMERCE', 'OPCO_EP'].sort(),
    );
  });

  // --- Les 6 lignes du tableau D-10, une par test nommé ---

  it('AGEFICE — DIRIGEANT / STAGIAIRE / STAGIAIRE', () => {
    const r = seed.get('AGEFICE');
    // Le TNS signe bien sa convention : son EI est l'organisation payeuse et il
    // en est le représentant légal — DIRIGEANT retombe sur lui. Pas `null`.
    expect(r?.conventionSigner).toBe('DIRIGEANT');
    expect(r?.ageficeSigner).toBe('STAGIAIRE');
    expect(r?.assiduiteSigner).toBe('STAGIAIRE');
  });

  it('OPCO_EP — DIRIGEANT / null / null', () => {
    const r = seed.get('OPCO_EP');
    expect(r?.conventionSigner).toBe('DIRIGEANT');
    expect(r?.ageficeSigner).toBeNull();
    expect(r?.assiduiteSigner).toBeNull();
  });

  it('ATLAS — DIRIGEANT / null / null', () => {
    const r = seed.get('ATLAS');
    expect(r?.conventionSigner).toBe('DIRIGEANT');
    expect(r?.ageficeSigner).toBeNull();
    expect(r?.assiduiteSigner).toBeNull();
  });

  it('OPCOMMERCE — DIRIGEANT / null / null', () => {
    const r = seed.get('OPCOMMERCE');
    expect(r?.conventionSigner).toBe('DIRIGEANT');
    expect(r?.ageficeSigner).toBeNull();
    expect(r?.assiduiteSigner).toBeNull();
  });

  it('CPF — STAGIAIRE / null / null', () => {
    const r = seed.get('CPF');
    // L'apprenant paie et signe lui-même, souvent sans organisation payeuse :
    // DIRIGEANT y ferait échouer la résolution du signataire.
    expect(r?.conventionSigner).toBe('STAGIAIRE');
    expect(r?.ageficeSigner).toBeNull();
    expect(r?.assiduiteSigner).toBeNull();
  });

  it('FI-FPL — STAGIAIRE / null / null', () => {
    const r = seed.get('FI-FPL');
    // `ageficeSigner` déclenche le formulaire officiel AGEFICE et l'attestation
    // d'assiduité est une pièce AGEFICE : un adhérent FI-FPL n'a affaire ni à
    // l'un ni à l'autre.
    expect(r?.conventionSigner).toBe('STAGIAIRE');
    expect(r?.ageficeSigner).toBeNull();
    expect(r?.assiduiteSigner).toBeNull();
  });

  // --- Garde de périmètre : ce lot ajoute une règle, il ne convertit pas l'affichage ---

  it('requiredDocs n’a pas bougé : ATLAS et OPCOMMERCE restent sans prose', () => {
    expect(tranches.get('ATLAS')).not.toContain('requiredDocs');
    expect(tranches.get('OPCOMMERCE')).not.toContain('requiredDocs');
    // …et la prose d'affichage des autres est intacte (elle n'est pas devenue une règle).
    expect(tranches.get('AGEFICE')).toContain('Convention de formation signée');
    expect(tranches.get('CPF')).toContain('Certificat de réalisation (obligatoire)');
  });
});
