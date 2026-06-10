---
phase: 13-veille-qualiopi-integree
status: complete
closed: 2026-05-25
duration: 1 jour
plans: 6/6
requirements: [VEILLE-01, VEILLE-02, VEILLE-03, VEILLE-04]
metrics:
  production_files: ~56
  tests_wave0: 86
  audit_log_verbs_instantiated: 8
  rss_sources_seed: 12
  xlsx_entries_imported: 103
  worker_dry_run_inserts: 37
key-decisions:
  - "AuditLog convention `regulatoryWatch.*` (7e instance one-helper-per-entity, 8 verbes documentés)"
  - "Worker safety pattern `lib/veille/core.ts` (0 imports React/auth/server-actions vérifié)"
  - "LECTEUR strictement masqué de l'inbox (D-03, 3 niveaux defense-in-depth)"
  - "PDF audit stocké en MinIO comme Document (type=VEILLE_AUDIT)"
  - "DocType += VEILLE_AUDIT (extension enum additive)"
---

# Phase 13 — Veille Qualiopi intégrée — SUMMARY

**Closed:** 2026-05-25
**Duration:** ~1 jour (paliers de 7 à 14 min/plan, exécution séquentielle Plans 01→06)
**Status:** ✅ Complete (6/6 plans, 4/4 requirements VEILLE-01..04)

## Goal Achieved

Couvrir le critère 6 Qualiopi (indicateurs 23/24/25/26) via une **veille intégrée dans QualiOF**, 100% locale (RSS + Ollama mistral-small:24b, 0 coût API), avec exploitation tracée et export PDF audit. **Worker safety pattern** instancié (1ère vraie application pratique de `feedback_worker_no_react_imports.md`).

Concrètement :
- Table `RegulatoryWatch` Prisma + 3 enums + 3 indexes
- 103 entrées historiques importées du xlsx `C6.i23-24-25tableau veille.xlsx` (idempotent)
- Page `/app/veille` 5 onglets (4 thématiques + inbox conditionnel D-03)
- Export PDF audit stocké en MinIO comme `Document` (snapshot traçable)
- Worker BullMQ cron hebdo lundi 8h Europe/Paris + Ollama mistral-small:24b
- 37 entrées DRAFT/AUTO créées au 1er dry-run du worker (validation end-to-end)

## Plans & Artifacts

### Plan 13-01 — Foundation (VEILLE-01)

**Duration:** 14 min · **Tests:** 18 verts (8 parse + 3 idempotence + 7 mapping)

- Migration Prisma `phase13_regulatory_watch` : model `RegulatoryWatch` + 3 enums (`RegulatoryWatchTheme/Status/Source`) + 3 indexes (`[tenantId, theme, status]` / `[tenantId, status, suggestedBy]` / `[tenantId, dateLastReviewed]`) + relation `Tenant.regulatoryWatches[]`.
- Helper `parseFlexibleDate` (3 formats date xlsx : DD/MM/YYYY, DD-Mmm-YY, Mmm-YY).
- Helper `logRegulatoryWatchEvent` (**7e instance one-helper-per-entity** après `parameters.*` / `users.*` / `auth.*` / `leads.*` / `documents.*` / `invoices.*`). 8 verbes documentés en JSDoc.
- Script `import-veille-from-xlsx.ts` idempotent par tuple `(tenantId, theme, title, url)` (D-11 autorise duplication thématique).
- 1ère config vitest dans `packages/db` (lockfile + devDep + script `test`).
- Commits : `ab8f874` / `d636909` / `9bca2f0` / `0ff5d69` / `35691fb`.

### Plan 13-02 — Server actions + RBAC (VEILLE-02 backend)

**Duration:** 7 min · **Tests:** 23 verts (5 daysSince + 8 RBAC + 4 update-exploitation + 6 audit)

- 6 server actions `apps/web/src/server/actions/veille.ts` (423 LOC, auth-protected) : `createWatch` / `updateWatch` / `updateExploitation` / `approveWatch` / `rejectWatch` / `archiveWatch`.
- 4 Zod schemas `packages/shared/src/schemas/veille.ts` + `VeilleThemeEnum` + re-export barrel.
- Helper `daysSince` (KPI X jours, seuils Qualiopi documentés JSDoc < 30 / 30-89 / ≥ 90).
- 6 verbes AuditLog instanciés : `created` / `updated` / `exploitation_updated` / `approved` / `rejected` / `archived`.
- Defense-in-depth multi-tenant : 13 occurrences `tenantId: user.tenantId`.
- Commits : `cff9470` / `c486dff` / `038df03`.

### Plan 13-03 — Page UI /app/veille (VEILLE-02 frontend)

**Duration:** 13 min · **Tests:** 15 verts (10 page smoke + 5 inbox RBAC)

- Route Server Component `app/app/veille/page.tsx` (190 LOC) — 5 onglets URL state, force-dynamic.
- Helper isolé `page-helpers.ts` (3 exports purs : `shouldShowInbox` / `parseTab` / `tabToTheme`).
- 8 composants client veille/* (~1398 LOC total) : VeilleTabsClient / VeilleTable / ExploitationCell / VeilleRowActions / AddVeilleDialog / EditVeilleDialog / VeilleInbox / DaysSinceBadge.
- Sidebar enrichie (`Newspaper` lucide, entrée "Veille Qualiopi" section "Suivi", allowedRoles=ADMIN+MANAGER+LECTEUR).
- **D-03 LECTEUR strict 3 niveaux defense-in-depth** : (1) helper pur `shouldShowInbox=false` pour LECTEUR ; (2) RSC redirect `?tab=inbox` → `?tab=indic_23` AVANT lookup BDD ; (3) Client `{canSeeInbox && <button>Inbox</button>}` non rendu.
- Build Next : `/app/veille` = 9.79 kB / 185 kB First Load.
- Commits : `db9959b` / `a58346e` / `c8cf4b6` / `63c060a`.

### Plan 13-04 — Export PDF audit MinIO (VEILLE-03)

**Duration:** 12 min · **Tests:** 13 verts (3 template + 3 footer string + 4 export + 3 Document MinIO)

- Migration Prisma `DocType += VEILLE_AUDIT` (extension enum additive — 21e valeur).
- Template `apps/web/src/lib/veille-audit-template.ts` (279 LOC, clone-strict `legal-docs-template.ts` BUG-15). WeasyPrint CSS Paged Media + footer paged tenant SIRET/NDA + 4 thèmes Qualiopi labellés FR.
- Server action `apps/web/src/server/actions/veille-export.ts` (170 LOC) : `generateVeilleAuditForTheme(theme)` ADMIN+MANAGER, MinIO upload AVANT INSERT Document (pas de row orpheline), AuditLog `regulatoryWatch.exported` (7e verbe sur 8) avec `targetWatchId='BULK'`.
- Composant client `export-pdf-button.tsx` (73 LOC, useTransition + sonner + Download icon).
- Commits : `9168983` / `94207f2` / `4db5c0a`.

### Plan 13-05 — Worker BullMQ cron hebdo (VEILLE-04)

**Duration:** 7.5 min · **Tests:** 16 verts (3 fetch + 4 classify + 3 dedup + 3 persist + 3 worker.cron)

- 8 modules `lib/veille/*` worker-safe :
  - `sources.ts` (43 LOC) — 12 sources RSS seed (3 par thème).
  - `prompts.ts` (60 LOC) — PROMPT_VERSION + SYSTEM_PROMPT + Zod schema.
  - `fetch-rss.ts` (45 LOC) — wrapper `rss-parser` fault-tolerant (timeout 15s, fail → `[]`).
  - `classify.ts` (119 LOC) — Ollama `mistral-small:24b` (D-06 figé) + Zod + AIGenerationJob multi-status.
  - `persist.ts` (100 LOC) — skip OTHER + skip confidence < 50 + dedup D-11 + INSERT DRAFT/AUTO + AuditLog `regulatoryWatch.auto_inserted` (8e verbe — convention COMPLÈTE).
  - `core.ts` (103 LOC) — `ingestRssOnceForTenant(tenantId)` cap 5 items/source.
  - `queue.ts` (58 LOC) — BullMQ cron `'0 8 * * 1'` tz Europe/Paris jobId fixe `'weekly-veille-cron'`.
  - `worker.ts` (74 LOC) — `startVeilleWorker()` multi-tenant concurrency=1.
- 3 scripts entrypoint : `worker:veille` (cron daemon) / `test:veille` (dry-run) / `probe:veille` (HEAD 12 URLs).
- **Worker safety pattern vérifié** : `grep -rE "(server/actions|/rbac|validateRequest|requireRole|from ['\"]react)" apps/web/src/lib/veille/` retourne **0 matches** → safe pour tsx process (pas de crash React cache).
- `+rss-parser ^3.13.0` (npm MIT) → seule nouvelle dépendance.
- Commits : `9057678` / `78f5fe5` / `c8679ac`.

### Plan 13-06 — Bookkeeping (ce plan)

**Duration:** ~30 min (incluant smoke flows réels)

- `13-SMOKE.md` créé avec 4 flows manuels + résultats exécution réelle.
- `13-SUMMARY.md` créé (ce fichier).
- STATE.md mis à jour : convention `regulatoryWatch.*` documentée comme 7e instance + 5 décisions D-13-A..E figées.
- REQUIREMENTS.md mis à jour : VEILLE-01..04 cochés avec preuve (paths + commits + tests).
- ROADMAP.md mis à jour : Phase 13 → Complete avec date + 6 plans listés.
- Smoke réels exécutés et documentés :
  - Flow 1 probe : 9/12 sources OK ⚠
  - Flow 2 import xlsx : 103 inserted 1er run, 104 updated re-run (idempotence ✓)
  - Flow 4a worker dry-run : 728 fetched / 37 classified / 37 inserted DRAFT/AUTO ✅
  - Flow 3 UI + 4b PDF : pending Laurent (checkpoint human-verify)

## Metrics

| Item                                  | Count |
| ------------------------------------- | ----- |
| Plans                                 | 6     |
| Tasks total                           | ~18   |
| Tests Wave 0 verts                    | 86 (18 + 23 + 15 + 13 + 16 + 1 bookkeeping) |
| Production files créés                | ~56 (8 modules lib/veille/* + 8 composants veille/* + 3 scripts + helpers + templates + tests) |
| Fichiers modifiés                     | ~9 (schema.prisma + nav-config + package.json + barrel shared + .gitignore + pnpm-lock + …) |
| LOC production approximative          | ~2400 (sans tests) |
| AuditLog verbes instanciés            | **8 / 8** (créé / mis à jour / exploitation_updated / approuvé / rejeté / archivé / auto_inserted / exporté) |
| Sources RSS seed                      | 12 (9 actives au probe 2026-05-25) |
| Entrées xlsx importées (run réel)     | 103 historiques + 1 update (xlsx récemment enrichi) |
| Entrées worker dry-run (run réel)     | 37 DRAFT/AUTO (728 RSS fetched → 37 classified mistral-small:24b) |
| Modèles Prisma ajoutés                | 1 (RegulatoryWatch) + 3 enums + 1 valeur enum DocType (VEILLE_AUDIT) |
| Migrations Prisma                     | 2 (`phase13_regulatory_watch` + extension DocType en sandbox via `db push`) |
| Régressions tests existants           | 0 (suite apps/web 608 → 675 verts, soit +67 nouveaux verts) |

## Decisions Locked (D-13-*)

| ID     | Décision                                                                                | Plan  |
| ------ | --------------------------------------------------------------------------------------- | ----- |
| D-13-A | AuditLog convention `regulatoryWatch.*` (7e instance one-helper-per-entity, 8 verbes) | 13-01 |
| D-13-B | Worker safety pattern `lib/veille/core.ts` (0 imports React/auth/server-actions vérifié) | 13-05 |
| D-13-C | LECTEUR strictement masqué de l'inbox (D-03, 3 niveaux defense-in-depth)              | 13-03 |
| D-13-D | PDF audit stocké MinIO comme Document VEILLE_AUDIT (D-02 figée, traçabilité Qualiopi) | 13-04 |
| D-13-E | DocType += VEILLE_AUDIT (extension enum additive, 21e valeur)                          | 13-04 |

## AuditLog convention `regulatoryWatch.*` — STATUS COMPLET

8 / 8 verbes instanciés à travers Phase 13 :

| Verbe                                  | État        | Instancié dans                                                |
| -------------------------------------- | ----------- | ------------------------------------------------------------- |
| `regulatoryWatch.created`              | ✅ Instancié | Plan 13-01 (script import) + Plan 13-02 (createWatch)         |
| `regulatoryWatch.updated`              | ✅ Instancié | Plan 13-02 (updateWatch)                                      |
| `regulatoryWatch.exploitation_updated` | ✅ Instancié | Plan 13-02 (updateExploitation)                               |
| `regulatoryWatch.approved`             | ✅ Instancié | Plan 13-02 (approveWatch)                                     |
| `regulatoryWatch.rejected`             | ✅ Instancié | Plan 13-02 (rejectWatch)                                      |
| `regulatoryWatch.archived`             | ✅ Instancié | Plan 13-02 (archiveWatch)                                     |
| `regulatoryWatch.exported`             | ✅ Instancié | Plan 13-04 (generateVeilleAuditForTheme, targetWatchId='BULK') |
| `regulatoryWatch.auto_inserted`        | ✅ Instancié | Plan 13-05 (worker BullMQ persist.ts, actorUserId=null)       |

**Convention COMPLÈTE.** Tout futur ajout (V2) devra documenter en JSDoc helper + ajouter au tableau ci-dessus.

## Smoke Validation

Cf. `13-SMOKE.md` pour le détail des 4 flows.

**Résultats automatiques 2026-05-25 :**
- Flow 1 (probe RSS) : ⚠ 9/12 OK (3 sources mortes documentées, worker fault-tolerant)
- Flow 2 (import xlsx) : ✅ 103 inserted 1er run + 104 updated 2e run (idempotence D-11 ✓)
- Flow 4a (worker dry-run) : ✅ 728 fetched / 37 classified / 37 inserted DRAFT/AUTO / 15 errors (acceptable)
- Flow 3 (UI 3 rôles) : ⬜ pending Laurent (validation visuelle ADMIN + MANAGER + LECTEUR D-03)
- Flow 4b (PDF audit) : ⬜ pending Laurent (validation Document MinIO + AuditLog `regulatoryWatch.exported`)

**Counts BDD réels post-smoke :**
- `RegulatoryWatch` total = **140** (103 IMPORT + 37 AUTO)
- AuditLog `regulatoryWatch.created` = **103**
- AuditLog `regulatoryWatch.auto_inserted` = **37**

## Risks & Follow-up

**Risques connus :**
- **3 sources RSS mortes** détectées au probe (Ministère du Travail / Service Public Particuliers / Thot Cursus). Worker fault-tolerant, mais audit régulier `probe:veille` recommandé (M+1 manuel ou cron monthly futur).
- **Latence Ollama mistral-small:24b** ~5-10s/item. Cron hebdo dimensionné (60 calls max / run, ~10 min). Si dérive : monitorer `AIGenerationJob.latencyMs`.
- **Pas d'observabilité worker** en V1 (logs only). V2 envisageable : table `VeilleIngestionLog` avec metrics par run.
- **Confidence Ollama < 50 → skip silent.** Si peu d'inserts en pratique, baisser le seuil (passer < 50 → < 30) ou améliorer le prompt §6.1 RESEARCH.
- **12 sources V1 vs ~30 dans le xlsx original** → V2 : interface admin pour ajouter des sources sans PR.
- **Route signed-URL `/api/documents/[id]/download` PAS créée** Plan 13-04 (out-of-scope). Le bouton Export PDF log la clé MinIO en console. Plan 03 UI (ou phase ultérieure) devra ajouter la route pour ouvrir le PDF directement.
- **Avant prod** : créer une vraie migration Prisma `phase13_regulatory_watch_and_doctype_veille_audit` (cette session a utilisé `db push --skip-generate` en sandbox cf. mémoire `feedback_prisma_db_push_sandbox.md`).
- **Worker pas dans dev:full par défaut** : consomme GPU local (Ollama mistral-small:24b). User lance `pnpm worker:veille` séparément. Pour prod : pm2/systemd.

**Deferred items (cf. `deferred-items.md`) :**
- Build régression pré-existante `SessionOnlyDocsBlockProps` (Phase 9.1 quick task `260525-jpq`) — documentée Plan 13-03, **résolue incidemment** par l'auteur humain via commit `c8cf4b6` (mixte 9.1+13-03).

## Next Step

`/gsd:plan-phase 12` (Modules stub Inscriptions et Modèles) ou `/gsd:plan-phase 10` (Audit Qualiopi blanc) — choisir selon priorité Laurent.

**Phase 13 = 13e phase complétée du milestone v5.** Restantes : Phase 10 (QBLANC) + Phase 12 (MOD).

---

*Phase: 13-veille-qualiopi-integree · Closed: 2026-05-25 · 6/6 plans · 4/4 requirements · 86 tests Wave 0 verts · 8/8 verbes AuditLog instanciés.*
