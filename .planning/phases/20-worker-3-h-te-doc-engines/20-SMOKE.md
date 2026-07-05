# 20-SMOKE — Validations runtime cloud Worker 3ᵉ hôte + Doc-engines (WORK-01..04)

Preuves **RUNTIME** contre l'**infra Railway réelle** (projet `qualiof-worker`,
`061ceb0a-2e42-4a4e-81f6-aed9729c0642`), **NON reproductibles en Vitest hermétique**.
Ce fichier est le **livrable de preuve de la Phase 20** (calque `19-SMOKE.md` /
`18-SMOKE.md`). Étape ops **gatée Laurent** — c'est le **phase gate**.

> ⚠ Rien ici n'est un test hermétique : ce sont des **smoke runtime** contre le
> déploiement Railway réel (worker pm2 + 2 doc-engines publics + Gotenberg privé)
> et le Supabase de Paris/Irlande. Chaque preuve est datée et statuée.

---

## ✅ RÉSULTATS DE VALIDATION — 2026-07-05

**Validation exécutée par l'orchestrateur sur l'infra Railway RÉELLE** (Laurent a
délégué : « gère tout toi » — même modalité qu'en Phases 18/19). CLI Railway
5.23.3 authentifié `laurentmarx@msn.com`, workspace `lm10031984's Projects`.

**Infra déployée :**

| Service | ID | Rôle | Domaine |
| --- | --- | --- | --- |
| worker | `1dea4f58…` | 4 workers pm2 (privé) | interne only |
| gotenberg-proxy | `eac52074…` | Caddy Bearer (public) | `https://gotenberg-proxy-production-a4cf.up.railway.app` |
| weasyprint | `b0426f85…` | Flask Bearer (public) | `https://weasyprint-production-c1ab.up.railway.app` |
| gotenberg | `9a16a91c…` | Chromium (privé) | `gotenberg.railway.internal:3000` |

**Bilan : WORK-01 = VALIDÉ ✓ · WORK-02 = VALIDÉ ✓ · WORK-03 = VALIDÉ (infra) ✓ ·
WORK-04 = infra prête, run E2E au gate Task 3.** Un **blocage plan Pro** est isolé
sur P5 (egress SMTP) — voir ci-dessous, **ce n'est pas un échec de code**.

- **WORK-01 VALIDÉ** — image worker build sur Railway (5 bugs Dockerfile corrigés,
  cf. commit `703f680`), **4 process pm2 online restarts=0**, `pdftoppm 22.12.0`
  répond dans le conteneur ; les 2 doc-engines publics rejettent 401 sans Bearer et
  rendent un vrai PDF (200) avec Bearer sur HTTPS réel.
- **WORK-02 VALIDÉ** — 0 BullMQ / 0 ioredis / 0 REDIS_URL dans le code ; les 2 crons
  croner enregistrés au boot (veille lundi 8h, relances quotidien 8h) ; aucune trace
  Redis. Stabilité : restarts=0 sur les 4 process.
- **WORK-03 VALIDÉ (infra + connectivité)** — le worker **déployé** joint Supabase
  pooler :6543 (round-trip 3 hits, 0 « prepared statement already exists »),
  OpenRouter (200) et les 2 doc-engines en privé (`railway.internal`, 200/200). Le
  **run E2E d'un pack closure Mac éteint (P4)** est l'objet du **gate Task 3**.
- **WORK-04 (infra prête)** — chaîne OCR déployée (poppler dans le conteneur, worker
  ocr online, poll 5000ms) ; anti-dégradation D-06 garantie dans le code
  (`preinscription-extractor.ts:235` → SUBMITTED + aiErrorMsg, jamais EXTRACTED vide).
  Le **dépôt d'un PDF scanné → EXTRACTED (P6)** est l'objet du **gate Task 3**.

**⚠ BLOCAGE PLAN (P5 — egress SMTP, Rule 4 / human-action) :** l'egress TCP sortant
sur **:465 et :587 TIMEOUT vers tout hôte** (OVH `ssl0.ovh.net` ET `smtp.gmail.com`),
alors que **:443 passe** (OVH + Cloudflare). C'est la **signature du plan
Railway free/trial** : les ports SMTP restent bloqués tant que le workspace n'est pas
**Pro**. Le runbook 20-DEPLOY §1 l'avait anticipé. **De plus, le `.env` racine ne
contient PAS les identifiants OVH** (`SMTP_USER`/`SMTP_PASS` vides → mailer en
dry-run). **Deux actions Laurent requises** avant de prouver P5 : (1) activer/propager
le plan **Pro** sur le workspace, (2) fournir les identifiants boîte OVH. Aucune
autre preuve n'est bloquée par ce point.

---

## Pré-requis

- [x] Compte Railway + CLI 5.23.3 authentifié (`railway whoami` = `laurentmarx@msn.com`).
- [x] Projet `qualiof-worker` créé, environnement `production`, **4 services**.
- [x] **Secrets chiffrés Railway** (jamais commités — CLAUDE.md) : `DATABASE_URL` :6543,
      `DIRECT_URL` :5432, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`,
      `DOC_ENGINE_TOKEN` (généré `openssl rand -hex 32`, **même valeur** sur worker +
      proxy + weasyprint), `AUTH_SECRET` (généré). ~27 variables sur le worker.
- [x] `.dockerignore` ajouté : `.env` / secrets jamais dans une couche d'image.
- [x] Domaines publics générés pour gotenberg-proxy (:8080) et weasyprint (:5001).
- [ ] **Plan Pro activé** (bloque P5 egress SMTP) — **action Laurent**.
- [ ] **Identifiants OVH** dans les variables worker (bloque P5 envoi réel) — **action Laurent**.

---

## WORK-01 — Image worker + boot pm2 + pdftoppm (P1)

Prouve que l'image build sur Railway et que les 4 workers bootent sans crash env,
avec poppler disponible pour l'OCR.

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P1a — build image | `railway up -s worker --ci` (Dockerfile turbo prune + poppler + pm2) | Build SUCCESS, image poussée | ✅ **passed** — `Deploy complete`, `containerimage.digest sha256:1bf6d4…` après **5 bugs Dockerfile corrigés** (cf. Déviations) | 2026-07-05 |
| P1b — boot pm2 | `railway logs <dep> -d -s worker` | 4 process online, 0 crash env | ✅ **passed** — `App [closure:0] online` / `[veille:1] online` / `[reminders:2] online` / `[ocr:3] online` | 2026-07-05 |
| P1c — pm2 jlist | `ssh railway-worker "pm2 jlist"` | 4 online, restarts=0 | ✅ **passed** — `closure online restarts=0` · `veille online restarts=0` · `reminders online restarts=0` · `ocr online restarts=0` | 2026-07-05 |
| P1d — pdftoppm | `ssh railway-worker "pdftoppm -v"` | version poppler | ✅ **passed** — **`pdftoppm version 22.12.0`** (Poppler Developers) ; `tsx` = `/pnpm/tsx` | 2026-07-05 |

**Sortie brute P1b/P1c/P1d :**

```
2026-07-05T16:23:42: PM2 log: App [closure:0] online
2026-07-05T16:23:42: PM2 log: App [veille:1] online
2026-07-05T16:23:42: PM2 log: App [reminders:2] online
2026-07-05T16:23:42: PM2 log: App [ocr:3] online
[veille-worker] croner registered (lundi 08:00 Europe/Paris), next: 2026-07-06T06:00:00.000Z
[invoice-reminder-worker] croner registered (quotidien 08:00 Europe/Paris), next: 2026-07-06T06:00:00.000Z
[ocr-worker] started — concurrency=2, poll=5000ms
[closure-worker-pg] started — concurrency=3, poll=3000ms

# pm2 jlist :
closure online restarts=0
veille online restarts=0
reminders online restarts=0
ocr online restarts=0

# pdftoppm -v :
pdftoppm version 22.12.0
Copyright 2005-2022 The Poppler Developers - http://poppler.freedesktop.org
```

---

## WORK-01 — Doc-engines Bearer sur HTTPS public, après cold start (P2)

Prouve que les 2 moteurs PDF publics enforce le Bearer server-side sur le vrai
domaine HTTPS Railway (après redeploiement = cold start D-08), et rendent un PDF réel.

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P2a — proxy /health | `curl $PROXY/health` | 200 sans auth | ✅ **200** | 2026-07-05 |
| P2b — proxy sans Bearer | `curl $PROXY/forms/chromium/convert/html` | 401 | ✅ **401** | 2026-07-05 |
| P2c — proxy avec Bearer | `curl -F files=@index.html -H "Authorization: Bearer <TOKEN>" $PROXY/forms/chromium/convert/html` | 200 + PDF (gate franchi → Gotenberg privé) | ✅ **200** — `bytes=8720 type=application/pdf`, magic `%PDF-` | 2026-07-05 |
| P2d — weasyprint /health | `curl $WEASY/health` | 200 sans auth | ✅ **200** | 2026-07-05 |
| P2e — weasyprint sans Bearer | `curl -X POST $WEASY/pdf` | 401 | ✅ **401** | 2026-07-05 |
| P2f — weasyprint avec Bearer | `curl -X POST -H "Authorization: Bearer <TOKEN>" --data '<html>…' $WEASY/pdf` | 200 + PDF | ✅ **200** — `bytes=3455 type=application/pdf`, magic `%PDF-` | 2026-07-05 |

**Sortie brute P2 :**

```
gotenberg-proxy /health          → HTTP 200
gotenberg-proxy SANS Bearer      → HTTP 401
gotenberg-proxy AVEC Bearer      → HTTP 200  bytes=8720  type=application/pdf  (%PDF-)
weasyprint /health               → HTTP 200
weasyprint /pdf SANS Bearer      → HTTP 401
weasyprint /pdf AVEC Bearer      → HTTP 200  bytes=3455  type=application/pdf  (%PDF-)
```

> Le 200 « avec Bearer » sur le proxy prouve que la requête a **traversé le gate
> Caddy PUIS atteint le Gotenberg privé** (`gotenberg.railway.internal:3000`) et
> obtenu un vrai PDF — le réseau privé Railway fonctionne, Gotenberg n'est jamais
> exposé publiquement.

---

## WORK-02 — 0 Redis, crons croner enregistrés (P3)

Prouve que la bascule BullMQ→Postgres/croner est complète et qu'aucune connexion
Redis n'est tentée au boot.

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P3a — grep BullMQ | `grep -rc "from 'bullmq'" apps/web/src apps/web/scripts` | 0 | ✅ **0** | 2026-07-05 |
| P3b — grep ioredis | `grep -rl "from 'ioredis'\|getWorkerRedis" …` | 0 | ✅ **0** | 2026-07-05 |
| P3c — crons enregistrés | logs worker | veille + reminders croner registered | ✅ **passed** — `[veille-worker] croner registered (lundi 08:00 Europe/Paris)` + `[invoice-reminder-worker] croner registered (quotidien 08:00 Europe/Paris)` | 2026-07-05 |
| P3d — 0 Redis au boot | logs worker | aucune trace ioredis/Redis | ✅ **passed** — aucune ligne Redis/ioredis dans les logs de boot | 2026-07-05 |

---

## WORK-03 — Worker déployé → Supabase + OpenRouter + doc-engines internes (P4 infra)

Prouve que le compute (Amsterdam) joint les données (Supabase) et les dépendances de
génération, **depuis le conteneur déployé** (indépendant du Mac de Laurent).

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P4a — round-trip DB | `ssh railway-worker "node -e 'prisma.tenant.count ×3 + pg_trgm'"` | 3 lectures OK, 0 prepared-stmt error | ✅ **passed** — `tenant.count #0..2=1`, `pg_trgm similarity=0.5555556`, **ROUND-TRIP OK (pooler :6543)** | 2026-07-05 |
| P4b — OpenRouter | `ssh railway-worker "fetch openrouter/v1/models"` | HTTP 200 | ✅ **200** | 2026-07-05 |
| P4c — gotenberg-proxy interne | `fetch $GOTENBERG_URL/health` (railway.internal:8080) | 200 | ✅ **200** | 2026-07-05 |
| P4d — weasyprint interne | `fetch $WEASYPRINT_URL/health` (railway.internal:5001) | 200 | ✅ **200** | 2026-07-05 |
| **P4e — pack closure Mac éteint** | Enqueue ClosureJob témoin, worker Railway claim (SKIP LOCKED) → pack 0 stub | pack complet, 0 stub, PDF Supabase Storage | ⏳ **GATE Task 3** — infra prouvée prête (P4a-d), run E2E + validation visuelle Laurent | — |

**Sortie brute P4a-d :**

```
[worker->supabase] tenant.count #0=1
[worker->supabase] tenant.count #1=1
[worker->supabase] tenant.count #2=1
[worker->supabase] pg_trgm similarity= 0.5555556
[worker->supabase] ROUND-TRIP OK (pooler :6543, Mac-independent)
[worker->openrouter] HTTP 200
[worker->gotenberg-proxy internal] /health HTTP 200
[worker->weasyprint internal] /health HTTP 200
```

---

## WORK-03 — Egress SMTP OVH :465 (P5)

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P5a — egress :465 | `ssh railway-worker "net.connect(465,'ssl0.ovh.net')"` | TCP connect OK (Pro) | ❌ **TIMEOUT** — port SMTP bloqué (workspace non-Pro) | 2026-07-05 |
| P5b — egress :587 | `net.connect(587,'ssl0.ovh.net')` | connect OK | ❌ **TIMEOUT** | 2026-07-05 |
| P5c — contrôle :443 | `net.connect(443,'ssl0.ovh.net')` + `1.1.1.1:443` | connect OK | ✅ **CONNECT OK** (egress général sain) | 2026-07-05 |
| P5d — contrôle :465 autre hôte | `net.connect(465,'smtp.gmail.com')` | — | ❌ **ETIMEDOUT** (blocage générique SMTP, pas OVH) | 2026-07-05 |

**Sortie brute P5 :**

```
[egress :465] TIMEOUT (port blocked?)
[ovh :443] CONNECT OK
[ovh :587] TIMEOUT
[gmail :465] ERR ETIMEDOUT
[cloudflare :443] CONNECT OK
```

**Diagnostic :** :443 passe partout, :465/:587 timeout vers **tout** hôte → **les
ports SMTP sont bloqués par Railway** (signature plan free/trial). **BLOCAGE Laurent
(human-action) :** activer le plan **Pro** + fournir les identifiants OVH
(`SMTP_USER`/`SMTP_PASS`, absents du `.env`). Le code mailer est correct (dry-run
automatique si `SMTP_HOST` vide — aucun crash). **Statut : NON PROUVÉ, bloqué plan.**

---

## WORK-04 — OCR PDF scanné → EXTRACTED + anti-dégradation D-06 (P6)

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P6a — poppler dans le conteneur | `ssh railway-worker "pdftoppm -v"` | version | ✅ **22.12.0** (cf. P1d) | 2026-07-05 |
| P6b — worker OCR online | logs | ocr poll actif | ✅ **passed** — `[ocr-worker] started — concurrency=2, poll=5000ms` | 2026-07-05 |
| P6c — anti-dégradation D-06 | code | échec OCR → SUBMITTED + aiErrorMsg | ✅ **garanti** — `preinscription-extractor.ts:235` (SUBMITTED + aiErrorMsg sur throw) + filet `preinscription-ocr-queue.ts:50` (SUBMITTED si extractor jette) — **jamais EXTRACTED vide** | 2026-07-05 |
| **P6d — CNI scannée → EXTRACTED réel** | Déposer /p/[token] un PDF scanné sans couche texte → SUBMITTED → worker OCR (pdftoppm + vision OpenRouter) → EXTRACTED données réelles | statut EXTRACTED, nom/prénom/numéro anonymisés | ⏳ **GATE Task 3** — infra prête (P6a-c), run + validation visuelle Laurent | — |

---

## WORK-02/03 — Stabilité 24 h + coût sous budget D-07 (P7)

| Étape | Commande | Attendu | Résultat | Date |
| --- | --- | --- | --- | --- |
| P7a — stabilité au boot | `pm2 jlist` | 4 online, restarts=0 | ✅ **passed** — restarts=0 sur les 4 (pas de crash-loop) | 2026-07-05 |
| P7b — uptime 24 h | `pm2 jlist` après ~24 h | up, 0 restart en boucle | ⏳ **observation 24 h** — à relever le 2026-07-06 | — |
| P7c — coût projeté | facturation Railway 24 h → /mois | ≤ ~20-25 € (D-07) | ⏳ **observation 24 h** — 4 services chauds (D-08), à relever avec P7b | — |

> Le worker ne fait qu'un poll léger (concurrency 3, intervalle 3s) + 2 crons dormants
> + 1 OCR poll (5s) ; les doc-engines sont idle hors requête. Dimensionnement au
> minimum conforme à RESEARCH Open Q3. Relevé coût/uptime au +24 h (P7b/c).

---

## Déviations d'exécution (bugs réels corrigés — Rule 1/2/3)

Le plan 20-04 a livré l'**image + config sans les avoir jamais construites ni
bootées**. Le build/boot **réel** Railway a révélé **6 bugs** corrigés inline
(commit `703f680`) — c'est exactement le rôle du plan 20-05 (preuve runtime) :

1. **[Rule 3] `ERR_PNPM_NO_GLOBAL_BIN_DIR`** — `pnpm add -g turbo/pm2/tsx` échoue sur
   `node:20-slim` (pas de global bin dir). Fix : `ENV PNPM_HOME=/pnpm` + PATH + mkdir
   dans le stage `base`.
2. **[Rule 1] `prisma generate` KO** — `pnpm --filter @qualiof/web exec prisma` →
   `Command "prisma" not found` (prisma vit dans `@qualiof/db`). Fix :
   `cd packages/db && pnpm exec prisma generate`.
3. **[Rule 2] moteur Prisma openssl** — warning « failed to detect libssl » →
   `apt install openssl ca-certificates` dans installer + runner (moteur correct +
   TLS sortant Supabase/OpenRouter).
4. **[Rule 1] `interpreter: 'tsx'` introuvable** — tsx en devDep locale non résolue
   par pm2. Fix : `pnpm add -g pm2 tsx` (tsx global).
5. **[Rule 1] `ERR_MODULE_NOT_FOUND '@/lib'` + `tsconfig.base.json not found`** —
   turbo prune n'embarque pas `tsconfig.base.json` et tsx ne résout pas l'alias `@/*`
   depuis /app. Fix : `COPY tsconfig.base.json ./` + ecosystem `cwd: apps/web` +
   `TSX_TSCONFIG_PATH=/app/apps/web/tsconfig.json` par app.
6. **[Rule 1] `SyntaxError: react does not provide export 'cache'`** (reminders) — le
   worker importait la server action `@/server/actions/invoices` ('use server' →
   next/cache + `@/lib/auth` → `import { cache } from 'react'`), qui casse en Node ESM
   brut (règle projet « Worker jamais d'imports auth React »). Fix : **cœur neutre**
   `apps/web/src/lib/invoice-reminders/invoice-reminder-core.ts` (worker-safe, logique
   cron identique) ; handler + test repointés ; `tsc --noEmit` exit 0, 7/7 tests verts.

**Bonus [Rule 2] `.dockerignore`** ajouté — jamais de `.env`/secret/`node_modules`
dans une couche d'image.

---

## Validation Sign-Off

| Requirement | Statut | Preuve |
| --- | --- | --- |
| **WORK-01** (image + doc-engines Bearer) | ✅ **VALIDÉ** | P1 (4 pm2 up, pdftoppm 22.12.0) + P2 (401/200 PDF réel sur HTTPS public, 2 moteurs) |
| **WORK-02** (0 Redis, crons, stabilité) | ✅ **VALIDÉ** | P3 (0 bullmq/ioredis, 2 crons registered) + P7a (restarts=0) |
| **WORK-03** (pack cloud Mac éteint) | 🟡 **INFRA VALIDÉE, run au gate** | P4a-d (DB/OpenRouter/doc-engines joints depuis le conteneur) ; **P4e = gate Task 3** ; **P5 SMTP bloqué plan Pro** |
| **WORK-04** (OCR PDF scanné) | 🟡 **INFRA VALIDÉE, run au gate** | P6a-c (poppler + ocr online + D-06 garanti code) ; **P6d = gate Task 3** |

**Blocages remontés à Laurent (human-action) :**
1. **Plan Pro** non confirmé → egress SMTP :465/:587 bloqué (P5). Activer/propager Pro.
2. **Identifiants OVH** absents du `.env` (`SMTP_USER`/`SMTP_PASS` vides) → à fournir
   pour l'envoi réel P5.
3. **Runs E2E gatés (P4e pack closure Mac éteint, P6d OCR CNI scannée)** → validation
   visuelle Laurent = **checkpoint Task 3**.

**Observation +24 h (P7b/c)** : uptime + coût projeté à relever le 2026-07-06.

- [ ] **Phase gate 20** — cochée par Laurent après validation visuelle du pack témoin
      cloud (P4e) + OCR (P6d) au checkpoint Task 3, et déblocage SMTP Pro (P5).
