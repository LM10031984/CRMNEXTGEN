---
phase: 18-supabase-storage-migration-objets-direct-to-storage
plan: 04
subsystem: infra
tags: [supabase, storage, direct-to-storage, signed-url, xhr, ocr, preinscription, rgpd]

# Dependency graph
requires:
  - phase: 18-03
    provides: "server actions createPreEnrollmentUploadUrl / confirmPreEnrollmentUpload / createApprenantUploadUrl / confirmApprenantUpload + downscaleForOcr + routes serving 302"
  - phase: 18-01
    provides: "adaptateur storage.ts createSignedUploadUrl / objectExists + clés client NEXT_PUBLIC_SUPABASE_*"
  - phase: 18-02
    provides: "script migrate-storage.ts DRY→WRITE (8 champs / 2 buckets)"
  - phase: 17
    provides: "région EU documentée + env.ts fail-loud 5 clés cloud + STORAGE_PROVIDER"
provides:
  - "Composant client partagé direct-upload-field.tsx : signed URL → XHR PUT direct Supabase → progression réelle → 1 retry silencieux + bouton Réessayer → 50 Mo (D-05/06/07/08)"
  - "Formulaire public /p/[token] refondu direct-to-storage (base64 retiré, 0 octet via Vercel)"
  - "Écran admin (create-person-button) basculé sur le même composant"
  - "18-SMOKE.md rempli avec résultats réels sur infra Supabase (STOR-01/02/03 validés, 3 items pending)"
  - "Bascule STORAGE_PROVIDER=supabase effective en local + migration 3109/3109 objets 0 lien mort"
  - "downscaleForOcr câblé (Known Stub 18-03 résolu) → OCR opérationnel sur photo 11 Mo"
affects: [phase-19, phase-21, phase-22]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upload direct-to-storage : navigateur PUT le File brut sur signed URL Supabase, aucun octet via server action (contourne cap 4,5 Mo Vercel, anti-413)"
    - "Composant upload agnostique public/admin via injection requestUploadUrl (fonction diffère selon contexte)"
    - "Progression réelle via xhr.upload.onprogress ; 1 retry auto silencieux avant bouton Réessayer"
    - "Module OCR neutre sans auth (ocr-downscale.ts) — règle worker : pas d'import React/auth dans un module partagé worker"

key-files:
  created:
    - apps/web/src/components/shared/direct-upload-field.tsx
    - apps/web/src/lib/ocr-downscale.ts
    - .planning/phases/18-supabase-storage-migration-objets-direct-to-storage/18-SMOKE.md
  modified:
    - apps/web/src/components/preinscriptions/public-form.tsx
    - apps/web/src/components/forms/create-person-button.tsx
    - apps/web/src/lib/preinscription-extractor.ts
    - apps/web/src/server/actions/storage-upload.ts
    - apps/web/scripts/migrate-storage.ts

key-decisions:
  - "Open Q1 tranchée : XHR PUT direct sur signed URL fonctionne (préfixe NEXT_PUBLIC_SUPABASE_URL/storage/v1 + x-upsert) → pas de fallback uploadToSignedUrl, progression D-06 réelle conservée"
  - "Région : projet Supabase West EU (Irlande) réutilisé (gntlqyscahbgjrmsbzil) au lieu de eu-west-3 Paris — choix Laurent, RGPD conforme (UE)"
  - "Bascule STORAGE_PROVIDER=supabase effective en local après migration 3109/3109 0 lien mort (backup .env.bak-phase18)"

patterns-established:
  - "Pattern direct-to-storage client : requestUploadUrl injecté → uploadWithProgress(XHR PUT) → onUploaded(kind, path) → confirmation serveur à la soumission"
  - "Pattern module OCR neutre : downscale déplacé hors 'use server' vers module sans auth pour être câblable dans l'extractor"

requirements-completed: [STOR-03]

# Metrics
duration: ~4h (dont checkpoint validation infra réelle déléguée)
completed: 2026-07-04
---

# Phase 18 Plan 04: Composant upload direct-to-storage (STOR-03 client) Summary

**Composant client partagé XHR PUT direct-to-storage (progression réelle, retry, 50 Mo) câblé sur formulaire public + admin, base64 retiré, validé bout-en-bout sur Supabase réel : photo CNI 11,3 Mo → upload direct 200 → OCR EXTRACTED, 0 octet via Vercel.**

## Performance

- **Duration:** ~4h (incluant le checkpoint de validation sur infra Supabase réelle, délégué par Laurent)
- **Tasks:** 4 (3 auto + 1 checkpoint résolu)
- **Files modified:** 8 (3 créés, 5 modifiés)

## Accomplishments

- **Composant partagé `direct-upload-field.tsx`** (`'use client'`) : génère la signed URL via une fonction injectée (`requestUploadUrl`), envoie le `File` brut en **XHR PUT DIRECT** vers Supabase avec **barre de progression réelle** (`xhr.upload.onprogress`, D-06), **1 retry auto silencieux** puis bouton « Réessayer » (D-07), limite **50 Mo** (D-05), aperçu PII en `<img>` natif (jamais `next/image`, CLAUDE.md).
- **Formulaire public `/p/[token]` refondu** : `fileToBase64` retiré, `DirectUploadField` câblé sur `createPreEnrollmentUploadUrl` + `confirmPreEnrollmentUpload` — **0 octet de fichier ne transite par Vercel** (anti-413).
- **Écran admin** (`create-person-button.tsx`) basculé sur le même composant (D-08) via `createApprenantUploadUrl`.
- **18-SMOKE.md** rempli avec les **résultats réels** : STOR-01/02/03 validés sur l'infra Supabase réelle, 3 items pending documentés.
- **Migration exécutée** : 3109/3109 objets migrés MinIO→Supabase, **0 lien mort**, bascule `STORAGE_PROVIDER=supabase`.

## Task Commits

1. **Task 1: Composant direct-upload-field (progress + retry + 50 Mo)** - `4c2485d` (feat)
2. **Task 2: Câblage DirectUploadField public + admin (base64 retiré)** - `84a990c` (feat)
3. **Task 3: 18-SMOKE.md validations prod STOR-01/02/03** - `e483091` (docs)
4. **Task 4: Checkpoint validation prod Supabase** - RÉSOLU sur infra réelle (voir Deviations)
   - **Bug fix 1** (migrate-storage exécutable avec chemin à espaces) - `9956438` (fix)
   - **Bug fix 2+3** (compile Next + câblage downscale OCR) - `d35aa27` (fix)
   - **Résultats SMOKE réels consignés** - `0bb74b8` (docs)

## Files Created/Modified

- `apps/web/src/components/shared/direct-upload-field.tsx` — composant upload direct partagé (XHR PUT, progression, retry, 50 Mo, aperçu `<img>` PII)
- `apps/web/src/lib/ocr-downscale.ts` — `downscaleForOcr` déplacé ici (module neutre sans auth) et câblé dans l'extractor (résout Known Stub 18-03)
- `.planning/phases/.../18-SMOKE.md` — créé puis rempli avec résultats réels
- `apps/web/src/components/preinscriptions/public-form.tsx` — base64 retiré, DirectUploadField câblé, `handleSubmit` confirme au serveur
- `apps/web/src/components/forms/create-person-button.tsx` — admin basculé sur DirectUploadField (D-08)
- `apps/web/src/lib/preinscription-extractor.ts` — câble `downscaleForOcr` sur CNI/RIB/CFP
- `apps/web/src/server/actions/storage-upload.ts` — `guessContentType` dé-exporté (`'use server'` interdit un export sync)
- `apps/web/scripts/migrate-storage.ts` — garde d'entrée `pathToFileURL` (chemin à espaces) + rapport ancré racine monorepo

## Decisions Made

- **Open Q1 tranchée (XHR PUT direct OK)** : le PUT direct sur la signed URL (préfixe `NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/upload/sign` + `x-upsert`) renvoie 200 — le fallback `uploadToSignedUrl` (sans progression) n'est PAS nécessaire. La progression réelle D-06 est donc conservée.
- **Région West EU (Irlande) au lieu de eu-west-3 Paris** : projet Supabase `gntlqyscahbgjrmsbzil` (créé 2026-06-03 pour le staging) réutilisé sur décision de Laurent. Irlande = UE → RGPD conforme. La cible Paris `eu-west-3` documentée en Phase 17 reste la préférence ; l'écart est acté, non bloquant.
- **Bascule STORAGE_PROVIDER=supabase effective en local** : après migration 3109/3109 avec 0 lien mort (rapport `.planning/audit/STORAGE-MIGRATION-REPORT-2026-07-04.md`). MinIO conservé (D-02, suppression = étape séparée). Backup `.env.bak-phase18` créé.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] migrate-storage.ts ne s'exécutait jamais (chemin à espaces)**
- **Found during:** Task 4 (validation infra réelle)
- **Issue:** La garde d'entrée CLI `import.meta.url === \`file://${process.argv[1]}\`` ne matche pas un chemin de projet **contenant des espaces** (URL-encodé `%20`) → `main()` jamais appelée, migration jamais lancée. En plus, le rapport s'écrivait sous `apps/web` (cwd sous `pnpm --filter`) au lieu de la racine monorepo.
- **Fix:** Remplacé par `pathToFileURL(process.argv[1]).href` ; rapport ancré via `fileURLToPath` sur la racine.
- **Files modified:** apps/web/scripts/migrate-storage.ts
- **Verification:** DRY 3109 clés collectées, WRITE 3109/3109 migrés, 0 lien mort — rapport écrit à la racine.
- **Committed in:** `9956438`

**2. [Rule 1 - Bug] storage-upload.ts exportait une fonction sync sous 'use server'**
- **Found during:** Task 4 (premier rendu réel)
- **Issue:** `storage-upload.ts` (`'use server'`) exportait `guessContentType` (synchrone) → build error Next « Server actions must be async functions » au premier rendu du formulaire.
- **Fix:** `guessContentType` dé-exporté (rendu interne au module).
- **Files modified:** apps/web/src/server/actions/storage-upload.ts
- **Verification:** Build Next OK, formulaire rend.
- **Committed in:** `d35aa27`

**3. [Rule 1 - Bug] downscaleForOcr exportée mais jamais câblée (Known Stub 18-03) → OCR KO sur 11 Mo**
- **Found during:** Task 4 (extraction OCR sur photo 11 Mo)
- **Issue:** `downscaleForOcr` (18-03) était exportée mais **pas branchée** dans le chemin OCR → l'extraction vision échouait sur la photo 11 Mo (« Provider returned error », image trop lourde).
- **Fix:** Déplacé `downscaleForOcr` vers `apps/web/src/lib/ocr-downscale.ts` (module neutre sans auth — règle worker : pas d'import React/auth) et câblé dans `preinscription-extractor.ts` (CNI/RIB/CFP).
- **Files modified:** apps/web/src/lib/ocr-downscale.ts (créé), apps/web/src/lib/preinscription-extractor.ts
- **Verification:** Re-extraction sur 11,3 Mo → EXTRACTED, warnings: [], données CNI réelles extraites.
- **Committed in:** `d35aa27`

---

**Total deviations:** 3 auto-fixed (2 bugs Rule 1, 1 blocking Rule 3)
**Impact on plan:** Les 3 corrections étaient nécessaires pour que le chemin direct-to-storage fonctionne réellement bout-en-bout. Aucun scope creep — ce sont des bugs révélés uniquement par le smoke sur infra réelle (impossibles à voir en test hermétique). Le Known Stub 18-03 est résolu.

## Issues Encountered

- Le smoke sur infra réelle a révélé 3 bugs invisibles en test hermétique (garde CLI, export sync sous `'use server'`, stub OCR non câblé) — tous corrigés. C'est exactement la valeur du checkpoint « validation prod ».

## Known Stubs

Aucun stub résiduel dans le périmètre de ce plan. **Le Known Stub 18-03 (`downscaleForOcr` non câblé) est RÉSOLU** (déviation 3).

## Items pending (non testables aujourd'hui — PAS des échecs)

1. **Comportement Vercel prod réel** — 413 impossible par design (0 octet via Vercel, prouvé en local) mais non observé sur Vercel : l'app n'est PAS déployée (Phase 21 du milestone v6).
2. **Test mobile réel avec réseau mobile** — retry sur coupure réseau réelle (code en place, testé en labo seulement).
3. **Expiration signed URL après 11 min en temps réel** — refus de token invalide (même mécanisme JWT `exp`) prouvé à la place.

## User Setup Required

None — la validation a été exécutée sur l'infra Supabase réelle par l'orchestrateur (délégation Laurent). Backup `.env.bak-phase18` créé.

## Next Phase Readiness

- **STOR-03 satisfait** (client + preuve bout-en-bout). **Phase 18 = 4/4** (STOR-01/02/03 tous complets).
- `STORAGE_PROVIDER=supabase` actif en local, 3109 objets migrés 0 lien mort.
- **Rappels pour Phase 21 (App Vercel)** : re-valider le 413/direct-to-storage une fois l'app déployée sur Vercel prod ; tester le retry sur coupure réseau mobile réelle.
- **Rappel région** : cible Phase 17 = Paris `eu-west-3` ; l'infra actuelle est Irlande (West EU). À arbitrer si un projet Paris dédié est recréé pour la prod finale (Supabase région = immuable → recréer + migrer).
- Prochain : `/gsd:verify-work 18`.

## Self-Check: PASSED

- FOUND: apps/web/src/components/shared/direct-upload-field.tsx
- FOUND: apps/web/src/lib/ocr-downscale.ts
- FOUND: apps/web/src/lib/preinscription-extractor.ts
- FOUND: apps/web/src/server/actions/storage-upload.ts
- FOUND: apps/web/scripts/migrate-storage.ts
- FOUND: .planning/audit/STORAGE-MIGRATION-REPORT-2026-07-04.md
- FOUND commits: 4c2485d, 84a990c, e483091, 9956438, d35aa27, 0bb74b8

---
*Phase: 18-supabase-storage-migration-objets-direct-to-storage*
*Completed: 2026-07-04*
