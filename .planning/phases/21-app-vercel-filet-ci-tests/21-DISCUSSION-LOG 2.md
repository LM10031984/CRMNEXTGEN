# Phase 21: App Vercel + filet CI/tests - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 21-app-vercel-filet-ci-tests
**Areas discussed:** Environnements staging/prod Vercel, Région Supabase Paris vs Irlande, CI GitHub Actions & workflow Git, E2E Playwright & smoke routes

---

## Environnements staging/prod Vercel

| Option | Description | Selected |
|--------|-------------|----------|
| Un seul projet Vercel | Staging (filigrane + gardes) puis promu prod en Phase 22 (DNS + flag) | ✓ |
| Deux projets séparés | Staging permanent après bascule, double config | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tout ce qui sort bloqué | Emails dry-run, Google Calendar off, filigrane PDF STAGING | ✓ |
| Filigrane PDF seulement | Emails/calendrier réels | |
| Rien | Staging = copie conforme prod | |

| Option | Description | Selected |
|--------|-------------|----------|
| Base cloud actuelle | Le Supabase réel (future prod), déjà pointé par .env local | ✓ |
| Copie séparée | 2ᵉ projet Supabase restauré d'un dump, double coût | |

| Option | Description | Selected |
|--------|-------------|----------|
| Domaine final dès Phase 21 | Ex. app.start-academy.fr, non communiqué ; cookies/CSRF validés sur le vrai domaine | ✓ |
| vercel.app d'abord | Domaine branché seulement en Phase 22 | |

**User's choice:** Toutes options recommandées retenues.

---

## Région Supabase : Paris vs Irlande

| Option | Description | Selected |
|--------|-------------|----------|
| Rester en Irlande | eu-west-1 UE/RGPD OK, tout migré et prouvé, dérogation actée | ✓ |
| Recréer à Paris | eu-west-3, 1-2 jours de re-migration complète | |

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill MinIO en Phase 21 | Audit + migration des objets manquants AVANT les tests staging, MinIO non purgé | ✓ |
| Backfill en Phase 22 | Traité au runbook de bascule, liens morts possibles en staging | |

**User's choice:** Irlande définitive + backfill en Phase 21.

---

## CI GitHub Actions & workflow Git

| Option | Description | Selected |
|--------|-------------|----------|
| Flux PR sur main | Merge cloud-migration→main, main protégée, Claude gère les PR via gh | ✓ |
| CI sur push sans PR | Commits directs conservés, pas de gate branch protection | |

| Option | Description | Selected |
|--------|-------------|----------|
| Corriger shared-template.test.ts | Écart MIME jpeg/jpg mineur, CI 100 % verte | ✓ |
| Quarantaine explicite | Skip documenté + ticket | |

| Option | Description | Selected |
|--------|-------------|----------|
| Déploiement auto sur merge main | Vercel + migrate deploy (secret DIRECT_URL) + Railway rebuild | ✓ |
| Déploiement manuel contrôlé | Déclenchement à la main après CI verte | |

**User's choice:** Toutes options recommandées retenues.

---

## E2E Playwright & smoke routes

| Option | Description | Selected |
|--------|-------------|----------|
| Contre le staging déployé, à la demande | Gate PR = lint+tsc+vitest seulement ; E2E avant bascule + après gros déploiements | ✓ |
| Sur chaque PR aussi | Coût IA + 10-15 min par PR, niveau écarté par le roadmap | |

| Option | Description | Selected |
|--------|-------------|----------|
| IA réelle sur session jetable | Session fictive → vrai pack OpenRouter → vérif docs sans stub → nettoyage | ✓ |
| IA simulée (stub) | Gratuit mais ne prouve pas la chaîne réelle | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pages clés des 4 piliers (~10 routes) | Login, dashboard, sessions, apprenants, OPCO, AGEFICE, factures, préinscriptions, /p/[token] | ✓ |
| Toutes les pages du menu | ~20+ routes, maintenance lourde | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rate-limit simple par IP | Protège bruteforce token + coût OCR dès l'exposition publique | ✓ |
| Plus tard (Phase 22) | Risque immédiat faible, URL non communiquée | |

**User's choice:** Toutes options recommandées retenues.

---

## Claude's Discretion

- Valeurs maxDuration par route (vercel.json, Pro 300s/800s)
- Implémentation filigrane STAGING + flag NEXT_PUBLIC_APP_ENV
- Mécanisme rate-limit (sans Redis)
- Config Playwright + stratégie nettoyage session de test
- Workflows GitHub Actions (jobs, cache, secrets) + branch protection exacte
- Vérifs cookie secure/CSRF Lucia derrière proxy Vercel
- Re-validation des 3 items PENDING Phase 18 sur Vercel

## Deferred Ideas

- Purge MinIO local (Phase 22+, destructif = étape séparée)
- Retrait filigrane + communication domaine + invitations équipe (Phase 22)
- Refactor async des 9 actions PDF — Option B (post-cutover)
- Rate-limit avancé / WAF (post-bascule)
