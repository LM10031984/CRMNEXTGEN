# Phase 20: Worker 3ᵉ hôte + doc engines - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Un 3ᵉ hôte cloud (après Vercel et Supabase) porte les 3 workers de fond (closure, veille, relances factures) + Gotenberg + WeasyPrint + poppler-utils, expose les doc-engines en HTTPS public authentifié (Bearer), et permet de générer un pack closure complet 100 % dans le cloud, Mac éteint — avec un worker recalibré pour la latence cloud (OpenRouter, plus d'Ollama) et sans jamais dégrader l'OCR en silence (pilier #4).

Requirements : WORK-01, WORK-02, WORK-03, WORK-04.

</domain>

<decisions>
## Implementation Decisions

### Hébergeur (WORK-01)
- **D-01 :** Railway vs Fly.io tranché par Claude **pendant la recherche** — Laurent délègue explicitement. Critère n°1 : **simplicité d'exploitation pour un non-technicien** (dashboard visuel, zéro CLI au quotidien, logs lisibles). Critère n°2 : coût réel dans le budget D-05. Région EU conforme à `17-REGIONS.md` (Railway `europe-west4` / Fly `cdg`). Biais assumé de la discussion : Railway pressenti pour sa simplicité — Fly ne doit être retenu que si un avantage net (prix/fiabilité) compense sa complexité de pilotage.
- **D-02 :** Supabase explicitement écarté comme hôte des workers/doc-engines (question posée par Laurent) : Edge Functions = exécutions courtes Deno, pas de conteneurs long-vivants, pas de poppler/Chromium. Ne pas re-proposer.

### Redis / architecture queue (WORK-02)
- **D-03 :** **Redis viré partout — 0 Redis, ni Upstash ni co-localisé.** Confirme et étend la décision v6 (2026-06-03).
  - Closure : bascule sur le driver Postgres SKIP LOCKED **déjà écrit** (`queue-postgres.ts` + `closure-worker-postgres.ts`), qui devient le worker de prod.
  - Veille + relances factures : porter leur planification (cron hebdo lundi 8h / quotidien 8h Europe/Paris) sur un **planificateur interne au process worker** (node-cron ou équivalent) — plus de BullMQ ni de connexion Redis.
- **D-04 :** WORK-02 (« décision Redis tranchée sur facturation observée 24 h ») se réinterprète : la décision est prise (0 Redis) ; la preuve 24 h devient **stabilité 24 h du worker sans Redis + coût mensuel projeté sous budget** (pas de comparaison Upstash à mener).
- **Note roadmap :** la formulation « 3 workers BullMQ » dans ROADMAP/WORK-01 est caduque — lire « 3 workers de fond » ; BullMQ/ioredis sortent du chemin de prod (retrait des deps = discrétion Claude, voir plus bas).

### OCR pré-inscriptions (WORK-04, pilier #4)
- **D-05 :** **Rasterisation relocalisée sur le worker** — pas de dégradation texte-seul. Les PDF scannés (CNI/RIB/CFP) passent par pdftoppm/poppler installé sur le 3ᵉ hôte, puis vision via OpenRouter. Qualité d'extraction identique à aujourd'hui ; quelques secondes de latence async supplémentaires acceptées.
- **D-06 :** Aucune dégradation silencieuse : si l'OCR échoue malgré tout, échec propre avec message utilisateur/admin explicite (jamais un auto-fill vide sans explication).

### Budget + disponibilité (WORK-03)
- **D-07 :** Budget cible **~20-25 €/mois** pour l'ensemble du 3ᵉ hôte (worker + Gotenberg + WeasyPrint).
- **D-08 :** **Tout toujours chaud** — pas de scale-to-zero : packs et PDF générés sans latence de réveil, stabilité 24 h simple à prouver. Le critère de succès #2 (« appel Vercel→Gotenberg réussit après un cold start ») se lit alors : réussite après **redéploiement/restart** du service, pas après endormissement.
- **D-09 :** Recalibrage worker pour la latence cloud : timeout 600 s (héritage Ollama local) → ~120 s, concurrency ajustée — valeurs exactes à la discrétion de Claude (l'IA est OpenRouter depuis Phase 16, plus aucune dépendance Ollama sur le worker).

### Claude's Discretion
- Choix final Railway vs Fly (cadré par D-01).
- Mécanisme d'enforcement **server-side** du Bearer sur Gotenberg/WeasyPrint exposés en HTTPS public (proxy sidecar, option native Gotenberg, check dans server.py WeasyPrint…) — le client est déjà câblé (Phase 17, `pdf-render.ts`).
- Architecture de l'image Docker : `turbo prune --scope=@qualiof/web`, pm2-runtime × 3 process vs 3 services séparés vs boucle unique — au choix selon la plateforme retenue.
- Bibliothèque/mécanisme du cron interne (node-cron, setInterval + garde horaire, etc.).
- Valeurs exactes timeout/concurrency/poll interval du worker recalibré.
- Déclenchement du job OCR (réutilisation d'`AIGenerationJob`, extension de la queue Postgres, ou autre) — tant que le flux pré-inscription reste fonctionnellement identique pour l'utilisateur.
- Egress SMTP OVH :465 depuis l'hôte retenu (relances factures envoient de l'email depuis le worker) — [VERIFY] en recherche.
- Résorption de la dette légère Phase 19 : `dotenv-cli` absent (scripts racine) → ajouter en devDep ou basculer sur `tsx --env-file`.
- Sort des deps `bullmq`/`ioredis` et des fichiers redis.ts/queue.ts BullMQ (retrait ou conservation morte documentée).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Régions et fondations cloud (Phase 17)
- `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` — régions verrouillées : worker Railway `europe-west4` / Fly `cdg` ; section Upstash désormais caduque (D-03) ; checklist anti-défaut-US à appliquer à la création du projet Railway/Fly.

### Queue Postgres existante (à promouvoir en prod)
- `apps/web/src/lib/closure/queue-postgres.ts` — driver SKIP LOCKED complet (claim atomique, stall reclaim 15 min, MAX_ATTEMPTS 3) écrit pour v6.
- `apps/web/scripts/closure-worker-postgres.ts` — entry-point poll loop (QUEUE_POLL_INTERVAL_MS 3000, QUEUE_CONCURRENCY 3), déjà fail-loud via `@qualiof/shared/env`.
- `apps/web/src/lib/closure/worker.ts` — `processClosureJobPayload` partagé + pattern `bumpAndFinalize` (tx Serializable prouvée sous pooler, `19-SMOKE.md`).

### Workers à porter hors BullMQ
- `apps/web/src/lib/veille/worker.ts` + `apps/web/src/lib/veille/queue.ts` — cron hebdo lundi 8h Europe/Paris.
- `apps/web/src/lib/invoice-reminders/worker.ts` + `apps/web/src/lib/invoice-reminders/queue.ts` — cron quotidien 8h ; envoie des emails SMTP (OVH :465) depuis le worker.
- `apps/web/scripts/veille-worker.ts`, `apps/web/scripts/invoice-reminder-worker.ts` — entry-points actuels (mode dégradé Redis à supprimer avec Redis).

### Doc engines + Bearer
- `apps/web/src/lib/pdf-render.ts` — client Bearer déjà câblé (`authHeaders()`, Phase 17) ; GOTENBERG_URL/WEASYPRINT_URL via sharedEnv ; footer HTML in-body à ne pas régresser.
- `docker/weasyprint/server.py` — micro-service WeasyPrint (candidat au check Bearer server-side).
- `packages/shared/src/env.ts` — `DOC_ENGINE_TOKEN` déclaré ; 5 clés cloud fail-loud au boot (Phase 17).

### OCR / pilier #4
- `apps/web/src/lib/pdf-extract.ts` — usage pdftoppm/poppler (la partie à relocaliser worker).
- `apps/web/src/lib/preinscription-extractor.ts` — pipeline OCR vision (downscale câblé Phase 18) ; déclenché fire-and-forget depuis `confirmPreEnrollmentUpload`.
- `apps/web/src/lib/ocr-downscale.ts` — module neutre sans auth (règle worker : jamais d'imports auth React).

### Preuves et état cloud
- `.planning/phases/19-base-postgres-supabase-pooler-migrations-baselin-es/19-SMOKE.md` — preuves runtime pooler :6543 / DIRECT :5432 (le worker joindra ces URLs).
- `.planning/codebase/INTEGRATIONS.md` — carte des services externes.
- ROADMAP.md § Phase 20 « Research flags » — [VERIFY] : pricing (hébergeur), DNS privé `*.railway.internal` / `*.internal` Fly, egress SMTP OVH :465, keep-warm, `turbo prune` + pm2-runtime × 3. (Le flag `maxRetriesPerRequest:null` BullMQ est caduc — D-03.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Driver queue Postgres complet et testé structurellement (`queue-postgres.ts`) : la bascule closure est un changement d'entry-point, pas une réécriture.
- `processClosureJobPayload` est partagé entre les deux drivers — le recalibrage timeout/concurrency se fait à un seul endroit.
- Fail-loud env déjà en place sur les entry-points worker (`import '@qualiof/shared/env'`).
- Bearer client déjà prêt dans `pdf-render.ts` — Phase 20 n'ajoute que l'enforcement serveur.

### Established Patterns
- Workers = process séparés sans imports auth/React (mémoire : `react does not provide an export named 'cache'`).
- Exécution séquentielle des générations en masse (jamais de runs parallèles — deadlocks closureBatch).
- `.env` racine unique, validé fail-loud au boot ; secrets jamais en variables custom.
- PDF : footer HTML in-body `position:fixed bottom:0`, jamais le footer natif Gotenberg.

### Integration Points
- `DATABASE_URL` pooler :6543 (`pgbouncer=true&connection_limit=1`) + `DIRECT_URL` :5432 — le worker cloud consommera ces URLs ; tx Serializable prouvée sous pooler (repli :5432 documenté Phase 19, non déclenché).
- `STORAGE_PROVIDER=supabase` actif — le worker lit/écrit les PDF via l'adaptateur `storage.ts`.
- AI_PROVIDER=openrouter global (Phase 16) — aucun besoin GPU/Ollama sur l'hôte.
- SMTP OVH depuis `mailer.ts` (relances factures) — egress :465 à vérifier sur la plateforme retenue.

</code_context>

<specifics>
## Specific Ideas

- Laurent ne veut pas administrer d'infra en ligne de commande : l'exploitation quotidienne du 3ᵉ hôte doit passer par un dashboard web simple (facteur décisif du choix de plateforme).
- « Est-ce qu'on peut pas tout avoir dans Supabase ? » → répondu non (D-02) ; ne pas rouvrir.

</specifics>

<deferred>
## Deferred Ideas

- Déploiement Vercel prod réel + re-validation 413/direct-to-storage + arbitrage région Supabase Paris vs Irlande → Phase 21 (déjà acté Phase 18).
- Upstash `eu-central-1` (17-REGIONS D-02 conditionnel) : caduc — Redis viré partout, aucun compte à créer.

</deferred>

---

*Phase: 20-worker-3-h-te-doc-engines*
*Context gathered: 2026-07-05*
