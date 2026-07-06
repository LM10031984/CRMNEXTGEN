# Phase 7: Paramètres organisme éditables - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Sortir la page `/app/parametres` du read-only. Permettre à Laurent d'éditer lui-même depuis l'UI :
- Identité OF (SIRET, numDA, RCS, forme juridique)
- Adresse + mentions légales + logo + signatures (alimente les PDF Qualiopi via `lib/of-config.ts`)
- Préférences : numérotation factures, RIB OF, expéditeur email

Hors scope : RBAC / multi-utilisateurs (Phase 8), édition catalogue OPCO (déjà via seed), édition templates Qualiopi (autre phase).

</domain>

<decisions>
## Implementation Decisions

### D-01 — Source de vérité pour les champs OF
Stratégie **hybride BDD ⤳ ENV** :
- **Premier rendu** : si le champ existe en BDD (`Tenant.siret`, etc.) → utiliser la valeur BDD ; sinon fallback `process.env.OF_*` (préserve le comportement actuel sans rien casser).
- **Première sauvegarde** : la valeur entre en BDD et l'override est permanent.
- Aucune migration de données nécessaire — les pré-remplissages se font à la volée via `of-config.ts`.
- **Pourquoi** : Laurent a demandé "laisse les infos que tu as actuellement dedans" (Q1). Pas de risque de régression PDF tant que personne n'a touché aux Paramètres ; après édition, la BDD prend le relais.

### D-02 — Champs éditables SIRET/numDA/RCS/forme juridique (SET-01)
- Formulaire classique : champ texte + bouton "Enregistrer".
- Validation SIRET : **format only** (regex 14 chiffres + clé de Luhn). Pas d'appel API INSEE (out of scope — friction admin).
- Forme juridique = nouveau champ `Tenant.legalForm` (string libre, ex "SAS", "EURL", "SARL").
- Confirmation toast après enregistrement (pattern existant `sonner`).

### D-03 — Adresse + mentions légales (SET-02)
- Adresse stockée dans `Tenant.address` (champ Json déjà présent — ne pas casser).
- Mentions légales = nouveau champ `Tenant.legalMentions` (text long).
- Édition libre, pas de validation particulière.

### D-04 — Logo (SET-02)
- **Déjà en place** dans `apps/web/src/assets/logo-start-academy.png` (et `logo-white.png` pour bandeau bleu PDF). Templates closure les consomment via `loadAssetDataUrl()` dans `shared-template.ts`.
- **Édition UI** : upload PNG / JPG / SVG dans Paramètres → écrit dans `apps/web/public/of-assets/{tenantId}/logo.png`. Si présent, écrase le fallback `src/assets/`.
- Aperçu thumbnail dans Paramètres avec bouton "Remplacer" / "Restaurer logo par défaut".
- Logos secondaires (`logo-ministere-travail.png`, `logo-qualiopi.png`) : non éditables (assets fixes officiels).

### D-05 — Signatures (SET-02)
- **Déjà en place** : `signature-laurent.png` (responsable Start Academy) + `tampon-signature-fusion.png` (Julien Lafitte) + `tampon-signature.png` (fallback). Voir `shared-template.ts` `loadSignatureDataUrl()`.
- **Édition UI** : 2 emplacements upload dans Paramètres :
  - Signature **responsable pédagogique** → écrit `apps/web/public/of-assets/{tenantId}/signature-pedago.png`
  - Signature **dirigeant** → écrit `apps/web/public/of-assets/{tenantId}/signature-dirigeant.png`
- Si pas uploadées, fallback sur les images actuelles `src/assets/`.
- Aperçu thumbnail + bouton "Remplacer".

### D-06 — Numérotation factures (SET-03)
- **Logique séquentielle déjà implémentée** dans `apps/web/src/server/actions/invoices.ts` (format `FAC-NNNNNN` sur 6 chiffres, atomique via `prisma.$transaction`).
- **Phase 7 ajoute uniquement le préfixe configurable** (`Tenant.invoicePrefix`, défaut `FAC`) — le format reste `{prefix}-{6digits}` continu.
- Extraire la logique dans `apps/web/src/lib/numbering.ts` pour la réutiliser (cohérent avec pattern `SES-XXXX`).
- Cohérence avec `SES-0089` confirmée par Laurent (Q3 "on suit la logique des numéros de session"). Note format différent (4 vs 6 digits) car volumes différents — non bloquant.
- ⚠️ Bug à corriger au passage : `invoices.ts` actuel re-déclare `const OF = { iban: process.env.OF_IBAN ... }` localement → bypass `getOfConfig()`. Refactor obligatoire dans Plan 01.

### D-07 — RIB OF (SET-03)
- IBAN + BIC éditables dans Paramètres (Laurent : "je le mets une fois et c'est ok").
- Stockés sur `Tenant.iban` + `Tenant.bic` (nouveaux champs).
- Pas de validation IBAN sophistiquée — format basique (regex IBAN FR + BIC).
- Apparaissent en bas des factures (template à brancher en Phase 11 Factures).

### D-08 — Email expéditeur (SET-03)
- Valeur cible : `formation@start-academy.fr` (Laurent Q5).
- Stocké dans `Tenant.emailFrom` (nouveau champ), éditable depuis Paramètres comme le RIB.
- **Le mot de passe SMTP reste en ENV** (`SMTP_PASSWORD`) — pas exposé dans l'UI (sécurité).
- L'UI affiche : "Email expéditeur : `formation@start-academy.fr`" + bouton "Modifier" → champ email.

### D-09 — Audit log
- Chaque enregistrement Paramètres crée un `AuditLog` row avec :
  - `action: 'parameters.update'`
  - `entityType: 'Tenant'`
  - `entityId: tenantId`
  - `changes: { field1: { before: 'X', after: 'Y' }, ... }` (JSON diff des champs modifiés)
- Granularité par champ — visible dans le futur écran AuditLog UI (Phase 8 RBAC).

### Claude's Discretion
- Architecture serveur (Server Actions vs API routes) → Server Actions (cohérent avec le reste du projet).
- Validation Zod côté server + react-hook-form côté client (pattern projet).
- Layout Paramètres : sections clarifiées (Identité / Adresse / Logo & signatures / Facturation / Email) en tabs ou empilées — à arbitrer au planning selon UX.
- Mode "édition" : inline edit (bouton "Modifier" par section qui passe en mode édition) — pattern cohérent avec fiche apprenant Phase 5.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code existant (source de vérité)
- `apps/web/src/app/app/parametres/page.tsx` — page actuelle read-only (à transformer)
- `apps/web/src/lib/of-config.ts` — adapter pour lire BDD avec fallback ENV
- `apps/web/src/lib/closure/shared-template.ts` §§ `loadAssetDataUrl`, `loadSignatureDataUrl`, `loadLogoStartAcademy` — chemin d'accès logo/signature
- `apps/web/src/assets/` — assets fallback (logo-start-academy.png, signature-laurent.png, etc.)
- `packages/db/prisma/schema.prisma` model `Tenant` — schéma actuel (siret, numDA, rcs, address Json — à étendre avec legalForm, legalMentions, iban, bic, emailFrom)
- `packages/db/prisma/schema.prisma` model `AuditLog` — pattern audit
- `packages/db/prisma/schema.prisma` model `Invoice` §§ numérotation — à intégrer en Phase 11, prévoir `Tenant.invoicePrefix` ici
- `apps/web/src/app/app/sessions/` actions — pattern numérotation séquentielle `SES-XXXX` à répliquer pour `FAC-XXXX`

### Patterns projet
- `apps/web/src/server/actions/` — pattern Server Actions discriminé `{ ok, ... }`
- `packages/shared/src/schemas/` — pattern Zod réutilisable client+server
- `apps/web/src/lib/storage.ts` — pour comparaison (MinIO) — NON utilisé ici (filesystem `public/of-assets/` suffit)

### CLAUDE.md
- `/Users/laurentmarx/Documents/CRM Next gen/files/CLAUDE.md` — règles globales (kebab-case, Server Actions, Tailwind utility-first, tenantId scope obligatoire, Zod schemas)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`PageHeader` component** — déjà utilisé dans `parametres/page.tsx`, à conserver.
- **`Field` component local** — actuel `dt/dd` read-only, à remplacer par formulaire éditable.
- **`Badge` component** — pour statut "Modifié récemment" éventuel.
- **`sonner` toasts** — pour confirmation enregistrement (pattern Phase 4+).
- **`react-hook-form` + `@hookform/resolvers` + `zod`** — pile standard du projet pour formulaires.
- **`AuditLog` Prisma model** — déjà présent, juste à invoquer dans les server actions.
- **Pattern `Tenant.address` Json** — exemple de champ Json libre déjà géré.

### Established Patterns
- **Server actions return `{ ok: true, ... } | { ok: false, error: '...' }`** — discriminé.
- **`validateRequest()` + `prisma.tenant.findUnique` scope tenantId** — sécurité multi-tenant obligatoire.
- **Form layout 1-2 colonnes responsive** — `grid-cols-1 lg:grid-cols-2 gap-6` cohérent avec page actuelle.
- **Upload fichier** — pas de pattern existant côté `public/` ; usage `formData` côté server action + `fs.promises` ou Next.js Route Handler (à arbitrer au planning).

### Integration Points
- **`lib/of-config.ts`** : modifier pour async (Promise<OfConfig>) ou créer `getOfConfigForTenant(tenantId)` qui lit BDD + fallback ENV. Tous les templates closure consomment `getOfConfig()` aujourd'hui — refactor en cascade.
- **`shared-template.ts` `loadSignatureDataUrl()`** : étendre pour chercher dans `public/of-assets/{tenantId}/` avant `src/assets/`.
- **Sidebar nav** : "Paramètres" déjà présent, pas de changement.

</code_context>

<specifics>
## Specific Ideas

- **Q1 (Laurent)** : "Oui mais laisse les infos que tu as actuellement dedans" → préchargement ENV → BDD à la première sauvegarde.
- **Q2 (Laurent)** : "Oui mais j'ai l'impression qu'il y est déjà dans les docs" → logos+signatures déjà dans le code, on ajoute juste la possibilité d'upload UI.
- **Q3 (Laurent)** : "ce que tu fais déjà est très bien on suit la logique des numéros de session" → `FAC-XXXX` continue (comme `SES-0089`).
- **Q4 (Laurent)** : "Oui dans les paramètres je le mets une fois et c'est ok" → IBAN/BIC éditables une fois en Paramètres.
- **Q5 (Laurent)** : "formation@start-academy.fr" → valeur initiale, éditable par cohérence avec Q4.

</specifics>

<deferred>
## Deferred Ideas

- **API INSEE pour validation SIRET live** → trop de friction (clé API, throttling), Phase ultérieure si besoin réel.
- **Upload logos secondaires** (Ministère du Travail, Qualiopi) → assets officiels, ne pas éditer.
- **Reset annuel séquence factures** → cohérence numéros sessions = continu, pas demandé.
- **Édition SMTP host/port/user/password depuis UI** → sécurité, restera en ENV (Phase ultérieure si vrai besoin OF cloud).
- **Multi-tenant édition simultanée** → pas pertinent (1 tenant = 1 OF Start Academy).
- **Versioning des templates Qualiopi depuis Paramètres** → autre phase.

</deferred>

---

*Phase: 07-param-tres-organisme-ditables*
*Context gathered: 2026-05-14*
