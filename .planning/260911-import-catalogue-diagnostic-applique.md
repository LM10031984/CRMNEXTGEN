# Rapport d'import du catalogue diagnostic — 2026-09-11

> Mode : **ÉCRITURE (--apply)**
> Tenant : Start Academy
> Source : `packages/db/scripts/data/diag-module-catalog.json` (instantané du repo diag)

**À valider par Laurent avant toute activation.** Rien n'est activé par ce script : les produits créés sont inactifs, à toi de cocher ce que tu vends réellement.

État de départ : 125 produits (41 actifs), 488 modules. Catalogue à importer : 79 modules.

## Synthèse

| Verdict | Modules |
|---|---|
| Appariés à un module/produit existant | 35 |
| Ambigus (plusieurs candidats — à trancher) | 44 |
| À créer (inactifs) | 0 |

## Modules exclus des sorties client (pige)

Interdits dans l'audit remis, la proposition et toute page publique depuis le 11/08/2026. Ils restent utilisables en interne — c'est le questionnaire commercial, pas le livrable.

- Prospection (usecases) · **Pige Faq**
- Prospection (usecases) · **Veille concurrentielle**
- Vendeur · **Veille concurrentielle**

## Produits au taux OPCO EP réglementaire (40 €/h)

- `BIB-D045` Non Discrimination — déjà marqué
- `BIB-D046` Tracfin — déjà marqué
- `BIB-D063` Non Discrimination, Tracfin et déontotlgie — déjà marqué
- `PROD-0062` Non discrimination, Tracfin et déontologie — déjà marqué
- `PROD-0671` Tracfin — déjà marqué

## Produits d'accueil à créer (inactifs)

Un produit par famille du catalogue diag. Ce sont des conteneurs de rangement, pas des offres commerciales : c'est Laurent qui décide ensuite lesquels deviennent de vrais produits vendus, et sous quel intitulé.

| Code | Produit | Modules | Heures |
|---|---|---|---|
| `PROD-0675` | Catalogue diagnostic — Acheteur _(déjà présent, réutilisé)_ | 8 (0 à créer) | 14 h |
| `PROD-0676` | Catalogue diagnostic — Admin _(déjà présent, réutilisé)_ | 11 (0 à créer) | 15 h |
| `PROD-0677` | Catalogue diagnostic — Base (paramétrages fonctionnalités) _(déjà présent, réutilisé)_ | 16 (0 à créer) | 49 h |
| `PROD-0678` | Catalogue diagnostic — Prospection (usecases) _(déjà présent, réutilisé)_ | 14 (0 à créer) | 20 h |
| `PROD-0679` | Catalogue diagnostic — Usecases _(déjà présent, réutilisé)_ | 16 (0 à créer) | 17 h |
| `PROD-0680` | Catalogue diagnostic — Vendeur _(déjà présent, réutilisé)_ | 14 (0 à créer) | 22 h |

## Durées : ce que la source déclare, et ce qui manque

Le catalogue diag déclare le **même module pour trois profils** (`conseiller`, `manager`, `assistant`) et ne porte la durée que sur le profil `conseiller` — d'où trois lignes « Chat gpt » dans la même famille, dont deux sans durée. Ce ne sont pas des doublons : ce sont des rattachements de profil.

Sur 79 modules : 49 portent leur durée, **14 la reprennent du même module déclaré sous un autre profil**, et **16 n'en ont aucune nulle part** — celles-là seulement reçoivent le défaut de 1 h. Aucun module ne reste à 0 h.

**Durées reprises d’un autre profil** (valeur réelle, simplement rangée ailleurs) :

- **Base (paramétrages fonctionnalités)** (10) : Chat gpt → 4 h · Gamma → 2 h · Notebook LM → 4 h · Claude → 4 h · Gemini → 2 h · Chat gpt → 4 h · Gamma → 2 h · Notebook LM → 4 h · Claude → 4 h · Gemini → 2 h
- **Prospection (usecases)** (1) : e réputation → 1 h
- **Usecases** (3) : e réputation → 1 h · Automatisation boite mail → 2 h · My juridic assistant → 1 h

**Durées inconnues, défaut de 1 h appliqué** — à corriger quand elles seront connues :

- **Prospection (usecases)** (3) : Etude de marché biens vendus · Etude de marché biens à la vente · Etude de marché agence
- **Usecases** (13) : Etude de marché biens vendus · Etude de marché biens à la vente · Etude de marché agence · Training · Prépa réunion · Prépa coaching · Agent de coaching · Veille immo · Assitant recrutement · Générateur annonces joab board · Analyse CV · Suivi recrutement · Onboarding collab

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
| Découverte et remerciements acheteur | apparié |  |  | 2 | Découverte et remerciements acheteur |
| Suivi acheteur | apparié |  |  | 2 | Suivi acheteur |
| Suivi acheteur autonome | apparié |  |  | 4 | Suivi acheteur autonome |
| Agent recherche | apparié |  |  | 2 | Agent recherche |
| Synthétiser pv | ⚠️ ambigu |  |  | 1 | Synthétiser pv · Synthétiser pv |
| Synthétiser diags | ⚠️ ambigu |  |  | 1 | Synthétiser diags · Synthétiser diags |
| Synthétiser copro | ⚠️ ambigu |  |  | 1 | Synthétiser copro · Synthétiser copro |
| Synthétiser couts financiers | ⚠️ ambigu |  |  | 1 | Synthétiser couts financiers · Synthétiser couts financiers |

### Admin (11)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Synthétiser pv | ⚠️ ambigu |  |  | 1 | Synthétiser pv · Synthétiser pv |
| Synthétiser diags | ⚠️ ambigu |  |  | 1 | Synthétiser diags · Synthétiser diags |
| Synthétiser copro | ⚠️ ambigu |  |  | 1 | Synthétiser copro · Synthétiser copro |
| Synthétiser couts financiers | ⚠️ ambigu |  |  | 1 | Synthétiser couts financiers · Synthétiser couts financiers |
| Annonces | ⚠️ ambigu |  |  | 1 | Annonces · Annonces |
| Chatbot mandat | ⚠️ ambigu |  |  | 2 | Chatbot mandat · Chatbot mandat |
| Synthétiser compromis (présentation vidéo ou vocale) | apparié |  |  | 2 | Synthétiser compromis (présentation vidéo ou vocale) |
| Automatisation Boite mail | ⚠️ ambigu |  |  | 2 | Automatisation Boite mail · Automatisation boite mail |
| Veille automatique immo | apparié |  |  | 1 | Veille automatique immo |
| My juridic assistant | ⚠️ ambigu |  |  | 1 | My juridic assistant · My juridic assistant |
| Nursing BDD | apparié |  |  | 2 | Nursing BDD |

### Base (paramétrages fonctionnalités) (16)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Chat gpt | ⚠️ ambigu | ✅ |  | 4 | Chat gpt · Chat gpt · Chat gpt |
| Gamma | ⚠️ ambigu | ✅ |  | 2 | Gamma · Gamma · Gamma |
| Notebook LM | ⚠️ ambigu | ✅ |  | 4 | Notebook LM · Notebook LM · Notebook LM |
| Claude | ⚠️ ambigu | ✅ |  | 4 | Claude · Claude · Claude |
| Gemini | ⚠️ ambigu | ✅ |  | 2 | Gemini · Gemini · Gemini |
| Prompt | apparié | ✅ |  | 1 | Prompt |
| Chat gpt | ⚠️ ambigu | ✅ |  | 4 _(autre profil)_ | Chat gpt · Chat gpt · Chat gpt |
| Gamma | ⚠️ ambigu | ✅ |  | 2 _(autre profil)_ | Gamma · Gamma · Gamma |
| Notebook LM | ⚠️ ambigu | ✅ |  | 4 _(autre profil)_ | Notebook LM · Notebook LM · Notebook LM |
| Claude | ⚠️ ambigu | ✅ |  | 4 _(autre profil)_ | Claude · Claude · Claude |
| Gemini | ⚠️ ambigu | ✅ |  | 2 _(autre profil)_ | Gemini · Gemini · Gemini |
| Chat gpt | ⚠️ ambigu | ✅ |  | 4 _(autre profil)_ | Chat gpt · Chat gpt · Chat gpt |
| Gamma | ⚠️ ambigu | ✅ |  | 2 _(autre profil)_ | Gamma · Gamma · Gamma |
| Notebook LM | ⚠️ ambigu | ✅ |  | 4 _(autre profil)_ | Notebook LM · Notebook LM · Notebook LM |
| Claude | ⚠️ ambigu | ✅ |  | 4 _(autre profil)_ | Claude · Claude · Claude |
| Gemini | ⚠️ ambigu | ✅ |  | 2 _(autre profil)_ | Gemini · Gemini · Gemini |

### Prospection (usecases) (14)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Secteur base de données | apparié |  |  | 1 | Secteur base de données |
| Génération de contenu | apparié |  |  | 2 | Génération de contenu |
| Expert DPE | apparié |  |  | 2 | Expert DPE |
| Base de données entretien relance | apparié |  |  | 2 | Base de données entretien relance |
| Estimation baromètre | apparié |  |  | 1 | Estimation baromètre |
| Pige Faq | apparié |  | 🚫 | 2 | Pige Faq |
| e réputation | ⚠️ ambigu |  |  | 1 | e réputation · e réputation · e réputation |
| Veille concurrentielle | ⚠️ ambigu |  | 🚫 | 2 | Veille concurrentielle · Veille concurrentielle |
| Réseaux sociaux | apparié |  |  | 2 | Réseaux sociaux |
| Entrainement | ⚠️ ambigu |  |  | 1 | Entrainement · Entrainement |
| Etude de marché biens vendus | ⚠️ ambigu |  |  | 1 _(défaut)_ | Etude de marché biens vendus · Etude de marché biens vendus |
| Etude de marché biens à la vente | ⚠️ ambigu |  |  | 1 _(défaut)_ | Etude de marché biens à la vente · Etude de marché biens à la vente |
| Etude de marché agence | ⚠️ ambigu |  |  | 1 _(défaut)_ | Etude de marché agence · Etude de marché agence |
| e réputation | ⚠️ ambigu |  |  | 1 _(autre profil)_ | e réputation · e réputation · e réputation |

### Usecases (16)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Etude de marché biens vendus | ⚠️ ambigu |  |  | 1 _(défaut)_ | Etude de marché biens vendus · Etude de marché biens vendus |
| Etude de marché biens à la vente | ⚠️ ambigu |  |  | 1 _(défaut)_ | Etude de marché biens à la vente · Etude de marché biens à la vente |
| Etude de marché agence | ⚠️ ambigu |  |  | 1 _(défaut)_ | Etude de marché agence · Etude de marché agence |
| e réputation | ⚠️ ambigu |  |  | 1 _(autre profil)_ | e réputation · e réputation · e réputation |
| Training | apparié |  |  | 1 _(défaut)_ | Training |
| Prépa réunion | apparié |  |  | 1 _(défaut)_ | Prépa réunion |
| Prépa coaching | apparié |  |  | 1 _(défaut)_ | Prépa coaching |
| Agent de coaching | apparié |  |  | 1 _(défaut)_ | Agent de coaching |
| Automatisation boite mail | ⚠️ ambigu |  |  | 2 _(autre profil)_ | Automatisation Boite mail · Automatisation boite mail |
| Veille immo | apparié |  |  | 1 _(défaut)_ | Veille immo |
| My juridic assistant | ⚠️ ambigu |  |  | 1 _(autre profil)_ | My juridic assistant · My juridic assistant |
| Assitant recrutement | apparié |  |  | 1 _(défaut)_ | Assitant recrutement |
| Générateur annonces joab board | apparié |  |  | 1 _(défaut)_ | Générateur annonces joab board |
| Analyse CV | apparié |  |  | 1 _(défaut)_ | Analyse CV |
| Suivi recrutement | apparié |  |  | 1 _(défaut)_ | Suivi recrutement |
| Onboarding collab | apparié |  |  | 1 _(défaut)_ | Onboarding collab |

### Vendeur (14)

| Module | Verdict | Socle | Pige | Heures | Candidats QualiOF |
|---|---|---|---|---|---|
| Suivi | apparié |  |  | 2 | Suivi |
| Suivi automatisé | apparié |  |  | 4 | Suivi automatisé |
| Chatbot mandat | ⚠️ ambigu |  |  | 2 | Chatbot mandat · Chatbot mandat |
| Production esti autre langue et vidéo | apparié |  |  | 1 | Production esti autre langue et vidéo |
| Découverte et remerciements | apparié |  |  | 2 | Découverte et remerciements |
| Veille concurrentielle | ⚠️ ambigu |  | 🚫 | 2 | Veille concurrentielle · Veille concurrentielle |
| Entrainement | ⚠️ ambigu |  |  | 1 | Entrainement · Entrainement |
| Annonces | ⚠️ ambigu |  |  | 1 | Annonces · Annonces |
| Photos | apparié |  |  | 1 | Photos |
| Vidéos | apparié |  |  | 1 | Vidéos |
| Préparation R1 | apparié |  |  | 1 | Préparation R1 |
| Prépa R2 | apparié |  |  | 1 | Prépa R2 |
| Plan de comm vendeur | apparié |  |  | 1 | Plan de comm vendeur |
| Dossier rénov | apparié |  |  | 2 | Dossier rénov |

---

## Écritures effectuées

- 0 produit(s) créé(s), tous inactifs
- 0 module(s) créé(s)
- 0 module(s) dont la durée a été corrigée
- 0 conteneur(s) dont la durée totale a été recalculée
- 0 produit(s) repassé(s) en fundingType REGLEMENTAIRE
- 0 produit(s) marqué(s) NON DIFFUSABLE (D-19 ter) — ni eux ni leurs modules ne peuvent plus sortir chez un client
