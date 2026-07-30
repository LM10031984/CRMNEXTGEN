---
phase: 22
slug: bascule-prod-conformit-rgpd
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-06
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (apps/web 1176 tests, packages/shared 113) + Playwright 1.61.1 (e2e/, non requis pour les flips env) |
| **Config file** | `apps/web/vitest.config.*`, `playwright.config.ts` |
| **Quick run command** | `pnpm --filter @qualiof/web test -- <fichier>` |
| **Full suite command** | `pnpm test` (turbo, 3 tâches) |
| **Estimated runtime** | ~60–120 s (suite web complète) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @qualiof/web test -- <fichier touché>` + `tsc --noEmit` (tasks code : 22-02 uniquement — le reste = docs/scripts/ops)
- **After every plan wave:** Run `pnpm test` complet si du code app a changé ; sinon vérifs `<automated>` des plans
- **Before `/gsd:verify-work`:** Full suite verte + pack témoin SES-0094 vert + runbook §9 rempli
- **Max feedback latency:** ~120 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | CUT-01 | grep gate | grep sections §0–§7 runbook | ✅ | ⬜ pending |
| 22-01-02 | 01 | 1 | CUT-01 | grep gate | grep §8/§9 + rollback staging | ✅ | ⬜ pending |
| 22-02-01 | 02 | 1 | CUT-01 (D-07) | unit RED | `pnpm vitest run src/lib/calendar/__tests__/google-client.test.ts` (doit échouer) | ❌ W0 (créé par la task) | ⬜ pending |
| 22-02-02 | 02 | 1 | CUT-01 (D-07) | unit GREEN | idem (4/4 verts) + `tsc --noEmit` | ❌ W0 | ⬜ pending |
| 22-02-03 | 02 | 1 | RGPD-01 (D-17) | grep gate + suite | greps négatifs PII + `pnpm --filter @qualiof/web test` | ✅ | ⬜ pending |
| 22-03-01 | 03 | 1 | CUT-01 (D-01) | script exit code | `pnpm tsx apps/web/scripts/audit-data-gap.ts` exit 0 | ❌ W0 (livrable) | ⬜ pending |
| 22-03-02 | 03 | 1 | CUT-01 (D-02) | script existant | `migrate-storage.ts` DRY + audit écart 21-02 | ✅ | ⬜ pending |
| 22-04-01 | 04 | 1 | CUT-01 (D-18②) | script | `sanity-check-env.ts` sur env pull + .env | ❌ W0 (livrable) | ⬜ pending |
| 22-04-02 | 04 | 1 | CUT-01/CUT-02 (D-06) | script lecture seule | `pending-reminders-report.ts` + rapport | ❌ W0 (livrable) | ⬜ pending |
| 22-05-01..03 | 05 | 1 | RGPD-01 | fichiers + PDF | `ls docs/rgpd/` + `%PDF-` sur l'export | ❌ W0 (livrable docs) | ⬜ pending |
| 22-05-04 | 05 | 1 | RGPD-01 (D-13) | checkpoint | validation Laurent (gate bloquant Wave 2) | — | ⬜ pending |
| 22-06-02 | 06 | 2 | CUT-01 | runtime | `curl /login` → 200, 0 « STAGING » | ✅ (curl) | ⬜ pending |
| 22-06-03 | 06 | 2 | CUT-02 (D-10) | protocole témoin | Prisma `usedStub=false` + curl signed URLs + filigrane | ✅ protocole 20/21 | ⬜ pending |
| 22-07-01..04 | 07 | 3 | CUT-01/02 (D-06) | script + checkpoint + runtime | rapport rafraîchi → décision → flip ×2 → messageId réel | ✅ | ⬜ pending |
| 22-08-01..02 | 08 | 3 | CUT-02 (D-11/D-12) | manual-only | captures dashboards (voir section dédiée) | — | ⬜ pending |
| 22-09-01..02 | 09 | 4 | CUT-01 (D-09) | Prisma + checkpoint | Users créés avec rôles + AuthSession tierce | ✅ | ⬜ pending |
| 22-10-01..03 | 10 | 5 | CUT-01 (D-05) | archives + docker | checksums + pg_restore --list + docker ps post-purge | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/src/lib/calendar/__tests__/google-client.test.ts` — RED→GREEN intégré au plan 22-02 (Tasks 1–2), pattern mock env/fs de cron-workers.test.ts
- [ ] `apps/web/scripts/audit-data-gap.ts` — livrable-outil de CUT-01 (exit code = verdict), plan 22-03 Task 1
- [ ] `apps/web/scripts/sanity-check-env.ts` + `apps/web/scripts/pending-reminders-report.ts` — livrables-outils, plan 22-04
- Framework : rien à installer.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alertes coûts 4 plateformes actives | CUT-02 (D-11) | État de configuration SaaS billing (écrans Owner-only, pas d'API fiable) | Plan 22-08 Task 1 : captures datées Vercel/Railway/Supabase/OpenRouter, garde-fous Pitfall 5 vérifiés |
| Backups Supabase daily + région EU | CUT-02 (D-12) | La doc officielle ne précise pas la région — la capture dashboard EST la preuve | Capture Database → Backups (snapshots daily, projet eu-west-1) |
| Gate go/no-go pack témoin (jugement métier Qualiopi) | CUT-02 (D-10) | Conformité documentaire = jugement de Laurent (les compteurs 0 stub/0 404 sont automatisés en amont) | Plan 22-06 Task 4 : lecture 22-GONOGO-SES-0094.md + 2 docs ouverts |
| Validation registre RGPD | RGPD-01 (D-13/D-16) | Responsabilité juridique du responsable de traitement | Plan 22-05 Task 4 : relecture + question compte Google |
| Réception email réel test | CUT-02 (D-06) | Boîte mail de Laurent | Plan 22-07 Task 4 : confirmer réception du mail messageId |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoints = manual-only justifiés)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (tests/scripts créés par les plans qui les consomment, Wave 1)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (auto-approved at plan time; re-check at execute)
