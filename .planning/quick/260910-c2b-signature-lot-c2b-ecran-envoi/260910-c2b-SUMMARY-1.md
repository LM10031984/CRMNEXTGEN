---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-1
subsystem: signature-electronique
tags: [signature, regime-financement, matrice-qualiopi, annulation, docuseal]
requires:
  - quick-260910-c1r   # regime.ts + les 3 colonnes SignerRole d'OpcoCatalog
  - quick-260910-c2a   # plan-envoi.ts, envoi-contrats.ts, preparerEnvoiSignature, sendForSignature
provides:
  - "participants-regime.ts — le mapper que la fiche session ET le moteur d'envoi partagent"
  - "catalogue-regime.ts — la lecture unique d'OpcoCatalog"
  - "docTypesHorsRegime enfin PASSÉ à deriveCellState : le NA du régime existe à l'écran"
  - "colonneAgeficeVisible — régime OU document existant OU avertissement"
  - "annulerEnvoiSignature — une pièce envoyée n'est plus gelée"
  - "EnvoiEffectue.signUrl — le lien de signature remonte enfin à l'appelant"
affects:
  - "apps/web/src/app/app/sessions/[id]/page.tsx"
  - "apps/web/src/components/sessions/qualiopi-matrix/participant-doc-matrix.tsx"
  - "apps/web/src/server/actions/signature-envoi.ts"
key-files:
  created:
    - apps/web/src/lib/signature/participants-regime.ts
    - apps/web/src/lib/signature/catalogue-regime.ts
    - apps/web/src/lib/signature/__tests__/participants-regime.test.ts
    - apps/web/src/components/sessions/qualiopi-matrix/__tests__/participant-doc-matrix.regime.test.tsx
    - apps/web/src/server/actions/__tests__/signature-annulation.test.ts
  modified:
    - apps/web/src/server/actions/signature-envoi.ts
    - apps/web/src/lib/signature/envoi-contrats.ts
    - apps/web/src/lib/signature/__tests__/regime.test.ts
    - apps/web/src/components/sessions/qualiopi-matrix/participant-doc-matrix.tsx
    - apps/web/src/app/app/sessions/[id]/page.tsx
    - packages/shared/src/schemas/signature.ts
metrics:
  tasks: 2          # tâche 1 du plan + C.2b-bis
  commits: 3
  mutations: 10
  tests_ajoutes: 32   # 19 participants-regime + 5 matrice (jsdom) + 8 annulation
completed: 2026-09-10
---

# Quick 260910-c2b — découpage C.2b-1 : la couche serveur

**Une phrase.** Le régime de financement décide désormais de ce que la matrice
affiche — la dérivation élargie BUG-11 a disparu de `page.tsx` — et une pièce
partie en signature peut être annulée au lieu de rester gelée sans recours.

**Périmètre exécuté** : tâche 1 du plan (câblage du régime) **+ le correctif
C.2b-bis**. Les tâches 2 (bloc « Signature ») et 3 (récapitulatif) n'ont **pas**
été commencées, conformément à la consigne.

---

## 1. L'inventaire SQL — exécuté AVANT toute modification de `page.tsx`

Base du worktree : `qualiof_dev_signature` (`.env.local`), comme l'exige
`.claude/commands/quick.md` §4.

### 1.1 La base est vide de données métier

```
$ docker exec qualiof_postgres psql -U qualiof -d qualiof_dev_signature -c "..."

 sessions | inscriptions | personnes | organisations | documents | financeurs
----------+--------------+-----------+---------------+-----------+------------
        0 |            0 |         0 |             0 |         0 |          6
(1 row)
```

Six financeurs, zéro inscription : c'est le **seed nu** d'une base fraîche
(`quick.md` §4 : « une base fraîche ne contient que le seed — aucune donnée
métier »).

### 1.2 La requête du plan, jouée telle quelle

```
$ docker exec -i qualiof_postgres psql -U qualiof -d qualiof_dev_signature -f - < inventaire.sql

 session | apprenant | sponsor | financeur_inscription | autres_financeurs | a_deja_le_dossier
---------+-----------+---------+-----------------------+-------------------+-------------------
(0 rows)
```

**⚠ Zéro ligne ne veut PAS dire « personne n'est concerné ».** Cette base n'a
jamais reçu d'import métier. La requête doit être rejouée **en lecture seule sur
la base qui porte les vraies inscriptions** avant de considérer le changement de
comportement comme sans impact :

```bash
# À jouer sur la base réelle, en LECTURE SEULE.
psql "$DATABASE_URL_PROD" -f .planning/quick/260910-c2b-signature-lot-c2b-ecran-envoi/inventaire-bug11.sql
```

Le corps de la requête est celui du plan (`<changement_de_comportement>` point 1),
reproduit ici sans modification :

```sql
SELECT s.code            AS session,
       p."lastName" || ' ' || p."firstName" AS apprenant,
       so."legalName"    AS sponsor,
       so."opcoCode"     AS financeur_inscription,
       (SELECT string_agg(DISTINCT o2."opcoCode", ',')
          FROM "LegalLink" ll
          JOIN "Organization" o2 ON o2.id = ll."organizationId"
         WHERE ll."personId" = p.id AND ll."organizationId" <> so.id) AS autres_financeurs,
       EXISTS (SELECT 1 FROM "Document" d
                WHERE d."participantId" = sp.id AND d.type = 'AGEFICE') AS a_deja_le_dossier
  FROM "SessionParticipant" sp
  JOIN "Person" p        ON p.id  = sp."personId"
  JOIN "TrainingSession" s ON s.id = sp."sessionId"
  JOIN "Organization" so ON so.id = sp."sponsorOrgId"
 WHERE COALESCE(so."opcoCode", '') <> 'AGEFICE'
   AND EXISTS (SELECT 1 FROM "LegalLink" ll
                JOIN "Organization" o2 ON o2.id = ll."organizationId"
               WHERE ll."personId" = p.id
                 AND (ll.role = 'EI_SELF' OR o2."opcoCode" = 'AGEFICE')
                 AND ll."organizationId" <> so.id);
```

### 1.3 Le référentiel, lui, est bien là — et il dit ce qui va changer

```
    code    | conventionSigner | ageficeSigner | assiduiteSigner
------------+------------------+---------------+-----------------
 AGEFICE    | DIRIGEANT        | STAGIAIRE     | STAGIAIRE
 ATLAS      | DIRIGEANT        |               |
 CPF        | STAGIAIRE        |               |
 FI-FPL     | STAGIAIRE        |               |
 OPCOMMERCE | DIRIGEANT        |               |
 OPCO_EP    | DIRIGEANT        |               |
(6 rows)
```

Lecture directe, et c'est le vrai périmètre du changement d'affichage :

| Pièce | Avant | Après |
|---|---|---|
| **CONVENTION** | `MISSING` si absente | inchangé — **en régime chez les six financeurs** |
| **AGEFICE** | `NA` si `!isAgefice` (règle élargie) | `NA` seulement hors régime, et **jamais si le document existe** |
| **ASSIDUITE** | `MISSING` pour tout le monde | **`NA` chez les cinq financeurs non-AGEFICE** |

La ligne ASSIDUITE est le changement **le plus visible** et il n'était pas nommé
dans le plan : l'attestation d'assiduité est une pièce AGEFICE
(`agefice-attendance-generator.ts`), et elle affichait jusqu'ici « manquant » sur
tous les inscrits OPCO. Elle dira désormais « sans objet ». C'est une
amélioration, mais elle touche **toutes** les sessions, pas seulement les cas
BUG-11.

---

## 2. Ce qui a changé, fichier par fichier

### Tâche 1 — le régime câblé (commits `bd2cd92` RED, `533af8f` GREEN)

| Fichier | Nature | Ce qui change |
|---|---|---|
| `apps/web/src/lib/signature/participants-regime.ts` | **NOUVEAU**, pur | `codesFinanceursDe`, `regleDuFinanceur`, `participantPourEnvoi`, `docTypesSansObjet`, `colonneAgeficeVisible`. Corps de `participantPourEnvoi` **repris à l'identique** de `chargerContexte`. Ajouté à la garde de pureté. |
| `apps/web/src/lib/signature/catalogue-regime.ts` | **NOUVEAU** | `chargerReglesSignature` — la requête `OpcoCatalog` déplacée telle quelle, commentaire « référentiel GLOBAL, pas d'oubli de scope » conservé. Hors garde de pureté, et le fichier le dit. |
| `apps/web/src/lib/signature/__tests__/regime.test.ts` | étendu | `MODULES += 'participants-regime.ts'` |
| `apps/web/src/server/actions/signature-envoi.ts` | étendu | `chargerContexte` consomme les deux extraits. **Comportement constant** : 29 tests du moteur verts, `git diff --stat` sur les deux fichiers de test = **0 ligne**. |
| `apps/web/src/components/sessions/qualiopi-matrix/participant-doc-matrix.tsx` | étendu | `docTypesHorsRegime?: ReadonlySet<string>` sur `MatrixParticipant`, passé en 8ᵉ argument de `deriveCellState`. Le raccourci `if (docType === 'AGEFICE' && !p.isAgefice) return NA` est **supprimé**. En-tête réécrit. |
| `apps/web/src/app/app/sessions/[id]/page.tsx` | étendu | La dérivation élargie BUG-11 disparaît. `isAgefice` vient de `docTypesEnRegime`. `hasAgeficeParticipant` vient de `colonneAgeficeVisible`. Une seule requête `OpcoCatalog` par rendu. |

**`tab-tous-documents.tsx` n'a PAS été touché** : `docTypesHorsRegime` voyage sur
`MatrixParticipant`, que le passe-plat transmet déjà. Un fichier de moins que le
plan n'en prévoyait, et une surface de moins à faire diverger.

### C.2b-bis — sortir du gel (commit `9e4e03d`)

| Fichier | Nature | Ce qui change |
|---|---|---|
| `packages/shared/src/schemas/signature.ts` | étendu | `annulerEnvoiSignatureSchema` — source unique, comme l'exige la checklist server action |
| `apps/web/src/lib/signature/envoi-contrats.ts` | étendu | `EnvoiEffectue.signUrl`, `PieceRelachee`, `AnnulerEnvoiSignatureResult`, et 4 messages nommés (`messageDemandeNonAnnulable`, `messageAnnulationPrestataireImpossible`, `messagePreuveConservee`, `messageRegenerationApresAnnulationImpossible`) |
| `apps/web/src/server/actions/signature-envoi.ts` | étendu | `signUrl` remonté depuis `creation.signers` ; `annulerEnvoiSignature` ; `signatureTags` devient un **paramètre** de `REGENERATION_PAR_PIECE` (l'envoi passe `true`, l'annulation `false`, par le même chemin) |

---

## 3. Les 10 mutations — sortie RÉELLE

Chaque mutation a été posée, exécutée, et **la sortie ci-dessous est celle du
terminal**. Aucune n'est restée verte.

### Mutation 1 — la dérivation élargie BUG-11 rétablie dans `participantPourEnvoi`

```
   × Florent HAUSSWIRTH … > n’est PAS AGEFICE : son financeur d’inscription ne l’ouvre pas
     → expected true to be false // Object.is equality
   × Florent HAUSSWIRTH … > a AGEFICE **et** ASSIDUITE hors régime, la convention restant en régime
     → expected Set{} to deeply equal Set{ 'AGEFICE', 'ASSIDUITE' }
   × Florent HAUSSWIRTH … > porte un avertissement NOMMÉ, qui ne planifie aucun envoi AGEFICE
     → expected [] to have a length of 1 but got +0
      Tests  3 failed | 16 passed (19)
```

### Mutation 2 — `colonneAgeficeVisible` oublie `participantsAvecDocumentAgefice`

```
   × colonneAgeficeVisible … > PUISSANCE — un dossier AGEFICE DÉJÀ GÉNÉRÉ garde sa colonne, même hors régime
     → expected false to be true // Object.is equality
      Tests  1 failed | 18 passed (19)
```

### Mutation 3 — `colonneAgeficeVisible` oublie `participantsAvertisAgefice`

```
   × colonneAgeficeVisible … > PUISSANCE — un avertissement « régime incohérent » garde la colonne, il ne devient pas un NA muet
     → expected false to be true // Object.is equality
      Tests  1 failed | 18 passed (19)
```

### Mutation 4 — le raccourci AGEFICE en dur rétabli dans le composant

```
   × ParticipantDocMatrix … > PUISSANCE — une pièce hors régime dont le DOCUMENT EXISTE reste affichée telle quelle
     → Unable to find an element with the text: part-florent | AGEFICE | GENERATED
   × ParticipantDocMatrix … > sans `docTypesHorsRegime`, la matrice rend exactement ce qu’elle rendait avant
     → Unable to find an element with the text: part-sans-regime | AGEFICE | MISSING
      Tests  2 failed | 3 passed (5)
```

### Mutation 5 — le 8ᵉ paramètre de `deriveCellState` n'est plus passé

```
   × ParticipantDocMatrix … > une pièce HORS RÉGIME et SANS document est « NA », jamais « MISSING »
     → Unable to find an element with the text: part-florent | AGEFICE | NA
   × ParticipantDocMatrix … > financeur INCONNU : les pièces de financeur sont « NA », la convention reste « MISSING »
     → Unable to find an element with the text: part-auto | AGEFICE | NA
      Tests  2 failed | 3 passed (5)
```

### Mutation 6 — `docTypesSansObjet` délègue tel quel à `docTypesHorsRegime`

```
   × docTypesSansObjet … > PUISSANCE — régime INCONNU : les pièces de financeur sont sans objet, la convention reste réclamée
     → expected Set{ 'CONVENTION', 'AGEFICE', …(1) } to deeply equal Set{ 'AGEFICE', 'ASSIDUITE' }
      Tests  1 failed | 18 passed (19)
```

### Mutation 7 — l'annulation ne prévient plus le prestataire

```
   × annulerEnvoiSignature … > PUISSANCE — annule chez le prestataire, passe la demande en CANCELED, relâche le document
     → expected "spy" to be called with arguments: [ 'sub-1' ]
   × annulerEnvoiSignature … > l’échec du prestataire n’écrit RIEN en local — la demande resterait ouverte chez lui
     → expected true to be false // Object.is equality
      Tests  2 failed | 6 passed (8)
```

### Mutation 8 — le document ne retrouve PAS son état d'avant

```
   × annulerEnvoiSignature … > PUISSANCE — annule chez le prestataire, passe la demande en CANCELED, relâche le document
     → expected "spy" to be called with arguments: [ { where: { id: 'doc-age' }, …(1) } ]
   × annulerEnvoiSignature … > rend au document le statut que le JOURNAL lui connaissait avant l’envoi …
     → expected "spy" to be called with arguments: [ { where: { id: 'doc-conv' }, …(1) } ]
      Tests  2 failed | 6 passed (8)
```

### Mutation 9 — la régénération d'annulation garde les ancres (`signatureTags: true`)

```
   × annulerEnvoiSignature … > PUISSANCE — le document est régénéré EN SENS INVERSE, sans ancres
     → expected "spy" to be called with arguments: [ …(2) ]
      Tests  1 failed | 7 passed (8)
```

### Mutation 10 — `signUrl` n'est plus remonté

```
   × sendForSignature … > PUISSANCE — `signUrl` du signataire côté bénéficiaire est rendu, pas seulement persisté
     → expected null to be 'https://docuseal.eu/s/le-lien-du-stag…' // Object.is equality
      Tests  1 failed | 7 passed (8)
```

---

## 4. Les trois gates — sortie RÉELLE

### `pnpm lint`

```
 Tasks:    3 successful, 3 total
```

Deux **warnings préexistants**, hors périmètre, non touchés (déjà constatés en C.2a) :

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
 Test Files  265 passed (265)
      Tests  2523 passed | 2 skipped (2525)
   Duration  7.75s
 Tasks:    3 successful, 3 total
```

---

## 5. Déviations — là où le plan s'est révélé faux au contact du code

### Écart n°1 — `docTypesHorsRegime` n'est pas utilisable tel quel à l'écran ⚠

Le plan disait : « ajouter `docTypesHorsRegime: docTypesHorsRegime(pourLePlan.regle)`
sur chaque `matrixParticipant` ». Appliqué littéralement, **cela aurait effacé la
convention** de tout inscrit dont le commanditaire n'a pas de code financeur.

`docTypesHorsRegime(null)` rend les **trois** pièces. C'est juste pour l'envoi —
« l'inconnu ne vaut pas trois signatures par défaut » — et **faux pour
l'affichage** : `FinancingMode.AUTOFINANCEMENT` et `ENTREPRISE` désignent
précisément des commanditaires sans `opcoCode`, et leur convention est une
obligation légale (Art. L6353-1). Le garde-fou « régime incohérent » ne les
rattraperait pas : il ne se déclenche que sur les signaux d'un dossier propre
(`aLienEiSelfHorsSponsor`, `reglesAutresOrgs`), qu'un auto-payeur ne porte pas.
On aurait posé un `NA` silencieux — celui que la spec interdit — sur la seule
pièce dont l'absence est une faute.

**Traité par `docTypesSansObjet`** (`participants-regime.ts`), une seconde lecture
pour l'écran, adossée à une **table de données** d'une ligne
(`PIECES_HORS_FINANCEUR = { CONVENTION }`), dans l'esprit de `COLONNE_PAR_DOCTYPE` :
une pièce de plus = une ligne, pas une branche. Verrouillé par la mutation n°6.

Le corollaire est que le réflexe **envoi** reste inchangé : `docTypesHorsRegime(null)`
continue de rendre les trois pièces, et `planifierEnvoi` n'envoie donc rien pour
un financeur inconnu. Les deux lectures divergent volontairement, et le module
l'écrit.

### Écart n°2 — un bug préexistant bloquait la gate `tsc` (corrigé, Rule 1)

```
src/server/actions/signature-envoi.ts(558,11): error TS2322: Type 'string | null'
is not assignable to type 'string'.
```

`AuditLog.entityId` n'est **pas nullable** au schéma, et la trace d'intention
`document.regeneration_requested` (commit `aef6245`, lot C.2a-2) y écrivait
`avant?.id ?? null`. Ce n'est pas qu'une erreur de type : Prisma lève à
l'exécution, donc **`preparerEnvoiSignature` tombait dès qu'une pièce n'était pas
encore générée** — c'est-à-dire au premier récapitulatif ouvert sur une session
neuve. Vérifié préexistant : `git show 5036c5a:…| grep 'entityId: avant'`.

Corrigé en écrivant la **clé du plan** (`AGEFICE:part-3`), qui désigne la pièce
visée aussi précisément qu'un id de Document. Embarqué dans le commit `533af8f`
et nommé dans son message (un seul fichier, deux hunks : pas de commit séparé
possible sans `git stash`, interdit).

### Écart n°3 — le plan annonçait 27 tests moteur, il y en a 29

`signature-envoi.test.ts` + `signature-preparation.test.ts` = **29 tests**, tous
verts, **sans modification** (`git diff --stat` sur les deux = vide).

### Écart n°4 — `tab-tous-documents.tsx` n'avait pas besoin d'être touché

Le plan le listait en « passe-plat ». `docTypesHorsRegime` voyage sur
`MatrixParticipant`, déjà transmis tel quel. Fichier non modifié.

### Écart n°5 — l'auto-cleanup de `@testing-library/react` ne s'arme pas ici

`vitest.config.ts` n'active pas `globals: true` : sans `beforeEach(cleanup)`
explicite, le DOM du test précédent survit et rend tous les `queryBy*` menteurs.
Constaté en direct (un `queryByText(... | NA)` trouvait un nœud du test d'avant).
Aligné sur `avant-tab-actions.test.tsx`, qui appelle déjà `cleanup()`.

### Écart n°6 — mutation supplémentaire non prévue

Le plan prévoyait 2 mutations pour la tâche 1. Six ont été jouées (1 à 6), pour
couvrir séparément chacun des trois bras de `colonneAgeficeVisible` et le
garde-fou de la convention. Quatre autres (7 à 10) couvrent C.2b-bis.

---

## 6. L'état des cinq contrats manquants du plan

| # | Contrat | État après ce découpage |
|---|---|---|
| **1** | Aucun moyen LECTURE SEULE de connaître le plan | **TRAITÉ par extraction.** `participants-regime.ts` + `catalogue-regime.ts` ; `planifierEnvoi` est pure et appelable depuis `page.tsx` sans rien régénérer. |
| **2** | `sendForSignature` ne rend pas le `signUrl` | **TRAITÉ** (option **(b)** du plan, tranchée par Laurent). `EnvoiEffectue.signUrl` est rendu. **Reste à l'afficher** : c'est la tâche 3. |
| **3** | Aucune server action d'ANNULATION | **TRAITÉ côté serveur** : `annulerEnvoiSignature` existe, testée, transactionnelle. **⚠ Aucun bouton à l'écran** — voir « ce qui reste bloquant » ci-dessous. |
| **4** | `E_SIGNED` sans producteur | **REPORTÉ au lot C.3** (décision Laurent du 10/09). Non implémenté. `PENDING_SIGNATURE` sera rendu en tâche 2, là où il sert. |
| **5** | « Relancer » n'a rien à relancer | **OMIS**, et dit. Aucune trace dans le code. |

---

## 7. Ce qui reste bloquant pour un usage réel

1. **⚠ L'avertissement « régime incohérent » reste INVISIBLE.** C'est la
   contrepartie du changement de règle, et son affichage est la **tâche 2**. En
   l'état, un apprenant type Florent HAUSSWIRTH perd la génération de son dossier
   AGEFICE depuis l'onglet Avant **sans qu'aucun message ne le dise** — seule la
   colonne reste visible. Le plan l'écrivait sans ambiguïté : « si la liste du
   point 1 est non vide et qu'aucun avertissement ne s'affiche, le lot n'est pas
   livrable ». La liste est vide sur cette base ; elle ne l'est peut-être pas sur
   la vraie. **Ne pas déployer C.2b-1 seul sans avoir joué l'inventaire du §1.2
   sur la base réelle, ou sans la tâche 2.**

2. **⚠ `messageEnvoiEnCours` promet toujours un geste que l'admin ne peut pas
   faire.** Il dit « Annulez l'envoi en cours ». L'action existe désormais, mais
   **aucun bouton ne l'appelle** : le bloc « Signature » est la tâche 2. Tant
   qu'elle n'est pas livrée, l'annulation n'est atteignable que par du code.

3. **Le changement ASSIDUITE touche toutes les sessions**, pas seulement les cas
   BUG-11 (§1.3). À constater à l'œil sur une session réelle avant déploiement.

4. Aucun email n'est envoyé (D-9 → lot C.2c). Aucun webhook (lot C.3).

---

## 8. Contraintes tenues

- Branche `feat/signature-docs-signes`, aucun worktree, **aucun `git stash`**.
- **Aucune migration** : `git status --porcelain packages/db/prisma/migrations` → vide.
- **Aucun composant d'écran nouveau** : pas de bloc « Signature », pas de
  récapitulatif, pas de bouton d'envoi. Les seules retouches `.tsx` sont
  `participant-doc-matrix.tsx` (câblage) et `page.tsx` (câblage).
- Checklist server action pour `annulerEnvoiSignature` : `requireRole`,
  `tenantId` sur la recherche, Zod dans `packages/shared/src/schemas/`, `AuditLog`
  dans la même transaction que l'écriture, `revalidatePath` sur la fiche **et** la
  liste, retour `{ ok } | { ok: false, error }`, jamais de `throw` métier.
- Outillage de test : `@testing-library/react` + `jsdom` + `/* @vitest-environment
  jsdom */`, assertions via `getByText` / `queryByText` / `getByTestId`. Ni
  `jest-dom`, ni `user-event`.

---

## Commits

| Hash | Message |
|---|---|
| `bd2cd92` | `test(signature-C2b1): le régime câble l'écran, l'annulation sort la pièce du gel — tests RED` |
| `533af8f` | `feat(signature-C2b1): le régime de financement décide de la matrice, la règle élargie BUG-11 est retirée` |
| `9e4e03d` | `feat(signature-C2b-bis): une pièce envoyée n'est plus gelée — annulation + lien de signature rendu` |

## Self-Check: PASSED
