# Phase 7: Paramètres organisme éditables — Research

**Researched:** 2026-05-13
**Domain:** Brownfield — Next.js 14 Server Actions, Prisma migrations, file upload local FS, hybrid BDD/ENV config, Zod validation, AuditLog wiring
**Confidence:** HIGH

## Summary

Phase 7 transforme `/app/parametres` (aujourd'hui purement read-only — `dl/dt/dd` sur `prisma.tenant.findUnique`) en page d'édition complète couvrant SET-01 (identité OF), SET-02 (adresse + logo + signatures + mentions légales) et SET-03 (numérotation factures, RIB, email expéditeur). Tous les éléments d'infrastructure nécessaires sont déjà en place : pattern Server Actions discriminé `{ ok, ... }`, helper `isValidSiret` (Luhn + cas La Poste), enum Prisma `LegalForm` (SAS, SARL, EURL, SASU, …), pattern FormData + `arrayBuffer()` + `uploadFile` (cf. `upload-apprenant-docs.ts`), modèle `AuditLog` avec champ `diff: Json` prêt à recevoir le delta par champ. **Surprise notable** : `invoices.ts` implémente DÉJÀ une numérotation `FAC-NNNNNN` (6 chiffres, transactionnelle) et **bypasse** `getOfConfig()` au profit d'un objet ENV inline — le refactor doit fixer ce drift en plus de rendre le préfixe configurable. Idem `programme-template.ts` et `convention-template.ts` ont leurs propres `logoCache` locaux : extension `loadAssetDataUrl` doit cascader sur tous les call sites (sinon édition logo UI sans effet sur PDF programme/convention).

**Primary recommendation:** Découper la phase en **5 plans séquentiels** : (1) Migration Prisma `Tenant` + ENV-fallback helper async, (2) Server Actions paramètres + Zod schemas + AuditLog wiring, (3) Upload assets (logo + 2 signatures) + extension `loadAssetDataUrl`, (4) UI page Paramètres édition inline par section, (5) Bookkeeping. Plan 1 est bloquant pour 2/3/4. Plans 3 et 4 peuvent être parallélisés après Plan 2.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Hybrid BDD ⤳ ENV** : si `Tenant.<champ>` est non-null, l'utiliser ; sinon fallback `process.env.OF_*`. Première sauvegarde fait basculer la source de vérité en BDD de façon permanente. Aucune migration de données : pré-remplissage à la volée.
- **D-02 — SET-01 (SIRET/numDA/RCS/forme juridique)** : champs texte simples + bouton Enregistrer. Validation SIRET : `isValidSiret` (14 chiffres + Luhn) — pas d'API INSEE. Forme juridique = nouveau champ `Tenant.legalForm` (texte libre OU enum réutilisable, voir Q1).
- **D-03 — SET-02 adresse + mentions légales** : `Tenant.address` Json déjà présent. Mentions légales = nouveau champ `Tenant.legalMentions` (texte long). Pas de validation particulière.
- **D-04 — Logo** : upload PNG/JPG/SVG → `apps/web/public/of-assets/{tenantId}/logo.png`. Fallback `src/assets/logo-start-academy.png`. UI : thumbnail + "Remplacer" / "Restaurer logo par défaut". Logos secondaires (Ministère, Qualiopi) non éditables.
- **D-05 — Signatures** : 2 emplacements upload → `signature-pedago.png` + `signature-dirigeant.png` dans `public/of-assets/{tenantId}/`. Fallback `src/assets/signature-laurent.png` + `tampon-signature-fusion.png`. Thumbnail + "Remplacer".
- **D-06 — Numérotation factures** : `FAC-XXXX` séquence continue (CONTEXT.md dit "4 chiffres" — mais voir Finding 5 : le code actuel utilise déjà `FAC-NNNNNN` 6 chiffres, à arbitrer). Préfixe configurable (`Tenant.invoicePrefix`, défaut `FAC`). Atomicité via `prisma.$transaction` (pattern déjà en place dans `invoices.ts`).
- **D-07 — RIB** : `Tenant.iban` + `Tenant.bic` (nouveaux). Validation regex format basique (IBAN FR + BIC).
- **D-08 — Email expéditeur** : `Tenant.emailFrom` (nouveau). Mot de passe SMTP reste **uniquement** en ENV (`SMTP_PASSWORD`), jamais dans l'UI.
- **D-09 — AuditLog** : à chaque sauvegarde Paramètres, une row `AuditLog` avec `action: 'parameters.update'`, `entity: 'Tenant'`, `entityId: tenantId`, `diff: { field: { before, after } }`.

### Claude's Discretion

- Architecture serveur : **Server Actions** (pas API routes) — cohérence projet.
- Stack form : **react-hook-form + zodResolver** côté client + Zod côté server (pile existante).
- Layout Paramètres : édition **inline par section** (bouton Modifier → mode édition) — pattern Phase 5 fiche apprenant. Tabs vs sections empilées : à arbitrer (recommandation : sections empilées, voir Finding 8).
- Format des nouvelles colonnes Prisma : nullables avec `String?` (D-01 hybrid → null signale "fallback ENV").

### Deferred Ideas (OUT OF SCOPE)

- API INSEE pour validation SIRET live.
- Upload logos secondaires (Ministère du Travail, Qualiopi).
- Reset annuel séquence factures.
- Édition SMTP host/port/user/password depuis UI.
- Multi-tenant édition simultanée (1 tenant = 1 OF).
- Versioning templates Qualiopi.

## Phase Requirements

| ID | Description (REQUIREMENTS.md L45-47) | Research Support |
|----|--------------------------------------|------------------|
| SET-01 | Édition SIRET / numDA / RCS / forme juridique | Finding 1 (migration colonnes) + Finding 2 (refactor `getOfConfig` BDD-fallback-ENV) + Finding 7 (Zod SIRET via `isValidSiret`) |
| SET-02 | Édition adresse + logo + mentions légales + signatures responsable/dirigeant | Finding 1 (`legalMentions`, `logoPath`, `signaturePedagoPath`, `signatureDirigeantPath`) + Finding 3 (extension `loadAssetDataUrl` cascade FS) + Finding 4 (FormData + arrayBuffer + writeFile public/) |
| SET-03 | Préférences : numérotation factures, RIB OF, expéditeur SMTP | Finding 5 (numérotation `FAC-XXXX` déjà en place — à généraliser via préfixe configurable + arbitrer 4 vs 6 digits) + Finding 1 (`invoicePrefix`, `iban`, `bic`, `emailFrom`) |

## Project Constraints (from CLAUDE.md / PROJECT.md)

| Directive | Source | Application Phase 7 |
|-----------|--------|---------------------|
| Server Actions over `/api` for mutations | CONVENTIONS § Patterns to keep | Toutes les sauvegardes Paramètres = Server Actions |
| Discriminated `{ ok, ... }` returns from actions | CONVENTIONS | Toutes les server actions Phase 7 doivent suivre |
| Prisma queries always scoped to `user.tenantId` | CONVENTIONS | `validateRequest()` + `where: { id: user.tenantId }` obligatoire |
| Zod schemas in `packages/shared/src/schemas/` reused server + client | CONVENTIONS | Créer `packages/shared/src/schemas/tenant.ts` |
| Kebab-case files (lib, components, actions) | CONVENTIONS | `server/actions/tenant-settings.ts`, `components/settings/of-identity-form.tsx`, etc. |
| Multi-tenant : tenantId FK partout | PROJECT.md Constraints | Tous les paths `public/of-assets/{tenantId}/...` |
| RGPD / PII : MinIO bucket privé avec signed URLs | PROJECT.md Constraints | Logo/signatures ne sont PAS de la PII → filesystem `public/` OK (pas MinIO). IBAN/BIC OF = donnée commerciale, pas RGPD personnelle → BDD claire OK. SMTP_PASSWORD reste en ENV (sécurité). |
| Footer PDF en `position:fixed bottom:0` HTML body | PROJECT.md Constraints | Phase 7 ne touche pas au footer — juste à `of-config.ts` qui alimente le footer |
| Tests Vitest | STACK | Vitest 2.1.8 sur `apps/web` + `packages/shared`, env `node` |

## Findings

### Finding 1 — Tenant schema extensions (Q1)

**Current `Tenant` model** (`packages/db/prisma/schema.prisma` L24-33) :

```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  siret     String?
  numDA     String?
  rcs       String?
  address   Json?
  users     User[]
  createdAt DateTime @default(now())
}
```

**Proposed extension** :

```prisma
model Tenant {
  id                     String   @id @default(uuid())
  name                   String
  siret                  String?
  numDA                  String?
  rcs                    String?
  legalForm              String?  // SAS / EURL / SARL / SASU / … (texte libre — voir alternative ci-dessous)
  legalMentions          String?  @db.Text
  address                Json?
  // Préférences SET-03
  invoicePrefix          String?  @default("FAC")
  iban                   String?
  bic                    String?
  emailFrom              String?
  // Chemins assets uploadés (relatifs à `apps/web/public`)
  logoPath               String?  // ex: "/of-assets/{tenantId}/logo.png"
  signaturePedagoPath    String?  // signature responsable pédagogique
  signatureDirigeantPath String?  // signature dirigeant
  users                  User[]
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}
```

**Constraints & choix** :

- **Tous nullables** (`String?`) : impératif D-01 hybrid — `null` signale "fallback ENV". Si on met une valeur par défaut, la première lecture ferait croire que c'est saisi alors que c'est juste l'ENV.
- **Exception `invoicePrefix`** : `@default("FAC")` — pas d'ENV correspondante existante, valeur par défaut métier raisonnable, pas de confusion.
- **`legalForm` String libre vs enum** : enum `LegalForm` Prisma EXISTE déjà (L172-184 : SAS/SARL/SASU/EURL/SA/EI/EIRL/AUTO_ENTREPRENEUR/ASSOCIATION/PARTICULIER/AUTRE) et est utilisé sur `Organization.legalForm`. **Recommandation** : **réutiliser `LegalForm` enum** pour cohérence avec `Organization` — typage strict côté Prisma, UI = `<select>` au lieu de texte libre. CONTEXT.md D-02 dit "string libre" mais c'est probablement par méconnaissance de l'enum existant — proposer enum au planner.
- **`legalMentions` `@db.Text`** : texte long (mentions légales OF peuvent faire 200-500 mots) — `@db.Text` au lieu de `String` par défaut (qui mappe varchar Postgres).
- **`updatedAt`** : ajouter `@updatedAt` (absent aujourd'hui, utile pour audit).
- **Pas d'unique constraint sur `iban`** : 1 seul tenant, pas pertinent. Pas de unique sur `invoicePrefix` non plus.
- **Pas de versioning historique** : `AuditLog.diff` couvre l'historique des changements (D-09).

**Migration Prisma** : ~10 colonnes ajoutées, toutes nullables → migration safe sans data backfill. Commande : `pnpm --filter @qualiof/db db:migrate dev --name phase-07-tenant-settings`.

**Confidence:** HIGH — schéma actuel lu directement, conventions Prisma vérifiées (LegalForm enum + pattern `@db.Text` cohérent avec `Person.diplomas` String texte libre).

### Finding 2 — `of-config.ts` refactor strategy (Q2)

**Current state** (`apps/web/src/lib/of-config.ts`) :
- `getOfConfig()` est **synchrone**, lit uniquement `process.env.OF_*`, retourne `OfConfig`.
- **12 call sites** identifiés (grep `getOfConfig`) :
  - `apps/web/src/server/actions/agefice-generator.ts:173`
  - `apps/web/src/server/actions/convention-generator.ts:79`
  - `apps/web/src/server/actions/dossier-reminder.ts:93`
  - `apps/web/src/lib/of-paged-footer.ts:65`
  - `apps/web/src/lib/preinscription-reminder-template.ts:36`
  - `apps/web/src/lib/convention-template.ts:183`
  - `apps/web/src/lib/programme-template.ts:323`
  - `apps/web/src/lib/of-pdf-footer.ts:28`
  - `apps/web/src/lib/closure/certificat-template.ts:25`
  - `apps/web/src/lib/closure/shared-template.ts:425, 511`
  - `apps/web/src/lib/closure/attestation-template.ts:25`
- **Bypass critique** : `apps/web/src/server/actions/invoices.ts:11-22` n'utilise PAS `getOfConfig()` mais redéclare un objet `OF` qui lit directement `process.env.OF_*`. Phase 7 doit fixer ce drift.

**3 options évaluées** :

| Option | Description | Pour | Contre |
|--------|-------------|------|--------|
| A. `getOfConfig(tenantId)` async | Pure async, ajout `await` partout | Pattern propre | Toucher 13 fichiers (12 + invoices.ts), templates sync deviennent async → cascade risquée |
| B. **Pre-resolve once par génération PDF** (RECOMMANDÉ) | Server Action / Worker fait `const of = await loadOfConfig(tenantId)` puis passe `of` aux templates | Templates restent sync, refactor minimal, perfs OK (1 lecture BDD par PDF — déjà ce qui se passe avec env) | Templates doivent prendre `of` en paramètre au lieu d'appeler `getOfConfig()` → modif signature |
| C. Cache module-scope par tenant | Hash map global `Map<tenantId, OfConfig>` rempli au boot | Templates restent sync | Invalidation cache au save = tricky, RSC contexte unclear |

**Recommandation : Option B (pre-resolve)**, avec migration progressive :

```ts
// of-config.ts — NEW
export async function loadOfConfig(tenantId: string): Promise<OfConfig> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return resolveOfConfig(tenant); // helper pur : BDD value || env fallback
}

// Conserve aussi getOfConfig() sync pour backward-compat (utilisé uniquement par
// of-paged-footer.ts au boot — pas de tenantId disponible dans ce contexte)
export function getOfConfig(): OfConfig {
  return resolveOfConfig(null); // tenant null → tous les champs en fallback ENV
}
```

Puis migration progressive des 13 call sites : chaque server action qui dispose de `user.tenantId` (via `validateRequest()`) appelle `loadOfConfig(user.tenantId)` au lieu de `getOfConfig()` et passe `of` au template. **Faisable en 1 wave dédié dans le plan**.

**Note Finding 5** : `invoices.ts` est déjà cassé (n'utilise pas `getOfConfig`) — réparer ici sans hack supplémentaire.

**Confidence:** HIGH — call sites énumérés exhaustivement par grep, pattern de pre-resolve cohérent avec `data` paramètres déjà présents dans tous les templates (`renderInvoiceHtml(data)`, etc.).

### Finding 3 — Asset loading pattern (logo + signatures) (Q3)

**Current state** :

`shared-template.ts` L30-48 :
```ts
function loadAssetDataUrl(filenames: string[]): string {
  const cacheKey = filenames.join('|');
  const cached = fileCache.get(cacheKey);
  if (cached !== undefined) return cached;
  for (const name of filenames) {
    try {
      const p = path.join(process.cwd(), 'src', 'assets', name);
      const buf = fs.readFileSync(p);
      // ... data:URL
    } catch { /* try next */ }
  }
}
```

**Problème** : 3 call sites distincts ont leur propre logo loader :
1. `closure/shared-template.ts` — `loadLogoColorDataUrl`, `loadLogoWhiteDataUrl`, `loadSignatureDataUrl` (cascade liste de fallback noms de fichiers)
2. `programme-template.ts:63-73` — `logoCache` local, charge `logo-start-academy.png` directement
3. `convention-template.ts:59-69` — pareil, autre `logoCache` local

**Proposed extension** :

```ts
// shared-template.ts — NEW signature
function loadAssetDataUrl(filenames: string[], tenantId?: string): string {
  // Build cache key including tenant scope
  const cacheKey = `${tenantId ?? '_default'}::${filenames.join('|')}`;
  const cached = fileCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Priority 1: tenant-uploaded asset in public/of-assets/{tenantId}/
  if (tenantId) {
    for (const name of filenames) {
      try {
        const p = path.join(process.cwd(), 'public', 'of-assets', tenantId, name);
        const buf = fs.readFileSync(p);
        const ext = path.extname(name).slice(1) || 'png';
        const url = `data:image/${ext};base64,${buf.toString('base64')}`;
        fileCache.set(cacheKey, url);
        return url;
      } catch { /* try fallback */ }
    }
  }

  // Priority 2: bundled asset in src/assets/ (existing behavior)
  for (const name of filenames) {
    try {
      const p = path.join(process.cwd(), 'src', 'assets', name);
      const buf = fs.readFileSync(p);
      // ... existing logic
    } catch { /* try next */ }
  }
  fileCache.set(cacheKey, '');
  return '';
}

// Wrappers receive optional tenantId
export function loadLogoColorDataUrl(tenantId?: string): string {
  return loadAssetDataUrl(['logo.png', 'logo.jpg', 'logo.svg', 'logo-start-academy.png'], tenantId);
}
export function loadSignatureDataUrl(tenantId?: string, role: 'pedago' | 'dirigeant' = 'pedago'): string {
  const filename = role === 'pedago' ? 'signature-pedago.png' : 'signature-dirigeant.png';
  const fallbackList = role === 'pedago'
    ? [filename, 'signature-laurent.png', 'tampon-signature-fusion.png']
    : [filename, 'tampon-signature-fusion.png', 'tampon-signature.png'];
  return loadAssetDataUrl(fallbackList, tenantId);
}
```

**Important** : cache key doit inclure tenantId — sinon le 1er tenant pollue le 2e (multi-tenant futur). Pour Start Academy mono-tenant aujourd'hui c'est sans impact, mais c'est gratuit à faire bien.

**Cascade `programme-template.ts` + `convention-template.ts`** : remplacer leur `logoCache` local par import de `loadLogoColorDataUrl(tenantId)` depuis `shared-template.ts`. Cela centralise la logique et fait que l'édition UI logo affecte aussi programme + convention. **Sans cette refacto, l'upload UI ne servirait que les docs closure**.

**Confidence:** HIGH — pattern simple, fs-existant, le seul risque (filesystem write durant build serverless) n'existe pas ici (déploiement local Mac, `pnpm dev:full`).

### Finding 4 — Upload UX en Server Actions (Q4)

**Pattern existant validé** dans `apps/web/src/server/actions/upload-apprenant-docs.ts` :

```ts
export async function uploadApprenantDocs(formData: FormData): Promise<UploadApprenantDocsResult> {
  const { user } = await validateRequest();
  // ...
  for (const kind of ['CNI', 'RIB', 'CFP'] as const) {
    const f = formData.get(kind);
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return { ok: false, error: `${kind} dépasse ${MAX_FILE_SIZE_MB} Mo` };
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    // → MinIO upload via storage.ts
  }
}
```

**Adaptation Phase 7** :

```ts
// server/actions/tenant-assets.ts
'use server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateRequest } from '@/lib/auth';
import { prisma } from '@qualiof/db';

const MAX_LOGO_MB = 5;
const MAX_SIGNATURE_MB = 2;
const ALLOWED_LOGO = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
const ALLOWED_SIGNATURE = new Set(['image/png', 'image/jpeg']);

export async function uploadTenantLogo(formData: FormData): Promise<{ ok: boolean; path?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const f = formData.get('file');
  if (!(f instanceof File) || f.size === 0) return { ok: false, error: 'Aucun fichier' };
  if (f.size > MAX_LOGO_MB * 1024 * 1024) return { ok: false, error: `Logo > ${MAX_LOGO_MB} Mo` };
  if (!ALLOWED_LOGO.has(f.type)) return { ok: false, error: 'Format autorisé : PNG, JPG, SVG' };

  const ext = f.type === 'image/svg+xml' ? 'svg' : f.type === 'image/jpeg' ? 'jpg' : 'png';
  const dir = path.join(process.cwd(), 'public', 'of-assets', user.tenantId);
  await fs.mkdir(dir, { recursive: true });

  const filename = `logo.${ext}`;
  const buffer = Buffer.from(await f.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  const publicPath = `/of-assets/${user.tenantId}/${filename}`;
  // ... update Tenant.logoPath + AuditLog
  return { ok: true, path: publicPath };
}
```

**Différences vs `upload-apprenant-docs.ts`** :
- Destination = filesystem `public/` (PAS MinIO). Justifié : assets OF ne sont PAS de la PII RGPD, doivent être servis statiquement par Next.js (URLs publiques), et ne changent quasi jamais.
- Validation type MIME stricte (3 formats pour logo, 2 pour signatures).
- Création directory récursive (`mkdir { recursive: true }`) au premier upload.
- Side effect : update `Tenant.{logoPath|signaturePedagoPath|signatureDirigeantPath}` + AuditLog.

**Caveat important** :
- `public/of-assets/` doit être **ajouté au `.gitignore`** (les uploads ne doivent pas polluer git).
- Le cache `fileCache` de `shared-template.ts` est en mémoire process — un upload UI ne le purge pas tant que le process Next n'a pas redémarré. **Solution** : soit lever `revalidatePath` insuffisant (cache fs en mémoire, pas Next cache), soit ajouter une invalidation explicite `fileCache.delete(...)` exportée depuis `shared-template.ts` et appelée par l'upload action. **Recommandation : exporter `invalidateAssetCache(tenantId)` et l'appeler depuis l'upload action.**

**Form integration côté client** :
```tsx
'use client';
function LogoUploader({ currentPath }) {
  return (
    <form action={uploadTenantLogo}>
      <input type="file" name="file" accept="image/png,image/jpeg,image/svg+xml" />
      <button type="submit">Téléverser</button>
    </form>
  );
}
```

**Confidence:** HIGH — pattern Next.js 14 standard documenté, déjà utilisé dans le projet pour upload apprenant docs.

### Finding 5 — Invoice numbering (Q5) — SURPRISE

**Le code est déjà implémenté** dans `apps/web/src/server/actions/invoices.ts:25-36` :

```ts
async function nextInvoiceNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const last = await tx.invoice.findFirst({
    where: { tenantId, number: { startsWith: 'FAC-' } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const n = last ? parseInt(last.number.replace('FAC-', ''), 10) || 0 : 0;
  return `FAC-${String(n + 1).padStart(6, '0')}`;
}
```

- Numéro = `FAC-NNNNNN` (**6 chiffres**, pas 4 comme indiqué CONTEXT.md D-06).
- Atomicité : appelé dans `prisma.$transaction(async (tx) => ...)` ligne 70.
- Préfixe **hardcodé** `'FAC-'` — pas configurable.

**Pattern session continu** (`sessions-create.ts:27-37`, **utilisé en parallèle** d'un autre pattern par-année `sessions.ts:267-274`) :

```ts
async function nextSessionCode(tenantId: string): Promise<string> {
  const last = await prisma.trainingSession.findFirst({
    where: { tenantId, code: { startsWith: 'SES-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const lastNum = last ? parseInt(last.code.replace('SES-', ''), 10) || 0 : 0;
  const next = lastNum + 1;
  return `SES-${String(next).padStart(4, '0')}`;
}
```

**Arbitrage 4 vs 6 chiffres** : CONTEXT.md D-06 dit "FAC-XXXX" (4 chiffres) "comme SES-0089". Mais le code actuel est sur 6. Et Start Academy peut faire 100 factures/an → après 30 ans = 3000 factures, large dans 4 chiffres mais marge confortable dans 6.

**Recommandation au planner** : **garder 6 chiffres** (le code existant et la migration consisterait à zero-padder les numéros existants — risque pour rien). Documenter dans CONTEXT.md que "FAC-XXXX" est une notation générique mais l'implémentation est sur 6 digits. **À valider avec Laurent** dans une question discutée au planning.

**Travail Phase 7 sur la numérotation** :
1. Rendre le préfixe configurable : lire `Tenant.invoicePrefix ?? 'FAC'` au lieu de hardcoder.
2. Helper réutilisable : extraire `nextInvoiceNumber` dans `apps/web/src/lib/numbering.ts` (utilisable Phase 11 si besoin de l'avancer).
3. Le préfixe affiché dans Paramètres + champ texte éditable + warning si la valeur change après émission de factures ("Attention : numérotation déjà commencée avec préfixe FAC, changer maintenant produira une discontinuité dans les numéros affichés").

**Phase 7 scope strict** : ajouter `Tenant.invoicePrefix` + UI dans Paramètres + refactor `nextInvoiceNumber` pour lire le préfixe. Le reste = Phase 11 (FACT-01, FACT-02).

**Confidence:** HIGH — code lu directement, deux patterns SES (4 digits / per-year) coexistent et confirment qu'il n'y a pas de cohérence stricte recherchée.

### Finding 6 — AuditLog usage pattern (Q6) — SURPRISE

**Schéma** (`packages/db/prisma/schema.prisma:989-1004`) :

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  tenantId  String
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  entity    String
  entityId  String
  action    String
  diff      Json
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  @@index([tenantId, entity, entityId])
  @@index([tenantId, createdAt])
}
```

**Usage actuel : ZÉRO** — `grep -rn "auditLog.create\|AuditLog"` dans `apps/web/src` retourne aucune création. Le modèle existe en BDD mais n'est jamais invoqué. Phase 7 sera la **première instanciation réelle d'AuditLog** dans le projet (cohérent avec REQUIREMENTS RBAC-05 qui prévoit l'UI Phase 8).

**Proposed pattern** (helper réutilisable) :

```ts
// apps/web/src/server/actions/tenant-settings.ts
import { prisma } from '@qualiof/db';

type Diff = Record<string, { before: unknown; after: unknown }>;

async function logTenantSettingsChange(opts: {
  tenantId: string;
  userId: string;
  diff: Diff;
  ip?: string;
  userAgent?: string;
}) {
  if (Object.keys(opts.diff).length === 0) return; // no-op si rien n'a changé
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      entity: 'Tenant',
      entityId: opts.tenantId,
      action: 'parameters.update',
      diff: opts.diff,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
}

// Computation du diff côté serveur (after Prisma update)
function computeDiff<T extends Record<string, unknown>>(before: T, after: T): Diff {
  const diff: Diff = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      diff[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return diff;
}
```

**Conventions d'`action`** à adopter :
- `parameters.update` — édition identité OF / adresse / RIB / email / numérotation
- `parameters.upload.logo` — upload logo
- `parameters.upload.signature.pedago` — upload signature pédago
- `parameters.upload.signature.dirigeant` — upload signature dirigeant
- `parameters.reset.logo` — restauration logo par défaut (D-04 : "Restaurer logo par défaut")

**IP / userAgent** : pas immédiatement nécessaire en Phase 7 (1 admin = Laurent, déploiement local) mais le schéma le supporte → laisser `null` pour l'instant, mentionner dans la dette technique pour Phase 8 RBAC.

**Confidence:** HIGH — schéma lu directement, premier usage donc on définit la convention pour les phases suivantes.

### Finding 7 — Validation approach Zod (Q7)

**Helpers existants réutilisables** :

| Helper | Path | Réutilisation Phase 7 |
|--------|------|----------------------|
| `isValidSiret(s)` | `packages/shared/src/helpers/siret.ts` | Validation SIRET Tenant (`.refine((s) => !s || isValidSiret(s))`) |
| `LegalForm` enum | `packages/db/prisma/schema.prisma:172-184` | `z.nativeEnum(LegalForm)` pour le champ forme juridique |
| `addressSchema` | `packages/shared/src/schemas/address.ts` | Réutiliser tel quel pour `Tenant.address` Json |
| Pattern `.email().or(z.literal(''))` | `packages/shared/src/schemas/organization.ts:19` | Pour `emailFrom` (nullable + empty string OK) |

**Schemas à créer** (`packages/shared/src/schemas/tenant.ts`, nouveau) :

```ts
import { z } from 'zod';
import { LegalForm } from '@qualiof/db';
import { addressSchema } from './address';
import { isValidSiret } from '../helpers/siret';

// IBAN France : FR + 2 chiffres clé + 23 caractères alphanumériques
// Format affiché souvent avec espaces : "FR76 1234 5678 90AB CDEF GHIJ K12"
const IBAN_FR_REGEX = /^FR\d{2}[A-Z0-9]{23}$/;

// BIC : 8 ou 11 caractères
const BIC_REGEX = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

function cleanIban(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '').toUpperCase();
}

export const tenantIdentitySchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  siret: z.string().nullable().optional()
    .refine((s) => !s || isValidSiret(s), { message: 'SIRET invalide (14 chiffres + clé Luhn)' }),
  numDA: z.string().nullable().optional(),
  rcs: z.string().nullable().optional(),
  legalForm: z.nativeEnum(LegalForm).nullable().optional(),
});

export const tenantAddressSchema = z.object({
  address: addressSchema.nullable().optional(),
  legalMentions: z.string().max(2000).nullable().optional(),
});

export const tenantBillingSchema = z.object({
  invoicePrefix: z.string().regex(/^[A-Z]{2,5}$/, '2 à 5 lettres majuscules (ex: FAC)').default('FAC'),
  iban: z.string().nullable().optional()
    .transform((s) => s ? cleanIban(s) : null)
    .refine((s) => !s || IBAN_FR_REGEX.test(s), { message: 'IBAN FR invalide (FR + 2 + 23 caractères)' }),
  bic: z.string().nullable().optional()
    .transform((s) => s?.toUpperCase() ?? null)
    .refine((s) => !s || BIC_REGEX.test(s), { message: 'BIC invalide (8 ou 11 caractères)' }),
  emailFrom: z.string().email('Email invalide').nullable().optional()
    .or(z.literal('')),
});

export type TenantIdentityInput = z.infer<typeof tenantIdentitySchema>;
export type TenantAddressInput = z.infer<typeof tenantAddressSchema>;
export type TenantBillingInput = z.infer<typeof tenantBillingSchema>;
```

**Notes** :
- IBAN regex **basique** (D-07) — ne fait pas la validation modulo-97 ISO 13616. Suffisant car Laurent met "une fois et c'est ok" (D-07 Q4). Si une vraie validation modulo s'avère utile plus tard, ajouter helper `isValidIban` dans `packages/shared/src/helpers/iban.ts`.
- Pas de Zod pour les uploads (FormData traité directement dans la server action — validation MIME type / taille en code impératif, plus naturel).
- `LegalForm` enum réutilisé = cohérence avec `Organization.legalForm`.

**Confidence:** HIGH — helpers et patterns Zod déjà éprouvés dans `packages/shared/src/schemas/organization.ts`.

### Finding 8 — Page layout (Q8)

**Page actuelle** (`apps/web/src/app/app/parametres/page.tsx`) :
- `<PageHeader title="Paramètres" />` + grid `grid-cols-1 lg:grid-cols-2 gap-6`
- 4 sections : Organisme (read-only `dl/dt/dd`), Utilisateurs (placeholder), OPCO référencés (liste), Référentiel docs Qualiopi (table).
- 1 fichier, 126 lignes.

**Pattern Phase 5 fiche apprenant** (édition inline par section) : chaque carte affiche les valeurs read-only par défaut, un bouton "Modifier" la bascule en mode édition (formulaire react-hook-form), boutons "Enregistrer" / "Annuler" en bas.

**Options layout** :

| Layout | Pour | Contre |
|--------|------|--------|
| A. **Sections empilées, édition inline** (RECOMMANDÉ) | Cohérent avec fiche apprenant Phase 5, scroll naturel, pas de navigation cachée, scan rapide de tous les champs | Page peut devenir longue (~6 sections) |
| B. Tabs (Identité / Adresse / Logo&signatures / Facturation / Email / OPCO&Docs) | Compact, moins de scroll | Casse pattern projet, oblige tab-switching pour vue d'ensemble |
| C. Accordion | Compact + tout visible | Pas de pattern existant dans le projet |

**Recommandation A** (sections empilées + édition inline). Sections proposées :

1. **Organisme — Identité légale** (Building2) : `name`, `siret`, `numDA`, `rcs`, `legalForm` → SET-01
2. **Adresse & mentions légales** (MapPin) : `address` (street/cp/ville), `legalMentions` → SET-02 (texte)
3. **Logo & signatures** (Image) : 3 zones d'upload (logo, signature pédago, signature dirigeant), thumbnail + "Remplacer" + "Restaurer par défaut" → SET-02 (assets)
4. **Numérotation factures** (Hash) : `invoicePrefix` + preview "Le prochain numéro sera : FAC-000042" → SET-03
5. **Coordonnées bancaires** (CreditCard) : `iban`, `bic` → SET-03
6. **Email expéditeur** (Mail) : `emailFrom` + info "Le mot de passe SMTP est géré dans la config serveur" → SET-03
7. **Utilisateurs** (Users) : conserver placeholder "Disponible Phase 8" (existe déjà)
8. **OPCO référencés** (Sparkles) : conserver tel quel (read-only)
9. **Référentiel documents Qualiopi** (Settings) : conserver tel quel (read-only)

**Component structure proposé** :

```
apps/web/src/components/settings/
├── settings-section.tsx       // wrapper card édition inline (read mode ↔ edit mode)
├── of-identity-form.tsx        // section 1 (SET-01)
├── of-address-form.tsx         // section 2 (SET-02 texte)
├── of-assets-form.tsx          // section 3 (SET-02 uploads)
├── of-invoicing-form.tsx       // section 4 (SET-03 numérotation)
├── of-banking-form.tsx         // section 5 (SET-03 RIB)
└── of-email-form.tsx           // section 6 (SET-03 email)
```

**Edge cases UI** :
- IBAN affichage formaté avec espaces tous les 4 chars en read mode (lisibilité) — `formatIban(s)` helper.
- Champ "à renseigner" italique muted quand `null` (déjà fait dans la version read-only) — conserver.
- Toast `sonner` après chaque enregistrement (pattern Phase 4+).
- Confirmation `<AlertDialog>` avant "Restaurer logo par défaut" (action destructive, supprime le fichier upload sur le disque + reset `Tenant.logoPath = null`).

**Confidence:** HIGH — pattern édition inline directement réutilisable depuis Phase 5.

### Finding 9 — Validation Architecture pour Nyquist VALIDATION.md (Q9) — voir section dédiée

Voir ## Validation Architecture ci-dessous.

## Code Examples

### Pattern Server Action avec AuditLog + diff (verified pattern)

```ts
// apps/web/src/server/actions/tenant-settings.ts
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { tenantIdentitySchema, type TenantIdentityInput } from '@qualiof/shared/schemas/tenant';

export async function updateTenantIdentity(
  input: TenantIdentityInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const parsed = tenantIdentitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Validation échouée', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { name: true, siret: true, numDA: true, rcs: true, legalForm: true },
  });
  if (!before) return { ok: false, error: 'Tenant introuvable' };

  const after = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: parsed.data,
    select: { name: true, siret: true, numDA: true, rcs: true, legalForm: true },
  });

  // AuditLog diff
  const diff = computeDiff(before, after);
  if (Object.keys(diff).length > 0) {
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'Tenant',
        entityId: user.tenantId,
        action: 'parameters.update',
        diff,
      },
    });
  }

  revalidatePath('/app/parametres');
  return { ok: true };
}
```

### Pattern `loadOfConfig` async avec fallback ENV (proposed)

```ts
// apps/web/src/lib/of-config.ts (refactored)
import { prisma } from '@qualiof/db';

function pick(bdd: string | null | undefined, envKey: string, fallback = ''): string {
  if (bdd && bdd.trim()) return bdd.trim();
  return (process.env[envKey] ?? '').trim() || fallback;
}

export async function loadOfConfig(tenantId: string): Promise<OfConfig> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return resolveOfConfig(t);
}

function resolveOfConfig(t: Tenant | null): OfConfig {
  const address = (t?.address as Record<string, string> | null) ?? null;
  return {
    name: pick(t?.name, 'OF_NAME', 'Start Academy'),
    siret: pick(t?.siret, 'OF_SIRET'),
    rnq: pick(t?.numDA, 'OF_RNQ'),
    addressStreet: pick(address?.street, 'OF_ADDRESS_STREET'),
    // … etc
    iban: pick(t?.iban, 'OF_IBAN'),
    bic: pick(t?.bic, 'OF_BIC'),
    emailFrom: pick(t?.emailFrom, 'OF_EMAIL'),
    // resp / contact : ENV-only pour l'instant (pas de Tenant.respNom)
    // → potentielle dette future si Laurent veut éditer ces champs depuis UI
  };
}

export function getOfConfig(): OfConfig {
  return resolveOfConfig(null); // tous ENV
}
```

## Runtime State Inventory

Phase 7 = brownfield refactor d'une page read-only + extension de schéma Prisma + introduction de filesystem assets. Runtime state à inventorier :

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `Tenant` row existante en BDD (1 row, `tenantId` de Start Academy) — colonnes existantes `name/siret/numDA/rcs/address` actuellement null si jamais saisies | Migration Prisma ajoute colonnes nullables → AUCUNE migration de data (D-01 hybrid BDD-fallback-ENV) |
| Live service config | **None** — pas de service externe (Datadog, Tailscale, etc.) qui référence `Tenant.*` | None |
| OS-registered state | **None** — pas de pm2 / launchd qui dépend de ces champs | None |
| Secrets/env vars | `OF_NAME`, `OF_SIRET`, `OF_RNQ`, `OF_ADDRESS_*`, `OF_PHONE`, `OF_EMAIL`, `OF_TVA_INTRA`, `OF_IBAN`, `OF_BIC`, `OF_RESP_*`, `OF_CONTACT_*` (cf. `of-config.ts` L11-91). `SMTP_PASSWORD` reste ENV-only (D-08) | **GARDER toutes les ENV vars** — c'est le fallback de D-01. Documenter dans `.env.example` que ces ENV sont désormais fallback secondaire (BDD prend le pas si saisi via UI Paramètres) |
| Build artifacts | `apps/web/.next/` cache (Next.js) — pas impacté car nouvelle route /app/parametres, juste recompilée | None — un `rm -rf .next` automatique de `pnpm dev:full` (memory: dev:full doit toujours auto-clean .next) couvre ça |
| Filesystem (NEW) | **`apps/web/public/` n'existe PAS aujourd'hui** (vérifié par `ls apps/web/`). Phase 7 va créer `public/of-assets/{tenantId}/` à chaque upload | **(1) Ajouter `apps/web/public/of-assets/` dans `.gitignore`** (uploads runtime). **(2) Si Next.js plante en build car `public/` manquante** : créer un `.gitkeep` dans `apps/web/public/` pour matérialiser le dossier (sinon `process.cwd() + '/public'` peut renvoyer vide). **(3) Cache asset `fileCache` Map en mémoire** : invalidation explicite nécessaire après upload (cf. Finding 4) |

**Canonical question:** Après mise à jour du schéma Tenant + nouvelles colonnes, quels systèmes ont l'ancien shape en cache ? Réponse : **uniquement `apps/web/.next/` build cache**. Solution : `pnpm --filter @qualiof/db db:generate` après migration + redémarrage `pnpm dev:full` (auto-clean .next).

## Common Pitfalls

### Pitfall 1 — Cache `fileCache` Map non-purgé après upload
**What goes wrong:** Laurent upload un nouveau logo via UI → `Tenant.logoPath` mis à jour, fichier écrit dans `public/of-assets/{tenantId}/logo.png`. Mais le PDF généré juste après affiche encore l'ancien logo car `loadAssetDataUrl` retourne la valeur cachée en mémoire process.
**Why it happens:** `fileCache = new Map<string, string>()` est en scope module, jamais invalidé.
**How to avoid:** Exporter `invalidateAssetCache(tenantId)` depuis `shared-template.ts` et l'appeler depuis les server actions d'upload/reset.
**Warning signs:** Test manuel "upload + génère un PDF" affiche l'ancien asset jusqu'à redémarrage du serveur Next.

### Pitfall 2 — `revalidatePath` ne flushe PAS le cache fs en mémoire
**What goes wrong:** Le développeur croit que `revalidatePath('/app/parametres')` suffit après l'upload. Ça invalide la page RSC, pas le cache module `fileCache` ni l'image dans `<img src="/of-assets/...">` côté browser (cache HTTP).
**Why it happens:** Confusion entre Next.js cache et caches de niveau application.
**How to avoid:** Trois invalidations à orchestrer après upload : (1) `invalidateAssetCache(tenantId)` (memory), (2) `revalidatePath('/app/parametres')` (RSC), (3) URL versionnée pour `<img>` : `src="/of-assets/{tenantId}/logo.png?v={Date.now()}"` ou `?v={tenant.updatedAt.toISOString()}` (cache HTTP browser).
**Warning signs:** Browser affiche la vieille image après upload même après hard refresh — symptôme du cache HTTP.

### Pitfall 3 — Drift `invoices.ts` qui bypasse `getOfConfig()`
**What goes wrong:** Laurent met à jour `Tenant.iban` via UI → toutes les nouvelles factures continuent d'afficher l'IBAN ENV car `invoices.ts:11-22` re-déclare `const OF = { iban: process.env.OF_IBAN ?? null, ... }`.
**Why it happens:** Refactor incomplet pendant la migration de `getOfConfig` async.
**How to avoid:** Au passage Plan 1 (refactor `getOfConfig`), **explicitement** chasser le drift `invoices.ts:11-22` (et tout autre `process.env.OF_*` direct outside `of-config.ts`).
**Warning signs:** `grep -rn "process.env.OF_" apps/web/src/` retourne autre chose que `of-config.ts`.

### Pitfall 4 — `Tenant.invoicePrefix` changé après émission factures
**What goes wrong:** Tenant a déjà émis `FAC-000042`, Laurent change le préfixe en `INV-` dans Paramètres → la prochaine facture sera `INV-000001`, créant une discontinuité.
**Why it happens:** `nextInvoiceNumber` cherche `where: { number: { startsWith: prefix } }` — changement de préfixe = reset implicite du compteur.
**How to avoid:** Avant de sauvegarder `invoicePrefix`, vérifier `prisma.invoice.count({ where: { tenantId } })` > 0 → afficher AlertDialog "Vous avez déjà X factures avec le préfixe Y. Changer maintenant créera une discontinuité. Continuer ?".
**Warning signs:** Comptabilité Laurent voit deux séquences mélangées.

### Pitfall 5 — Validation IBAN trop permissive ou trop stricte
**What goes wrong:** Soit la regex laisse passer "FRABC" et la facture sort cassée. Soit elle est trop stricte (modulo 97 ISO) et rejette un IBAN valide tapé avec espaces "FR76 1234 …".
**Why it happens:** IBAN spec complexe, espaces fréquents dans la copie depuis un RIB.
**How to avoid:** Toujours `.transform((s) => cleanIban(s))` AVANT le `.refine` regex. Garder regex simple format-only (D-07 explicite). Documenter dans le tooltip UI : "Format : FR + 2 chiffres + 23 caractères, espaces autorisés à la saisie".
**Warning signs:** Laurent copie-colle son IBAN bancaire et la validation échoue.

### Pitfall 6 — Upload SVG dangerous (XSS si servi inline)
**What goes wrong:** Un SVG peut contenir `<script>` qui s'exécute si embed via `<img src>` sur navigateur ancien, ou pire si embed via `<object>` ou inline.
**Why it happens:** SVG = format XML actif.
**How to avoid:** Pour l'instant (Start Academy interne, Laurent contrôle tout), accepter SVG est un risque acceptable. **Recommandation conservative** : limiter le logo à PNG + JPG en Phase 7, ajouter SVG en deferred si Laurent demande explicitement. CONTEXT.md D-04 dit "PNG/JPG/SVG" → on garde SVG mais on **sanitize** avec une regex stripping `<script>` au minimum, et on **sert toujours via `<img>`** jamais `<object>`/`<embed>`/inline.
**Warning signs:** Audit sécurité futur flagge SVG accepté sans sanitize.

### Pitfall 7 — `public/` n'existe pas → `process.cwd() + '/public'` plante
**What goes wrong:** Premier upload → `fs.mkdir(path.join(process.cwd(), 'public', 'of-assets', tenantId), { recursive: true })` doit gracefully créer le dir entier, mais si `process.cwd()` est mal résolu (lancement worker en standalone) on écrit ailleurs.
**Why it happens:** `process.cwd()` dépend du contexte de lancement. Next dev = `apps/web/`. Worker BullMQ peut être lancé depuis monorepo root.
**How to avoid:** **(1)** Constante centralisée `WEB_PUBLIC_ROOT = path.join(process.cwd(), 'public')` dans `shared-template.ts` côté server action upload (qui tourne dans Next dev, donc `cwd = apps/web/`). **(2)** Pas d'upload depuis le worker BullMQ. **(3)** Créer `apps/web/public/.gitkeep` pour matérialiser le dossier en repo.
**Warning signs:** `ENOENT: no such file or directory, open '/.../public/of-assets/...'`.

## State of the Art

| Old Approach | Current Approach | Impact Phase 7 |
|--------------|------------------|----------------|
| Config OF hardcodée en ENV uniquement | Hybride BDD ⤳ ENV (D-01) | `of-config.ts` refactor avec `loadOfConfig(tenantId)` async + helper pre-resolve |
| Asset OF bundled `src/assets/` uniquement | Upload UI vers `public/of-assets/{tenantId}/` avec fallback bundled | `loadAssetDataUrl` étendu avec param tenantId optionnel |
| `invoices.ts` re-déclare OF localement | Source unique `loadOfConfig(tenantId)` | Drift à éliminer en Plan 1 |
| AuditLog table existante mais jamais utilisée | Première instanciation en Phase 7 | Convention `action` namespacée `parameters.*` à définir |

**Deprecated/outdated:**
- L'objet `OF = { ... process.env.OF_* }` dans `invoices.ts:11-22` doit être supprimé.
- Les `logoCache` locaux dans `programme-template.ts:63-73` et `convention-template.ts:59-69` doivent être remplacés par un appel à `loadLogoColorDataUrl(tenantId)` depuis `shared-template.ts`.

## Open Questions

1. **`legalForm` enum vs texte libre**
   - What we know: enum Prisma `LegalForm` existe et est utilisée sur `Organization`. CONTEXT.md D-02 dit "string libre".
   - What's unclear: Laurent veut-il pouvoir saisir n'importe quoi (ex: "Société coopérative et participative") ou se contenter de l'enum (SAS/SARL/EURL/…) ?
   - Recommendation: Proposer enum (cohérence projet, UI plus propre), ajouter `AUTRE` (déjà dans l'enum) avec champ texte conditionnel si choisi. À valider au planning.

2. **`FAC-XXXX` 4 vs 6 chiffres**
   - What we know: CONTEXT.md D-06 dit 4 chiffres. Code actuel `invoices.ts:35` fait 6 chiffres déjà déployé.
   - What's unclear: Aligner sur 4 (downgrade + zero-pad) ou garder 6 (statu quo) ?
   - Recommendation: Garder 6 (statu quo, marge confortable), corriger CONTEXT.md. À mentionner au plan-phase pour décision rapide.

3. **Champs `OF_RESP_*` et `OF_CONTACT_*` non-éditables UI ?**
   - What we know: CONTEXT.md scope = SIRET/numDA/RCS/forme juridique + adresse + logo + mentions + RIB + email expéditeur + numérotation. **Pas** les noms/civilités du responsable et contact OF.
   - What's unclear: Ces champs sont aujourd'hui en ENV (`OF_RESP_NOM`, `OF_RESP_TITRE`, etc.) et apparaissent dans les PDF (signatures). Si Laurent change ces ENV un jour il devra toucher au .env — pas conforme à l'esprit "tout éditable UI".
   - Recommendation: Hors scope Phase 7 (pas dans REQUIREMENTS SET-01/02/03), à mentionner dans Deferred si Laurent veut Phase ultérieure. Ne pas étendre Phase 7 sans validation.

4. **Stratégie de revalidation pour PDF en cours de génération**
   - What we know: BullMQ worker peut être en train de générer un PDF au moment où Laurent upload un nouveau logo.
   - What's unclear: Le job en cours utilise quel logo (l'ancien en cache mémoire ou le nouveau) ?
   - Recommendation: Acceptable que le job en cours conserve l'ancien (atomicité du job) — le job suivant utilisera le nouveau. Documenter ce comportement, pas besoin d'invalidation cross-process en Phase 7.

## Environment Availability

Phase 7 ne dépend pas de tools externes nouveaux. Toutes les dépendances sont déjà installées (cf. STACK.md).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >=20 | Server Actions, fs writes | ✓ | 20 (`.nvmrc`) | — |
| PostgreSQL | Prisma migration `Tenant` extension | ✓ (via docker-compose) | 16 | — |
| Prisma CLI | Migration generation | ✓ | 5.22.0 | — |
| Vitest | Tests Phase 7 (Zod schemas, validators) | ✓ | 2.1.8 | — |
| Zod | Schemas | ✓ | 3.23.8 | — |
| react-hook-form + zodResolver | Forms client | ✓ | 7.54.2 + 3.9.1 | — |
| sonner | Toasts confirmation save | ✓ | 2.0.7 | — |
| Lucide icons | Building2, MapPin, Image, Hash, CreditCard, Mail | ✓ | 0.471.0 | — |
| Radix Dialog / AlertDialog | Confirmation reset logo / changement préfixe facture | ✓ | dialog déjà utilisé Phase 2/4/5 | — |

**Missing dependencies with no fallback:** Aucune.
**Missing dependencies with fallback:** Aucune.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (env `node` par défaut sur `apps/web`) |
| Config file | `apps/web/vitest.config.ts` (existant), `packages/shared` aussi équipé |
| Quick run command | `pnpm --filter @qualiof/shared test -- src/schemas/__tests__/tenant.test.ts` |
| Full suite command | `pnpm test` (Turbo répercute sur `@qualiof/shared` + `@qualiof/web`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SET-01 | `tenantIdentitySchema` valide SIRET 14 digits + Luhn, rejette SIRET invalide, accepte `legalForm` LegalForm enum, accepte champs nullables | unit | `pnpm --filter @qualiof/shared test -- src/schemas/__tests__/tenant.test.ts` | ❌ Wave 0 |
| SET-02 (texte) | `tenantAddressSchema` accepte address Json shape + legalMentions max 2000 chars | unit | idem | ❌ Wave 0 |
| SET-02 (assets) | `uploadTenantLogo` validation taille (>5Mo refusé), MIME (PNG/JPG/SVG seulement) — server action testée avec FormData mock | unit | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/tenant-assets.test.ts` | ❌ Wave 0 |
| SET-03 (numérotation) | `nextInvoiceNumber` retourne `FAC-NNNNNN` correct avec préfixe configurable (test transaction mock) | unit | `pnpm --filter @qualiof/web test -- src/lib/__tests__/numbering.test.ts` | ❌ Wave 0 |
| SET-03 (RIB) | `tenantBillingSchema` valide IBAN FR avec/sans espaces, rejette IBAN tronqué, BIC 8 et 11 chars OK | unit | `pnpm --filter @qualiof/shared test -- src/schemas/__tests__/tenant.test.ts` | ❌ Wave 0 |
| SET-03 (email) | `emailFrom` valide email standard, accepte null + empty string | unit | idem | ❌ Wave 0 |
| D-01 hybrid BDD/ENV | `loadOfConfig` retourne BDD value si présente, ENV fallback sinon, pour chaque champ | unit (avec Prisma mock) | `pnpm --filter @qualiof/web test -- src/lib/__tests__/of-config.test.ts` | ❌ Wave 0 |
| D-04 logo fallback | `loadAssetDataUrl` retourne tenant asset si présent, fallback bundled sinon (test avec fixtures fs) | unit | `pnpm --filter @qualiof/web test -- src/lib/closure/__tests__/shared-template.test.ts` | ❌ Wave 0 |
| D-09 AuditLog | `updateTenantIdentity` crée bien une row AuditLog avec diff par champ modifié, no-op si rien n'a changé | unit (avec Prisma mock) | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/tenant-settings.test.ts` | ❌ Wave 0 |
| Smoke page | `/app/parametres` page compile et rend les 6 sections + ne casse pas le pattern lucide-react imports (cf. test BUG-01) | smoke | `pnpm --filter @qualiof/web test -- src/app/app/parametres/__tests__/page.smoke.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @qualiof/shared test` (rapide, ~2s, schémas tenant) + `pnpm --filter @qualiof/web test --reporter=verbose -- tenant` (cible Phase 7).
- **Per wave merge:** `pnpm test` (full Turbo suite, < 30s).
- **Phase gate:** `pnpm test` green + `pnpm --filter @qualiof/web build` green avant `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `packages/shared/src/schemas/tenant.ts` — schémas Zod tenantIdentity/Address/Billing
- [ ] `packages/shared/src/schemas/__tests__/tenant.test.ts` — couvre SET-01/02/03 validation
- [ ] `apps/web/src/lib/numbering.ts` — extraction `nextInvoiceNumber` helper réutilisable
- [ ] `apps/web/src/lib/__tests__/numbering.test.ts` — couvre numérotation avec préfixe configurable
- [ ] `apps/web/src/lib/__tests__/of-config.test.ts` — couvre `loadOfConfig` hybrid BDD/ENV
- [ ] `apps/web/src/lib/closure/__tests__/shared-template.test.ts` — couvre `loadAssetDataUrl` extension tenantId
- [ ] `apps/web/src/server/actions/__tests__/tenant-settings.test.ts` — couvre AuditLog diff + Zod validation côté server
- [ ] `apps/web/src/server/actions/__tests__/tenant-assets.test.ts` — couvre upload validation (taille / MIME)
- [ ] `apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts` — smoke test imports lucide (ancrage régression style BUG-01)

**Manual-only verifications** (non-automatisables sans Playwright, ajouter à VALIDATION.md mais hors Vitest) :
- Upload logo end-to-end via UI puis génération PDF programme (vérifier que le nouveau logo apparaît).
- Modification IBAN puis génération facture (vérifier IBAN sur PDF).
- AlertDialog discontinuité numérotation factures si on change préfixe après émission.
- Restauration logo par défaut (suppression fichier upload).

## Recommendations

### Proposed Plan Breakdown

**5 plans, séquentiels avec parallélisation possible 3+4** :

```
Plan 07-01 : Migration + Refactor of-config (BLOCKING)
   └─ Plan 07-02 : Server Actions + Zod + AuditLog wiring (BLOCKING)
         ├─ Plan 07-03 : Upload assets + extension loadAssetDataUrl  ─┐
         └─ Plan 07-04 : UI page Paramètres édition inline           ─┴── peuvent être en parallèle
                                                                      └─ Plan 07-05 : Bookkeeping
```

### Plan 07-01 — Migration Prisma + refactor `of-config.ts`

**Dépendances:** Aucune
**Files touched (~10) :**
- `packages/db/prisma/schema.prisma` : étendre `Tenant` (10 colonnes)
- `packages/db/prisma/migrations/202605xx_phase07_tenant_settings/migration.sql` (auto-généré)
- `apps/web/src/lib/of-config.ts` : refactor avec `loadOfConfig(tenantId)` async + helper `resolveOfConfig` pur
- 12 call sites de `getOfConfig()` → migration progressive vers `loadOfConfig(user.tenantId)` + passage `of` en paramètre des templates (dont fix drift `invoices.ts:11-22`)
- `apps/web/src/lib/__tests__/of-config.test.ts` (Wave 0)
- `apps/web/.gitignore` : add `public/of-assets/`
- `apps/web/public/.gitkeep` (matérialiser le dossier)

**Bloquant pour:** 02, 03, 04

### Plan 07-02 — Server Actions + Zod + AuditLog wiring

**Dépendances:** 07-01 (schema + types)
**Files touched (~6) :**
- `packages/shared/src/schemas/tenant.ts` (NEW) : tenantIdentitySchema, tenantAddressSchema, tenantBillingSchema
- `packages/shared/src/schemas/index.ts` : export
- `packages/shared/src/schemas/__tests__/tenant.test.ts` (Wave 0)
- `apps/web/src/server/actions/tenant-settings.ts` (NEW) : `updateTenantIdentity`, `updateTenantAddress`, `updateTenantBilling` + helper `computeDiff` + `logTenantSettingsChange`
- `apps/web/src/server/actions/__tests__/tenant-settings.test.ts` (Wave 0)
- `apps/web/src/lib/numbering.ts` (NEW) : extraction de `nextInvoiceNumber` avec préfixe configurable

**Bloquant pour:** 03 (réutilise `logTenantSettingsChange`), 04 (consomme les server actions)

### Plan 07-03 — Upload assets + extension `loadAssetDataUrl`

**Dépendances:** 07-02 (réutilise `logTenantSettingsChange` pour audit upload)
**Files touched (~6) :**
- `apps/web/src/lib/closure/shared-template.ts` : extension `loadAssetDataUrl(filenames, tenantId?)`, export `invalidateAssetCache(tenantId)`, signatures `loadLogoColorDataUrl(tenantId?)` + `loadSignatureDataUrl(tenantId?, role)`
- `apps/web/src/lib/programme-template.ts` : remplace `logoCache` local par appel à `loadLogoColorDataUrl(tenantId)`
- `apps/web/src/lib/convention-template.ts` : idem
- `apps/web/src/server/actions/tenant-assets.ts` (NEW) : `uploadTenantLogo`, `uploadTenantSignature(role)`, `resetTenantLogo`, `resetTenantSignature(role)`
- `apps/web/src/server/actions/__tests__/tenant-assets.test.ts` (Wave 0)
- `apps/web/src/lib/closure/__tests__/shared-template.test.ts` (Wave 0)

**Peut être en parallèle de:** 07-04

### Plan 07-04 — UI page Paramètres édition inline

**Dépendances:** 07-02 (consomme server actions), 07-03 (consomme upload actions). Si parallélisé avec 03, doit attendre signature finale des actions.
**Files touched (~10) :**
- `apps/web/src/app/app/parametres/page.tsx` : refactor majeur (read tenant + render 6 sections + conserver Utilisateurs/OPCO/Docs read-only existants)
- `apps/web/src/components/settings/settings-section.tsx` (NEW) : wrapper card mode read ↔ edit
- `apps/web/src/components/settings/of-identity-form.tsx` (NEW)
- `apps/web/src/components/settings/of-address-form.tsx` (NEW)
- `apps/web/src/components/settings/of-assets-form.tsx` (NEW)
- `apps/web/src/components/settings/of-invoicing-form.tsx` (NEW) — inclut AlertDialog discontinuité préfixe
- `apps/web/src/components/settings/of-banking-form.tsx` (NEW) — inclut helper `formatIban` pour affichage
- `apps/web/src/components/settings/of-email-form.tsx` (NEW)
- `apps/web/src/lib/iban-format.ts` (NEW, helper) — formatage IBAN avec espaces tous les 4 chars
- `apps/web/src/app/app/parametres/__tests__/page.smoke.test.ts` (Wave 0)

### Plan 07-05 — Bookkeeping fin de phase

**Dépendances:** 07-01 à 07-04 mergés
**Files touched (~4) :**
- `.planning/REQUIREMENTS.md` : marquer SET-01/02/03 ✅ DONE avec dates + commits
- `.planning/ROADMAP.md` : Phase 7 status = Complete
- `.planning/STATE.md` : incrémenter compteurs, next = `/gsd:plan-phase 8`
- `.env.example` : ajouter commentaire "Ces variables OF_* sont désormais fallback secondaire — l'UI Paramètres prend le pas si renseignée"
- Verify build + tests green : `pnpm test && pnpm --filter @qualiof/web build`

### Why this breakdown?

- **Plan 01 isolé** : la migration Prisma + refactor `of-config` touche 13 fichiers et un drift bug (`invoices.ts`) — concentrer tout dans un plan évite des half-migrations.
- **Plan 02 séparé** : Zod schemas + server actions = couche métier pure, testable en unit, indépendante de l'UI.
- **Plans 03/04 parallélisables** : upload backend (03) et UI page (04) peuvent diverger côté implémentation tant que les signatures des actions sont arrêtées en fin de Plan 02.
- **Plan 05 bookkeeping** : pattern Phase 6 (plan 06-04 a fait pareil), assure que REQUIREMENTS + ROADMAP + STATE sont à jour avant `/gsd:plan-phase 8`.

### Risk Areas

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cascade refactor 13 call sites `getOfConfig` casse un PDF | MEDIUM | Plan 01 : tester chaque template (programme, convention, agefice, factures, certificat, attestation, footer) après refactor. Smoke run du closure pack sur SES-0010 (memory: validé 12min) post-merge. |
| Drift `invoices.ts` resté en place après refactor | MEDIUM | Plan 01 task explicite "supprimer objet OF inline + utiliser `of` paramètre" + grep regression test `grep -rn "process.env.OF_" apps/web/src/ --exclude=of-config.ts` doit retourner vide. |
| Cache `fileCache` non-invalidé après upload | HIGH | Plan 03 : exporter `invalidateAssetCache(tenantId)`, appelé systématiquement post-upload + URL versionnée `?v={updatedAt}` côté UI. |
| Validation IBAN trop stricte rejette IBAN espacés | MEDIUM | Plan 02 : `.transform((s) => cleanIban(s))` AVANT `.refine`, test couvre "FR76 1234 …" et "FR761234…". |
| `legalForm` enum vs texte arbitré tardivement | LOW | Question 1 à clarifier en début de Plan 02 (5 min Laurent) avant code des forms. Recommander enum. |
| `public/of-assets/` git-ignored mais oublié → uploads commit | LOW | Plan 01 : `.gitignore` + `.gitkeep` matérialisation dossier. |

## Sources

### Primary (HIGH confidence)

- `apps/web/src/lib/of-config.ts` — code source actuel lu intégralement
- `apps/web/src/app/app/parametres/page.tsx` — code source actuel lu intégralement
- `apps/web/src/lib/closure/shared-template.ts` L1-100 — pattern `loadAssetDataUrl` + fs.readFileSync
- `apps/web/src/server/actions/invoices.ts` L1-100 — pattern numérotation `FAC-NNNNNN` + transaction + drift OF
- `apps/web/src/server/actions/sessions-create.ts` L27-37 — pattern `nextSessionCode` continu (référence FAC-XXXX)
- `apps/web/src/server/actions/sessions.ts` L266-275 — pattern alternatif par année (NON utilisé Phase 7)
- `apps/web/src/server/actions/upload-apprenant-docs.ts` — pattern FormData + arrayBuffer + uploadFile (référence upload assets)
- `apps/web/src/server/actions/crud-edits.ts` L17-66 — pattern `updatePerson` Server Action discriminé `{ ok, error? }`
- `packages/db/prisma/schema.prisma` L24-33 (Tenant), L172-184 (LegalForm enum), L675-712 (Invoice), L989-1004 (AuditLog) — schémas lus intégralement
- `packages/shared/src/helpers/siret.ts` — helper `isValidSiret` lu intégralement
- `packages/shared/src/schemas/organization.ts` — pattern Zod + `LegalForm` enum + email empty-string
- `packages/shared/src/schemas/address.ts` — schéma adresse lu intégralement
- `apps/web/vitest.config.ts` — config tests
- `packages/shared/src/helpers/__tests__/siret.test.ts` — pattern test Vitest référence
- `apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts` — pattern smoke test référence

### Secondary (MEDIUM confidence)

- [Next.js File Uploads: Server-Side Solutions](https://www.pronextjs.dev/next-js-file-uploads-server-side-solutions) — vérification pattern Server Actions + FormData
- [File Upload with Next.js 14 and Server Actions — Akos Komuves](https://akoskm.com/file-upload-with-nextjs-14-and-server-actions/) — confirmation pattern public/uploads
- [Epic Next JS 15 Tutorial Part 5: File upload using server actions](https://strapi.io/blog/epic-next-js-15-tutorial-part-5-file-upload-using-server-actions) — pattern à jour 2025

### Tertiary (LOW confidence)

- Aucune affirmation LOW dans ce rapport — tous les findings sont basés sur lecture directe du code source ou docs Next.js récentes.

## Metadata

**Confidence breakdown:**
- Schema extension (Finding 1): HIGH — lu directement, conventions Prisma vérifiées
- `of-config` refactor strategy (Finding 2): HIGH — 12 call sites énumérés, pattern pre-resolve robuste
- Asset loading (Finding 3): HIGH — pattern fs+cache simple, surprise drift `programme/convention` repéré
- Upload UX (Finding 4): HIGH — pattern existant `upload-apprenant-docs.ts`
- Invoice numbering (Finding 5): HIGH — **surprise**: code déjà en place, drift à fixer
- AuditLog usage (Finding 6): HIGH — **surprise**: jamais instancié, premier usage Phase 7
- Validation Zod (Finding 7): HIGH — helpers SIRET + Zod patterns réutilisables
- Page layout (Finding 8): HIGH — pattern Phase 5 fiche apprenant directement applicable
- Validation Architecture (Finding 9): HIGH — Vitest configuré, patterns smoke + unit déjà éprouvés

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (1 mois — code source stable, pas de dépendance externe à risque)

---

*Phase: 07-param-tres-organisme-ditables*
*Research: 2026-05-13*
