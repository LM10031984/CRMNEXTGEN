# Phase 17: Fondations cloud (région EU + env) - Research

**Researched:** 2026-07-04
**Domain:** Env validation (t3-env / @t3-oss/env-nextjs), Turborepo cache config, cloud region residency (Supabase/Vercel/Upstash/Railway), PDF engine auth wiring
**Confidence:** HIGH (codebase facts vérifiés par grep/lecture · faits région vérifiés docs officielles)

## Summary

Phase 17 est une phase **code + documentation, PAS de création de projet cloud**. Aucun projet Supabase/Vercel/Railway n'est créé ici (c'est Phase 18+). Le livrable est double : (1) un document `.planning/` qui **verrouille par écrit la région EU** des plateformes AVANT toute création, et (2) une refonte de `packages/shared/src/env.ts` qui rend le boot **fail-loud** sur 5 clés cloud, câble le `turbo.json` globalEnv, retire l'alias périmé `DOC_ENGINE_URL`, et branche enfin `DOC_ENGINE_TOKEN` (déclaré, jamais consommé) en header `Authorization: Bearer` dans `pdf-render.ts`.

**Découverte critique (bloquante pour le succès du critère 2) :** `sharedEnv` (`packages/shared/src/env.ts`, exporté comme `@qualiof/shared/env`) **n'est importé NULLE PART dans `apps/web`**. Le barrel `@qualiof/shared` (`src/index.ts`) ne ré-exporte que `helpers/constants/schemas`, PAS `env`. Toute l'app lit `process.env.X` brut (`storage.ts`, `pdf-render.ts`, `redis.ts`, etc.). Donc `createEnv()` ne s'exécute jamais au boot → **déclarer des clés dans env.ts ne produit AUCUN fail-loud aujourd'hui**. L'affirmation CLAUDE.md « Boots fail loud at import time » est aspirationnelle, pas réelle. Le critère 2 (« le boot échoue fort ») exige donc, en plus de déclarer les clés, de **forcer l'exécution de `createEnv()` à un chokepoint de boot** (import de `sharedEnv` dans `next.config.mjs` et/ou dans un module chargé au démarrage worker), OU de faire consommer `sharedEnv.X` par les call sites (`storage.ts`, `pdf-render.ts`) au lieu de `process.env` brut.

**Correction du framing « région irréversible » :** l'irréversibilité ne s'applique **strictement qu'à Supabase** (région immuable → recréer le projet + migrer). Vercel (config `vercel.json`), Railway (changement à chaud sans downtime hors volume), et Upstash Global 2.0 (add/remove régions sans downtime) sont **mutables**. Le vrai risque « irréversible » est le **défaut US silencieux** : Vercel provisionne en `iad1` (Washington) et Supabase propose souvent us-east par défaut — d'où l'exigence de **choisir EU explicitement au moment de la création** (Phase 18/19/20), et de le documenter maintenant (Phase 17).

**Primary recommendation:** Documenter les 4 régions EU cibles dans `.planning/` (Supabase = eu-west-3 Paris ou eu-central-1 Frankfurt · Vercel = `cdg1`/`fra1` · Railway = `europe-west4` Amsterdam · Upstash = eu-west-1/eu-central-1 **SI Redis conservé**). Refondre `env.ts` : ajouter `DIRECT_URL`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEASYPRINT_URL` ; supprimer `DOC_ENGINE_URL` ; **importer `sharedEnv` à un chokepoint de boot** pour rendre le fail-loud réel ; câbler `DOC_ENGINE_TOKEN` en Bearer dans `pdf-render.ts`. Mettre à jour `turbo.json` globalEnv + `.env.example`.

---

<user_constraints>
## User Constraints

**Aucun CONTEXT.md pour cette phase** (`.planning/phases/17-.../` est vide au moment de la recherche — `/gsd:discuss-phase` non exécuté). Les contraintes viennent donc de ROADMAP.md, REQUIREMENTS.md, STATE.md et de la mémoire projet.

### Décisions verrouillées (héritées, NE PAS re-litiguer)
- **OpenRouter LLM** (Phase 16 livrée) — IA cloud déjà en place, hors scope Phase 17.
- **Option A dual-ingress public authentifié** pour les PDF (pas de refonte async — c'est le fondement du `DOC_ENGINE_TOKEN` de cette phase).
- **Redis viré au profit de Postgres SKIP LOCKED** (décision milestone v6 2026-06-03) — MAIS voir « Open Questions » : le code Redis/BullMQ coexiste encore avec `queue-postgres.ts`, la bascule effective est en Phase 20 (WORK-02). **Impact direct sur Phase 17** : la 4ᵉ plateforme (Upstash) de CLOUDENV-01 est **conditionnelle**.
- **`commit_docs=false`** — fichiers écrits, NON commités par les agents.
- **Anti-features v6** : pas de k8s/multi-région/blue-green/IaC/Datadog/SSO/PITR.

### Discrétion Claude
- Choix Supabase eu-west-3 Paris VS eu-central-1 Frankfurt (voir reco §Standard Stack).
- Choix Vercel `cdg1` (Paris) VS `fra1` (Frankfurt).
- Mécanique exacte du chokepoint de boot fail-loud (import dans `next.config.mjs` vs consommation `sharedEnv` par les call sites).

### Idées différées (HORS SCOPE Phase 17)
- Création réelle des projets cloud (Phase 18/19/20).
- Migration objets/DB, pooler Supavisor, extensions (Phase 18/19).
- Enforcement server-side du Bearer sur WeasyPrint/Gotenberg (Phase 20/21 — Phase 17 câble seulement le **client**).
- Décision Redis vs Postgres queue tranchée sur facturation 24h (Phase 20).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLOUDENV-01 | Région EU verrouillée + documentée pour les 4 plateformes AVANT création — choix irréversible | §Standard Stack (régions EU vérifiées + immutabilité par plateforme) · §Common Pitfalls (défaut US silencieux) · §Open Questions Q1 (4ᵉ plateforme Upstash conditionnelle) |
| CLOUDENV-02 | 5 clés cloud (`DIRECT_URL`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEASYPRINT_URL`) déclarées + validées t3-env fail-loud + `turbo.json` globalEnv + alias `DOC_ENGINE_URL` remplacé | §Architecture Patterns (schémas Zod par clé) · §Runtime State Inventory (sharedEnv jamais importé = le fail-loud n'existe pas) · §Code Examples · §Don't Hand-Roll |
| CLOUDENV-03 | `DOC_ENGINE_TOKEN` (env.ts:38, jamais consommé) câblé en Bearer dans `pdf-render.ts` sur tous les appels Gotenberg/WeasyPrint | §Architecture Patterns (câblage header) · §Code Examples · §Common Pitfalls (20 call sites, 2 fonctions à toucher) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives actionnables extraites de `./CLAUDE.md` que le planner DOIT respecter :

- **Env = single source of truth** : `.env` racine mono-repo, validé par `packages/shared/src/env.ts` via `@t3-oss/env-nextjs`, documenté dans `.env.example`, déclaré dans `turbo.json` globalEnv. Toute nouvelle clé DOIT toucher ces 3 fichiers.
- **Fail loud at import time** : l'intention CLAUDE.md est un boot qui échoue fort sur env malformé — **à rendre réel** (aujourd'hui non câblé, cf. Runtime State Inventory).
- **PDF footer** : Gotenberg SANS footer natif, footer HTML dans body `position:fixed`. NE PAS régresser — le câblage Bearer ne doit toucher que les headers HTTP, pas le corps FormData/HTML.
- **Multi-tenant** : toute nouvelle server action scope `tenantId`. (Phase 17 = infra env, pas de nouvelle action métier attendue.)
- **RGPD** : `Person.ribKey` = PII MinIO→Supabase, bucket privé, signed URLs. La région EU documentée ici sert la conformité RGPD (résidence données).
- **Naming** : fichiers `kebab-case.ts`, schémas Zod `PascalCaseSchema`, pas de nouvelle route (donc pas de redirect 308 à prévoir ici).
- **Tests** : Vitest (pas de Jest). Test hermétique sur schémas Zod isolés dans `env-schemas.ts` (pattern établi Phase 16-01, évite de fournir DATABASE_URL/AUTH_SECRET).
- **GSD enforcement** : pas d'édit repo hors workflow GSD.

## Standard Stack

Phase 17 n'introduit **aucune nouvelle dépendance npm**. Elle configure/recâble l'existant. Le « stack » ici = plateformes cloud (régions) + libs déjà installées.

### Régions EU cibles (à verrouiller par écrit) — vérifiées docs officielles 2026-07

| Plateforme | Région EU recommandée | Code | Immutable ? | Comment fixer EU explicitement |
|-----------|----------------------|------|-------------|-------------------------------|
| **Supabase** (Postgres + Storage) | Paris **ou** Frankfurt | `eu-west-3` (Paris) / `eu-central-1` (Frankfurt) | **OUI — recréer projet + migrer** | Choisir à la création du projet (dashboard). Défaut souvent us-east → **danger** |
| **Vercel** (app + functions) | Paris **ou** Frankfurt | `cdg1` (Paris) / `fra1` (Frankfurt) | Non (config) | `vercel.json` `"regions": ["cdg1"]` + Project Settings default region. **Défaut = `iad1` (Washington)** |
| **Railway** (worker 3ᵉ hôte + Gotenberg + WeasyPrint) | Amsterdam | `europe-west4` | Non (change à chaud, downtime seulement si volume attaché) | Config-as-code `"deploy": { "region": "europe-west4" }` + Workspace/Account preferred region |
| **Upstash** (Redis) — **CONDITIONNEL** | Irlande **ou** Frankfurt | `eu-west-1` (Irlande) / `eu-central-1` (Frankfurt) | Non (Global 2.0 add/remove régions sans downtime) | `primary_region` à la création. **Nécessaire SEULEMENT si Redis conservé (Phase 20)** |

**Reco région uniforme :** privilégier **Paris (cdg1 / eu-west-3)** pour Supabase + Vercel (résidence FR = argument RGPD/audit Qualiopi fort, OF français), Railway `europe-west4` (Amsterdam, pas de Paris chez Railway — le plus proche EU), Upstash `eu-central-1` (Frankfurt) si retenu. Alternative cohérente : **tout Frankfurt** (`fra1`/`eu-central-1`/`europe-west4`/`eu-central-1`) — meilleure co-localisation Vercel↔Supabase↔worker si latence critique. **Décision utilisateur** : « données en France (Paris) » vs « latence minimale inter-services (Frankfurt) ». Recommandation : **Paris** (Supabase eu-west-3 + Vercel cdg1) — l'argument résidence FR pèse plus que ~10ms de latence pour 2-5 utilisateurs internes.

### Libs concernées (déjà installées — vérifié package.json)
| Library | Version | Rôle Phase 17 |
|---------|---------|--------------|
| `@t3-oss/env-nextjs` | ^0.11.1 | Validation env fail-loud (`createEnv`) |
| `zod` | ^3.23.8 | Schémas des 5 clés |
| `@supabase/supabase-js` | ^2.107.0 | **Déjà présent** (résout un [VERIFY] Phase 21) — consommé par `storage.ts` |
| `turbo` | 2.3.0 | `globalEnv` cache invalidation |
| Prisma | 5.22.0 | `schema.prisma` lit déjà `env("DIRECT_URL")` (ligne 22) |

**Installation :** `npm install` — RIEN à installer. Phase de configuration.

## Architecture Patterns

### Les 5 clés cloud — état actuel vérifié (grep) et action

| Clé | Lue aujourd'hui où (raw) | Déclarée `env.ts` ? | `turbo.json` ? | `.env.example` ? | Action Phase 17 |
|-----|--------------------------|---------------------|----------------|------------------|-----------------|
| `DIRECT_URL` | `schema.prisma:22` (`env("DIRECT_URL")`) | ❌ | ❌ | ❌ | Ajouter schéma `z.string().url()` + turbo + example |
| `STORAGE_PROVIDER` | `storage.ts:23` (`?? 'minio'`) | ❌ | ❌ | ❌ | `z.enum(['minio','supabase']).default('minio')` |
| `SUPABASE_URL` | `storage.ts:49` (`?? ''`) | ❌ | ❌ | ❌ | `z.string().url().optional()` (requise si provider=supabase — voir refine) |
| `SUPABASE_SERVICE_ROLE_KEY` | `storage.ts:50` (`?? ''`) | ❌ | ❌ | ❌ | `z.string().optional()` (secret) |
| `WEASYPRINT_URL` | `pdf-render.ts:14` (`?? 'http://localhost:5001'`) | ❌ | ❌ | ❌ | `z.string().url().default('http://localhost:5001')` |

### L'alias périmé `DOC_ENGINE_URL` — la vraie histoire
- `DOC_ENGINE_URL` (`env.ts:37`, default `http://localhost:5000`, `.env.example:28`, `turbo.json:14`) désignait un « microservice Python doc-engine à créer en palier 3 » **qui n'a jamais été construit**.
- Le vrai moteur PDF secondaire est **WeasyPrint à :5001** (`pdf-render.ts:14`, `docker-compose.yml:70`) — 15 des 20 call sites l'utilisent.
- `DOC_ENGINE_URL` n'est **consommé nulle part** (grep : uniquement déclaration env.ts + turbo + .env.example, 0 lecture applicative).
- **Action** : supprimer `DOC_ENGINE_URL` de `env.ts` (schéma + runtimeEnv), `turbo.json`, `.env.example`. Le remplaçant fonctionnel est `WEASYPRINT_URL` (à déclarer). `GOTENBERG_URL` (moteur principal, 5 call sites) reste, mais devrait aussi migrer vers `sharedEnv` pour cohérence.

### Pattern 1 : Schémas Zod isolés (établi Phase 16-01)
**What:** déclarer les nouveaux schémas dans `packages/shared/src/env-schemas.ts` (module pur, sans effet de bord) puis les ré-importer dans `env.ts` `server{}`. Permet des tests hermétiques sans `.env` complet.
**When:** pour toute clé qu'on veut tester unitairement.
```typescript
// Source: packages/shared/src/env-schemas.ts (pattern existant Phase 16)
export const STORAGE_PROVIDER_SCHEMA = z.enum(['minio', 'supabase']).default('minio');
export const WEASYPRINT_URL_SCHEMA = z.string().url().default('http://localhost:5001');
export const DIRECT_URL_SCHEMA = z.string().url();
```

### Pattern 2 : Rendre le fail-loud RÉEL (le cœur du critère 2)
`createEnv()` ne s'exécute que si `env.ts` est importé. Aujourd'hui : jamais. Deux options (discrétion planner) :
- **Option A (recommandée, minimale) — chokepoint boot :** importer `sharedEnv` dans `apps/web/next.config.mjs` (déjà le premier fichier chargé, il fait déjà `loadEnv`) → toute clé manquante/malformée fait échouer `next build`/`next dev` immédiatement. Idem pour le worker : importer `sharedEnv` en tête de `apps/web/scripts/closure-worker.ts` / `closure-worker-postgres.ts`.
- **Option B (plus propre, plus de surface) — consommer `sharedEnv` :** remplacer les `process.env.X ?? default` de `storage.ts` et `pdf-render.ts` par `sharedEnv.X`. Le premier import de `sharedEnv` déclenche la validation. Aligne aussi CLAUDE.md « single source of truth ».
- **Recommandation :** faire **A + B partiel** — importer `sharedEnv` au chokepoint (garantit le fail-loud même si un call site oublie), ET migrer `pdf-render.ts` + `storage.ts` vers `sharedEnv.X` (les fichiers touchés de toute façon par cette phase).

### Pattern 3 : Câbler `DOC_ENGINE_TOKEN` en Bearer (critère 4 / CLOUDENV-03)
`pdf-render.ts` a **2 fonctions** : `renderHtmlToPdf` (Gotenberg, `fetch` sans headers) et `renderHtmlToPdfWeasy` (WeasyPrint, headers `Content-Type` seul). Ajouter le Bearer aux deux, conditionnellement (token optionnel → header seulement s'il existe, pour ne pas casser le dev local sans token).
```typescript
// Source: pattern dérivé de apps/web/src/lib/pdf-render.ts (état actuel)
const token = sharedEnv.DOC_ENGINE_TOKEN;
const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

// Gotenberg (multipart — NE PAS fixer Content-Type, fetch le gère avec le boundary)
const res = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
  method: 'POST',
  headers: authHeaders,     // ← seul ajout ; body FormData inchangé (footer HTML préservé)
  body: form,
});

// WeasyPrint
const res = await fetch(`${weasyprintUrl}/pdf`, {
  method: 'POST',
  headers: { 'Content-Type': 'text/html; charset=utf-8', ...authHeaders },
  body: html,
});
```
**Anti-pattern à éviter :** ne PAS ajouter `Content-Type` manuel sur l'appel Gotenberg multipart (casse le boundary FormData → 400). Le Bearer se met dans `headers`, le `body: form` reste intact → footer HTML non régressé (CLAUDE.md).

### Anti-Patterns to Avoid
- **Déclarer les clés dans env.ts et croire que ça suffit** : sans import au boot, zéro fail-loud (bug latent hérité). Vérifier par un test de boot réel.
- **Rendre `SUPABASE_URL` requise inconditionnellement** : casserait le dev local `STORAGE_PROVIDER=minio`. Utiliser `.optional()` + `superRefine` (requise SEULEMENT si `STORAGE_PROVIDER==='supabase'`).
- **Oublier le worker** : le boot fail-loud doit couvrir `next` ET le process worker (`tsx scripts/closure-worker*.ts`), qui ne passe pas par `next.config.mjs`.

## Don't Hand-Roll

| Problème | Ne pas construire | Utiliser | Pourquoi |
|----------|-------------------|----------|----------|
| Validation env typée + fail-loud | Un wrapper maison `assertEnv()` | `@t3-oss/env-nextjs` `createEnv` (déjà en place) | Sépare server/client, `emptyStringAsUndefined`, `SKIP_ENV_VALIDATION`, typage inféré |
| Requise-si-condition (Supabase si provider=supabase) | `if (!x) throw` éparpillés | Zod `.superRefine()` sur l'objet server | Message d'erreur groupé, un seul point de vérité |
| Doc région | Screenshot / notes éparses | Fichier `.planning/` structuré (table plateforme→région→code→URL preuve) | Critère 1 = « un lecteur peut vérifier » → doit être auditable |

**Key insight :** tout l'outillage env existe déjà (Phase 16 l'a étendu). Phase 17 = brancher correctement, pas réinventer.

## Runtime State Inventory

> Phase 17 modifie de la config env (rename `DOC_ENGINE_URL`, ajout de clés). Inventaire des états runtime au-delà des fichiers :

| Catégorie | Éléments trouvés | Action requise |
|-----------|------------------|----------------|
| **Config env stockée** | `.env` / `.env.local` racine (NON commités) contiennent les valeurs réelles. `DIRECT_URL` déjà lu par Prisma. `WEASYPRINT_URL` peut être absent (fallback :5001). | **Code edit** : synchroniser `.env.example` ; Laurent doit ajouter les nouvelles clés dans son `.env.local` (sinon fail-loud au boot après la refonte — c'est l'effet voulu, mais à documenter dans le SUMMARY) |
| **`sharedEnv` jamais importé** | `packages/shared/src/env.ts` `createEnv()` **ne s'exécute à aucun boot** (barrel `index.ts` ne ré-exporte pas `env` ; aucun `import '@qualiof/shared/env'` dans apps/web). Le fail-loud CLAUDE.md est **fictif aujourd'hui**. | **Code edit critique** : importer `sharedEnv` à un chokepoint de boot (next.config.mjs + worker scripts) — sans ça le critère 2 est faux même après déclaration des clés |
| **Coexistence Redis / Postgres queue** | `queue.ts`+`worker.ts`+`redis.ts` (BullMQ/ioredis, `REDIS_URL`) coexistent avec `queue-postgres.ts`+`closure-worker-postgres.ts` (SKIP LOCKED). Les deux chemins sont dans l'arbre. | **Aucune pour Phase 17** — mais détermine si Upstash est la 4ᵉ plateforme (voir Open Questions Q1). Décision tranchée Phase 20 |
| **Worktree résiduel** | `.claude/worktrees/agent-a20a2163d6f8a909f/` contient une copie divergente de `env.ts` (avec `DIRECT_URL`/`DOC_ENGINE_TOKEN` à des lignes différentes) — vestige d'un agent. | **Aucune** — ignorer (hors arbre de travail principal). Ne PAS éditer les worktrees |
| **Artefacts build** | Aucun egg-info/binaire lié à ces clés. `turbo` cache s'invalide correctement une fois globalEnv à jour. | **Aucune** (au-delà de la MAJ globalEnv) |

**La question canonique :** après édition de tous les fichiers, quel système runtime garde encore l'ancien état ? Réponse : **le boot lui-même** — si `sharedEnv` n'est pas importé, la validation n'a jamais lieu, peu importe les fichiers. C'est LE piège de cette phase.

## Common Pitfalls

### Pitfall 1 : « J'ai déclaré les clés, le boot devrait échouer » — il n'échoue pas
**What goes wrong:** on ajoute les 5 clés à `env.ts`, on retire les defaults `?? ''`, et le boot passe quand même sans erreur car `createEnv()` n'est jamais appelé.
**Why:** `sharedEnv` n'est importé nulle part au runtime app (vérifié grep).
**How to avoid:** importer `sharedEnv` dans `next.config.mjs` (après `loadEnv`) + en tête des scripts worker. Prouver par un test de boot (`SUPABASE_URL` malformée → `next build` throw).
**Warning sign:** `pnpm build` vert alors qu'une clé requise est vide.

### Pitfall 2 : Défaut régional US silencieux (le vrai « irréversible »)
**What goes wrong:** au moment de créer les projets (Phase 18/19), Vercel provisionne `iad1` et Supabase propose us-east par défaut → données hors EU, non-conformité RGPD, et pour Supabase c'est immuable.
**Why:** les défauts des providers sont US-centric.
**How to avoid:** le document `.planning/` de Phase 17 doit lister le code région EU exact + la procédure « choisir EU explicitement » comme checklist pré-création. C'est la raison d'être du critère 1.
**Warning sign:** un projet créé sans avoir consulté le doc région.

### Pitfall 3 : Casser le multipart Gotenberg en ajoutant le Bearer
**What goes wrong:** en ajoutant `headers`, on fixe aussi `Content-Type: multipart/form-data` manuellement → le boundary n'est pas généré → Gotenberg renvoie 400, tous les PDF cassent (facture, convocation…).
**Why:** `fetch` génère le boundary automatiquement UNIQUEMENT si on ne fixe pas `Content-Type` sur un body FormData.
**How to avoid:** n'ajouter QUE `Authorization` dans headers Gotenberg, laisser `fetch` gérer le Content-Type. Sur WeasyPrint (body string) le `Content-Type: text/html` reste explicite + spread du Bearer.
**Warning sign:** 400 Gotenberg après le câblage · les 5 call sites `renderHtmlToPdf` cassent d'un coup.

### Pitfall 4 : `SUPABASE_URL` requise casse le dev local MinIO
**What goes wrong:** rendre `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` `.string().url()` non-optional fait échouer le boot en dev (où `STORAGE_PROVIDER=minio`).
**How to avoid:** `.optional()` + `superRefine` conditionnel (requises ssi `STORAGE_PROVIDER==='supabase'`). Idem `DIRECT_URL` : requise (Prisma la lit toujours) mais en dev `DIRECT_URL=DATABASE_URL` (no-op, cf. commentaire schema.prisma:20).

## Code Examples

### Schéma env server{} avec requise-conditionnelle Supabase
```typescript
// Source: pattern @t3-oss/env-nextjs + Zod superRefine (docs officielles)
export const sharedEnv = createEnv({
  server: {
    // ... existant ...
    DIRECT_URL: z.string().url(),                                   // Prisma directUrl (schema.prisma:22)
    STORAGE_PROVIDER: z.enum(['minio', 'supabase']).default('minio'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    WEASYPRINT_URL: z.string().url().default('http://localhost:5001'),
    // DOC_ENGINE_URL supprimé (alias périmé, jamais consommé)
    DOC_ENGINE_TOKEN: z.string().optional(),                        // conservé, maintenant CONSOMMÉ (pdf-render.ts)
    GOTENBERG_URL: z.string().url().default('http://localhost:3001'),
  },
  // ... runtimeEnv : ajouter les 5, retirer DOC_ENGINE_URL ...
})
  // requise-si-condition sans casser le dev MinIO
  .superRefine?.(/* si la version t3-env n'expose pas superRefine sur le retour,
     alterner : valider via un z.object().superRefine dans env-schemas et parser à part */);
```
> Note planner : `createEnv` n'expose pas directement `.superRefine`. Deux voies : (a) laisser Supabase `.optional()` et laisser `storage.ts` throw en runtime si provider=supabase et clés vides (comportement DÉJÀ présent `storage.ts:56-60` — suffisant, fail-loud au 1er usage cloud) ; (b) parser un `z.object({...}).superRefine(...)` dédié dans `env-schemas.ts` et l'appeler au chokepoint. **Reco : (a)** — le throw runtime existant de `storage.ts` couvre déjà le cas, garder Supabase optional évite la complexité.

### Import chokepoint de boot (rend le fail-loud réel)
```javascript
// Source: apps/web/next.config.mjs (ajout après loadEnv lignes 11-12)
import '@qualiof/shared/env';   // force createEnv() → throw si env malformé au build/dev
```
```typescript
// Source: apps/web/scripts/closure-worker.ts + closure-worker-postgres.ts (en tête)
import '@qualiof/shared/env';   // fail-loud au démarrage worker (ne passe pas par next.config)
```

### Test hermétique (pattern Phase 16-01)
```typescript
// Source: packages/shared/src/__tests__/env.test.ts (extension)
import { STORAGE_PROVIDER_SCHEMA, WEASYPRINT_URL_SCHEMA, DIRECT_URL_SCHEMA } from '../env-schemas';
it('STORAGE_PROVIDER rejette une valeur inconnue (fail loud)', () => {
  expect(() => STORAGE_PROVIDER_SCHEMA.parse('s3-random')).toThrow();
});
it('DIRECT_URL exige une URL valide', () => {
  expect(() => DIRECT_URL_SCHEMA.parse('pas-une-url')).toThrow();
});
it('WEASYPRINT_URL défaut :5001', () => {
  expect(WEASYPRINT_URL_SCHEMA.parse(undefined)).toBe('http://localhost:5001');
});
```

## State of the Art

| Ancien | Actuel | Quand | Impact |
|--------|--------|-------|--------|
| `DOC_ENGINE_URL` (:5000, microservice fantôme jamais construit) | `WEASYPRINT_URL` (:5001, réel, 15 call sites) | palier 3 abandonné → Phase 17 | Retrait de l'alias mort |
| Vercel régions US par défaut, EU en option | `cdg1`/`fra1` explicites via `vercel.json` `regions` | stable | Choisir EU à la config, pas au déploiement |
| Supabase régions EU limitées | Paris (eu-west-3), Frankfurt, Stockholm, Zurich dispo | ~2024+ | Choix Paris possible (argument RGPD FR) |
| Upstash région fixe | Global 2.0 : add/remove régions sans downtime | 2026 | Upstash non « irréversible » (contrairement au framing roadmap) |

**Déprécié/périmé :**
- `DOC_ENGINE_URL` : microservice jamais construit → remplacé par `WEASYPRINT_URL`.
- Framing « les 4 régions sont irréversibles » : FAUX — seule Supabase l'est réellement.

## Open Questions

1. **La 4ᵉ plateforme (Upstash) fait-elle vraiment partie de CLOUDENV-01 ?**
   - Ce qu'on sait : décision milestone v6 = « Redis viré au profit de Postgres SKIP LOCKED ». MAIS le code Redis/BullMQ (`queue.ts`, `worker.ts`, `redis.ts`, veille, invoice-reminders) coexiste encore avec `queue-postgres.ts`/`closure-worker-postgres.ts`. La bascule effective + décision Upstash vs Redis co-localisé est **Phase 20 (WORK-02, tranchée sur facturation 24h)**.
   - Ce qui est flou : documenter une région Upstash maintenant pourrait être inutile si Redis disparaît.
   - **Recommandation :** documenter la région Upstash EU **de façon conditionnelle** dans le doc `.planning/` (« SI Redis conservé → Upstash eu-central-1 »). Ne PAS bloquer Phase 17 sur une décision Phase 20. Le critère 1 parle des « 4 plateformes » — répondre par « 3 fermes (Supabase/Vercel/Railway) + 1 conditionnelle (Upstash, décision Phase 20) ». **À confirmer avec Laurent au plan-time.**

2. **Paris vs Frankfurt (Supabase + Vercel) ?**
   - Ce qu'on sait : Paris (eu-west-3 / cdg1) = résidence FR, argument RGPD/audit. Frankfurt = meilleure co-localisation si le worker Railway est à Amsterdam.
   - **Recommandation :** Paris pour Supabase+Vercel (résidence FR prime pour un OF français, latence négligeable à 2-5 users). Question métier à poser à Laurent : « données hébergées en France (Paris) ou latence inter-services minimale (Frankfurt) ? »

3. **`superRefine` vs throw runtime existant pour Supabase requise-conditionnelle ?**
   - Recommandation : garder Supabase `.optional()`, s'appuyer sur le throw déjà présent `storage.ts:56-60`. Simplicité > élégance.

## Environment Availability

Phase 17 = code/config uniquement, **aucune création de projet cloud, aucune dépendance externe à provisionner**. Les outils nécessaires (Node, pnpm, turbo, vitest) sont ceux du dev existant. Le seul « test live » est le boot de l'app.

| Dépendance | Requise par | Disponible | Version | Fallback |
|-----------|------------|-----------|---------|----------|
| Node ≥20 | boot/test | ✓ (dev existant) | 20 (.nvmrc) | — |
| pnpm 10.33.2 | build/test | ✓ | 10.33.2 | — |
| WeasyPrint :5001 (local Docker) | test câblage Bearer local | ✓ (docker-compose) | 60.2 | Bearer optionnel → header omis si pas de token, test passe |
| Gotenberg :3001 (local Docker) | test câblage Bearer local | ✓ | 8 | idem |
| Projets Supabase/Vercel/Railway | — | **N/A Phase 17** | — | Documentation seulement, création = Phase 18+ |

**Pas de dépendance bloquante.** Le Bearer étant optionnel, le dev local sans token n'est pas cassé.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (`apps/web` + `packages/shared`) |
| Config file | `vitest.config.ts` par package (pas de Jest ; Playwright = Phase 21) |
| Quick run command | `pnpm --filter @qualiof/shared exec vitest run src/__tests__/env.test.ts` |
| Full suite command | `pnpm --filter @qualiof/shared exec vitest run && pnpm --filter @qualiof/web exec vitest run` |
| Note symlink | Historique 16-01 : lancer vitest/tsc via `pnpm --filter … exec` (symlink `node_modules/vitest` parfois périmé → `pnpm install` root si TS2307) |

### Phase Requirements → Test/Validation Map
| Critère | Comportement | Type | Commande / preuve automatisable | Fichier existe ? |
|---------|-------------|------|-------------------------------|------------------|
| 1 (CLOUDENV-01) | Doc région EU auditable, 4 plateformes | manual/grep | `grep -E "eu-west-3\|cdg1\|europe-west4\|eu-central-1" .planning/phases/17-*/…-REGIONS.md` (le doc doit exister et lister les 4) | ❌ Wave 0 (créer le doc) |
| 2a (CLOUDENV-02) | 5 clés déclarées, `DOC_ENGINE_URL` retiré | grep | `grep -c "DIRECT_URL\|STORAGE_PROVIDER\|SUPABASE_URL\|SUPABASE_SERVICE_ROLE_KEY\|WEASYPRINT_URL" packages/shared/src/env.ts` (=5+ occurrences server) ET `grep -c DOC_ENGINE_URL packages/shared/src/env.ts turbo.json .env.example` (=0) | ✅ (fichiers existent) |
| 2b (CLOUDENV-02) | Boot **échoue fort** si clé malformée | integration/boot | `SUPABASE_URL="pas-url" STORAGE_PROVIDER=supabase pnpm --filter @qualiof/web build` → **doit throw** ; enum schema tests hermétiques (`env.test.ts`) | ❌ Wave 0 (étendre `env.test.ts` + prouver l'import chokepoint) |
| 2c (CLOUDENV-02) | Plus aucun `process.env` brut sur ces clés | grep | `grep -rn "process.env.\(SUPABASE_URL\|STORAGE_PROVIDER\|WEASYPRINT_URL\)" apps/web/src` → attendu 0 (migrés vers `sharedEnv`) | ✅ |
| 3 (CLOUDENV-02) | `turbo.json` globalEnv déclare les 5 | grep | `grep -c "DIRECT_URL\|STORAGE_PROVIDER\|SUPABASE_URL\|SUPABASE_SERVICE_ROLE_KEY\|WEASYPRINT_URL" turbo.json` (=5) ET `DOC_ENGINE_URL`=0 | ✅ |
| 4 (CLOUDENV-03) | Bearer `DOC_ENGINE_TOKEN` sur Gotenberg + WeasyPrint | unit + grep | Test : mock `fetch`, appeler `renderHtmlToPdf`/`renderHtmlToPdfWeasy` avec `DOC_ENGINE_TOKEN` set → assert `Authorization: Bearer <token>` présent dans les 2 appels ; mutation-safe (retirer le header → rouge). `grep -c "Authorization.*Bearer" apps/web/src/lib/pdf-render.ts` (≥1, idéalement 2 chemins) | ❌ Wave 0 (créer `pdf-render.test.ts`) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @qualiof/shared exec vitest run src/__tests__/env.test.ts` + grep du critère touché.
- **Per wave merge:** full suite shared + web (`vitest run`) + `pnpm --filter @qualiof/web build` (prouve le fail-loud réel : build vert avec env valide, throw avec env cassé).
- **Phase gate:** full suite verte + boot test négatif (env cassé → throw) + les 6 greps critères verts, avant `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `.planning/phases/17-.../17-REGIONS.md` (ou section dédiée) — doc région EU auditable des 4 plateformes (couvre critère 1). N'existe pas.
- [ ] `packages/shared/src/__tests__/env.test.ts` — étendre avec `STORAGE_PROVIDER`/`WEASYPRINT_URL`/`DIRECT_URL` schémas (pattern 16-01). Fichier existe, tests à ajouter.
- [ ] `apps/web/src/lib/__tests__/pdf-render.test.ts` — nouveau, teste le Bearer sur les 2 fonctions (mock fetch, mutation-safe). N'existe pas.
- [ ] Preuve du **chokepoint boot** : test/commande démontrant que `next build` (ou import de `sharedEnv`) throw sur env malformé. Le mécanisme d'import (next.config.mjs + worker) n'existe pas encore.
- [ ] Test de puissance (mutation) au gate : retirer le header Bearer → `pdf-render.test.ts` rouge → restaurer (convention projet `feedback_test_de_puissance_mutation`).

## Sources

### Primary (HIGH confidence)
- Codebase (grep/Read vérifiés 2026-07-04) : `packages/shared/src/env.ts`, `env-schemas.ts`, `index.ts`, `apps/web/src/lib/pdf-render.ts`, `storage.ts`, `closure/redis.ts`, `turbo.json`, `.env.example`, `schema.prisma:20-22`, `docker/weasyprint/server.py`, `docker-compose.yml`, `package.json` (@supabase/supabase-js ^2.107.0).
- Supabase docs — [Available regions](https://supabase.com/docs/guides/platform/regions) · [Change Project Region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z) (immutable, recréer+migrer).
- Vercel docs — [Configuring regions for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region) (défaut `iad1`, `vercel.json` `regions`) · [Global network and regions](https://vercel.com/docs/regions).
- Railway docs — [Regions](https://docs.railway.com/deployments/regions) (`europe-west4` Amsterdam, change à chaud sans downtime hors volume).

### Secondary (MEDIUM confidence)
- Upstash docs — [Create Redis Database](https://upstash.com/docs/devops/developer-api/redis/create_database_global) + [Global 2.0](https://upstash.com/blog/global-2) (eu-west-1 Irlande, eu-central-1 Frankfurt, régions mutables).
- Supabase X/annonce — Paris eu-west-3, Stockholm eu-north-1, Zurich eu-central-2 ([post](https://x.com/supabase/status/1830977824330498098)).

### Tertiary (LOW confidence)
- Aucune assertion critique ne repose sur une source unique non vérifiée.

## Metadata

**Confidence breakdown:**
- Standard stack (régions) : HIGH — docs officielles Supabase/Vercel/Railway/Upstash.
- Architecture (env/pdf-render câblage) : HIGH — codebase lue ligne à ligne, gaps prouvés par grep.
- Pitfalls : HIGH — pitfall #1 (sharedEnv jamais importé) et #3 (multipart Gotenberg) vérifiés dans le code.
- Décision Upstash/région : MEDIUM — dépend d'une décision métier (Q1/Q2) à confirmer au plan-time.

**Research date:** 2026-07-04
**Valid until:** ~2026-08-04 (régions cloud stables ; revérifier codes région si création décalée de plusieurs mois)
