# Phase 21: App Vercel + filet CI/tests - Research

**Researched:** 2026-07-06
**Domain:** Déploiement Next.js 14 (App Router, monorepo pnpm/turbo) sur Vercel Pro EU + CI GitHub Actions + Playwright E2E/smoke
**Confidence:** HIGH (codebase vérifié ligne à ligne ; Vercel/Lucia vérifiés docs officielles à jour 2026-06)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Environnements staging/prod Vercel (APP-01, APP-02)
- **D-01 :** **Un seul projet Vercel** — il sert de staging maintenant (filigrane + gardes) et devient la prod en Phase 22 (bascule = brancher DNS officiel + passer le flag en production). Pas de projet staging séparé, un seul jeu de variables.
- **D-02 :** **Garde staging = tout ce qui sort est bloqué** : emails en dry-run (loggés, pas envoyés — le mécanisme `SMTP_HOST` vide de `mailer.ts` existe déjà), rappels Google Calendar non créés, PDF marqués d'un filigrane STAGING bien visible. Zéro risque qu'un apprenant reçoive un mail/doc de test alors que l'app parle à la vraie base.
- **D-03 :** **Le staging pointe la base cloud actuelle** (le Supabase réel, vraies données — celle que `.env` local pointe déjà). C'est elle qui devient la prod ; la garde D-02 protège des effets de bord.
- **D-04 :** **Le domaine final est branché dès la Phase 21** (ex. app.start-academy.fr → Vercel), sans le communiquer à l'équipe. Cookies `secure` + CSRF Lucia validés sur le VRAI domaine — la bascule Phase 22 devient triviale. Le nom de sous-domaine exact : à confirmer avec Laurent au moment du câblage DNS (question opérationnelle, pas bloquante pour le plan).
- **NB branche `staging-vercel`** : elle est 94 commits DERRIÈRE `cloud-migration` et 0 devant — elle est obsolète. « Staging dégelé » = reprendre le *plan* E1-E4 (filigrane, garde PDF, vercel.json), pas la branche. Ne rien merger depuis `staging-vercel`.

#### Région Supabase (arbitrage hérité Phase 18)
- **D-05 :** **Irlande (eu-west-1) définitive.** UE donc RGPD conforme, tout est migré et prouvé (base + 3109 objets + smokes verts). Acter la dérogation dans `17-REGIONS.md` (amendement documentaire). Ne plus re-proposer Paris.
- **D-06 :** **Audit + backfill MinIO→Supabase en Phase 21, AVANT les tests staging** (bug SES-0094 : objets locaux jamais migrés). Les E2E/smoke vérifient alors des documents réellement lisibles — pas de faux vert. **MinIO n'est PAS purgé** (convention : destructif = étape séparée, Phase 22+).

#### CI GitHub Actions & workflow Git (CI-01)
- **D-07 :** **Flux PR sur `main`** : merger `cloud-migration` dans `main`, protéger `main` (CI verte obligatoire), travail futur en PR — Claude ouvre et merge les PR via `gh` pour Laurent. Repo : `LM10031984/CRMNEXTGEN`, `gh` déjà authentifié.
- **D-08 :** **`shared-template.test.ts` corrigé** (pas de quarantaine) — l'écart MIME jpeg/jpg est mineur, la CI démarre 100 % verte sans exception.
- **D-09 :** **Déploiement auto sur merge dans `main`** : Vercel redéploie, GitHub Actions joue `prisma migrate deploy` (DIRECT_URL en secret GitHub chiffré), Railway rebuild le worker. Le filigrane staging protège pendant la période de test.

#### E2E Playwright & smoke routes (TEST-01, TEST-02)
- **D-10 :** **E2E closure + smoke tournent contre le staging Vercel déployé, à la demande** (avant bascule + après déploiements importants) — PAS sur chaque PR. Le gate PR reste rapide : lint + tsc + vitest uniquement.
- **D-11 :** **E2E closure avec génération IA RÉELLE sur une session de test jetable** : le test crée une session fictive (produit + stagiaires de test), génère le vrai pack via OpenRouter (~quelques centimes), vérifie que les docs sortent sans stub, puis nettoie ses données. Preuve complète du pilier #1 dans le cloud.
- **D-12 :** **Smoke = pages clés des 4 piliers** (~10 routes) : login, dashboard, sessions + fiche session, apprenants, dossiers OPCO, budget AGEFICE, factures, préinscriptions, form public `/p/[token]`. Vérifie redirect auth si non connecté + 200 si connecté. Liste exacte : discrétion Claude.
- **D-13 :** **Rate-limit anti-abus sur `/p/[token]` en Phase 21** : limite par IP sur les tentatives de token et les uploads (protège bruteforce + coût OCR) dès que l'app est exposée publiquement.

### Claude's Discretion
- Valeurs `maxDuration` par route dans `vercel.json` (Vercel Pro : défaut 300s / max 800s — research flag roadmap).
- Implémentation exacte du filigrane STAGING (CSS overlay dans les templates PDF + bandeau UI éventuel) et du flag `NEXT_PUBLIC_APP_ENV` dans `packages/shared/src/env.ts`.
- Mécanisme du rate-limit (middleware, table Postgres, à choisir — PAS de Redis, D-03 Phase 20).
- Config Playwright (projet, baseURL staging paramétrable, storage state pour l'auth).
- Structure des workflows GitHub Actions (jobs, cache pnpm/turbo, secrets) et config exacte de la branch protection.
- Stratégie de nettoyage de la session de test E2E (préfixe identifiable + suppression en teardown).
- Vérification `NODE_ENV`/`APP_ENV` réellement `production` en HTTPS (cookie secure — sinon login en boucle) et origine CSRF Lucia derrière le proxy Vercel (research flags roadmap).
- Re-validation des 3 items PENDING Phase 18 sur Vercel déployé : pas de 413 sur upload 10 MB direct-to-storage, retry coupure réseau, expiration signed URL.

### Deferred Ideas (OUT OF SCOPE)
- **Purge MinIO local** — après bascule validée, étape destructive séparée (Phase 22+, convention destructif).
- **Retrait du filigrane + communication du domaine à l'équipe + invitations** — Phase 22 (bascule officielle).
- **Refactor async des 9 actions PDF (Option B)** — optimisation post-cutover, déjà hors scope REQUIREMENTS.
- **Rate-limit avancé / WAF** — la protection simple par IP (D-13) suffit pour la Phase 21 ; durcissement éventuel post-bascule.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APP-01 | App Next.js déployée Vercel Pro région EU, staging dégelé (flag `NEXT_PUBLIC_APP_ENV`, filigrane staging, garde PDF, `vercel.json` maxDuration par route) | § Vercel setup (cdg1, root directory, prisma generate), § Filigrane (chokepoint `pdf-render.ts`), § maxDuration (Pro : 300s défaut / 800s GA max confirmés docs officielles), § Env checklist Vercel (dont 22 vars `OF_*`) |
| APP-02 | Auth Lucia fonctionnelle sur Vercel (login/logout, cookies secure) + formulaire public `/p/[token]` accessible | § Lucia sur Vercel (NODE_ENV=production garanti par Vercel → `secure` on ; sameSite lax à expliciter ; CSRF = Next.js server actions, 0 route handler POST dans le code), § Pitfall route publique (vraie route = `/preinscription/[token]`) |
| APP-03 | Les ~9 server actions PDF synchrones passent par l'endpoint doc-engine public authentifié (DOC_ENGINE_TOKEN) | § Câblage env : `pdf-render.ts` déjà prêt (Bearer conditionnel) — APP-03 = pointer `GOTENBERG_URL` (proxy Caddy public) + `WEASYPRINT_URL` (service public) + `DOC_ENGINE_TOKEN` dans l'env Vercel. § Pitfall pdftoppm (dégradation gracieuse déjà en place) |
| CI-01 | GitHub Actions — lint + tsc + vitest sur PR (gate branch protection) + build Docker worker + `prisma migrate deploy` en étape de déploiement | § Workflows GitHub Actions (pnpm/action-setup@v4, service Postgres pour les 2 tests d'intégration DB, `.env` CI à écrire, prisma generate), § Branch protection via `gh api`, § Pipeline déploiement |
| TEST-01 | Playwright E2E flow closure (création session → participants → pack → docs générés) | § Playwright (1.61.1, storageState, timeout 15 min, préfixe E2E- + teardown Prisma), § Dépendance worker Railway vivant |
| TEST-02 | Smoke tests routes protégées (redirect auth + 200 sur pages clés) | § Liste des ~10 routes (proposée, discrétion D-12), § Comportement redirect (`/app/*` → `/login` via `validateRequest`) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement** : toute modification passe par `/gsd:execute-phase` / `/gsd:quick` — pas d'édition directe hors workflow.
- **Footer PDF** : footer en HTML dans le body (`position:fixed bottom:0` 11pt Gotenberg / CSS Paged Media WeasyPrint) — **ne pas régresser** ce pattern en injectant le filigrane. L'injection filigrane doit être additive.
- **Multi-tenant** : toute nouvelle server action (rate-limit éventuel côté app) scope par `tenantId`.
- **Routes** : conventions FR kebab-case ; la route publique historique est `/preinscription/[token]` (voir Pitfall 1) ; tout renommage exigerait un redirect 308 dans `next.config.mjs`.
- **Secrets** : jamais en variables custom non chiffrées — secrets GitHub Actions chiffrés (`DIRECT_URL`, `DATABASE_URL`), env vars Vercel type « Sensitive ».
- **Destructif = étape séparée** : le teardown E2E ne supprime QUE les données préfixées `E2E-` ; MinIO jamais purgé en Phase 21.
- ⚠ La contrainte CLAUDE.md « Runtime : Mac local, pas de prod cloud » est **caduque** — remplacée par le milestone v6 (REQUIREMENTS 2026-07-04). Le planner ne doit pas la traiter comme bloquante.

## Summary

La phase 21 est essentiellement du **câblage et de la configuration**, pas du développement lourd : `pdf-render.ts` porte déjà le Bearer conditionnel (APP-03 = 3 variables d'env), le mailer a déjà son dry-run, l'auth Lucia est déjà `secure` en production. Ce qui n'existe pas : `vercel.json`, `.github/workflows/`, config Playwright, flag `NEXT_PUBLIC_APP_ENV`, filigrane. Le point d'injection idéal du filigrane est le **chokepoint unique `pdf-render.ts`** (les 9 actions synchrones ET le worker passent par lui) — gated sur l'env Vercel uniquement pour ne pas marquer les packs réels générés par le worker Railway.

Trois découvertes de terrain corrigent le contexte : (1) la route publique est **`/preinscription/[token]`**, pas `/p/[token]` — les smoke/rate-limit doivent viser la vraie route ; (2) **`shared-template.test.ts` passe déjà 11/11** (vérifié par exécution le 2026-07-06 — le fix MIME jpg→jpeg est dans `shared-template.ts:62,78` ; la suite était déjà 1166/1166 au plan 20-04) — D-08 est de facto soldé, la CI doit juste le confirmer ; (3) **`dedupe.merge.test.ts` throw à la collection** si `TEST_DATABASE_URL` absent → la CI vitest exige un service container Postgres + `prisma db push` + une base `*_test`, sinon la suite est structurellement rouge.

Côté Vercel : Pro avec Fluid Compute donne **300s par défaut / 800s max GA** par fonction (le 1800s existe mais en extended/beta — inutile ici, le rendu Gotenberg d'un doc prend des secondes). La région se verrouille via `"regions": ["cdg1"]` dans `vercel.json` (17-REGIONS.md, défaut = iad1 Washington). Le rate-limit D-13 se règle sans une ligne de code via une **règle WAF Vercel** (Rate Limit fixed-window par IP, dispo Pro, 40 règles, dashboard-first — pattern Laurent), avec fallback table Postgres documenté.

**Primary recommendation:** Vague 1 = CI verte sur `main` (merge `cloud-migration`, workflows, branch protection) + code staging guards (flag, filigrane, garde calendar) ; Vague 2 = projet Vercel (env ~35 clés dont les 22 `OF_*`, domaine, WAF rate-limit) + backfill MinIO ; Vague 3 = Playwright smoke + E2E closure contre le staging déployé. Prérequis dur : plan 20-05 déployé (URLs publiques Railway disponibles).

## Standard Stack

### Core (ajouts Phase 21 — le reste du stack est figé)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | ^1.61.1 (vérifié npm 2026-07-06) | E2E closure + smoke routes | Standard de facto, storageState pour l'auth, retries/traces intégrés |
| `pnpm/action-setup` | v4 | Installe pnpm en CI (lit `packageManager: pnpm@10.33.2`) | Action officielle pnpm |
| `actions/setup-node` | v4 (`cache: 'pnpm'`) | Node 20 + cache store pnpm | Action officielle, cache natif pnpm |
| `actions/checkout` | v4 | Checkout repo | Standard |
| `postgres:16` (service container) | 16 | Base `qualiof_test` pour les 2 tests d'intégration vitest | Même majeure que le docker-compose local |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vercel WAF Rate Limiting | n/a (dashboard) | D-13 rate-limit par IP sur `/preinscription` | Règle fixed-window Pro, zéro code, zéro Redis |
| `docker/build-push-action` | v6 | CI-01 « build Docker worker » (build-only, preuve que l'image compile) | Job PR optionnel ou job main |
| Vercel CLI | non requis | — | Tout se fait via dashboard + git integration (pattern Laurent sans CLI). Ne PAS l'ajouter aux deps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WAF Vercel rate-limit | Table Postgres fixed-window dans la server action | Portable et testable, mais code + 1 write/req ; à garder en fallback si le pricing usage-based WAF déplaît |
| Segment `export const maxDuration` par route | `vercel.json` `functions` glob | Pour Next.js ≥13.5 App Router, la voie officielle est l'export par segment ; le glob `vercel.json` cible mal les pages App Router |
| Service container Postgres en CI | Exclure `scripts/__tests__/dedupe.merge.test.ts` de la CI | L'exclusion crée un angle mort permanent ; le container coûte ~20s et garde la suite intègre. (La « DB-par-PR » hors scope = pas d'environnement cloud par PR, un container éphémère de CI n'est pas ça) |
| Playwright dans `apps/web` | Package `e2e/` séparé | `apps/web/e2e/` + `playwright.config.ts` dans apps/web suffit ; hors du glob vitest (`src/**`, `scripts/**`) donc aucune collision |

**Installation:**
```bash
pnpm --filter @qualiof/web add -D @playwright/test
# binaires navigateurs (local + CI à la demande, PAS dans le gate PR) :
pnpm --filter @qualiof/web exec playwright install chromium
```

## Architecture Patterns

### Structure des ajouts
```
.github/workflows/
├── ci.yml                  # gate PR : lint + tsc + vitest (+ build image worker)
└── deploy.yml              # on push main : prisma migrate deploy (Vercel/Railway auto-déploient via git)
apps/web/
├── vercel.json             # regions cdg1 (+ crons éventuels) — DANS apps/web (= Root Directory Vercel)
├── playwright.config.ts    # baseURL paramétrable STAGING_BASE_URL, storageState
├── e2e/
│   ├── auth.setup.ts       # login UI → storageState .auth/user.json
│   ├── smoke-routes.spec.ts    # TEST-02 (~10 routes, 2 projets : anonyme + authentifié)
│   ├── closure-flow.spec.ts    # TEST-01 (session E2E- jetable, timeout 15 min)
│   └── teardown-e2e-data.ts    # script tsx Prisma : purge données préfixées E2E-
└── src/lib/pdf-render.ts   # + injection filigrane staging (chokepoint unique)
packages/shared/src/env.ts  # + NEXT_PUBLIC_APP_ENV (client) — et turbo.json globalEnv
```

### Pattern 1 : Flag environnement `NEXT_PUBLIC_APP_ENV`
**What:** Une seule variable, lisible client (bandeau UI) ET serveur (filigrane, garde calendar), validée t3-env.
**When to use:** Toute logique conditionnelle staging/prod.
```ts
// packages/shared/src/env.ts — bloc client
NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
// runtimeEnv : NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
// + ajouter "NEXT_PUBLIC_APP_ENV" à turbo.json globalEnv
```
⚠ Variable `NEXT_PUBLIC_*` = **inlinée au build** dans le bundle client. Passer staging→production en Phase 22 exige un redeploy (trivial : c'est déjà le mécanisme prévu D-01). Côté serveur (server actions, `pdf-render.ts`), `sharedEnv.NEXT_PUBLIC_APP_ENV` est lue au runtime process.env — même valeur.
**Point clé :** ne PAS poser cette variable sur le worker Railway (voir Open Question 1) — le worker génère les packs de production réels déclenchés par l'usage quotidien local.

### Pattern 2 : Filigrane STAGING au chokepoint `pdf-render.ts`
**What:** Injection d'un `<style>` filigrane dans le HTML juste avant l'appel Gotenberg/WeasyPrint. Couvre les 9 actions synchrones d'un coup, zéro modification des 12 templates.
**Technique :** background SVG répété en diagonale sur `body` — le projet a documenté que Gotenberg/Chromium **ne répète pas `position:fixed` sur multi-pages** (commentaire `pdf-render.ts:6-7`), un background se répète naturellement sur chaque page. Gotenberg exige `printBackground=true` pour imprimer les backgrounds ; WeasyPrint imprime les backgrounds par défaut.
```ts
// pdf-render.ts (esquisse)
const WATERMARK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
     <text x="50%" y="50%" text-anchor="middle" transform="rotate(-30 200 150)"
       font-family="Helvetica" font-size="48" fill="rgba(220,38,38,0.16)" font-weight="bold">STAGING</text>
   </svg>`,
);
const WATERMARK_STYLE = `<style>
  body { background-image: url("data:image/svg+xml,${WATERMARK_SVG}") !important;
         background-repeat: repeat !important; -webkit-print-color-adjust: exact; }
</style>`;

function withStagingWatermark(html: string): string {
  if (sharedEnv.NEXT_PUBLIC_APP_ENV !== 'staging') return html;
  return html.includes('</head>')
    ? html.replace('</head>', `${WATERMARK_STYLE}</head>`)
    : WATERMARK_STYLE + html;
}
// renderHtmlToPdf : html = withStagingWatermark(html)
//   + if (sharedEnv.NEXT_PUBLIC_APP_ENV === 'staging') form.append('printBackground', 'true');
// renderHtmlToPdfWeasy : body = withStagingWatermark(html)
```
Ce helper est trivialement testable en unit (Vitest) : injecte/n'injecte pas selon le flag, n'altère pas le footer HTML in-body (non-régression CLAUDE.md).
**Bandeau UI** : dans `apps/web/src/app/app/layout.tsx` (et layout login), un bandeau fixe « ENVIRONNEMENT DE TEST — STAGING » si `NEXT_PUBLIC_APP_ENV === 'staging'`.

### Pattern 3 : Garde Google Calendar staging
**What:** Early-return dans `apps/web/src/lib/calendar/sync-session.ts` (fonction `syncSessionCalendar`) si staging.
**Pourquoi indispensable :** au-delà de D-02, le token OAuth vit dans `files/secrets/google-token.json` (fichier local, memory `reference_google_calendar_oauth`) — **absent du déploiement Vercel**. Sans garde, tout sync depuis le staging échouerait bruyamment. La garde retourne un recap « skipped (staging) » loggé.

### Pattern 4 : CI GitHub Actions (gate PR)
**What:** Un workflow `ci.yml` sur `pull_request` + `push: main`. Points durs découverts :
1. **`next lint` et vitest chargent `next.config.mjs`/`env.ts`** → `createEnv()` fail-loud → il faut un `.env` racine en CI avec des valeurs factices VALIDES (les tests tournaient en local avec le vrai `.env`). Ne pas compter sur `dotenv -e ../../.env` avec fichier manquant.
2. **`dedupe.merge.test.ts` throw à la collection** sans `TEST_DATABASE_URL` pointant une base `*_test` → service container + `prisma db push`.
3. **`prisma generate` requis avant tsc/vitest** (types PrismaClient).
```yaml
# .github/workflows/ci.yml (esquisse vérifiée contre le repo)
name: CI
on:
  pull_request:
  push: { branches: [main] }
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: qualiof, POSTGRES_PASSWORD: qualiof, POSTGRES_DB: qualiof_test }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4          # lit packageManager du package.json
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Write CI .env (valeurs factices valides — env.ts est fail-loud)
        run: |
          cat > .env <<'EOF'
          DATABASE_URL=postgresql://qualiof:qualiof@localhost:5432/qualiof_test
          DIRECT_URL=postgresql://qualiof:qualiof@localhost:5432/qualiof_test
          TEST_DATABASE_URL=postgresql://qualiof:qualiof@localhost:5432/qualiof_test
          AUTH_SECRET=ci-secret-0123456789abcdef0123456789abcdef
          STORAGE_PROVIDER=minio
          EOF
      - run: pnpm --filter @qualiof/db exec prisma generate
      - name: Push schema to test DB (tests intégration dedupe/match-treso)
        run: pnpm --filter @qualiof/db exec dotenv -e ../../.env -- prisma db push --skip-generate
      - run: pnpm lint          # turbo lint = next lint + tsc --noEmit packages
      - run: pnpm --filter @qualiof/web exec tsc --noEmit
      - run: pnpm test          # turbo test = vitest apps/web + packages
  worker-image:                 # CI-01 « build Docker worker » — preuve que l'image compile
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v6
        with: { context: ., file: docker/worker/Dockerfile, push: false }
```
Notes : `prisma db push --skip-generate` (leçon memory sandbox) ; garder le job `worker-image` séparé pour que le gate reste rapide (ou le passer en `push: main` only — discrétion planner, CI-01 dit « build Docker worker » sans préciser PR vs deploy).

### Pattern 5 : Pipeline déploiement (D-09)
**What:** Sur merge dans `main` : Vercel redéploie (git integration native, rien à écrire), Railway rebuild le worker (git integration native), et un workflow GitHub joue les migrations :
```yaml
# .github/workflows/deploy.yml
name: Deploy migrations
on: { push: { branches: [main] } }
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @qualiof/db exec prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}   # schema.prisma lit url + directUrl
          DIRECT_URL: ${{ secrets.DIRECT_URL }}        # :5432 session — la migration passe par directUrl
```
Race migration/deploy acceptée à cette échelle (la baseline `0_init` est déjà appliquée ; les migrations futures sont additives par convention).

### Pattern 6 : Branch protection via `gh api`
```bash
gh api -X PUT repos/LM10031984/CRMNEXTGEN/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": false, "contexts": ["test"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```
`contexts` = nom du job (`test`). `required_pull_request_reviews: null` car Laurent est seul — le gate est la CI, pas la review humaine (Claude ouvre et merge les PR via `gh`, D-07). Séquence : merger `cloud-migration` → `main` D'ABORD (sinon la protection bloque le merge initial), protéger ENSUITE.

### Pattern 7 : Playwright contre staging déployé
```ts
// apps/web/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.STAGING_BASE_URL ?? 'https://<domaine-staging>',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'anonymous', testMatch: /smoke-routes\.spec\.ts/, grep: /@anon/ },
    {
      name: 'authenticated',
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
      testMatch: /(smoke-routes|closure-flow)\.spec\.ts/,
    },
  ],
});
```
- `auth.setup.ts` : ouvre `/login`, remplit email/mdp depuis `E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` (env locale, jamais commitée), attend la redirection `/app`, `page.context().storageState({ path })`. Le login action redirige vers `/app` (`login/actions.ts:129`).
- **Pas de `webServer`** : la cible est distante (D-10). Exécution à la demande : `STAGING_BASE_URL=https://… pnpm --filter @qualiof/web exec playwright test`.
- E2E closure : `test.setTimeout(15 * 60_000)` (pack témoin SES-0093 ≈ 3 min via OpenRouter, marge cold-start Railway) ; poll de l'UI closure jusqu'à complétion ; assert 0 stub (l'UI/status expose le compte de docs) + téléchargement d'un PDF (status 200, magic bytes `%PDF`).
- Compte E2E : créer UN user dédié `e2e@start-academy.fr` (rôle ADMIN, mdp fort) directement en base (script tsx one-shot) — évite d'exposer les credentials de Laurent.
- Teardown : script tsx Prisma qui supprime UNIQUEMENT `TrainingSession` (+ cascade participants/docs/jobs) et `Person`/`TrainingProduct` préfixés `E2E-`, + objets storage sous le préfixe correspondant. Exécuté en `globalTeardown` ET disponible en script standalone (relance manuelle si un run crashe).

### Pattern 8 : Smoke routes (proposition D-12, ~10 routes)
| Route | Anonyme (attendu) | Authentifié (attendu) | Pilier |
|-------|-------------------|----------------------|--------|
| `/login` | 200 | redirect `/app` (déjà loggé) ou 200 | — |
| `/app` (dashboard) | redirect `/login` | 200 | transverse |
| `/app/sessions` | redirect `/login` | 200 | #1 |
| `/app/sessions/[id]` (1ʳᵉ session de la liste) | redirect `/login` | 200 | #1 |
| `/app/apprenants` | redirect `/login` | 200 | #3 |
| `/app/dossiers-opco` | redirect `/login` | 200 | #2 |
| `/app/budget-agefice` | redirect `/login` | 200 | #2 |
| `/app/factures` | redirect `/login` | 200 | #2 |
| `/app/preinscriptions` | redirect `/login` | 200 | #4 |
| `/preinscription/[token]` (token valide créé par le test) | **200** (route publique) | 200 | #4 |
| `/preinscription/token-bidon` | 404/refus propre | idem | #4 |

Mécanique redirect : `app/app/layout.tsx:27` fait `redirect('/login')` → Next renvoie 307 ; en Playwright, asserter `page.url()` finit sur `/login` (plus robuste que le code HTTP).

### Pattern 9 : Rate-limit D-13 — règle WAF Vercel (recommandé)
**What:** Dashboard Vercel → Firewall → New Rule : IF `path` starts with `/preinscription` THEN `Rate Limit` (fixed window, clé `IP`, ex. **30 requêtes / 60s**, action `Deny` 429). Disponible plan Pro (40 règles/projet, fenêtre 10s–10min, clé IP — vérifié docs 2026-06-16). Couvre les GET de la page ET les POST server actions (même path). Zéro code, zéro Redis, dashboard-first (pattern Laurent).
**Pricing** : usage-based sur Pro — au trafic de ce formulaire (quelques dizaines de requêtes/jour), coût négligeable ; le dialog de pricing s'affiche à la création de la première règle (à screenshoter pour l'evidence).
**Fallback code (si refusé au moment du câblage)** : fixed-window Postgres dans les server actions publiques (`preinscription-public.ts`) — table `RateLimitHit(key text, windowStart timestamptz, count int)`, upsert atomique, refus si `count > N`. PAS de middleware in-memory (inutile en serverless : un compteur par instance ≈ pas de limite).

### Anti-Patterns to Avoid
- **Rate-limit in-memory dans `middleware.ts`** : chaque instance serverless a sa propre mémoire — passoire.
- **`position:fixed` pour le filigrane Gotenberg** : non répété multi-pages (expérience projet documentée dans `pdf-render.ts`).
- **Footer Gotenberg natif** : anti-pattern historique — le filigrane ne doit pas toucher au mécanisme footer in-body.
- **Merger depuis `staging-vercel`** : branche obsolète (94 commits derrière), reprendre seulement l'*intention* E1-E4.
- **Scheduler le cron Vercel `api/cron/closure-worker`** : le worker Railway possède la file (`FOR UPDATE SKIP LOCKED`) ; un 2ᵉ consommateur Vercel limité à 60s produirait des jobs closure tronqués/timeout. Ne PAS le déclarer dans `vercel.json` `crons` (voir Open Question 3).
- **Copier le `.env` local tel quel dans Vercel** : il contient des clés mortes (`DOC_ENGINE_URL`, `REDIS_URL`, `RESEND_API_KEY`, `SMARTOF_*`, `YOUSIGN_*`) et des valeurs locales (`GOTENBERG_URL=localhost:3001`). Construire la liste explicitement (checklist ci-dessous).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate-limit par IP | Compteur maison en middleware/memory | Règle WAF Vercel (ou table Postgres fixed-window en fallback) | Serverless = N instances, la mémoire ne compte rien ; le WAF compte au edge |
| Auth E2E | Injection de cookie de session forgé | Playwright storageState via vrai login UI | Le vrai flux valide APP-02 (cookie secure/lax sur le vrai domaine) en même temps |
| Backfill storage | Nouveau script de migration | `apps/web/scripts/migrate-storage.ts` existant (idempotent DRY→WRITE) | Déjà prouvé sur 3109 objets, rapport de comparaison existant |
| Génération E2E de PDF de test | Mock du pipeline closure | Vraie génération OpenRouter sur session `E2E-` (D-11, verrouillé) | Preuve pilier #1 réelle, coût ~centimes |
| Déclenchement deploy | Webhooks maison | Git integrations natives Vercel + Railway sur `main` | D-09, zéro maintenance |

**Key insight:** presque tout le « moteur » existe déjà (Bearer, dry-run mail, script migration, queue Postgres). La valeur de la phase est dans l'orchestration correcte : ordre merge→CI→protection, env Vercel exhaustive, gardes staging avant exposition publique.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI (auth LM10031984) | D-07 PR/merge/protection | ✓ | ok, keyring | — |
| Node | scripts locaux | ✓ | v25.9.0 (CI utilisera 20) | — |
| pnpm | monorepo | ✓ | 10.33.2 | — |
| Docker daemon | test local image worker (optionnel) | ✓ | ok | CI runner |
| Vercel CLI | — | ✗ | — | **Non requis** : dashboard + git integration (pattern D) |
| `psql` | — | ✗ | — | Non requis (Prisma fait tout, leçon 19-02) |
| `@playwright/test` + Chromium | TEST-01/02 | ✗ | à installer (1.61.1 npm) | `pnpm add -D` + `playwright install chromium` |
| URLs publiques Railway (proxy Caddy + WeasyPrint) | APP-03 | ⚠ dépend plan 20-05 | — | **BLOQUANT pour APP-03** : relevé 24h attendu 2026-07-07 |
| Domaine `start-academy.fr` (accès DNS) | D-04 | ⚠ manuel Laurent | — | Sous-domaine à confirmer au câblage (non bloquant pour le plan) |
| Compte Vercel Pro | APP-01 | ⚠ à confirmer | — | Création projet = étape du plan ; vérifier plan Pro actif AVANT (maxDuration + WAF en dépendent) |

**Missing dependencies with no fallback:**
- URLs doc-engines Railway publiques (plan 20-05) — ordonner les plans pour que le câblage APP-03/env Vercel vienne après leur disponibilité.

**Missing dependencies with fallback:**
- Playwright (installation triviale) ; Vercel CLI (non requis).

## Common Pitfalls

### Pitfall 1 : La route publique n'est PAS `/p/[token]`
**What goes wrong:** CONTEXT/REQUIREMENTS/ROADMAP écrivent `/p/[token]`, mais le filesystem est formel : la route est **`apps/web/src/app/preinscription/[token]/`** (vérifié 2026-07-06 ; `ls app/p` → No such file). Le CLAUDE.md (`app/p/[token]`) est périmé.
**Why it happens:** raccourci d'écriture hérité des specs initiales.
**How to avoid:** smoke tests, règle WAF (`path starts with /preinscription`) et success criteria pointent `/preinscription/[token]`. Ne PAS créer de route `/p` — hors scope, et tout renommage exigerait un redirect 308.
**Warning signs:** un smoke qui teste `/p/xxx` et conclut « 404 = OK refus token » serait un faux vert structurel.

### Pitfall 2 : `shared-template.test.ts` passe DÉJÀ — D-08 est soldé
**What goes wrong:** planifier une tâche « corriger le test MIME » qui ne trouve rien à corriger.
**Evidence:** exécution 2026-07-06 : **11/11 passed** ; le mapping `ext === 'jpg' ? 'jpeg'` est dans `shared-template.ts:62,78` ; STATE (plan 20-04) confirmait déjà « suite Vitest 1166/1166 verte ».
**How to avoid:** la tâche CI devient « prouver la suite 100 % verte en CI » (le vrai risque est le Pitfall 3), avec un run complet local en baseline.

### Pitfall 3 : `dedupe.merge.test.ts` THROW sans `TEST_DATABASE_URL` — la CI naïve est rouge
**What goes wrong:** le fichier jette à la collection (`throw new Error('REFUS: …')`, ligne ~30) si `TEST_DATABASE_URL` absent OU si le nom de base ne finit pas par `_test`. En local ça passe car `.env` contient `TEST_DATABASE_URL`. Sur un runner GitHub nu : suite rouge dès la collection.
**How to avoid:** service container `postgres:16` + base `qualiof_test` + `prisma db push --skip-generate` + `TEST_DATABASE_URL` dans le `.env` CI (Pattern 4). C'est un test d'INTÉGRATION réel (il écrit/purge des rows).
**Warning signs:** erreur vitest « REFUS: dedupe.merge.test exige TEST_DATABASE_URL… » dans les logs CI.

### Pitfall 4 : `next.config.mjs` fail-loud au build Vercel — l'env doit être complète AVANT le 1ᵉʳ deploy
**What goes wrong:** `next.config.mjs` fait `await import('@qualiof/shared/env')` top-level → `createEnv()` valide TOUT au build. Clés sans défaut : `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (≥32). Il manque une clé → le build Vercel échoue (c'est voulu, Phase 17), mais un premier deploy « pour voir » échouera systématiquement.
**How to avoid:** saisir l'intégralité de la checklist env (ci-dessous) dans Project Settings AVANT de connecter le repo / déclencher le build. `loadEnv` sur un `.env` absent est silencieux — les valeurs viennent de l'env Vercel, c'est le chemin nominal.
**Checklist env Vercel (~35 clés) :** `DATABASE_URL` (pooler :6543 `?pgbouncer=true&connection_limit=1`), `DIRECT_URL` (:5432), `AUTH_SECRET`, `SESSION_LIFETIME`, `STORAGE_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOTENBERG_URL` (**domaine public proxy Caddy Railway**), `WEASYPRINT_URL` (**service public Railway**), `DOC_ENGINE_TOKEN` (même secret que Railway), `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_FAST/QUALITY/VISION`, `OPENROUTER_BASE_URL`, `OPENROUTER_APP_NAME`, `OPENROUTER_SITE_URL` (=domaine staging), `NEXT_PUBLIC_APP_URL` (=https://domaine), `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_ENV=staging`, `TENANT_DEFAULT_*`, `LOG_LEVEL`, `MAIL_DRY_RUN=true` (garde D-02 explicite, plus sûr que SMTP_HOST vide) — **et les 22 vars `OF_*`** (footer PDF, memory 2026-07-06 : elles ont dû être poussées sur le worker Railway pour le footer cloud ; les 9 rendus synchrones Vercel en ont autant besoin via `of-config.ts`). NE PAS copier : `REDIS_URL`, `DOC_ENGINE_URL`, `SMARTOF_*`, `YOUSIGN_*`, `RESEND_API_KEY`, `OLLAMA_*` (défauts OK), `SMTP_HOST/PASS` (dry-run staging), `TEST_DATABASE_URL`.

### Pitfall 5 : Prisma Client non généré au build Vercel
**What goes wrong:** en pnpm monorepo isolé, le postinstall auto de `@prisma/client` ne trouve pas `packages/db/prisma/schema.prisma` → `next build` casse sur types/client manquants (`prisma generate` n'est câblé nulle part dans `turbo build`).
**How to avoid:** ajouter `"postinstall": "prisma generate"` dans `packages/db/package.json` (`prisma generate` ne lit pas `.env` — les `env()` du datasource ne sont pas résolues au generate ; safe partout : local, CI, Vercel). Alternative : Build Command override Vercel. Le postinstall est plus robuste (couvre aussi la CI).
**Warning signs:** build Vercel « @prisma/client did not initialize yet » ou types `PrismaClient` introuvables.

### Pitfall 6 : Config projet Vercel monorepo
**What goes wrong:** projet créé à la racine → Vercel ne détecte pas l'app ; ou Root Directory `apps/web` mais `vercel.json` laissé à la racine du repo → ignoré.
**How to avoid:** Root Directory = `apps/web` (Vercel détecte pnpm workspace + Turborepo et installe depuis la racine) ; **`vercel.json` DANS `apps/web/`** ; `"regions": ["cdg1"]` (défaut = `iad1` Washington — checklist 17-REGIONS.md : vérifier AUSSI Project Settings > Functions region). Vérifier plan **Pro** actif avant (maxDuration 800s + WAF rate-limit).

### Pitfall 7 : Cookie secure / CSRF — l'essentiel est déjà correct, valider ne rien casser
**What goes wrong (théorie du research flag):** cookie non-secure en HTTPS → login en boucle.
**Réalité vérifiée:** Vercel force `NODE_ENV=production` au build ET au runtime → `auth.ts:22` active `secure` automatiquement ; tout domaine Vercel est HTTPS. Le scénario « login en boucle » ne peut PAS se produire sur Vercel — il se produirait en self-host HTTP.
**CSRF:** Lucia v3 ne fait AUCUNE protection CSRF ; docs officielles : « CSRF protection is handled by Next.js when using form actions ; Route Handlers must implement it yourself ». Audit du repo : **zéro `export async function POST` dans `app/api/`** (mutations = 100 % server actions ; crons = GET + Bearer `CRON_SECRET`). Donc la protection CSRF native de Next (comparaison Origin/Host, compatible proxy Vercel via x-forwarded-host) couvre tout. Pas de `middleware.ts` à créer pour ça. Escape hatch si un jour un proxy custom est devant : `experimental.serverActions.allowedOrigins`.
**Action concrète:** expliciter `sameSite: 'lax'` dans `auth.ts` `sessionCookie.attributes` (aujourd'hui c'est le défaut implicite de Lucia — l'expliciter rend le success criterion 2 vérifiable par grep) ; le smoke login/logout sur le vrai domaine est la preuve runtime.

### Pitfall 8 : Crons Vercel — décider explicitement, ne pas hériter
**What goes wrong:** 3 routes cron existent (`api/cron/closure-worker`, `preinscription-reminders`, `opco-submission-reminders`, sécurisées `CRON_SECRET`). Déclarer `closure-worker` dans `vercel.json` mettrait un 2ᵉ consommateur (maxDuration 60s) en concurrence avec le worker Railway → jobs closure potentiellement traités dans un runtime sans le calibrage cloud.
**How to avoid:** `crons` dans `vercel.json` = au plus les 2 reminders (emails → dry-run en staging de toute façon), JAMAIS `closure-worker`. Si crons déclarés : poser `CRON_SECRET` dans l'env Vercel.

### Pitfall 9 : E2E closure — dépendances runtime réelles
**What goes wrong:** le test E2E échoue pour des raisons d'infra, pas de code : worker Railway endormi/mort, budget OpenRouter, cold start Gotenberg.
**How to avoid:** pré-flight dans le spec (ping `GET /health` du proxy Caddy → 200 attendu, ouvert sans Bearer) ; timeout 15 min ; préfixe `E2E-` + teardown idempotent relançable. Le run E2E est à la demande (D-10) — documenter la commande dans le README du dossier e2e.

### Pitfall 10 : `experimental.serverActions.bodySizeLimit: '40mb'` vs cap Vercel 4,5 MB
**What goes wrong:** la config Next promet 40 MB mais la plateforme Vercel coupe le body à ~4,5 MB quoi qu'il arrive. Tout upload encore routé par une server action (pas direct-to-storage) casserait en prod avec un 413.
**How to avoid:** c'est exactement l'objet des 3 items PENDING 18-SMOKE (re-validation sur Vercel déployé, discrétion CONTEXT) : upload 10 MB direct-to-storage → 200, retry coupure réseau, expiration signed URL. Inclure ces 3 vérifs dans la vague tests. Vérifier aussi qu'aucune server action restante n'accepte de `File` volumineux hors du composant `direct-upload-field`.

### Pitfall 11 : Backfill MinIO AVANT les tests (D-06) — sinon faux verts
**What goes wrong:** des objets créés en local depuis le 2026-07-04 (post-migration) n'existent que dans MinIO ; le staging (STORAGE_PROVIDER=supabase) servirait des liens morts → smoke « docs lisibles » trompeur.
**How to avoid:** re-run `migrate-storage.ts` DRY (comparaison avec `.planning/audit/STORAGE-MIGRATION-REPORT-2026-07-04.md`) → WRITE → vérif 0 lien mort, AVANT la vague Playwright. MinIO non purgé.

## Code Examples

### maxDuration par segment (voie officielle Next.js ≥13.5 App Router)
```ts
// Source: https://vercel.com/docs/functions/configuring-functions/duration
// Dans page.tsx / route.ts du segment concerné — s'applique aussi aux server
// actions invoquées depuis la page. Pro (Fluid) : défaut 300s, max GA 800s.
export const maxDuration = 300;
```
Recommandation de valeurs (discrétion) : pages qui déclenchent un rendu PDF synchrone (fiche session, factures, veille, produits) → `300` explicite (= défaut, mais documenté et grep-able) ; `api/cron/*` → `60` (déjà en place) ; routes export xlsx → `120`. Aucune route n'a besoin de 800s (le rendu Gotenberg d'un doc = quelques secondes ; les gros travaux sont sur le worker Railway).

### vercel.json (dans `apps/web/`)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["cdg1"]
}
```
(+ bloc `"crons"` UNIQUEMENT si les 2 reminders sont retenus — jamais closure-worker, Pitfall 8.)

### Garde staging calendar
```ts
// apps/web/src/lib/calendar/sync-session.ts — en tête de syncSessionCalendar()
import { sharedEnv } from '@qualiof/shared/env';
if (sharedEnv.NEXT_PUBLIC_APP_ENV === 'staging') {
  console.info('[calendar] sync skipped — staging guard (D-02)');
  return { created: 0, updated: 0, deleted: 0, skipped: true } satisfies SyncSessionRecap;
}
```
(Adapter le shape exact au type `SyncSessionRecap` réel du fichier.)

### Teardown E2E (esquisse — worker/CLI-safe, aucun import React/auth)
```ts
// apps/web/e2e/teardown-e2e-data.ts — pattern db-smoke-cloud.ts (Phase 19)
import { prisma } from '@qualiof/db';
const PREFIX = 'E2E-';
// Ordre : docs → jobs/batches → participants → sessions → persons/products de test
// Ne supprime QUE les rows dont le champ nom/label commence par PREFIX.
// (+ suppression des objets storage listés sous les clés des Documents supprimés)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel maxDuration Pro 300s max (research flag « pas 1800s beta ») | Fluid Compute : Pro défaut **300s**, max GA **800s**, extended 1800s (beta/extended) | GA 800s courant 2025 | Confirme le flag roadmap ; aucun besoin >300s ici |
| Rate-limit = Redis/Upstash | WAF Vercel Rate Limiting (fixed window, clé IP) dispo Pro, dashboard | GA (docs à jour 2026-06-16) | D-13 sans code ni Redis |
| Lucia v3 recommandé | Lucia v3 **deprecated upstream** (fin de vie annoncée mars 2025, le projet fonctionne toujours) | 2024-2025 | AUCUNE action Phase 21 — v3 est figée dans le stack et fonctionne sur Vercel ; ne pas migrer maintenant |
| `staging-vercel` branch (E1-E4 gelés) | Reprendre l'intention (filigrane/garde/vercel.json) en code neuf sur `cloud-migration`→`main` | D-01/NB CONTEXT | 0 merge depuis la branche obsolète |

**Deprecated/outdated:**
- `DOC_ENGINE_URL`, `REDIS_URL` : clés mortes encore présentes dans le `.env` local — ne pas propager.
- CLAUDE.md « pas de prod cloud » + « app/p/[token] » : périmés (v6 + Pitfall 1).

## Open Questions

1. **Filigrane et worker Railway (tension D-02)**
   - Ce qu'on sait : le chokepoint `pdf-render.ts` est partagé app + worker. Le worker Railway génère les packs closure RÉELS déclenchés par l'usage quotidien (app locale → base cloud → worker). Poser `NEXT_PUBLIC_APP_ENV=staging` sur le worker filigranerait des documents Qualiopi de production.
   - Ce qui est flou : D-02 dit « PDF marqués d'un filigrane » sans distinguer les PDF rendus par Vercel des packs worker.
   - Recommandation : flag staging sur le projet **Vercel uniquement** → les 9 rendus synchrones déclenchés depuis le staging sont filigranés ; les packs worker restent propres (ce sont des docs réels). Les docs du pack E2E (session jetable) ne sont pas filigranés mais sont supprimés au teardown et jamais diffusés (emails dry-run). À confirmer avec Laurent en une phrase au moment du plan si besoin.
2. **CI-01 « build Docker worker » : sur PR ou sur main ?**
   - Le build image (~3-5 min) ralentit le gate PR que D-10 veut rapide. Recommandation : job `worker-image` sur `push: main` seulement (Railway rebuild de toute façon à chaque merge) — ou sur PR si les fichiers `docker/**` changent (filtre `paths`).
3. **Crons Vercel reminders** : les 2 routes reminders sont-elles déjà couvertes par le worker Railway pm2 (app `reminders` = relances factures ; `preinscription-reminders`/`opco-submission-reminders` semblent être des routes distinctes) ? Recommandation : NE PAS déclarer de crons en Phase 21 (staging, emails dry-run — aucun enjeu), trancher en Phase 22.
4. **Vercel Deployment Protection** : sur Pro, la « Vercel Authentication » peut protéger les previews (et parfois la prod selon config). Les smoke/E2E ciblent l'URL de production du projet — vérifier au 1ᵉʳ deploy que la prod est publique ; si protection activée, utiliser le header `x-vercel-protection-bypass` (secret « Protection Bypass for Automation ») dans Playwright (`extraHTTPHeaders`).
5. **Pricing WAF rate limiting** : usage-based sur Pro, dialog affiché à la création de la règle — valider le montant à l'écran (attendu : négligeable à ce trafic) avant Publish ; sinon fallback Postgres (Pattern 9).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (résolu, `^2.1.8`) + Playwright ^1.61.1 (à installer) |
| Config file | `apps/web/vitest.config.ts`, `packages/db/vitest.config.ts` ; `apps/web/playwright.config.ts` (Wave 0) |
| Quick run command | `pnpm --filter @qualiof/web exec dotenv -e ../../.env -- vitest run <fichier>` |
| Full suite command | `pnpm test` (turbo → vitest web + db) — baseline 1166+ tests verts |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APP-01 | Filigrane injecté si staging, absent sinon ; footer non régressé | unit | `… vitest run src/lib/__tests__/pdf-render.watermark.test.ts` | ❌ Wave 0 |
| APP-01 | Deploy cdg1 + build vert + bandeau staging | manual/smoke | inspection dashboard + `curl -sI https://<domaine>` | ❌ (preuve runtime) |
| APP-02 | Login → /app → logout sur domaine final ; cookie secure+lax | e2e | `playwright test e2e/auth.setup.ts e2e/smoke-routes.spec.ts` | ❌ Wave 0 |
| APP-02 | Form public accessible + token bidon refusé | e2e | inclus smoke-routes.spec.ts | ❌ Wave 0 |
| APP-03 | PDF synchrone rendu via doc-engine public (Bearer) | e2e | téléchargement convocation dans smoke/closure spec, assert `%PDF` | ❌ Wave 0 |
| CI-01 | lint+tsc+vitest verts sur PR ; protection main active | CI | PR témoin + `gh api repos/LM10031984/CRMNEXTGEN/branches/main/protection` | ❌ Wave 0 (workflows) |
| CI-01 | `prisma migrate deploy` sur main | CI | run deploy.yml vert (logs « No pending migrations » ou apply) | ❌ Wave 0 |
| TEST-01 | Pack closure E2E 0 stub sur session jetable | e2e (long) | `STAGING_BASE_URL=… playwright test e2e/closure-flow.spec.ts` | ❌ Wave 0 |
| TEST-02 | ~10 routes : redirect anonyme + 200 authentifié | e2e | `playwright test e2e/smoke-routes.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @qualiof/web exec tsc --noEmit` + vitest ciblé sur les fichiers touchés
- **Per wave merge:** `pnpm test` (suite complète) + `pnpm lint`
- **Phase gate:** CI verte sur PR témoin + Playwright smoke+E2E verts contre staging déployé avant `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `.github/workflows/ci.yml` + `deploy.yml` — CI-01
- [ ] `apps/web/playwright.config.ts` + `e2e/auth.setup.ts` + 2 specs + teardown — TEST-01/02, APP-02/03
- [ ] `apps/web/src/lib/__tests__/pdf-render.watermark.test.ts` — APP-01 (filigrane)
- [ ] Install : `pnpm --filter @qualiof/web add -D @playwright/test` + `playwright install chromium`
- [ ] User E2E dédié en base (script one-shot) + secrets locaux `E2E_LOGIN_*`

## Sources

### Primary (HIGH confidence)
- Codebase (vérifié 2026-07-06 par lecture/exécution) : `apps/web/src/lib/auth.ts`, `pdf-render.ts`, `mailer.ts`, `env.ts`/`env-schemas.ts`, `next.config.mjs`, `turbo.json`, `vitest.config.ts`, `scripts/__tests__/dedupe.merge.test.ts` (throw garde), arborescence `app/` (route `/preinscription/[token]`), absence de `middleware.ts`/`vercel.json`/`.github/`/POST handlers ; **run vitest `shared-template.test.ts` → 11/11 verts**.
- Context7 `/websites/vercel` : duration limits (Pro défaut 300s / max GA 800s / extended 1800s), `export const maxDuration` App Router, `vercel.json` functions.
- WebFetch docs officielles `vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting` (last_updated 2026-06-16) : rate limiting Pro, fixed window, clé IP, 40 règles, fenêtre 10s-10min, pricing usage-based.
- Context7 `/websites/v3_lucia-auth` : CSRF « handled by Next.js for form actions », middleware `verifyRequestOrigin` pour route handlers, cookie attributes.
- `.planning/phases/17-…/17-REGIONS.md` : Vercel `cdg1` FERME, `vercel.json "regions"`, défaut iad1.
- npm registry (2026-07-06) : `@playwright/test` 1.61.1, `vitest` 4.1.10 (dernière — le repo reste en 2.x, ne pas upgrader en Phase 21).

### Secondary (MEDIUM confidence)
- Vercel Deployment Protection (previews protégées par défaut sur Pro, bypass `x-vercel-protection-bypass`) — connaissance training cohérente avec docs, à vérifier au 1ᵉʳ deploy (Open Q4).
- Détection auto Turborepo/pnpm par Vercel avec Root Directory `apps/web` — comportement standard documenté, mais le besoin explicite de `postinstall: prisma generate` (Pitfall 5) doit être prouvé au 1ᵉʳ build.
- Lucia v3 défaut `sameSite: 'lax'` — défaut de la lib (docs montrent l'attribut configurable) ; l'expliciter dans le code lève le doute.

### Tertiary (LOW confidence)
- Comportement `dotenv-cli` sur fichier `-e` manquant (silencieux vs erreur selon versions) — contourné par l'écriture systématique d'un `.env` en CI, donc sans impact.

## Metadata

**Confidence breakdown:**
- Standard stack : HIGH — versions vérifiées npm + codebase, ajouts minimes
- Architecture (Vercel/CI/Playwright) : HIGH — docs officielles Vercel/Lucia + reconnaissance exhaustive du repo (routes, tests, env, chokepoints)
- Pitfalls : HIGH — 3 découvertes prouvées par exécution/ls (route publique, test déjà vert, throw TEST_DATABASE_URL) ; MEDIUM sur les 2 items « à prouver au 1ᵉʳ deploy » (prisma generate Vercel, deployment protection)

**Research date:** 2026-07-06
**Valid until:** ~2026-08-06 (Vercel évolue vite : re-vérifier maxDuration/WAF si la phase glisse d'un mois)
