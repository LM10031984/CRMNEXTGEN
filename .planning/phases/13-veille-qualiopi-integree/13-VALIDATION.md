---
phase: 13
slug: veille-qualiopi-integree
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Source de vérité :** `13-RESEARCH.md` §10 (Validation Architecture). Ce fichier en est la projection actionnable.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (apps/web + packages/shared + packages/db) |
| **Config file** | `apps/web/vitest.config.ts` (env: node) |
| **Quick run command** | `pnpm --filter @qualiof/web test -- src/lib/veille src/server/actions/__tests__/veille src/components/veille` |
| **Full suite command** | `pnpm test` (monorepo turbo) |
| **Estimated runtime** | ~3s (quick) / ~30s (full) |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @qualiof/web test -- src/lib/veille src/server/actions/__tests__/veille src/components/veille` (~3s)
- **After every plan wave:** `pnpm test` (full monorepo, ~30s)
- **Before `/gsd:verify-work`:** Full suite green + 1 dry-run worker manual (`tsx scripts/test-veille-worker.ts`) + 1 dry-run import xlsx + génération réelle des 4 PDFs vérifiée visuellement
- **Max feedback latency:** 5 seconds (quick run)

---

## Per-Task Verification Map

> Initial scaffolding. Plans à créer définiront le `Task ID` exact (format `13-{plan}-{task}`). Cette table sera complétée par les PLAN.md eux-mêmes via leur frontmatter `validation_map`.

### VEILLE-01 — Modèle Prisma RegulatoryWatch + Import xlsx

| Req | Behavior | Test Type | Automated Command | File Status |
|-----|----------|-----------|-------------------|-------------|
| VEILLE-01 | Migration applique sans casser autres tables | smoke / migration | `pnpm --filter @qualiof/db exec prisma migrate diff --from-empty --to-schema-datamodel packages/db/prisma/schema.prisma` | ❌ Wave 0 |
| VEILLE-01 | Import xlsx idempotent (2 runs = même count) | unit | `pnpm --filter @qualiof/db test -- import-veille.idempotence.test.ts` | ❌ Wave 0 |
| VEILLE-01 | Parser flexibleDate gère 3 formats | unit pure | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/parse-flexible-date.test.ts` | ❌ Wave 0 |
| VEILLE-01 | Import xlsx mappe 5 sheets → 4 thèmes | integration | `pnpm --filter @qualiof/db test -- import-veille.mapping.test.ts` | ❌ Wave 0 |

### VEILLE-02 — Page /app/veille + RBAC + Inline edit

| Req | Behavior | Test Type | Automated Command | File Status |
|-----|----------|-----------|-------------------|-------------|
| VEILLE-02 | Page rend 4 onglets thématiques + onglet inbox | smoke RSC | `pnpm --filter @qualiof/web test -- src/app/app/veille/__tests__/page.smoke.test.ts` | ❌ Wave 0 |
| VEILLE-02 | updateRegulatoryWatchExploitation met dateLastReviewed=now() | unit | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.update-exploitation.test.ts` | ❌ Wave 0 |
| VEILLE-02 | RBAC : non-ADMIN/MANAGER → ForbiddenError | unit | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.rbac.test.ts` | ❌ Wave 0 |
| VEILLE-02 | LECTEUR ne voit PAS l'onglet inbox (D-03) | smoke | `pnpm --filter @qualiof/web test -- src/components/veille/__tests__/veille-inbox.rbac.test.ts` | ❌ Wave 0 |
| VEILLE-02 | daysSince helper retourne null si date null + colore | unit pure | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/days-since.test.ts` | ❌ Wave 0 |
| VEILLE-02 | Inline edit Exploitation → AuditLog `regulatoryWatch.exploitation_updated` | integration | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.audit.test.ts` | ❌ Wave 0 |

### VEILLE-03 — Export PDF audit (stocké en MinIO comme Document)

| Req | Behavior | Test Type | Automated Command | File Status |
|-----|----------|-----------|-------------------|-------------|
| VEILLE-03 | Export PDF produit fichier > 5 KB avec N lignes | integration | `pnpm --filter @qualiof/web test -- src/lib/__tests__/veille-audit-template.test.ts` | ❌ Wave 0 |
| VEILLE-03 | Footer paged contient tenant name + SIRET + NDA | unit string | `pnpm --filter @qualiof/web test -- src/lib/__tests__/veille-audit-template.html.test.ts` | ❌ Wave 0 |
| VEILLE-03 | Export PDF trace AuditLog `regulatoryWatch.exported` | integration | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.export.test.ts` | ❌ Wave 0 |
| VEILLE-03 | Export crée une ligne Document persistée MinIO (D-02) | integration | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.export.document.test.ts` | ❌ Wave 0 |

### VEILLE-04 — Worker BullMQ cron hebdo RSS + Ollama

| Req | Behavior | Test Type | Automated Command | File Status |
|-----|----------|-----------|-------------------|-------------|
| VEILLE-04 | Cron registered avec `'0 8 * * 1'` + tz Europe/Paris + jobId fixe | unit (mock BullMQ) | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/worker.cron.test.ts` | ❌ Wave 0 |
| VEILLE-04 | RSS fetcher tolère feed invalide → log + continue | unit (mock fetch) | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/fetch-rss.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Classify → null + log AIGenerationJob si JSON Ollama invalide | unit (mock callOllama) | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/classify.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Dédup par `(url, theme)` (D-11) : 2ème ingestion = skip | unit | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/dedup-by-url.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Item classé OTHER non inséré (AIGenerationJob.status='skipped_other') | unit | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/classify.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Insertion auto trace AuditLog `regulatoryWatch.auto_inserted` actorUserId=null | unit | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/persist.audit.test.ts` | ❌ Wave 0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · W0 = créé en Wave 0 du plan correspondant*

---

## Wave 0 Requirements

Tests stubs à créer en Wave 0 (foundation plan). Chacun couvre un ou plusieurs items du Per-Task Verification Map.

- [ ] `apps/web/src/lib/veille/__tests__/parse-flexible-date.test.ts` — VEILLE-01 (3 formats date)
- [ ] `apps/web/src/lib/veille/__tests__/days-since.test.ts` — VEILLE-02 (KPI badge)
- [ ] `apps/web/src/lib/veille/__tests__/fetch-rss.test.ts` — VEILLE-04 (RSS fault-tolerant)
- [ ] `apps/web/src/lib/veille/__tests__/classify.test.ts` — VEILLE-04 (Ollama JSON guard-rail + OTHER skip)
- [ ] `apps/web/src/lib/veille/__tests__/dedup-by-url.test.ts` — VEILLE-04 (dédup par (url, theme))
- [ ] `apps/web/src/lib/veille/__tests__/persist.audit.test.ts` — VEILLE-04 (AuditLog auto_inserted)
- [ ] `apps/web/src/lib/veille/__tests__/worker.cron.test.ts` — VEILLE-04 (cron registration)
- [ ] `apps/web/src/lib/__tests__/veille-audit-template.test.ts` — VEILLE-03 (PDF non vide)
- [ ] `apps/web/src/lib/__tests__/veille-audit-template.html.test.ts` — VEILLE-03 (footer string)
- [ ] `apps/web/src/server/actions/__tests__/veille.update-exploitation.test.ts` — VEILLE-02 (dateLastReviewed)
- [ ] `apps/web/src/server/actions/__tests__/veille.rbac.test.ts` — VEILLE-02 (RBAC ForbiddenError)
- [ ] `apps/web/src/server/actions/__tests__/veille.audit.test.ts` — VEILLE-02 (AuditLog exploitation_updated)
- [ ] `apps/web/src/server/actions/__tests__/veille.export.test.ts` — VEILLE-03 (AuditLog exported)
- [ ] `apps/web/src/server/actions/__tests__/veille.export.document.test.ts` — VEILLE-03 (Document MinIO row created — D-02)
- [ ] `apps/web/src/app/app/veille/__tests__/page.smoke.test.ts` — VEILLE-02 (page boote sans crash)
- [ ] `apps/web/src/components/veille/__tests__/veille-inbox.rbac.test.ts` — VEILLE-02 (LECTEUR strictement masqué — D-03)
- [ ] `packages/db/scripts/__tests__/import-veille.idempotence.test.ts` — VEILLE-01 (rerun safe)
- [ ] `packages/db/scripts/__tests__/import-veille.mapping.test.ts` — VEILLE-01 (5 sheets → 4 themes)
- [ ] `pnpm --filter @qualiof/web add rss-parser` — dépendance npm worker (Wave 0 du plan worker)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 4 PDFs audit générés (1 par thème) sont lisibles et présentables à un auditeur Qualiopi | VEILLE-03 | Format visuel + contenu métier humain | 1) `tsx scripts/test-veille-export.ts` 2) Ouvrir chaque PDF 3) Vérifier header tenant + table sources/dates/exploitations + footer paged + format A4 |
| Worker dry-run RSS+Ollama insère effectivement des suggestions classées | VEILLE-04 | Validation prompt Ollama + flux RSS réel | 1) `tsx scripts/test-veille-worker.ts --dry-run` (forcer ingestion 5 items) 2) Vérifier en BDD : count > 0, themes distribués, exploitations non vides, status='DRAFT' suggestedBy='AUTO' |
| Sources RSS 12 seed valides (probe HEAD 200 OK) | VEILLE-04 | URLs externes peuvent bouger | 1) `tsx scripts/probe-veille-sources.ts` 2) Lire output : 12/12 OK ou liste des morts à remplacer |
| Import xlsx one-shot du fichier réel produit ~84 entrées | VEILLE-01 | Fichier source réel `C6.i23-24-25tableau veille.xlsx` | 1) `tsx scripts/import-veille-from-xlsx.ts /Users/laurentmarx/Documents/CRM\ Next\ gen/C6.i23-24-25tableau\ veille.xlsx` 2) Compter en BDD : 50 historiques + 34 récentes ≈ 84 entrées |
| Page /app/veille opérationnelle bout en bout | VEILLE-02 | UX intégrée | 1) Login ADMIN 2) Naviguer /app/veille 3) Vérifier 4 onglets + inbox 4) Éditer exploitation inline 5) Approuver une suggestion inbox 6) Logout, login LECTEUR 7) Vérifier absence de l'onglet inbox (D-03) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (à vérifier dans chaque PLAN.md)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (18 tests + 1 npm install)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (quick run)
- [ ] `nyquist_compliant: true` à passer en frontmatter une fois Wave 0 implémenté
- [ ] Manual-only verifications listées sont exécutables (scripts existants ou à créer)

**Approval:** pending
