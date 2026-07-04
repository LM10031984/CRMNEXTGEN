# Roadmap: QualiOF

## Milestones

- ✅ **v5 Audit UX/QA + Features métier** — Phases 1-16 (+9.1/9.2/9.3), shipped 2026-07-04 → [archive](milestones/v5-ROADMAP.md)
- 🚧 **v6 Prod Cloud (Supabase + Vercel)** — Phases 17-22 : QualiOF tourne en production cloud multi-utilisateurs (Vercel app + Supabase Postgres/Storage EU + Upstash/Redis + worker/Gotenberg/WeasyPrint sur 3ᵉ hôte + filet CI/tests + bascule prod + DPA), Mac de Laurent hors de la boucle.

## Phases

<details>
<summary>✅ v5 Audit UX/QA + Features métier (Phases 1-16) — SHIPPED 2026-07-04</summary>

Détail complet : [milestones/v5-ROADMAP.md](milestones/v5-ROADMAP.md)

- [x] Phases 1-6 : audit UX/QA (responsive, TopBar, fiches, dashboard a11y)
- [x] Phases 7-8 : paramètres organisme + RBAC multi-utilisateurs
- [x] Phase 9 (+9.1/9.2/9.3) : leads auto + centralisation Qualiopi 360° + réconciliation + navigation docs
- [ ] Phase 10 : Audit Qualiopi blanc in-app — **non exécutée** (Known Gap, vrai audit BCI passé 03/07/2026)
- [x] Phases 11-12 : factures cycle complet + modules stub
- [x] Phases 13-15 : veille Qualiopi + Google Calendar + fiche session onglets
- [x] Phase 16 : migration IA Ollama → Claude API (openrouter) — completed 2026-07-04

</details>

### 🚧 v6 Prod Cloud (Supabase + Vercel) — Phases 17-22

**Milestone Goal :** QualiOF tourne en production cloud multi-utilisateurs. L'équipe Start Academy travaille sans que le Mac de Laurent soit allumé. Les 4 piliers (Pack 1-clic, Trésorerie OPCO/AGEFICE, CRM 360°, Pré-inscriptions IA) continuent de fonctionner en région EU, conformes RGPD.

**Ordre de dépendances (build order recherche) :** Fondations (région + env.ts + token) → Storage → Base Postgres → Worker 3ᵉ hôte + doc engines → App Vercel + ingress public + filet CI → Bascule prod + RGPD.

- [ ] **Phase 17: Fondations cloud (région EU + env)** — Verrouiller la région EU des 4 plateformes et fermer le gap `env.ts` (5 clés cloud + `DOC_ENGINE_TOKEN` câblé) avant toute création de projet
- [ ] **Phase 18: Supabase Storage (migration objets + direct-to-storage)** — Buckets privés opérationnels, objets MinIO migrés sans lien mort, upload photos CNI/RIB direct-to-storage (contourne le cap 4,5 MB Vercel)
- [ ] **Phase 19: Base Postgres Supabase (pooler + migrations baselinées)** — Postgres EU provisionné, drift `db push` résolu, `migrate deploy` vert, URLs poolée/directe câblées, extensions + séquences alignées
- [ ] **Phase 20: Worker 3ᵉ hôte + doc engines** — Image Docker prunée (3 workers + Gotenberg + WeasyPrint + poppler) sur Railway/Fly EU, décision Redis tranchée, pack closure généré 100 % cloud, OCR non dégradé silencieusement
- [ ] **Phase 21: App Vercel + filet CI/tests** — App Next.js sur Vercel EU (staging dégelé, cookies Lucia OK, PDF synchrones via ingress public authentifié) + GitHub Actions + E2E closure + smoke routes verts avant bascule
- [ ] **Phase 22: Bascule prod + conformité RGPD** — Runbook + rollback, dump final restauré, DNS pointé, invitations équipe, pack témoin go/no-go, alertes coûts + backups, DPA des 6 sous-traitants soldé

## Phase Details

### Phase 17: Fondations cloud (région EU + env)
**Goal**: Le socle irréversible et boot-safe est posé : région EU verrouillée et documentée sur les 4 plateformes, et toutes les clés cloud sont validées fail-loud par t3-env avant qu'aucun projet ne soit créé ni qu'aucune ligne de code cloud ne tourne.
**Depends on**: Phase 16 (v5 shippé — IA cloud déjà en place)
**Requirements**: CLOUDENV-01, CLOUDENV-02, CLOUDENV-03
**Success Criteria** (what must be TRUE):
  1. La région EU choisie (Supabase, Vercel, Upstash, Railway/Fly) est documentée dans `.planning/` avant toute création de projet — un lecteur peut vérifier « région = EU » pour les 4 plateformes
  2. Le boot de l'app échoue fort (t3-env) si une des 5 clés cloud (`DIRECT_URL`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEASYPRINT_URL`) manque ou est malformée — plus aucune lue en `process.env` brut, l'alias périmé `DOC_ENGINE_URL` est retiré
  3. `turbo.json` globalEnv déclare les 5 clés (invalidation cache correcte)
  4. Un appel Gotenberg/WeasyPrint depuis `pdf-render.ts` porte un header `Authorization: Bearer` issu de `DOC_ENGINE_TOKEN` (le token déclaré `env.ts:38` mais jamais consommé est câblé)
**Plans**: 3 plans
- [x] 17-01-PLAN.md — Doc région EU auditable des 4 plateformes (Paris, Upstash conditionnel) — CLOUDENV-01
- [ ] 17-02-PLAN.md — 5 clés cloud env.ts fail-loud + chokepoint boot + storage.ts sharedEnv + turbo/.env.example, DOC_ENGINE_URL retiré — CLOUDENV-02
- [ ] 17-03-PLAN.md — DOC_ENGINE_TOKEN Bearer sur Gotenberg+WeasyPrint + URLs sharedEnv (pdf-render.ts) — CLOUDENV-03
**Research flags** (à reprendre au plan) : [VERIFY] défaut régional US des providers (Vercel `iad1`, Supabase us-east) — choisir EU explicite AVANT création · irréversibilité région (recréer projet si erreur).

### Phase 18: Supabase Storage (migration objets + direct-to-storage)
**Goal**: Le stockage objets passe de MinIO à Supabase Storage privé sans casser un seul lien PII, et le chemin d'upload des pièces apprenants CNI/RIB est refondu en direct-to-storage pour survivre au cap 4,5 MB de Vercel (préserve le pilier #4 Pré-inscriptions IA).
**Depends on**: Phase 17
**Requirements**: STOR-01, STOR-02, STOR-03
**Success Criteria** (what must be TRUE):
  1. Un bucket Supabase Storage privé fonctionne avec `STORAGE_PROVIDER=supabase` : une signed URL à TTL court (minutes) donne accès à un objet, un accès non signé est refusé (bucket bien `public=false`)
  2. Après le script de migration idempotent (DRY→WRITE), chaque `Person.ribKey` / `Document.pdfUrl` / `PedagogicalAsset.pdfUrl` résout à un objet existant — 0 lien mort vérifié par script
  3. Une vraie photo CNI de 10 MB prise au smartphone passe l'upload en prod (direct-to-storage via signed upload URL) et déclenche l'OCR — pas de 413, pas d'échec silencieux
**Plans**: TBD
**Research flags** (à reprendre au plan) : [VERIFY] volume d'objets MinIO (sizing migration) · contraintes de nommage de clé Supabase (`//`, préfixe bucket) ≠ MinIO — table de correspondance ancienne→nouvelle clé · accès privé re-modélisé RLS/service_role (pas de policy S3 IAM JSON) · TTL signed URL courte pour PII · `unoptimized` sur les aperçus CNI/RIB (jamais `next/image` sur PII).

### Phase 19: Base Postgres Supabase (pooler + migrations baselinées)
**Goal**: La base Postgres cloud EU est saine et prouvée : le drift `db push` historique est résolu, `prisma migrate deploy` tourne vert via la connexion directe, l'app parle au pooler transaction-mode sans erreur de prepared statement, et les extensions/séquences résolvent au runtime.
**Depends on**: Phase 18
**Requirements**: DB-01, DB-02
**Success Criteria** (what must be TRUE):
  1. `prisma migrate status` est clean sur la base cloud et `_prisma_migrations` est peuplé — `migrate deploy` a vraiment tourné vert via `DIRECT_URL` :5432 (pas juste un `db push`)
  2. Un round-trip Prisma read/write depuis un worker réussit via `DATABASE_URL` poolée (`:6543 ?pgbouncer=true&connection_limit=1`) sans erreur `prepared statement already exists`
  3. Les 4 extensions (pgcrypto, uuid-ossp, pg_trgm, unaccent) résolvent au runtime — une recherche trigram et un `unaccent` fonctionnent
  4. Un INSERT test après restore ne collisionne pas de PK (séquences réalignées via `setval`)
**Plans**: TBD
**Research flags** (à reprendre au plan) : [VERIFY] hostname Supavisor exact (dashboard, pas training data) · `unaccent` dans la liste d'extensions Supabase · IPv4 add-on pour connexion directe :5432 depuis l'hôte worker · audit des `$transaction(async` interactifs (closure batch, avoirs, réconciliation) → batch array / session mode / déporter worker.

### Phase 20: Worker 3ᵉ hôte + doc engines
**Goal**: Un 3ᵉ hôte (Railway/Fly EU) porte les 3 workers BullMQ + Gotenberg + WeasyPrint + poppler, expose les doc-engines en HTTPS public authentifié, et génère un pack closure complet 100 % dans le cloud (Mac hors boucle) avec un worker recalibré pour la latence cloud — sans jamais dégrader l'OCR en silence.
**Depends on**: Phase 19
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04
**Success Criteria** (what must be TRUE):
  1. Un pack closure complet se génère de bout en bout avec le worker sur le 3ᵉ hôte et le Mac éteint — 0 stub, contenu Qualiopi conforme, worker recalibré (timeout 600s→~120s, concurrency ajustée)
  2. Un appel Vercel→Gotenberg/WeasyPrint réussit après un cold start (endpoint public + Bearer token), et le worker joint la base directe + Redis
  3. La décision Redis (Upstash vs Redis co-localisé sur le worker host) est tranchée sur facturation observée 24 h et le coût mensuel projeté est sous budget, le worker stable 24 h
  4. L'OCR/pdftoppm est explicitement tranché et implémenté (rasterisation relocalisée worker OU dégradation texte-seul avec message utilisateur) — aucune dégradation silencieuse du pilier #4
**Plans**: TBD
**Research flags** (à reprendre au plan) : [VERIFY] pricing Upstash actuel (décision Redis) · syntaxe DNS privé Railway `*.railway.internal` / Fly `*.internal` · egress SMTP OVH :465 depuis Railway/Fly (email dans le worker, pas server action) · `maxRetriesPerRequest:null` BullMQ · keep-warm min instance ≥ 1 vs cold start · `turbo prune --scope=@qualiof/web` + pm2-runtime × 3.

### Phase 21: App Vercel + filet CI/tests
**Goal**: L'app Next.js tourne sur Vercel Pro EU avec login/logout et form public fonctionnels, les ~9 rendus PDF synchrones passent par l'ingress doc-engine public authentifié, et un filet de sécurité (CI GitHub Actions + E2E closure + smoke routes) est vert AVANT toute bascule prod.
**Depends on**: Phase 20 (les server actions PDF Vercel dépendent de l'endpoint doc-engine provisionné avec le worker)
**Requirements**: APP-01, APP-02, APP-03, CI-01, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. L'app est déployée sur Vercel région EU, staging dégelé (flag `NEXT_PUBLIC_APP_ENV`, filigrane staging, garde PDF, `vercel.json` maxDuration par route)
  2. Le flux login → app → logout fonctionne sur le domaine final (cookie `secure`, `sameSite:lax`) et le formulaire public `/p/[token]` est accessible
  3. Les ~9 server actions PDF synchrones (convocation, factures, programme, déroulé, veille-export…) rendent leur PDF via l'endpoint doc-engine public authentifié (DOC_ENGINE_TOKEN) — plus aucun binaire natif dans le périmètre Vercel
  4. GitHub Actions (lint + tsc + vitest) est vert sur PR en gate branch protection, l'échec pré-existant `shared-template.test.ts` est corrigé ou quarantiné explicitement
  5. Playwright E2E du flow closure (session → participants → pack → docs) et les smoke tests des routes protégées (redirect auth + 200) passent
**Plans**: TBD
**UI hint**: yes
**Research flags** (à reprendre au plan) : [VERIFY] `@supabase/supabase-js` dans package.json · Vercel Pro `maxDuration` par route (défaut 300s / max 800s, pas 1800s beta) · vérif `NODE_ENV`/`APP_ENV` réellement `production` en HTTPS (sinon cookie non-secure = login en boucle) · vérif origine CSRF Lucia derrière proxy Vercel · rate-limit form public `/p/[token]` (bruteforce token / coût OCR).

### Phase 22: Bascule prod + conformité RGPD
**Goal**: La bascule vers la prod cloud est exécutée proprement (runbook + rollback écrits d'abord, dump final restauré, DNS pointé, équipe invitée) et validée par un pack témoin go/no-go, pendant que la dette de conformité est soldée : DPA des 6 sous-traitants documenté et gaté AVANT que les PII prod ne circulent.
**Depends on**: Phase 21
**Requirements**: CUT-01, CUT-02, RGPD-01
**Success Criteria** (what must be TRUE):
  1. Le runbook de bascule et le plan de rollback sont écrits AVANT la fenêtre, le dump final est restauré (invariants vérifiés, 0 lien mort storage), le DNS pointe la prod, les invitations équipe sont envoyées (RBAC Phase 8)
  2. Un pack témoin généré post-bascule sert de gate go/no-go et réussit (0 stub, docs Qualiopi conformes, aucun 404 sur les preuves)
  3. Les alertes coûts (OpenRouter, Upstash/Redis, Supabase) et les backups daily sont confirmés actifs
  4. Le registre des traitements est complet : DPA documenté pour les 6 sous-traitants (OpenRouter, Anthropic, Supabase, Vercel, Upstash, Railway/Fly) — et l'audit des `console.*` du worker/generators ne loggue aucun PII brut — AVANT que les PII prod ne circulent
**Plans**: TBD
**Research flags** (à reprendre au plan) : [VERIFY] région des backups Supabase (EU) · scrubber logs (logger des IDs, pas CNI/RIB) · destructif = étape séparée (pg_dump + vérif invariants avant de couper le local — convention projet) · gate RGPD/DPA doit précéder le flux PII prod (D-02b hérité Phase 16).

## Progress

**Execution Order:**
Les phases s'exécutent dans l'ordre : 17 → 18 → 19 → 20 → 21 → 22

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 17. Fondations cloud | v6 | 1/3 | In Progress|  |
| 18. Supabase Storage | v6 | 0/TBD | Not started | - |
| 19. Base Postgres | v6 | 0/TBD | Not started | - |
| 20. Worker 3ᵉ hôte | v6 | 0/TBD | Not started | - |
| 21. App Vercel + CI | v6 | 0/TBD | Not started | - |
| 22. Bascule prod + RGPD | v6 | 0/TBD | Not started | - |
