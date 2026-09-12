---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-7
subsystem: signature-electronique
tags: [signature, signataires, ordre, of, depot-scan, libelles, tests-mutation]
requires:
  - quick-260910-c2b-6 # bloc-signature-vue, deux destinations, contrats d'URL
  - quick-260910-c2b-bis # EnvoiEffectue.signUrl exposé à l'écran résultat
  - lot-A-signature # <SignedDocDropZone>, uploadSignedScans
provides:
  - "l'attestation d'assiduité a enfin une assertion qui garde ses DEUX signataires"
  - "l'ordre complet des signataires s'affiche au récapitulatif ET au résultat"
  - "le lien « Signer maintenant » de l'OF, adossé au `signedAt` du client"
  - "l'écran résultat porte des libellés, plus des clés de plan"
  - "une SEULE zone de dépôt, repliée dans le bloc « Signature électronique »"
affects:
  - "`EnvoiPrepare` et `EnvoiEffectue` gagnent 3 champs d'affichage (additifs)"
  - "`<BlocSignature>` gagne 4 props optionnelles et cesse d'être muet sans lignes"
  - "`<SignedDocDropZone>` gagne `titre` et `aide` (optionnelles, défaut inchangé)"
  - "les onglets Avant/Après ne montent plus aucune zone de dépôt"
key-files:
  created:
    - apps/web/src/lib/sessions/ordre-signataires.ts
    - apps/web/src/lib/sessions/__tests__/ordre-signataires.test.ts
  modified:
    - apps/web/src/lib/signature/envoi-contrats.ts
    - apps/web/src/server/actions/signature-envoi.ts
    - apps/web/src/components/sessions/signature/recapitulatif-envoi.tsx
    - apps/web/src/components/sessions/signature/bloc-signature.tsx
    - apps/web/src/components/sessions/qualiopi-matrix/signed-doc-drop-zone.tsx
    - apps/web/src/components/sessions/tabs/tab-avant.tsx
    - apps/web/src/components/sessions/tabs/tab-apres.tsx
    - apps/web/src/lib/sessions/titre-depot-signe.ts
    - apps/web/src/server/actions/__tests__/signature-envoi.test.ts
    - apps/web/src/components/sessions/signature/__tests__/recapitulatif-envoi.test.tsx
    - apps/web/src/components/sessions/signature/__tests__/bloc-signature.test.tsx
    - apps/web/src/components/sessions/qualiopi-matrix/__tests__/signed-doc-drop-zone.smoke.test.ts
    - apps/web/src/lib/sessions/__tests__/titre-depot-signe.test.ts
metrics:
  tasks: 4
  commits: 5
  mutations: 14
  tests_ajoutes: 39
---

# Quick C.2b-7 : qui signe, dans quel ordre, et où rentre le papier

Quatre demandes de Laurent après vérification d'écran le 11/09/2026, traitées
en un seul lot — les quatre touchaient les mêmes fichiers.

**Le moteur n'a pas été corrigé, parce qu'il n'avait rien de faux.** Le
soupçon (« l'OF n'apparaît nulle part comme signataire ») portait sur
l'affichage : les envois réellement enregistrés en base montrent bien
`CONVENTION → 2 signataires, Client puis Organisme de formation` et
`AGEFICE → 1 signataire`. Le seul ajout côté moteur est le passage de trois
informations qu'il avait DÉJÀ sous la main mais ne remontait à aucun écran.
Elles sont listées plus bas, sous « Ce qui manquait à la vue ».

## 1. Ce que les tests ne gardaient pas — mesure avant écriture

Laurent demandait ces tests en supposant qu'aucun n'existait. La mesure dit
autre chose, et c'est plus utile que la supposition :

| Pièce          | Avant ce lot | Mutation jouée                          | Résultat        |
| -------------- | ------------ | --------------------------------------- | --------------- |
| **CONVENTION** | gardée       | OF retiré de `ANCRES_PAR_PIECE`         | 1 failed / 17 ok |
| **AGEFICE**    | gardé        | second signataire ajouté                | 1 failed / 17 ok |
| **ASSIDUITE**  | **RIEN**     | OF retiré de `ANCRES_PAR_PIECE`         | **277 fichiers, 2760 tests VERTS** |

L'attestation d'assiduité — la pièce que le lot B vient justement de brancher —
n'avait pas une seule assertion. Le test manquant est écrit ; les deux autres
sont durcis d'un `toHaveLength` asserté **séparément** du contenu, pour que
« exactement un » et « exactement deux » soient la promesse et non un effet de
bord de `toEqual`.

Une quatrième mutation a été jouée, celle que Laurent redoutait vraiment — le
refactor qui retire le `signers.push` de l'OF **dans le moteur** plutôt que
dans la table : **2 failed / 16 ok**. Les deux pièces à double signature
rougissent ensemble.

## 2. L'ordre complet, aux deux écrans

**Récapitulatif, avant le clic** — « Signera : Paul MARTIN » devient :

```
Ordre de signature : 1. Paul MARTIN — paul@agence-martin.fr ·
                     2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM
Paul MARTIN — nom : représentant de l’organisation · adresse : fiche du contact
```

**Écran résultat** — même liste, numérotée, en `<ol>` : le lien à copier sur la
ligne du client, « Signer maintenant » sur celle de l'organisme.

La composition vit dans `apps/web/src/lib/sessions/ordre-signataires.ts`, pur et
sous test unitaire. Il **n'invente pas** qui signe : il interroge
`ofSigneLaPiece(docType)`, c'est-à-dire la table `ANCRES_PAR_PIECE`, lecture des
gabarits. Une seconde table serait la septième règle en dur que `regime.ts` a
supprimée, et l'écran finirait par annoncer un ordre différent de celui qui part.

Deux abstentions volontaires, testées :

- **OF non résolu** → une seule ligne. L'empêchement `SIGNATAIRE_OF_INCOMPLET`
  dit déjà quel réglage manque ; « (organisme inconnu) » ferait chercher autre
  chose.
- **client non résolu** → **aucune** ligne. Numéroter l'OF « 1. » puis écrire
  « signe en dernier » produirait une ligne qui se contredit elle-même.

### La contrainte du lot C.3, traitée et dite

« Dès que le client a signé » suppose de SAVOIR qu'il a signé. Cette
information vient du webhook, livré au lot C.3 : d'ici là
`SignatureRequest.signers[].signedAt` reste nul et `status` reste `SENT`.

Le lien est donc adossé à la **donnée** — le `signedAt` du signataire CLIENT —
et jamais au fait d'avoir envoyé. Tant qu'il est nul, le lien n'est **pas dans
le DOM**, et l'écran écrit à sa place :

> Le lien « Signer maintenant » s'ouvrira ici quand Paul MARTIN aura signé.
> QualiOF n'apprend une signature que par le retour du prestataire, branché au
> lot C.3 : tant qu'il ne l'est pas, cet état ne changera pas tout seul sur cet
> écran — c'est chez le prestataire qu'il se constate.

**Pourquoi `signedAt` du client plutôt que le statut `PARTIALLY_SIGNED`.** Les
deux disent presque la même chose. Pas tout à fait : si l'organisme signe en
premier (`signatoryOrder: 'BEFORE'`, prévu par D-3 et honoré par le moteur), la
demande est `PARTIALLY_SIGNED` alors que le client n'a rien signé — et c'est
l'OF qui n'a plus rien à faire. La date du signataire concerné est strictement
plus juste que le statut de la demande, et c'est **une** règle au lieu de deux.

Une seconde absence est distinguée de la première, parce qu'elle n'appelle pas
le même geste : client signé mais aucun lien rendu par le prestataire →
« ouvrez la demande chez lui pour signer », pas « patientez ».

## 3. Des libellés, pas des identifiants

- L'en-tête de chaque pièce au résultat : `CONVENTION:org-1` → **« Convention —
  AGENCE MARTIN (2 participants) — envoyée en signature »**.
- L'`aria-label` du bouton de copie aussi : un lecteur d'écran annonçait
  « Copier le lien — CONVENTION:org-1 ». L'attribut `id` du champ, lui, garde la
  clé : il n'est pas lu, et elle est la seule valeur unique disponible.
- `LIBELLE_SOURCE_EMAIL.CONTACT_NOMME` : « contact portant ce nom » →
  **« fiche du contact »**. La première formule décrivait la MÉCANIQUE de la
  cascade — on a cherché un contact du même nom — là où les deux autres
  (« fiche de la personne », « adresse saisie à l'instant ») nomment un endroit
  où aller vérifier. Trois provenances côte à côte doivent répondre à la même
  question : « où est cette adresse, si je veux la corriger ? »

## 4. Une seule zone de dépôt

Les onglets Avant et Après ne montent plus aucune zone. Le bloc « Signature
électronique » en porte une, **repliée**, sous ses lignes :

```
▸ Exemplaire signé à la main ?
  Glissez le PDF : il sera rattaché au participant dont le nom figure dans le
  nom du fichier, sinon vous choisissez dans la liste. Vous pouvez aussi le
  déposer directement sur la cellule du participant dans la matrice.

  Les pièces envoyées en signature électronique n'ont pas à passer par ici :
  elles reviendront automatiquement une fois signées, dès que le retour du
  prestataire sera branché (lot C.3). Cette zone ne sert qu'au papier.
```

**Pourquoi cette fusion.** Les deux chemins vers la même preuve s'EXCLUENT : un
scan déposé sur une pièce partie en signature annule l'envoi chez le
prestataire, et `persistSignedScan` le refuse sans confirmation explicite
(décision n°4, garde fail-closed de C.2b-3). Deux gestes qui s'annulent l'un
l'autre ne peuvent pas vivre dans deux coins différents de l'écran. La mention
sur le retour automatique tient la même corde par l'autre bout : sans elle,
l'admin qui vient d'envoyer une convention dépose aussi son scan, et défait son
propre envoi.

### Deux conséquences traitées, pas subies

1. **Le bloc ne se tait plus dès que le plan est vide.** Une session 100 % OPCO
   n'a rien à faire e-signer, mais elle a des feuilles d'émargement à rentrer.
   `muet` inclut désormais « rien à déposer » — sinon la fusion aurait supprimé
   le seul endroit où les déposer.
2. **Le droit est `canWrite`, pas `vue.canSign`.** Le premier inclut
   COMMERCIAL, le second non (`ADMIN | MANAGER`). Gater le dépôt sur le droit
   d'ENVOI aurait retiré à un commercial un geste qu'il faisait hier —
   régression invisible, aucun test ne l'aurait vue. D'où la prop
   `depotAutorise`, distincte, que chaque onglet alimente avec son propre flag.

### Ce qui n'est PAS défait

`titreDepotSigne` (correction n°5, lot C.2b-6) reste en service. La question de
Laurent devient l'**en-tête** ; le titre par type descend **là où les fichiers
atterrissent** — « Déposer les feuilles d'émargement signées », qui suit
toujours le `<select>`. Un test DOM le vérifie désormais en changeant le type,
là où le lot précédent n'avait qu'une regex de source : « Déposer les
convention signés » ne peut pas revenir par cette porte.

### Le test de la promesse « une seule zone »

C'est un **balayage**, pas trois `expect` nommés : la promesse n'est pas
« tab-avant n'en a plus », c'est « il n'en reste **nulle part** ailleurs ». Un
test qui nommerait les deux onglets d'aujourd'hui resterait vert le jour où un
troisième écran en rajouterait une. Le test liste tous les `.tsx` sous
`components/sessions/`, écarte le fichier qui la DÉFINIT (son en-tête la cite,
et une citation n'est pas un second endroit où déposer) et exige que l'unique
monteur soit `signature/bloc-signature.tsx`.

## Ce qui manquait à la vue — signalé, comme demandé

Le moteur résolvait l'OF et l'envoyait au prestataire depuis C.2a, mais ne le
REMONTAIT à aucun écran. Trois champs ont été ajoutés au contrat
(`envoi-contrats.ts`) et remplis **à partir de ce que le moteur avait déjà sous
la main** — aucune règle nouvelle, aucune requête de plus, aucun changement de
comportement d'envoi :

| Champ                          | D'où il vient                                       | Pourquoi il ne pouvait pas rester dans la vue |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------- |
| `EnvoiPrepare.signataireOf`    | `resoudreSignataireOf`, déjà appelé une fois         | Seul chemin vers `Tenant.signatory*` + `of-config`. Le résoudre côté client serait une SECONDE résolution — l'écran finirait par annoncer un signataire différent de celui qui reçoit le lien. |
| `EnvoiEffectue.libelle`        | `envoi.libelle`, déjà dans le plan et `EnvoiPrepare` | Il ne traversait simplement pas l'envoi. La vue n'a que la `cle`, qui n'est pas un libellé. |
| `EnvoiEffectue.signataires[]`  | croisement `signers` (envoyé, trié) × `creation.signers` (rendu) | `signedAt` et le `signUrl` de l'OF n'existent que dans la réponse du prestataire. Aucun chemin de lecture ne les exposait. |

`EnvoiEffectue.signUrl` (livré en C.2b-bis) **n'est pas retiré** : il devient
une projection de `signataires`, calculée une seule fois côté moteur. Deux
`find` sur la même intention finiraient par diverger — et c'est le lien de
signature, on ne peut pas en afficher deux versions.

`ANCRES_PAR_PIECE`, `plan-envoi.ts`, `regime.ts`, `representant.ts` et la
construction des `signers` n'ont pas bougé d'une ligne.

## Mutations — sortie réelle

### Demande 1 — les signataires par pièce

```
OF retiré de CONVENTION       → Tests  1 failed | 17 passed (18)
OF retiré de ASSIDUITE        → Tests  1 failed | 17 passed (18)
2e signataire sur AGEFICE     → Tests  1 failed | 17 passed (18)
`signers.push` de l'OF retiré → Tests  2 failed | 16 passed (18)
```

### Demande 2 — l'ordre et le lien de l'OF

```
« Signer maintenant » sans attendre la signature du client → Tests  2 failed | 45 passed (47)
l'OF retiré de l'ordre affiché                            → Tests  5 failed | 42 passed (47)
le lien de l'OF pointe l'URL du CLIENT                    → Tests  1 failed | 46 passed (47)
```

### Demande 3 — libellés

```
retour à l'identifiant technique (en-tête + aria-label) → Tests  2 failed | 45 passed (47)
« contact portant ce nom » remis                        → Tests  2 failed | 45 passed (47)
```

### Demande 4 — la zone unique

```
une SECONDE zone remise dans l'onglet Après        → Tests  2 failed | 459 passed (461)
la section n'est plus repliée                      → Tests  5 failed | 456 passed (461)
la mention « retour automatique » retirée          → Tests  1 failed | 460 passed (461)
le bloc redevient muet quand il n'a que la zone    → Tests  1 failed | 460 passed (461)
l'aide reformulée (« au mot près » cassé)          → Tests  1 failed | 460 passed (461)
```

**14 mutations, 14 rouges.** Aucune n'est restée verte.

### Le piège des assertions qui collapsent, et comment il a été évité

Laurent signalait NEUF tests de ce chantier qui ne gardaient rien, dont un dont
l'assertion comparait l'href au retour du constructeur testé. Deux précautions
ont été prises ici :

- Les textes composés (`1. Paul DURAND — … · 2. Laurent MARX (organisme de
  formation), signe en dernier depuis le CRM`) sont comparés à des **chaînes
  littérales**, jamais au retour d'un helper.
- L'URL du lien « Signer maintenant » est comparée à
  `'https://docuseal.eu/s/le-lien-de-l-of'` **écrit en toutes lettres**, et
  explicitement `not.toBe` celle du client. Comparer au `signUrl` de la fixture
  serait passé même si le composant avait rendu le lien du client.
- Les trois chaînes de la zone de dépôt sont **importées** par le test du
  composant (garde : « c'est ce texte-là qui s'affiche ») mais leur **valeur**
  est gardée littéralement dans `titre-depot-signe.test.ts`. La mutation qui
  réécrit l'aide fait rougir le second, pas le premier — c'est exactement la
  répartition voulue.

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
@qualiof/shared:test:  Test Files  15 passed (15)       Tests  195 passed (195)
@qualiof/db:test:      Test Files   3 passed (3)        Tests   20 passed (20)
@qualiof/web:test:     Test Files 282 passed (282)      Tests 2818 passed | 2 skipped (2820)
 Tasks:    3 successful, 3 total
```

## Commits

| Hash      | Objet                                                                  |
| --------- | ---------------------------------------------------------------------- |
| `bbcd766` | `test` l'assiduité aussi a DEUX signataires — le trou est comblé       |
| `05c71c3` | `test` l'ordre complet et le lien de l'OF — tests RED                  |
| `66b9821` | `feat` l'ordre complet aux deux écrans, et le libellé au résultat      |
| `345c565` | `test` une seule zone de dépôt, dans le bloc Signature — tests RED     |
| `0cafbc6` | `feat` une seule zone de dépôt, repliée dans le bloc Signature         |

## À vérifier à la main

1. **Onglet Avant, session avec convention d'entreprise** : le récapitulatif
   doit annoncer les DEUX signataires numérotés, et le dossier AGEFICE d'un TNS
   n'en annoncer qu'UN.
2. **Après un envoi réel** : l'écran résultat titre « Convention — … (n
   participants) », le lien du client est copiable, et sous l'organisme se lit
   la phrase d'attente (le lien ne s'ouvrira pas : le webhook n'est pas branché).
3. **Les deux onglets** : plus aucune zone de dépôt hors du bloc « Signature
   électronique ». Déplier « Exemplaire signé à la main ? », changer le type,
   vérifier que le titre interne suit (« Déposer les attestations d'assiduité
   signées »).
4. **Avec un compte COMMERCIAL** : la zone de dépôt doit rester accessible,
   alors que le bouton « Envoyer pour signature » ne l'est pas.

## Ce qui reste ouvert

- Le lien « Signer maintenant » ne s'affichera **jamais** tant que le lot C.3
  n'est pas livré : rien ne remplit `signedAt`. C'est écrit à l'écran, et c'est
  le comportement voulu — mais cela signifie que ce chemin ne peut pas être
  vérifié à la main avant C.3. Il est couvert par les tests, fixture à
  `signedAt` non nul.
- Le bloc « Signature » ne montre pas encore l'ordre des signataires sur ses
  LIGNES (seulement le signataire client, livré en C.2b-6). L'énoncé ne le
  demandait pas ; `LigneSignature` n'a d'ailleurs aucun accès au signataire OF
  aujourd'hui — il faudrait le faire passer par `page.tsx`.

## Self-Check: PASSED
