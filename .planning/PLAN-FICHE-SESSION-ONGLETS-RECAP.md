# QualiOF — Refonte fiche session : 5 onglets, le cœur du produit

> **Pour Claude Code.** Placement repo : `.planning/PLAN-FICHE-SESSION-ONGLETS-RECAP.md`, relié depuis `ROADMAP` et `REQUIREMENTS`.
> **Ne code rien avant le gate.** Rends d'abord le plan GSD (ROADMAP + séquence de commits), il est revu, puis exécution commit par commit comme d'habitude.

> **MAJ 2026-06-26 — vision simplifiée validée par Laurent.** Ce fichier a été réécrit autour de **5 onglets simples** centrés sur l'usage quotidien (créer produit → session → documents + agenda). La structure conformité riche (6 onglets ancrés T1–T13, bandeau « prêt pour audit ») est **conservée en annexe §8** pour rebranchement post-refonte. Rien n'est supprimé, juste sorti du flux principal.

---

## 0. Cadre

- **Constat de départ (Laurent, 2026-06-26)** : l'appli est fonctionnelle mais c'est une « usine à gaz ». La fiche session est un scroll de 1069 lignes ; **un même document s'affiche à ~16 endroits** ; des boutons partout ; « valider le programme IA » surgit alors qu'il devrait être réglé en amont ; des « packs en cours » tournent depuis des jours (batches zombies) ; les cartes docs sont minuscules et illisibles.
- **Objectif** : faire que **le cœur** marche et soit agréable — **produit → session → documents + agenda** — et mettre tout le reste de côté (réutilisable plus tard).
- **Principe d'arbitrage** : on **réorganise la surface**, on ne reconstruit pas le moteur. Tout le câblage métier existant (générateurs, server actions, closure pack, completeness) est réutilisé tel quel.
- **Sources de vérité conformité** (annexe, non bloquant ici) : `.planning/QUALIOPI-PLAN-COMPLET.md` (matrice 32 indicateurs, T1→T13).

---

## 1. Principe directeur — la fiche session en onglets

La fiche session n'est plus un scroll vertical. C'est **5 onglets** qui suivent le workflow réel d'une formation, avec **un document rangé à un seul endroit**.

- **En-tête persistant** (au-dessus des onglets) : identité (titre, code), statut, **un** CTA contextuel, bouton Paramètres (formateur / lieu / logistique). Allégé.
- **Onglet actif dans l'URL** (`?tab=`) → deep-link, survit au `router.refresh()` déclenché par les générations de docs.
- **Une seule source d'état** : tous les onglets lisent le même `getSessionCompleteness` / `sessionStage`. Zéro computation parallèle, zéro désync.
- **1 doc = 1 maison** : chaque document vit dans l'onglet de son moment (Avant / Après) et **nulle part ailleurs**. L'onglet « Tous les documents » est une **vue récap en lecture seule** (la matrice), pas une 2ᵉ source.

---

## 2. Les 5 onglets

Onglet par défaut à l'ouverture = **Session**.

### Onglet 1 — SESSION (la fiche)
La carte d'identité + le point de départ.
- Produit (lecture seule, lien vers la fiche produit pour retoucher le programme), dates, lieu, formateur principal, statut.
- **Inscription des apprenants** : liste nominative + « Inscrire un apprenant » (CFP / CNI / RIB → calcul budget AGEFICE → seed analyse besoin + demande de prise en charge par stagiaire). Édition inline + modale conservées.
- Le **programme** est affiché en lecture seule. **Plus de « Valider le programme IA » ici** : la validation se fait à la création/édition du **produit** (cf. §3 règle 8).

### Onglet 2 — AVANT LA FORMATION
Les documents à produire avant le démarrage. Bouton **« Tout générer »**.
| Doc | Grain |
|---|---|
| Convention / contrat (+ CGV, devis) | session + par stagiaire |
| Document AGEFICE (fiche de prise en charge) | par stagiaire éligible |
| Analyse de besoins | par stagiaire (+ variante commanditaire) |
| Convocation (+ règlement intérieur, charte) | par stagiaire |

### Onglet 3 — APRÈS LA FORMATION (le pack)
Le **Pack fin de formation 1-clic** + tous les docs post-formation (ce qui était « Pendant » est fondu ici). Bouton **« Générer le pack »**.
| Doc | Grain |
|---|---|
| Attestation de fin de formation | par stagiaire |
| Bilan formateur (rapport) | session |
| Certificat de réalisation | par stagiaire |
| Assiduité / émargement (à la demi-journée) | par stagiaire |
| Satisfaction à chaud | par stagiaire |
| Satisfaction à froid | par stagiaire |
| Positionnement | par stagiaire |
| (niveau session) Grille d'observation session · Bilan satisfaction session | session |

> Le suivi du pack en cours (progress bar, jobs Ollama, stubs à régénérer) s'affiche **dans cet onglet**, pas en bandeau flottant sur toute la page.

### Onglet 4 — TOUS LES DOCUMENTS (récap audit)
**Vue lecture seule**, pas une source d'action.
- Matrice **apprenant × document** (l'actuelle `ParticipantDocMatrix`, promue ici en onglet plein écran et lisible).
- Filtres (incomplets seulement, OPCO, mode de financement) + **« Télécharger le ZIP »** (tout le dossier d'un coup, utile avant un audit).
- Statut par doc (généré / manquant / saisi manuellement / NA).

### Onglet 5 — AGENDA
- Synchro **Google Calendar** (livrée Phase 14 — agenda « Rappel Formations », idempotent). Bouton « Synchroniser ».
- Affichage des créneaux jour par jour (lecture).
- *Évolution prévue (chantier suivant, hors refonte) : créneaux éditables interactifs (SessionSlot).*

### Hors onglets (mis de côté, conservés)
Facturation, Évaluation/stats, conformité lourde (bandeau « prêt pour audit », blockers IA, rails handicap/amélioration/sous-traitants). Accessibles mais hors du flux principal, à rebrancher dans un 2ᵉ temps (cf. §8).

---

## 3. Règles non négociables

1. **1 doc = 1 maison** (l'onglet de sa phase). « Tous les documents » montre, les onglets de phase agissent. Pas de troisième copie.
2. **Source unique d'état** : tous les onglets lisent le même `getSessionCompleteness` / `sessionStage`. Aucune computation parallèle.
3. **Génération sur donnée prête, pas sur navigation** : un doc se génère/relance quand sa donnée source est complète, jamais au seul fait d'ouvrir l'onglet. Statut par doc visible (à générer / en cours / prêt / à revoir), idempotent.
4. **Invalidation à l'édition** : éditer une étape antérieure périme les docs dépendants (pattern `updatedAt` / `PROMPT_VERSION`). Navigation libre entre onglets (pas un wizard verrouillé).
5. **Réutiliser l'existant** : on réembarque les blocs d'étape, l'édition inline, `normalizeNullableText`. On change le **contenant** (onglets), pas la logique métier.
6. **Lisibilité** : fini les cartes 4-colonnes en `text-[11px]`. Les listes de docs sont lisibles, une ligne par doc, statut + action claire.
7. **En-tête = identité + 1 CTA**, pas une barre de 6 boutons. Le reste passe dans Paramètres ou dans l'onglet concerné.
8. **Le programme quitte la session** : « Valider le programme IA » se gère au niveau **produit** (à la création/édition). Sur la session, le programme est en lecture seule + lien produit.

---

## 4. Lots de travail (séquencés) — la refonte

> Décision Laurent : **direct la refonte en onglets**, les bugs de la passe visuelle se résolvent au passage (les cartes minuscules disparaissent de toute façon).

### Lot 1 — Coquille à onglets + en-tête allégé
- Conteneur à onglets (`?tab=` dans l'URL), en-tête persistant au-dessus (identité · statut · 1 CTA · Paramètres).
- 5 onglets vides câblés + navigation deep-link.
- **Acceptation** : navigation par onglets, deep-link, refresh préserve l'onglet ; Vitest sur le routage d'onglet.

### Lot 2 — Réembarquer le contenu dans les onglets + tuer les doublons
- **Session** : identité + inscriptions (réutilise `StepCreation` / `SessionParticipantsList`).
- **Avant** : convention / AGEFICE / analyse / convocation (réutilise les blocs Préparation existants ; bouton « Tout générer »).
- **Après** : pack fin de formation + suivi batch (réutilise `ClosureFormationBlock` + `ClosureBatchProgress`, déplacé dans l'onglet).
- **Tous les documents** : `ParticipantDocMatrix` plein écran + ZIP.
- **Suppression des surfaces redondantes** : retirer `SessionOnlyDocsBlock` (4 cartes minuscules), `DocDockDrawer` + `DocsButton`, et les lignes docs dupliquées des blocs de phase. **Pré-condition** : vérifier qu'aucune action unique ne vit *seulement* dans le drawer avant de le supprimer (sinon la porter dans l'onglet).
- **Acceptation** : un doc apparaît dans exactement un onglet (+ son statut dans « Tous les docs ») ; Vitest sur la non-divergence (même source d'état) ; aucune action perdue.

### Lot 3 — Onglet Agenda
- Réembarquer la synchro Google Calendar (Phase 14) + affichage créneaux.
- **Acceptation** : synchro fonctionnelle depuis l'onglet ; idempotence préservée (re-sync = 0 doublon, déjà prouvé Phase 14).

### Lot 4 — Programme au niveau produit + nettoyage
- Déplacer « Valider le programme IA » sur la fiche **produit** (création/édition) ; sur la session, programme en lecture seule + lien.
- **Nettoyage packs zombies** : outil pour repérer/clore les `ClosureBatch` restés en `RUNNING`/`PROCESSING` (les « 4 packs en cours »). Vérifier `closure-worker` (idempotence, reprise).
- Correctifs résiduels de la passe visuelle absorbés ici s'ils survivent à la refonte : CTA `NextActionHero` cohérent avec la phase réelle ; doublon tarif en-tête ; bouton « Pack » bien placé.
- **Acceptation** : plus de « valider programme » sur la session ; zéro batch zombie affiché ; en-tête sans doublon.

---

## 5. Définition de « ça marche »
- 5 onglets, navigation fluide, deep-link.
- Chaque document à **un seul endroit**, lisible, avec statut + action claire.
- Pack fin de formation lançable depuis l'onglet Après, suivi visible au bon endroit.
- Agenda synchro Google Calendar opérationnel depuis son onglet.
- Plus aucun « valider programme IA » ni batch zombie sur la fiche session.

---

## 6. Workflow & gates
- **Un commit par tâche**, revue et approbation séquentielles (inchangé).
- Critères d'acceptation **testables (Vitest)** par lot.
- Discipline héritée : test **comportemental** par couche où la logique vit (pas du source-grep) ; **baseline non-nulle** sur les contre-tests (test de puissance / mutation) ; orphelins stashés avant de continuer.

---

## 7. Ce que Claude Code doit rendre AVANT de coder
1. Le **ROADMAP GSD** avec la séquence de commits (Lot 1 → 2 → 3 → 4) et les points de gate.
2. La liste précise des composants **réembarqués** (réutilisés) vs **supprimés** (surfaces redondantes), avec la vérif « aucune action unique perdue ».
3. La confirmation du chemin de génération des docs **niveau session** (Grille obs session, Bilan satisfaction session) — le trou des « 2 manquants » (existait-il déjà ? sinon, le créer).

On valide ensemble avant la première ligne de code.

---

## 8. ANNEXE — Matière conformité conservée (à rebrancher post-refonte)

> Cette section conserve la richesse du plan d'origine (ancré audit RNQ V9 / BCI). **Non bloquant pour la refonte 5 onglets.** À rebrancher quand le cœur sera propre.

### 8.1 Mapping conformité (rappel)
La fiche session était pensée comme l'UI de la check-list Qualiopi de session (**T7**). Mapping phase ↔ indicateurs ↔ docs ↔ tâches (détail dans `QUALIOPI-PLAN-COMPLET.md`) :
- **Avant** : analyse besoin + handicap (ind. 4 🔴, **T1**) · programme objectifs verbes d'action + méthodes (ind. 5 🔴, **T2**) · devis/convention/CGV (ind. 1/9, T5) · convocation bundle + relance J-14 (ind. 9, **T5**) · check-list matériel organisme/lieu (ind. 17, **T6**).
- **Après** (ex-Pendant + Clôture) : positionnement (ind. 8) · livrets (ind. 19) · déroulé réalisé + adaptations §1-bis (ind. 6/10 🔴, **T8**) · grille obs/QCM (ind. 11 🔴) · rapport formateur (ind. 30, T8) · émargement demi-journée (ind. 12) · certificat (ind. 11) · attestation (ind. 27) · satisfaction chaud/froid (ind. 30, T13) · retour mail axes de progrès (ind. 11/30) · archivage `NOM_DATE_FORMATEUR` (ind. 32 🔴).
- **Garde-fou IA = condition de conformité** (ancre Kaïna ind. 5) : tout asset IA `usedStub` ou objectif sans verbe d'action **bloque** le pack + « prêt pour audit » (**T4**). Un doc IA ne compte conforme qu'après revue.
- **« Prêt pour audit »** = tous items T7 `mandatory` à DONE/NA **et** aucun asset `usedStub` (T4) **et** aucun objectif non conforme (T2).
- **Chaîne §1-bis en base** : analyse besoin → programme → déroulé type → déroulé réalisé, liée par `adaptation.sequenceId` + `adaptation.besoinItemRef`.
- Rappel ind. 30 : QCM/grilles **ne sont PAS** une preuve probante d'appréciation — ne pas les taguer ind. 30.

### 8.2 Dette technique & données réelles (Lot E d'origine — à traiter)

**E0 — Transition auto `VALIDATED → IN_PROGRESS` à `startDate`** (logué 2026-06-09). Cause racine : un statut BDD qui ne reflète pas la réalité physique de la session. Conséquences UI : `MarkCompletedButton` invisible sur sessions VALIDATED en cours ; branches downstream désynchronisées. À trancher à froid (cron léger ? check au render ? hook server action ?). Risque inverse : ne pas faire avancer à tort une session annulée/reportée.

**E-tech-1 — Fix tsc `redirect-308.test.ts`** : `await nextConfig.redirects?.() ?? []` au lieu de `nextConfig.redirects()` (6 erreurs TS18048/TS2722 préexistantes, lignes 16/27/38). Pour que `tsc --noEmit` repasse propre et ne masque pas une régression future.

**E-data-1 — Réconciliation autoritaire sessions ↔ produits via API SmartOF** (logué 2026-06-09). ≥12 sessions mal câblées repérées en local : SES-0086 (TRACFIN→IA, manuel) + 11 systématiques (SES-0060..0070 Immo-IA mal câblées sur PROD-0662, quasi-inertes). L'audit nom↔produit local est **circulaire** (même heuristique que l'import qui a échoué). Vraie source = API SmartOF. À faire : (1) réconcilier via `lib/smartof/client.ts`, (2) auditer le fallback de `import-smartof.ts` qui choisit PROD-0662, (3) fail-fast au lieu de fallback silencieux. À boucler avant prochain import SmartOF.

**E-data-2 — Prix import SmartOF : ré-audit** : SES-0086.pricePerLearner = budget total au lieu de budget/N (même bug que PROD-0042 = 336€ au lieu de 3024€). Cross-check via API : combien de sessions ont `pricePerLearner = budgetTotal`. Couplé à E-data-1.

**E-data-3 — SES-0086 dossier structurellement incomplet** : 18/29 apprenants sans aucun doc, workflow inversé (PRE_ENROLLED avec docs), **0 PedagogicalAsset** → NC structurelle d'origine, indépendante du mismatch produit. À trancher pour l'audit : (a) re-onboarder + pack complet, (b) accepter la NC + réponse auditeur, (c) exclure du périmètre.

**E-data-4 — Piège sha256 dans 6 générateurs Document** : `convocation-generator`, `deroule-product-generator`, `agefice-attendance-generator`, `generate-checklist-formation`, `agefice-generator` (+ convention probable) font `findFirst({ where: { hashSha256 } })` **sans filtrer `status`** → un Document `superseded` revient à la régénération si hash identique. Fix : ajouter `status: { not: 'superseded' }` au where idempotence. Bloquant dès qu'on régénère un doc dont l'ancien était superseded.

**E-data-5 — Méthode check « isolée » circulaire** : l'audit cert-émis-vs-sujet refait la même tokenisation que l'import qui a échoué → ne détecte pas les sub-mismatches IA→IA. Confirmation autoritaire = API SmartOF (E-data-1) ou parsing texte des PDF cert émis (grep contenu).

### 8.3 Tâches conformité restantes (post-refonte)
T1 (analyse besoin + handicap) → T2 (objectifs verbes d'action + méthodes) → T4 (blocker IA) → T6 (check-list matériel) → T5 (convocation bundle + relance) → T7 (check-list interactive) → T3 (re-tuning prompts) → T8 (déroulé réalisé §1-bis) → T9 (versioning/fraîcheur) → T10 (RNCQ) → T10b (espace formateurs) → T11 (veille) → T12 (handicap/réseau ind. 26 🔴) → T13 (appréciations & réclamations).
