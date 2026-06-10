# QualiOF — Plan directeur complet (audit du 3 juillet + refonte UX)

> Document de passation pour Claude Code. **Remplace** `PLAN-DIRECTEUR-AUDIT-03-07.md` (v1), qu'il reprend intégralement en Partie 1 et étend d'un programme UX en Partie 2.
> Placement : `.planning/PLAN-DIRECTEUR-COMPLET.md`, référencé depuis ROADMAP et STATE.
> Architecture du plan : **deux parties étanches**. La Partie 1 (pré-audit) est intouchable dans son périmètre — rien de la Partie 2 ne s'exécute avant le 4 juillet, à une exception près : U0, qui ne touche pas au code.

---

# PARTIE 1 — Jusqu'au 3 juillet : conformité et retrouvabilité des preuves

## 1. Contexte et jalons durs

- **Tenant audité** : Start Academy. Audit de **renouvellement Qualiopi le 3 juillet 2026**, certificateur **BCI France**.
- **Jalon intermédiaire** : session avec Kaïna le **16 juin, 9h–11h** — politique handicap (ind. 26) + derniers indicateurs + confirmation RS.
- **Branche** : `cloud-migration`. Workflow GSD, un commit par tâche, gate de revue avant chaque phase.
- **Règle d'arbitrage suprême** : *l'auditeur note les documents et la chaîne de preuves, pas l'application.* Entre une fonctionnalité et un document conforme, **le document gagne**.

## 2. Sources de vérité (ordre d'opposabilité)

1. **Grille BCI réelle** — rapports des audits précédents dans `.planning/audit/` (docx initial + matrice xlsx de renouvellement).
2. **Guide de lecture V9** (DGEFP, 01/2024).
3. **`QUALIOPI-PLAN-COMPLET.md`** — matrice §1 et tâches T1–T13.

Tout recoupement d'indicateurs (seed, catalogue, check-list) se fait contre ces trois sources. Recette : **0 drift résiduel**.

## 3. État au 10/06 — fait et acté

- **Audit navigation livré** : `.planning/audit/MATRICE-NAVIGATION-DOCS.md` — 23 DocType, stockage éclaté sur **6 sources** (Document, PedagogicalAsset, champs CNI/RIB, AgeficeProfile/CFP, markdown tenant), navigation cassée hors page session.
- **Décision actée** : résolveur **lecture seule** `resolveDocs` (UNION 6 sources). **Aucune migration de schéma avant le 3 juillet** ; la migration est en Partie 2 (U2).
- **Phase 9.3** planifiée et vérifiée : 4 plans, 3 vagues, contrat UnifiedDoc figé, décisions D-09.3-01..08. Prête : `/gsd:execute-phase 09.3`.
- **CONVENTION tranchée par la grille BCI** : preuve transversale (ind. 5, 6, 9) ; document et transmission contrôlés sous l'**ind. 9** → tag primaire ind. 9. Dette D-09.3-08(b) : dans T7, la convention ne figure pas sous l'item ind. 1.
- **Ind. 27 (sous-traitance) : NA confirmé par précédent.** Garder la charte qualité formateur accessible (citée favorablement).
- **Preuves T12 (handicap) validées par précédent** : charte PSH, guide adaptations, doc réseau, contact AGEFIPH PACA, MOOC. Laurent **a déjà ces documents** — rien à produire.
- **Échantillonnage BCI lisible** : formations > 2 jours, un dossier inter + un intra (précédent : Dumoulin, Barrière). Le dry run final tourne sur ce profil.
- **Chantier Tréso E0–E5** : validé sur le principe, **reporté en Partie 2**.

## 4. Séquence pré-audit

### Bloc A — Semaine du 10/06 : Phase 9.3 + préparation du 16

1. **Exécuter la 9.3** (`/clear` → `/gsd:execute-phase 09.3`), 2–3 jours :
   - **09.3-01 (TDD)** : résolveur pur, wrappers Prisma scopés `tenantId`, test comportemental 6-sources. **Gate : test de puissance par mutation** (commenter une source → rouge → restaurer). PII via `findFirst({where:{id,tenantId}})`, jamais de findMany cross-tenant.
   - **09.3-02** : triage des 5 fantômes (SATISFACTION → fusion CHAUD/FROID ; PRE_ACCORD_OPCO / VALIDATION_OPCO → jalons OpcoSubmission ; SUPPORT_PEDAGOGIQUE → conservé, ind. **19**, upload manuel ; CUSTOM → upload libre) + 7 corrections du seed, gate = test de mapping contre les trois sources.
   - **09.3-03** : 3 surfaces UI — onglet Docs apprenant, bloc Docs produit, liens tenant. Recette : **tout doc en ≤ 2 clics** depuis les trois fiches ; badge `usedStub` (littéral `'no_proof'`). Checkpoint visuel sur :3010.
   - **09.3-04** : bookkeeping uniquement ; « smoke » n'y remplace aucun test comportemental ; balayage `.bak`/`.orig` orphelins (dont `page.tsx.bak`).
2. **Préparation du 16 (humain, hors code)** : rassembler les 5 preuves handicap, vérifier la fraîcheur (contact AGEFIPH du cycle en cours), tableau des adaptations par session. **Si arbitrage entre vague 3 et le 16 : le 16 gagne.**
3. **Mail à Kaïna avant le 16** : seule question restante = confirmation **RS** (→ ind. 3/7/16 NA ou pas).

### Bloc B — Semaines du 17 et du 24/06 : lot P0 (T1 → T2 → T4 → T6 → T5 → T7, puis T3)

- **T1** — Analyse du besoin : bloc handicap (`besoin_adaptation`, stagiaire ET commanditaire), variante commanditaire/intra, `objectifs_vises` exposés. Ind. 4 🔴.
- **T2** — Objectifs à verbes d'action sur le **programme** (zéro « comprendre/connaître/savoir » nus) + méthodes mobilisées publiées. Ind. 5 🔴 / ind. 1.
- **T4** — Blocker `doc_used_stub` : pack et « prêt pour audit » bloqués tant qu'un asset est stub (s'appuie sur le `usedStub` du résolveur).
- **T6** — Check-list matériel scindée organisme/lieu, dérivée des champs lieu de l'analyse du besoin. Ind. 17.
- **T5** — Convocation : bundle (convocation + RI + charte handicap + programme + indicateurs), variante agence/salle louée, signature ≥ 14 j + relance. Ind. 9.
  - **Décision Laurent à trancher ici** : Yousign avant le 3/07 **ou** envoi traçable documenté comme preuve ind. 9 (le précédent audit citait Adobe Sign). Claude Code implémente le choix, ne le prend pas.
- **T7** — Check-list de session Avant/Pendant/Après, items AUTO/MANUAL, preuve **polymorphe** (`sourceTable` + `sourceId`). Appliquer D-09.3-08(b). Ind. 32 + transversal.
- **T3** — Re-tuning prompts (mistral-small → Sonnet via `callLlm()`) : bump `PROMPT_VERSION`, bench rejouable (handicap T1, Bloom T2, JSON QCM ≥ 10 Q), 0 `usedStub` sur run propre, diff documenté.

### Bloc C — Dernière semaine de juin : dry run et gel

1. **Dry run complet** sur une session au profil échantillonnable (> 2 jours, dossier complet). Critères : docs **sans stub** ET contrôle de fond (verbes d'action, structure, invariant **nb grilles = nb mises en situation**). Un doc présent mais creux = échec.
2. **Gel fonctionnel à J-3 (~30/06)** : plus de changement de schéma, prompt ou workflow ; seules les corrections de données/documents restent autorisées.

---

# PARTIE 2 — Après le 3 juillet : interface intuitive et données consolidées

> Objectif : que QualiOF cesse d'être « une usine à gaz » au quotidien. La Partie 1 a réglé la retrouvabilité des **preuves** ; la Partie 2 règle l'expérience de **travail** — champs liés en écriture comme sur Airtable, navigation globale, formulaires, cohérence visuelle — et consolide les données qui rendent ces liens natifs.

## U0 — Journal de friction (DÉMARRE MAINTENANT, zéro code)

Pendant tout juin, Laurent utilise intensivement l'app pour préparer l'audit : c'est la meilleure étude utilisateur possible, gratuite. Tenir un fichier `.planning/ux/JOURNAL-FRICTION.md` où chaque irritation est notée **sur le moment**, en une ligne : *quoi (l'action tentée), où (l'écran), coût (clics/secondes/erreur)*. Pas d'analyse, juste des faits. Exemples du format attendu :
- « Modifier le SIRET d'une org depuis la fiche apprenant → impossible, 4 clics pour y aller et revenir »
- « Créer une session : je ressaisis le lieu alors qu'il est dans l'analyse du besoin »
- « Liste des sessions : impossible de voir lesquelles ont un doc en attente sans les ouvrir une par une »

Ce journal est **l'unique cahier des charges** de U1. Sans lui, la refonte UX reposera sur des impressions reconstituées après coup — c'est exactement comme ça qu'on refait une UI sans régler les vrais problèmes.

## U1 — Audit UX global (3–4 j, même méthode que l'audit docs)

Étendre la méthode de `MATRICE-NAVIGATION-DOCS.md` à **toute l'application** :
1. **Inventaire des parcours** : pour chacun des ~8 parcours quotidiens (créer une session, inscrire un apprenant, générer le pack, suivre les signatures, saisir le réalisé, traiter une réclamation, consulter un dossier, préparer une facture/AGEFICE), chiffrer clics, écrans traversés, ressaisies, points morts.
2. **Croiser avec le journal U0** : chaque entrée du journal est rattachée à un parcours et chiffrée.
3. **Livrable** : `MATRICE-UX-GLOBALE.md` — top 10 des frictions classées par (fréquence d'usage × coût), avec la cause racine de chacune (donnée non liée ? écran manquant ? formulaire mal séquencé ? simple affichage ?).
4. **Gate** : Laurent valide le top 10 avant tout design. C'est lui qui vit ces frictions, pas le code.

## U2 — Migration de consolidation des données (4–5 j)

Le prérequis structurel des champs liés en écriture : on ne peut pas lier proprement ce qui vit dans 6 tables hétérogènes.
1. Ajouter `productId`/`personId` sur `Document` + **backfill** piloté par le résolveur 9.3 (qui sait déjà faire l'union — il devient l'oracle de la migration : après backfill, `resolveDocs` et une requête directe doivent renvoyer le même ensemble ; c'est le test d'acceptation).
2. Évaluer la **résorption progressive** des sources éclatées : les pièces CNI/RIB/CFP migrent vers des `Document` typés rattachés à la personne ; les docs tenant (RI/CGV) deviennent des `Document` versionnés (ce qui sert aussi T9, datation/versioning).
3. Garde-fous : `pg_dump` avant chaque étape ; migration par source, une à la fois, avec le résolveur comme filet de non-régression ; jamais de big-bang.
4. À la fin, le résolveur devient une simple vue de confort — les liens sont natifs en base.

## U3 — Champs liés en écriture, le « mode Airtable » (5–7 j)

Le cœur de la demande : ne plus naviguer **vers** la donnée pour la modifier, mais la modifier **depuis** là où on la voit.
1. **Généraliser `EditableField`** (déjà en place sur la page session) à toutes les fiches : org, personne, produit.
2. **Composant `LinkedRecordField`** : sur toute fiche, les enregistrements liés (l'org d'un apprenant, le formateur d'une session, le produit) sont des champs combobox — rechercher, **lier**, **délier**, et **créer à la volée** dans une modale rapide sans quitter l'écran (le pattern Airtable exact).
3. **Édition croisée contextuelle** : depuis la fiche apprenant, corriger le SIRET de son org dans un panneau latéral, sans navigation. Toute écriture passe par les server actions existantes (dont `updateSessionDetails` et `normalizeNullableText` — les nouvelles routes d'écriture appellent explicitement la normalisation, règle déjà actée).
4. **Recette** : les 3 frictions « donnée non liée » les mieux classées de U1 tombent à ≤ 1 clic ; test comportemental par champ lié (lier/délier/créer) ; aucun contournement du layer de normalisation serveur.

## U4 — Navigation et architecture d'information (3–4 j)

1. **Recherche globale (Cmd+K)** : personnes, orgs, sessions, produits, documents — un champ, partout. C'est la réponse définitive à « où est ce truc ».
2. **Tableau de bord « prochaines actions »** : agrégation cross-sessions des `NextActionHero` — signatures en attente, docs manquants, relances dues, sessions à clôturer. L'écran d'accueil devient « qu'est-ce que je dois faire », pas une liste de tables.
3. **Fil d'Ariane + liens retour systématiques** : on sait toujours d'où l'on vient ; toute entité mentionnée est cliquable (corollaire navigation de U3).
4. **Recette** : depuis l'accueil, toute action en attente est atteignable en ≤ 2 clics ; la recherche trouve une entité par fragment de nom en < 1 s.

## U5 — Formulaires et cohérence visuelle (3–4 j, avec UI-SPEC cette fois)

Contrairement à la 9.3, ici il y a du design net-new : **passer par `/gsd:ui-phase`** pour figer un contrat (tokens, densité, états vides, états de chargement, hiérarchie typographique).
1. **Séquencement des formulaires** : le wizard de création de session pré-remplit depuis l'existant (lieu et matériel depuis l'analyse du besoin — généralisation du principe T6 « dériver, pas ressaisir »).
2. **États vides et d'erreur** parlants : un écran vide dit quoi faire, pas juste « aucune donnée ».
3. **Passe de cohérence** sur densité, espacement, libellés (français homogène), responsive.
4. **Recette** : zéro ressaisie d'une donnée déjà connue du système dans les parcours du top 10 ; checkpoint visuel Laurent par écran refondu.

## Ordre et arbitrages de la Partie 2

```
U0 (juin, passif) → [3 juillet : AUDIT] → U1 → U2 → U3 → U4 → U5
                                    en parallèle, pistes indépendantes :
                                    Tréso E0–E5 · T8–T13 · Yousign · CLAUDE.md
```

- **U1 avant tout design** : pas une ligne d'UI sans le top 10 validé.
- **U2 avant U3** : pas de champs liés en écriture sur des données éclatées.
- **Tréso E0–E5** est orthogonal (scripts de données) et peut tourner en parallèle de U1–U2, avec ses garde-fous déjà actés : montant en départageur (pas en critère d'entrée), fusions préservant les `ExternalIdentity`, gate CA à tolérance + écarts justifiés, **liste des docs backfillables vs non-backfillables validée par Kaïna** avant toute génération rétroactive.
- **T8** (déroulé réalisé + adaptations liées) s'insère naturellement après U2 : il bénéficie du modèle consolidé.
- Charge indicative Partie 2 : ~4 semaines de dev étalées sur juillet, séquençables phase par phase en GSD (`/gsd:insert-phase` par U).

## Garde-fous permanents (les deux parties)

1. **Tests comportementaux, pas des greps** ; au gate, **test de puissance par mutation** quand un test garde un invariant.
2. **Aucune migration avant le 3 juillet** ; en Partie 2, migration par source, `pg_dump` avant chaque `--apply`, résolveur comme oracle de non-régression.
3. **Ne pas modifier les scripts d'import existants** sans justifier l'insuffisance du mécanisme actuel.
4. **Re-vérifier les chemins de fichiers sur la branche** avant d'éditer.
5. **Pas de livrables annexes non demandés** ; proposer une fois, accepter le non.
6. **Gate ouvert** : test comportemental sur `updateSessionDetails` à fermer **avant** Task #3 (SettingsDrawer) — et avant U3, qui s'appuie sur cette server action.
7. **Français partout** ; **rien n'est commité sans décision explicite de Laurent**.
8. **Pas de refonte big-bang** : chaque U est une phase GSD autonome, livrable et réversible ; l'app reste utilisable entre chaque.

## Première action

```
/clear
/gsd:execute-phase 09.3
```

Et en parallèle, dès aujourd'hui : créer `.planning/ux/JOURNAL-FRICTION.md` et y noter la première irritation rencontrée. La refonte UX de juillet commence par cette ligne-là.
