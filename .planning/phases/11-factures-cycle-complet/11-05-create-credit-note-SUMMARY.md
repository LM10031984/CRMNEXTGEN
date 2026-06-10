---
phase: 11-factures-cycle-complet
plan: 05
subsystem: invoices
tags: [factures, invoices, credit-note, avoir, ncn, audit-log, rbac, radix-dialog, rhf, zod, pdf-template]

requires:
  - phase: 11-00
    provides: Migration Prisma Invoice.originalInvoiceId + status CREDIT_NOTE + stubs tests
  - phase: 11-01
    provides: getNextCreditNoteNumber(tenantId, tx?) - séquence AVO-NNNNNN dédiée
  - phase: 11-02
    provides: logInvoiceEvent(...) helper AuditLog entity=Invoice / action='invoices.credit_note_created'
  - phase: 11-04
    provides: CreateCreditNoteSchema (Zod) dans @qualiof/shared
  - phase: 08
    provides: requireRole + UnauthorizedError + ForbiddenError + RBAC ADMIN/MANAGER/COMPTABLE
  - phase: 09
    provides: Pattern Radix Dialog (ReassignLeadButton, D-Phase9-J via @radix-ui/react-dialog)
provides:
  - Server action createCreditNote(originalInvoiceId, amountHtToCredit, motif) → { ok, creditNoteId, number }
  - Client Component CreateCreditNoteDialog (Radix Dialog + RHF + zodResolver)
  - Extension invoice-template.ts mode AVOIR (header + bandeau "Avoir sur facture {N}")
  - CTA "Créer un avoir" sur fiche facture + section "Avoirs liés" + bandeau retour
affects: [11-07, 11-08]

tech-stack:
  added: []
  patterns:
    - "Server action createCreditNote ajoutée en append-only à invoices.ts (3 actions existantes intactes — anti-régression Phase 7-02)"
    - "Stockage signed des montants : amountHT et amountTTC NÉGATIFS côté BDD pour KPI 'À encaisser' propre (filtre status excludes CREDIT_NOTE naturellement)"
    - "Transaction Prisma atomique : getNextCreditNoteNumber(tx) + invoice.create(status=CREDIT_NOTE) + invoice.update(originale → CANCELLED si total) en 1 seule tx"
    - "AuditLog appelé hors transaction (audit est complémentaire, ne doit pas bloquer le rollback business)"
    - "N avoirs cumulés autorisés : refus si sum(existing AVO en abs) + new > original.amountHT (UI affiche reste créditable)"
    - "Template PDF étendu mode AVOIR rétro-compat 100% : sans documentKind → 'FACTURE' par défaut"
    - "CreateCreditNoteDialog suit pattern D-Phase9-J (Phase 9-03 ReassignLeadButton) : @radix-ui/react-dialog + RHF + zodResolver + useTransition + sonner + router.refresh()"
    - "Source-regex tests (D-Phase9-N) appliqués au Dialog Client Component (7 tests : use client, radix, schemas, a11y, pending, RHF)"

key-files:
  created:
    - apps/web/src/lib/__tests__/invoice-template.credit-note.test.ts
    - apps/web/src/components/invoices/create-credit-note-dialog.tsx
    - apps/web/src/components/invoices/__tests__/create-credit-note-dialog.test.ts
  modified:
    - apps/web/src/lib/invoice-template.ts (extension InvoiceData : documentKind + originalNumber + originalIssueDate ; header dynamique + bandeau AVOIR)
    - apps/web/src/server/actions/invoices.ts (ajout createCreditNote + imports getNextCreditNoteNumber, logInvoiceEvent, CreateCreditNoteSchema)
    - apps/web/src/server/actions/__tests__/credit-note.test.ts (remplacement stub Wave 0 par 17 tests réels)
    - apps/web/src/app/app/factures/[id]/page.tsx (include creditNotes + originalInvoice, CTA dialog, section Avoirs liés, bandeau retour AVOIR → originale)

key-decisions:
  - "Avoir = Invoice + status=CREDIT_NOTE + originalInvoiceId self-FK (D-01 figé Plan 11-00) — pas de table CreditNote séparée pour réutiliser la pipeline existante (PDF, numérotation, audit)"
  - "Montants négatifs côté BDD (D-Research Finding 6) : simplifie sum() comptable et permet d'exclure naturellement les CREDIT_NOTE du KPI 'À encaisser'. Display UI utilise Math.abs() avec préfixe '−' ou label 'Avoir'"
  - "N avoirs partiels cumulés autorisés (RESEARCH Open Question 1) : pattern comptable courant (geste commercial + erreur ultérieure). Refus si sum dépasserait original.amountHT — message UX explicite avec reste créditable"
  - "AuditLog hors transaction Prisma : l'écriture AuditLog ne doit pas bloquer le rollback business si elle échoue (audit complémentaire). Si AuditLog échoue après commit avoir, l'avoir existe mais log absent — acceptable (logs Prisma fallback)"
  - "PDF avoir non régénéré dans cette server action (déféré) : la création du record Invoice (status=CREDIT_NOTE) suffit à la comptabilité, à la cross-nav fiche détail et à l'export comptable Plan 11-07. UI affichera 'PDF à régénérer' tant que pdfUrl est null — cohérent pattern Phase 7-02"
  - "@radix-ui/react-dialog (PAS react-alert-dialog) : suit décision Phase 9-03 D-Phase9-J (react-alert-dialog n'est pas installé, on évite d'ajouter une dépendance)"

patterns-established:
  - "Template HTML PDF supporte documentKind 'FACTURE'|'AVOIR' avec rétro-compat par défaut — réutilisable pour futurs types (devis, facture pro-forma) sans casser l'API"
  - "Server action multi-tenant + RBAC + Zod + transaction + AuditLog + revalidatePath cross-nav : 5ème instance du pattern (Phase 7-02 invoices, 8 users, 9 leads, 9.1 documents, 11-04 invoice-settings, 11-05 credit-note)"
  - "Dialog Radix avec RHF + zodResolver pour saisie d'avoir : pattern réutilisable pour futures actions financières (geste commercial, refacturation) avec montant pré-rempli + textarea motif"

requirements-completed:
  - FACT-02

deferred-issues:
  - "Génération PDF du record avoir (mode AVOIR du template) déférée au Plan 11-07 ou 11-08 — non bloquant car le record Invoice suffit à la comptabilité et à la cross-nav. UI fiche avoir affichera 'PDF à régénérer' tant que pdfUrl est null."
  - "Tests UI interactifs du Dialog (clic submit + soumission RHF) déférés au test E2E manuel 11-VALIDATION.md — l'approche source-regex (7 tests) couvre la structure imposée par le plan ; le rendu visuel nécessite stack docker up (Gotenberg + Postgres + Redis)"

duration: 80min
completed: 2026-05-19
---

# Phase 11 Plan 05: create-credit-note Summary

Cycle complet "créer un avoir" livré end-to-end (server action + Dialog + intégration fiche + template PDF mode AVOIR). FACT-02 couvert : conformité CGI art. 289 (NCN avec séquence AVO dédiée), avoir partiel + total, N cumulés autorisés, AuditLog `invoices.credit_note_created`, RBAC ADMIN/MANAGER/COMPTABLE.

## Tasks

### Task 1 — Extension `invoice-template.ts` mode AVOIR

**TDD RED → GREEN** : 5 tests vitest verts (rétro-compat FACTURE + AVOIR header + bandeau "Avoir sur facture FAC-XXX" + date fr-FR `15/05/2026`).

- `InvoiceData` étend `documentKind?: 'FACTURE' | 'AVOIR'` + `originalNumber?` + `originalIssueDate?`
- Header `<h1>${headerTitle}</h1>` dynamique
- Bandeau jaune (`background:#FEF3C7`) en mode AVOIR uniquement
- Title HTML dynamique ("Facture" vs "Avoir")
- **Rétro-compat 100%** : default `'FACTURE'` (3 actions existantes invoices.ts inchangées)

**Commit** : `d212e26` — `feat(11-05): invoice-template AVOIR mode (D-04)`

### Task 2 — Server action `createCreditNote`

**TDD RED → GREEN** : 17 tests vitest verts (15 prévus + 2 bonus défensifs).

Signature :
```typescript
createCreditNote({
  originalInvoiceId: string;
  amountHtToCredit: number;
  motif: string;
}): Promise<{ ok: true; creditNoteId: string; number: string } | { ok: false; error: string }>
```

Garde-fous (par ordre de check) :
1. RBAC `requireRole(['ADMIN', 'MANAGER', 'COMPTABLE'])` — D-19
2. `CreateCreditNoteSchema.safeParse` — motif ≥3 chars, montant > 0
3. Lookup `prisma.invoice.findFirst({ id, tenantId })` (scope multi-tenant)
4. Statut origine ∈ {ISSUED, PAID, PARTIAL, OVERDUE} — D-03 refus DRAFT/CANCELLED/CREDIT_NOTE
5. `amountHtToCredit ≤ original.amountHT`
6. Sum avoirs existants + new ≤ original.amountHT (N cumulés OK)

Création :
- `prisma.$transaction` : `getNextCreditNoteNumber(tx)` + `tx.invoice.create({status:'CREDIT_NOTE', originalInvoiceId, amountHT=−abs(x), amountTTC=−abs(x*(1+TVA)), notes=motif})` + `tx.invoice.update(originale → CANCELLED)` SI total
- `logInvoiceEvent({action:'invoices.credit_note_created', diff:{originalInvoiceId, originalNumber, amountHtCredited, motif, originalStatusBefore, originalStatusAfter}})` hors tx
- `revalidatePath` × 3 : `/app/factures`, `/app/factures/{originalId}`, `/app/factures/{avoirId}`

**Commit** : `63f07a4` — `feat(11-05): createCreditNote server action (FACT-02, D-01..D-04, D-18, D-19)`

### Task 3 — `CreateCreditNoteDialog` + intégration fiche facture

**7 source-regex tests verts** + intégration UI.

Composant `apps/web/src/components/invoices/create-credit-note-dialog.tsx` :
- `'use client'` + `@radix-ui/react-dialog` (PAS react-alert-dialog — D-Phase9-J)
- `useForm` + `zodResolver(CreateCreditNoteSchema)` + `useTransition`
- Champs : hidden `originalInvoiceId`, number `amountHtToCredit` (pré-rempli au max + min=0.01 + max=originalAmountHt), textarea `motif`
- Submit → `createCreditNote(data)` → toast success/error + `router.refresh()`
- Trigger : bouton ambre avec icône `FileMinus` + label "Créer un avoir"

Intégration `apps/web/src/app/app/factures/[id]/page.tsx` :
- Prisma include étendu : `creditNotes` + `originalInvoice`
- CTA `<CreateCreditNoteDialog>` à côté du bouton paiement, visible si `isCreditNoteEligible`
- Section "Avoirs liés" (amber stripe) listant les avoirs avec date + motif + montant abs
- Bandeau "← Voir la facture originale {N}" en tête si la fiche EST un avoir

**Commit** : `4399c87` — `feat(11-05): CreateCreditNoteDialog + intégration fiche facture (D-04, D-07)`

## Verification

| Verification | Result |
|---|---|
| `pnpm --filter @qualiof/web test -- --run src/lib/__tests__/invoice-template.credit-note.test.ts` | ✅ 5/5 |
| `pnpm --filter @qualiof/web test -- --run src/server/actions/__tests__/credit-note.test.ts` | ✅ 17/17 |
| `pnpm --filter @qualiof/web test -- --run src/components/invoices/__tests__/create-credit-note-dialog.test.ts` | ✅ 7/7 |
| `pnpm --filter @qualiof/web test` (suite complète) | ✅ 486/486 (4 skipped = stubs 11-06/11-07/11-08) |
| `npx tsc --noEmit` (apps/web) | ✅ Exit 0 |
| Anti-régression Phase 7-02 (createInvoiceFromParticipant, recordInvoicePayment, createInvoiceForSponsorGroup) | ✅ Inchangées (append-only) |

## Deviations from Plan

**Aucune déviation** — plan exécuté conforme à la spec :
- Pas d'auto-fix Rule 1/2/3 nécessaire (codebase + helpers Wave 1 propres)
- Pas de checkpoint Rule 4 (aucune décision architecturale émergée)
- 0 auth gate
- Génération PDF avoir déférée volontairement (décision documentée, cf. key-decisions + deferred-issues) — non bloquant pour FACT-02

## Decisions Made

Voir `key-decisions` frontmatter. Synthèse :
1. **Stockage négatif** : simplifie comptabilité + KPI (RESEARCH Finding 6)
2. **N avoirs cumulés** : courant en pratique (RESEARCH Open Question 1)
3. **AuditLog hors tx** : audit complémentaire, ne bloque pas rollback business
4. **PDF avoir déféré** : record Invoice suffit pour P1 cycle complet, PDF en P2 (Plan 11-07/11-08)
5. **Radix Dialog (pas AlertDialog)** : suit décision Phase 9-03 D-Phase9-J

## Self-Check

- [x] `apps/web/src/lib/invoice-template.ts` (modifié) — vérifié grep `documentKind` + `originalNumber` + bandeau "Avoir sur facture"
- [x] `apps/web/src/lib/__tests__/invoice-template.credit-note.test.ts` (créé) — 5 tests verts
- [x] `apps/web/src/server/actions/invoices.ts` (modifié) — `export async function createCreditNote` présent
- [x] `apps/web/src/server/actions/__tests__/credit-note.test.ts` (réécrit) — 17 tests verts
- [x] `apps/web/src/components/invoices/create-credit-note-dialog.tsx` (créé) — Radix Dialog + RHF
- [x] `apps/web/src/components/invoices/__tests__/create-credit-note-dialog.test.ts` (créé) — 7 source-regex tests
- [x] `apps/web/src/app/app/factures/[id]/page.tsx` (modifié) — CTA + creditNotes section + originalInvoice bandeau
- [x] Commits `d212e26`, `63f07a4`, `4399c87` présents dans `git log`

## Self-Check: PASSED
