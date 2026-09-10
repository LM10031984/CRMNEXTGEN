# Rapport d'import du catalogue diagnostic — 2026-09-02

> Mode : **SIMULATION (dry-run)**
> Tenant : Start Academy
> Source : `packages/db/scripts/data/diag-module-catalog.json` (instantané du repo diag)
> Base : **miroir local** du catalogue de production (43 produits copiés en lecture seule).
> La migration `20260902170000_chaine_diagnostic_socle` n'est pas encore appliquée en
> production : rejouer ce rapport contre la vraie base une fois la migration passée.

**À valider par Laurent avant toute activation.** Rien n'est activé par ce script : les produits créés sont inactifs, à toi de cocher ce que tu vends réellement.

État de départ : 43 produits (40 actifs), 0 modules. Catalogue à importer : 79 modules.

## Synthèse

| Verdict | Modules |
|---|---|
| Appariés à un module/produit existant | 0 |
| Ambigus (plusieurs candidats — à trancher) | 0 |
| À créer (inactifs) | 79 |

## Modules exclus des sorties client (pige)

Interdits dans l'audit remis, la proposition et toute page publique depuis le 11/08/2026. Ils restent utilisables en interne — c'est le questionnaire commercial, pas le livrable.

- Prospection (usecases) · **Pige Faq**
- Prospection (usecases) · **Veille concurrentielle**
- Vendeur · **Veille concurrentielle**

## Produits au taux OPCO EP réglementaire (40 €/h)

- `PROD-0062` Non discrimination, Tracfin et déontologie — → à marquer
- `PROD-0671` Tracfin — → à marquer

## Produits d'accueil à créer (inactifs)

Un produit par famille du catalogue diag. Ce sont des conteneurs de rangement, pas des offres commerciales : c'est Laurent qui décide ensuite lesquels deviennent de vrais produits vendus, et sous quel intitulé.

| Code | Produit | Modules | Heures |
|---|---|---|---|
| `PROD-0675` | Catalogue diagnostic — Acheteur | 8 | 14 h |
| `PROD-0676` | Catalogue diagnostic — Admin | 11 | 15 h |
| `PROD-0677` | Catalogue diagnostic — Base (paramétrages fonctionnalités) | 16 | 17 h |
| `PROD-0678` | Catalogue diagnostic — Prospection (usecases) | 14 | 16 h |
| `PROD-0679` | Catalogue diagnostic — Usecases | 16 | 0 h |
| `PROD-0680` | Catalogue diagnostic — Vendeur | 14 | 22 h |

## Parcours « L'Agent Incomparable » (M0 → M6)

Importé **inactif**, et il doit le rester : le manifeste de livraison porte « v0.9 — pré-livraison, trous 🔴/🟠 NON levés, NE PAS DIFFUSER AUX APPRENANTS ». Le ranger au catalogue le rend mappable par le moteur de recommandation ; l'activer le rendrait vendable, ce qu'il n'est pas.

- **M0 — SOCLE IA** — 2 ressource(s)
- **M1 — TROUVER VENDEURS** — 9 ressource(s)
- **M2 — GAGNER LE MANDAT** — 7 ressource(s)
- **M3 — COMMERCIALISER** — 2 ressource(s)
- **M4 — SUIVI VENDEUR** — 2 ressource(s)
- **M5 — GAGNER 5 10H** — 2 ressource(s)
- **M6 — ACHETEUR PILOTAGE** — 3 ressource(s)

## Détail par famille

### Acheteur (8)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Découverte et remerciements acheteur | à créer |  |  | 2 | — |
| Suivi acheteur | à créer |  |  | 2 | — |
| Suivi acheteur autonome | à créer |  |  | 4 | — |
| Agent recherche | à créer |  |  | 2 | — |
| Synthétiser pv | à créer |  |  | 1 | — |
| Synthétiser diags | à créer |  |  | 1 | — |
| Synthétiser copro | à créer |  |  | 1 | — |
| Synthétiser couts financiers | à créer |  |  | 1 | — |

### Admin (11)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Synthétiser pv | à créer |  |  | 1 | — |
| Synthétiser diags | à créer |  |  | 1 | — |
| Synthétiser copro | à créer |  |  | 1 | — |
| Synthétiser couts financiers | à créer |  |  | 1 | — |
| Annonces | à créer |  |  | 1 | — |
| Chatbot mandat | à créer |  |  | 2 | — |
| Synthétiser compromis (présentation vidéo ou vocale) | à créer |  |  | 2 | — |
| Automatisation Boite mail | à créer |  |  | 2 | — |
| Veille automatique immo | à créer |  |  | 1 | — |
| My juridic assistant | à créer |  |  | 1 | — |
| Nursing BDD | à créer |  |  | 2 | — |

### Base (paramétrages fonctionnalités) (16)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Chat gpt | à créer | ✅ |  | 4 | — |
| Gamma | à créer | ✅ |  | 2 | — |
| Notebook LM | à créer | ✅ |  | 4 | — |
| Claude | à créer | ✅ |  | 4 | — |
| Gemini | à créer | ✅ |  | 2 | — |
| Prompt | à créer | ✅ |  | 1 | — |
| Chat gpt | à créer | ✅ |  | — | — |
| Gamma | à créer | ✅ |  | — | — |
| Notebook LM | à créer | ✅ |  | — | — |
| Claude | à créer | ✅ |  | — | — |
| Gemini | à créer | ✅ |  | — | — |
| Chat gpt | à créer | ✅ |  | — | — |
| Gamma | à créer | ✅ |  | — | — |
| Notebook LM | à créer | ✅ |  | — | — |
| Claude | à créer | ✅ |  | — | — |
| Gemini | à créer | ✅ |  | — | — |

### Prospection (usecases) (14)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Secteur base de données | à créer |  |  | 1 | — |
| Génération de contenu | à créer |  |  | 2 | — |
| Expert DPE | à créer |  |  | 2 | — |
| Base de données entretien relance | à créer |  |  | 2 | — |
| Estimation baromètre | à créer |  |  | 1 | — |
| Pige Faq | à créer |  | 🚫 | 2 | — |
| e réputation | à créer |  |  | 1 | — |
| Veille concurrentielle | à créer |  | 🚫 | 2 | — |
| Réseaux sociaux | à créer |  |  | 2 | — |
| Entrainement | à créer |  |  | 1 | — |
| Etude de marché biens vendus | à créer |  |  | — | — |
| Etude de marché biens à la vente | à créer |  |  | — | — |
| Etude de marché agence | à créer |  |  | — | — |
| e réputation | à créer |  |  | — | — |

### Usecases (16)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Etude de marché biens vendus | à créer |  |  | — | — |
| Etude de marché biens à la vente | à créer |  |  | — | — |
| Etude de marché agence | à créer |  |  | — | — |
| e réputation | à créer |  |  | — | — |
| Training | à créer |  |  | — | — |
| Prépa réunion | à créer |  |  | — | — |
| Prépa coaching | à créer |  |  | — | — |
| Agent de coaching | à créer |  |  | — | — |
| Automatisation boite mail | à créer |  |  | — | — |
| Veille immo | à créer |  |  | — | — |
| My juridic assistant | à créer |  |  | — | — |
| Assitant recrutement | à créer |  |  | — | — |
| Générateur annonces joab board | à créer |  |  | — | — |
| Analyse CV | à créer |  |  | — | — |
| Suivi recrutement | à créer |  |  | — | — |
| Onboarding collab | à créer |  |  | — | — |

### Vendeur (14)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Suivi | à créer |  |  | 2 | — |
| Suivi automatisé | à créer |  |  | 4 | — |
| Chatbot mandat | à créer |  |  | 2 | — |
| Production esti autre langue et vidéo | à créer |  |  | 1 | — |
| Découverte et remerciements | à créer |  |  | 2 | — |
| Veille concurrentielle | à créer |  | 🚫 | 2 | — |
| Entrainement | à créer |  |  | 1 | — |
| Annonces | à créer |  |  | 1 | — |
| Photos | à créer |  |  | 1 | — |
| Vidéos | à créer |  |  | 1 | — |
| Préparation R1 | à créer |  |  | 1 | — |
| Prépa R2 | à créer |  |  | 1 | — |
| Plan de comm vendeur | à créer |  |  | 1 | — |
| Dossier rénov | à créer |  |  | 2 | — |

---

_Simulation : aucune écriture en base. Relancer avec `-- --apply` pour appliquer._
