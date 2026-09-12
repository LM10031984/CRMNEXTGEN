---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-4
subsystem: signature-electronique
tags: [signature, accessibilite, contraste, avertissement, signataire, depot-scan, copie]
requires:
  - quick-260910-c2a # plan-envoi.ts, envoi-contrats.ts, representant.ts
  - quick-260910-c2b-1 # participants-regime.ts, regime.ts
  - quick-260910-c2b-2 # bloc-signature-vue.ts, bloc-signature.tsx, recapitulatif-envoi.tsx
  - quick-260910-c2b-3 # persistSignedScan fail-closed, UploadSignedDocDialog confirmation
provides:
  - 'tailwind.config.ts — le jeton `primary.foreground`, absent depuis toujours : 12 fichiers réparés sans en toucher un seul'
  - 'les trois boutons d’envoi en signature passent de 2,12:1 à 8,44:1 (AAA)'
  - 'bloc-signature-vue.ts — `regrouperAvertissements` + `composerAvertissementRegime` : un encart par PERSONNE, texte court'
  - 'signataire-de-la-piece.ts — extraction pure du moteur : « qui signe, à quelle adresse » lisible par la fiche session'
  - 'LigneSignature.signataire — le couple nom + adresse sur la ligne, avant tout clic'
  - 'titre-depot-signe.ts — le titre de la zone de dépôt vient d’une table, plus d’une concaténation'
  - 'le bloc « Signature » ne propose plus aucun dépôt de scan par ligne'
affects:
  - 'apps/web/src/app/app/sessions/[id]/page.tsx (requête élargie : person.email, contacts complets)'
  - 'apps/web/src/server/actions/signature-envoi.ts (extraction, comportement constant)'
  - 'apps/web/src/components/sessions/tabs/tab-avant.tsx + tab-apres.tsx (`docLabel` retiré)'
key-files:
  created:
    - apps/web/src/lib/signature/signataire-de-la-piece.ts
    - apps/web/src/lib/signature/__tests__/signataire-de-la-piece.test.ts
    - apps/web/src/lib/sessions/titre-depot-signe.ts
    - apps/web/src/lib/sessions/__tests__/titre-depot-signe.test.ts
    - apps/web/src/lib/sessions/__tests__/fiche-session-cablage-signature.smoke.test.ts
    - apps/web/src/lib/__tests__/tailwind-jeton-primary-foreground.test.ts
  modified:
    - apps/web/tailwind.config.ts
    - apps/web/src/lib/sessions/bloc-signature-vue.ts
    - apps/web/src/components/sessions/signature/bloc-signature.tsx
    - apps/web/src/components/sessions/signature/recapitulatif-envoi.tsx
    - apps/web/src/components/sessions/qualiopi-matrix/signed-doc-drop-zone.tsx
    - apps/web/src/server/actions/signature-envoi.ts
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/components/sessions/tabs/tab-avant.tsx
    - apps/web/src/components/sessions/tabs/tab-apres.tsx
    - apps/web/src/lib/sessions/__tests__/bloc-signature-vue.test.ts
    - apps/web/src/components/sessions/signature/__tests__/bloc-signature.test.tsx
    - apps/web/src/components/sessions/signature/__tests__/recapitulatif-envoi.test.tsx
    - apps/web/src/components/sessions/qualiopi-matrix/__tests__/signed-doc-drop-zone.smoke.test.ts
metrics:
  corrections: 6
  commits: 12
  mutations: 8
  tests_ajoutes: 126
completed: 2026-09-11
---

# Quick 260910-c2b — découpage C.2b-4 : les six corrections d'écran

**Une phrase.** L'écran d'envoi en signature dit désormais ce qu'il faut savoir
**avant** de cliquer — qui signe, à quelle adresse, ce qui cloche dans la donnée
— et il le dit une seule fois par personne, avec un texte lisible sur un fond
contrasté.

Retours d'écran de Laurent du 11/09/2026, après vérification visuelle sur 3300.
Six corrections + un ajout de périmètre décidé en cours de route (la CAUSE du
défaut de contraste, et pas seulement son symptôme).

---

## 1. Ce qui change, correction par correction

### n°1 — CONTRASTE : la cause, puis le symptôme

Deux commits, volontairement séparés.

| Fichier                  | Ce qui change                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/tailwind.config.ts` | **La cause.** `primary.foreground: '#FFFFFF'` était **absent**. `text-primary-foreground` est une convention shadcn recopiée dans une douzaine de composants sans que le jeton n'ait jamais été défini : Tailwind la résout en `colors.primary.foreground`, et le `foreground: '#0F172A'` voisin en est un **frère**, pas un enfant. La classe ne produisait **aucune règle CSS**. Définir la clé répare les 12 fichiers porteurs **sans en toucher un seul**. |
| `bloc-signature.tsx`     | **Le symptôme.** « Envoyer pour signature (n) » et « Envoyer » (ligne) : `bg-primary text-white hover:bg-primary-600`.                              |
| `recapitulatif-envoi.tsx`| « Envoyer (n) » de la modale, même forme.                                                                                                          |

`text-white` reste **écrit explicitement** (exigence de Laurent) : la classe
survit à une refonte du jeton, et les tests gardent les boutons indépendamment
de `tailwind.config.ts`. `hover:bg-primary-600` remplace `bg-primary/90` — une
couleur **nommée**, pas une opacité dont le rendu dépend du fond derrière.

**Les 11 autres fichiers porteurs de la classe n'ont pas été touchés**, comme
demandé : la config suffit pour eux.

Ratios **calculés par le test**, pas recopiés (luminance relative WCAG 2.1) :

| Combinaison                             | Ratio     | Verdict          |
| --------------------------------------- | --------- | ---------------- |
| gris ardoise `#0F172A` sur `#00527A`     | **2,12:1** | échec AA (4,5:1) |
| blanc sur `bg-primary` `#00527A`         | **8,44:1** | AAA              |
| blanc sur `hover:bg-primary-600` `#004161` | **10,75:1** | AAA              |

> ⚠ Le brief annonçait 10,89:1 sur le survol ; le calcul WCAG donne **10,75:1**.
> L'écart ne change rien au verdict (AAA au-delà de 7:1), et le test assère le
> **seuil**, pas la décimale — une assertion à la 2ᵉ décimale aurait rougi pour
> une raison qui n'intéresse personne. Le test garde en revanche la mesure
> **2,12:1 à `toBeCloseTo(2.12, 2)`** : c'est la valeur connue qui vérifie le
> calcul lui-même.

### n°2 et n°3 — UN encart par personne, et un texte qui dit quoi corriger

`bloc-signature-vue.ts` gagne deux fonctions **pures** :

- `composerAvertissementRegime()` — la forme imposée, dans sa structure exacte :
  **deux phrases** (le problème, puis l'action), **puis les pièces**, **puis la
  réassurance**.
- `regrouperAvertissements()` — un encart par `participantId`, pièces dans
  l'ordre du référentiel, sans doublon.

Le message produit pour le cas de Laurent, **au caractère près** (test d'égalité
stricte) :

> Camille ROUSSEL — son financeur d'inscription (DEMO-SIG ROUSSEL Camille, EI)
> n'a aucun régime de financement, alors que son dossier est rattaché à une
> entreprise financée AGEFICE. Corrigez le financeur de l'inscription. Pièces
> concernées : convention, dossier AGEFICE. Rien n'a été envoyé.

> ⚠ **Un mot a changé par rapport à votre formulation** : « alors qu'**elle** est
> rattachée » est devenu « alors que **son dossier** est rattaché ». Motif : le
> genre de l'apprenant n'est nulle part dans la donnée, et l'accorder au hasard
> produirait « alors qu'elle est rattachée » sur un Florent. La structure que
> vous avez imposée est tenue mot pour mot ; seul l'accord de genre est évité.

Deux variantes, toutes deux tirées de la donnée :

| Situation                                            | Formulation                          |
| ---------------------------------------------------- | ------------------------------------ |
| financeur du commanditaire **absent ou hors catalogue** | « n'a aucun régime de financement »  |
| financeur **connu** mais qui n'ouvre pas ces pièces     | « n'ouvre pas ces pièces »           |
| une organisation rattachée avec code financeur        | « rattaché à une entreprise financée **AGEFICE** » |
| aucune, mais un lien `EI_SELF`                        | « rattaché à une entreprise individuelle »        |

**Le nom de l'organisation et le code financeur viennent de `page.tsx`**
(`ContexteAvertissement`), recopiés du catalogue. **Aucun code financeur n'est
reconnu dans le composeur** — pas de `if (code === 'AGEFICE')`, la règle du
septième financeur tient.

Singulier géré : une seule pièce ⇒ « **Pièce concernée** : dossier AGEFICE. »

### n°4 — Qui signe, et à quelle adresse, SUR LA LIGNE

La ligne affiche désormais :

> Convention — Provence Immobilier (2 participants) · signataire : Paul DURAND ·
> paul.durand@provence-immobilier.fr

L'adresse est **tronquée** à 18 rem à l'écran mais portée **complète** par
`title` — une adresse dont on ne lit plus le domaine ne permet justement pas de
repérer l'erreur. Cascade sans issue ⇒ « **signataire à déterminer** », jamais
un nom inventé ; le récapitulatif rendra le refus nominatif complet à l'envoi.

**Comment l'information est arrivée là — et pourquoi j'ai touché au moteur.**

L'information n'existait que dans `signature-envoi.ts`, derrière **deux
fonctions privées** (`formeDuDocument`, `resoudreSignataireClient`). Or un
fichier `'use server'` **ne peut exporter que des server actions** : la fiche
session n'avait aucun moyen de les lire. Deux options :

1. **Recopier la cascade dans `page.tsx`** → une DEUXIÈME règle « qui signe ».
   C'est exactement la divergence que le lot C.2a a supprimée pour
   `representant.ts` (« le signataire ne peut pas diverger du nom que le PDF
   imprime ») et le lot C.2b-1 pour le régime. L'écran aurait fini par annoncer
   un signataire pendant que le lien partait ailleurs.
2. **Extraire dans un module pur**, appelé par le moteur ET par la page.

J'ai pris la 2. **`apps/web/src/lib/signature/signataire-de-la-piece.ts`** —
extraction **à comportement constant** : le diff de `signature-envoi.ts` est
**uniquement des suppressions plus un import** (vérifié ligne à ligne). Les 53
tests du moteur (`signature-envoi`, `signature-annulation`,
`signature-depot-scan`) passent **sans avoir été touchés**.

> ⚠ **C'est la seule entorse à « aucun contrat moteur modifié », et je la
> signale.** Aucun contrat n'a changé de forme — `EnvoiPrepare`,
> `SignataireResolu`, `AnomalieEnvoi`, `planifierEnvoi` sont **intacts**
> (`git diff` vide sur `plan-envoi.ts`, `envoi-contrats.ts`, `regime.ts`,
> `representant.ts`). Deux fonctions **privées** ont changé de fichier. Si vous
> préférez qu'elles restent dans le moteur, la correction n°4 n'est pas
> livrable sans dupliquer la règle : dites-le et je remets tout en arrière.

`page.tsx` charge en conséquence `person.email` et **tous** les contacts de
l'organisation bénéficiaire (`orderBy isPrimary desc, createdAt asc` — l'ordre
que `representant.ts` exige et ne rejoue pas). Le `where: { isPrimary }` retiré
imposait de corriger le garde-fou voisin : `aContactPrincipal` passe de
`contacts.length > 0` à `contacts.some(c => c.isPrimary)`, sans quoi il aurait
répondu « oui » pour une organisation sans aucun contact principal. **Verrouillé
par test.**

### n°5 — « Déposer les conventions signées »

`titre-depot-signe.ts` : une **table** par `DocType`, pluriel et accord écrits
dans la donnée.

| DocType     | Titre                                          |
| ----------- | ---------------------------------------------- |
| CONVENTION  | Déposer les **conventions signées**            |
| AGEFICE     | Déposer les **dossiers AGEFICE signés**        |
| CONVOCATION | Déposer les **convocations signées**           |
| EMARGEMENT  | Déposer les **feuilles d'émargement signées**  |
| ASSIDUITE   | Déposer les **attestations d'assiduité signées** |
| (inconnu)   | Déposer les documents signés                   |

Le titre **suit le type sélectionné** — promesse du lot A, tenue par un autre
mécanisme. `docLabel` disparaît de `<SignedDocDropZone>` : il n'existait que
pour la concaténation fautive, et un prop mort finit par mentir.

### n°6 — Plus aucun dépôt de scan par ligne

Retirés du bloc : le bouton, l'état `depotOuvert`, le montage de
`<UploadSignedDocDialog>` par ligne, l'import et l'icône devenus morts.

---

## 2. Les 8 mutations — sortie RÉELLE

Chacune posée, exécutée, restaurée. **Aucune n'est restée verte.**

### Mutation 1 (exigée) — retirer `text-white` des boutons de signature

```
 ❯ src/components/sessions/signature/__tests__/bloc-signature.test.tsx (22 tests | 2 failed)
   × Contraste … > le bouton du bloc : `bg-primary text-white`, et plus la classe fantôme
     → expected 'inline-flex items-center gap-1.5 h-9 …' to contain 'text-white'
   × Contraste … > le bouton de LIGNE porte lui aussi `text-white` — même fond, même exigence
     → expected 'inline-flex items-center gap-1.5 h-8 …' to contain 'text-white'
 ❯ src/components/sessions/signature/__tests__/recapitulatif-envoi.test.tsx (22 tests | 1 failed)
   × Contraste … > « Envoyer (n) » : `bg-primary text-white`, et plus la classe fantôme
     → expected 'inline-flex items-center gap-2 px-4 p…' to contain 'text-white'
```

### Mutation 1 bis — état RED initial du jeton (avant la correction de config)

```
 ❯ src/lib/__tests__/tailwind-jeton-primary-foreground.test.ts (3 tests | 2 failed)
   × la clé existe SOUS `primary` …
     → expected [ '50', '100', '500', '600', …(3) ] to include 'foreground'
   × le texte des boutons primaires atteint le seuil AAA sur le fond normal ET sur le survol
     → TypeError: Cannot read properties of undefined (reading 'replace')
```

Le 3ᵉ test (2,12:1) était **déjà vert** : c'est lui qui prouve que le calcul de
ratio est juste avant qu'on lui demande de juger quoi que ce soit.

### Mutation 2 (exigée) — réintroduire un encart par pièce, dans la VUE

```
 ❯ src/lib/sessions/__tests__/bloc-signature-vue.test.ts (31 tests | 5 failed)
   × les blocages traversent TELS QUELS, les avertissements sont regroupés
     → expected [ { …(4) } ] to deeply equal [ { participantId: 'part-3', …(3) } ]
   × deux pièces d’un même apprenant ⇒ UNE entrée qui les liste toutes les deux
     → expected [ { …(4) }, { …(4) } ] to have a length of 1 but got 2
   × deux apprenants restent DEUX encarts …
     → expected [ 'part-cCONVENTION', 'part-fAGEFICE' ] to deeply equal [ 'part-c', 'part-f' ]
   × l’ordre des pièces est celui du référentiel, pas celui d’arrivée
     → expected [ 'AGEFICE' ] to deeply equal [ 'CONVENTION', 'AGEFICE' ]
   × la vue ne rend plus une entrée par pièce, mais une par participant
     → expected [ …(4) }, { …(4) } ] to have a length of 1 but got 2
```

### Mutation 2 bis — réintroduire un encart par pièce, dans le COMPOSANT

La mutation 2 laissait le test d'écran **vert** (il reçoit une fixture déjà
regroupée). Vérifié séparément, et il mord :

```
 ❯ src/components/sessions/signature/__tests__/bloc-signature.test.tsx (24 tests | 2 failed)
   × PUISSANCE (f) … > deux pièces incohérentes pour la même personne : UNE alerte, pas deux
     → expected 2 to be 1
   × PUISSANCE (f) … > l’encart unique NOMME les deux pièces …
     → Found multiple elements with the role "alert"
```

### Mutation 4 (exigée) — retirer l'adresse de la ligne

```
 ❯ src/components/sessions/signature/__tests__/bloc-signature.test.tsx (27 tests | 2 failed)
   × PUISSANCE (g) … > la ligne nomme le signataire ET son adresse, sans qu’on ait rien ouvert
     → expected ' Signature électronique — avant la fo…' to contain 'paul.durand@provence-immobilier.fr'
   × PUISSANCE (g) … > l’adresse COMPLÈTE reste lisible en attribut, même tronquée à l’écran
     → expected null not to be null
```

### Mutation 4 bis — repli sur un autre contact dans la cascade extraite

```
 ❯ src/lib/signature/__tests__/signataire-de-la-piece.test.ts (9 tests | 3 failed)
   × convention de GROUPE : le représentant …, à l’adresse du contact qui porte son nom
     → expected { ok: true, signataire: { …(4) } } to deeply equal { ok: true, … }
   × dossier de financement : le STAGIAIRE lui-même, à l’adresse de sa fiche
     → expected 'paul.durand@agence-martin.fr' to be 'jean.dupont@exemple.fr'
   × AUCUN REPLI sur un autre contact : sans adresse du représentant, c’est un refus nommé
     → expected true to be false
```

### Mutation 4 ter — débrancher les deux props dans `page.tsx`

**Cette mutation a révélé un trou, et c'est pour ça que je l'ai jouée** (§3,
écart n°1). Après ajout du smoke de câblage :

```
 ❯ src/lib/sessions/__tests__/fiche-session-cablage-signature.smoke.test.ts (5 tests | 2 failed)
   × le couple signataire + adresse est calculé ET passé à la vue (correction n°4)
     → expected 'import Link from \'next/link\';…' to match /signataireParCle:\s*signataireParCle\(plan\)/
   × le contexte de l’avertissement est calculé ET passé à la vue (correction n°3)
     → expected 'import Link from \'next/link\';…' to match /contexteAvertissementParParticipant,/
```

### Mutation 5 — remettre l'accord fautif dans la table

```
 ❯ src/lib/sessions/__tests__/titre-depot-signe.test.ts (8 tests | 1 failed)
   × CONVENTION : le cas signalé à l’écran, féminin pluriel
     → expected 'Déposer les convention signés' to be 'Déposer les conventions signées'
```

> ⚠ **Un test de ce fichier n'a PAS rougi, et je le dis** : « aucun titre de la
> table ne porte l'accord fautif » est resté vert, parce que sa regex
> `/ sign(é|ée)s$/` ne voit que le **singulier** « signé » — pas l'absence de
> pluriel sur le nom. Ce sont les **six tests d'égalité stricte** par type qui
> gardent l'accord ; le test générique ne garde que la forme du suffixe. Je l'ai
> laissé tel quel, en l'assumant comme secondaire, plutôt que de fabriquer une
> regex d'accord français qui serait fausse au premier cas tordu.

### Mutation 6 (exigée) — remettre le bouton de dépôt par ligne

```
 ❯ src/components/sessions/signature/__tests__/bloc-signature.test.tsx (24 tests | 3 failed)
   × PUISSANCE (d) … > pièce nominative prête : « Envoyer pour signature », et AUCUN dépôt par ligne
     → expected [ Array(1) ] to have a length of +0 but got 1
   × PUISSANCE (e) … > aucune ligne ne propose de dépôt — ni générée, ni partie en signature
     → expected [ <button …(3)></button>, …(1) ] to have a length of +0 but got 2
   × PUISSANCE (e) … > sur une pièce PARTIE, le recours reste « Annuler l’envoi » …
     → expected [ Array(1) ] to have a length of +0 but got 1
```

---

## 3. Là où quelque chose s'est révélé faux, ou a dû être dit

### ⚠ Écart n°1 — le calcul était gardé, le CÂBLAGE ne l'était pas

Les corrections n°3 et n°4 ajoutent de l'information calculée **purement** et
testée comme telle. Mais elle n'arrive à l'écran que si `page.tsx` la **passe**.
Or `page.tsx` est un composant serveur qui ouvre Prisma, Lucia et une douzaine
de modules : **il n'est pas montable en jsdom**, et aucun test existant ne le
lit. J'ai retiré les deux props à la main : **tout est resté vert.** Les deux
corrections auraient pu se perdre au premier refactor sans qu'un seul test
bouge.

**Corrigé** par `fiche-session-cablage-signature.smoke.test.ts` — même forme que
les smoke tests source du lot A. Il garde aussi la requête Prisma (`email: true`,
l'`orderBy` des contacts) et le garde-fou `aContactPrincipal`. Vérifié par
mutation ci-dessus.

**À retenir pour la suite du chantier** : sur cette fiche session, un calcul pur
testé n'est **pas** une fonctionnalité testée. Le fil compte autant que le
calcul, et rien ne le garde par défaut.

### ⚠ Écart n°2 — DEUX tests de C.2b-3 ne tenaient QUE par le bouton retiré

Vous aviez demandé de le dire plutôt que de l'adapter en silence. Le voici.

`bloc-signature.test.tsx` → `PUISSANCE (e)`, ajouté par C.2b-3 :

- « ligne ENVOYE : ouvrir "Déposer le scan" affiche l'avertissement d'annulation »
- « ligne GÉNÉRÉE (rien n'est parti) : aucun avertissement »

Les deux **cliquaient sur le bouton** pour ouvrir la modale. Sans lui,
`getByRole('button', { name: /déposer le scan/i })` lève et le test tombe pour
la mauvaise raison. Un troisième, `PUISSANCE (d)` (« les deux gestes côte à
côte »), exigeait explicitement la **coexistence** — c'est la décision n°4 que
votre correction n°6 révise.

**Les trois ont été remplacés, avec le motif écrit dans le fichier.** Les DEUX
vrais gardiens de C.2b-3 sont **intacts, `git diff` vide** :

| Fichier                                       | Tests | Ce qu'il garde                            |
| --------------------------------------------- | ----- | ----------------------------------------- |
| `signature-depot-scan.test.ts`                | 12    | `persistSignedScan` fail-closed, ordre annulation → écriture, motif d'AuditLog |
| `upload-signed-doc-dialog.confirmation.test.tsx` | 10 | l'ÉTAPE de confirmation, sur le dialogue lui-même |

### 🔴 Écart n°3 — l'étape de confirmation n'a PLUS AUCUN APPELANT

**Conséquence réelle de la correction n°6, à connaître avant le premier envoi.**

Le bloc « Signature » était le **seul** appelant à passer `envoiEnAttente` à
`<UploadSignedDocDialog>`. L'autre chemin — le menu de cellule de la matrice
(`doc-cell-menu.tsx:359`) — ne l'a **jamais** su : il monte la modale sans la
prop, qui vaut `false` par défaut.

Vous écriviez : « le dialogue de confirmation reste atteignable depuis la
cellule de la matrice ». **Le dialogue oui, l'étape de confirmation non.**
Résultat concret : déposer un scan depuis la matrice sur une pièce partie en
signature sera **REFUSÉ** par `persistSignedScan`, avec
`messageDepotAnnuleraitEnvoi` qui renvoie au bloc « Signature ».

**La règle de C.2b-3 n'est pas cassée** — le garde-fou serveur est intact et
fail-closed. C'est son **raccourci en un geste** qui disparaît. Le parcours
devient : « Annuler l'envoi » sur la ligne du bloc, **puis** déposer le scan.

Trois issues possibles, à votre arbitrage :

1. **Laisser tel quel** (état livré) — deux gestes au lieu d'un, refus explicite
   si on passe par la matrice.
2. Câbler `envoiEnAttente` dans `doc-cell-menu.tsx` — demande de faire voyager
   le statut `sent_for_signature` jusqu'à la cellule (`participantDocs` ne porte
   aujourd'hui que `{ id }`). Ce n'était pas dans ce lot.
3. Retirer aussi l'étape de confirmation du dialogue — **à ne pas faire** : le
   serveur la réclame, le dépôt échouerait partout.

**Écrit dans l'en-tête de `bloc-signature.tsx`**, pour que le prochain lecteur
ne le redécouvre pas à l'usage.

### ⚠ Écart n°4 — le récapitulatif affiche TOUJOURS un avertissement par pièce

La correction n°2 ne porte que sur le **bloc**. Dans la **modale**, les
avertissements viennent de `preparerEnvoiSignature`, donc d'`AnomalieEnvoi` —
un par pièce, avec le texte long d'origine. Les regrouper là exigerait de faire
voyager `ContexteAvertissement` **dans le contrat du moteur**, ce que la
consigne interdit.

Camille ROUSSEL apparaîtra donc **une fois** dans le bloc et **deux fois** dans
la modale, avec l'ancien texte. **Non traité, à arbitrer.**

### ⚠ Écart n°5 — un mot de votre formulation a été changé (le genre)

Voir §1, correction n°3. « alors qu'**elle** est rattachée » → « alors que **son
dossier** est rattaché ». Le genre de l'apprenant n'existe nulle part dans la
donnée.

### Écart n°6 — `VueSignature.avertissements` change de type

Il passait `AnomalieEnvoi[]`, il passe `AvertissementParticipant[]`
(`docTypes: DocTypeSignable[]` au lieu de `docType`). C'est un contrat de la
**VUE**, pas du moteur. Trois fixtures de test de C.2b-2 ont été mises à jour en
conséquence, avec le motif écrit à côté ; **aucune assertion de blocage** n'a
bougé (les blocages, eux, continuent de traverser **tels quels**, et un test le
garde explicitement).

### Écart n°7 — cinq imports du moteur sont devenus morts

Après l'extraction, `signature-envoi.ts` importait encore les quatre cascades de
`representant.ts` et `SignataireResolu` **sans les appeler**. Ni `tsc` ni
`next lint` ne le signalent. Retirés dans un commit à part : un import mort finit
par faire croire qu'une règle vit à deux endroits — exactement ce que
l'extraction sert à empêcher.

### Écart n°8 — travail concurrent dans le même worktree

Pendant l'exécution, des fichiers **non demandés** sont apparus puis ont été
commités sur la même branche par un autre agent : `participant-sponsor.ts`,
`verrou-financeur.ts`, `lien-corriger-financeur.ts` et leurs tests — c'est le
**point 7** que mon brief m'interdisait de traiter (« Corriger le financeur de
l'inscription »).

**Je n'y ai pas touché.** Un de ces fichiers a fait échouer `tsc` pendant
quelques minutes, le temps que son auteur le termine ; les trois gates
ci-dessous sont verts **avec** ce travail présent. `git log 86f9446..HEAD` mêle
donc deux chantiers : les miens sont les **12 commits `…-C2b4`**.

---

## 4. Les trois gates — sortie RÉELLE

### `pnpm lint` (relancé `--force`, cache vidé)

```
 Tasks:    3 successful, 3 total
Cached:    0 cached, 3 total
  Time:    1.65s
```

Les deux **warnings préexistants** hors périmètre, non touchés (déjà constatés
en C.2a, C.2b-1, C.2b-2 et C.2b-3) :

```
./src/app/app/parametres/page.tsx
226:17  Warning: Image elements must have an alt prop …  jsx-a11y/alt-text

./src/components/diagnostic-r1/use-autosave.ts
51:38  Warning: The ref value 'timers.current' will likely have changed …  react-hooks/exhaustive-deps
```

### `pnpm --filter @qualiof/web exec tsc --noEmit`

```
exit=0
```

### `pnpm test`

```
@qualiof/shared:test:  Test Files  15 passed (15)
@qualiof/shared:test:       Tests  195 passed (195)
@qualiof/db:test:      Test Files  3 passed (3)
@qualiof/db:test:           Tests  20 passed (20)
@qualiof/web:test:     Test Files  279 passed (279)
@qualiof/web:test:          Tests  2738 passed | 2 skipped (2740)
 Tasks:    3 successful, 3 total
```

(C.2b-3 finissait à 270 fichiers / 2612 tests côté web. Le delta inclut le
travail concurrent de l'écart n°8 ; mes 6 fichiers de test ajoutés ou étendus
apportent **+4 fichiers** et **~60 tests**.)

---

## 5. Vérifications d'intégrité — sortie RÉELLE

```
--- le moteur C.2a : plan-envoi / envoi-contrats / regime / representant ---
(vide)
--- les 2 gardiens de C.2b-3 + qualiopi-matrix.ts + upload-signed-doc-dialog.tsx ---
(vide)
--- migrations ---
(vide)
--- diff de signature-envoi.ts, hors commentaires ---
+import { formeDuDocument, resoudreSignataireClient, type FormeDocument } from …
- (suppression intégrale des deux fonctions, corps repris à l'identique)
```

### Les trois fichiers hors périmètre — jamais mis en index

```
 M packages/db/package.json
?? .planning/quick/260910-liens-publics-lisibilite.md
?? packages/db/scripts/seed-demo-signature.ts
```

Toujours modifiés / non suivis dans le répertoire de travail, **absents de mes
12 commits** (vérifié fichier par fichier).

---

## 6. Ce qui reste à vérifier à la main

1. **🔴 Le parcours de dépôt sur une pièce partie** (écart n°3). C'est la seule
   régression fonctionnelle du lot, et elle est assumée : l'admin doit désormais
   « Annuler l'envoi » **puis** déposer. À constater à l'œil, et à arbitrer.
2. **Le récapitulatif montre encore deux encarts pour Camille ROUSSEL**, avec
   l'ancien texte (écart n°4).
3. **Non testé en navigateur.** Toute la vérification est automatisée (jsdom +
   regex de source). Le rendu réel de la ligne enrichie — « libellé · signataire
   · adresse » sur une session à plusieurs pièces, en largeur contrainte — n'a
   pas été observé à l'œil. C'est précisément l'endroit où la troncature peut
   mal tomber.
4. **Le contraste a été calculé, pas photographié.** Le ratio est juste ; la
   lisibilité du `hover` sur écran réel reste à confirmer d'un coup d'œil.
5. **Point 7 non traité**, comme demandé — mais il est en cours par ailleurs sur
   cette branche (écart n°8).
6. Inchangés depuis C.2b-3 : aucun email n'est envoyé (C.2c), aucun webhook ne
   remonte le PDF signé (C.3).

---

## 7. Contraintes tenues

- Branche `feat/signature-docs-signes`, aucun worktree, **aucun `git stash`**.
- **Aucune migration.**
- **Aucun contrat moteur modifié** ; deux fonctions **privées** déplacées, à
  comportement constant — signalé au §3, écart… en fait au §1 n°4, en encadré.
- Les trois fichiers hors périmètre **jamais commités, jamais restaurés**.
- RED → GREEN, un commit par étape ; la cause (config Tailwind) et le symptôme
  (les boutons) en **deux commits séparés**, comme demandé.
- Toute assertion sur un message importe la **fonction** qui le produit
  (`composerAvertissementRegime`, `AVERTISSEMENT_DEPOT_ANNULE_ENVOI`) — aucune
  chaîne à apostrophes recopiée.
- Outillage : `@testing-library/react` + `jsdom`, en-tête
  `/* @vitest-environment jsdom */`, `beforeEach(cleanup)` explicite. **Ni**
  `jest-dom`, **ni** `user-event`.
- Français partout.

---

## Commits

| Hash      | Message                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `b787cc9` | `test(signature-C2b4): text-primary-foreground ne produit aucune règle CSS — tests RED` |
| `98f9695` | `fix(signature-C2b4): définir primary.foreground — la classe fantôme répare 12 fichiers d'un coup` |
| `b025629` | `fix(signature-C2b4): contraste AAA sur les trois boutons d'envoi en signature`    |
| `6eaefb6` | `test(signature-C2b4): un seul encart par participant, texte court — tests RED`    |
| `15397a3` | `feat(signature-C2b4): un encart par participant, et un texte qui dit quoi corriger` |
| `80546aa` | `test(signature-C2b4): « Déposer les convention signés » — accord fautif — tests RED` |
| `0cb629e` | `fix(signature-C2b4): « Déposer les conventions signées » — une table, pas une concaténation` |
| `dbd3584` | `test(signature-C2b4): aucune ligne ne propose plus de dépôt de scan — tests RED`  |
| `6141fb2` | `fix(signature-C2b4): plus aucun dépôt de scan par ligne dans le bloc Signature`   |
| `71931fd` | `test(signature-C2b4): qui signe et à quelle adresse, sur la LIGNE — tests RED`    |
| `b39ac18` | `feat(signature-C2b4): qui signe et à quelle adresse, lisible sur la ligne`        |
| `bbb8558` | `refactor(signature-C2b4): retire du moteur les imports morts après l'extraction`  |

## Self-Check: PASSED

Les 4 fichiers créés annoncés existent sur disque ; les 12 commits existent dans
`git log`. Les 3 fichiers hors périmètre sont toujours hors index.
