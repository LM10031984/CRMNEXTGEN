---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-8
subsystem: signature-electronique
tags: [signature, signataires, ordre, of, page-session, tests-mutation]
requires:
  - quick-260910-c2b-7 # ordre-signataires.ts, SignataireOfPrevu, ordre au récapitulatif
  - quick-260910-c2b-6 # LigneSignature.signataire sur la ligne
  - lot-C.2a # le moteur envoie DEUX signataires sur CONVENTION et ASSIDUITE
provides:
  - "chaque LIGNE du bloc Signature porte « 1. client · 2. OF », avant tout clic"
  - "`resoudreSignataireOf` appelable hors `'use server'` — une seule résolution"
  - "un test qui garde le FIL entre `page.tsx` et les lignes (le trou mesuré)"
affects:
  - "`LigneSignature` gagne `ordre` (requis) ; `construireVueSignature` gagne `signataireOf` (optionnel)"
  - "`signature-envoi.ts` perd sa fonction privée `resoudreSignataireOf` — DÉPLACÉE, pas dupliquée"
  - "`page.tsx` fait une requête `Tenant` de plus, une seule, pour les deux scopes"
key-files:
  created:
    - apps/web/src/lib/signature/signataire-of.ts
    - apps/web/src/lib/signature/__tests__/signataire-of.source.test.ts
  modified:
    - apps/web/src/lib/sessions/bloc-signature-vue.ts
    - apps/web/src/lib/sessions/ordre-signataires.ts
    - apps/web/src/components/sessions/signature/bloc-signature.tsx
    - apps/web/src/components/sessions/signature/recapitulatif-envoi.tsx
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/server/actions/signature-envoi.ts
    - apps/web/src/lib/sessions/__tests__/bloc-signature-vue.test.ts
    - apps/web/src/components/sessions/signature/__tests__/bloc-signature.test.tsx
metrics:
  tasks: 3
  commits: 3
  mutations: 5
  tests_ajoutes: 18
---

# Quick C.2b-8 : l'ordre complet sur la ligne, pas seulement dans la modale

Une demande, tranchée par Laurent après relecture d'écran le 11/09/2026 :
« chaque LIGNE du bloc Signature doit montrer l'ordre complet ». Le lot
précédent l'avait signalée comme hors énoncé, faute d'accès au signataire OF
depuis `LigneSignature` ; Laurent a tranché le chemin : **par `page.tsx`**.

## Ce qui change à l'écran

Avant, sur la ligne :

```
Convention — Provence Immobilier (2 participants) · signataire : Paul DURAND · paul.durand@…
```

Après :

```
Convention — Provence Immobilier (2 participants)
Ordre de signature : 1. Paul DURAND — paul.durand@provence-immobilier.fr ·
                     2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM
```

Et sur la ligne AGEFICE d'un TNS, **un seul rang** — son exemplaire officiel
porte déjà l'image de signature de l'organisme.

C'est **la même phrase que le récapitulatif**, au caractère près : le libellé
(« Ordre de signature ») et le séparateur (` · `) ont été exportés de
`ordre-signataires.ts` plutôt que réécrits dans le JSX. Deux formulations pour
la même information sur deux écrans, c'est précisément ce que ce lot corrige —
autant ne pas le réintroduire par la porte du libellé.

## Qui décide quoi — la chaîne, inchangée

Rien de nouveau n'a été décidé. La ligne interroge la même chaîne que le
récapitulatif, et qu'`envoi-contrats.ts` avant lui :

```
page.tsx              → resoudreSignataireOf(tenantId)      (LA résolution, une fois)
  → construireVueSignature({ …, signataireOf })
      → ordreSignatairesPrevu({ docType, client, of })       (LA composition, C.2b-7)
          → ofSigneLaPiece(docType) → ANCRES_PAR_PIECE       (LA règle, lecture des gabarits)
→ <BlocSignature>  rend `s.texte` tel quel                   (aucune règle, aucune phrase)
```

Aucune seconde table, aucun `if (docType === 'AGEFICE')`, aucune composition de
texte dans le JSX. Le composant ne sait pas que l'AGEFICE n'a qu'un signataire :
il reçoit un tableau d'un élément.

## La contrainte « une seule résolution » — comment elle est tenue

`resoudreSignataireOf` vivait en **fonction privée** de `signature-envoi.ts`.
Elle ne pouvait donc servir qu'au moteur : ce fichier porte `'use server'`, où
tout export devient une server action. `page.tsx` n'avait aucun chemin vers
elle.

Elle a été **déplacée** dans `apps/web/src/lib/signature/signataire-of.ts`, et
`signature-envoi.ts` l'importe désormais **lui aussi**. La projection
d'affichage (`{ nom, email, ordre }`) qui vivait en ligne dans l'action est
devenue `signataireOfPrevu()`, appelée par les deux.

Pourquoi pas une recopie : `resolveTenantSignatory` n'est pas un `SELECT` — ce
qui est saisi en base gagne, sinon on retombe sur le responsable OF (`OF_RESP_*`,
D-01 hybride). Deux recopies de cette cascade divergent au premier changement de
règle, et l'écran finirait par annoncer un signataire différent de celui qui
reçoit le lien.

`resolveTenantSignatory`, `ANCRES_PAR_PIECE`, `ordre-signataires.ts`,
`plan-envoi.ts` et la construction des `signers` n'ont pas bougé d'une ligne de
logique.

## Le trou que la mesure a trouvé — et qui n'était pas dans l'énoncé

Les trois mutations demandées rougissent. Une quatrième, jouée par acquit de
conscience, ne rougissait **pas** : retirer `signataireOf:` de l'appel de
`page.tsx`. L'organisme disparaît alors de **toutes** les lignes en production,
et **95 tests restent verts** — `signataireOf` étant optionnel côté vue, elle
continue de se construire sans lui.

C'est exactement le défaut que Laurent traque depuis dix tests : une promesse
dont le maillon central n'est gardé par personne. Un cinquième fichier de test
a donc été ajouté (`signataire-of.source.test.ts`), test de SOURCE assumé comme
tel : ce qu'il garde vit dans un composant serveur de 1900 lignes, Prisma et
`validateRequest` en tête, non montable en jsdom. Il vérifie trois choses :

1. `page.tsx` **et** `signature-envoi.ts` passent par `@/lib/signature/signataire-of` ;
2. ni l'un ni l'autre ne relit `Tenant.signatory*` (la seconde cascade interdite) ;
3. `page.tsx` passe bien `signataireOf` à la vue, et résout **une** fois, pas une
   par scope.

L'alternative — rendre `signataireOf` **obligatoire** dans
`construireVueSignature`, ce qui aurait fait de la mutation une erreur `tsc` —
a été écartée : elle imposait `signataireOf: null` à 16 appels de test dont la
promesse ne concerne pas l'organisme (état des pièces, envoyabilité,
avertissements). Du bruit là où il n'y a rien à garder.

## Mutations — sortie réelle

### (a) L'OF disparaît des lignes CONVENTION / ASSIDUITE

Jouée de **deux** façons, parce que la règle a deux points d'attaque :

```
# `construireVueSignature` passe `of: null`
   × la convention porte DEUX rangs, dans la forme dictée — au mot près
   × l’attestation d’assiduité aussi — c’est la pièce que le lot B vient de brancher
   × PUISSANCE — `BEFORE` inverse RÉELLEMENT les rangs de la ligne
   × la ligne s’écrit EXACTEMENT comme au récapitulatif — séparateur compris
   × PUISSANCE (h) — la ligne écrit les DEUX rangs, dans la forme du récapitulatif
 Tests  5 failed | 90 passed (95)

# l’OF retiré de `ANCRES_PAR_PIECE` (CONVENTION et ASSIDUITE)
   × (les cinq mêmes)
 Tests  5 failed | 90 passed (95)
```

### (b) L'AGEFICE se met à afficher deux signataires

```
# garde `ofSigneLaPiece(a.docType) ? a.of : null` remplacée par `a.of`
   × le dossier AGEFICE n’en porte QU’UN — son exemplaire a déjà la signature de l’OF
   × PUISSANCE (h) — le dossier AGEFICE n’annonce QU’UN signataire sur sa ligne
 Tests  2 failed | 93 passed (95)
```

### (c) La numérotation s'inverse

```
# `const ofAvant = of !== null && of.ordre === 'AFTER'`  (au lieu de 'BEFORE')
   × la convention porte DEUX rangs, dans la forme dictée — au mot près
   × l’attestation d’assiduité aussi — c’est la pièce que le lot B vient de brancher
   × PUISSANCE — `BEFORE` inverse RÉELLEMENT les rangs de la ligne
   × la ligne s’écrit EXACTEMENT comme au récapitulatif — séparateur compris
   × PUISSANCE (h) — la ligne écrit les DEUX rangs, dans la forme du récapitulatif
 Tests  5 failed | 90 passed (95)
```

### (d) `page.tsx` cesse de câbler l'OF — la mutation qui ne rougissait pas

```
# `signataireOf: signataireOfDeLOrganisme` retiré de l’appel
--- tests de COMPORTEMENT seuls (ce qu’ils ne voyaient pas) ---
 Tests  95 passed (95)                       ← AUCUN rouge
--- après ajout du test de SOURCE ---
   × la fiche session passe `signataireOf` à `construireVueSignature`
 Tests  1 failed | 4 passed (5)
```

### (e) Une SECONDE résolution dans `page.tsx`

```
# `prisma.tenant.findUnique({ select: { signatoryName, signatoryEmail } })` recopié
   × PUISSANCE — ni l’un ni l’autre ne relit les colonnes `Tenant.signatory*`
   × il est résolu UNE fois, pas une fois par scope (Avant / Après)
 Tests  2 failed | 3 passed (5)
```

**5 mutations, 5 rouges** — dont une qui ne l'était pas avant d'écrire le
cinquième test, et c'est le vrai apport de ce lot.

### Le piège des assertions qui collapsent

- Les textes sont comparés à des **chaînes littérales** :
  `'1. Paul DURAND — paul.durand@provence-immo.fr'`,
  `'2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM'`.
  Jamais au retour de `texteOrdreSignataires` ni d'un helper de composition.
- Le test DOM construit sa vue par le **vrai chemin**
  (`construireVueSignature` → `ordreSignatairesPrevu` → `ANCRES_PAR_PIECE`). Un
  `ordre` écrit en dur dans le fixture serait resté vert sous la mutation (a).
- `toHaveLength(1)` sur l'AGEFICE est asserté **séparément** du contenu :
  « exactement un » est la promesse, pas un effet de bord d'un `toEqual`.
- Le fixture `ligne()` **dérive** son `ordre` du module testé plutôt que de le
  recopier — sauf au cas « client non résolu », où `ordre: []` est écrit
  explicitement pour ne pas traîner l'ordre d'un `...SIGNEE` dont on vient de
  retirer le signataire. Que « client non résolu ⇒ aucun rang » soit bien ce que
  la VUE calcule est gardé, lui, par `bloc-signature-vue.test.ts`.

## Deux tests ajoutés qui passaient déjà — dit franchement

`l’adresse du client reste COMPLÈTE en attribut` et `signataire client non
résolu : la ligne le DIT` étaient verts avant l'implémentation. Ils ne sont pas
là pour rougir, mais pour **empêcher que la nouvelle mise en page ne les
défasse** : la ligne étant passée d'une chaîne à une liste d'éléments, le
`title` portant l'adresse complète (correction n°4) et le repli « signataire à
déterminer » pouvaient disparaître sans bruit.

## Ce qui n'est PAS défait

Vérifié par les 45 tests du bloc et les 31 du récapitulatif, tous verts :

- libellé « organisation commanditaire » dans les avertissements ;
- avertissement à **deux** destinations (fiche organisation / formulaire
  d'inscription) ;
- zone de dépôt **fusionnée et repliée** dans le bloc, `depotAutorise` distinct
  de `canSign` ;
- lien « Signer maintenant » conditionné au `signedAt` du **CLIENT** ;
- `LigneSignature.signataire` conservé : c'est lui qui alimente le rang 1, et
  ses deux tests de vue n'ont pas bougé.

## Gates — sortie réelle

```
######## GATE 1 — pnpm lint --force ########
 Tasks:    3 successful, 3 total
Cached:    0 cached, 3 total
(2 warnings PRÉEXISTANTS, hors périmètre et inchangés :
 parametres/page.tsx:226 jsx-a11y/alt-text,
 diagnostic-r1/use-autosave.ts:51 react-hooks/exhaustive-deps)

######## GATE 2 — tsc --noEmit (@qualiof/web) ########
exit=0

######## GATE 3 — pnpm test --force (sans cache) ########
@qualiof/shared:test:  Test Files  15 passed (15)     Tests  195 passed (195)
@qualiof/db:test:      Test Files   3 passed (3)      Tests   20 passed (20)
@qualiof/web:test:     Test Files 283 passed (283)    Tests 2836 passed | 2 skipped (2838)
 Tasks:    3 successful, 3 total
Cached:    0 cached, 3 total
```

(2818 → 2836 : +18 tests, dont 7 sur la vue, 6 sur le DOM, 5 sur le fil.)

## Commits

| Hash      | Objet                                                                |
| --------- | -------------------------------------------------------------------- |
| `195dbc4` | `test` chaque LIGNE doit porter l'ordre complet — tests RED (11 rouges) |
| `fab9cea` | `feat` l'ordre complet « 1. client · 2. OF » sur chaque ligne du bloc |
| `3eba770` | `test` le FIL entre `page.tsx` et les lignes, et la résolution unique |

## À vérifier à la main

1. **Onglet Avant, session avec convention d'entreprise** : chaque ligne doit
   lire « Ordre de signature : 1. … · 2. … (organisme de formation), signe en
   dernier depuis le CRM ». Ouvrir le récapitulatif : **même phrase**.
2. **Un TNS AGEFICE** : sa ligne « Dossier AGEFICE — … » ne doit afficher
   qu'« 1. », sans aucune mention de l'organisme.
3. **Paramètres organisme, signataire vidé** : les lignes doivent retomber sur
   le seul client, sans « organisme inconnu » ; le récapitulatif, lui, rend
   l'empêchement `SIGNATAIRE_OF_INCOMPLET` qui nomme le réglage manquant.
4. **Lisibilité** : la ligne d'ordre est en `text-xs` sous le libellé et passe à
   la ligne (`break-words`). Sur une convention de groupe au nom long, vérifier
   qu'elle ne pousse ni la pastille d'état ni les boutons hors du cadre.

## Ce qui reste ouvert

- `signataireOf` reste **optionnel** dans `construireVueSignature`. Un futur
  appelant pourrait l'oublier sans erreur `tsc` ; c'est le test de source qui
  garde le seul appelant existant. Le jour où un second écran construit cette
  vue, rendre le paramètre obligatoire deviendra le bon geste.
- Le lien « Signer maintenant » de l'organisme reste inatteignable tant que le
  webhook du lot C.3 ne remplit pas `signedAt` — inchangé, et toujours écrit à
  l'écran.
- `.planning/quick/260910-liens-publics-lisibilite.md` reste **non suivi**, hors
  périmètre, non commité.

## Self-Check: PASSED

- `apps/web/src/lib/signature/signataire-of.ts` — FOUND
- `apps/web/src/lib/signature/__tests__/signataire-of.source.test.ts` — FOUND
- commits `195dbc4`, `fab9cea`, `3eba770` — FOUND
