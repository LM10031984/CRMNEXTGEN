---
phase: 19
slug: base-postgres-supabase-pooler-migrations-baselin-es
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 19 — Validation Strategy

> Per-phase validation contract. **Phase infra/ops** : les critères de succès sont RUNTIME contre la
> base Supabase cloud réelle. La suite Vitest a Prisma **mocké** (hermétique) → elle ne peut PAS prouver
> les 4 critères. Les preuves sont des **smoke scripts** (`db-smoke-cloud.ts`) + `migrate status/deploy`,
> consignés dans `19-SMOKE.md` et gatés Laurent (comme `18-SMOKE.md`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (`apps/web`, `packages/shared`) — hermétique, Prisma mocké |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @qualiof/web exec tsc --noEmit` (garde-fou type, par task) |
| **Full suite command** | `pnpm --filter @qualiof/web exec vitest run` + `pnpm --filter @qualiof/shared exec vitest run` |
| **Cloud proof command** | `pnpm db:smoke:cloud` (runtime, cloud réel — gaté 19-03) |
| **Estimated runtime** | tsc ~15 s · suite ~60 s · smoke cloud ~10 s |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @qualiof/web exec tsc --noEmit` (exit 0).
- **After every plan wave:** suite Vitest complète (baseline 1163/1164 — l'échec `shared-template.test.ts` MIME jpeg/jpg est PRÉ-EXISTANT hors scope).
- **Phase gate (before `/gsd:verify-work`):** `19-SMOKE.md` — les 4 critères prouvés contre le cloud réel, gaté Laurent (destructif = étape séparée, backup avant baseline).
- **Max feedback latency:** ~60 s (suite) ; ~10 s (smoke cloud).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | DB-01/DB-02 | build/type | `pnpm --filter @qualiof/web exec tsc --noEmit` | ✅ W0 crée le script | ⬜ pending |
| 19-02-01 | 02 | 2 | DB-02 | config grep | `grep pooler.supabase.com:6543 .env` | ✅ | ⬜ pending |
| 19-02-02 | 02 | 2 | DB-01 | cloud | `prisma migrate status` (DIRECT_URL) | ❌ cloud | ⬜ pending |
| 19-02-03 | 02 | 2 | DB-02 | cloud | `select extname from pg_extension` (SQL Editor) | ❌ cloud | ⬜ pending |
| 19-03-01 | 03 | 3 | DB-01/DB-02 | doc | `test -f 19-SMOKE.md` | ✅ | ⬜ pending |
| 19-03-02 | 03 | 3 | DB-02 | cloud smoke | `pnpm db:smoke:cloud` → « ALL 4 CRITERIA PROVEN » | ❌ cloud | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/scripts/db-smoke-cloud.ts` — round-trip poolé (5 hits) + tx Serializable + extensions (similarity/unaccent) + INSERT UUID nettoyé (plan 19-01).
- [ ] `package.json` — npm script `db:smoke:cloud` (plan 19-01).
- [ ] `packages/db/prisma/migrations/0_init/migration.sql` — baseline collapse `migrate diff --from-empty` (plan 19-02).
- [ ] `19-SMOKE.md` — journal des preuves cloud gaté Laurent, calqué 18-SMOKE.md (plan 19-03).
- [ ] Pas de nouveau framework à installer (tsx/vitest/prisma déjà présents).
- [ ] Pas de script `setval` : audit `grep -c 'autoincrement()' schema.prisma` = **0** → aucune séquence liée à une PK, critère #4 documenté + prouvé par INSERT UUID.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `migrate deploy`/`status` verts via :5432 | DB-01 | Requiert base cloud réelle + password DB (secret Laurent) | 19-02 Task 2, consigné 19-SMOKE.md |
| Round-trip poolé sans `prepared statement` | DB-02 #2 | Runtime contre pooler Supavisor réel (Prisma mocké en Vitest) | `pnpm db:smoke:cloud`, 19-03 |
| Extensions trigram/unaccent au runtime | DB-02 #3 | `$queryRaw` contre extensions installées sur le cloud | `pnpm db:smoke:cloud`, 19-03 |
| INSERT sans collision PK | DB-02 #4 | Runtime cloud ; trivial (PK UUID, 0 séquence) mais prouvé empiriquement | `pnpm db:smoke:cloud`, 19-03 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (tsc/grep par task + smoke au gate)
- [x] Wave 0 covers all MISSING references (script + baseline + SMOKE.md)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-04
