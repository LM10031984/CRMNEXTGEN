# Phase 7 — Smoke Final Report

**Date :** 2026-05-15
**Plan exécuteur :** 07-05 (bookkeeping fin de phase)

---

## tsc --noEmit (apps/web)

**Status :** PASS — exit 0 (après 4 auto-fixes décrits ci-dessous)

Première passe : 11 erreurs TypeScript découvertes dans le code livré par les Plans 07-02/07-03 (le sandbox d'exécution de ces plans ne pouvait pas lancer `tsc`). Toutes corrigées par cet agent.

### Auto-fixes appliqués

1. **`apps/web/src/server/actions/tenant-settings.ts:112`** — `diff: opts.diff` mismatch `Prisma.InputJsonValue`.
   Fix : cast `as never` (cohérent avec le cast `address as never` déjà présent L179).
   Rule 1 — bug typing.

2. **`apps/web/src/server/actions/__tests__/tenant-settings.test.ts:184/191`** — l'objet `address` du Test 5 omettait `country` requis par `addressSchema`.
   Fix : ajout `country: 'France'` dans `afterAddr`.
   Rule 1 — bug test data.

3. **`apps/web/src/server/actions/__tests__/tenant-settings.test.ts` + `tenant-assets.test.ts`** — ~13 erreurs `TS2532: Object is possibly 'undefined'` sur `.mock.calls[0][0]` à cause de `noUncheckedIndexedAccess`.
   Fix : remplacement `.mock.calls[0][0]` → `.mock.calls[0]![0]` (non-null assertion sur le premier appel — garanti par les `expect(...).toHaveBeenCalledTimes(1)` qui précèdent).
   Rule 1 — TS strict null checks compatibility.

4. **`apps/web/src/lib/numbering.ts:28`** — `import type { Prisma } from '@prisma/client'` non résolu (le projet n'expose pas `@prisma/client` directement, le re-export passe par `@qualiof/db`).
   Fix : `import { type Prisma, prisma } from '@qualiof/db'` (consume re-export, CLAUDE.md `prisma` singleton).
   Rule 1 — bug import path.

5. **`apps/web/src/server/actions/__tests__/tenant-assets.test.ts:99`** — `new File([buffer], ...)` rejette `Buffer<ArrayBufferLike>` (TS 5.7 stricter sur SharedArrayBuffer).
   Fix : wrap `new Uint8Array(buffer)`.
   Rule 1 — bug TS 5.7 compatibility.

6. **`apps/web/src/server/actions/__tests__/tenant-assets.test.ts:139`** — `writeCall = mock.calls[0]` possibly undefined.
   Fix : non-null assertion `mock.calls[0]!`.

**Verdict tsc :** clean après fixes.

---

## pnpm --filter @qualiof/web build

**Status :** BLOCKED (sandbox)

Le sandbox bash de cette session refuse `pnpm build` (denied). `tsc --noEmit` passe clean (preuve forte que le build Next compilera), mais la passe `next build` réelle (avec route discovery, RSC verification, page generation) n'a pas pu être exécutée.

**Action Laurent — à lancer manuellement :**

```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
rm -rf apps/web/.next
pnpm --filter @qualiof/web build 2>&1 | tail -30
```

**Critère de succès :** exit code 0. Si non-zero, copier les 20 dernières lignes d'erreur et ouvrir un follow-up plan.

---

## pnpm --filter @qualiof/web test --run

**Status :** BLOCKED (sandbox)

Vitest denied. Les tests livrés par Plans 07-01/02/03/04 doivent être validés par Laurent :

```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
pnpm --filter @qualiof/web test --run 2>&1 | tail -30
```

**Compte attendu (cumulé Phase 7) :**

| Suite Vitest | Plan source | Tests attendus |
| ------------ | ----------- | -------------- |
| `apps/web/src/lib/__tests__/of-config.test.ts` | 07-01 | 15 |
| `apps/web/src/lib/__tests__/numbering.test.ts` | 07-02 | 6 |
| `apps/web/src/server/actions/__tests__/tenant-settings.test.ts` | 07-02 | 15 |
| `apps/web/src/lib/closure/__tests__/shared-template.test.ts` | 07-03 | 10 |
| `apps/web/src/server/actions/__tests__/tenant-assets.test.ts` | 07-03 | 14 |
| `apps/web/src/lib/__tests__/iban-format.test.ts` | 07-04 | 6 |
| `apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts` | 07-04 | 4 |
| **TOTAL** | | **70** |

Plus les tests existants Phase 1-6 (à vérifier via `pnpm test 2>&1 | grep "Test Files\\|Tests"`).

---

## pnpm --filter @qualiof/shared test --run

**Status :** BLOCKED (sandbox)

Vitest denied.

**Action Laurent :**

```bash
pnpm --filter @qualiof/shared test --run 2>&1 | tail -10
```

**Tests attendus côté shared (cumulé Phase 7) :** ~12 nouveaux tests Zod tenant (Plan 07-02) + tests existants palier 4 (SIRET, address, etc.).

---

## Regression grep checks

### Drift `process.env.OF_*` hors of-config

```bash
grep -rn "process.env.OF_" apps/web/src/ --include="*.ts" | grep -v "of-config"
```

**Status :** PASS — 0 hit (confirmé par cet agent).

### Numérotation factures locale

```bash
grep -c "function nextInvoiceNumber" apps/web/src/server/actions/invoices.ts
```

**Status :** PASS — 0 (helper extrait vers `lib/numbering.ts`).

### LogoCache local

```bash
grep -c "logoCache" apps/web/src/lib/programme-template.ts apps/web/src/lib/convention-template.ts
```

**Status :** PASS — 0 chacun (cascade via `loadLogoColorDataUrl(tenantId)`).

---

## Verdict final

- **tsc clean :** OUI (après 6 auto-fixes appliqués en Wave 4)
- **Build Next :** À VALIDER MANUELLEMENT (sandbox bloque)
- **Vitest 70 tests Phase 7 :** À VALIDER MANUELLEMENT (sandbox bloque)
- **Drifts éliminés :** OUI (3 grep regression PASS)

**Recommandation :** Laurent lance les 3 commandes documentées ci-dessus. Si l'une retourne exit ≠ 0, créer un follow-up `/gsd:debug` plan avant de démarrer Phase 8.

**Files modifiés par cet agent (en plus des fichiers livrés par 07-01/02/03/04) :**

- `apps/web/src/server/actions/tenant-settings.ts` (cast `diff as never` L112)
- `apps/web/src/server/actions/__tests__/tenant-settings.test.ts` (country + non-null assertions)
- `apps/web/src/server/actions/__tests__/tenant-assets.test.ts` (Uint8Array + non-null assertions)
- `apps/web/src/lib/numbering.ts` (import via `@qualiof/db`)

Tous ces fixes sont en scope du plan 07-05 (Task 1 smoke gate révèle des défauts qui auraient bloqué la prochaine phase — Rule 1 deviation).
