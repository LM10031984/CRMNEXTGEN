# Deferred Items — Quick 260525-j9d

Pre-existing issues discovered during execution but out of scope (SCOPE BOUNDARY rule). Not caused by current task's changes.

## TypeScript errors (pre-existing)

`pnpm --filter @qualiof/web exec tsc --noEmit` reports 4 errors unrelated to settings-section / parametres/page :

- `src/lib/__tests__/veille-audit-template.html.test.ts(16,61)` : Cannot find module `'../veille-audit-template'`
- `src/lib/__tests__/veille-audit-template.test.ts(11,61)` : Cannot find module `'../veille-audit-template'`
- `src/server/actions/__tests__/veille.export.document.test.ts(138,45)` : Cannot find module `'../veille-export'`
- `src/server/actions/__tests__/veille.export.test.ts(136,45)` : Cannot find module `'../veille-export'`

Root cause : les tests référencent `apps/web/src/lib/veille-audit-template.ts` et `apps/web/src/server/actions/veille-export.ts` qui n'existent pas. Soit les modules ont été supprimés / déplacés (le dossier `apps/web/src/lib/veille/` existe avec seulement `veille.ts`), soit les tests sont orphelins.

À traiter dans un quick séparé (renommer imports vers nouvelle arborescence OU supprimer tests orphelins).

## Test failures (pre-existing, même cause)

Mêmes 4 fichiers que ci-dessus : `Test Files 4 failed | 75 passed (79) / Tests 631 passed`.

Aucun test régressé par le fix RSC (tous les 631 tests fonctionnels passent, les 4 fichiers en échec sont des erreurs d'import au load — 0 test exécuté).
