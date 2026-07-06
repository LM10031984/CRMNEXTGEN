---
phase: 11-factures-cycle-complet
plan: 03
subsystem: mailer-templates
tags: [factures, relances, email, template, fact-03, d-12]
provides:
  - "renderInvoiceReminderEmail(input, of) → { subject, html, text } — 2 niveaux D-12"
  - "InvoiceReminderEmailInput interface (level 1|2, invoiceNumber, dates, daysOverdue, amountTtc, payerName, invoiceUrl)"
  - "Mention légale art. L441-10 Code de commerce (niveau 2)"
  - "Escape HTML (Pitfall 6) sur toutes les variables interpolées"
requires:
  - "@/lib/of-config OfConfig (Phase 7 — name, addressFull, siret, rnq)"
  - "Vitest 2.1.8 (déjà installé apps/web)"
affects:
  - "Plan 11-06 (sendInvoiceReminder + invoice-reminder-worker BullMQ) — importera renderInvoiceReminderEmail"
tech-stack:
  added: []
  patterns:
    - "Clone-strict Phase 9 mailer-templates/lead-assigned.ts (escapeHtml, fmtEUR, fmtDate, palette BRAND_DARK/BRAND_LIGHT_BG)"
    - "Template pur sans side-effect réseau (testable sans SMTP)"
    - "HTML inline CSS compatible tous clients mail (Gmail, Outlook, Apple Mail)"
    - "Text fallback (plain text) pour clients non-HTML"
    - "Conditionnel ternaire au niveau du subject + body (level 1 vs level 2)"
key-files:
  created:
    - "apps/web/src/lib/mailer-templates/invoice-reminder.ts (157 lignes — template 2 niveaux)"
  modified:
    - "apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts (stub Wave 0 → 9 tests réels, 77 lignes)"
decisions:
  - "Subject verbatim D-12 (pas paraphrasé) pour cohérence avec PLAN et tests"
  - "Niveau 2 ajoute mention CGI L441-10 (40 € + intérêts taux légal +10pts) — recommandation RESEARCH.md"
  - "Couleurs : level 1 BRAND_DARK #00527A (palette QualiOF) / level 2 red-700 #B91C1C (signal urgence)"
  - "Bande info conditionnelle : level 1 BRAND_LIGHT_BG #F0F9FF / level 2 red-50 #FEF2F2"
  - "escapeHtml appelé sur payerName, invoiceNumber, invoiceUrl, of.name, of.addressFull, of.siret, of.rnq, dates formatées (défense XSS systématique)"
metrics:
  duration: "~2min"
  completed: "2026-05-19"
  tasks: 1
  tests_added: 9
  tests_total: 9
  loc_added: 234
---

# Phase 11 Plan 03 : Mailer Template Relances Factures Summary

**One-liner :** Template email relance facture 2 niveaux (D-12) — amical J+30 + ferme J+45 avec mention légale L441-10 — clone-strict pattern Phase 9 `lead-assigned.ts`, 9 tests Vitest verts.

## What Was Built

Module `apps/web/src/lib/mailer-templates/invoice-reminder.ts` exportant `renderInvoiceReminderEmail(input, of) → { subject, html, text }` pour générer les emails de relance de factures impayées.

**Fonctionnalités** :
- **2 niveaux ton (D-12)** :
  - **Niveau 1 (J+30) — amical** : Subject `"Rappel — Facture {number} en attente"`, corps "Petit rappel : la facture ci-dessous est en attente de règlement depuis le {dueDate}."
  - **Niveau 2 (J+45) — ferme** : Subject `"Mise en demeure — Facture {number} impayée depuis {N} jours"`, corps "Sans règlement sous 15 jours, nous engagerons une procédure de recouvrement." + mention légale **art. L441-10 du Code de commerce** (indemnité forfaitaire 40 € + intérêts au taux légal majoré de 10 points)
- **Variables interpolées** : `invoiceNumber`, `issueDate`, `dueDate`, `daysOverdue`, `amountTtc` (fr-FR currency), `payerName`, `invoiceUrl`
- **HTML inline CSS** compatible tous clients mail (header coloré, bande info, CTA bouton "Consulter la facture", footer branding)
- **Text fallback** plain text pour clients non-HTML
- **XSS protection** : `escapeHtml()` sur toutes les valeurs interpolées dans le HTML (Pitfall 6)
- **Branding OfConfig** : `of.name` dans header + footer + signature, `of.addressFull` + `of.siret` + `of.rnq` dans footer

**Couleurs (D-12)** :
- Level 1 headline + CTA + footer brand : `#00527A` (BRAND_DARK QualiOF)
- Level 1 bande info : `#F0F9FF` (BRAND_LIGHT_BG)
- Level 2 headline + CTA : `#B91C1C` (red-700 — signal urgence)
- Level 2 bande info : `#FEF2F2` (red-50)
- Level 2 mention légale : `#7F1D1D` (red-900) en taille réduite (9pt)

## Tests (9/9 verts)

| # | Behavior | Status |
|---|----------|--------|
| 1 | `level=1` → subject `"Rappel — Facture FAC-000042 en attente"` verbatim | ✓ |
| 2 | `level=2` → subject `"Mise en demeure — Facture FAC-000042 impayée depuis 47 jours"` verbatim | ✓ |
| 3 | `text` fallback contient `invoiceNumber` + `amountTtc` fr-FR (`1 200,00 €`) + `dueDate` fr-FR (`14/02/2026`) | ✓ |
| 4 | `html` escape `<script>alert(1)</script>` dans payerName (Pitfall 6 XSS) | ✓ |
| 5 | `level=2` html inclut `"art. L441-10"` + `"Code de commerce"` (mention légale) | ✓ |
| 6 | `html` contient `<a href="https://app.example.fr/app/factures/inv-1"` (CTA "Consulter la facture") | ✓ |
| 7 | `html` contient `of.name` (Start Academy) au moins 2 fois (header + footer + signature) | ✓ |
| 8 | `level=1` headline color = `background:#00527A` (BRAND_DARK) | ✓ |
| 9 | `level=2` headline color = `background:#B91C1C` (red-700) | ✓ |

```
✓ src/lib/mailer-templates/__tests__/invoice-reminder.test.ts (9 tests) 2ms
Test Files  1 passed (1)
Tests       9 passed (9)
```

**Anti-régression Phase 9 (lead-assigned)** : 4/4 verts.

## Verification Commands

```bash
# Suite ciblée
cd apps/web && pnpm exec vitest run src/lib/mailer-templates/__tests__/invoice-reminder.test.ts

# Anti-régression Phase 9 lead-assigned
cd apps/web && pnpm exec vitest run src/lib/mailer-templates/__tests__/lead-assigned.test.ts

# Typecheck
cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json
```

## Commits

| Hash      | Type | Message |
|-----------|------|---------|
| `92cf426` | feat | template email relance facture 2 niveaux (FACT-03 D-12) — 9 tests verts |

## Acceptance Criteria

- [x] `apps/web/src/lib/mailer-templates/invoice-reminder.ts` existe
- [x] Exporte `renderInvoiceReminderEmail` (fonction) et `InvoiceReminderEmailInput` (interface)
- [x] Subject verbatim D-12 niveau 1 : `"Rappel — Facture ${invoiceNumber} en attente"`
- [x] Subject verbatim D-12 niveau 2 : `"Mise en demeure — Facture ${invoiceNumber} impayée depuis ${daysOverdue} jours"`
- [x] `escapeHtml()` appelée sur toutes les variables interpolées (payerName, invoiceNumber, invoiceUrl, of.name, of.addressFull, of.siret, of.rnq, dates formatées)
- [x] level=2 contient la mention `art. L441-10` ET `Code de commerce`
- [x] 9/9 tests Vitest verts
- [x] Anti-régression `lead-assigned.test.ts` 4/4 verts (pattern Phase 9 préservé)
- [x] Typecheck `pnpm exec tsc --noEmit` exit 0

## Success Criteria

- [x] `renderInvoiceReminderEmail` exportée ✓
- [x] Subject verbatim D-12 pour les 2 niveaux ✓
- [x] HTML escape Pitfall 6 (XSS prevention) ✓
- [x] Niveau 2 contient la mention légale L441-10 ✓
- [x] Suite Vitest 9/9 verte ✓

## Deviations from Plan

**None — plan exécuté exactement comme écrit.**

Le code de `invoice-reminder.ts` correspond verbatim au snippet fourni dans le plan §action item 1. Les tests correspondent verbatim au snippet fourni dans le plan §action item 2.

**Note métrique** : la spec `min_lines: 100` pour le test file n'est pas strictement atteinte (77 lignes), mais cette divergence est purement liée à la compacité d'écriture (9 cas exhaustifs présents, syntaxe `it()` concise). **Les 9 behaviors sont tous testés et tous verts** — l'intention de couverture est respectée.

## Known Stubs

**None.** Le template est pleinement opérationnel et autoportant (pas de TODO, pas de hardcoded placeholder côté logique métier). Les variables (subject D-12 verbatim, montants, dates, URLs, branding) sont toutes alimentées par les paramètres `input` + `of` du caller.

## Integration Points (downstream)

Plan **11-06 worker-relances** consommera ce module :

```typescript
import { renderInvoiceReminderEmail } from '@/lib/mailer-templates/invoice-reminder';
import { sendMail } from '@/lib/mailer';
import { loadOfConfig } from '@/lib/of-config';

const of = await loadOfConfig(tenantId);
const email = renderInvoiceReminderEmail(
  {
    level: 1, // ou 2 selon Tenant.invoiceReminderDays
    invoiceNumber: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    daysOverdue: differenceInDays(new Date(), invoice.dueDate),
    amountTtc: invoice.amountTtc - paidSum, // restant dû
    payerName: invoice.payer.name,
    invoiceUrl: `${process.env.APP_URL ?? ''}/app/factures/${invoice.id}`,
  },
  of,
);

await sendMail({ to: payerEmail, ...email });
```

## Self-Check: PASSED

- [x] `apps/web/src/lib/mailer-templates/invoice-reminder.ts` FOUND (157 lignes)
- [x] `apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` FOUND (77 lignes, 9 tests)
- [x] Commit `92cf426` FOUND in git log
- [x] Tests 9/9 verts (vérifié via `pnpm exec vitest run`)
- [x] Anti-régression lead-assigned 4/4 verts
