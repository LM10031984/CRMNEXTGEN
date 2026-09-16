# Les homonymes du domaine — isolé ou famille ?

**16/09/2026. Constat, aucun correctif au-delà du refus arbitré.**
Sonde `apps/web/scripts/probe-homonymes.ts`, 100 % lecture, rejouable.
Sortie brute : `260916-homonymes-releve.txt`.

Population : **276 rapprochements possibles** (298 modules composables × 24
besoins, score non nul).

---

## Le cas fondateur, et sa surprise

`drive:034#2` « Rédiger des compromis de vente efficaces » proposé sur
« Transformer visites et offres en actes ». **Refusé, motif de Laurent
consigné verbatim** dans `arbitrages-rattachement.ts`.

**Mais l'homonyme « compromis » n'est pour rien dans le rapprochement.** Il
n'est mot-clé d'aucun besoin : il produit **0 rapprochement**. Le terme qui a
réellement matché est **« vente »**, présent dans le titre du module et dans les
mots-clés du besoin.

> L'homonyme n'apparaît donc même pas dans la trace lexicale. **Aucune relecture
> des `matchedTerms` n'aurait pu le prédire.**

Le mot « compromis » vit ailleurs : dans les **alertes** du besoin
(`offres_to_compromis_below_benchmark`, `compromis_to_acte_below_benchmark`), où
il désigne une **étape du tunnel**. Le module l'emploie comme un **document à
rédiger**. Même mot, deux rôles, et ils ne se rencontrent jamais dans le code —
seulement dans la tête du lecteur.

## ① Les homonymes peuvent-ils seulement rapprocher ?

| Mot | Mot-clé ? | Les deux sens |
|---|---|---|
| `compromis` | **non** | terrain d'entente / avant-contrat |
| `mandat` | oui | de vente / de recherche, de gestion |
| `acte` | **non** | acte authentique / passer à l'acte |
| `offre` | oui | offre d'achat / offre commerciale |
| `bien` | **non** | un bien / adverbe |
| `exclusivite` | oui | mandat exclusif / exclusivité commerciale |
| `estimation` | oui | avis de valeur / chiffrage |
| `dossier` | **non** | dossier de vente / de financement |
| `suivi` | oui | suivi vendeur / suivi de dossier |

Quatre des neuf ne sont mot-clé d'aucun besoin : ils ne peuvent produire aucun
rapprochement lexical. **L'ambiguïté d'un mot ne devient un risque que s'il est
un point d'appui.**

## ② Combien de rapprochements ne tiennent QUE par un mot ambigu ?

| Mot | Appui **unique** | Total | Exemple |
|---|---:|---:|---|
| `mandat` | **12** | 15 | BIB-D047 « Faire des avis clients une source de mandats » → « Rentrer des mandats en exclusivité » |
| `suivi` | **11** | 16 | BIB-D023 « Maîtrisez le suivi des acheteurs » → « Piloter le stock et le suivi **vendeur** » |
| `estimation` | **4** | 7 | BIB-D003 « Générer du business avec les dossiers » → « Formaliser la découverte et l'estimation » |
| `offre` | **2** | 5 | BIB-D023 « Créer des offres » (offre commerciale) → « Transformer visites et **offres** en actes » |
| autres | 0 | 0 | — |
| **Total** | **29** | 43 | |

`suivi` et `offre` portent des exemples qui **reproduisent exactement le défaut
du compromis** : « suivi des acheteurs » rapproché d'un besoin de « suivi
vendeur », « créer des offres » (commerciales) rapproché d'« offres » (d'achat).

## ③ La mesure qui tranche — ce n'est pas une famille, c'est structurel

```
rapprochements ne tenant que par UN mot, quel qu'il soit : 241 / 276  (87,3 %)
dont l'appui unique est un mot ambigu de la liste ........  29
rapprochements purement LEXICAUX (aucun signal catalogue) . 245  (88,8 %)
…et tenant sur un seul mot — les plus fragiles ............ 225
```

**Les homonymes ne sont pas le problème : ils en sont la partie visible.**

Le vrai chiffre est **87,3 %** — près de neuf rapprochements sur dix n'ont
qu'**un seul point d'appui**. Un appui unique n'a pas de second témoin : si ce
mot se trompe de sens, **rien ne le rattrape**. Les 29 cas d'homonyme connu sont
ceux où l'on sait *d'avance* que le mot peut mentir ; les 212 autres sont
exactement aussi fragiles, on ignore simplement lequel trahira.

D-27 (deux mots pleins concordants) est la bonne intuition — **mais elle n'est
pas appliquée** : 225 rapprochements purement lexicaux tiennent sur un mot.

## Ce que ça ne dit pas

Ce relevé compte des rapprochements **possibles**, pas ceux qui sont réellement
programmés : le composeur n'en retient qu'une poignée par dossier, et les
signaux du catalogue passent devant le lexique. Le risque réel est donc **plus
faible que 87 %** — mais il porte sur la même population, et c'est elle qu'il
faudra renforcer, pas les neuf mots de la liste.

---

## La matière pour couvrir le besoin découvert — constat

Besoin nommé par Laurent : **le suivi de la réception des pièces entre l'offre
et la signature**.

| Piste | Constat |
|---|---|
| **Faros M3 « Commercialiser » / M4 « Suivi vendeur »** | **Absents de la base.** Faros n'y a que 2 modules, tous deux des coquilles : `faros:SA-ACQ-M003#1` et `faros:SA-ADM-M001#1`, intitulés « LIVRABLE 003 » et « LIVRABLE 001 » |
| `PROD-0676` « Automatisation Boîte mail » | **Nomme exactement le besoin** : « la boîte mail ralentit-elle le traitement des demandes clients, **notaires, diagnostiqueurs** et vendeurs ? ». Mais c'est une **question d'identification**, pas un déroulé — `isAnimable` l'écarte, à raison |
| `BIB-D037` « Installer un rythme de suivi vendeur » | Le **patron transposable** : journal tenu au fil de l'eau, commandes qui produisent un livrable, rythme hebdomadaire écrit. Traite le suivi VENDEUR, pas le suivi de DOSSIER |
| `BIB-D005`, `BIB-D007` | Suivi vendeur et suivi acquéreurs — relationnel, pas administratif |

**Conclusion : la matière n'existe pas.** Ce qui existe, c'est la **question**
— Laurent avait déjà identifié la douleur dans le catalogue diagnostic, il n'a
pas encore écrit le contenu. Et il existe un **patron** (`BIB-D037`) dont la
discipline — journal, commandes, relances datées — se transpose du suivi vendeur
au suivi de dossier.

Le besoin « Transformer visites et offres en actes » rejoint donc la liste des
douleurs **sans contenu**, avec `drive:034#2` retiré. Le sort de `drive:034#3`
(« Gérer les objections et trouver des solutions de compromis ») **reste à
trancher** : il emploie « compromis » dans l'autre sens — le bon — mais parle de
négociation, pas de suivi de pièces.
