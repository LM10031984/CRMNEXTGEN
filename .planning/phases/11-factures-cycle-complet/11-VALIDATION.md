---
phase: 11
slug: factures-cycle-complet
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-19
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 (source-regex pattern, pas Testing Library) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web test -- --run` |
| **Full suite command** | `pnpm test` (root, turbo run test) |
| **Estimated runtime** | ~60 seconds (197 tests Phase 8 baseline + ~30 nouveaux Phase 11) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web test -- --run <fichier-test-cible>`
- **After every plan wave:** Run `pnpm --filter web test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green (`pnpm test`)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Détaillé par le planner pendant `/gsd:plan-phase`. Cadre Nyquist : chaque tâche a soit `<automated>` test, soit dépendance Wave 0 explicite.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-W0-01 | 00 | 0 | FACT-01..04 | infra | n/a | ❌ W0 | ⬜ pending |
| 11-XX-XX | XX | N | FACT-XX | unit/integration | `pnpm --filter web test -- --run <file>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/src/lib/__tests__/numbering.credit-note.test.ts` — nouveau fichier stub avec tests `getNextCreditNoteNumber` (séquence AVO-, transactional, race condition)
- [ ] `apps/web/src/lib/__tests__/invoice-audit.test.ts` — stubs pour `logInvoiceEvent` (6 actions namespacées : `invoices.created`, `invoices.issued`, `invoices.payment_recorded`, `invoices.credit_note_created`, `invoices.reminder_sent`, `invoices.exported`)
- [ ] `apps/web/src/server/actions/__tests__/credit-note.test.ts` — stubs pour `createCreditNote` (partiel, total → CANCELLED, RBAC denied COMMERCIAL/FORMATEUR)
- [ ] `apps/web/src/server/actions/__tests__/send-reminder.test.ts` — stubs pour `sendInvoiceReminder` (manual trigger, idempotence 24h auto, dry-run sans SMTP_HOST, auto-stop si PAID, niveau 1/2 selon ancienneté)
- [ ] `apps/web/src/server/actions/__tests__/invoices-export.test.ts` — stubs pour `exportInvoicesXlsx` (12 colonnes, avoirs négatifs, période vide, RBAC denied)
- [ ] `apps/web/src/lib/invoice-reminders/__tests__/worker.test.ts` — stubs worker (filtre `issueDate ≥ REMINDER_START_DATE`, jobId idempotent, skip PAID, skip si lastReminderAt < 24h)
- [ ] `apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` — stubs templates niveau 1 (amical) + niveau 2 (ferme) avec variables interpolées
- [ ] `apps/web/src/server/actions/__tests__/invoices-list.test.ts` — stubs pour `getInvoicesListData` (4 KPI : CA mois, Impayés, DSO, À facturer)

*Migration Prisma (Wave 0) : `packages/db/prisma/migrations/<timestamp>_add_credit_notes_and_reminders/migration.sql` ajoutée + `prisma generate` exécuté avant tout test impliquant les nouveaux champs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF avoir rendu (header "AVOIR", montants négatifs, mention "Avoir sur facture {FAC-X}") | FACT-02 | Rendering Gotenberg/WeasyPrint nécessite stack docker up | `make up` → créer un avoir total via UI sur facture test → ouvrir le PDF, vérifier header + mention + montants |
| Worker boot + premier cron daily | FACT-03 | BullMQ repeatable nécessite Redis up | `make up` → `pnpm dev:full` → vérifier log worker `"daily-reminders-cron registered"` + factures de test issueDate ≥ J-30 reçoivent email niveau 1 (dry-run si SMTP_HOST vide) |
| Export xlsx téléchargé + lisible Excel/Calc | FACT-04 | Ouvrir fichier hors stack | UI → bouton "Exporter" → période "Ce mois" → ouvrir le fichier dans Excel/Numbers → vérifier 12 colonnes + avoirs négatifs |
| Cross-nav fiche apprenant / fiche session | FACT-01 | Rendering React server-side avec session active | `pnpm dev:full` → login → `/app/apprenants/[id]` → vérifier bloc "Factures" + click ligne → fiche facture |
| RBAC ADMIN-only export + ADMIN/MANAGER/COMPTABLE créer avoir | FACT-02, FACT-04 | Tester avec sessions Lucia réelles différents rôles | Seed 4 users (1 par rôle) → tester chaque action UI + vérifier 403 sur server action via curl |
| Style visuel QualiOF respecté (PrioCard, FilterChips, pastilles statuts) | FACT-01 | Vérification design subjective | Comparer captures Phase 6 dashboard et Phase 9.1 matrice → vérifier cohérence visuelle |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (8 fichiers tests stubs + migration Prisma)
- [ ] No watch-mode flags (`--run` flag obligatoire, pas `vitest watch`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (après plan-checker pass)

**Approval:** pending
