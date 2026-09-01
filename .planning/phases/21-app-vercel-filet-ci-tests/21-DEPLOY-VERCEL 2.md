# 21-DEPLOY-VERCEL — Runbook de déploiement Vercel (app Next.js, staging gardé)

> **Pour qui ?** Ce runbook est écrit pour être suivi au **dashboard Vercel** par un
> non-technicien (Laurent, pattern verrouillé RESEARCH/CONTEXT — la CLI Vercel est
> **explicitement exclue**). Aucune commande à taper : tout se fait par clic et
> copier-coller de variables. Claude a déjà automatisé tout ce qui est automatisable
> (code mergé dans `main` au 21-03, `apps/web/vercel.json` avec `regions: ["cdg1"]`,
> postinstall `prisma generate`, bandeau STAGING, filigrane PDF, `MAIL_DRY_RUN`).
> Il ne reste QUE les actions dashboard Vercel + la zone DNS du registrar.

L'objectif : l'app QualiOF répond en **HTTPS sur le domaine final**, servie depuis
**cdg1** (Paris), en mode **staging gardé** (`NEXT_PUBLIC_APP_ENV=staging` : bandeau UI,
filigrane PDF, mails en dry-run, sync calendrier coupée). Les données restent sur
Supabase, le compute PDF/workers reste sur Railway (Phase 20).

---

## 1. Prérequis (à vérifier AVANT de commencer)

1. **Plan Vercel Pro actif** — OBLIGATOIRE, pas un confort :
   - `maxDuration` élevé des pages PDF synchrones (posé au 21-01) dépasse la limite Hobby ;
   - les **règles WAF rate-limit** (section 7) sont une fonctionnalité Pro.
   - Vérifier dans **Vercel Dashboard → Settings (team) → Billing** : plan **Pro**.
2. **Plan 20-05 terminé** (c'est le cas au 2026-07-06 : 4 services Railway up, Bearer prouvé
   401/200 — voir `20-SMOKE.md`). Relever dans le **dashboard Railway** :
   - le **domaine public du service `gotenberg-proxy`** (proxy Caddy — Gotenberg lui-même
     reste privé) → servira de valeur à `GOTENBERG_URL` ;
   - le **domaine public du service `weasyprint`** → servira de valeur à `WEASYPRINT_URL` ;
   - la valeur de **`DOC_ENGINE_TOKEN`** (Railway → service worker → Variables — le **même
     secret** doit être posé sur Vercel).
   - Où : Railway → projet → service → **Settings → Networking → Public Networking**
     (le domaine `https://….up.railway.app`).
3. **Accès à la zone DNS de `start-academy.fr`** (registrar) pour poser le CNAME du
   sous-domaine final (section 6).

---

## 2. Création du projet

1. **Vercel Dashboard → Add New… → Project** → importer le repo GitHub
   **`LM10031984/CRMNEXTGEN`**.
2. **Root Directory = `apps/web`** (⚠ Pitfall 6 — cliquer « Edit » à côté de Root Directory).
   Vercel détecte le monorepo pnpm workspace + Turborepo et installe depuis la racine.
   ⚠ **Build Command = `next build`** (Override dans Build & Deployment) — RETOUR TERRAIN
   2026-07-06 : le défaut `turbo run build` échoue sur le cycle workspace pré-existant
   `@qualiof/db#build ↔ @qualiof/shared#build` (cf. deferred-items 21-03) ; les packages
   ne buildent pas d'artefacts (pattern projet), `next build` seul suffit.
3. **Framework Preset = Next.js** (auto-détecté).
4. **⚠ NE PAS CLIQUER « Deploy » tout de suite** : `next.config.mjs` est **fail-loud**
   (Pitfall 4) — sans les variables d'environnement de la section 3, le build échoue
   volontairement. Saisir d'abord TOUTES les variables (le formulaire d'import permet
   d'ajouter les Environment Variables avant le 1er build — sinon les saisir dans
   Settings → Environment Variables après avoir annulé le 1er build raté).
5. Après création, vérifier dans **Project → Settings** :
   - **Build & Deployment → Node.js Version = `24.x`** (ou 22.x ≥ 22.18) — ⚠ CRITIQUE :
     `next.config.mjs` importe `packages/shared/src/env.ts` BRUT (TypeScript) et dépend du
     **type-stripping natif de Node**. C'est la cause exacte du fix `node-version: 24` en CI
     (21-03) : en Node 20 le build casse avec `ERR_UNKNOWN_FILE_EXTENSION`.
   - **Functions → Function Region = Paris (cdg1)** — le `apps/web/vercel.json` du repo
     force `regions: ["cdg1"]`, mais vérifier à l'écran (défaut US = `iad1`,
     checklist anti-défaut-US `17-REGIONS.md`).
   - **Git → Production Branch = `main`**.

---

## 3. Variables d'environnement — tableau COMPLET (50 clés = 28 app + 22 OF_*)

À saisir dans **Project → Settings → Environment Variables**, environnement
**Production** (le staging EST la production du projet pour l'instant, D-04 : on ne
communique pas le domaine à l'équipe avant la Phase 22).
**Type « Sensitive »** pour chaque ligne marquée **Sensitive** ci-dessous.

> ⚠ **Aucune valeur de secret n'est écrite ici** — la colonne « Valeur ou Source »
> renvoie au `.env` local (racine du repo, sur le Mac de Laurent) ou au dashboard Railway.

### 3.1 Base de données (Supabase, Phase 19)

| Nom | Valeur ou Source | Type |
| --- | --- | --- |
| `DATABASE_URL` | `.env` local — pooler **:6543** avec `?pgbouncer=true&connection_limit=1` | **Sensitive** |
| `DIRECT_URL` | `.env` local — session pooler **:5432** sans pgbouncer | **Sensitive** |

### 3.2 Auth (Lucia)

| Nom | Valeur ou Source | Type |
| --- | --- | --- |
| `AUTH_SECRET` | `.env` local (≥ 32 caractères) | **Sensitive** |
| `SESSION_LIFETIME` | `2592000` | normal |

### 3.3 Storage (Supabase Storage, Phase 18)

| Nom | Valeur ou Source | Type |
| --- | --- | --- |
| `STORAGE_PROVIDER` | `supabase` | normal |
| `SUPABASE_URL` | `.env` local (URL du projet Supabase) | normal |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` local | **Sensitive** |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env` local (= `SUPABASE_URL`, publiable) | normal |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env` local (clé anon, publiable) | normal |

### 3.4 Doc-engines Railway (APP-03 — le code `pdf-render.ts` est déjà prêt, il ne manque QUE ces 3 clés)

| Nom | Valeur ou Source | Type |
| --- | --- | --- |
| `GOTENBERG_URL` | `https://` + domaine public Railway du **proxy Caddy `gotenberg-proxy`** (section 1.2) | normal |
| `WEASYPRINT_URL` | `https://` + domaine public Railway du service **`weasyprint`** (section 1.2) | normal |
| `DOC_ENGINE_TOKEN` | Railway → service worker → Variables (**même valeur** que Railway) | **Sensitive** |

### 3.5 IA (OpenRouter, Phase 16)

| Nom | Valeur ou Source | Type |
| --- | --- | --- |
| `AI_PROVIDER` | `openrouter` | normal |
| `OPENROUTER_API_KEY` | `.env` local | **Sensitive** |
| `OPENROUTER_MODEL_FAST` | `anthropic/claude-haiku-4.5` | normal |
| `OPENROUTER_MODEL_QUALITY` | `anthropic/claude-sonnet-4.6` | normal |
| `OPENROUTER_MODEL_VISION` | `anthropic/claude-haiku-4.5` | normal |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | normal |
| `OPENROUTER_APP_NAME` | `QualiOF` | normal |
| `OPENROUTER_SITE_URL` | `https://` + domaine staging (section 6, ex. `https://app.start-academy.fr`) | normal |

### 3.6 App + gardes staging

| Nom | Valeur ou Source | Type |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://` + domaine staging (le même que `OPENROUTER_SITE_URL`) | normal |
| `NEXT_PUBLIC_APP_NAME` | `QualiOF` | normal |
| `NEXT_PUBLIC_APP_ENV` | `staging` — ⚠ exactement `NEXT_PUBLIC_APP_ENV=staging` : arme le bandeau UI, le filigrane PDF et la garde calendrier (21-01) | normal |
| `TENANT_DEFAULT_NAME` | `Start Academy` | normal |
| `TENANT_DEFAULT_NUM_DA` | `.env` local (vide accepté) | normal |
| `TENANT_DEFAULT_SIRET` | `.env` local (vide accepté) | normal |
| `LOG_LEVEL` | `info` | normal |
| `MAIL_DRY_RUN` | `true` — garde D-02 : poser `MAIL_DRY_RUN=true` EXPLICITEMENT (plus sûr que compter sur SMTP_HOST vide) et **NE PAS poser** `SMTP_HOST` / `SMTP_PASS` | normal |

### 3.7 Les 22 variables `OF_*` (footer PDF, lues par `of-config.ts`)

**Source : Railway → service worker → Variables** — les 22 valeurs y sont déjà posées et
**validées par le pack témoin SES-0094** (2026-07-06). Ne PAS partir du `.env` local
(plusieurs y sont vides). Copier chacune à l'identique, type normal (sauf `OF_IBAN` /
`OF_BIC` : **Sensitive**).

| # | Nom | Type |
| --- | --- | --- |
| 1 | `OF_NAME` | normal |
| 2 | `OF_SIRET` | normal |
| 3 | `OF_RNQ` | normal |
| 4 | `OF_TVA_INTRA` | normal |
| 5 | `OF_ADDRESS_STREET` | normal |
| 6 | `OF_ADDRESS_CP` | normal |
| 7 | `OF_ADDRESS_VILLE` | normal |
| 8 | `OF_EMAIL` | normal |
| 9 | `OF_PHONE` | normal |
| 10 | `OF_IBAN` | **Sensitive** |
| 11 | `OF_BIC` | **Sensitive** |
| 12 | `OF_CONTACT_CIVILITE` | normal |
| 13 | `OF_CONTACT_NOM` | normal |
| 14 | `OF_CONTACT_PRENOM` | normal |
| 15 | `OF_CONTACT_EMAIL` | normal |
| 16 | `OF_CONTACT_PHONE` | normal |
| 17 | `OF_RESP_CIVILITE` | normal |
| 18 | `OF_RESP_NOM` | normal |
| 19 | `OF_RESP_PRENOM` | normal |
| 20 | `OF_RESP_TITRE` | normal |
| 21 | `OF_RESP_EMAIL` | normal |
| 22 | `OF_RESP_PHONE` | normal |

### 3.8 ⛔ NE PAS COPIER (clés mortes ou locales — les copier casserait ou polluerait)

| Clé | Pourquoi |
| --- | --- |
| `REDIS_URL` | Redis viré (D-03, Phase 20) — la clé n'existe plus dans `env.ts` |
| `DOC_ENGINE_URL` | microservice jamais créé, clé morte |
| `SMARTOF_*` (BASE_URL, FIREBASE_API_KEY, EMAIL, PASSWORD) | import legacy local uniquement |
| `YOUSIGN_*` (API_KEY, BASE_URL) | palier futur, non câblé |
| `RESEND_API_KEY` | provider alternatif non utilisé |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | dry-run garanti : leur ABSENCE + `MAIL_DRY_RUN=true` = zéro mail réel |
| `OLLAMA_*` | défauts OK, fallback dev local uniquement |
| `S3_*` (ENDPOINT, KEYS, BUCKETS…) | MinIO local, inutiles en mode `supabase` |
| `TEST_DATABASE_URL` | base de tests locale |
| `QUALIOPI_GEN_*` | service externe legacy, non utilisé |
| `CRON_SECRET`, `MONTHLY_REVENUE_TARGET`, `ANTHROPIC_*`, `CLOSURE_OLLAMA_MODEL_DEROULE` | locaux/optionnels, défauts OK |

---

## 4. Premier déploiement

1. Toutes les variables saisies ? Relire le tableau une dernière fois (les 5 clés
   **sans défaut** de `env.ts` font échouer le build si absentes : `DATABASE_URL`,
   `DIRECT_URL`, `AUTH_SECRET`, `WEASYPRINT_URL`, `STORAGE_PROVIDER`).
2. Déclencher le déploiement : **Deployments → … → Redeploy** (ou le « Deploy » du
   formulaire d'import). Attendre le status **Ready** (vert).
3. **Dépannage** :
   - `@prisma/client did not initialize` → vérifier que l'install a bien joué le
     `postinstall prisma generate` de `packages/db` (plan 21-01) — Root Directory
     `apps/web` mal posé en est la cause classique ;
   - `PrismaClientInitializationError` au **runtime** (build vert, 500 sur toutes les
     routes DB) → le moteur `rhel-openssl-3.0.x` du store pnpm n'est pas tracé dans le
     bundle serverless. RETOUR TERRAIN 2026-07-06 : fixé dans le repo via
     `experimental.outputFileTracingIncludes` de `apps/web/next.config.mjs` (glob
     resserré sur `@prisma+client*/node_modules/.prisma/client/*.node` — un glob `**`
     récursif bloque « Collecting build traces » > 10 min). Déjà mergé dans `main`
     (PRs #2/#3), rien à refaire ;
   - erreur `createEnv` / « Invalid environment variables » → une clé du tableau
     manque ou est mal orthographiée, relire la section 3 (le nom exact fautif est
     dans le log de build) ;
   - `ERR_UNKNOWN_FILE_EXTENSION` (.ts) → Node.js Version du projet ≠ 22.18+/24
     (section 2.5) ;
   - build vert mais 500 au runtime → regarder **Observability → Logs** du deployment.

---

## 5. Deployment Protection (Open Q4)

**Project → Settings → Deployment Protection** :

- La **production du projet doit être PUBLIQUE** (sinon les smoke curl et les E2E
  Playwright des plans 21-05/21-06 recevront la page d'auth Vercel au lieu de l'app).
  Si « Vercel Authentication » est activée : la régler sur **Standard Protection**
  (previews seulement) ou la désactiver pour la production.
- Si Vercel Authentication reste active sur les **previews**, c'est OK.
- Si « Protection Bypass for Automation » est activé : **noter le secret** (il sera
  passé par Playwright dans le header `x-vercel-protection-bypass` aux plans 21-05/21-06).

---

## 6. Domaine final (D-04)

1. **Confirmer le sous-domaine exact avec Laurent** — proposition : `app.start-academy.fr`.
2. **Project → Domains → Add** → saisir le sous-domaine choisi.
3. Vercel affiche l'enregistrement à créer : dans la **zone DNS de `start-academy.fr`**
   (registrar), créer un **CNAME** du sous-domaine vers **`cname.vercel-dns.com`**.
4. Attendre que le domaine passe à **Valid Configuration** dans Project → Domains
   (propagation DNS : de quelques minutes à ~1 h). Le certificat HTTPS est émis
   automatiquement par Vercel.
5. ⚠ **Ne PAS communiquer le domaine à l'équipe** — l'ouverture aux utilisateurs est
   la Phase 22.

---

## 7. WAF rate-limit sur /preinscription (D-13)

**Project → Firewall → New Rule** (fonctionnalité Pro) :

- **IF** : Request Path **starts with** `/preinscription`
  (⚠ la VRAIE route publique — PAS `/p/`, Pitfall 1 ; vérifiée dans
  `apps/web/src/app/preinscription/[token]`).
- **THEN** : **Rate Limit** — fenêtre **fixed window**, clé **IP address**,
  **30 requêtes / 60 secondes**, action **Deny** (répond **429**).
- Cette règle couvre le GET de la page ET les POST des server actions (même path).
- **Dialog pricing** : à la création de la 1ʳᵉ règle, Vercel affiche un dialog
  usage-based (facturation à la requête évaluée). Valider le montant affiché à
  l'écran — attendu négligeable au trafic actuel.
- **Fallback si le pricing est refusé** : rate-limit applicatif **fixed-window en
  table Postgres** dans `preinscription-public.ts` (PAS de Redis — viré D-03, PAS de
  middleware in-memory — inutile en serverless multi-instance). À planifier en quick
  task si ce cas se présente.
- Cliquer **Publish** (une règle sauvée en draft ne filtre RIEN).

---

## 8. Crons : AUCUN

⚠ Pitfall 8 — **ne créer AUCUN cron Vercel** :

- jamais `closure-worker` (le worker Railway est le SEUL consommateur de la file
  Postgres `ClosureJob` — un 2ᵉ consommateur concurrent corromprait les batchs) ;
- les reminders/relances sont déjà des crons `croner` sur le worker Railway (20-01) ;
- la question des reminders côté app est tranchée en Phase 22.

Le `apps/web/vercel.json` du repo ne contient volontairement AUCUN bloc `crons`.

---

## 9. RÉSULTATS DE VALIDATION

> Rempli en Task 3 du plan 21-04 (vérification runtime curl, evidence datée du 2026-07-06).
>
> ⚠ **Domaine final : PENDING DNS webmaster** — `app.start-academy.fr` est attaché au
> projet côté Vercel mais la zone DNS est gérée par le compte OVH du webmaster de Laurent
> (registrar Scaleway/bookmydomain). En attente : **CNAME `app` → `cname.vercel-dns.com.`**
> \+ **TXT `_vercel` = `vc-domain-verify=app.start-academy.fr,c75f8d7f67609b827823`**.
> DÉCISION UTILISATEUR : les vérifications ci-dessous et les vagues suivantes (21-05/21-06)
> se font sur **`https://qualiof.vercel.app`** en attendant.

`DOMAIN = qualiof.vercel.app`

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| Région + HTTPS | `curl -sI https://DOMAIN/login` | 200 + `x-vercel-id` contient `cdg1` | ✅ `HTTP/2 200`, `x-vercel-id: cdg1::cdg1::j45qd-…` | 2026-07-06 |
| Bandeau staging (APP-01) | `curl -s https://DOMAIN/login \| grep -c "STAGING"` | ≥ 1 | ✅ `1` | 2026-07-06 |
| Redirect auth (APP-02) | `curl -s -o /dev/null -w "%{http_code}" https://DOMAIN/app` | 307 + `location: /login` | ✅ `307`, `location: /login` | 2026-07-06 |
| Route publique (Pitfall 1) | `curl … https://DOMAIN/preinscription/token-bidon-e2e` | 200 ou 404, JAMAIS 500 | ✅ `404` (refus propre) | 2026-07-06 |
| Rate-limit (D-13) | rafale 40× `/preinscription/rl3-probe-$i` | ≥ 1 réponse de blocage | ✅ `29× 404` puis **`11× 403`** — ⚠ déviation : la WAF Vercel répond **403**, PAS 429 (voir note) | 2026-07-06 |
| Cookie flags (APP-02 partiel) | `curl -sI https://DOMAIN/login` | note : secure garanti par NODE_ENV=production, sameSite lax (21-01) — preuve finale au 21-05 | ✅ Aucun `set-cookie` sur le GET (attendu — le cookie Lucia n'apparaît qu'au POST login) ; `secure` vient de NODE_ENV=production Vercel (Pitfall 7), `sameSite: 'lax'` explicite posé au 21-01 ; preuve finale = 21-05 auth.setup Playwright | 2026-07-06 |

**Note rate-limit 403 vs 429** : la règle WAF `rule_rate_limit_preinscription_t0PSkN`
(fixed window 30 req/60 s par IP, action **deny**, path starts-with `/preinscription`,
posée et PUBLIÉE via API le 2026-07-06) bloque avec un **403** et non le 429 attendu au
plan. Protection fonctionnellement équivalente (le blocage mord après exactement
30 requêtes dans la fenêtre : le 404 du check « route publique » comptait dans la même
fenêtre → 1 + 29 = 30 passées, puis 10-11 blocages). Fenêtre de 60 s respectée avant
tout autre appel `/preinscription`.

### Annexe — sorties brutes (2026-07-06, UTC)

```
$ curl -sI https://qualiof.vercel.app/login          # 2026-07-06T11:54:26Z
HTTP/2 200
age: 0
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
content-type: text/html; charset=utf-8
date: Mon, 06 Jul 2026 11:54:26 GMT
server: Vercel
strict-transport-security: max-age=63072000; includeSubDomains; preload
vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch
x-matched-path: /login
x-powered-by: Next.js
x-vercel-cache: MISS
x-vercel-id: cdg1::cdg1::j45qd-1783338866100-7c3bd4da8a60

$ curl -s https://qualiof.vercel.app/login | grep -c "STAGING"   # 2026-07-06T12:01:43Z
1

$ curl -s -o /dev/null -w "%{http_code}\n" https://qualiof.vercel.app/app
307
$ curl -sI https://qualiof.vercel.app/app | grep -i "^location\|^HTTP"
HTTP/2 307
location: /login

$ curl -s -o /dev/null -w "%{http_code}\n" https://qualiof.vercel.app/preinscription/token-bidon-e2e
404

$ for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}\n" \
    https://qualiof.vercel.app/preinscription/rl3-probe-$i; done | sort | uniq -c
  11 403
  29 404
# 2026-07-06T12:02:08Z — blocage WAF = 403 (déviation vs 429 attendu), voir note ci-dessus
```

---

## Récapitulatif

- **Plateforme** : Vercel **Pro**, région fonctions **cdg1** (Paris — `vercel.json` du repo).
- **Projet** : import `LM10031984/CRMNEXTGEN`, Root Directory **`apps/web`**,
  Production Branch `main`, **Node.js 24.x** (type-stripping natif requis).
- **50 variables** (28 app + 22 `OF_*` copiées du worker Railway), env saisie **AVANT**
  le 1er build (fail-loud). `NEXT_PUBLIC_APP_ENV=staging` + `MAIL_DRY_RUN=true` = staging gardé.
- **Domaine final** : sous-domaine de `start-academy.fr` (à confirmer, ex.
  `app.start-academy.fr`), CNAME `cname.vercel-dns.com`, non communiqué à l'équipe.
- **WAF** : rate-limit IP 30 req/60 s Deny 429 sur `/preinscription`.
- **Crons Vercel : zéro.**
