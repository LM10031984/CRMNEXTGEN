---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-2
subsystem: signature-electronique
tags: [signature, ecran-envoi, recapitulatif, annulation, regime-financement]
requires:
  - quick-260910-c1r    # regime.ts + les 3 colonnes SignerRole d'OpcoCatalog
  - quick-260910-c2a    # plan-envoi.ts, envoi-contrats.ts, preparerEnvoiSignature, sendForSignature
  - quick-260910-c2b-1  # participants-regime.ts, catalogue-regime.ts, annulerEnvoiSignature, EnvoiEffectue.signUrl
provides:
  - "bloc-signature-vue.ts — la vue PURE : lignes, états, bouton visible ou non"
  - "bloc-signature.tsx — l'avertissement « régime incohérent » enfin AFFICHÉ, nominatif"
  - "le bouton « Envoyer pour signature », ABSENT du DOM quand il n'y a rien à envoyer"
  - "le bouton « Annuler l'envoi » — annulerEnvoiSignature avait zéro appelant"
  - "recapitulatif-envoi.tsx — aperçu du PDF exact, adresse dérogatoire, refus rendu tel quel, signUrl copiable"
affects:
  - "apps/web/src/app/app/sessions/[id]/page.tsx"
  - "apps/web/src/components/sessions/tabs/tab-avant.tsx"
  - "apps/web/src/components/sessions/tabs/tab-apres.tsx"
key-files:
  created:
    - apps/web/src/lib/sessions/bloc-signature-vue.ts
    - apps/web/src/lib/sessions/__tests__/bloc-signature-vue.test.ts
    - apps/web/src/components/sessions/signature/bloc-signature.tsx
    - apps/web/src/components/sessions/signature/__tests__/bloc-signature.test.tsx
    - apps/web/src/components/sessions/signature/recapitulatif-envoi.tsx
    - apps/web/src/components/sessions/signature/__tests__/recapitulatif-envoi.test.tsx
  modified:
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - apps/web/src/components/sessions/tabs/tab-avant.tsx
    - apps/web/src/components/sessions/tabs/tab-apres.tsx
    - apps/web/src/components/sessions/tabs/__tests__/avant-tab-actions.test.tsx
    - apps/web/src/components/sessions/tabs/__tests__/apres-session-docs.test.tsx
    - .planning/specs/2026-09-04-signature-electronique-docs-signes.md
metrics:
  tasks: 2          # tâches 2 et 3 du plan
  commits: 5
  mutations: 13
  tests_ajoutes: 59   # 20 vue pure + 18 bloc (jsdom) + 21 récapitulatif (jsdom)
completed: 2026-09-10
---

# Quick 260910-c2b — découpage C.2b-2 : l'écran

**Une phrase.** L'admin voit enfin ce qu'il y a à faire signer, voit ce qui
cloche dans la donnée, peut déclencher un envoi après avoir relu le PDF exact
qui part — et peut annuler un envoi au lieu de laisser la pièce gelée.

**Périmètre exécuté** : tâches **2** (le bloc « Signature ») et **3** (le
récapitulatif) du plan. La tâche 1 et C.2b-bis étaient livrés (`bd2cd92` →
`9e4e03d`) et n'ont pas été retouchés.

---

## 1. Ce qui a changé, fichier par fichier

### Tâche 2 — le bloc « Signature » (commits `c2da7b1` RED, `b168d62` GREEN)

| Fichier | Nature | Ce qui change |
|---|---|---|
| `apps/web/src/lib/sessions/bloc-signature-vue.ts` | **NOUVEAU**, pur | `etatDeLaPiece` (les TROIS origines d'un « signé »), `construireVueSignature` (lignes, `envoyable`, `boutonVisible`, `nbEnvoyables`). Sérialisable : rien que du JSON en sortie, il traverse la frontière RSC. |
| `apps/web/src/components/sessions/signature/bloc-signature.tsx` | **NOUVEAU**, client | Blocages puis avertissements en `role="alert"`, **messages rendus tels quels** ; une ligne par pièce ; « Envoyer », « Déposer le scan », « Annuler l'envoi ». Le bouton d'envoi est **absent du DOM**, jamais `disabled`. |
| `apps/web/src/app/app/sessions/[id]/page.tsx` | étendu | `status` / `signedPdfUrl` / `signatureRequestId` ajoutés au `select` **déjà existant** — aucune requête de plus. `planifierEnvoi` calculé pour les deux scopes, `vuePourScope` construit les deux vues. `canSign` = `ADMIN|MANAGER`, et `canEdit` en dérive. |
| `apps/web/src/components/sessions/tabs/tab-avant.tsx` | étendu | Reçoit `vueSignature`, rend le bloc **juste au-dessus** de `<SignedDocDropZone>`. |
| `apps/web/src/components/sessions/tabs/tab-apres.tsx` | étendu | Idem, scope `AFTER`. |
| `…/tabs/__tests__/avant-tab-actions.test.tsx`<br>`…/tabs/__tests__/apres-session-docs.test.tsx` | étendus | Un `vi.mock('@/server/actions/signature-envoi')` de plus, exactement comme le mock `qualiopi-matrix` que le lot A y avait posé pour la même raison (`cache()` de React, indisponible en jsdom). **Aucune assertion modifiée.** |

### Tâche 3 — le récapitulatif (commits `b4c033b` RED, `1597ea5` GREEN, `4072324` spec)

| Fichier | Nature | Ce qui change |
|---|---|---|
| `apps/web/src/components/sessions/signature/recapitulatif-envoi.tsx` | **NOUVEAU**, client | Modale Radix. Machine à états `preparation → revue → envoi → resultat`. Aperçu `?original=1`, couple nom + adresse avec provenance, champ d'adresse dérogatoire, refus rendu tel quel + « Rouvrir le récapitulatif », `signUrl` copiable, bandeau « aucun email » permanent. |
| `apps/web/src/components/sessions/signature/bloc-signature.tsx` | étendu | Branche l'ouverture : bouton du bloc → tout le plan (`cles: undefined`), bouton de ligne → `cles: [ligne.cle]`. |
| `.planning/specs/…-signature-electronique-docs-signes.md` | étendu | Amendements **n°8** (« Relancer » retiré) et **n°9** (les deux contrats manquants, livrés en C.2b-bis). |

---

## 2. Les 13 mutations — sortie RÉELLE

Chaque mutation a été posée, exécutée, et la sortie ci-dessous est celle du
terminal. **Aucune n'est restée verte**, et l'une d'elles a révélé un test qui
gardait la mauvaise chose (§3, écart n°1).

### Mutation 1 — le bouton devient GRISÉ au lieu d'être ABSENT

```
   × PUISSANCE (a) … > le bloc S’AFFICHE (ses lignes sont là) et n’a pourtant AUCUN bouton d’envoi
     → expected [ …(1) ] to have a length of +0 but got 1
   × PUISSANCE (a) … > toutes les pièces déjà parties : aucun bouton d’envoi non plus
     → expected [ …(1) ] to have a length of +0 but got 1
   × PUISSANCE (a) … > `canSign` faux : rien à cliquer, même quand tout est prêt
     → expected [ …(1) ] to have a length of +0 but got 1
   × PUISSANCE (b) … > l’avertissement ne déclenche AUCUN envoi : pas de ligne, pas de bouton
     → expected [ …(1) ] to have a length of +0 but got 1
   × PUISSANCE (d) … > pièce SIGNÉE : plus AUCUN des deux gestes — mais « Ouvrir » reste
     → expected [ …(1) ] to have a length of +0 but got 1
      Tests  5 failed | 11 passed (16)
```

### Mutation 2 — l'avertissement est REFORMULÉ au lieu d'être rendu tel quel

```
   × PUISSANCE (b) … > l’avertissement est dans un `role="alert"`, nomme l’apprenant et dit que rien n’est parti
     → expected 'Régime incohérent — corrigez la donné…' to contain 'Florent HAUSSWIRTH'
      Tests  1 failed | 15 passed (16)
```

### Mutation 3 — les avertissements ne sont plus rendus du tout

```
   × PUISSANCE (b) … > l’avertissement est dans un `role="alert"`, nomme l’apprenant et dit que rien n’est parti
     → Unable to find an accessible element with the role "alert"
      Tests  1 failed | 15 passed (16)
```

### Mutation 4 — plus de bouton « Annuler l'envoi » (la pièce reste gelée)

```
   × PUISSANCE (c) … > « Annuler l’envoi » appelle `annulerEnvoiSignature` avec l’identifiant de la DEMANDE
     → Unable to find an accessible element with the role "button" and name `/annuler l’envoi/i`
      Tests  1 failed | 15 passed (16)
```

### Mutation 5 — « Déposer le scan » survit à une pièce SIGNÉE (décision n°4 cassée)

```
   × PUISSANCE (d) … > pièce SIGNÉE : plus AUCUN des deux gestes — mais « Ouvrir » reste
     → expected [ …(1) ] to have a length of +0 but got 1
      Tests  1 failed | 15 passed (16)
```

### Mutation 6 — le scan manuel du lot A ne compte plus comme « signé »

```
   × etatDeLaPiece … > SIGNE — origine 1 : le scan manuel du lot A (docStatus MANUAL_OK)
     → expected 'GENERE' to be 'SIGNE' // Object.is equality
   × etatDeLaPiece … > PUISSANCE — un scan manuel prime sur un envoi en cours : la preuve existe déjà
     → expected 'ENVOYE' to be 'SIGNE' // Object.is equality
   × construireVueSignature … > une pièce SIGNE n’est pas envoyable, quelle que soit l’origine du signé
     → expected [ 'ABSENT', 'SIGNE' ] to deeply equal [ 'SIGNE', 'SIGNE' ]
      Tests  3 failed | 17 passed (20)
```

### Mutation 7 — « nominatif » déduit du NOMBRE d'inscrits au lieu de la CIBLE

```
   × construireVueSignature … > PUISSANCE — une convention de groupe d’UN SEUL inscrit reste collective
     → expected 'part-1' to be null
      Tests  1 failed | 19 passed (20)
```

### Mutation 8 — une pièce PARTIE redevient envoyable

```
   × construireVueSignature … > une pièce ENVOYE n’est pas envoyable — `sendForSignature` la refuserait
     → expected true to be false // Object.is equality
      Tests  1 failed | 19 passed (20)
```

### Mutation 9 — le refus part en `toast.error`, plus rien dans le DOM, plus de bouton de re-préparation

```
   × PUISSANCE (c) … > le message EXACT du moteur est dans le DOM — pas un résumé, pas un toast
     → expected 'Envoyer en signature — récapitulatifR…' to contain 'a changé depuis l\'aperçu'
   × PUISSANCE (c) … > le refus est dans un `role="alert"` — il ne se rate pas
     → Unable to find role="alert"
   × PUISSANCE (c) … > un bouton « Rouvrir le récapitulatif » existe, et il RELANCE la préparation
     → Unable to find role="button" and name `/rouvrir le récapitulatif/i`
   × PUISSANCE (c) … > PUISSANCE — le hash repassé vient du DERNIER `preparerEnvoiSignature`, pas du premier
     → Unable to find an accessible element with the role "button" and name `/rouvrir le récapitulatif/i`
   × Résultat … > un envoi MIXTE montre les deux : la pièce partie ET la pièce refusée
     → expected 'Envoyer en signature — récapitulatifR…' to contain 'Dossier AGEFICE — Jean DUPONT'
      Tests  5 failed | 16 passed (21)
```

### Mutation 10 — le hash est FIGÉ à la première préparation (variable qui survit)

```
   × PUISSANCE (c) … > PUISSANCE — le hash repassé vient du DERNIER `preparerEnvoiSignature`, pas du premier
     → expected 'HASH-A' to be 'HASH-B' // Object.is equality
      Tests  1 failed | 20 passed (21)
```

### Mutation 11 — l'aperçu perd `?original=1`

```
   × Ouverture … > l’aperçu est celui du PDF RÉGÉNÉRÉ, servi en `?original=1`
     → expected '/api/documents/doc-conv' to be '/api/documents/doc-conv?original=1' // Object.is equality
      Tests  1 failed | 20 passed (21)
```

### Mutation 12 — une pièce SANS adresse saisie part quand même (repli automatique)

```
   × Adresse dérogatoire … > un champ email nommé apparaît, et la pièce est EXCLUE tant qu’il est vide
     → expected "spy" to not be called at all, but actually been called 1 times
      Tests  1 failed | 20 passed (21)
```

### Mutation 13 — l'écran laisse croire que quelqu'un a été prévenu, et cache le `signUrl`

```
   × Résultat … > affiche le nom et l’adresse retenus, et le bandeau honnête « aucun email »
     → expected 'Envoyer en signature — récapitulatifR…' to contain 'aucun email n’a été envoyé'
   × Résultat … > le `signUrl` est AFFICHÉ avec de quoi le copier — seul moyen de le communiquer avant C.2c
     → Unable to find a label with the text of: /lien de signature/i
      Tests  2 failed | 19 passed (21)
```

---

## 3. Là où le plan — ou mes propres tests — se sont révélés faux au contact du code

### ⚠ Écart n°1 — un de MES tests était vert pour une mauvaise raison, la mutation l'a révélé

Le plan décrivait le test de puissance (a) ainsi : « session 100 % OPCO, scope
`AFTER` : … le composant ne rend **aucun** élément dont le nom accessible
correspond à /envoyer pour signature/i ». Je l'ai écrit tel quel. **Il est resté
VERT sous la mutation 1** (bouton grisé au lieu d'absent).

Motif : une session 100 % OPCO côté APRÈS a un plan **vide** — donc pas de
lignes, pas d'anomalies — et le bloc se tait entièrement (`return null`). Le test
gardait le **silence du bloc**, pas **l'absence du bouton** : il aurait continué
de passer avec un bouton grisé, exactement la chose que la décision n°3
interdit.

**Renforcé** : le cas de tête est désormais un bloc qui **S'AFFICHE** (il a des
lignes à montrer, toutes déjà signées) et n'a pourtant aucun bouton d'envoi —
avec une assertion explicite `container.textContent` contient « Signature
électronique », qui prouve que le bloc est bien rendu. Le silence du plan vide
garde son propre test, séparé et nommé comme tel. La mutation 1 rejouée fait
alors rougir **5** tests au lieu de 4, dont celui-là.

### Écart n°2 — les messages du moteur emploient l'apostrophe DROITE, pas la typographique

`messageDocumentModifie` écrit `a changé depuis l'aperçu` avec `'` (U+0027).
Mes premières assertions citaient `l’aperçu` (U+2019) et rougissaient. **Le test
avait tort, pas le code.** Corrigé en citant le message réel — et le test
compare désormais aussi le message **intégral** (`expect(texte).toContain(MESSAGE)`)
en important `messageDocumentModifie`, ce qui rend la classe d'erreur
impossible : c'est la fonction du moteur qui fournit la chaîne attendue.

À retenir pour la suite du chantier : `envoi-contrats.ts` est en apostrophes
droites, les composants de C.2b-2 en apostrophes typographiques. Toute assertion
sur un message du moteur doit **importer la fonction**, jamais recopier le texte.

### Écart n°3 — deux nœuds portant le même nom accessible

`getByLabelText(/lien de signature/i)` remontait **deux** éléments : le `<label>`
du champ (« Lien de signature à transmettre ») et l'`aria-label` du bouton de
copie (« Copier le lien de signature — … »). Ce n'est pas qu'une gêne de test :
deux commandes homonymes dans un même dialogue sont une gêne au lecteur d'écran.
L'`aria-label` du bouton est devenu « Copier le lien — {cle} ».

### Écart n°4 — `VueSignature` porte `canSign`, que le plan ne prévoyait pas

Le plan définissait `boutonVisible = canSign && lignes.some(l => l.envoyable)`,
mais **les boutons de LIGNE** (« Envoyer » d'une pièce, « Déposer le scan »,
« Annuler l'envoi ») ont besoin du RBAC eux aussi. Deux options : le re-dériver
dans le composant, ou le faire voyager. Le re-dériver aurait recréé une seconde
source de vérité RBAC dans un fichier `.tsx` — exactement ce que le lot C.2b-1
vient de supprimer entre la page et le moteur. `VueSignature.canSign` est donc
un champ de plus, calculé une fois côté serveur.

### Écart n°5 — `LigneSignature` porte `signatureRequestId`, absent du contrat du plan

Le plan listait `documentId` mais pas l'identifiant de la demande. Sans lui, le
bouton « Annuler l'envoi » est **inatteignable** : `annulerEnvoiSignature` prend
un `signatureRequestId`, pas un `documentId` (une demande peut couvrir plusieurs
pièces). Ajouté à `DocumentDeLaPiece` et à `LigneSignature`, et
`Document.signatureRequestId` ajouté au `select` déjà existant de `page.tsx`.

Corollaire traité, pas contourné : une ligne `ENVOYE` **sans**
`signatureRequestId` (dérive de donnée) n'affiche **aucun** bouton et dit
qu'elle n'est pas annulable depuis cet écran — plutôt qu'un bouton qui
échouerait. Verrouillé par test.

### Écart n°6 — « Déposer le scan » reste offert sur une ligne `ENVOYE`

La décision n°4 dit que les deux gestes « s'excluent dès qu'un **signé**
existe ». Une pièce **partie** n'est pas signée : le scan papier peut très bien
revenir pendant qu'une demande électronique dort chez le prestataire. Le dépôt
reste donc proposé sur une ligne `ENVOYE` (l'envoi, lui, ne l'est plus), avec le
bouton « Annuler l'envoi » juste à côté. **Choix assumé, à confirmer par
Laurent** : l'alternative serait de n'offrir que l'annulation, quitte à imposer
deux clics pour déposer un scan.

### Écart n°7 — `page.tsx` calcule désormais le plan des DEUX scopes

Le plan ne mentionnait que le scope `BEFORE` (pour `colonneAgeficeVisible`).
`planifierEnvoi` est pur et sans base : le second appel ne coûte aucune requête.

### Écart n°8 — deux fichiers de test existants ont dû être touchés

`avant-tab-actions.test.tsx` et `apres-session-docs.test.tsx` tombaient sur
`TypeError: cache is not a function` dès que l'onglet a importé
`<BlocSignature>` → `@/server/actions/signature-envoi` → `@/lib/rbac` →
`@/lib/auth`. Même chaîne, même remède que le mock `qualiopi-matrix` que le lot A
y avait déjà posé : un `vi.mock` de plus, **aucune assertion modifiée**. Les 29
tests du moteur C.2a, eux, restent intacts (`git diff --stat` = vide).

### Écart n°9 — le plan annonçait « six mutations », treize ont été jouées

Six pour la tâche 2 (dont trois sur la vue pure, que le plan n'exigeait pas
séparément) et cinq pour la tâche 3, plus les deux qui couvrent le bandeau
honnête et le `signUrl`.

---

## 4. Les trois gates — sortie RÉELLE

### `pnpm lint`

```
 Tasks:    3 successful, 3 total
```

Les deux **warnings préexistants** hors périmètre, non touchés (déjà constatés
en C.2a et C.2b-1) :

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
 Test Files  268 passed (268)
      Tests  2582 passed | 2 skipped (2584)
   Duration  7.74s
 Tasks:    3 successful, 3 total
```

(C.2b-1 finissait à 265 fichiers / 2523 tests : **+3 fichiers, +59 tests**.)

---

## 5. Vérifications du plan — sortie RÉELLE

```
--- 1. règle élargie BUG-11 dans page.tsx (attendu: vide) ---
(vide)
--- 2. docTypesHorsRegime passé par la matrice ---
30: * ici comme une DONNÉE, `docTypesHorsRegime`, passée à `deriveCellState`.
54:  docTypesHorsRegime?: ReadonlySet<string>;
116:        p.docTypesHorsRegime,
--- 3. raccourci AGEFICE dans le composant (attendu: vide) ---
25: * Ce composant portait sa propre règle en dur — `if (docType === 'AGEFICE' &&   ← COMMENTAIRE d'historique
--- 4. aucun disabled sur le bouton d'envoi ---
274:  disabled={occupe}   ← « Annuler l'envoi » pendant sa transition, PAS le bouton d'envoi
--- 5. aucun « Relancer » inventé ---
(uniquement dans des COMMENTAIRES qui expliquent son absence ; le test
 `queryAllByRole(… /relancer/i)` vaut 0 dans les deux composants)
--- 6. moteur C.2a intact ---
(vide)
--- 7. aucune migration ---
(vide)
```

---

## 6. L'état des cinq contrats manquants du plan

| # | Contrat | État à la fin de C.2b |
|---|---|---|
| **1** | Aucun moyen LECTURE SEULE de connaître le plan | **TRAITÉ** (C.2b-1, par extraction). `page.tsx` appelle `planifierEnvoi` — pur, sans base — pour les deux scopes, sans rien régénérer. |
| **2** | `sendForSignature` ne rend pas le `signUrl` | **TRAITÉ ET AFFICHÉ.** Rendu en C.2b-bis, affiché ici dans un champ sélectionnable avec bouton de copie, accompagné de la phrase qui dit que personne n'a été prévenu. |
| **3** | Aucune server action d'ANNULATION | **TRAITÉ ET ATTEIGNABLE.** `annulerEnvoiSignature` (C.2b-bis) a enfin un appelant : le bouton « Annuler l'envoi » du bloc. `messageEnvoiEnCours` ne promet plus un geste inexistant. |
| **4** | `E_SIGNED` sans producteur | **REPORTÉ au lot C.3**, comme convenu. `PENDING_SIGNATURE` est rendu **là où il sert** : la ligne du bloc cesse de proposer l'envoi et dit qu'une signature est en cours. La pastille de matrice (§4.3) reste au lot C.3. |
| **5** | « Relancer » n'a rien à relancer | **OMIS**, et écrit dans la spec (amendement n°8). Aucun élément nommé /relancer/i dans le code rendu. |

---

## 7. Ce qui reste à vérifier à la main, et ce qui reste bloquant

1. **L'inventaire SQL de C.2b-1 n'a toujours pas été joué sur la base réelle.**
   La base du worktree (`qualiof_dev_signature`) est un seed nu : zéro
   inscription. La contrepartie du changement de règle — l'avertissement
   « régime incohérent » — est désormais **affichée** (c'était la condition de
   livrabilité posée par le plan), mais **on ignore toujours combien
   d'inscriptions réelles sont concernées**. À jouer en lecture seule avant
   déploiement : `.planning/quick/260910-c2b-signature-lot-c2b-ecran-envoi/`
   § 1.2 du SUMMARY-1.

2. **Le changement ASSIDUITE touche toutes les sessions** (SUMMARY-1 §1.3) :
   l'attestation d'assiduité passe de « manquante » à « sans objet » chez les
   cinq financeurs non-AGEFICE. À constater à l'œil sur une session réelle.

3. **Aucun email n'est envoyé** (D-9 → lot C.2c). Le lien de signature doit être
   **copié à la main** depuis l'écran de résultat et transmis au signataire.
   L'écran le dit à la revue comme au résultat, mais c'est une manipulation
   réelle qu'il faut avoir en tête avant le premier envoi de production.

4. **Aucun webhook** (lot C.3) : rien ne remonte le PDF signé. Une pièce partie
   reste `sent_for_signature` jusqu'à ce qu'on l'annule ou que C.3 existe. Le
   bouton d'annulation est le seul recours, et il existe désormais.

5. **À confirmer par Laurent** — écart n°6 ci-dessus : « Déposer le scan » reste
   offert sur une ligne en attente de signature électronique.

6. **Non testé en navigateur.** Toute la vérification est automatisée (jsdom).
   Le rendu réel de la modale — hauteur de l'iframe d'aperçu, lisibilité sur un
   plan à plusieurs pièces — n'a pas été observé à l'œil.

---

## 8. Contraintes tenues

- Branche `feat/signature-docs-signes`, aucun worktree, **aucun `git stash`**.
- **Aucune migration** : `git status --porcelain packages/db/prisma/migrations` → vide.
- **Moteur non retouché** : `git diff --stat` sur `signature-envoi.ts` et ses
  deux fichiers de test → **vide**. Aucun contrat contourné dans un composant ;
  les deux manques rencontrés (`signatureRequestId` sur la ligne, `canSign` dans
  la vue) sont des ajouts à la VUE, pas au moteur, et sont nommés au §3.
- Outillage de test : `@testing-library/react` + `jsdom` + en-tête
  `/* @vitest-environment jsdom */`, `beforeEach(cleanup)` explicite (pas de
  `globals: true`), `queryAllByRole` / `getByText` / `fireEvent`. **Ni**
  `jest-dom`, **ni** `user-event`.
- Français partout dans l'écran et dans les messages.
- RED → GREEN, un commit par étape.

---

## Commits

| Hash | Message |
|---|---|
| `c2da7b1` | `test(signature-C2b2): le bloc Signature — bouton absent, avertissement visible, envoi annulable — tests RED` |
| `b168d62` | `feat(signature-C2b2): bloc Signature — le bouton n'existe pas quand il n'y a rien à envoyer` |
| `b4c033b` | `test(signature-C2b2): le récapitulatif — aperçu du PDF exact, adresse saisie, refus compréhensible — tests RED` |
| `1597ea5` | `feat(signature-C2b2): récapitulatif d'envoi — aperçu du PDF exact, adresse dérogatoire, refus rendu tel quel` |
| `4072324` | `docs(signature): amendements n°8 et n°9 — « Relancer » retiré, contrats manquants nommés` |

## Self-Check: PASSED

Les 7 fichiers annoncés existent sur disque ; les 5 commits existent dans
`git log`. `bloc-signature-vue.ts` 169 l. (min 80), `bloc-signature.tsx` 342 l.
(min 120), `recapitulatif-envoi.tsx` 561 l. (min 200).
