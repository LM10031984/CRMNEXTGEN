# Audit QualiOF — 25/05/2026

**Méthode :** audit hybride.
1. Étape 0 + flow F1 exploration via Playwright MCP (cette session, captures `audit-screenshots/00–08`).
2. F2–F8 délégués à un second agent via plugin Claude (instance `:3010`) — les findings ci-dessous reprennent ce rapport, avec **corrections BDD** quand mes propres requêtes contredisent.

**Stack :** Next.js 14 + Prisma + Lucia + BullMQ + Ollama mistral-small:24b. Multi-tenant, RBAC (ADMIN / MANAGER / FORMATEUR / **COMMERCIAL** / COMPTABLE / LECTEUR — cf. `schema.prisma:65-72`).

---

## Score global

| Dimension | Score | Commentaire |
|---|---|---|
| Modèle de données respecté | 5/10 | 25/32 produits sans prix, durées affichées sans "/Yj", `Sessions à risque 215` agrège 5 entités hétérogènes |
| Conformité Qualiopi observée | 4/10 | PROD-0066 (52 apprenants formés) sans verbes Bloom ni sections Qualiopi ; IA génère et publie sans étape révision |
| UX / responsive | 6/10 | Wizard session et Budget AGEFICE excellents, mais sidebar mobile, 404 brut, markdown brut sur produit IA |
| RBAC / sécurité | 7/10 | Cross-tenant URL → 404, invitation LECTEUR OK, `requireRole` en place côté server actions |
| Performance | 7/10 | Aucun 500 hors bug Next dev cache, TTI acceptable, worker BullMQ sain (pas d'erreur `react cache`) |

---

## Bugs P0 (bloqueurs Qualiopi / sécu / perte data)

### BUG-P0-01 — Programme PROD-0066 sans verbes Bloom ni sections Qualiopi
- **Page :** `/app/produits/c15f333f-3e48-4884-98fe-d7d46b85378c?tab=programme`
- **Repro :** Ouvrir l'onglet Programme du produit PROD-0066 (16h / 1008€ HT / 52 apprenants formés)
- **Attendu :** Sections Objectifs / Pré-requis / Compétences visées / Modalités d'évaluation + verbes Bloom (Identifier, Expliquer, Utiliser, Analyser…)
- **Observé :** Programme = déroulé chronologique horaire en texte libre (`9h00 – 9h30 : Accueil…`). **0 verbe Bloom détecté** sur 15 testés, **0 section Qualiopi**. Vérifié via `evaluate()` JS dans Playwright : `bloomFound: []`, `sectionsFound: ['Programme']`.
- **Screenshot :** `audit-screenshots/05-prod-0066-programme.png`
- **Sévérité :** P0 — Indicateur 1 Qualiopi non conforme sur un produit utilisé pour 7 sessions / 52 apprenants
- **Effort :** S (réécriture contenu) + M (audit des 31 autres produits)

### BUG-P0-02 — Génération IA produit : publication immédiate sans étape de révision
- **Page :** `/app/produits` → modale "Nouveau produit" → toggle "Auto-remplir avec l'IA"
- **Repro :** Créer un produit avec le toggle activé → cliquer "Créer le produit" → ~25 s plus tard, le produit est dans le catalogue
- **Attendu :** Écran de révision (contenu généré + bouton Valider / Réviser / Refuser) AVANT publication
- **Observé :** Le produit (ex. PROD-0672 dans le test second agent) est publié dans le catalogue sans intermédiaire. Un programme IA non revu peut devenir la source d'une convention Qualiopi.
- **Sévérité :** P0 — Risque conformité directe si l'IA produit du contenu hors-norme
- **Effort :** M (status `DRAFT_AI` en BDD + page révision + bouton publier)

### BUG-P0-03 — Programme IA : markdown brut + sections Qualiopi absentes
- **Page :** `/app/produits/{id-IA}?tab=programme`
- **Observé :** Texte avec `##`, `###`, `-` affichés tels quels. 1 seul verbe Bloom partiel détecté. Pas de sections Pré-requis / Compétences / Évaluation.
- **Sévérité :** P0 (combiné à BUG-P0-02 — un produit IA officiel ne peut pas servir de base à une convention)
- **Effort :** S (parser markdown `react-markdown` + structurer le prompt Ollama avec template Qualiopi imposé)

---

## Bugs P1 (bloque le quotidien)

### BUG-P1-01 — 25/32 produits affichent "Prix manquant" (héritage import SmartOF)
- **Page :** `/app/produits`
- **Attendu :** Tous les produits ont un `priceHT` explicite (règle métier non-négociable)
- **Observé :** 25 produits sur 32 sans prix → convention impossible à générer (badge "Tarif à saisir" dans le wizard session)
- **Screenshot :** `audit-screenshots/02-produits-liste.png`
- **Sévérité :** P1 — Empêche la facturation propre
- **Effort :** S (UI bulk-edit ou export/import xlsx)

### BUG-P1-02 — Dashboard "Sessions à risque 215" sémantiquement trompeur
- **Page :** `/app`
- **Attendu :** Badge = nombre de sessions réellement à risque (≤ 86 sessions totales)
- **Observé :** Badge = **215** = somme de 5 entités hétérogènes (sessions non facturées 39 + non clôturées 5 + dossiers OPCO 85 + apprenants 48 + organisations 38)
- **Screenshot :** `audit-screenshots/01-dashboard.png`
- **Sévérité :** P1 — Indicateur métier trompeur
- **Effort :** XS (renommer "Alertes opérationnelles" + détailler les 5 sous-totaux)

### BUG-P1-03 — Pack fin de formation bloqué silencieusement sur SES-0081 et SES-0091
- **Page :** `/app/sessions/{id}` → bouton "Pack fin de formation" → "Lancer la génération"
- **Repro :** Ouvrir SES-0081 (3 apprenants, COMPLETED) ou SES-0091 (6 apprenants, VALIDATED) → modale Pack → cliquer "Lancer la génération"
- **Attendu :** Génération du pack (9 docs × N apprenants) via BullMQ
- **Observé :** Erreur inline "Session incomplète. Formateur principal manquant" apparaît APRÈS le clic. Le bouton "Lancer" reste actif tant qu'on n'a pas cliqué — UX late feedback.
- **Sévérité :** P1 — Flow critique (pilier #1 produit) bloqué sur 2 sessions terminées avec apprenants
- **Effort :** S (1. valider la complétude au mount de la modale et griser "Lancer" si incomplet, 2. enquêter pourquoi le `SessionTrainer` lié n'est pas reconnu comme "principal")

---

## Bugs P2 (friction confort)

### BUG-P2-01 — Durée affichée "Xh" sans "/Yj" partout
- **Pages :** liste sessions, fiche session, fiche produit, wizard récap, PDF
- **Attendu :** "16h / 2j" (règle 8h = 1j non-négociable)
- **Observé :** Affichage "16h" seul (SES-0081, SES-0092, SES-0097, PROD-0066…). Le calcul jours est en backend mais pas remonté UI.
- **Effort :** XS (helper `formatDuration(h)` → `"${h}h / ${Math.ceil(h/8)}j"` + diffusion)

### BUG-P2-02 — 4ᵉ KPI Budget AGEFICE tronqué en 1440px (overflow horizontal)
- **Page :** `/app/budget-agefice`
- **Observé :** Le 4ᵉ KPI "RESTE À MOBILISER 2026 — 526 320 €" est coupé à droite
- **Effort :** XS (grid responsive ou `flex-wrap`)

### BUG-P2-03 — Page 404 non stylisée (Next.js brut hors layout)
- **Pages :** `/app/sessions/{uuid-inexistant}`, etc.
- **Observé :** "404 · This page could not be found." en page blanche
- **Effort :** XS (créer `app/(app)/not-found.tsx` dans le layout)

### BUG-P2-04 — Validation Pack fin de formation = feedback tardif
- **Page :** modale Pack fin de formation (cf. BUG-P1-03)
- **Observé :** L'erreur "Formateur manquant" n'apparaît qu'après clic "Lancer la génération", pas à l'ouverture de la modale
- **Effort :** XS (validate au mount, griser le bouton)

---

## Bugs P3 (cosmétique)

### BUG-P3-01 — Cache `.next` corrompu en mode `dev:full` après cycle interrompu
- **Symptôme :** `Cannot find module './XXX.js'` (vendor-chunks, `9192.js`, `zod@3.25.76.js`, etc.) sur les routes dynamiques `[id]`
- **Repro :** Killer `pnpm dev:full` en plein build puis relancer ; ou hot-reload sur route lourde
- **Sévérité :** P3 dev-only — n'affecte pas la prod
- **Effort :** S (renforcer le script `dev:full` : `wait` après `rm -rf .next`, ou switch sur `next build && next start` pour les sessions de QA prolongées)

### BUG-P3-02 — Désalignement brief utilisateur ↔ schema sur le rôle "USER"
- **Brief :** parle de rôles ADMIN / MANAGER / **USER** / FORMATEUR / COMPTABLE / LECTEUR
- **Code (`schema.prisma:65-72`) :** ADMIN / MANAGER / FORMATEUR / **COMMERCIAL** / COMPTABLE / LECTEUR
- **Sévérité :** P3 — pas un bug app, juste alignement doc/code
- **Effort :** XS (corriger la doc OU renommer l'enum si "USER" est plus juste sémantiquement)

---

## Flows testés — résultats

| # | Flow | Statut | Note |
|---|---|---|---|
| F1 | Créer session complète | ⚠️ partiel | Wizard 4 étapes OK, modale produit OK avec garde-fou prix auto-calc 42€/h. Pas allé jusqu'à la convention faute d'apprenant "salarié" non-EI dans la BDD. |
| F2 | Pack fin de formation 1-clic | ❌ bloqué | "Formateur principal manquant" sur SES-0081 et SES-0091. Logs worker propres (pas d'erreur `react cache`). |
| F3 | Dossier AGEFICE date dépôt | ⚠️ partiel | Page Budget AGEFICE filtre bien par "Année du dossier" = `financingRequestDate` (règle métier respectée). Création d'un nouveau dossier non testée faute d'apprenant cible. |
| F4 | Multi-casquette Pascal BIANCO | — | Non testé (pas d'apprenant créé from scratch dans cette session) |
| F5 | RBAC LECTEUR | ⚠️ partiel | Invitation LECTEUR créée via UI ✓, dropdown rôles cohérent avec schema (sauf "USER"/"COMMERCIAL" cf. P3-02), cross-tenant UUID → 404 propre ✓. Reconnexion LECTEUR non testée (email d'activation non récupérable). |
| F6 | Génération IA produit | ❌ | Pas d'étape de révision avant publication (BUG-P0-02), programme markdown brut (BUG-P0-03). |
| F7 | Responsive 375/768/1280/1920 | ⚠️ partiel | À 1440px OK. Sidebar drawer à viewport réduit OK. 4ᵉ KPI AGEFICE tronqué (BUG-P2-02). |
| F8 | Trésorerie AGEFICE | ✅ | 4 statuts présents (Avec budget restant 184 / Sans consommation 141 / Proche plafond / Au plafond). Filtre par année dossier OK. **Vérification BDD :** 293 SessionParticipants, 0 sans prix, `SUM(priceHT) = 339 133 €`. Le dashboard "AGEFICE 2026 = 527 328 €" mesure le **budget mobilisable** (184 × 3000), pas le CA encaissé — métriques différentes, pas d'écart. |

---

## Vérifications transversales

- **Console DevTools :** aucune erreur JS sur les pages testées (hors crash `Cannot find module` cf. BUG-P3-01)
- **Réseau :** aucun HTTP 500 hors bug Next dev. 404 attendus sur UUID inexistants.
- **Worker BullMQ :** logs sains au démarrage (`[closure-worker] started (concurrency=3, queue="closure-generation")`), pas d'erreur `react does not provide an export named 'cache'`
- **Focus clavier :** visible sur liens sidebar et onglets wizard
- **Contrastes :** badge "Prix manquant" orange (#f97316) sur blanc → ratio ~3:1, **insuffisant WCAG AA** (à corriger)
- **Vocabulaire :** "EI", "Autofinancement", "Entreprise (paie directement)" cohérents. Pas de mix "Auto-entrepreneur" / "Indépendant" observé. Pas de "Formateur"/"Trainer" mélangés.

---

## Ce qui fonctionne bien

1. **Wizard création session 4 étapes** (Produit → Dates & Lieu → Participants → Récap) — UX exemplaire avec auto-calc tarif (42€/h) et auto-calc date fin (jours ouvrés FR)
2. **Budget AGEFICE** — page très claire avec 4 statuts, tri par budget restant, filtre par année du dossier (règle métier `financingRequestDate` respectée)
3. **Génération automatique du déroulé pédagogique** dès la création d'une session (gain de temps immédiat)
4. **Multi-tenant strict** — cross-tenant URL retourne 404 propre, pas de fuite de données
5. **Audit log** opérationnel (`session.prepare`, `users.invite`, `regulatoryWatch.auto_inserted`, etc.)
6. **Pack fin de formation modale** informative (9 documents listés, estimation temps, N apprenants × docs)
7. **Aucune régression `react cache`** sur le worker BullMQ
8. **Catalogue produits avec badge "Tarif à saisir"** = signal UX positif (le problème est visible, pas masqué)

---

## Recommandations non-bugs

1. **Imposer template Qualiopi dans le prompt Ollama** : structurer le prompt pour exiger Objectifs (Bloom) / Pré-requis / Compétences / Évaluation et interdire le markdown brut.
2. **Parser Markdown** dans `tab=programme` (react-markdown) — coût XS, gain lisibilité immédiat.
3. **Script de complétion prix** : campagne UI bulk-edit pour les 25 produits sans `priceHT`.
4. **Renommer le widget "Sessions à risque"** en "Alertes opérationnelles" et détailler les 5 sous-totaux.
5. **404 stylisée** : créer `app/(app)/not-found.tsx`.
6. **Helper `formatDuration(h)`** universel (h + jours).
7. **Étape "draft IA"** avant publication : status `DRAFT_AI` + page de révision avec diff.
8. **Stabiliser le mode dev** : envisager `next build && next start` pour les sessions QA prolongées de Laurent (évite le bug `Cannot find module './XXX.js'` récurrent).

---

## Screenshots disponibles

Dossier `audit-screenshots/` (à la racine, hors `files/`) :

| Fichier | Description |
|---|---|
| `00-login-page.png` | Page login (capture initiale, BDD indisponible alors) |
| `01-dashboard.png` | Dashboard ADMIN, KPI "Sessions à risque 215" |
| `02-produits-liste.png` | Catalogue produits avec "Prix manquant" en masse |
| `03-nouveau-produit-click.png` | Modale "Nouveau produit" avec toggle IA + auto-calc 336€ |
| `04-prod-0066-detail.png` | Crash Next.js `Cannot find module vendor-chunks` (1ʳᵉ tentative) |
| `04b-prod-0066-after-refresh.png` | Crash Next.js `Cannot find module zod@3.25.76.js` (refresh) |
| `04c-prod-0066-detail-ok.png` | Fiche produit PROD-0066 après cleanup `.next` |
| `05-prod-0066-programme.png` | Onglet Programme PROD-0066 — preuve P0-01 (0 verbe Bloom, 0 section Qualiopi) |
| `06-session-nouvelle.png` | Wizard "Nouvelle session" étape 1 (choix produit) |
| `07-sessions-completed.png` | Liste sessions terminées (80+ sessions, regroupement mensuel) |
| `08-ses-0081-detail.png` / `08b-ses-0081-retry.png` | Re-crashs vendor-chunks sur route dynamique `[id]` (BUG-P3-01) |

Les captures 09+ référencées par le second agent (plugin Claude) n'ont pas été persistées sur disque — elles n'existent que dans son sandbox de session. Si tu veux les vrais fichiers, il faut refaire les captures correspondantes.

---

*Audit factuel, aucun fix appliqué. Severity stricte : P0 = Qualiopi raté / sécu cassée / perte data · P1 = bloque quotidien · P2 = friction · P3 = cosmétique.*
