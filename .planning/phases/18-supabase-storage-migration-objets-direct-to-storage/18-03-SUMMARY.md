---
phase: 18-supabase-storage-migration-objets-direct-to-storage
plan: 03
subsystem: storage
tags: [supabase-storage, direct-to-storage, signed-upload-url, ocr, downscale, sharp, redirect-302, tenant-scope, vitest, tdd]

# Dependency graph
requires:
  - phase: 18-supabase-storage-migration-objets-direct-to-storage
    plan: 01
    provides: "createSignedUploadUrl(bucket, key) → { path, token, signedUrl } + createSignedDownloadUrl + _internals.PROVIDER (adaptateur storage.ts)"
provides:
  - "createApprenantUploadUrl(kind, ext) [ADMIN] — signed upload URL scopé user.tenantId, path apprenants/{tenantId}/{uuid}/{kind}.{ext}, sans exposer le service_role au client"
  - "createPreEnrollmentUploadUrl(peToken, kind, ext) [PUBLIC] — signed upload URL validé par PreEnrollment.token (PAS validateRequest), bucket preinscriptions"
  - "confirmPreEnrollmentUpload(peToken, keys, fields) — persiste keys + champs form + status SUBMITTED PUIS recâble l'OCR (extractPreEnrollmentDocuments fire-and-forget, Pitfall 4)"
  - "confirmApprenantUpload(keys) [ADMIN] — retourne les keys au wizard (contrat inchangé)"
  - "downscaleForOcr(buffer, contentType) — resize sharp (width 2000, jpeg q80) si image > 4 Mo avant vision (Pitfall 3), fallback buffer original"
  - "3 routes de serving (documents/apprenants-docs/pedagogical-assets) redirigent 302 vers signed URL fraîche en prod Supabase (Pitfall 5 : cap 4,5 Mo réponse Vercel)"
  - "NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY déclarées fail-loud (client) + turbo.json globalEnv + .env.example"
affects: [18-04, storage, direct-to-storage, ocr, preinscriptions, vercel-cap]

# Tech tracking
tech-stack:
  added:
    - "sharp (apps/web) — downscale image avant vision OCR (Pitfall 3), importé dynamiquement (import('sharp')) pour ne pas charger la native lib au load du module ni dans les tests hermétiques"
  patterns:
    - "Direct-to-storage : la server action ne renvoie QUE token + signedUrl (0 octet de fichier), le navigateur PUT direct vers Supabase — contourne le cap 4,5 Mo body Vercel"
    - "Deux chemins de scope : ADMIN via validateRequest→user.tenantId, PUBLIC via PreEnrollment.token (le token public /p/[token] n'a PAS de session Lucia)"
    - "Aiguillage de serving : _internals.PROVIDER==='supabase' → redirect 302 signed URL fraîche (TTL 600s préserve le no-store) ; sinon proxy MinIO downloadFile inchangé"
    - "sharp importé dynamiquement (await import('sharp')) dans downscaleForOcr — évite d'embarquer la native lib au module load / dans les tests"

key-files:
  created:
    - apps/web/src/server/actions/storage-upload.ts
    - apps/web/src/server/actions/__tests__/storage-upload.test.ts
  modified:
    - packages/shared/src/env.ts
    - turbo.json
    - .env.example
    - apps/web/src/app/api/documents/[id]/route.ts
    - apps/web/src/app/api/apprenants/[id]/docs/[kind]/route.ts
    - apps/web/src/app/api/pedagogical-assets/[id]/route.ts
    - apps/web/package.json

key-decisions:
  - "sharp AJOUTÉ (pas de NO-OP) pour downscaleForOcr — le NO-OP risquait l'échec OCR silencieux sur photo smartphone 10-50 Mo (critère de succès #3, Pitfall 3). Import dynamique pour ne pas alourdir le load."
  - "downscaleForOcr EXPORTÉE mais pas encore appelée dans le chemin OCR de ce plan — le recâblage download→vision reste dans preinscription-extractor.ts (inchangé). La fonction est prête pour consommation par l'extractor / le plan 04 (documenté)."
  - "confirmApprenantUpload ne persiste PAS et ne déclenche PAS l'extraction — retourne les keys au wizard admin qui conserve son contrat actuel (extractDocsFromBuffers). Pas de régression du chemin admin."
  - "NEXT_PUBLIC_SUPABASE_* en optional() : le dev local MinIO n'en a pas besoin ; la validation réelle se fait au call site upload direct (mode supabase)."
  - "upload-apprenant-docs.ts et submitPreEnrollmentForm CONSERVÉS intacts — le composant client bascule au plan 04, garder les anciens chemins fonctionnels jusque-là."

patterns-established:
  - "vi.hoisted pour le mock createSignedUploadUrl (les factories vi.mock sont hoistées au-dessus des const) — convention projet réaffirmée"
  - "Test de puissance au gate : retrait de l'appel extractPreEnrollmentDocuments → Test 4 ROUGE (1 failed | 5 passed) → restauré → 6/6, mutation NON commitée"

requirements-completed: [STOR-03]

# Metrics
duration: 5min
completed: 2026-07-04
---

# Phase 18 Plan 03: Direct-to-storage côté serveur (STOR-03) Summary

**Le côté SERVEUR du direct-to-storage est posé : 2 server actions génèrent des signed upload URL (admin scopé tenant + public par token PreEnrollment) sans faire transiter aucun octet de fichier par Vercel, une confirmation recâble l'OCR (Pitfall 4 évité), un downscale sharp protège la vision des photos 10-50 Mo (Pitfall 3), et les 3 routes de serving redirigent 302 vers une signed URL fraîche en prod Supabase (Pitfall 5 : cap 4,5 Mo réponse Vercel).**

## Performance
- **Duration:** ~5 min
- **Started:** 2026-07-04T17:25:41Z
- **Completed:** 2026-07-04T17:30:53Z
- **Tasks:** 3
- **Files modified:** 9 (2 créés, 7 modifiés)

## Accomplishments
- **Task 1 — clés client Supabase fail-loud** : `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` déclarées dans `env.ts` bloc `client` (optional, dev MinIO OK) + `runtimeEnv`, ajoutées à `turbo.json` globalEnv (invalidation cache) et documentées `.env.example` (publiables côté client). `tsc @qualiof/shared` exit 0.
- **Task 2 — 4 server actions direct-to-storage** (`storage-upload.ts`) :
  - `createApprenantUploadUrl(kind, ext)` [ADMIN] : `validateRequest` → scope `user.tenantId`, path `apprenants/{tenantId}/{uuid}/{kind}.{ext}`, `createSignedUploadUrl(DOCS_BUCKET, path)`.
  - `createPreEnrollmentUploadUrl(peToken, kind, ext)` [PUBLIC] : validation `PreEnrollment.token` + expiration (PAS de session Lucia), path `{peToken}/{kind}-{stamp}.{ext}` bucket `preinscriptions`.
  - `confirmPreEnrollmentUpload(peToken, keys, fields)` : persiste keys CNI/RIB/CFP + champs form (reprend la logique `submitPreEnrollmentForm`) + `status SUBMITTED`, `revalidatePath('/app/inscriptions')`, **PUIS recâble l'OCR** (`extractPreEnrollmentDocuments` fire-and-forget — Pitfall 4).
  - `confirmApprenantUpload(keys)` [ADMIN] : retourne les keys au wizard (contrat inchangé).
  - `downscaleForOcr(buffer, contentType)` : image > 4 Mo → `sharp().resize(width 2000).jpeg(q80)`, fallback buffer original si sharp échoue (Pitfall 3). Import dynamique de sharp.
  - **6/6 tests hermétiques** verts (mock `@/lib/storage`/`@/lib/auth`/`@qualiof/db`/`@/lib/preinscription-extractor`/`next/cache`). Erreurs en français. **0 octet de fichier** ne traverse les actions (`grep arrayBuffer|base64` = 0).
- **Task 3 — redirect 302 sur les 3 routes de serving** (`documents/[id]`, `apprenants/[id]/docs/[kind]`, `pedagogical-assets/[id]`) : en prod Supabase, `createSignedDownloadUrl(bucket, key, 600)` → `NextResponse.redirect(url, 302)` ; en MinIO local, proxy `downloadFile` inchangé. Toute la logique auth/tenant/not-found/try-catch **intégralement conservée**. `tsc @qualiof/web` exit 0.

## Task Commits
1. **Task 1: clés client Supabase fail-loud** — `f96ea34` (feat)
2. **Task 2: RED tests direct-to-storage** — `fe73060` (test)
3. **Task 2: GREEN 4 server actions + OCR rewire + downscale** — `017a150` (feat)
4. **Task 3: redirect 302 sur 3 routes de serving** — `48de41b` (feat)

## Files Created/Modified
- `apps/web/src/server/actions/storage-upload.ts` (créé) — 4 server actions + `downscaleForOcr` + helpers `safeExt`/`guessContentType`
- `apps/web/src/server/actions/__tests__/storage-upload.test.ts` (créé) — 6 tests hermétiques (5 plan + 1 smoke `confirmApprenantUpload`)
- `packages/shared/src/env.ts` (modifié) — 2 clés client + runtimeEnv
- `turbo.json` (modifié) — 2 clés globalEnv
- `.env.example` (modifié) — bloc clés client Supabase
- `apps/web/src/app/api/documents/[id]/route.ts` (modifié) — aiguillage redirect 302
- `apps/web/src/app/api/apprenants/[id]/docs/[kind]/route.ts` (modifié) — aiguillage redirect 302
- `apps/web/src/app/api/pedagogical-assets/[id]/route.ts` (modifié) — aiguillage redirect 302
- `apps/web/package.json` + `pnpm-lock.yaml` (modifiés) — ajout `sharp`

## Decisions Made
- **sharp ajouté** (pas de NO-OP) pour `downscaleForOcr` — le NO-OP risquait l'échec OCR silencieux sur photo 10-50 Mo (critère de succès #3, Pitfall 3). Import dynamique `await import('sharp')` pour ne pas charger la native lib au module load ni casser les tests hermétiques.
- **downscaleForOcr exportée mais pas encore branchée dans le chemin OCR** de ce plan (le recâblage download→vision reste dans `preinscription-extractor.ts`, inchangé). La fonction est prête pour consommation par l'extractor / le plan 04 — documenté dans le code.
- **confirmApprenantUpload ne persiste pas** : retourne les keys au wizard admin qui garde son contrat actuel (`extractDocsFromBuffers`), pas de régression.
- **upload-apprenant-docs.ts + submitPreEnrollmentForm conservés intacts** — bascule client au plan 04.

## Deviations from Plan

None - plan executed exactly as written. (Seul ajustement mécanique : mock `createSignedUploadUrl` déclaré via `vi.hoisted` — les factories `vi.mock` sont hoistées au-dessus des `const` — corrigé au 1er run, convention projet déjà établie 16-04/17-02.)

## Issues Encountered
- RED du test : d'abord échec de collection sur `Cannot access 'createSignedUploadUrlMock' before initialization` (mock non hoisté) → passé en `vi.hoisted` → 6/6 verts. Aucun autre blocage.

## Verification
- Tests server action : `pnpm --filter @qualiof/web exec vitest run src/server/actions/__tests__/storage-upload.test.ts` → **6/6 verts** (5 plan + 1 smoke).
- tsc web : `pnpm --filter @qualiof/web exec tsc --noEmit` → **exit 0**.
- tsc shared : `pnpm --filter @qualiof/shared exec tsc --noEmit` → **exit 0**.
- **0 octet de fichier** dans les server actions : `grep -cE 'arrayBuffer\(\)|base64' storage-upload.ts` = **0**.
- OCR recâblé : `grep extractPreEnrollmentDocuments storage-upload.ts` présent (=3).
- **Test de puissance** (convention projet) : retrait de l'appel `extractPreEnrollmentDocuments` de `confirmPreEnrollmentUpload` → **Test 4 ROUGE** (1 failed | 5 passed) → restauré → 6/6, mutation NON commitée.

## Acceptance (greps)
- 4 server actions exportées = **4** ✓
- `createSignedUploadUrl` (admin + public) = 3 ✓
- `extractPreEnrollmentDocuments` (recâblage OCR) = 3 ✓
- `user.tenantId` (scope admin) = 2 ✓
- `preEnrollment.findUnique` (validation token public) = 2 ✓
- `downscaleForOcr` présent = 2 ✓
- erreurs françaises (`Non authentifié`/`Lien invalide`/`expiré`) = 6 ✓
- 3 routes `NextResponse.redirect` = 1/1/1 ✓
- `createSignedDownloadUrl` + `_internals.PROVIDER` dans docs route ✓
- `validateRequest` conservé sur les 3 routes = 3 ✓
- clés client : `env.ts` URL=2/ANON=2, `turbo.json` URL=1/ANON=1, `.env.example` URL=1 ✓

## Known Stubs
`downscaleForOcr` est **exportée mais pas encore consommée** dans le chemin OCR de ce plan (le recâblage download→vision reste `preinscription-extractor.ts`). Ce n'est PAS un stub UI : c'est une primitive prête, documentée, destinée à être branchée par l'extractor ou le plan 04. Le critère de succès prod (photo 10 Mo, 0 x 413) est validé par le composant client (plan 04) + `18-SMOKE.md`. Aucun stub affectant l'objectif du plan (serveur STOR-03 posé).

## Next Phase Readiness
- **Plan 18-04** : composant client d'upload (progression, retry via `uploadToSignedUrl`/XHR contre les signed URL générées ici) + bascule du chemin base64 vers direct-to-storage + retrait de l'ancien code (`upload-apprenant-docs.ts` base64, `submitPreEnrollmentForm`) + `18-SMOKE.md` (preuve prod photo 10 Mo, 0 x 413).
- ⚠ La preuve INFRA réelle (upload direct navigateur→Supabase sans 413, serving 302 sur PDF > 4,5 Mo) exige un **projet Supabase EU réel** (`eu-west-3`, checkpoint 18-04) — non couvert par ce plan (unit hermétique + tsc uniquement).
- `downscaleForOcr` prête à brancher côté extractor si l'OCR vision est déclenché sur des images uploadées en direct.

## Self-Check: PASSED

---
*Phase: 18-supabase-storage-migration-objets-direct-to-storage*
*Completed: 2026-07-04*
