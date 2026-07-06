# Deferred items — quick 260619-jy5

Échecs de tests PRÉ-EXISTANTS détectés en lançant `pnpm vitest run` (apps/web) pour
non-régression. Hors périmètre de ce quick (ne référencent ni `noteSur5`, ni
`satisfaction-session-template`, ni le panneau produit). NON corrigés (scope boundary).

1. `src/lib/closure/__tests__/shared-template.test.ts` — Test 6
   `loadLogoColorDataUrl` : assertion `expect(url).toMatch(/^data:image\/jpg;base64,/)`
   échoue car la valeur reçue est `data:image/jpeg;base64,...`. Mismatch MIME
   `image/jpg` (test) vs `image/jpeg` (impl). À trancher : corriger l'assertion ou l'impl.

2. `scripts/__tests__/dedupe.merge.test.ts` — erreur de collecte (« 0 test »,
   échec ligne 31). Script d'import/dédoublonnage. À investiguer séparément.

Suite globale au moment de l'exécution : 998/999 tests verts (1 échec = item 1 ci-dessus,
+ 1 fichier en erreur de collecte = item 2).
