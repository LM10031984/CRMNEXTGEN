---
phase: 18
slug: supabase-storage-migration-objets-direct-to-storage
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @qualiof/web exec vitest run <path>` |
| **Full suite command** | `pnpm --filter @qualiof/web exec vitest run` |
| **Estimated runtime** | ~40 seconds (full web suite, baseline 1145/1146) |

Note pattern projet : tests HERMÉTIQUES obligatoires — mocker `@/lib/storage` et `@supabase/supabase-js` (storage.ts importe `sharedEnv` → `createEnv()` fail-loud au load). Le harness ne charge pas `.env`.

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @qualiof/web exec vitest run <path du fichier de test touché>`
- **After every plan wave:** `pnpm --filter @qualiof/web exec vitest run` (suite web complète)
- **Before `/gsd:verify-work`:** Full suite green + 18-SMOKE.md validé par Laurent
- **Max feedback latency:** ~40 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | STOR-01 | unit (Wave 0) | `vitest run src/lib/__tests__/storage.test.ts` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | STOR-01 | unit | `vitest run src/lib/__tests__/storage.test.ts` | ✅ (après 01-01) | ⬜ pending |
| 18-02-01 | 02 | 2 | STOR-02 | unit (Wave 0) | `vitest run scripts/__tests__/migrate-storage.test.ts` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 2 | STOR-02 | unit | `vitest run scripts/__tests__/migrate-storage.test.ts` | ✅ (après 02-01) | ⬜ pending |
| 18-03-01 | 03 | 2 | STOR-03 | typecheck | `tsc --noEmit` (shared) | n/a | ⬜ pending |
| 18-03-02 | 03 | 2 | STOR-03 | unit (Wave 0) | `vitest run src/server/actions/__tests__/storage-upload.test.ts` | ❌ W0 | ⬜ pending |
| 18-03-03 | 03 | 2 | STOR-03 | typecheck | `tsc --noEmit` (web) | n/a | ⬜ pending |
| 18-04-01 | 04 | 3 | STOR-03 | typecheck | `tsc --noEmit` (web) | n/a | ⬜ pending |
| 18-04-02 | 04 | 3 | STOR-03 | typecheck | `tsc --noEmit` (web) | n/a | ⬜ pending |
| 18-04-03 | 04 | 3 | STOR-01/02/03 | file check | `test -f 18-SMOKE.md` | n/a | ⬜ pending |
| 18-04-CK | 04 | 3 | STOR-01/03 | manuel (checkpoint) | 18-SMOKE.md (prod réelle) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/src/lib/__tests__/storage.test.ts` — STOR-01 (createSignedUploadUrl, objectExists, ensureBucket params, createSignedDownloadUrl) mock `@supabase/supabase-js`
- [ ] `apps/web/scripts/__tests__/migrate-storage.test.ts` — STOR-02 (collectAllKeys 8 champs, isInvalidSupabaseKey, DRY sans écriture, orphelins) mock prisma + storage
- [ ] `apps/web/src/server/actions/__tests__/storage-upload.test.ts` — STOR-03 (scope tenant, signed URL, confirmation → OCR recâblé) mock validateRequest + storage + extractor
- [ ] Framework install : néant — Vitest déjà en place.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Accès non-signé au bucket privé REFUSÉ ; signed URL fraîche donne accès | STOR-01 | Propriété d'infra prod — projet Supabase réel requis | 18-SMOKE.md § STOR-01 |
| Migration réelle 0 lien mort (DRY→WRITE) | STOR-02 | MinIO en marche + projet Supabase réel + destructif gaté | 18-SMOKE.md § STOR-02 |
| Photo CNI 10 Mo prod → upload direct → 0×413 → OCR déclenché | STOR-03 | Cap 4,5 Mo Vercel = propriété prod, non reproductible en unit | 18-SMOKE.md § STOR-03 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint = manuel via 18-SMOKE.md)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 40s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — Wave 0 tests créés en première tâche de chaque plan (RED avant GREEN)
