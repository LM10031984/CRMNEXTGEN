# 22-COSTS-BACKUPS — Alertes coûts (4 plateformes) + backups Supabase

**Date d'exécution :** 2026-08-03 (plan 22-08, CUT-02 seconde moitié — décisions D-11/D-12)
**Cible email des alertes (D-11) :** `laurent@start-academy.fr` — email réel constaté par plateforme
dans chaque section ci-dessous (les plateformes notifient l'email du compte/billing, non
configurable séparément partout ; écarts acceptés explicitement par Laurent le 2026-08-03).
**Méthode :** tout ce qui était accessible par API a été exécuté et prouvé par API (JSON datés
dans `evidence/`, commit `360f0b7`) ; les écrans dashboard-only ont été configurés le 2026-08-03
via le navigateur de Laurent (Claude in Chrome, Laurent aux commandes — pattern 21-04).

**Garde-fou transversal (anti Pitfall 5) :** aucune alerte configurée ne peut éteindre la prod
toute seule — pas d'auto-pause Vercel, pas de hard limit Railway. Le SEUL plafond dur assumé est
OpenRouter (voulu : HTTP 402 → recharger les crédits, conduite au runbook §7) et le spend cap
Supabase (plafonne la facture SANS couper la base).

---

## 1. Vercel — Spend Management

| Réglage | Valeur effective |
| --- | --- |
| Budget On-Demand | **45 $** / mois (~1,5× le coût attendu 30 $/mois plan Pro + add-on) |
| Notifications | **ON** (email — compte owner de la team `laurents-projects-3806ab87`) |
| « Pause Production Deployments » (auto-pause) | **OFF — vérifié** (anti Pitfall 5 : l'atteinte du budget alerte mais ne coupe JAMAIS la prod) |

- **Fait le :** 2026-08-03, dashboard Team Settings → Billing → Spend Management (rôle OWNER
  confirmé par API). Confirmation par saisie du nom d'équipe, toast « Spend Management updated »,
  affichage post-pose **0 $ / 45 $**.
- **Note API :** aucun endpoint public Spend Management (sondes API 404) — configuration
  dashboard-only, attestée par la session du 2026-08-03.

## 2. Railway — Usage Limits (posée par API)

| Réglage | Valeur effective |
| --- | --- |
| Soft limit (alerte email) | **35 $** (~1,5× le coût attendu 20-25 €/mois ; usage courant au relevé : 10,43 $) |
| Hard limit | **ABSENT (`hardLimit: null`) — vérifié post-pose** (anti Pitfall 5 : un hard limit couperait worker + Gotenberg + WeasyPrint d'un coup) |
| Email d'alerte | `laurentmarx@msn.com` (email compte/billing du workspace, non modifiable par API) |

- **Fait le :** 2026-08-03 par **API GraphQL** (`usageLimitSet(customerId, softLimitDollars: 35)`
  → `true`, relecture `usageLimit { softLimit: 35, hardLimit: null }`).
- **Preuve :** `evidence/railway-usage-limit-2026-08-03.json`.
- **Écart email accepté par Laurent (2026-08-03) :** l'alerte part vers `laurentmarx@msn.com`
  (email de notification de facturation du compte Railway) et non `laurent@start-academy.fr` —
  sans rapport avec l'expéditeur des emails applicatifs (`formation@start-academy.fr`).

## 3. Supabase — Spend cap

| Réglage | Valeur effective |
| --- | --- |
| Spend cap (Cost Control) | **ON — vérifié** (« Spend cap is enabled », org `LM10031984's Org`, plan **Pro**) |
| Effet | Plafond dur à ~25 $/mois (plan Pro) **SANS couper la base** — rien de plus à configurer (anti Pitfall 5 par construction) |

- **Fait le :** 2026-08-03, dashboard Org → Billing (aucun changement nécessaire — défaut Pro
  conservé). Factures historiques 25-35 $/mois cohérentes avec le plafond.
- **Note compte (piège d'accès) :** le bon compte Supabase est celui **lié à GitHub
  (LM10031984)** — un premier login sur `laurent@start-academy.fr` tombait sur une org Free
  homonyme sans le projet Qualiof.
- **Preuve région/plan par API :** `evidence/supabase-project-region-2026-08-03.json`
  (projet `gntlqyscahbgjrmsbzil`, `region: eu-west-1`, org plan `pro`, ACTIVE_HEALTHY).

## 4. OpenRouter — Auto Top-Up + credit limit clé prod

| Réglage | Valeur effective |
| --- | --- |
| Auto Top-Up | **OFF — vérifié** (bouton « Enable » visible = désactivé) → le solde prépayé est le plafond dur voulu |
| Solde au relevé | **19,20 $** (230 crédits − 210,80 usage — ordre de grandeur cible ~15 €) |
| Credit limit clé prod (`sk-or-v1-9c7…c8e`) | **25 $ / mois** (« Reset limit = Monthly ») — jauge post-pose : **Monthly 0,13 $ / 25 $ (1 %)** |
| Compte | `julien@start-academy.fr` (les notifications OpenRouter partent vers cet email) |

- **Fait le :** 2026-08-03 — solde et état de la clé prouvés par API
  (`evidence/openrouter-credits-2026-08-03.json`, `evidence/openrouter-key-2026-08-03.json`,
  usage mensuel 0,13 $ ≈ 10 €/mois attendu) ; Auto Top-Up et credit limit posés/vérifiés au
  dashboard (pas d'API sans provisioning key).
- ⚠ **LEÇON (piège credit limit OpenRouter) :** la limite par défaut s'applique au
  **TOTAL LIFETIME de la clé** — avec 38,93 $ déjà consommés, une limite « 25 $ » simple
  passait la clé à 100 % et **bloquait la prod IA immédiatement**. Correction appliquée :
  **credit limit 25 $ AVEC « Reset limit = Monthly »**. Règle permanente : toute limite de clé
  OpenRouter doit être posée en **mensuel**, jamais en total.
- **Conduite en cas de plafond atteint :** packs closure en échec **HTTP 402** = le plafond a
  fait son travail → recharger les crédits au dashboard, relancer le pack (runbook §7).

---

## 5. Backups Supabase (D-12)

**Backups Supabase daily ACTIFS (plan Pro, rétention 7 jours), projet eu-west-1 (Irlande, UE ✓)
— preuve API management du 2026-08-03** (supérieure à une capture dashboard : relevé à la source) :

- `GET /v1/projects/gntlqyscahbgjrmsbzil/database/backups` → `region: "eu-west-1"`,
  `walg_enabled: true` (backups physiques), `pitr_enabled: false`,
  **6 snapshots daily `COMPLETED`** du 2026-07-27 au 2026-08-02 (~05h37 UTC chaque jour) —
  fichier : `evidence/supabase-backups-2026-08-03.json` ;
- région projet re-confirmée : `evidence/supabase-project-region-2026-08-03.json`
  (`region: "eu-west-1"`, dérogation Irlande actée `17-REGIONS.md`, D-05 Phase 21).

**Observation non bloquante :** au relevé (2026-08-03T10:30Z), la liste montre un trou au
01/08 et le snapshot du 03/08 n'était pas encore listé (dernier : 02/08 05:37 UTC). Le rythme
daily est prouvé sur 6 jours consécutifs sinon ; à re-vérifier d'un œil au dashboard
Database → Backups lors d'un prochain passage.

**Limite assumée (Pitfall 7) :** snapshots stockés dans la même région AWS que le projet,
non off-site — une défaillance régionale emporterait base ET backups ; pg_dump hors vendor =
backlog assumé (D-12, Future Requirements).

---

## Récapitulatif — état final (0 item en attente)

| Plateforme | Alerte/garde-fou | Seuil | Anti Pitfall 5 | Preuve |
| --- | --- | --- | --- | --- |
| Vercel | Budget Spend Management + notifications email | 45 $ | auto-pause **OFF** | dashboard 2026-08-03 (toast + 0/45 $) |
| Railway | Soft limit email | 35 $ | hard limit **ABSENT** | `evidence/railway-usage-limit-2026-08-03.json` |
| Supabase | Spend cap ON (plan Pro) | ~25 $/mois | plafonne SANS couper la DB | dashboard 2026-08-03 + JSON région/plan |
| OpenRouter | Auto Top-Up OFF + credit limit clé **mensuelle** | solde 19,20 $ / clé 25 $/mois | 402 = conduite runbook §7 | `evidence/openrouter-*-2026-08-03.json` |
| Supabase backups | daily, rétention 7 jours, eu-west-1 | — | non off-site assumé (Pitfall 7) | `evidence/supabase-backups-2026-08-03.json` |

*Rempli le 2026-08-03 — plan 22-08 (CUT-02). Runbook : renvoi §9.6.*
