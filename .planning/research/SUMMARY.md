# Project Research Summary

**Project:** QualiOF v6 — Prod Cloud Migration
**Domain:** Cloud migration Next.js 14 / Prisma / BullMQ → Vercel + Supabase EU + Upstash + Railway/Fly
**Researched:** 2026-07-04
**Confidence:** MEDIUM-HIGH (Vercel limits VERIFIED docs officielles ; specifics Supabase/Upstash/Railway = training data, marqués [VERIFY] — web bloqué pendant la recherche)

---

## Executive Summary

v6 n'est pas un déploiement greenfield — c'est un milestone config-et-infra qui soulève une stack locale qui marche (Docker Postgres + MinIO + Redis + Gotenberg/WeasyPrint + 3 workers BullMQ) vers 4 plateformes managées. Le delta est plus petit qu'une migration typique : la branche `cloud-migration` a déjà le terrain préparé — Prisma `directUrl`, provider Supabase dans `storage.ts` (signed URLs natives), options BullMQ TLS dans `redis.ts`, cookies Lucia secure, restore staging prouvé 5822=5822.

**Découverte architecturale n°1 — double ingress doc-engines :** Gotenberg/WeasyPrint sont appelés depuis DEUX endroits — les workers BullMQ (réseau privé, OK) ET ~9 server actions Vercel qui rendent des PDF en synchrone (Vercel ne peut pas atteindre un réseau privé Railway/Fly). Résolution recommandée pour v6 (Option A) : exposer Gotenberg/WeasyPrint en HTTPS public protégé par le bearer `DOC_ENGINE_TOKEN` déjà déclaré dans `env.ts:38` mais jamais consommé par `pdf-render.ts` — le câbler.

**4 pièges bloquants (ordre de priorité) :**
1. **Prisma pooler/drift** — `migrate deploy` DOIT passer par `DIRECT_URL` :5432 ; l'historique `db push` local doit être baseliné avant de toucher la base cloud.
2. **Cap 4,5 MB body Vercel** (VÉRIFIÉ) — casse silencieusement l'upload photos CNI/RIB smartphone (8-12 MB) → pattern direct-to-Supabase signed upload URL (changement de CODE, pas config). Menace le pilier #4.
3. **poppler/pdftoppm absent de Vercel** — `pdf-extract.ts:35` shell out vers `pdftoppm`, appelé par 2 server actions préinscription → décision explicite : OCR dégradé (texte seul) sur Vercel OU relocalisation worker. Ne pas shipper une dégradation silencieuse.
4. **BullMQ sur Upstash = facturation par commande** — 3 workers bloquants 24/7 pollent en continu → un Redis co-localisé Railway/Fly (TCP, forfait) probablement moins cher. Décision après 24 h de facturation observée.

**Phase 0 réelle = choix région EU** (irréversible sur les 4 plateformes, se décide AVANT toute création de projet) + fermeture du gap env.ts (5 clés cloud lues en `process.env` brut hors t3-env : `DIRECT_URL`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEASYPRINT_URL` ; alias périmé `DOC_ENGINE_URL:5000` à remplacer).

---

## Recommended Stack

- **Supabase Pro EU** — Postgres 16 (Supavisor :6543 poolé `?pgbouncer=true&connection_limit=1` / :5432 direct migrations) + Storage privé signed URLs. Extensions pgcrypto/uuid-ossp/pg_trgm/unaccent [VERIFY unaccent].
- **Upstash Redis EU** (`rediss://` TLS) — transport BullMQ ; ré-évaluer vs Redis co-localisé après 24 h.
- **Railway ou Fly.io EU** — 3ᵉ hôte : 1 image Docker prunée (`turbo prune --scope=@qualiof/web`) + pm2-runtime × 3 workers + `poppler-utils` ; Gotenberg + WeasyPrint en siblings privés + ingress public authentifié.
- **Vercel Pro** — Next.js 14.2 app seule, région EU (`cdg1`/`fra1`), `maxDuration` par route (Pro = 800s max, défaut 300s). Body cap 4,5 MB (VÉRIFIÉ).
- **1 seule dépendance npm possible** : `@supabase/supabase-js` [VERIFY présence package.json].

## Operational Capabilities (P1 = cutover-blocking)

**P1 :** région EU lockée · env.ts gap fermé · Vercel deploy (dégel staging : flag, filigrane, garde PDF, vercel.json) · Supabase Postgres (migrate deploy baseliné, séquences, extensions) · Storage (migration objets MinIO, 0 lien mort, direct-to-storage CNI/RIB) · worker host (3 workers + doc engines + poppler, recalibrage 600s→~120s) · secrets 4 plateformes + rotation · CI-01 gate PR · TEST-01/02 Playwright smoke · runbook bascule + rollback · DPA 6 sous-traitants · alertes coûts + backups daily.
**P2 (semaines suivantes) :** staging persistant, previews Vercel, pg_dump cron indépendant, uptime ping + heartbeat worker.
**Anti-features (NE PAS faire pour 2-5 users) :** k8s, multi-région, blue-green, SSO entreprise, E2E exhaustif, DB-par-PR, IaC, Datadog, PITR par défaut.

## Build Order (dépendances dures)

Région+env.ts → Storage → DB → Worker host+doc engines (privé) → Ingress public+Vercel deploy → CI 2 cibles → Bascule prod.
- Storage avant DB : code upload direct-to-storage indépendant, confiance avant de toucher la base.
- Worker avant Vercel : les server actions PDF Vercel dépendent de l'endpoint doc-engine public provisionné avec le worker.
- CI avant bascule (pas plus tôt) : les shapes de build sont connues et réelles.

## [VERIFY] au plan time (web bloqué pendant recherche)

1. Hostname Supavisor exact (dashboard, pas training data) · 2. Pricing Upstash actuel (décision Redis co-localisé) · 3. Syntaxe DNS privé Railway `*.railway.internal` / Fly `*.internal` · 4. `unaccent` dans la liste d'extensions Supabase · 5. `@supabase/supabase-js` dans package.json · 6. Volume objets MinIO (sizing migration) · 7. Egress SMTP OVH :465 depuis Railway/Fly · 8. IPv4 add-on pour connexion directe :5432 depuis le worker host.

---
*Sources : vercel.com/docs/functions/limitations (2026-06-19, VÉRIFIÉ) · inspection codebase file:line (schema.prisma, storage.ts, redis.ts, pdf-render.ts, pdf-extract.ts, env.ts, workers, docker-compose) · mémoire projet (5822=5822, migrate≠generate, staging E1-E4). Détail complet : STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md.*
*Ready for roadmap: yes*
