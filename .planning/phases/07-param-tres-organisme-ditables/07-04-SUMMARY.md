---
phase: 07-param-tres-organisme-ditables
plan: 04
subsystem: settings-ui
tags: [react-hook-form, zod, server-actions, inline-edit, radix-dialog, tailwind]

# Dependency graph
requires:
  - phase: 07-param-tres-organisme-ditables
    plan: 02
    provides: "4 server actions (updateTenant*) + 4 schémas Zod (tenantIdentitySchema/Address/Billing/Email)"
  - phase: 07-param-tres-organisme-ditables
    plan: 03
    provides: "upload server actions (tenant-assets.ts) — EN COURS PARALLÈLE, mocké temporairement par stubs locaux dans of-assets-form.tsx"
provides:
  - "apps/web/src/lib/iban-format.ts : formatIban(s) helper (espaces tous les 4 chars, idempotent)"
  - "apps/web/src/components/settings/settings-section.tsx : wrapper Card mode read ↔ edit réutilisable"
  - "6 form components dans apps/web/src/components/settings/ : Identity/Address/Assets/Invoicing/Banking/Email"
  - "Page /app/parametres refactorée : 6 sections éditables (SET-01/SET-02/SET-03) + 3 sections legacy read-only"
  - "Pattern UX inline-edit pour Phase 7 (par section, bouton Modifier individuel — cohérent avec fiche apprenant Phase 5)"
affects: [07-03, 07-05, 11-factures, 08-rbac]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline edit par section (state local SettingsSection.editing) — pas de mode global"
    - "react-hook-form + zodResolver + useTransition pour ne pas bloquer l'UI pendant save"
    - "Server fieldErrors mappés vers form.setError(field) → erreurs serveur affichées sous chaque champ"
    - "toast.success / toast.error via sonner (pattern projet établi)"
    - "Radix Dialog (pas AlertDialog primitif — absent du projet) pour confirmation discontinuité préfixe + reset asset"
    - "Cache-busting `?v={Date.now()}` sur thumbnails d'assets (Pitfall 2 RESEARCH.md)"

key-files:
  created:
    - "apps/web/src/lib/iban-format.ts (helper formatIban, 20 lignes)"
    - "apps/web/src/lib/__tests__/iban-format.test.ts (6 tests Vitest)"
    - "apps/web/src/components/settings/settings-section.tsx (wrapper Card + toggle read/edit, 90 lignes)"
    - "apps/web/src/components/settings/of-identity-form.tsx (SET-01, 6 champs, 160 lignes)"
    - "apps/web/src/components/settings/of-address-form.tsx (SET-02 texte, 4 champs + textarea avec compteur, 175 lignes)"
    - "apps/web/src/components/settings/of-assets-form.tsx (SET-02 assets, 3 zones upload + AlertDialog reset, 300 lignes — STUBS Plan 07-03)"
    - "apps/web/src/components/settings/of-invoicing-form.tsx (SET-03 préfixe + AlertDialog discontinuité, 200 lignes)"
    - "apps/web/src/components/settings/of-banking-form.tsx (SET-03 IBAN/BIC + formatIban, 150 lignes)"
    - "apps/web/src/components/settings/of-email-form.tsx (SET-03 emailFrom + info-box SMTP, 115 lignes)"
    - "apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts (smoke test BUG-01 style, 4 tests)"
  modified:
    - "apps/web/src/app/app/parametres/page.tsx (refactor Server Component : 6 sections éditables + 3 legacy read-only, 300 lignes)"

key-decisions:
  - "Layout : sections empilées en grid-cols-1 gap-6 (recommandation A Finding 8 RESEARCH.md) — pas de tabs"
  - "Pas de Button/Card/Input primitifs : le projet utilise des raw <button>/<input> + Tailwind (cohérent avec login-form.tsx et user-menu-button.tsx)"
  - "Radix Dialog (pas AlertDialog) pour les confirmations — Radix AlertDialog n'est pas dans les deps du projet"
  - "of-assets-form.tsx : stubs locaux pour les server actions de Plan 07-03 (en parallèle) — TODO documentée pour swap après merge"
  - "of-invoicing-form + of-banking-form : tous deux appellent updateTenantBilling avec le triplet { invoicePrefix, iban, bic } en relayant les champs qu'ils ne modifient pas (alternative split en 2 server actions rejetée pour ne pas re-toucher 07-02)"
  - "formatIban tolérant null/undefined/empty (Tests 2/4/5) — défense en profondeur pour les premiers rendus avant première sauvegarde"
  - "Smoke test page anti-régression BUG-01 : check imports lucide-react + check que les 6 form components sont référencés"
  - "legalForm : maintenu en string libre (Open Question 1 du plan) — Select avec enum LegalForm reporté si Laurent en fait la demande"

requirements-completed: [SET-01, SET-02, SET-03]

# Metrics
duration: ~40min
completed: 2026-05-14
---

# Phase 7 Plan 07-04: UI Paramètres éditables — Inline edit 6 sections Summary

**Refactor de `/app/parametres` en page éditable : 6 sections inline-edit (Identité / Adresse / Logo&Signatures / Numérotation / RIB / Email) + 3 legacy read-only (Utilisateurs / OPCO / Docs Qualiopi). React-hook-form + zodResolver côté client, server actions de 07-02 côté serveur, AlertDialog discontinuité préfixe pour la numérotation factures.**

## CHECKPOINT — Sandbox commit policy

**Type:** human-action (orchestrator commit)
**Plan:** 07-04
**Progress:** 2/2 tasks COMPLETE on disk

Per la directive d'exécution `<commit_policy>` du prompt : tout le code est écrit sur disque, **aucun commit n'a été fait**. L'orchestrator (agent parent) gère les commits après retour de cet agent.

### Files written to disk

```
NEW   apps/web/src/lib/iban-format.ts
NEW   apps/web/src/lib/__tests__/iban-format.test.ts
NEW   apps/web/src/components/settings/settings-section.tsx
NEW   apps/web/src/components/settings/of-identity-form.tsx
NEW   apps/web/src/components/settings/of-address-form.tsx
NEW   apps/web/src/components/settings/of-assets-form.tsx
NEW   apps/web/src/components/settings/of-invoicing-form.tsx
NEW   apps/web/src/components/settings/of-banking-form.tsx
NEW   apps/web/src/components/settings/of-email-form.tsx
NEW   apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts
MOD   apps/web/src/app/app/parametres/page.tsx
```

### Verification commands Laurent doit lancer

```bash
# Tests Vitest (10 tests attendus : 6 iban-format + 4 smoke page)
pnpm --filter @qualiof/web test -- src/lib/__tests__/iban-format.test.ts src/app/app/parametres/__tests__/page.smoke.test.ts --run

# TypeScript clean
pnpm --filter @qualiof/web exec tsc --noEmit

# Build Next.js
pnpm --filter @qualiof/web build

# Manuel — visite /app/parametres en local :
#  - 6 sections éditables visibles (Identité, Adresse, Logo&Sig, Numérotation, RIB, Email)
#  - 3 sections legacy read-only (Utilisateurs/OPCO/Docs)
#  - Cliquer "Modifier" sur Identité → champs apparaissent
#  - Saisir un SIRET valide (ex: 81423718600030) → Enregistrer → toast success
```

## Performance

- **Duration:** ~40 min (Task 1 helper + wrapper + page shell, Task 2 les 6 forms)
- **Tasks:** 2 (TDD : Task 1 helper+wrapper+page, Task 2 6 forms)
- **Files created:** 10
- **Files modified:** 1 (page.tsx)

## Architecture des 9 sections de la page Paramètres

| # | Section | Mode | Server action | Schema Zod |
| - | --------------------------------- | ----- | ------------------------- | ---------------------- |
| 1 | Organisme — Identité légale       | edit  | updateTenantIdentity      | tenantIdentitySchema   |
| 2 | Adresse & mentions légales        | edit  | updateTenantAddress       | tenantAddressSchema    |
| 3 | Logo & signatures                 | edit  | (stubs 07-03)             | n/a (FormData upload)  |
| 4 | Numérotation factures             | edit  | updateTenantBilling       | tenantBillingSchema    |
| 5 | Coordonnées bancaires             | edit  | updateTenantBilling       | tenantBillingSchema    |
| 6 | Email expéditeur                  | edit  | updateTenantEmail         | tenantEmailSchema      |
| 7 | Utilisateurs (legacy)             | read  | n/a (Phase 8 RBAC)        | —                      |
| 8 | OPCO référencés (legacy)          | read  | n/a (seed)                | —                      |
| 9 | Référentiel docs Qualiopi (legacy)| read  | n/a (seed)                | —                      |

## Pattern Client component / Server action

Pour chaque form :

```ts
'use client';
const { register, handleSubmit, setError, formState: { errors } } = useForm<TenantXxxInput>({
  resolver: zodResolver(tenantXxxSchema),
  defaultValues: { ... }, // hydraté depuis le Tenant courant côté server
});

const onSubmit = (data) => startTransition(async () => {
  const result = await updateTenantXxx(data);
  if (result.ok) {
    toast.success('...');
    onSaved();
  } else {
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof TenantXxxInput, { message: messages?.[0] ?? 'Erreur' });
      }
    }
    toast.error(result.error);
  }
});
```

Cohérent avec `apps/web/src/app/login/login-form.tsx` (seul autre usage de react-hook-form dans le projet à ce stade — pattern projet posé par cette phase pour tous les futurs formulaires CRUD).

## Pitfalls adressés (RESEARCH.md)

### Pitfall 2 — Cache-busting des thumbnails après upload

`of-assets-form.tsx` :
```tsx
const [version, setVersion] = useState(() => Date.now());
const logoSrc = (initial.logoPath || DEFAULT_LOGO) + `?v=${version}`;
// Après upload : setVersion(Date.now()) → React rerend l'<img> avec une nouvelle URL
```

Sans ce mécanisme, le navigateur garde l'ancienne image en cache et l'utilisateur ne voit pas son nouveau logo tant qu'il ne hard-refresh pas. La query string `?v=N` n'affecte pas le path BDD (qui reste `/of-assets/{tenantId}/logo.png`).

### Pitfall 4 — Confirmation discontinuité préfixe facture

`of-invoicing-form.tsx` : si `invoiceCount > 0 && newPrefix !== initial.invoicePrefix` au submit, on ouvre un `Dialog.Root` Radix avec le message :

> Vous avez déjà émis **N** facture(s) avec le préfixe **OLD**. Passer à **NEW** créera une discontinuité dans la séquence : le compteur repartira à **NEW-000001**. Cette opération est généralement déconseillée pour la traçabilité comptable. Continuer ?

Avec deux boutons : "Annuler" (ferme le dialog) et "Confirmer le changement" (déclenche `doSave(newPrefix)`). Le bouton de confirmation est en `bg-amber-600` (orange, action à risque) plutôt que `bg-red-600` (action destructive — réservé pour Restauration assets).

### Pitfall 5 — Validation IBAN avec espaces

Le helper `formatIban` ajoute des espaces pour l'affichage. La validation Zod côté server (`tenantBillingSchema`) utilise `z.preprocess` qui retire les espaces avant le regex `^FR\d{2}[A-Z0-9]{23}$`. Donc soumettre `'FR76 1234 5678 9012 3456 7890 123'` est strictement équivalent à `'FR7612345678901234567890123'` côté BDD.

## TODO Plan 07-03 wiring

`of-assets-form.tsx` contient 4 fonctions stub locales (`__stubUploadLogo`, `__stubUploadSignature`, `__stubResetLogo`, `__stubResetSignature`) qui renvoient toujours `{ ok: false, error: 'Plan 07-03 en cours' }`. Ces stubs sont là pour que l'UI compile et soit cliquable AVANT que 07-03 ne soit mergé.

**Quand 07-03 sera mergé**, faire les 3 modifs suivantes dans `of-assets-form.tsx` :

1. **Remplacer les stubs par les vrais imports** :
   ```ts
   // Supprimer le bloc "STUBS TEMPORAIRES" (L34-72)
   // À la place :
   import {
     uploadTenantLogo,
     uploadTenantSignature,
     resetTenantLogo,
     resetTenantSignature,
   } from '@/server/actions/tenant-assets';
   ```

2. **Adapter `handleFileChange`** : remplacer `__stubUploadLogo(fd)` par `uploadTenantLogo(fd)` (idem pour signature).

3. **Adapter `ResetButton.handleClick`** : remplacer `__stubResetLogo()` par `resetTenantLogo()` (idem signature).

Vérifier la signature exacte des actions 07-03 (FormData vs File vs Buffer) — si elle diffère, ajuster en conséquence.

## Open Question 1 — legalForm String vs enum

Le plan suggérait que `legalForm` pourrait migrer d'un `String` libre vers `Select` avec enum `LegalForm`. Décision pour 07-04 : **gardé en `<input type="text">` libre** (cohérent avec D-02 et `tenantIdentitySchema`).

Si Laurent demande un Select limité (SAS, EURL, SARL, SA, EI, …), c'est un changement isolé à `of-identity-form.tsx` (remplacer `<input>` par `<select>`) + ajout de l'enum côté `tenant.ts` (passer `z.string()` à `z.nativeEnum(LegalForm)`). Coût ~15min.

## Decisions Made

### 1. Pas de primitive Button/Card/Input — raw HTML + Tailwind

Le projet n'a pas (à ce stade) de `Button`, `Card`, `Input` primitives dans `components/ui/` :
```
$ ls apps/web/src/components/ui/
back-to-list-link.tsx  badge.tsx  breadcrumb.tsx  collapsible-section.tsx
data-table.tsx  filter-chips.tsx  page-header.tsx  pagination.tsx
placeholder.tsx  search-input.tsx
```

Le pattern établi (cf. `login-form.tsx`, `user-menu-button.tsx`) utilise des raw `<button>` / `<input>` avec Tailwind utility classes. J'ai suivi ce pattern dans toutes les forms et le `SettingsSection` wrapper, plutôt que d'introduire une primitive `Button` ad-hoc qui aurait débordé du scope du plan.

→ **Pas une deviation** — choix d'alignement sur le pattern projet existant. Si Laurent veut introduire une primitive `Button` plus tard, c'est un refactor cross-app à part entière.

### 2. Radix Dialog (pas AlertDialog) pour les confirmations

`@radix-ui/react-alert-dialog` n'est pas dans les `dependencies` du projet. `@radix-ui/react-dialog` (Dialog) l'est, et il est déjà utilisé pour la confirmation déconnexion (`user-menu-button.tsx`). J'ai utilisé `Dialog` avec un titre/description explicite + deux boutons (action de confirmation en `bg-amber-600` ou `bg-red-600`).

Sémantiquement le Dialog joue le même rôle qu'AlertDialog pour ce cas d'usage. Si Laurent veut une accessibilité stricte AlertDialog (qui force le focus, désactive le clic en dehors, etc.), il faut ajouter `@radix-ui/react-alert-dialog` aux deps et migrer dans une future passe.

→ **Pas une deviation** — utilise l'outil disponible. Documenté ici pour traçabilité.

### 3. of-invoicing-form + of-banking-form partagent updateTenantBilling

`updateTenantBilling(input: { invoicePrefix, iban, bic })` est le seul point d'entrée Plan 07-02 pour la facturation. Chacune des deux forms relaie les valeurs des champs qu'elle ne modifie pas :
- `of-invoicing-form` modifie `invoicePrefix`, relaie `initial.iban` / `initial.bic`
- `of-banking-form` modifie `iban` / `bic`, relaie `initial.invoicePrefix`

Alternative étudiée : split en `updateInvoicePrefix` + `updateBankingDetails` dans 07-02 → rejetée pour ne pas re-toucher un plan déjà mergé. Coût du choix actuel : aucun (le pattern de relai est trivial et bien commenté).

→ **Pas une deviation** — choix architectural mentionné dans le plan, conservé.

### 4. Smoke test parametres : 4 assertions (au lieu de 2 dans le plan)

Le plan demande 2 tests minimum (import ne throw pas, page exporte un default function). J'ai écrit 4 tests qui couvrent en plus :
- Tous les symboles lucide-react utilisés en JSX sont importés (anti-régression BUG-01)
- Les 6 form components (OfIdentityForm, etc.) sont référencés dans la page

Les tests s'inspirent du modèle de `apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts` qui sont des tests statiques sur le source — pas besoin de spin un Server Component (impossible en isolation, dépend de prisma/lucia/etc.).

→ **Rule 2 — missing critical functionality** : "le default function est exporté" est trivialement vrai si le fichier compile. Le test plus utile est de vérifier que les imports JSX sont cohérents (anti-BUG-01).

### 5. of-assets-form : stubs locaux temporaires (Plan 07-03 parallèle)

Documenté en haut de fichier avec un bloc commenté `STUBS TEMPORAIRES (à remplacer après merge 07-03)`. Les stubs retournent `{ ok: false, error: '...' }` — l'UI reste cliquable, l'utilisateur reçoit un toast informatif. Quand 07-03 sera mergé, 3 lignes à modifier (cf. section TODO ci-dessus).

→ **Non-déviation** — exactement le pattern décrit dans `<parallel_execution>` du prompt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `zodResolver(tenantBillingSchema.pick({ ... }))` typing mismatch**

- **Found during:** Task 2 (review post-écriture)
- **Issue:** Initial implementation utilisait `tenantBillingSchema.pick({ invoicePrefix: true })` dans `of-invoicing-form.tsx` et `pick({ iban: true, bic: true })` dans `of-banking-form.tsx`. Le `pick` sur un schéma avec `z.preprocess` produit un type output `string | null` pour iban/bic, mais mes interfaces `LocalForm` typaient `iban: string`. Résultat : `defaultValues` aurait été refusé par TypeScript (`string` n'est pas assignable à `string | null` en mode strict si RHF infère depuis le schéma).
- **Fix:** Utilisation du schéma complet `tenantBillingSchema` dans les deux forms, avec toutes les valeurs initiales injectées dans `defaultValues` (le champ "non modifié" est relayé tel quel). Type d'inférence aligné sur `TenantBillingInput`. Cast explicite `field as 'iban' | 'bic'` dans `setError` pour le banking form.
- **Files modified:** `of-invoicing-form.tsx`, `of-banking-form.tsx`
- **Commit:** Sera fait par orchestrator (sandbox blocking)

**2. [Rule 2 — Missing critical] `formatIban` tolère `undefined` (Test 5 ajouté)**

- **Found during:** Task 1 écriture des tests
- **Issue:** Le plan spécifie 4 tests (null, idempotent, vide, chaîne 27 chars). En pratique, le composant page passera `tenant.iban` qui est `string | null` côté Prisma — `undefined` ne devrait pas survenir. Mais le typage du helper `(s: string | null | undefined)` accepte `undefined` par défense en profondeur, et un test devrait l'exercer pour ne pas régresser.
- **Fix:** Ajout Test 5 `formatIban(undefined) === ''` + Test 6 casse mixte normalisée en MAJUSCULES (bonus tolérance UI).
- **Files modified:** `apps/web/src/lib/__tests__/iban-format.test.ts` (6 tests au lieu de 4)
- **Commit:** Sera fait par orchestrator

**3. [Rule 3 — Blocking] Sandbox bash bloque les commits + tests**

- **Found during:** Démarrage de l'agent
- **Issue:** Le sandbox actuel refuse `git`, `pnpm`, `node`. Identique au sandbox du Plan 07-02 (déjà documenté dans son SUMMARY).
- **Fix:** Tout le code écrit sur disque, SUMMARY documente l'état, l'orchestrator (agent parent) committera après mon retour conformément au prompt `<commit_policy>`.
- **Files modified:** N/A (workaround procédural)
- **Commit:** Bypass — commit fait par parent

---

**Total deviations:** 3 (1 bug typing auto-fixé, 1 missing critical test auto-ajouté, 1 sandbox bloqué documenté)

## Issues Encountered

- **Pas de Button/Card/Input primitives dans le projet** : surprise mineure, le pattern raw HTML+Tailwind est cohérent avec le reste du codebase (cf. login-form.tsx). Suivi sans introduire de primitive ad-hoc.
- **`@radix-ui/react-alert-dialog` absent** : utilisé `Dialog` à la place (pattern user-menu-button.tsx). Documenté en Decision 2.
- **TypeScript `zodResolver` + `pick` + `preprocess`** : combinaison non triviale (Decision/Deviation 1). Résolu en utilisant le schéma complet.
- **Sandbox bash bloqué** : ne peut pas lancer les tests ni le typecheck. Code visuellement audité plusieurs fois pendant l'écriture — relecture des 6 forms post-fix typing.

## User Setup Required

**OUI partiellement** — l'orchestrator gère les commits, mais Laurent doit lancer :

```bash
# 1. Tests Vitest (10 tests : 6 iban-format + 4 smoke page)
pnpm --filter @qualiof/web test -- src/lib/__tests__/iban-format.test.ts src/app/app/parametres/__tests__/page.smoke.test.ts --run

# 2. Type-check (0 erreur attendue)
pnpm --filter @qualiof/web exec tsc --noEmit

# 3. Build (page /app/parametres compile)
pnpm --filter @qualiof/web build

# 4. Smoke manuel — démarrer le dev et visiter /app/parametres
pnpm dev:full
```

**Si Plan 07-03 n'est pas encore mergé** au moment du test manuel : la section "Logo & signatures" sera cliquable mais chaque tentative d'upload affichera un toast d'erreur "Plan 07-03 en cours". C'est attendu — voir section TODO ci-dessus.

## Known Stubs

- **`of-assets-form.tsx` L34-72** : 4 fonctions stub locales (`__stubUploadLogo`, `__stubUploadSignature`, `__stubResetLogo`, `__stubResetSignature`) retournant systématiquement `{ ok: false, error: '...' }` jusqu'à ce que Plan 07-03 (`tenant-assets.ts`) soit mergé. Plan 07-04 lui-même est fonctionnellement complet pour Identité/Adresse/Numérotation/RIB/Email ; le stub n'affecte QUE la section Logo & signatures qui sera dé-stubée au merge 07-03 (3 lignes de code à modifier — documenté en section "TODO Plan 07-03 wiring").

## Next Phase Readiness

- **Plan 07-03 (en parallèle)** : quand mergé, dé-stuber `of-assets-form.tsx` selon le mode opératoire de la section "TODO Plan 07-03 wiring" ci-dessus (3 modifs triviales).
- **Plan 07-05 (verification finale)** : tous les hooks UI sont en place pour la vérif manuelle (édit + save + recharge BDD + revalidatePath). Smoke test ancré anti-régression BUG-01.
- **Plan 11 (Factures)** : `Tenant.invoicePrefix` est désormais éditable. `getNextInvoiceNumber(tenantId, tx)` (Plan 07-02) consomme déjà le préfixe BDD. La création de factures Plan 11 héritera automatiquement du préfixe configuré dans `/app/parametres`.
- **Phase 8 (RBAC)** : tous les `update*` actions de tenant-settings.ts loggent dans `AuditLog` (Plan 07-02). L'écran d'audit Phase 8 filtrera `WHERE entity='Tenant' AND action='parameters.update'` pour afficher l'historique des modifs paramètres.

## Self-Check

Vérifications statiques effectuées (sans bash test/typecheck) :

```
[FOUND] apps/web/src/lib/iban-format.ts (export function formatIban)
[FOUND] apps/web/src/lib/__tests__/iban-format.test.ts (6 tests)
[FOUND] apps/web/src/components/settings/settings-section.tsx (export function SettingsSection)
[FOUND] apps/web/src/components/settings/of-identity-form.tsx (export function OfIdentityForm)
[FOUND] apps/web/src/components/settings/of-address-form.tsx (export function OfAddressForm)
[FOUND] apps/web/src/components/settings/of-assets-form.tsx (export function OfAssetsForm)
[FOUND] apps/web/src/components/settings/of-invoicing-form.tsx (export function OfInvoicingForm)
[FOUND] apps/web/src/components/settings/of-banking-form.tsx (export function OfBankingForm)
[FOUND] apps/web/src/components/settings/of-email-form.tsx (export function OfEmailForm)
[FOUND] apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts (4 tests)
[MOD]   apps/web/src/app/app/parametres/page.tsx (300 lignes, 6 forms importés, 9 sections rendues)
```

Acceptance criteria :
- `ls apps/web/src/components/settings/*.tsx | wc -l` = 7 ✓
- `grep -c "Building2\\|MapPin\\|Image\\|Hash\\|CreditCard\\|Mail" apps/web/src/app/app/parametres/page.tsx` = 12 ≥ 6 ✓
- `grep -c "OfIdentityForm\\|OfAddressForm\\|OfAssetsForm\\|OfInvoicingForm\\|OfBankingForm\\|OfEmailForm" apps/web/src/app/app/parametres/page.tsx` = 12 ≥ 6 ✓
- `grep -c "toast" apps/web/src/components/settings/*.tsx` (somme) = 21 ≥ 6 ✓
- `grep -c "zodResolver" apps/web/src/components/settings/of-identity-form.tsx` = 1 ≥ 1 ✓
- `grep -c "updateTenantIdentity" apps/web/src/components/settings/of-identity-form.tsx` = 2 ≥ 1 ✓
- `grep -c "Dialog\\." apps/web/src/components/settings/of-invoicing-form.tsx` = 13 ≥ 1 ✓
- `grep -c "formatIban" apps/web/src/components/settings/of-banking-form.tsx` = 3 ≥ 1 ✓

**Status: AWAITING ORCHESTRATOR COMMITS + USER VERIFICATION** (sandbox-blocked, parent agent will commit)

---
*Phase: 07-param-tres-organisme-ditables*
*Plan: 04*
*Completed (on disk): 2026-05-14*
*Pending: orchestrator commit + pnpm test/build verification by Laurent*
