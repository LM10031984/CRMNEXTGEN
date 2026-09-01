# Phase 20: Worker 3ᵉ hôte + doc engines - Research

**Researched:** 2026-07-05
**Domain:** Cloud PaaS deployment (Railway) · Docker monorepo (turbo prune + pm2 + poppler) · Postgres-queue workers · doc-engines HTTPS authentifié · OCR relocalisé
**Confidence:** HIGH (décisions verrouillées en CONTEXT.md, code de bascule déjà écrit et testé structurellement) — MEDIUM sur les valeurs exactes de facturation Railway (à confirmer 24 h en exécution)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hébergeur (WORK-01)**
- **D-01 :** Railway vs Fly tranché par Claude PENDANT la recherche (délégation explicite Laurent). Critère n°1 : **simplicité d'exploitation pour un non-technicien** (dashboard visuel, zéro CLI au quotidien, logs lisibles). Critère n°2 : coût réel dans le budget D-07. Région EU conforme à `17-REGIONS.md` (Railway `europe-west4` / Fly `cdg`). Biais assumé : Railway pressenti ; Fly retenu seulement si avantage net prix/fiabilité.
- **D-02 :** Supabase explicitement ÉCARTÉ comme hôte des workers/doc-engines (Edge Functions = Deno court, pas de conteneurs long-vivants, pas de poppler/Chromium). **Ne pas re-proposer.**

**Redis / architecture queue (WORK-02)**
- **D-03 :** **Redis viré partout — 0 Redis, ni Upstash ni co-localisé.** Confirme et étend la décision v6 (2026-06-03).
  - Closure : bascule sur le driver Postgres SKIP LOCKED **déjà écrit** (`queue-postgres.ts` + `closure-worker-postgres.ts`), qui devient le worker de prod.
  - Veille + relances factures : porter leur planification (cron hebdo lundi 8h / quotidien 8h Europe/Paris) sur un **planificateur interne au process worker** (node-cron ou équivalent) — plus de BullMQ ni de connexion Redis.
- **D-04 :** WORK-02 (« décision Redis tranchée sur facturation observée 24 h ») se réinterprète : décision prise (0 Redis) ; la preuve 24 h devient **stabilité 24 h du worker sans Redis + coût mensuel projeté sous budget** (pas de comparaison Upstash à mener).
- **Note roadmap :** « 3 workers BullMQ » = caduc → lire « 3 workers de fond » ; BullMQ/ioredis sortent du chemin de prod (retrait deps = discrétion Claude).

**OCR pré-inscriptions (WORK-04, pilier #4)**
- **D-05 :** **Rasterisation relocalisée sur le worker** — pas de dégradation texte-seul. Les PDF scannés (CNI/RIB/CFP) passent par pdftoppm/poppler installé sur le 3ᵉ hôte, puis vision via OpenRouter. Qualité identique ; quelques secondes de latence async en plus acceptées.
- **D-06 :** Aucune dégradation silencieuse : si l'OCR échoue, échec propre avec message utilisateur/admin explicite (jamais un auto-fill vide sans explication).

**Budget + disponibilité (WORK-03)**
- **D-07 :** Budget cible **~20-25 €/mois** pour l'ensemble du 3ᵉ hôte (worker + Gotenberg + WeasyPrint).
- **D-08 :** **Tout toujours chaud** — pas de scale-to-zero. Critère de succès #2 (« appel après cold start ») se lit : réussite après **redéploiement/restart**, pas après endormissement.
- **D-09 :** Recalibrage worker latence cloud : timeout 600 s → ~120 s, concurrency ajustée — valeurs exactes à la discrétion de Claude (IA = OpenRouter depuis Phase 16, plus aucune dépendance Ollama).

### Claude's Discretion
- Choix final Railway vs Fly (cadré par D-01).
- Mécanisme d'enforcement **server-side** du Bearer sur Gotenberg/WeasyPrint HTTPS public (proxy sidecar, option native Gotenberg, check dans server.py WeasyPrint…) — client déjà câblé (Phase 17, `pdf-render.ts`).
- Architecture image Docker : `turbo prune --scope=@qualiof/web`, pm2-runtime × 3 process vs 3 services séparés vs boucle unique.
- Bibliothèque/mécanisme cron interne (node-cron, croner, setInterval + garde horaire…).
- Valeurs exactes timeout/concurrency/poll interval du worker recalibré.
- Déclenchement du job OCR (réutilisation `AIGenerationJob`, extension queue Postgres, ou autre) — tant que le flux pré-inscription reste fonctionnellement identique.
- Egress SMTP OVH :465 depuis l'hôte retenu — [VERIFY] en recherche.
- Résorption dette Phase 19 : `dotenv-cli` absent → ajouter en devDep OU basculer sur `tsx --env-file`.
- Sort des deps `bullmq`/`ioredis` et fichiers redis.ts/queue.ts BullMQ (retrait ou conservation morte documentée).

### Deferred Ideas (OUT OF SCOPE)
- Déploiement Vercel prod réel + re-validation 413/direct-to-storage + arbitrage région Supabase Paris vs Irlande → **Phase 21** (déjà acté Phase 18).
- Upstash `eu-central-1` (17-REGIONS D-02 conditionnel) : **caduc** — Redis viré partout, aucun compte à créer.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **WORK-01** | Image Docker prunée (`turbo prune`, poppler-utils), workers closure/veille/factures + Gotenberg + WeasyPrint déployés sur Railway/Fly EU ; doc-engines siblings | § Standard Stack (Railway Pro), § Architecture Patterns (Dockerfile multi-stage turbo prune + pm2-runtime), § Code Examples (Dockerfile, railway config) |
| **WORK-02** | Décision Redis tranchée — **réinterprétée D-03/D-04** : 0 Redis, bascule Postgres SKIP LOCKED (closure déjà écrit) + cron interne (veille/factures) ; preuve = stabilité 24 h + coût sous budget | § Don't Hand-Roll (queue Postgres existante), § Architecture Pattern 2 (cron interne croner), § Runtime State Inventory (retrait BullMQ/ioredis) |
| **WORK-03** | Pack closure complet 100 % cloud (Mac éteint), worker recalibré (concurrency/poll interval) | § Architecture Pattern 3 (recalibrage), § Pitfall 1 (pooler + concurrency), § Validation Architecture |
| **WORK-04** | pdftoppm/OCR relocalisé worker (D-05), aucune dégradation silencieuse (D-06, pilier #4) | § Runtime State Inventory (OCR fire-and-forget meurt sur Vercel), § Architecture Pattern 4 (OCR déclenché via queue Postgres), § Pitfall 3 (fire-and-forget serverless) |
</phase_requirements>

## Summary

Cette phase déplace TOUT le compute long-vivant de QualiOF (3 workers de fond + 2 moteurs PDF + rastérisation OCR poppler) du Mac de Laurent vers un 3ᵉ hôte cloud, de sorte qu'un pack closure et une pré-inscription IA se génèrent bout-en-bout Mac éteint. Le travail de fond est **déjà écrit et testé structurellement** pour le closure (driver Postgres `queue-postgres.ts` SKIP LOCKED, prouvé sous pooler :6543 en 19-SMOKE) ; l'essentiel du plan consiste donc à **(a)** conteneuriser proprement le monorepo, **(b)** porter veille + relances-factures hors BullMQ vers un cron interne, **(c)** relocaliser l'OCR (aujourd'hui déclenché en fire-and-forget dans une server action Vercel, ce qui **casse** en serverless), et **(d)** exposer Gotenberg/WeasyPrint en HTTPS authentifié.

**Décision hébergeur (D-01) : Railway.** Le critère n°1 (simplicité pour non-technicien, dashboard visuel, zéro CLI) est décisif. Railway est unanimement décrit en 2026 comme dashboard-first (Fly = flyctl/CLI-first, « power user »), avec une facturation lisible (abonnement + usage à la minute, prévisible), un déploiement Docker natif et des logs lisibles au dashboard. Le budget D-07 (~20-25 €) correspond exactement au plan **Pro à 20 $/mois** (inclut 20 $ d'usage), et — point critique découvert en recherche — **Railway ne débloque l'egress SMTP (ports 465/587) que sur le plan Pro** : les relances factures OVH :465 exigent donc Pro de toute façon. Fly n'apporte aucun avantage net qui compense sa complexité de pilotage pour ce cas 2-5 users. Région : Railway `europe-west4` (Amsterdam, EU/RGPD conforme — les données restent sur Supabase Paris, seul le compute est à Amsterdam).

**Point de vigilance majeur (WORK-04) :** l'OCR pré-inscription tourne actuellement en `extractPreEnrollmentDocuments(pe.id).catch(...)` **fire-and-forget dans la server action Vercel `confirmPreEnrollmentUpload`** (`storage-upload.ts:163`). En serverless Vercel, la fonction se termine dès la réponse renvoyée → le fire-and-forget est **tué avant d'aboutir**, et `pdftoppm` n'existe de toute façon pas sur Vercel. Le plan DOIT rerouter ce déclenchement vers le worker cloud (via une entrée de queue Postgres, à l'image de `ClosureJob`) pour que la rastérisation poppler + vision s'exécutent sur l'hôte qui a le binaire. Sans ça, pilier #4 dégradé silencieusement.

**Primary recommendation :** Railway Pro (`europe-west4`) · 1 image Docker `turbo prune --scope=@qualiof/web` + poppler-utils, pilotée par pm2-runtime lançant les 3 workers (closure-pg + veille + factures) dans un seul service worker · Gotenberg et WeasyPrint en 2 services siblings du même projet Railway · enforcement Bearer via check server-side dans le Flask WeasyPrint + un mini reverse-proxy (ou Gotenberg basic-auth mappé) puisque Gotenberg 8 n'a pas de Bearer natif · cron interne **croner** (pas node-cron) pour veille/factures · OCR rerouté du fire-and-forget Vercel vers la queue Postgres du worker.

## Standard Stack

### Core
| Composant | Version | Rôle | Pourquoi standard |
|-----------|---------|------|-------------------|
| **Railway** | Pro plan 20 $/mo (2026) | Hôte du 3ᵉ tier (worker + doc-engines) | Dashboard-first, zéro CLI au quotidien (D-01 crit. n°1), Docker natif, private networking `*.railway.internal`, egress SMTP sur Pro |
| **pm2** (`pm2-runtime`) | `^7.0.3` (vérifié `npm view pm2`) | Superviseur des 3 workers dans 1 conteneur | Standard pour N process Node dans 1 image ; `pm2-runtime` = mode PID-1 conteneur (pas de daemon), redémarre un worker mort sans tuer les autres |
| **croner** | `^10.0.1` (vérifié `npm view croner`) | Cron interne veille (lundi 8h) + factures (quotidien 8h) Europe/Paris | Zéro dep, **DST Europe/Paris correct via Intl** (node-cron a un historique de bugs DST), `catch` intégré (erreur n'arrête pas le process), utilisé par pm2/Uptime-Kuma |
| **poppler-utils** | apt (Debian stable) | `pdftoppm` rastérisation PDF scannés (OCR) | Déjà le choix du code (`pdf-extract.ts:35`) — binaire système, 0 dep Node, marche ARM64/x64 ; à installer dans l'image worker |
| **Postgres queue (SKIP LOCKED)** | code maison existant | Remplace BullMQ+Redis pour ClosureJob | **Déjà écrit + prouvé** (`queue-postgres.ts`, 19-SMOKE tx Serializable sous pooler OK) |

### Supporting
| Composant | Version | Rôle | Quand |
|-----------|---------|------|-------|
| Gotenberg | `gotenberg/gotenberg:8` (image déjà en compose) | HTML→PDF Chromium (docs standards) | Service sibling Railway, exposé HTTPS |
| WeasyPrint micro-service | Flask + weasyprint 60.2 (Dockerfile existant `docker/weasyprint/`) | HTML→PDF CSS Paged Media (footer répété docs closure) | Service sibling Railway ; ajouter check Bearer server-side ici |
| nodemailer | `^8.0.7` (déjà) | SMTP OVH :465 relances factures | Dans le worker factures ; egress :465 nécessite Railway Pro |
| tsx | `^4.21.0` (déjà) | Runner TS des entry-points worker | Lancés par pm2 |

### Alternatives Considered
| Au lieu de | Pourrait utiliser | Tradeoff |
|------------|-------------------|----------|
| Railway | Fly.io (`cdg` Paris) | Fly = CLI-first (flyctl), Machines à piloter, facturation multi-dimensionnelle moins lisible → **contre D-01 crit. n°1**. Aucun gain net prix/fiabilité à cette échelle. Écarté. |
| croner | node-cron `^4.5.0` | node-cron : bugs DST historiques sur le changement d'heure Paris, pas de `catch` intégré. Croner meilleur sur les 2 axes. |
| pm2-runtime (1 service, 3 process) | 3 services Railway séparés | 3 services = 3× la RAM idle facturée + 3 déploiements à piloter (contre D-01 simplicité + D-07 budget). 1 service pm2 = 1 image, 1 déploiement, coût mutualisé. Retenu sauf si l'isolation mémoire d'un worker devient nécessaire. |
| Bearer proxy sidecar | Gotenberg basic-auth natif | Gotenberg 8 ne supporte QUE basic-auth (`--api-enable-basic-auth`), pas Bearer. Le client envoie déjà `Bearer` (Phase 17). Voir § Pitfall 4. |

**Installation (deps app à ajouter) :**
```bash
pnpm --filter @qualiof/web add croner
pnpm --filter @qualiof/web add -D pm2   # ou pm2 global dans l'image Docker
# poppler-utils : apt-get dans le Dockerfile, PAS une dep npm
```

**Version verification (registre npm, 2026-07-05) :**
- `croner` → `10.0.1` (vérifié `npm view croner version`)
- `pm2` → `7.0.3` (vérifié `npm view pm2 version`)
- `node-cron` → `4.5.0` (vérifié, écarté)
- Gotenberg → image `:8` déjà utilisée (docker-compose.yml:54)

## Architecture Patterns

### Recommended Project Structure (Railway)
```
Projet Railway "qualiof-worker" (europe-west4)
├── service: worker          # image Docker monorepo prunée, pm2-runtime × 3
│   ├── worker:closure:pg    (poll ClosureJob QUEUED, SKIP LOCKED)
│   ├── worker:veille        (croner lundi 8h → ingestRssOnceForTenant)
│   └── worker:reminders     (croner quotidien 8h → processReminderJob, SMTP OVH)
│   └── + pdftoppm/poppler-utils installé (OCR)
├── service: gotenberg       # image gotenberg/gotenberg:8, HTTPS public + auth
└── service: weasyprint      # build docker/weasyprint/, HTTPS public + check Bearer
```
Communication interne worker↔doc-engines possible en `gotenberg.railway.internal` / `weasyprint.railway.internal` (privé, chiffré Wireguard) ; mais **Vercel (Phase 21) attaque les doc-engines par leur domaine PUBLIC** (Vercel n'est pas dans le réseau privé Railway) → les doc-engines ont besoin d'un domaine public + enforcement Bearer.

### Pattern 1 : Image Docker monorepo via turbo prune (WORK-01)
**Quoi :** multi-stage — un stage `pruner` isole le sous-graphe `@qualiof/web`, un stage `installer` installe depuis le lockfile filtré, un stage `runner` copie le build + installe poppler-utils + lance pm2-runtime.
**Quand :** image du service worker Railway.
```dockerfile
# Source: https://turborepo.dev/docs/guides/tools/docker (vérifié 2026-07-05)
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

FROM base AS pruner
WORKDIR /app
RUN pnpm add -g turbo@2.3.0
COPY . .
RUN turbo prune @qualiof/web --docker   # → ./out/json (deps) + ./out/full (src)

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @qualiof/web exec prisma generate   # client Prisma
# NB : pas de `next build` obligatoire pour les workers (tsx exécute les .ts directement)

FROM base AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*
RUN pnpm add -g pm2
COPY --from=installer /app .
COPY ecosystem.config.cjs ./
CMD ["pm2-runtime", "ecosystem.config.cjs"]
```
**Vérif à faire au plan :** `pdftoppm -v` doit répondre dans le conteneur (poppler installé). C'est la brique WORK-04.

### Pattern 2 : Cron interne croner (remplace BullMQ repeatable) — WORK-02
**Quoi :** l'entry-point worker instancie un `Cron('0 8 * * 1', { timezone: 'Europe/Paris' }, fn)` au lieu d'enregistrer un job repeatable BullMQ. La logique métier (`processVeilleJob` / `processReminderJob`) est **déjà séparée** de l'infra BullMQ dans `worker.ts` — on garde le handler, on remplace le déclencheur.
**Quand :** entry-points `veille-worker.ts` et `invoice-reminder-worker.ts` réécrits.
```typescript
// Source: https://croner.56k.guru/ (vérifié 2026-07-05)
import '@qualiof/shared/env';           // fail-loud au boot (déjà le pattern)
import { Cron } from 'croner';
import { processReminderJob } from '../src/lib/invoice-reminders/worker';

// quotidien 8h Europe/Paris (remplace repeat: { pattern:'0 8 * * *', tz:'Europe/Paris' })
new Cron('0 8 * * *', { name: 'invoice-reminders', timezone: 'Europe/Paris',
  catch: (e) => console.error('[reminders] cron error', e) }, async () => {
    await processReminderJob({ data: { triggered_by: 'cron' } } as never);
});
console.log('[reminders] croner registered (08:00 Europe/Paris)');
```
**Anti-régression :** le `processReminderJob`/`processVeilleJob` prend aujourd'hui un `Job<Payload>` BullMQ ; extraire un core prenant juste `{ triggered_by }` (ou passer un faux objet `{ data }`) — la logique DB elle-même ne touche PAS BullMQ. Idempotence 24h factures déjà côté worker (`REMINDER_DEDUP_MS`), aucune régression.

### Pattern 3 : Recalibrage worker cloud (WORK-03, D-09)
**Quoi :** ajuster les variables d'env du worker Postgres, pas le code.
- `QUEUE_CONCURRENCY` (défaut 3, `closure-worker-postgres.ts:22`) : garder ~3 (la limite n'est plus le GPU local mais le débit OpenRouter + `connection_limit=1` du pooler). Ne PAS monter agressivement → voir Pitfall 1 (pooler transaction mode).
- `QUEUE_POLL_INTERVAL_MS` (défaut 3000) : OK, latence ~3 s acceptable pour 10-50 PDF/jour.
- **Le « timeout 600 s → 120 s » de D-09 est déjà en partie fait** : le chemin cloud OpenRouter utilise `timeoutMs: 240_000` (`ollama-generators.ts:650`) ; le `600_000` (`:660`) est la branche `callOllama` locale qui **ne s'exécute pas** en prod (AI_PROVIDER=openrouter). Le vrai levier de recalibrage est donc **poll/concurrency**, pas le timeout LLM. Confirmer au plan que les 240 s cloud suffisent (Sonnet ~30-120 s réels) ou descendre à 120 s.
**Warning signs :** stub rate qui monte, jobs qui repassent QUEUED après 3 attempts (MAX_ATTEMPTS `queue-postgres.ts:28`), stall reclaim > 15 min (`STALL_RECLAIM_AFTER_MIN`).

### Pattern 4 : OCR rerouté fire-and-forget → queue worker (WORK-04, pilier #4)
**Quoi :** aujourd'hui `confirmPreEnrollmentUpload` (server action Vercel, `storage-upload.ts:163`) appelle `extractPreEnrollmentDocuments(pe.id).catch(...)` en fire-and-forget. En serverless Vercel : (a) le process meurt à la réponse → travail interrompu ; (b) `pdftoppm` absent → rastérisation impossible. **Il faut que ce déclenchement produise un job consommé par le worker cloud** (qui a poppler + tourne 24/7).
**Options (discrétion Claude, D) :**
1. **Réutiliser le pattern queue Postgres** : `confirmPreEnrollmentUpload` fait un INSERT dans une table de jobs OCR (ou réutilise `AIGenerationJob`), le worker cloud poll et exécute `extractPreEnrollmentDocuments`. ← recommandé, cohérent avec closure.
2. Étendre la boucle du worker Postgres pour poller aussi les `PreEnrollment` en statut SUBMITTED.
**D-06 (anti-dégradation silencieuse) :** `pdf-extract.ts:146` distingue déjà `pdftoppm introuvable` d'une autre erreur, et remonte un warning explicite ; `preinscription-extractor.ts` repasse en statut SUBMITTED + `aiErrorMsg` en cas d'échec (jamais EXTRACTED vide). Conserver ce contrat. **Test WORK-04 :** déposer un PDF scanné sans couche texte (CNI iPhone « Scanner ») → le worker rastérise via pdftoppm → vision OpenRouter → EXTRACTED avec données réelles. Un environnement sans poppler doit produire un warning visible, PAS un EXTRACTED vide.

### Anti-Patterns to Avoid
- **Fire-and-forget d'un job long dans une server action serverless** — meurt à la réponse HTTP. Toujours passer par une queue consommée par un process long-vivant (pilier #4).
- **3 services Railway pour 3 workers** — triple la RAM idle facturée, contre D-07/D-08. pm2-runtime dans 1 service.
- **Exposer Gotenberg/WeasyPrint publics SANS auth** — endpoints de rendu PDF ouverts = abus. Enforcement Bearer obligatoire (Phase 20, client déjà câblé Phase 17).
- **Monter QUEUE_CONCURRENCY agressivement** sous pooler transaction mode `connection_limit=1` — risque prepared-statement / saturation (Pitfall 1).
- **Garder BullMQ en dépendance active** après bascule — dette morte + risque de réintroduire une connexion Redis inexistante au boot.

## Don't Hand-Roll

| Problème | Ne pas construire | Utiliser | Pourquoi |
|----------|-------------------|----------|----------|
| Queue de jobs closure | Un système de lock maison | `queue-postgres.ts` **existant** (SKIP LOCKED, stall reclaim, MAX_ATTEMPTS) | Déjà écrit + prouvé sous pooler (19-SMOKE). La bascule = changer l'entry-point, pas réécrire. |
| Cron DST-safe | `setInterval` + calcul d'heure maison | **croner** | DST Europe/Paris est un piège (heure sautée/répétée). croner utilise Intl, gère DST, `catch` intégré. |
| Supervision N process Node | Script bash `&` + trap | **pm2-runtime** | Redémarre un worker crashé sans tuer les autres, logs unifiés, PID-1 conteneur propre. |
| Rastérisation PDF | lib Node (`pdfjs-dist`+canvas) | **pdftoppm/poppler** | `canvas.node` non-bundlable par webpack + prebuilds ARM64 fragiles (commenté dans `pdf-extract.ts:15`). Binaire système = robuste. |
| Client OpenRouter/vision | — | `llm-client.ts` **existant** | Déjà migré Phase 16 (Haiku vision cloud). Le worker n'a besoin d'aucun GPU/Ollama. |

**Key insight :** ~80 % du travail de fond de cette phase est **déjà codé** (driver Postgres closure, handlers veille/factures, pipeline OCR, client Bearer). Le plan est surtout de la **conteneurisation + rerouting**, pas de la réécriture. Les seuls nouveaux morceaux : Dockerfile turbo-prune, ecosystem pm2, remplacement BullMQ→croner sur 2 entry-points, rerouting OCR vers la queue, enforcement Bearer server-side.

## Runtime State Inventory

Phase de migration d'infra (compute Mac → cloud). Inventaire de l'état runtime au-delà des fichiers :

| Catégorie | Éléments trouvés | Action requise |
|-----------|------------------|----------------|
| **Stored data** | Aucune donnée ne stocke un identifiant d'hôte. `ClosureJob`/`PreEnrollment` sont dans Supabase (déjà cloud, Phase 19). La queue est la table `ClosureJob` elle-même. | **Aucune migration de données.** Le worker cloud lit la même base Supabase (`DATABASE_URL` pooler :6543 / `DIRECT_URL` :5432). |
| **Live service config** | **BullMQ repeatable jobs vivent DANS Redis, pas en git** : `weekly-veille-cron` et `daily-reminders-cron` sont enregistrés dans Redis au boot du worker (`scheduleWeeklyVeille`/`scheduleDailyReminders`). En virant Redis, ces jobs disparaissent — **c'est voulu** (D-03), remplacés par croner en process. | Aucune action de migration : la planif renaît du code croner au boot du worker cloud. Vérifier qu'aucun Redis résiduel ne re-crée de doublon. |
| **OS-registered state** | Aucun launchd/cron OS côté Mac : les workers tournaient via `pnpm dev:full` / tsx à la main (pas de service systemd installé — cf STACK.md « intended for systemd/pm2/docker », jamais déployé). | Aucune dé-registration OS. Le nouvel « OS-registered » devient pm2 dans le conteneur Railway. |
| **Secrets / env vars** | Le worker cloud a besoin des mêmes clés que l'app : `DATABASE_URL` + `DIRECT_URL` (Supabase pooler/direct), `STORAGE_PROVIDER=supabase` + 4 `SUPABASE_*`, `OPENROUTER_API_KEY`, `SMTP_*` (OVH :465), `DOC_ENGINE_TOKEN`, `AUTH_SECRET` (requis par le boot fail-loud même si worker ne l'utilise pas — `env.ts:87`), `GOTENBERG_URL`/`WEASYPRINT_URL` (pointant vers les services Railway). **À saisir dans le dashboard Railway (variables service).** `REDIS_URL` devient inutile (retirer du worker). | Provisionner ~15 variables dans Railway. Aucune renommée ; nouvelle valeur pour `GOTENBERG_URL`/`WEASYPRINT_URL` (URL Railway au lieu de localhost:3001/:5001). |
| **Build artifacts / packages** | `bullmq`/`ioredis` en deps actives (`apps/web/package.json:44,50`), fichiers `closure/redis.ts`, `closure/queue.ts` (BullMQ), `veille/queue.ts`, `invoice-reminders/queue.ts`, entry-points `closure-worker.ts`/`veille-worker.ts`/`invoice-reminder-worker.ts` (BullMQ). `docker-compose.yml` a un service `redis:7-alpine`. | **Retrait recommandé** (D, discrétion) : supprimer deps bullmq/ioredis + fichiers BullMQ morts + service redis du compose, OU les documenter comme morts. Le retrait allège l'image et supprime tout risque de connexion Redis fantôme au boot. Attention : les tests référencent peut-être ces modules (grep avant suppression). |

**Question canonique :** après conteneurisation, quel état runtime garde une trace de l'ancien monde Mac/Redis ? → **Uniquement les jobs repeatable BullMQ dans Redis** (disparaissent avec Redis, remplacés par croner) et les **deps/fichiers BullMQ morts** dans l'arbre (à retirer). Aucune donnée métier à migrer.

## Common Pitfalls

### Pitfall 1 : Pooler transaction mode + concurrency worker
**Ce qui casse :** monter `QUEUE_CONCURRENCY` sous `DATABASE_URL` pooler :6543 (`pgbouncer=true&connection_limit=1`) peut faire apparaître des `prepared statement already exists` ou saturer les connexions.
**Pourquoi :** pgBouncer transaction mode ne garde pas les prepared statements entre transactions.
**Comment éviter :** 19-SMOKE a **prouvé** que la tx Serializable `bumpAndFinalize` passe sous le pooler à concurrency=3 (0 erreur `prepared statement`). Garder ~3. Le repli documenté = pointer le worker sur `DIRECT_URL` :5432 (session mode) si un problème surgit (dette Phase 19 non déclenchée). **Warning signs :** `prepared statement "s0" already exists`, timeouts DB en rafale.

### Pitfall 2 : Egress SMTP bloqué par la plateforme
**Ce qui casse :** les relances factures OVH :465 échouent silencieusement (mailer retourne `{ ok:false }`, pas de crash).
**Pourquoi :** **Railway bloque l'egress SMTP (25/465/587) sur Free/Trial/Hobby ; débloqué UNIQUEMENT sur Pro** (vérifié, docs + Central Station 2026). Fly.io ne bloque pas mais peut réputationnellement filtrer.
**Comment éviter :** plan **Pro** (déjà requis par le budget D-07 = 20 $ et le keep-warm D-08). Vérifier après déploiement qu'un envoi test OVH :465 aboutit. **Fallback si jamais bloqué :** API HTTPS (Resend/SendGrid) — mais hors scope, OVH :465 sur Pro devrait passer.

### Pitfall 3 : OCR fire-and-forget mort en serverless (pilier #4)
**Ce qui casse :** `extractPreEnrollmentDocuments(pe.id).catch(...)` dans la server action Vercel ne finit jamais (process serverless tué à la réponse) + `pdftoppm` absent sur Vercel → pré-inscription reste SUBMITTED sans extraction, ou EXTRACTED vide.
**Pourquoi :** Vercel functions ≠ process long-vivant ; le fire-and-forget suppose un runtime qui survit à la requête (vrai sur le Mac local, faux sur Vercel).
**Comment éviter :** router le déclenchement OCR vers le worker cloud via la queue Postgres (§ Pattern 4). C'est le cœur de WORK-04. **Warning signs :** `PreEnrollment` bloqué SUBMITTED, warning `pdftoppm introuvable`, extractedData null après upload.

### Pitfall 4 : Gotenberg ne parle pas Bearer
**Ce qui casse :** on active « auth » côté Gotenberg en croyant protéger le Bearer, mais Gotenberg 8 ne connaît que **basic-auth** (`--api-enable-basic-auth` + `GOTENBERG_API_BASIC_AUTH_USERNAME/PASSWORD`). Le client `pdf-render.ts` envoie `Authorization: Bearer <DOC_ENGINE_TOKEN>` (Phase 17). Mismatch → soit auth non appliquée, soit rejet.
**Comment éviter :** enforcement Bearer **hors Gotenberg** :
- **WeasyPrint** : ajouter un check dans `docker/weasyprint/server.py` (lire `Authorization`, comparer au token en env, 401 sinon) — trivial, c'est notre code Flask.
- **Gotenberg** : soit un mini reverse-proxy sidecar (Caddy/nginx) qui valide le Bearer avant de forward, soit — plus simple — **ne pas exposer Gotenberg en public** et le laisser en `gotenberg.railway.internal` SI seul le worker l'appelle. MAIS Phase 21 fait appeler Gotenberg depuis Vercel (9 server actions PDF, APP-03) → besoin public → proxy Bearer requis. Trancher au plan (discrétion D). **Le plus simple cohérent** : proxy Bearer léger devant les deux, ou basic-auth Gotenberg + adapter le client. Recommandé : check server-side WeasyPrint + proxy/gateway Bearer minimal pour Gotenberg.
**Warning signs :** endpoint PDF joignable sans token, ou 401 sur appels légitimes.

### Pitfall 5 : Prisma dans l'image (client + binaires)
**Ce qui casse :** le worker cloud crashe au premier appel Prisma si `prisma generate` n'a pas tourné dans l'image, ou si le binary target ne matche pas la libc de l'image (`node:slim` = glibc/Debian ; `node:alpine` = musl → besoin `linux-musl` binaryTargets).
**Comment éviter :** `prisma generate` dans le stage installer (Pattern 1) ; utiliser `node:20-slim` (Debian, glibc) plutôt qu'alpine pour éviter les soucis musl + faciliter poppler. **Warning signs :** `Query engine binary not found`, `PrismaClientInitializationError`.

## Code Examples

### Config pm2 (3 workers, 1 conteneur)
```javascript
// ecosystem.config.cjs — Source: pattern pm2-runtime standard (pm2.keymetrics.io)
module.exports = {
  apps: [
    { name: 'closure',   script: 'apps/web/scripts/closure-worker-postgres.ts', interpreter: 'tsx', autorestart: true },
    { name: 'veille',    script: 'apps/web/scripts/veille-worker.ts',           interpreter: 'tsx', autorestart: true },
    { name: 'reminders', script: 'apps/web/scripts/invoice-reminder-worker.ts', interpreter: 'tsx', autorestart: true },
  ],
};
// Lancé par: CMD ["pm2-runtime", "ecosystem.config.cjs"]
// Chaque entry-point importe déjà '@qualiof/shared/env' → fail-loud au boot.
```

### Check Bearer server-side WeasyPrint (Flask)
```python
# docker/weasyprint/server.py — ajout enforcement (WORK-01 auth, Pitfall 4)
import os
from flask import request, Response
TOKEN = os.environ.get("DOC_ENGINE_TOKEN")

@app.before_request
def _auth():
    if request.path == "/health":
        return  # health probe non authentifiée
    if TOKEN:  # conditionnel : dev local sans token non cassé (parité pdf-render.ts)
        got = request.headers.get("Authorization", "")
        if got != f"Bearer {TOKEN}":
            return Response("Unauthorized", status=401)
```

### Railway private DNS (worker → doc-engines, appel interne optionnel)
```
# Source: https://docs.railway.com/private-networking (vérifié 2026-07-05)
# Services du même projet/env se joignent en <service>.railway.internal (IPv4+IPv6 depuis oct 2025).
GOTENBERG_URL=http://gotenberg.railway.internal:3000
WEASYPRINT_URL=http://weasyprint.railway.internal:5001
# MAIS Vercel (Phase 21) n'est PAS dans ce réseau privé → doc-engines aussi exposés
# via domaine public Railway + Bearer pour les appels Vercel.
```

## State of the Art

| Ancienne approche | Approche actuelle | Quand changé | Impact |
|-------------------|-------------------|--------------|--------|
| BullMQ + Redis pour les jobs | Postgres SKIP LOCKED (closure) + croner (veille/factures) | v6 2026-06-03, effectif Phase 20 | 1 service en moins à payer/monitorer, état queryable en SQL, plus de désync Redis↔Postgres |
| Ollama local (GPU Metal, timeout 600 s) | OpenRouter cloud (Haiku/Sonnet, ~30-120 s) | Phase 16 | Worker sans GPU → déployable sur Railway ; timeouts LLM déjà à 240 s cloud |
| MinIO local | Supabase Storage (`STORAGE_PROVIDER=supabase`) | Phase 18 | Worker cloud lit/écrit PDF via signed URLs, pas de volume local |
| Postgres/Docker local | Supabase pooler :6543 + direct :5432 | Phase 19 | Worker cloud joint la même base ; tx Serializable prouvée sous pooler |
| node-cron (bugs DST) | croner (Intl, DST-safe) | reco 2026 | Cron Europe/Paris fiable au changement d'heure |

**Deprecated/outdated dans le contexte du projet :**
- `bullmq`, `ioredis`, `closure/redis.ts`, `closure/queue.ts` (BullMQ), `veille/queue.ts`, `invoice-reminders/queue.ts`, service `redis` du docker-compose : morts après cette phase (retrait recommandé, discrétion D).
- Section Upstash de `17-REGIONS.md` : caduque (D-03, aucun compte Redis).

## Open Questions

1. **Gotenberg public + Bearer : proxy sidecar ou basic-auth ?**
   - Ce qu'on sait : Gotenberg 8 = basic-auth only ; client envoie Bearer ; Vercel (Phase 21) appelle Gotenberg en public.
   - Ce qui reste à trancher : mini reverse-proxy Bearer (Caddy/nginx sidecar) VS basculer le client sur basic-auth pour Gotenberg. WeasyPrint = check Flask trivial de toute façon.
   - Recommandation : check Flask Bearer pour WeasyPrint (fait) + décider au plan pour Gotenberg (proxy Bearer léger recommandé pour homogénéité du client `pdf-render.ts`).

2. **Déclencheur OCR : nouvelle table de queue, `AIGenerationJob`, ou extension du poll closure ?**
   - Ce qu'on sait : le pattern queue Postgres closure est réutilisable ; `AIGenerationJob` existe déjà (modèle générique).
   - Recommandation : réutiliser `AIGenerationJob` ou une petite table dédiée pollée par le worker ; discrétion D tant que le flux pré-inscription reste fonctionnellement identique côté user.

3. **Facturation Railway réelle sous budget D-07 (~20-25 €) ?**
   - Ce qu'on sait : Pro = 20 $/mo incluant 20 $ d'usage ; RAM 10 $/GB/mo, CPU 20 $/vCPU/mo. 3 workers légers idle + 2 doc-engines idle devraient tenir dans l'enveloppe, mais Gotenberg/Chromium peut consommer en pointe.
   - Recommandation : c'est précisément l'objet de la **preuve 24 h D-04** (observer la facturation Railway réelle 24 h, projeter le mensuel). Dimensionner les services au minimum viable, surveiller le dashboard.

## Environment Availability

| Dépendance | Requis par | Disponible (cible Railway) | Version | Fallback |
|------------|-----------|----------------------------|---------|----------|
| Railway Pro | Hôte 3ᵉ tier + egress SMTP | À provisionner (compte Laurent) | Pro 20 $/mo | Fly.io `cdg` (contre D-01) |
| poppler-utils (`pdftoppm`) | OCR PDF scannés (WORK-04) | apt dans l'image worker | Debian stable | Aucun — obligatoire pour D-05 |
| Gotenberg 8 | Rendu PDF Chromium | image `gotenberg/gotenberg:8` | 8.x | — |
| WeasyPrint 60.2 | Rendu PDF closure | build `docker/weasyprint/` existant | 60.2 | — |
| SMTP OVH :465 | Relances factures | egress débloqué sur Railway **Pro** | ssl0.ovh.net:465 | API HTTPS (Resend) si bloqué — hors scope |
| Supabase pooler :6543 / direct :5432 | DB worker | déjà provisionné (Phase 19) | PostgreSQL 17.6 | direct :5432 en repli |
| OpenRouter API | LLM/vision worker | déjà provisionné (Phase 16) | — | — |
| node-cron/croner | Cron interne | dep npm à ajouter | croner 10.0.1 | — |

**Missing dependencies with no fallback :**
- **poppler-utils dans l'image worker** : obligatoire pour la rastérisation OCR (D-05). Sans lui, WORK-04 dégradé → à installer via apt dans le Dockerfile.

**Missing dependencies with fallback :**
- Egress SMTP : si Railway Pro ne suffit pas (improbable), fallback API HTTPS d'envoi — mais hors scope de cette phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (`apps/web`, `packages/shared`) |
| Config file | `apps/web/vitest.config.*` (pas de Playwright config en arbre — TEST-01 = Phase 21) |
| Quick run command | `pnpm --filter @qualiof/web test -- <pattern>` |
| Full suite command | `pnpm --filter @qualiof/web test && pnpm --filter @qualiof/shared test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WORK-01 | Image Docker build + `pdftoppm -v` répond dans le conteneur | smoke (build) | `docker build` + `docker run … pdftoppm -v` | ❌ Wave 0 (script smoke) |
| WORK-01 | ecosystem pm2 lance 3 process, chacun fail-loud si env manquant | unit/smoke | `pnpm … test scripts/__tests__/worker-entrypoints` | ❌ Wave 0 |
| WORK-02 | Cron croner enregistré aux bons horaires (lundi 8h / quotidien 8h Europe/Paris), 0 import bullmq | unit | `pnpm … test veille invoice-reminders` (adapter aux nouveaux entry-points) | ⚠ tests BullMQ existants à réécrire |
| WORK-02 | `processReminderJob`/`processVeilleJob` inchangés fonctionnellement (idempotence 24h factures) | unit (déjà) | `pnpm … test invoice-reminders/worker` | ✅ existant |
| WORK-03 | Pack closure généré 100 % cloud (Mac éteint), 0 stub | manuel/smoke (infra réelle) | `pnpm … smoke:closure` contre worker Railway | ✅ script existe, exécution = gate |
| WORK-04 | PDF scanné sans couche texte → pdftoppm → vision → EXTRACTED données réelles | manuel/smoke | déposer CNI scannée, vérifier statut EXTRACTED + extractedData | ⚠ smoke manuel (infra) |
| WORK-04 | Sans poppler → warning explicite, PAS d'EXTRACTED vide (D-06) | unit | `pnpm … test pdf-extract` (branche `pdftoppm introuvable`) | ✅ logique existe `pdf-extract.ts:146` |

### Sampling Rate
- **Per task commit :** `pnpm --filter @qualiof/web test -- <module touché>` + `tsc --noEmit`
- **Per wave merge :** suite web + shared complète
- **Phase gate :** suite verte + smoke réel (pack closure 100 % cloud Mac éteint + OCR PDF scanné) — gate humain Laurent (destructif/infra réelle = étape séparée, convention projet)

### Wave 0 Gaps
- [ ] Script/smoke build Docker vérifiant `pdftoppm -v` dans l'image (WORK-01/WORK-04)
- [ ] Réécriture des tests veille/invoice-reminders vers les nouveaux entry-points croner (retrait des mocks BullMQ)
- [ ] Test unitaire « entry-point worker fail-loud si env manquant » (parité `@qualiof/shared/env` import)
- [ ] Framework install : aucun (Vitest déjà présent)

*(Playwright E2E closure = TEST-01, explicitement Phase 21 — hors scope Phase 20.)*

## Project Constraints (from CLAUDE.md)

**Global (`~/.claude/CLAUDE.md`)** — réponses en français, format pédagogique. Garde-fous Make.com non applicables ici (pas de scénario Make dans cette phase). Garde-fou de vérité : si un nom exact de service/plateforme est incertain, proposer options + comment vérifier (appliqué : Railway vs Fly, Gotenberg auth).

**Projet (`./CLAUDE.md` = STATE.md sections) :**
- **Secrets jamais en variables custom non chiffrées** → sur Railway, utiliser les variables de service (chiffrées) pour `SMTP_PASS`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `DOC_ENGINE_TOKEN`, `AUTH_SECRET`.
- **Workers = process séparés SANS imports auth/React** (`react does not provide an export named 'cache'`) — respecté par les entry-points existants ; l'OCR relocalisé DOIT rester dans des modules neutres (`ocr-downscale.ts` déjà neutre, `pdf-extract.ts` neutre). Ne PAS importer de server action React dans le worker.
  - ⚠ Attention : `invoice-reminders/worker.ts:24` importe `sendInvoiceReminder` depuis `@/server/actions/invoices` — vérifier au plan que cette server action ne tire pas d'import React/`cache` incompatible worker (elle tournait déjà en worker BullMQ, donc a priori OK, mais re-valider en conteneur).
- **`.env` racine unique validé fail-loud au boot** — le worker cloud reçoit ses env via Railway ; le boot `@qualiof/shared/env` reste fail-loud (bon). `AUTH_SECRET` min 32 chars requis même côté worker.
- **PDF : footer HTML in-body `position:fixed`, jamais footer natif Gotenberg** — ne pas régresser en conteneurisant (les marges Gotenberg de `pdf-render.ts` restent inchangées).
- **Exécution séquentielle des générations en masse** (deadlocks closureBatch) — le worker SKIP LOCKED sérialise via claim atomique ; garder concurrency raisonnable.
- **GSD workflow** : passer par `/gsd:execute-phase` pour les edits.

## Sources

### Primary (HIGH confidence)
- Code du repo : `queue-postgres.ts`, `closure-worker-postgres.ts`, `veille/worker.ts`, `invoice-reminders/worker.ts`, `mailer.ts`, `pdf-render.ts`, `pdf-extract.ts`, `preinscription-extractor.ts`, `storage-upload.ts`, `env.ts`, `docker/weasyprint/`, `docker-compose.yml`, `package.json` — lus intégralement 2026-07-05
- `.planning/phases/20-.../20-CONTEXT.md` (décisions verrouillées), `REQUIREMENTS.md`, `STATE.md`, `17-REGIONS.md`, `19-SMOKE` (via STATE)
- npm registry (`npm view`) : croner 10.0.1, pm2 7.0.3, node-cron 4.5.0 — vérifiés 2026-07-05
- [Railway Private Networking](https://docs.railway.com/private-networking) — `*.railway.internal`, IPv4+IPv6 depuis oct 2025
- [Railway Outbound Networking](https://docs.railway.com/networking/outbound-networking) — SMTP Pro-only
- [Turborepo Docker guide](https://turborepo.dev/docs/guides/tools/docker) + [prune reference](https://turborepo.dev/docs/reference/prune) — `turbo prune --docker`
- [Croner docs](https://croner.56k.guru/) — DST/Intl, catch, timezone
- [Gotenberg Configuration](https://gotenberg.dev/docs/configuration) — basic-auth `--api-enable-basic-auth`

### Secondary (MEDIUM confidence)
- [Railway pricing plans](https://docs.railway.com/reference/pricing/plans) — Hobby 5 $, Pro 20 $, RAM 10 $/GB, CPU 20 $/vCPU (facturation par-service non détaillée sur cette page)
- Comparatifs Railway vs Fly 2026 ([Northflank](https://northflank.com/blog/railway-vs-flyio), [getdeploying](https://getdeploying.com/flyio-vs-railway)) — Railway dashboard-first, Fly CLI-first
- [Railway Central Station – SMTP ports 465/587](https://station.railway.com/questions/i-am-on-the-hobby-plan-but-my-smtp-port-fae4611b) — confirmations Pro-only + incident août 2025 rollback

### Tertiary (LOW confidence — à valider en exécution)
- Coût mensuel Railway réel pour ce profil (3 workers + Gotenberg + WeasyPrint idle + pointes) → **preuve 24 h D-04**, pas déterminable a priori
- Egress OVH :465 concret depuis Railway Pro → à tester après déploiement (Pitfall 2)

## Metadata

**Confidence breakdown :**
- Standard stack : **HIGH** — décisions verrouillées (D-01…D-09), code de bascule déjà écrit/testé, versions vérifiées au registre
- Architecture : **HIGH** — patterns Docker/pm2/croner documentés officiellement + code existant réutilisé
- Pitfalls : **HIGH** sur SMTP Pro-only, OCR fire-and-forget, Gotenberg Bearer, pooler ; **MEDIUM** sur le coût 24 h réel
- Choix Railway : **HIGH** sur la simplicité/dashboard (D-01 crit. n°1) ; coût sous budget = **MEDIUM** (à prouver 24 h)

**Research date :** 2026-07-05
**Valid until :** ~2026-08-05 (30 j — pricing PaaS et politique SMTP Railway peuvent bouger ; re-vérifier egress SMTP Pro et pricing au moment de la création du projet)
