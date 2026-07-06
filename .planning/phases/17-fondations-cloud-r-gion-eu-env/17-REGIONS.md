# Phase 17 — Régions cloud EU (verrouillage écrit)

**Verrouillé:** 2026-07-04
**Portée:** choix pré-création — **à consulter AVANT toute création de projet cloud (Phase 18 / 19 / 20)**.
**Requirement:** CLOUDENV-01 (Milestone v6 Prod Cloud).

> Ce document est la **source de vérité auditable** des régions cloud de QualiOF. Un lecteur (auditeur Qualiopi, DPO, futur exécutant de plan) doit pouvoir y vérifier sans ambiguïté que **chaque plateforme est en région EU** — et connaître le code région exact à sélectionner au moment de la création. Aucun projet cloud n'est créé en Phase 17 : c'est un verrouillage **par écrit**, en amont.

---

## Décision région (D-01)

**Région retenue : Paris.** Les données stagiaires (PII : CNI, RIB, CFP, dossiers AGEFICE/OPCO) sont **hébergées en France** — argument RGPD / audit Qualiopi simple et fort pour un organisme de formation français. Latence excellente depuis Vence (siège Start Academy).

- Supabase → `eu-west-3` (Paris)
- Vercel → `cdg1` (Paris)

> **Alternative cohérente écartée : tout Frankfurt** (co-localisation inter-services Vercel↔Supabase↔worker, ~10 ms de latence en moins). Écartée car la **résidence des données en France** prime pour un OF français à 2-5 utilisateurs internes — le gain de latence est négligeable à cette échelle, l'argument « données en France » ne l'est pas.

---

## Amendement D-05 (Phase 21, 2026-07-06) : Supabase = `eu-west-1` Irlande DÉFINITIVE

**La cible `eu-west-3` (Paris) pour Supabase est caduque.** Le projet Supabase réellement utilisé est **`gntlqyscahbgjrmsbzil`, région West EU (Irlande, `eu-west-1`)** — projet staging du 2026-06-03 réutilisé sur décision de Laurent (Phase 18).

- **RGPD conforme** : l'Irlande est dans l'UE — l'exigence CLOUDENV-01 « région EU » est satisfaite. Seul l'argument secondaire « données en France » tombe.
- **Preuves d'usage** : base Postgres 17.6 migrée et prouvée (Phase 19 — baseline `0_init`, smoke `db:smoke:cloud` 4/4) + **3109 objets Storage migrés, 0 lien mort** (Phase 18).
- **Dérogation actée par Laurent** (Phase 18, confirmée arbitrage Phase 21) : la région Supabase étant **immuable** (recréer + migrer sinon), le coût d'un retour Paris n'est pas justifié pour 2-5 utilisateurs internes.
- **Conséquence** : **ne plus re-proposer Paris pour Supabase.** Les lignes `eu-west-3` ci-dessous sont conservées pour l'historique de la décision D-01 mais sont SUPERSÉDÉES par cet amendement. Vercel reste `cdg1` (Paris), Railway reste `europe-west4`.

---

## Table des 4 plateformes

| Plateforme | Rôle | Région EU cible | Code région | Statut décision | Immutable ? | Comment fixer EU explicitement |
|------------|------|-----------------|-------------|-----------------|-------------|--------------------------------|
| **Supabase** | Postgres + Storage | Paris | `eu-west-3` | **FERME** | **OUI — recréer projet + migrer si erreur** | Choisir à la création du projet (dashboard). ⚠ Défaut souvent us-east |
| **Vercel** | App + functions | Paris | `cdg1` | **FERME** | Non (config `vercel.json`) | `vercel.json` `"regions": ["cdg1"]` + Project Settings default region. ⚠ Défaut = `iad1` (Washington) |
| **Railway / Fly (worker 3ᵉ hôte)** | 3 workers + Gotenberg + WeasyPrint | Amsterdam (Railway) **OU** Paris (Fly) | Railway `europe-west4` **/** Fly `cdg` | **FERME (EU)** — plateforme exacte tranchée Phase 20 | Non (change à chaud sauf volume) | Config-as-code region + preferred region compte |
| **Upstash (Redis)** | Queue BullMQ | Frankfurt **OU** Irlande | `eu-central-1` **/** `eu-west-1` | **CONDITIONNEL** — SEULEMENT si Redis retenu Phase 20 (WORK-02) | Non (Global 2.0 add/remove sans downtime) | `primary_region` à la création. NE PAS créer de DB en Phase 17 |

---

## Upstash conditionnel (D-02)

La décision milestone v6 du 2026-06-03 (« **Redis viré au profit de Postgres `SKIP LOCKED`** ») **coexiste encore** avec le code BullMQ/ioredis dans l'arbre (`queue.ts`, `worker.ts`, `redis.ts`, veille, invoice-reminders) à côté de `queue-postgres.ts` / `closure-worker-postgres.ts`. La bascule effective — et donc le sort d'Upstash — est **tranchée en Phase 20 (WORK-02) sur facturation observée 24 h**.

Conséquence pour Phase 17 :

- **SI Redis est retenu en Phase 20** → Upstash en région EU `eu-central-1` (Frankfurt), alternative `eu-west-1` (Irlande).
- **SINON** → pas d'Upstash, pas de 4ᵉ plateforme.
- **Aucun compte / aucune DB Upstash n'est créé en Phase 17.** La région est documentée par avance uniquement pour lever tout doute au moment où (et si) la décision tombe.

Réponse formelle au critère « 4 plateformes » : **3 plateformes FERMES** (Supabase, Vercel, Railway/Fly) **+ 1 conditionnelle** (Upstash, décision Phase 20).

---

## Irréversibilité — le vrai risque

Le framing « les 4 régions sont irréversibles » est **inexact**. Il faut distinguer :

- **Supabase = SEULE plateforme réellement immuable.** La région d'un projet Supabase **ne se change pas** : en cas d'erreur, il faut **recréer le projet + migrer** les données. C'est le seul choix vraiment irréversible.
- **Vercel** : mutable via `vercel.json` (`"regions"`) + Project Settings.
- **Railway / Fly** : mutable, change à chaud (downtime seulement si un volume est attaché).
- **Upstash** : mutable (Global 2.0 permet add/remove de régions sans downtime).

**Le vrai danger n'est donc pas l'irréversibilité en soi, mais le défaut US silencieux à la création** : Vercel provisionne en `iad1` (Washington) par défaut, Supabase propose souvent us-east. Un projet créé sans choisir EU explicitement part hors EU → non-conformité RGPD/Qualiopi, et pour Supabase c'est **immuable** (recréer + migrer). D'où la checklist ci-dessous.

---

## Checklist pré-création (anti-défaut-US)

À dérouler AU MOMENT de créer chaque projet (Phase 18 / 19 / 20) :

- [ ] Supabase : région = eu-west-3 (Paris) sélectionnée AU MOMENT de la création (immuable — vérifier 2× avant Create)
- [ ] Vercel : vercel.json contient "regions": ["cdg1"] ET Project Settings > Functions > default region = cdg1 (sinon iad1)
- [ ] Railway/Fly : region EU (europe-west4 / cdg) fixée en config-as-code + preferred region compte
- [ ] Upstash : NON créé en Phase 17 — si retenu Phase 20, primary_region = eu-central-1

---

## Sources (docs officielles, vérifiées 2026-07-04)

- **Supabase** — [Available regions](https://supabase.com/docs/guides/platform/regions) (Paris `eu-west-3` disponible) · [Change Project Region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z) (région immuable → recréer + migrer).
- **Vercel** — [Configuring regions for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region) (défaut `iad1`, `vercel.json` `regions`) · [Global network and regions](https://vercel.com/docs/regions) (`cdg1` = Paris).
- **Railway** — [Regions](https://docs.railway.com/deployments/regions) (`europe-west4` Amsterdam, change à chaud sans downtime hors volume attaché).
- **Fly** — [Regions](https://fly.io/docs/reference/regions/) (`cdg` = Paris).
- **Upstash** — [Create Redis Database (Global)](https://upstash.com/docs/devops/developer-api/redis/create_database_global) + [Global 2.0](https://upstash.com/blog/global-2) (`eu-central-1` Frankfurt / `eu-west-1` Irlande, régions mutables sans downtime).

> Détail de la recherche et vérifications par grep/lecture : `17-RESEARCH.md` § « Régions EU cibles » et § « Sources ».
