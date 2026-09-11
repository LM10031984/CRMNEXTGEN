---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-3
subsystem: signature-electronique
tags: [signature, depot-scan, annulation, confirmation, audit]
requires:
  - quick-260910-c2a    # signature-envoi.ts (preparerEnvoiSignature, sendForSignature)
  - quick-260910-c2b-1  # annulerEnvoiSignature
  - quick-260910-c2b-2  # bloc-signature.tsx, recapitulatif-envoi.tsx
provides:
  - "annulerEnvoiSignature porte un `motif` énuméré — la trace distingue enfin les deux annulations"
  - "persistSignedScan refuse un dépôt qui annulerait un envoi non confirmé (fail-closed, tous chemins d'entrée)"
  - "UploadSignedDocDialog : avertissement + ÉTAPE de confirmation qui nomme l'annulation"
  - "le bloc « Signature » dit à la modale qu'un envoi est en cours"
affects:
  - "apps/web/src/server/actions/qualiopi-matrix.ts (uploadSignedDoc, uploadSignedScans)"
  - "apps/web/src/components/sessions/qualiopi-matrix/matrix-row.tsx (cellule cible de drop)"
  - "apps/web/src/components/sessions/qualiopi-matrix/doc-cell-menu.tsx"
key-files:
  created:
    - apps/web/src/server/actions/__tests__/signature-depot-scan.test.ts
    - apps/web/src/components/sessions/qualiopi-matrix/__tests__/upload-signed-doc-dialog.confirmation.test.tsx
  modified:
    - packages/shared/src/schemas/signature.ts
    - apps/web/src/lib/signature/envoi-contrats.ts
    - apps/web/src/server/actions/signature-envoi.ts
    - apps/web/src/server/actions/qualiopi-matrix.ts
    - apps/web/src/components/sessions/qualiopi-matrix/upload-signed-doc-dialog.tsx
    - apps/web/src/components/sessions/signature/bloc-signature.tsx
    - apps/web/src/server/actions/__tests__/qualiopi-matrix.test.ts
    - apps/web/src/server/actions/__tests__/qualiopi-matrix-signed-scans.test.ts
    - apps/web/src/server/actions/__tests__/signature-annulation.test.ts
    - apps/web/src/components/sessions/signature/__tests__/bloc-signature.test.tsx
    - .planning/specs/2026-09-04-signature-electronique-docs-signes.md
metrics:
  tasks: 1
  commits: 4
  mutations: 5
  tests_ajoutes: 28
completed: 2026-09-11
---

# Quick 260910-c2b — découpage C.2b-3 : « une pièce, un seul chemin ouvert »

**Une phrase.** Déposer un scan sur une pièce partie en signature ne laisse plus
deux chemins ouverts : il ferme l'autre — l'envoi est annulé chez le
prestataire, après que l'utilisateur a lu ce qui allait se passer et l'a
confirmé, et la trace dit que c'est un dépôt qui l'a provoqué.

Tranche l'écart n°6 du SUMMARY-2, laissé « à confirmer par Laurent ».

---

## 1. Ce qui a changé, fichier par fichier

| Fichier | Nature | Ce qui change |
|---|---|---|
| `packages/shared/src/schemas/signature.ts` | étendu | `MOTIFS_ANNULATION_SIGNATURE = ['user_requested', 'scan_deposited']` et `annulerEnvoiSignatureSchema.motif`, **énuméré** et **par défaut** — l'appelant existant (le bouton du bloc) n'a rien à préciser. |
| `apps/web/src/lib/signature/envoi-contrats.ts` | étendu | `MOTIF_ANNULATION_DEMANDE` / `MOTIF_ANNULATION_SCAN_DEPOSE`, `texteMotifAnnulation()`, `messageDepotAnnuleraitEnvoi()`, `messageDepotAnnulationImpossible()`. Le type du motif entre par un **`import type`** de `@qualiof/shared` — effacé à la compilation, donc le module reste importable par un composant client sans traîner `@qualiof/shared/env`. |
| `apps/web/src/server/actions/signature-envoi.ts` | étendu | `annulerEnvoiSignature` lit le `motif` et l'écrit dans `AuditLog signature.canceled` : le **code** (`motif`) pour interroger, la **phrase** (`motifTexte`) pour lire. Rien d'autre n'a bougé — c'est la MÊME annulation, avec sa transaction, sa remise de statut et sa régénération `signatureTags: false`. |
| `apps/web/src/server/actions/qualiopi-matrix.ts` | étendu | `persistSignedScan` rend une **union discriminée** et commence par `libererEnvoiEnCours()` : cherche un `Document` en `sent_for_signature` avec une demande, refuse sans confirmation, sinon appelle `annulerEnvoiSignature({ motif: 'scan_deposited' })` **avant** d'écrire quoi que ce soit. `uploadSignedDoc` lit le drapeau du `FormData` et journalise `envoiAnnule` ; `uploadSignedScans` ne confirme jamais (cf. §3). |
| `…/qualiopi-matrix/upload-signed-doc-dialog.tsx` | étendu | Prop `envoiEnAttente`. Avertissement `role="alert"` **dès l'ouverture**, puis une **étape** de confirmation dont le bouton nomme l'annulation. Exporte `AVERTISSEMENT_DEPOT_ANNULE_ENVOI` et `LIBELLE_CONFIRMER_DEPOT` — les tests les importent au lieu de recopier des chaînes à apostrophes typographiques. |
| `…/sessions/signature/bloc-signature.tsx` | étendu | `envoiEnAttente={ligne.etat === 'ENVOYE'}`. La ligne est la seule à le savoir. |
| 4 fichiers de test existants | étendus | 2 regagnent leur hermétisme (`provider.ts` exécute `createEnv` au load, et `qualiopi-matrix` importe désormais `signature-envoi`) — **aucune assertion modifiée**. Les 2 autres reçoivent les tests de motif et de câblage. |

---

## 2. Les 5 mutations — sortie RÉELLE

### Mutation (a) — plus d'appel à `provider.cancel` au dépôt

```
 ❯ src/server/actions/__tests__/signature-depot-scan.test.ts (12 tests | 5 failed)
   × (a) … > PUISSANCE — `provider.cancel` est appelé avec l’identifiant de la submission
     → expected "spy" to be called with arguments: [ 'sub-1' ] … Number of calls: 0
   × (a) … > PUISSANCE — l’annulation précède l’écriture du scan, jamais l’inverse
     → expected "spy" to be called 1 times, but got 0 times
   × (a) … > PUISSANCE — annulation refusée par le prestataire : RIEN n’est déposé
     → expected true to be false
   × (a) … > la demande passe en CANCELED et le document sort du gel
     → expected "spy" to be called with arguments: [ ObjectContaining{…} ] … Number of calls: 0
   × (c) … > PUISSANCE — l’AuditLog `signature.canceled` porte le motif du dépôt …
     → expected [] to have a length of 1 but got +0
```

### Mutation (b-serveur) — la confirmation n'est plus exigée

```
 ❯ src/server/actions/__tests__/signature-depot-scan.test.ts (12 tests | 2 failed)
   × (b) … > PUISSANCE — sans le drapeau de confirmation, le dépôt est REFUSÉ et le prestataire n’est pas appelé
     → expected true to be false
   × (b) … > le refus emploie le message du moteur — pas un résumé recopié à côté
     → expected true to be false
```

### Mutation (b-écran) — plus d'étape de confirmation, on téléverse direct

```
 ❯ …/upload-signed-doc-dialog.confirmation.test.tsx (10 tests | 4 failed)
   × PUISSANCE — le premier envoi du formulaire n’appelle RIEN : il demande confirmation
     → expected "spy" to not be called at all, but actually been called 1 times
   × PUISSANCE — après confirmation, le dépôt part AVEC le drapeau d’annulation
     → expected "spy" to be called 1 times, but got 2 times
   × on peut REVENIR sans rien annuler — la confirmation n’est pas un piège
   × changer de fichier après avoir confirmé REDEMANDE la confirmation
```

### Mutation (c) — le motif retombe sur la valeur par défaut

```
   × (c) … > PUISSANCE — l’AuditLog `signature.canceled` porte le motif du dépôt, pas celui d’une annulation volontaire
     → expected 'user_requested' to be 'scan_deposited'
   × annulerEnvoiSignature — le motif est porté par le contrat > PUISSANCE — un motif fourni ressort TEL QUEL dans la trace
     → expected 'user_requested' to be 'scan_deposited'
   × annulerEnvoiSignature — le motif est porté par le contrat > la trace garde AUSSI la phrase lisible, à côté du code
     → expected 'Envoi en signature annulé depuis Qual…' to contain 'scan'
```

### Mutation (d) — le bloc ne dit plus qu'un envoi est en cours

```
 ❯ src/components/sessions/signature/__tests__/bloc-signature.test.tsx (20 tests | 1 failed)
   × PUISSANCE (e) … > ligne ENVOYE : ouvrir « Déposer le scan » affiche l’avertissement d’annulation
     → Unable to find an element with the text: Cette pièce est partie en signature électronique. …
```

### Mutation (e) — la zone de dépôt confirme à la place de l'admin

```
 ❯ …/qualiopi-matrix-signed-scans.test.ts (10 tests | 1 failed)
   × uploadSignedScans — une pièce partie en signature ne part pas en douce > PUISSANCE — le fichier visant une pièce en attente de signature RESSORT en échec, sans rien écrire
     → expected "spy" to not be called at all, but actually been called 1 times
```

---

## 3. Là où mes propres tests se sont révélés faux au contact de la mutation

### ⚠ Écart n°1 — un test vert pour une mauvaise raison, DEUX fois de suite

Le test « une pièce partie en signature ne part pas en douce » (zone de dépôt)
n'assertait au départ que le **libellé** du refus. Sous la mutation (e), il
rougissait bien — mais **pas pour ce qu'il annonçait** : avec un provider mocké
qui ne rend rien, une zone de dépôt qui confirmerait d'office échoue de toute
façon, simplement sur un autre message. Le test gardait la **forme du refus**,
pas le fait que l'annulation n'ait jamais été **tentée**.

Premier renforcement : `expect(getSignatureProvider).not.toHaveBeenCalled()`.
**Toujours faux.** L'identifiant de demande du test (`'req-9'`) n'était pas un
UUID ; `annulerEnvoiSignature` valide son entrée par Zod **avant** de demander
le prestataire, donc l'assertion était **creuse** — elle passait quelle que soit
la mutation.

Deuxième renforcement : un UUID réel, **et l'assertion remontée en tête** du
test. Placée après, la première assertion en échec l'aurait empêchée d'être
atteinte — c'est exactement ce qui s'était produit à l'essai suivant. La
mutation (e) rougit désormais sur `expected "spy" to not be called at all`.

**À retenir pour la suite du chantier** : sur ce fichier, une assertion de
puissance doit venir **avant** les assertions de confort, sinon on ne sait
jamais si elle garde quoi que ce soit.

### Écart n°2 — le dépôt fait entrer une dépendance d'environnement dans la matrice

`qualiopi-matrix.ts` importe désormais `signature-envoi.ts`, donc
`@/lib/signature/provider`, qui exécute `createEnv` **au chargement**.
Conséquence immédiate : `qualiopi-matrix.test.ts` et
`qualiopi-matrix-signed-scans.test.ts` ne pouvaient plus être lancés seuls (ils
ne passaient que sous `pnpm test`, qui charge `.env` par `dotenv`).

Corrigé par la politique hermétique déjà documentée (17-02) : `vi.mock` du
module qui exécute `createEnv`, **sans `importActual`**. **Aucune assertion
modifiée** dans ces deux fichiers. C'est une dette réelle, pas une gêne de
test : le chemin de dépôt d'un scan dépend maintenant, au chargement, de la
configuration du prestataire de signature.

### Écart n°3 — l'ordre annulation → écriture n'est pas une préférence

Écrire le scan d'abord aurait **détruit** ce scan : `annulerEnvoiSignature`
régénère le document sans ses ancres, et tous les générateurs commencent par un
`deleteMany`. Le `signedPdfUrl` tout juste posé aurait disparu avec l'ancienne
ligne. Verrouillé par un test qui compare les `invocationCallOrder`.

Corollaire heureux : `persistSignedScan` repose son `Document` par
`updateMany({ where: { tenantId, participantId, type } })`, **pas par id** — il
retrouve donc la ligne **régénérée**. Si la recherche avait été par id, la règle
aurait été impossible à tenir sans réécrire l'annulation.

### Écart n°4 — `persistSignedScan` rend désormais une union, et c'est `tsc` qui l'impose

Le retour nu `{ key, before, entry }` ne pouvait plus dire « refusé ». Un
`throw` aurait laissé le traitement du refus au hasard des `try` des appelants —
`uploadSignedScans` en a un, `uploadSignedDoc` non. L'union discriminée force
les **deux** sites à traiter le cas.

### Écart n°5 — la zone de dépôt multi-fichiers ne confirme JAMAIS (limite assumée)

Elle traite N fichiers pour N stagiaires et ne peut pas montrer, pièce par
pièce, ce qu'une annulation coûterait. Une confirmation globale serait la
confirmation aveugle que la règle interdit. Une pièce partie y ressort donc en
`failures` avec le message qui renvoie au bloc « Signature ». Écrit dans la
spec (amendement n°10) et sous test de puissance.

---

## 4. Les trois gates — sortie RÉELLE

### `pnpm lint`

```
 Tasks:    3 successful, 3 total
```

Les deux **warnings préexistants** hors périmètre, non touchés (déjà constatés
en C.2a, C.2b-1 et C.2b-2) :

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
 Test Files  270 passed (270)
      Tests  2612 passed | 2 skipped (2614)
   Duration  8.25s
 Tasks:    3 successful, 3 total
```

(C.2b-2 finissait à 268 fichiers / 2582 tests : **+2 fichiers, +30 tests**.)

---

## 5. Ce qui reste à vérifier à la main

1. **Non testé en navigateur.** Toute la vérification est automatisée (jsdom).
   L'étape de confirmation dans la modale — lisibilité de l'avertissement,
   place qu'il prend dans une modale de 480 px — n'a pas été observée à l'œil.
2. **Non testé contre DocuSeal réel.** `provider.cancel` est mocké partout. Le
   comportement d'une annulation d'une submission **déjà partiellement signée**
   (un signataire sur deux) n'a pas été observé chez le prestataire : le refus
   est géré (`messageDepotAnnulationImpossible`), sa formulation exacte côté
   DocuSeal reste à voir.
3. **Le chemin « cellule cible de drop » de la matrice** (`matrix-row.tsx`)
   appelle `uploadSignedDoc` sans passer `annulerEnvoiEnCours` : sur une pièce
   partie, il **refusera** avec le message qui renvoie au bloc « Signature ».
   Comportement voulu (fail-closed), mais à constater à l'œil sur une session
   réelle — c'est un refus que l'utilisateur découvrira au lâcher du fichier.
4. **Aucun webhook** (lot C.3) : rien ne remonte le PDF signé. Inchangé.
5. **Hors périmètre, non commité** : `packages/db/package.json` porte dans le
   répertoire de travail un ajout de script `seed:demo-signature` qui n'est pas
   de ce lot. Laissé tel quel, jamais mis en index.

---

## 6. Contraintes tenues

- Branche `feat/signature-docs-signes`, aucun worktree, **aucun `git stash`**.
- **Aucune migration** : le `motif` est un champ d'entrée Zod, pas une colonne.
- **`annulerEnvoiSignature` réutilisée, jamais réécrite** — son contrat a été
  étendu (un champ `motif` énuméré, avec défaut), pas contourné.
- Outillage de test : `@testing-library/react` + `jsdom` + en-tête
  `/* @vitest-environment jsdom */`, `beforeEach(cleanup)` explicite. **Ni**
  `jest-dom`, **ni** `user-event`.
- Toute assertion sur un message du moteur ou de l'écran **importe la
  fonction / la constante** ; aucune chaîne recopiée.
- Français partout.
- RED → GREEN, un commit par étape.

---

## Commits

| Hash | Message |
|---|---|
| `0c8bf53` | `test(signature-C2b3): une pièce, un seul chemin ouvert — le dépôt d'un scan annule l'envoi — tests RED` |
| `2aa2161` | `feat(signature-C2b3): déposer un scan sur une pièce en attente annule l'envoi, après confirmation` |
| `7d70936` | `test(signature-C2b3): la zone de dépôt ne confirme jamais à la place de l'admin` |
| (doc) | `docs(signature): amendement n°10 — une pièce, un seul chemin ouvert` |
