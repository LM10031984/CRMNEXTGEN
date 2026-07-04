# Requirements: QualiOF — Milestone v6 Prod Cloud (Supabase + Vercel)

**Defined:** 2026-07-04
**Core Value:** Les 4 piliers QualiOF continuent de fonctionner — mais en production cloud multi-utilisateurs, sans dépendre du Mac de Laurent.

## v6 Requirements

### CLOUD-ENV — Fondations (région + env)

- [x] **CLOUDENV-01** : Région EU verrouillée et documentée pour les 4 plateformes (Supabase, Vercel, Upstash, Railway/Fly) AVANT toute création de projet — choix irréversible
- [x] **CLOUDENV-02** : Les 5 clés cloud (`DIRECT_URL`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEASYPRINT_URL`) déclarées et validées dans `packages/shared/src/env.ts` (t3-env fail-loud) + `turbo.json` globalEnv ; alias périmé `DOC_ENGINE_URL` remplacé
- [x] **CLOUDENV-03** : `DOC_ENGINE_TOKEN` (déclaré `env.ts:38`, jamais consommé) câblé dans `pdf-render.ts` — bearer sur tous les appels Gotenberg/WeasyPrint

### STOR — Supabase Storage

- [x] **STOR-01** : Buckets Supabase Storage privés opérationnels, `STORAGE_PROVIDER=supabase` testé, signed URLs vérifiées (TTL minutes)
- [x] **STOR-02** : Objets MinIO migrés vers Supabase Storage (script idempotent DRY→WRITE), 0 lien mort vérifié sur `Person.ribKey` / `Document.pdfUrl` / `PedagogicalAsset.pdfUrl`
- [x] **STOR-03** : Upload direct-to-storage pour les pièces apprenants CNI/RIB (signed upload URL côté client, contourne le cap 4,5 MB body Vercel) — preuve : photo 10 MB uploadée + OCR déclenché

### DB — Supabase Postgres

- [ ] **DB-01** : Supabase Postgres EU provisionné, historique migrations Prisma baseliné (résolution drift `db push`), `prisma migrate deploy` vert via `DIRECT_URL` :5432
- [ ] **DB-02** : `DATABASE_URL` poolée (`:6543 ?pgbouncer=true&connection_limit=1`) + `DIRECT_URL` directe câblées, 4 extensions actives (pgcrypto, uuid-ossp, pg_trgm, unaccent), séquences alignées post-restore

### WORK — Worker 3ᵉ hôte

- [ ] **WORK-01** : Image Docker prunée (`turbo prune`, pm2-runtime × 3 workers closure/veille/factures, poppler-utils) déployée sur Railway ou Fly EU ; Gotenberg + WeasyPrint en services privés siblings
- [ ] **WORK-02** : Décision Redis tranchée (Upstash vs Redis co-localisé sur le worker host) sur facturation observée 24 h
- [ ] **WORK-03** : Pack closure complet généré 100 % cloud (Mac éteint de la boucle), worker recalibré (timeout 600s→~120s, concurrency ajustée)
- [ ] **WORK-04** : Décision pdftoppm/OCR tranchée et implémentée — soit dégradation texte-seul assumée sur Vercel avec message utilisateur, soit rasterisation relocalisée worker. Pas de dégradation silencieuse (pilier #4)

### APP — Vercel

- [ ] **APP-01** : App Next.js déployée Vercel Pro région EU, staging dégelé (flag `NEXT_PUBLIC_APP_ENV`, filigrane staging, garde PDF, `vercel.json` maxDuration par route)
- [ ] **APP-02** : Auth Lucia fonctionnelle sur Vercel (login/logout, cookies secure) + formulaire public `/p/[token]` accessible
- [ ] **APP-03** : Les ~9 server actions PDF synchrones (convocation, factures, programme, déroulé, veille-export…) passent par l'endpoint doc-engine public authentifié (DOC_ENGINE_TOKEN)

### CI-TEST — Filet de sécurité

- [ ] **CI-01** : GitHub Actions — lint + tsc + vitest sur PR (gate branch protection) + build Docker worker + `prisma migrate deploy` (DIRECT_URL) en étape de déploiement
- [ ] **TEST-01** : Playwright E2E flow closure (création session → participants → pack → docs générés)
- [ ] **TEST-02** : Smoke tests routes protégées (redirect auth + 200 sur pages clés)

### CUT — Bascule prod

- [ ] **CUT-01** : Runbook bascule + plan rollback écrits AVANT la fenêtre de bascule ; dump final restauré, DNS pointé, invitations équipe envoyées (RBAC Phase 8)
- [ ] **CUT-02** : Pack témoin post-bascule = gate go/no-go ; alertes coûts (OpenRouter/Upstash/Supabase) + backups daily confirmés actifs

### RGPD — Conformité

- [ ] **RGPD-01** : Registre des traitements complet — DPA documenté pour les 6 sous-traitants (OpenRouter, Anthropic, Supabase, Vercel, Upstash, Railway/Fly) — solde la dette engagée par le GO vision 2026-07-04

## Future Requirements (backlog, hors v6)

- Staging persistant (2ᵉ projet Supabase + previews Vercel branchées)
- `pg_dump` cron vers stockage indépendant du vendor
- Uptime ping + heartbeat worker
- QBLANC-01..03 (audit blanc in-app) · DOC-01/02 (RGPD export/suppression) · AI-01 (embeddings) · MOBILE-01 (PWA formateurs)

## Out of Scope (v6)

- **k8s / multi-région / blue-green / IaC / Datadog / SSO entreprise** — sur-ingénierie pour 2-5 utilisateurs internes
- **Supabase PITR** — backups daily suffisent à cette échelle (réévaluable)
- **Refactor async des 9 server actions PDF** (Option B) — Option A (endpoint public authentifié) suffit pour la bascule ; B = optimisation post-cutover
- **DB-par-PR / E2E exhaustif** — TEST-01/02 = filet minimal viable

## Traceability

**Coverage : 21/21 REQ-IDs mappés — aucun orphelin, aucun doublon.**

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CLOUDENV-01 | Phase 17 | Complete |
| CLOUDENV-02 | Phase 17 | Complete |
| CLOUDENV-03 | Phase 17 | Complete |
| STOR-01 | Phase 18 | Complete |
| STOR-02 | Phase 18 | Complete |
| STOR-03 | Phase 18 | Complete |
| DB-01 | Phase 19 | Pending |
| DB-02 | Phase 19 | Pending |
| WORK-01 | Phase 20 | Pending |
| WORK-02 | Phase 20 | Pending |
| WORK-03 | Phase 20 | Pending |
| WORK-04 | Phase 20 | Pending |
| APP-01 | Phase 21 | Pending |
| APP-02 | Phase 21 | Pending |
| APP-03 | Phase 21 | Pending |
| CI-01 | Phase 21 | Pending |
| TEST-01 | Phase 21 | Pending |
| TEST-02 | Phase 21 | Pending |
| CUT-01 | Phase 22 | Pending |
| CUT-02 | Phase 22 | Pending |
| RGPD-01 | Phase 22 | Pending |
