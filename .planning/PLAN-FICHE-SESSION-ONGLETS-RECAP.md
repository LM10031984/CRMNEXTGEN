# QualiOF — Plan fiche session : onglets + récap, ancré conformité

> **Pour Claude Code.** Placement repo : `.planning/PLAN-FICHE-SESSION-ONGLETS-RECAP.md`, relié depuis `ROADMAP` et `REQUIREMENTS`.
> **Ne code rien avant le gate.** Rends d'abord le plan GSD (ROADMAP + séquence de commits), il est revu, puis exécution commit par commit comme d'habitude.

---

## 0. Cadre

- **Sources de vérité** : `.planning/QUALIOPI-PLAN-COMPLET.md` (matrice 32 indicateurs + tâches T1→T13, fait foi pour la conformité), notes d'audit Kaïna (08/06/2026), Guide de lecture V9 (DGEFP).
- **Deadline** : audit de renouvellement BCI le **3 juillet 2026**. Prép externe **16/06** (politique handicap).
- **Ce plan ne remplace pas `QUALIOPI-PLAN-COMPLET.md`** : il en est la **présentation UI** + l'ordonnancement + les correctifs de bugs. Les T1→T13 y sont définis ; ici on dit *où* ils atterrissent et *dans quel ordre*.
- **Principe d'arbitrage** : l'audit juge les **documents** (leur contenu et la chaîne §1-bis), pas la navigation. La conformité (T1, T2, T4, T11, T12) prime sur le polish UI. Les onglets sont l'interface de T7, pas un chantier à part.

---

## 1. Principe directeur — la fiche session EST l'UI de T7

La fiche session n'est plus un scroll : c'est la **check-list Qualiopi de session interactive (T7)** rendue en **onglets de phase + un onglet récap**.

- **Onglets = phases** : Récap · Création · Préparation (AVANT) · Pendant (PENDANT) · Clôture (APRÈS) · Facturation.
- **Récap = la check-list T7 + `NextActionHero` + DocDock**. Il **lit et route**, il ne porte **aucune action**.
- **Une seule source d'état** : récap ET onglets lisent le même `getSessionCompleteness` / `sessionStage`. Une seule computation → zéro désync. Les items T7 (`SessionChecklistItem`) en sont la base.

---

## 2. IA cible — mapping phase ↔ indicateurs ↔ docs ↔ tâches

État d'onglet dans l'URL (`?tab=`) pour deep-link / refresh. Onglet par défaut = **Récap**.

### Onglet RÉCAP (atterrissage — lit + route uniquement)
- Avancement par phase (AVANT ✓ · PENDANT 4/6 · APRÈS …) cliquable → saute dans l'onglet.
- `NextActionHero` : la **prochaine action réelle** (issue de `sessionStage().cta`), pas un message d'avant-démarrage.
- Index de **tous les docs** (nom · statut · indicateur · ouvrir le PDF) = DocDock promu en onglet d'accueil.
- Bascule d'affichage **Liste** (défaut) ⇄ **Grille** = la matrice apprenant × doc (vue audit). La matrice **n'est pas supprimée**, elle devient ce mode.
- Bandeau « prêt pour audit » : vert seulement si tous les items `mandatory` sont `DONE`/`NA` **et** aucun asset `usedStub` (T4).

### Onglet CRÉATION (Étape 1 · ind. 1)
Wizard : produit, lieu, dates, formateur principal, **inscriptions** (CFP / CNI / RIB → calcul budget AGEFICE → seed analyse besoin + demande prise en charge par stagiaire). Édition inline + modale conservées.

### Onglet PRÉPARATION (AVANT)
| Doc / item | Indicateur | Tâche |
|---|---|---|
| Analyse du besoin (per stagiaire **+ variante commanditaire**), **bloc handicap** | 4 🔴 | **T1** |
| Programme — objectifs **opérationnels/évaluables** (verbes d'action) + **méthodes mobilisées** | 5 🔴, 1 m | **T2** |
| Devis + convention/contrat + CGV générés/signés | 1 m, 9 m | T5 |
| Convocation + règlement intérieur + charte handicap (bundle, variante agence/salle louée) | 9 m | **T5** |
| Check-list matériel — **« organisme »** vs **« lieu »** (lieu dérivé de l'analyse du besoin) | 17 m | **T6** |

### Onglet PENDANT (PENDANT)
| Doc / item | Indicateur | Tâche |
|---|---|---|
| Test de positionnement (début) | 8 m | T7 (auto) |
| Livrets de formation distribués | 19 m | T7 (manual) |
| **Déroulé réalisé + adaptations rattachées à l'objectif/séquence** | 6/10 🔴 | **T8** |
| Grille d'observation/progression (`nb grilles = nb mises en situation`) | 11 🔴 | T7/T8 |
| QCM | 11 🔴 | T7 |
| **Rapport formateur** (bilan + adaptations) | 30 m | T8 |
| Satisfaction stagiaire + **émargement à la demi-journée** | 30/12 m | T7 |
| Certificat de réalisation | 11 🔴 | T7 |

### Onglet CLÔTURE (APRÈS)
| Doc / item | Indicateur | Tâche |
|---|---|---|
| Attestation de fin de formation, Certificat | 27 | — |
| **Grille d'observation SESSION** (niveau session) | 11 🔴 | voir §3.4 |
| **Bilan satisfaction SESSION** (niveau session) | 30 m | voir §3.4 |
| Satisfaction à chaud / à froid stagiaire | 30 m | T13 |
| Retour mail axes de progression (par stagiaire) | 11/30 | T7 (manual) |
| Archivage dossier `NOM_DATE_FORMATEUR` | 32 🔴 | T7 (auto DocDock) |

### Onglet FACTURATION (Étape 5)
Facture sponsor + **avoir si besoin** (`createCreditNote` existe déjà), dossier OPCO/AGEFICE, satisfaction **commanditaire à froid** + **financeur annuel** planifiés (**T13**). Rappel ind. 30 : **les QCM/grilles ne sont PAS une preuve probante** — ne pas les taguer ind. 30.

### Rails (récap ou réglages, niveau session/tenant)
Handicap (→ T12), Amélioration (fiche + plan + versions + MAJ indicateurs /3 mois — ind. 2), Employés, Sous-traitants (NA, désactivable).

---

## 3. Règles non négociables

1. **1 doc = 1 maison** (l'onglet de sa phase). Le récap montre, l'onglet agit. Pas de troisième copie.
2. **Source unique d'état** : récap + onglets lisent le même `getSessionCompleteness`/`sessionStage`. Items T7 = base. Aucune computation parallèle.
3. **Garde-fou IA = condition de conformité, pas confort** (ancre Kaïna ind. 5 majeur) : tout asset IA `usedStub` ou non conforme (objectif sans verbe d'action) **bloque** le pack et « prêt pour audit » (**T4**) et affiche une bannière de revue (**T2**). Un doc IA ne compte conforme qu'après revue.
4. **Génération sur donnée prête, pas sur navigation** : un doc se génère/relance quand sa donnée source est complète, jamais au seul fait d'ouvrir l'onglet. Statut par doc visible (à générer / en cours / prêt / à revoir), enfilé une fois, idempotent.
5. **Invalidation à l'édition** : éditer une étape antérieure périme les docs dépendants (pattern `updatedAt`/`PROMPT_VERSION`). Navigation libre entre onglets (pas un wizard verrouillé).
6. **Chaîne §1-bis respectée** : analyse besoin → programme → déroulé type → déroulé réalisé, liée **en base** (`adaptation.sequenceId` + `adaptation.besoinItemRef`), pas des blocs de texte indépendants.
7. **Réutiliser l'existant** : blocs d'étape, édition inline, `normalizeNullableText` — on change le contenant, pas la logique métier.

---

## 4. Lots de travail (séquencés)

### Lot A — Déblocage (bugs de la passe visuelle) — IMMÉDIAT, sur la page actuelle
Objectif : « que ça marche » sans attendre la re-architecture, car ces bugs bloquent la production des preuves.
- **A1** — Bouton « Pack fin de formation » (`GenerateClosurePackButton`) absent du nouveau `SessionHeaderBar` : le restaurer en primaire visible (pas dans le ⋮). Reformuler les textes d'aide périmés (« bouton en haut de page ») dans `closure/page.tsx` + bloc étape 4.
- **A2** — `NextActionHero` affiche un CTA périmé (« à J0 ») à J+7 : `sessionStage().cta` doit sortir l'action réelle.
- **A3** — Tarif dupliqué dans l'en-tête (« 3 024 € / stagiaire € / stagiaire ») : le `priceSlot` se rend à côté du rendu par défaut au lieu de le remplacer — condition `priceSlot` à corriger.
- **A4** — Timeline : replier par défaut les étapes terminées, n'ouvrir que l'étape active + celle avec blocker.
- **A5** — **Chemin de génération à l'unité pour les docs NIVEAU SESSION** (Grille d'observation session ind. 11, Bilan satisfaction session ind. 30) : c'est le trou des « 2 manquants » — aujourd'hui le grain à l'unité ne couvre que le per-stagiaire. (Vérifier d'abord s'il existe ; sinon créer le contrôle.)
- **Acceptation** : pack lançable depuis la fiche ; CTA cohérent avec la phase réelle ; en-tête sans doublon ; docs session générables à l'unité ; Vitest sur le CTA dérivé.

### Lot B — Coquille UI : onglets + récap (= présentation de T7)
- Conteneur à onglets + état URL ; en-tête persistant (identité · statut · 1 CTA) au-dessus.
- Onglet **Récap** : avancement par phase (lit `getSessionCompleteness`), `NextActionHero`, DocDock-index, bascule Liste/Grille (matrice = mode grille). **Zéro action** dans le récap.
- Réembarquer les blocs d'étape existants dans les onglets de phase (réutilisation, pas réécriture).
- **Remplace l'ancien #3 (SettingsDrawer)** : Formateurs/Lieu/Logistique/Notes vont dans l'onglet Préparation (ou un onglet Réglages).
- **Reformule l'ancien #5** : supprimer les cartes « Documents par apprenant » dupliquées ; la matrice **survit** en mode grille ; le DocDock doit porter le « clic génère ce doc » **avant** toute suppression.
- **Acceptation** : navigation par onglets + deep-link ; récap sans contrôle d'action ; un doc apparaît dans exactement un onglet (+ son statut dans le récap) ; Vitest sur la non-divergence récap/onglets (même source).

### Lot C — Conformité bloquante (avant le 3 juillet) — atterrit dans les onglets
Exécuter, dans cet ordre (cf. `QUALIOPI-PLAN-COMPLET.md`), chaque tâche posée dans son onglet (cf. §2) :
**T1** (analyse besoin + handicap, ind. 4 🔴 — onglet Préparation) → **T2** (objectifs verbes d'action + méthodes, ind. 5 🔴 — Préparation) → **T4** (blocker contenu IA non personnalisé — récap/`NextActionHero`) → **T6** (check-list matériel organisme/lieu, ind. 17 — Préparation) → **T5** (convocation bundle + relance J-14, ind. 9 — Préparation) → **T7** (check-list interactive = le récap + items par onglet, ind. 32) → puis **T3** (re-tuning prompts Ollama→Sonnet + bench, réutilise T1/T2).

### Lot D — Handicap (pour le 16/06)
**T12** (module handicap / réseau, ind. 26 🔴) : charte PSH, guide adaptations, tableau adaptations par session, doc réseau (Agefiph/Cap emploi/MDPH/RHF), référent. Branché au rail handicap de T7. *(Jalon dur : prép Kaïna le 16/06.)*

### Lot E — Structurel (post-audit)
**T8** (déroulé réalisé + adaptations liées §1-bis), **T9** (datation/versioning/fraîcheur), **T10** (référentiel RNCQ officiel), **T10b** (espace formateurs ind. 18/21/22), **T11** (module veille ind. 23/24/25), **T13** (appréciations & réclamations ind. 30/31/32). Y inclure le polish UI restant des onglets.

---

## 5. Définition de « prêt pour audit »
Tous les items T7 `mandatory` à `DONE`/`NA` **et** aucun asset `usedStub` (T4) **et** aucun objectif non conforme (T2). Tant que ce n'est pas le cas, le bandeau récap reste orange et le pack reste bloqué. C'est la traduction directe de la matrice §1 dans l'UI.

---

## 6. Workflow & gates
- **Un commit par tâche**, revue et approbation séquentielles (inchangé).
- Critères d'acceptation **testables (Vitest)** par tâche — déjà spécifiés dans `QUALIOPI-PLAN-COMPLET.md` pour T1→T13 ; ajouter ceux des lots A et B ci-dessus.
- Discipline héritée : test **comportemental** par couche où la logique vit (pas du source-grep) ; **baseline non-nulle** sur les contre-tests ; orphelins stashés avant de continuer.

---

## 7. Ce que Claude Code doit rendre AVANT de coder
1. Le **ROADMAP** GSD avec la séquence de commits (Lot A → B → C → D → E) et les points de gate.
2. La confirmation du point ouvert **A5** (existe-t-il déjà un chemin de génération des docs niveau session ?).
3. La confirmation que les onglets réutilisent les blocs d'étape existants (liste des composants réembarqués vs réécrits).
4. Le rattachement de chaque tâche T1→T13 à son onglet (tableau §2) validé.

On valide ensemble avant la première ligne de code.
