# Point 5 — ordre de marche

_Écrit le 14/09/2026 en fin de session, pour que la suivante n'ait pas à
reconstruire le contexte depuis une conversation. C'est la leçon de la semaine
appliquée à nous-mêmes._

> **À ouvrir en session FRAÎCHE.** C'est le sujet qui change ce que Laurent peut
> vendre. Il mérite une session entière, pas une fin de session.

---

## 1. L'état constaté — chiffres mesurés, populations nommées

**Base locale `qualiof_dev`, tenant « Start Academy » (le seul), 12/09/2026.**

| Population | Produits | Modules |
|---|---:|---:|
| Total en base locale | 125 | 490 |
| — `drive:*` | 72 | 402 |
| — `faros:*` | **2** | 2 |
| — saisis dans QualiOF | 51 | 86 |

**Rattachables au composeur : 298 modules** — mesuré par le moteur, pas
recalculé. Retraits : 9 pige · 7 programme non diffusable (`PROD-0681` local) ·
68 rayon en doublon (D-19 bis) · **108 sans aucun déroulé** (règle 4).

**En PRODUCTION : 51 produits / 86 modules**, et les 86 appartiennent tous aux
**7 produits inactifs** créés le 10/09 (catalogue diagnostic + Agent
Incomparable). **Les 39 produits publiés portent ZÉRO module.** Rien du Drive
ni de Faros n'est versé : **74 produits / 404 modules attendent.**

⚠ **Le même code désigne deux produits différents selon la base** (`PROD-0681` :
« Catalogue diagnostic — Vendeur » en prod, « L'Agent Incomparable » en local).
Cf. spec §5.4 — ne jamais cibler par `code` seul.

---

## 2. Ce qu'on cherche — les deux causes ouvertes

### A · L'extraction Faros s'arrête à 2 programmes sur 17

Le catalogue porte `faros:SA-ADM-M001` (AGEFICE) et `faros:SA-ACQ-M003`
(Trouver des vendeurs). Le corpus `~/Projects/nxt-coach/Formation Faros` en
porte bien davantage : **8 dossiers de modules et 29 livrets HTML** sous
`AGENT-INCOMPARABLE-CONTENU-20260817/LIVRAISON_PARCOURS/` (M0 → M6), plus les
dossiers de livraison `SA_ACQ_M003_…` et `SA_ADM_M001_…`.

**Ce qu'il faut établir** : pourquoi l'extraction n'en voit que 2. Piste
mesurée — `PROD-0682` (« L'Agent Incomparable — parcours M0 → M6 ») existe en
prod avec 7 modules dont le `contentMd` tient en **une ligne de renvoi** :
« Ressources : 9 livret(s) HTML dans `M1_TROUVER_VENDEURS`. » (≈ 50 caractères).
Le contenu réel (177 Ko pour le seul M1) **n'est pas en base**.

⚠ Et son conteneur est marqué **non diffusable** (D-19 ter) : manifeste « trous
🔴/🟠 NON levés — NE PAS DIFFUSER AUX APPRENANTS ». Deux barrières, pas une.

### B · Des modules à déroulé RÉEL comptés comme ne couvrant rien

`drive:060#2` et `drive:055#8` — à vérifier en premier, ce sont les cas nommés
par Laurent. L'hypothèse à tester : la règle 4 (`isAnimable`) les écarte alors
qu'ils portent un vrai déroulé, ou bien le rattachement douleur→module ne les
atteint pas.

**Rappel** : les rattachements de la liste v2
(`.planning/260911-rattachement-douleur-module.md`) **ne sont pas écrits en
base**. 21 douleurs restent sans réponse ; les 4 du chapitre 9 sont détaillées
dans ce fichier.

---

## 3. Le blocage d'à côté — le programme composé n'est pas remettable

Mesuré le 14/09 (`probe:composition:local DIAG-0001`) : **le critère « titres
lisibles » est toujours ❌**, comme au 11/09.

Le parcours est par ailleurs correct — 6 demi-journées, 48 h conventionnées,
8 064,00 € HT, Σ devis = Σ proposition au centime, chaque module rattaché à une
réponse du diagnostic.

### La liste à arbitrer — titre actuel / titre proposé

Les objectifs du programme composé **dérivent des titres de modules**. Quatre
titres sur neuf ne sont pas remettables en l'état.

| Source | Titre actuel | Défaut | Proposition |
|---|---|---|---|
| `BIB-D008` | Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur | capitales de milieu de phrase | **Mener une découverte du projet acheteur-vendeur en situation** |
| `BIB-D037` | Préparer un Excellent Dossier de Suivi Vendeur | capitales + « Excellent » non évaluable | **Préparer un dossier de suivi vendeur complet** |
| `BIB-D012` | Pratiquer une découverte acheteur de qualité en questionnant et écoutant activement les besoins des acheteurs **:** | deux-points final, 108 caractères | **Conduire une découverte acheteur par le questionnement et l'écoute active** |
| `BIB-D047` | Atelier pratique : Simulation de réponse aux avis clients. | **n'est pas un objectif** — le moteur refuse de l'inventer et le dit | **Répondre aux avis clients en ligne, positifs comme négatifs** |

⚠ **Ces propositions ne sont PAS appliquées.** Elles sont là pour que Laurent
tranche en lecture, pas pour être écrites. Un titre de module part dans un
programme remis à un dirigeant et à un financeur.

**Les cinq autres titres sont bons** et n'appellent aucun arbitrage.

---

## 4. Ce qui ne doit PAS être fait sans feu vert nommé

1. **Verser les 402 modules en prod.** Deux commandes explicites contre la
   production, et **aucune garde de cible** dans `import-drive-catalog.ts` ni
   `import-diag-catalog.ts` : `--apply` sur la variante prod écrit directement.
   Le dry-run par défaut est la seule protection.
2. **Écrire les rattachements douleur→module** en base.
3. **Réécrire un titre de module** — §3 est un constat, pas un correctif.
4. **Découper un programme importé en bloc unique** (15 produits mesurés).
5. **Toucher aux 19 `accessConditions` et 5 `programMd`** qui citent encore
   Julien Lafitte en donnée — aucun n'est rendu aujourd'hui ; à traiter quand
   les contacts seront tirés de `lib/contacts-organisme.ts` côté données.

**Précondition de tout versement**, posée dans STATE.md : le programme composé
de DIAG-0001 doit avoir été relu et jugé propre. §3 dit qu'il ne l'est pas
encore.

---

## 5. Les outils déjà là

| Besoin | Commande |
|---|---|
| Lire la prod sans rien écrire | `pnpm --filter @qualiof/db run db:query:prod <f.sql>` |
| Idem en local | `db:query:local` |
| Voir ce que le composeur produit | `pnpm --filter @qualiof/web probe:composition:local DIAG-0001` |
| Voir la reco au niveau module | `probe:reco:local` |
| Relever les codes publiés | `curl -s https://qualiof.vercel.app/catalogue \| grep -oE '<span class="shrink-0 text-xs font-mono[^"]*">[^<]+</span>' \| sed -E 's/.*">([^<]+)<.*/\1/' \| sort -u` — **39 lignes** au 14/09 |

**Les règles à relire avant d'agir** : `quick.md` §4 ter (un test qui n'a jamais
rougi), §4 quater (un relevé dit ce qu'il a cherché), §5 bis (une PR verte peut
ne rien faire) ; spec §5.4 (un code n'est pas une adresse), §5.5 (contacts),
§8.4 (l'avarie n'est pas du contenu), §9.0 (fiche ≠ programme composé).
