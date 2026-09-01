# Phase 21: App Vercel + filet CI/tests - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

L'app Next.js tourne sur Vercel Pro région EU en mode staging gardé (flag `NEXT_PUBLIC_APP_ENV`, filigrane PDF, sorties externes bloquées, `vercel.json` maxDuration par route), le flux login → app → logout et le formulaire public `/p/[token]` fonctionnent sur le domaine final, les ~9 server actions PDF synchrones passent par les doc-engines Railway publics authentifiés (DOC_ENGINE_TOKEN), et le filet de sécurité est vert : GitHub Actions (lint + tsc + vitest) en gate PR sur `main` protégée + build Docker worker + `prisma migrate deploy` en étape de déploiement, Playwright E2E closure et smoke routes contre le staging déployé.

Requirements : APP-01, APP-02, APP-03, CI-01, TEST-01, TEST-02.

</domain>

<decisions>
## Implementation Decisions

### Environnements staging/prod Vercel (APP-01, APP-02)
- **D-01 :** **Un seul projet Vercel** — il sert de staging maintenant (filigrane + gardes) et devient la prod en Phase 22 (bascule = brancher DNS officiel + passer le flag en production). Pas de projet staging séparé, un seul jeu de variables.
- **D-02 :** **Garde staging = tout ce qui sort est bloqué** : emails en dry-run (loggés, pas envoyés — le mécanisme `SMTP_HOST` vide de `mailer.ts` existe déjà), rappels Google Calendar non créés, PDF marqués d'un filigrane STAGING bien visible. Zéro risque qu'un apprenant reçoive un mail/doc de test alors que l'app parle à la vraie base.
- **D-03 :** **Le staging pointe la base cloud actuelle** (le Supabase réel, vraies données — celle que `.env` local pointe déjà). C'est elle qui devient la prod ; la garde D-02 protège des effets de bord.
- **D-04 :** **Le domaine final est branché dès la Phase 21** (ex. app.start-academy.fr → Vercel), sans le communiquer à l'équipe. Cookies `secure` + CSRF Lucia validés sur le VRAI domaine — la bascule Phase 22 devient triviale. Le nom de sous-domaine exact : à confirmer avec Laurent au moment du câblage DNS (question opérationnelle, pas bloquante pour le plan).
- **NB branche `staging-vercel`** : elle est 94 commits DERRIÈRE `cloud-migration` et 0 devant — elle est obsolète. « Staging dégelé » = reprendre le *plan* E1-E4 (filigrane, garde PDF, vercel.json), pas la branche. Ne rien merger depuis `staging-vercel`.

### Région Supabase (arbitrage hérité Phase 18)
- **D-05 :** **Irlande (eu-west-1) définitive.** UE donc RGPD conforme, tout est migré et prouvé (base + 3109 objets + smokes verts). Acter la dérogation dans `17-REGIONS.md` (amendement documentaire). Ne plus re-proposer Paris.
- **D-06 :** **Audit + backfill MinIO→Supabase en Phase 21, AVANT les tests staging** (bug SES-0094 : objets locaux jamais migrés). Les E2E/smoke vérifient alors des documents réellement lisibles — pas de faux vert. **MinIO n'est PAS purgé** (convention : destructif = étape séparée, Phase 22+).

### CI GitHub Actions & workflow Git (CI-01)
- **D-07 :** **Flux PR sur `main`** : merger `cloud-migration` dans `main`, protéger `main` (CI verte obligatoire), travail futur en PR — Claude ouvre et merge les PR via `gh` pour Laurent. Repo : `LM10031984/CRMNEXTGEN`, `gh` déjà authentifié.
- **D-08 :** **`shared-template.test.ts` corrigé** (pas de quarantaine) — l'écart MIME jpeg/jpg est mineur, la CI démarre 100 % verte sans exception.
- **D-09 :** **Déploiement auto sur merge dans `main`** : Vercel redéploie, GitHub Actions joue `prisma migrate deploy` (DIRECT_URL en secret GitHub chiffré), Railway rebuild le worker. Le filigrane staging protège pendant la période de test.

### E2E Playwright & smoke routes (TEST-01, TEST-02)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Régions et environnement cloud
- `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` — régions verrouillées + checklist anti-défaut-US ; à AMENDER : dérogation Supabase Irlande définitive (D-05).
- `packages/shared/src/env.ts` — validation fail-loud t3-env, 5 clés cloud (Phase 17) ; y ajouter `NEXT_PUBLIC_APP_ENV`.

### Doc-engines Railway (Phase 20)
- `.planning/phases/20-worker-3-h-te-doc-engines/20-DEPLOY.md` — runbook Railway : 3 services (worker privé + gotenberg-proxy Caddy public + weasyprint public), ~15 variables, Bearer.
- `apps/web/src/lib/pdf-render.ts` — client Bearer déjà câblé (`authHeaders()`) ; `GOTENBERG_URL` Vercel → domaine PUBLIC du proxy Caddy, `WEASYPRINT_URL` → service public. Footer HTML in-body à ne pas régresser.

### Storage / backfill MinIO (D-06)
- `.planning/audit/STORAGE-MIGRATION-REPORT-2026-07-04.md` — rapport migration Phase 18 (3109 objets, 0 lien mort à date) — base de comparaison pour l'audit des objets créés depuis.
- `apps/web/scripts/migrate-storage.ts` — script migration idempotent DRY→WRITE à réutiliser pour le backfill.
- `.planning/phases/18-supabase-storage-migration-objets-direct-to-storage/18-SMOKE.md` — 3 items PENDING à re-valider sur Vercel déployé (413, retry réseau, expiration signed URL).

### Gardes staging (D-02)
- `apps/web/src/lib/mailer.ts` — dry-run auto quand `SMTP_HOST` vide (mécanisme existant pour la garde emails).
- `apps/web/src/lib/calendar/sync-session.ts` — sync Google Calendar à neutraliser en staging.

### Tests
- `apps/web/src/lib/closure/__tests__/shared-template.test.ts` — échec pré-existant MIME jpeg/jpg à corriger (D-08).
- ROADMAP.md § Phase 21 « Research flags » — maxDuration Vercel Pro (300s/800s), cookie secure HTTPS, CSRF Lucia derrière proxy, rate-limit `/p/[token]`. Le flag `@supabase/supabase-js` est LEVÉ (présent, `apps/web/package.json`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Les 9 server actions PDF synchrones identifiées : `convocation-generator.ts`, `invoices.ts`, `programme-generator.ts`, `deroule-product-generator.ts`, `veille-export.ts`, `generate-grille-obs-session.ts`, `regenerate-grille.ts`, `legal-docs-generator.ts`, `agefice-attendance-generator.ts` (toutes passent par `pdf-render.ts` → APP-03 = câblage env, pas de refactor).
- `mailer.ts` dry-run existant = brique de la garde emails staging.
- Suite Vitest 1166 tests verte (1 seul échec pré-existant `shared-template.test.ts`) — la CI vitest a une base saine.
- `@supabase/supabase-js` déjà en dépendance ; adaptateur `storage.ts` avec `STORAGE_PROVIDER=supabase` actif.

### Established Patterns
- Option A verrouillée (REQUIREMENTS) : endpoint doc-engine public authentifié — PAS de refactor async des 9 actions (Option B explicitement hors scope).
- TEST-01/02 = filet minimal viable — DB-par-PR et E2E exhaustif explicitement hors scope.
- 0 Redis partout (Phase 20 D-03) — le rate-limit D-13 ne doit PAS réintroduire Redis.
- Secrets jamais en variables custom ; env validé fail-loud au boot.

### Integration Points
- **Rien n'existe** : pas de `vercel.json`, pas de `.github/workflows/`, pas de config Playwright, pas de `NEXT_PUBLIC_APP_ENV`, pas de code filigrane — tout est à créer.
- Repo GitHub `LM10031984/CRMNEXTGEN` avec `gh` authentifié (compte LM10031984) ; branches : `cloud-migration` (courante, en avance), `main` (à rattraper), `staging-vercel` (obsolète — 94 commits derrière).
- Base : pooler :6543 (`pgbouncer=true&connection_limit=1`) pour l'app Vercel, `DIRECT_URL` :5432 pour `migrate deploy` en CI.
- Phase 20 pas 100 % close (relevé stabilité 24 h du worker Railway attendu 2026-07-07) — les URLs publiques Railway doivent être disponibles avant le câblage APP-03.

</code_context>

<specifics>
## Specific Ideas

- Laurent délègue l'exécution technique (PR, merges, config) : Claude pilote `gh` et les dashboards ; l'exploitation quotidienne doit rester sans CLI pour Laurent (pattern Phase 20).
- Le filigrane doit être « bien visible » sur les PDF staging — aucun doc généré pendant la période staging ne doit pouvoir être confondu avec un document officiel Qualiopi.

</specifics>

<deferred>
## Deferred Ideas

- **Purge MinIO local** — après bascule validée, étape destructive séparée (Phase 22+, convention destructif).
- **Retrait du filigrane + communication du domaine à l'équipe + invitations** — Phase 22 (bascule officielle).
- **Refactor async des 9 actions PDF (Option B)** — optimisation post-cutover, déjà hors scope REQUIREMENTS.
- **Rate-limit avancé / WAF** — la protection simple par IP (D-13) suffit pour la Phase 21 ; durcissement éventuel post-bascule.

</deferred>

---

*Phase: 21-app-vercel-filet-ci-tests*
*Context gathered: 2026-07-06*
