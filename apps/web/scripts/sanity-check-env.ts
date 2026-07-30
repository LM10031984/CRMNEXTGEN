/**
 * Phase 22 Plan 22-04 — Sanity check des valeurs d'un fichier dotenv (D-18 ②).
 *
 * POURQUOI : 2 incidents ByteString (OPENROUTER_API_KEY, bug PROD-0674) causés
 * par des valeurs d'env POLLUÉES posées telles quelles sur Vercel/Railway :
 * les dashboards stockent la valeur BRUTE collée — un commentaire inline
 * (` # ← À REMPLIR`), un caractère non-ASCII (`←` U+2190) ou un espace de fin
 * finit dans le header `Authorization` et casse fetch avec une erreur
 * `Cannot convert argument to a ByteString` (l'index de l'erreur pointe le
 * caractère fautif).
 *
 * USAGE :
 *   pnpm tsx apps/web/scripts/sanity-check-env.ts <chemin-fichier-dotenv>
 *   ex: pnpm tsx apps/web/scripts/sanity-check-env.ts .env.vercel-prod
 *
 * COMPORTEMENT :
 *   - Parse ligne à ligne (KEY=VALUE). Lignes vides et commentaires pleins
 *     (ligne commençant par #) ignorés.
 *   - Valeur proprement quotée (`KEY="valeur"` SANS rien après la quote
 *     fermante) → on teste le contenu interne.
 *   - Sinon la valeur BRUTE après `=` est testée telle quelle — c'est
 *     exactement ce qu'une pose API naïve enverrait au dashboard (leçon
 *     PROD-0674 : dotenv strippe le commentaire en local, PAS l'API Vercel).
 *   - Détection : /[^\x20-\x7E]|#| +$/ — non-ASCII imprimable, dièse inline,
 *     espaces de fin.
 *
 * SÉCURITÉ : n'affiche JAMAIS la valeur d'une variable (secrets !) — seulement
 * le nom de la clé, l'index du premier caractère suspect et son codepoint.
 *
 * Exit code : 0 si tout est propre, 1 si au moins une valeur polluée.
 */

import fs from 'node:fs';

const BAD = /[^\x20-\x7E]|#| +$/; // non-ASCII imprimable, dièse, espaces de fin

function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx sanity-check-env.ts <fichier-dotenv>');
    process.exit(2);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`✗ Fichier introuvable: ${filePath}`);
    process.exit(2);
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  let scanned = 0;
  let polluted = 0;

  for (const line of lines) {
    // Lignes vides et commentaires pleins (toute la ligne est un commentaire)
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue; // ligne non KEY=VALUE (continuation multi-ligne non gérée)

    const key = m[1]!;
    const raw = m[2]!;
    scanned += 1;

    // Valeur PROPREMENT quotée : rien avant ni après les quotes → contenu interne.
    // Toute autre forme (quote + suffixe, valeur nue) est testée BRUTE — c'est
    // la forme que les poses API embarquent.
    let value = raw;
    const quoted = raw.match(/^"([^"]*)"$/) ?? raw.match(/^'([^']*)'$/);
    if (quoted) value = quoted[1]!;

    const idx = value.search(BAD);
    if (idx !== -1) {
      polluted += 1;
      const cp = value.codePointAt(idx) ?? 0;
      const hex = cp.toString(16).toUpperCase().padStart(4, '0');
      console.log(
        `✗ ${key}: caractère suspect à l'index ${idx} (codepoint U+${hex})`,
      );
    }
  }

  console.log(`\n${scanned} variables scannées, ${polluted} polluées`);
  process.exit(polluted > 0 ? 1 : 0);
}

main();
