---
phase: 07-param-tres-organisme-ditables
plan: 02
subsystem: server-actions
tags: [zod, server-actions, prisma, audit-log, numbering, multi-tenant]

# Dependency graph
requires:
  - phase: 07-param-tres-organisme-ditables
    plan: 01
    provides: "Tenant +10 colonnes (invoicePrefix, iban, bic, emailFrom, legalForm, legalMentions, ...), loadOfConfig async"
provides:
  - "packages/shared/src/schemas/tenant.ts : 4 schémas Zod (Identity/Address/Billing/Email) réutilisables client+server"
  - "apps/web/src/server/actions/tenant-settings.ts : 4 server actions discriminées + helpers computeDiff + logTenantSettingsChange"
  - "apps/web/src/lib/numbering.ts : getNextInvoiceNumber(tenantId, tx?) avec préfixe lu depuis Tenant.invoicePrefix (fallback 'FAC')"
  - "Convention AuditLog établie : entity='Tenant' / action='parameters.update' / diff per-champ"
  - "invoices.ts refactor : suppression de la fonction locale nextInvoiceNumber → consomme getNextInvoiceNumber"
affects: [07-03, 07-04, 07-05, 11-factures, 08-rbac]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action discriminée { ok:true } | { ok:false, error, fieldErrors? } (pattern projet déjà établi)"
    - "Mock Prisma via vi.mock('@qualiof/db', ...) + mock validateRequest via vi.mock('@/lib/auth', ...)"
    - "computeDiff shallow : objets Json comparés via JSON.stringify, null/undefined normalisés (no-op si rien ne change)"
    - "AuditLog convention : entity='Tenant', entityId=tenantId, action='parameters.update', diff = { field: { before, after } }"
    - "getNextInvoiceNumber(tenantId, tx?) — paramètre tx optionnel pour atomicité sous prisma.$transaction"

key-files:
  created:
    - "packages/shared/src/schemas/tenant.ts (4 schémas Zod + types + helpers normalizeIban/normalizeBic, 116 lignes)"
    - "packages/shared/src/schemas/__tests__/tenant.test.ts (12 tests Vitest)"
    - "apps/web/src/lib/numbering.ts (getNextInvoiceNumber, 50 lignes)"
    - "apps/web/src/lib/__tests__/numbering.test.ts (6 tests Vitest, prisma mocké)"
    - "apps/web/src/server/actions/tenant-settings.ts (4 server actions + 2 helpers, 260 lignes)"
    - "apps/web/src/server/actions/__tests__/tenant-settings.test.ts (15 tests Vitest, prisma + auth mockés)"
  modified:
    - "packages/shared/src/schemas/index.ts (ajout `export * from './tenant';`)"
    - "apps/web/src/server/actions/invoices.ts (suppression fonction locale nextInvoiceNumber, import getNextInvoiceNumber, 2 call sites swappés signature inversée)"

key-decisions:
  - "SIRET de test : 81423718600030 (Luhn valide) au lieu de 83209458800018 du plan (Luhn invalide, sum=53)"
  - "computeDiff helper pur exporté pour réutilisation Plan 07-03 (upload assets) avec actions distinctes 'parameters.upload.logo', 'parameters.upload.signature.pedago', etc."
  - "emailFrom '' (chaîne vide volontaire) → BDD stocke null pour permettre fallback ENV via of-config.pick()"
  - "address Zod parsed.data castée en `never` pour Prisma Json input (évite couplage Prisma.InputJsonValue)"
  - "AuditLog field name: `diff` (per schema.prisma L1010) — CONTEXT.md D-09 mentionne `changes` mais c'est une erreur de rédaction CONTEXT; le schema Prisma est l'autorité"
  - "Test 6 numbering : tenant ghost (findUnique=null) → fallback 'FAC' aussi (défense en profondeur, pas dans plan mais cas réaliste)"

requirements-completed: [SET-01, SET-02, SET-03]

# Metrics
duration: ~50min
completed: 2026-05-14
---

# Phase 7 Plan 02: Server Actions Paramètres + Zod + AuditLog Summary

**4 schémas Zod (identity/address/billing/email) + 4 server actions discriminées qui écrivent BDD + AuditLog avec diff per-champ, helper de numérotation factures extrait avec préfixe configurable depuis `Tenant.invoicePrefix`.**

## CHECKPOINT REACHED — Bash sandboxé, commits manuels requis

**Type:** human-action
**Plan:** 07-02
**Progress:** 0/3 tasks committed (3/3 tasks COMPLETE on disk)

L'agent a écrit les 7 fichiers du plan complet sur disque (Tasks 1+2+3), MAIS le sandbox de cette session refuse :
- `node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs commit ...` → denied
- `git -C "<path>" commit ...` → denied
- `git status` → denied
- `pnpm test` → denied

Tous les fichiers compilent visuellement (relus à plusieurs reprises). Laurent doit lancer les 3 commits + tests lui-même via son shell normal.

### Awaiting

Laurent, exécute dans l'ordre depuis `/Users/laurentmarx/Documents/CRM Next gen/files/` :

#### 1. Vérifier l'état du working tree

```bash
git status --short
```

Tu dois voir **ces 8 chemins** (en plus de tes éventuels fichiers en cours non liés au plan) :

```
M  apps/web/src/server/actions/invoices.ts
?? apps/web/src/lib/__tests__/numbering.test.ts
?? apps/web/src/lib/numbering.ts
?? apps/web/src/server/actions/__tests__/tenant-settings.test.ts
?? apps/web/src/server/actions/tenant-settings.ts
?? packages/shared/src/schemas/__tests__/tenant.test.ts
?? packages/shared/src/schemas/tenant.ts
M  packages/shared/src/schemas/index.ts
```

⚠️ Tu auras probablement aussi 10+ autres `M` non liés (apprenants/page.tsx, layout.tsx, etc.) — **ne pas inclure** dans les commits ci-dessous. Les `--files` explicites garantissent qu'on ne stage que ce qu'on veut.

#### 2. Lancer les 3 tests Vitest (vérification avant commit)

```bash
# Task 1 — schémas Zod tenant (12 tests attendus)
pnpm --filter @qualiof/shared test -- src/schemas/__tests__/tenant.test.ts --run

# Task 2 — getNextInvoiceNumber (6 tests attendus)
pnpm --filter @qualiof/web test -- src/lib/__tests__/numbering.test.ts --run

# Task 3 — server actions tenant-settings + AuditLog (15 tests attendus)
pnpm --filter @qualiof/web test -- src/server/actions/__tests__/tenant-settings.test.ts --run

# tsc clean (0 erreur)
pnpm --filter @qualiof/web exec tsc --noEmit
pnpm --filter @qualiof/shared exec tsc --noEmit
```

Si un test échoue → **ne pas commiter ce task-là** ; ping-moi le diagnostic. Les autres tasks restent commitables.

#### 3. Commiter les 3 tasks (gsd-tools wrapper, pattern Plan 07-01)

```bash
# Task 1 — schémas Zod tenant
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs commit \
  "feat(07-02): add Zod schemas tenant (identity/address/billing/email) + 12 tests" \
  --files \
    "packages/shared/src/schemas/tenant.ts" \
    "packages/shared/src/schemas/__tests__/tenant.test.ts" \
    "packages/shared/src/schemas/index.ts"

# Task 2 — numbering + refactor invoices.ts
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs commit \
  "feat(07-02): extract getNextInvoiceNumber + refactor invoices to use Tenant.invoicePrefix" \
  --files \
    "apps/web/src/lib/numbering.ts" \
    "apps/web/src/lib/__tests__/numbering.test.ts" \
    "apps/web/src/server/actions/invoices.ts"

# Task 3 — server actions tenant-settings + AuditLog
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs commit \
  "feat(07-02): add tenant-settings server actions + AuditLog parameters.update + 15 tests" \
  --files \
    "apps/web/src/server/actions/tenant-settings.ts" \
    "apps/web/src/server/actions/__tests__/tenant-settings.test.ts"
```

#### 4. Vérifier les 3 commits

```bash
git log --oneline -5
```

Tu dois voir 3 nouveaux commits `feat(07-02): ...` au-dessus de `1968c02` (le dernier commit de Plan 07-01).

---

## Performance (work agent-side, hors commit)

- **Duration:** ~50 min (Task 1 par agent précédent + Tasks 2-3 par agent actuel)
- **Tasks:** 3 (Zod schemas, numbering extract+refactor, server actions)
- **Files created:** 6
- **Files modified:** 2 (index.ts + invoices.ts)

## API Surface des 4 Server Actions

```ts
type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

// SET-01
export async function updateTenantIdentity(input: TenantIdentityInput): Promise<ActionResult>;
//   ↳ name, siret, numDA, rcs, legalForm

// SET-02 (texte, partie texte sans upload — Plan 07-03 ajoutera logo/signatures)
export async function updateTenantAddress(input: TenantAddressInput): Promise<ActionResult>;
//   ↳ address Json, legalMentions (max 2000)

// SET-03 (préférences facturation)
export async function updateTenantBilling(input: TenantBillingInput): Promise<ActionResult>;
//   ↳ invoicePrefix (2-5 MAJ), iban (FR), bic (8/11)

// SET-03 (email expéditeur)
export async function updateTenantEmail(input: TenantEmailInput): Promise<ActionResult>;
//   ↳ emailFrom (email ou '')
```

Toutes ces actions :
1. `validateRequest()` → `{ ok:false, error:'Non authentifié' }` si pas user
2. `safeParse(input)` → `{ ok:false, fieldErrors }` si Zod échoue (BDD intacte)
3. Lit `before` (snapshot), `prisma.tenant.update({ where:{ id: user.tenantId }, data })`, relit `after`
4. `logTenantSettingsChange({ action: 'parameters.update', diff: computeDiff(before, after) })` → AuditLog row si diff non vide, no-op sinon
5. `revalidatePath('/app/parametres')`
6. Returne `{ ok:true }`

## Convention AuditLog (D-09)

```ts
{
  tenantId: user.tenantId,
  userId: user.id,
  entity: 'Tenant',
  entityId: user.tenantId,
  action: 'parameters.update',
  diff: {
    siret: { before: null, after: '81423718600030' },
    iban:  { before: 'FR76OLD...', after: 'FR76NEW...' },
    // ... seulement les champs réellement modifiés
  }
}
```

**Pour Plan 07-03** : réutiliser `logTenantSettingsChange` avec `action: 'parameters.upload.logo'`, `'parameters.upload.signature.pedago'`, `'parameters.upload.signature.dirigeant'`.

**Pour Plan 08 RBAC** : la même convention `entity='Tenant'` + `action='parameters.*'` permettra un écran d'audit qui filtre toutes les modifications Paramètres d'un tenant en `WHERE entity='Tenant' AND action LIKE 'parameters.%'`.

## Helper réutilisable pour Plan 11 Factures

```ts
// apps/web/src/lib/numbering.ts
export async function getNextInvoiceNumber(
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<string>;
```

- Lit `Tenant.invoicePrefix` → fallback `'FAC'`
- Format `{prefix}-NNNNNN` (6 chiffres, conservé pour cohérence historique)
- Si appelé hors `$transaction`, fonctionne (utile pour preview/read-only). Pour création atomique de facture, **passer `tx`** d'un `prisma.$transaction(async (tx) => { ... })`.

## Decisions Made

### 1. SIRET de test changé : 81423718600030 (Luhn valide)

Le plan (`<behavior>` Test 1) référence `83209458800018` comme "SIRET Start Academy real". Vérification Luhn :
```
Sum digit-by-digit (doubling positions paires, indexation 0-based de la droite) = 53 → 53 mod 10 = 3, pas 0.
```
SIRET réel Start Academy = **inconnu** à l'agent ; pour ne pas bloquer le test, j'ai utilisé `81423718600030` qui est déjà documenté dans `packages/shared/src/helpers/__tests__/siret.test.ts` comme cas Luhn valide.

**Action recommandée Laurent** : si ton vrai SIRET est différent, mettre à jour Test 1 dans `packages/shared/src/schemas/__tests__/tenant.test.ts` avec le vrai numéro. Le test continuera de passer tant que le SIRET fourni est Luhn-valide.

→ **Rule 1 deviation (bug dans le plan)** : `83209458800018` ne passe pas Luhn, le test aurait échoué tel quel.

### 2. computeDiff comparaison shallow via JSON.stringify pour objets

Pour les champs Json (typiquement `address`), comparer `===` sur les références donne un faux-positif (chaque relecture Prisma crée un nouvel objet). `JSON.stringify` shallow est suffisant car `address` est plat ({ street, postalCode, city }). Si plus tard `address` devient nested, il faudra un deep-equal.

→ **Pas une deviation**, choix d'implémentation cohérent avec `<action>` du plan.

### 3. emailFrom : `'' || null` → `null` en BDD

Permet à `of-config.pick(t?.emailFrom, 'OF_EMAIL', email)` de repasser en fallback ENV quand Laurent vide le champ dans Paramètres. Sinon `''` serait stocké en BDD et `pick()` le considère "vide" (déjà géré par `(bdd ?? '').trim()` qui renvoie `''`).

→ **Pas une deviation**, c'est dans le plan explicitement L507 `emailFrom: parsed.data.emailFrom || null`.

### 4. AuditLog field = `diff` (et non `changes`)

`CONTEXT.md` D-09 parle de `changes:` mais le schema Prisma (L1010) utilise `diff: Json`. J'ai suivi le schema (autorité). Le plan principal `07-02-PLAN.md` utilise aussi `diff:` partout. Aucun ambigu côté code.

### 5. Tenant ghost (findUnique=null) → fallback 'FAC' dans getNextInvoiceNumber

Test 4bis ajouté hors plan : si pour une raison quelconque le tenant n'est plus en BDD au moment de la numérotation (corruption, mauvais tenantId), on dégrade en `'FAC'` plutôt que crasher avec un TypeError sur `tenant.invoicePrefix`. Cas rare mais coût zéro.

→ **Rule 2 - missing critical functionality** : défense en profondeur, no-op fonctionnel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] SIRET de test du plan ne passe pas Luhn**

- **Found during:** Task 1 (agent précédent, déjà documenté en commentaire dans le test)
- **Issue:** Plan Test 1 référence `'83209458800018'` comme SIRET valide. Vérification : sum Luhn = 53, mod 10 = 3 ≠ 0. Le test aurait planté.
- **Fix:** Utilisation de `'81423718600030'` (déjà connu Luhn-valide via siret.test.ts).
- **Files modified:** `packages/shared/src/schemas/__tests__/tenant.test.ts`
- **Commit:** À venir Task 1 commit

**2. [Rule 2 — Missing Critical] Test ghost-tenant fallback dans numbering**

- **Found during:** Task 2 (écriture des tests)
- **Issue:** Plan ne couvre pas le cas `tenant.findUnique` retourne `null` (tenant supprimé ou tenantId invalide). Sans guard, le code aurait crash. Le code source gère déjà (`tenant?.invoicePrefix ?? 'FAC'`), mais aucun test ne l'exerce.
- **Fix:** Ajout Test 4bis dans `numbering.test.ts` : `tenantFindUnique.mockResolvedValueOnce(null)` → résultat `FAC-000001`.
- **Files modified:** `apps/web/src/lib/__tests__/numbering.test.ts`
- **Commit:** À venir Task 2 commit

**3. [Rule 3 — Blocking] Bash sandboxé empêche commits + tests auto**

- **Found during:** Tentative de commit Task 1 + tentative de `node gsd-tools.cjs init`
- **Issue:** Tous les `git`, `node /Users/laurentmarx/.claude/get-shit-done/bin/gsd-tools.cjs ...`, et `pnpm` sont denied par le sandbox de cette session. L'agent ne peut donc ni commiter ni exécuter les tests.
- **Fix:** Écrire les 3 tasks code/tests intégralement sur disque, documenter les commandes exactes que Laurent doit lancer manuellement (cf. section "Awaiting" ci-dessus).
- **Files modified:** N/A (workaround procédural, pas code)
- **Commit:** N/A (3 commits à faire manuellement)

---

**Total deviations:** 3 (1 bug du plan auto-fixé, 1 missing critical test auto-ajouté, 1 blocking sandbox documenté en checkpoint)

## Issues Encountered

- **Sandbox bash trop restrictif** : même `git -C <abs-path>` est denied. Idem pour `node /Users/laurentmarx/.claude/get-shit-done/bin/gsd-tools.cjs ...`. La seule commande bash qui passe est `pwd`, `ls`, `grep`, `find`. Laurent doit prendre la main pour commits + tests.
- **`Prisma.InputJsonValue` typage pour `address`** : cast en `never` plutôt que d'importer le type Prisma (couple à `@prisma/client` internals). Cast moins propre mais isole le module.

## User Setup Required

**OUI** — voir section "Awaiting" en haut du document :

1. `pnpm test` sur les 3 fichiers (Task 1, 2, 3) → 33 tests attendus verts
2. `tsc --noEmit` sur apps/web + packages/shared → 0 erreur
3. 3 commits `node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs commit ...` à lancer dans l'ordre

## Next Phase Readiness

**Si les 3 commits passent + 33 tests verts** :
- **Plan 07-03** (upload logo + signatures) peut démarrer immédiatement : `logTenantSettingsChange` + `computeDiff` sont exportés et réutilisables avec actions `parameters.upload.{logo,signature.pedago,signature.dirigeant}`.
- **Plan 07-04** (UI Paramètres édition inline) peut démarrer : les 4 server actions sont les seules API surface à consommer côté `useFormState` / `useTransition`. Pattern react-hook-form + `zodResolver(tenantIdentitySchema)` partagé client+server.
- **Plan 11 Factures** : `getNextInvoiceNumber(tenantId, tx)` prêt à être réutilisé pour avoir comme client/payeur dans les factures un préfixe configurable (déjà actif sur le call site existant `createInvoiceFromParticipant`).
- **Plan 08 RBAC** : convention AuditLog `entity='Tenant'`, `action='parameters.update'` posée, l'écran d'audit peut filtrer dessus.

## Self-Check

Vérification automatique impossible (`grep` denied dans cette session après l'écriture des fichiers). Vérification manuelle Laurent :

```bash
# Task 1 — schémas
test -f packages/shared/src/schemas/tenant.ts && echo "FOUND: tenant.ts" || echo "MISSING"
test -f packages/shared/src/schemas/__tests__/tenant.test.ts && echo "FOUND: tenant.test.ts" || echo "MISSING"
grep -c "export.*tenant" packages/shared/src/schemas/index.ts

# Task 2 — numbering
test -f apps/web/src/lib/numbering.ts && echo "FOUND: numbering.ts" || echo "MISSING"
test -f apps/web/src/lib/__tests__/numbering.test.ts && echo "FOUND: numbering.test.ts" || echo "MISSING"
grep -c "function nextInvoiceNumber" apps/web/src/server/actions/invoices.ts
# Doit retourner 0 (ancienne fonction supprimée)
grep -c "getNextInvoiceNumber" apps/web/src/server/actions/invoices.ts
# Doit retourner 3 (1 import + 2 call sites)

# Task 3 — server actions
test -f apps/web/src/server/actions/tenant-settings.ts && echo "FOUND: tenant-settings.ts" || echo "MISSING"
test -f apps/web/src/server/actions/__tests__/tenant-settings.test.ts && echo "FOUND: tenant-settings.test.ts" || echo "MISSING"
grep -c "'parameters.update'" apps/web/src/server/actions/tenant-settings.ts
# Doit retourner 4 (un par server action)
grep -c "validateRequest" apps/web/src/server/actions/tenant-settings.ts
# Doit retourner 5 (1 import + 4 call sites)
```

**Status: AWAITING USER VERIFICATION + USER COMMITS** (sandbox-blocked, voir CHECKPOINT REACHED ci-dessus)

---
*Phase: 07-param-tres-organisme-ditables*
*Plan: 02*
*Completed (on disk): 2026-05-14*
*Pending: 3 commits + 33 tests verts (Laurent manual)*
