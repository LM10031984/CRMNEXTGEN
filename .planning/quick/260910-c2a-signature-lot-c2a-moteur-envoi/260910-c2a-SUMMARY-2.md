# Quick 260910-c2a — Lot C.2a-2 : les server actions du moteur d'envoi — Résumé

**Livré le 2026-09-10** · branche `feat/signature-docs-signes` · 5 commits, `2e2355f` → `e1d58ac`

Périmètre : **tâche 3 du plan uniquement**, réécrite par la décision structurante de
Laurent du 10/09. Les tâches 1 et 2 (C.2a-1, commits `fec1113` → `ba460d1`) sont
consommées telles quelles, non retouchées sauf deux ajouts nommés plus bas.

Aucun composant React, aucune migration, aucun email envoyé.

## En une ligne

L'admin ouvre le récapitulatif : les pièces sont **régénérées avec leurs ancres**, et
ce qu'il voit est le PDF exact qui partira — **hash à l'appui**. Le clic Envoyer
confirme ce PDF-là, et **refuse** si quoi que ce soit a bougé entre-temps.

## La décision de Laurent, et ce qu'elle change vraiment

> « La régénération avec ancres se fait à l'ouverture du récapitulatif, qui affiche un
> aperçu du PDF exact qui partira ; le clic Envoyer confirme ce PDF-là, jamais une
> autre version. »

Deux server actions, donc, et non une. Mais le point qui compte n'est pas le
découpage : c'est que **l'ordre des écrans ne garantit rien**. Deux admins en
parallèle, ou une régénération déclenchée ailleurs entre l'aperçu et le clic, et
l'envoi part sur autre chose que ce qui a été relu — sans que personne ne le sache.

`sendForSignature` reçoit donc le `hashConfirme` de chaque pièce et **refuse** dès
qu'il diverge : pas d'appel prestataire, pas d'écriture, et un message qui dit les
trois choses utiles (ce qui a changé, que rien n'est parti, qu'il faut rouvrir le
récapitulatif). C'est un contrôle, pas une convention d'appel — mutation à l'appui
plus bas.

## Ce qui est fait, fichier par fichier

| Fichier | Modification |
|---|---|
| `apps/web/src/server/actions/signature-envoi.ts` | **Nouveau, 979 lignes.** `preparerEnvoiSignature` (plan → régénération à ancres → aperçu + hashes) et `sendForSignature` (garde-fous → prestataire → transaction atomique). Charge, appelle, garde, écrit — n'invente aucune règle. |
| `apps/web/src/lib/signature/envoi-contrats.ts` | **Nouveau, 247 lignes, pur.** `ANCRES_PAR_PIECE` : LA table qui dit ce que chaque gabarit ouvre comme ancres. Plus les raisons de refus nommées, les formes de résultat, et les messages lus par l'admin. |
| `apps/web/src/server/actions/__tests__/signature-preparation.test.ts` | **Nouveau, 10 tests.** |
| `apps/web/src/server/actions/__tests__/signature-envoi.test.ts` | **Nouveau, 17 tests**, dont les trois de puissance exigés. |
| `packages/shared/src/schemas/signature.ts` | **+61 lignes** : `preparerEnvoiSignatureSchema`, `cibleEnvoiSignatureSchema`, `sendForSignatureSchema`, `SCOPES_ENVOI`. Source unique. |
| `apps/web/src/lib/closure/convention-core.ts` | `signatureTags` accepté et transmis au gabarit — sur les **deux** chemins. |
| `apps/web/src/server/actions/agefice-generator.ts` | idem (l'ancre du demandeur ; le formulaire garde l'image de l'OF). |
| `apps/web/src/server/actions/agefice-attendance-generator.ts` | idem. |
| `apps/web/src/lib/signature/representant.ts` | **+23 lignes** : `resoudreStagiaire` et la source `APPRENANT_STAGIAIRE`. |
| `apps/web/src/lib/signature/__tests__/regime.test.ts` | Le test-garde anti-`if` financeur et la garde de pureté balaient désormais **4** modules. |
| `.planning/specs/…-signature-electronique-docs-signes.md` | Amendement **n°5** au bloc §5 lot C ; le « point ouvert » barré ; statut du lot C passé à « en cours ». |

## Les commits

| Hash | Message |
|---|---|
| `2e2355f` | `test(signature-C2a2)` l'aperçu régénère et rend le hash de ce qui partira — RED |
| `7c67483` | `feat(signature-C2a2)` l'aperçu régénère le PDF à ancres et rend son hash |
| `7e896cc` | `test(signature-C2a2)` sendForSignature n'envoie que ce qui a été confirmé — RED |
| `aae2afa` | `feat(signature-C2a2)` sendForSignature — garde-fous, transaction atomique, AuditLog |
| `e1d58ac` | `docs(signature)` la régénération se fait à l'ouverture du récapitulatif (amendement n°5) |

## Là où le plan et la spec se sont révélés faux au contact du code

**1. Le nom de rôle de l'ancre vient du GABARIT, pas du régime. Le plan disait
l'inverse, et cela n'aurait rien envoyé.**

Le plan écrivait : « Rôles pris dans `SIGNATURE_ROLES` (`CLIENT` pour un dirigeant,
`STAGIAIRE` pour un stagiaire) ». Or les ancres réellement posées dans les PDF sont
nominatives et **ne dépendent pas du régime** :

```
convention-template.ts:406  → role: SIGNATURE_ROLES.CLIENT      (toujours « Client »)
agefice-form-fill.ts:413    → role: SIGNATURE_ROLES.STAGIAIRE   (toujours « Stagiaire »)
agefice-attendance:397      → role: SIGNATURE_ROLES.STAGIAIRE
```

Un indépendant qui signe **sa propre** convention a, au sens du régime, le rôle
`STAGIAIRE`. La règle du plan lui aurait envoyé un signataire nommé « Stagiaire » sur
un PDF qui ne porte qu'une ancre « Client » : le champ serait resté non attribué et
**personne n'aurait signé** — sans erreur, sans alerte, un dossier qui n'avance jamais.
C'est exactement le défaut que la garde `signatureFieldCount === 0` du lot B sert à
attraper, mais elle ne l'aurait pas vu ici (le champ existe, il n'est simplement
attribué à personne).

D'où `ANCRES_PAR_PIECE`, qui lit les gabarits au lieu de redériver la règle.

**2. La même table dit « qui garde son tampon » — et cette règle était déjà dans le
code, contrairement à ce que laissait croire le carve-out du plan.**

Le plan renvoyait la question à un « C.2a-bis » qui devait trancher. Vérification
faite, les trois gabarits tranchent déjà, eux-mêmes, sur `signatureTags` :

```
convention-template.ts:421     if (data.signatureTags) → ancre OF, pas de tampon
agefice-attendance:97-98       d.signatureTags ? null : loadSignatureDataUrl(…)
agefice-form-fill.ts:548       applyOfSignature() INCONDITIONNEL — le formulaire garde son image
```

Le moteur passe donc `signatureTags: true` **à l'identique** aux trois, et ne contient
aucune branche par type de document sur le tampon. Ce qui restait à faire n'était pas
une décision, mais un **branchement** : aucun générateur ne passait l'option. C'est
fait ici, dans les quatre.

**3. Le régime peut désigner une organisation là où le Document est individuel.**

Pour un TNS financé AGEFICE via son EI, `conventionSigner = DIRIGEANT` ⇒ cible
`ORGANISATION` ⇒ clé `CONVENTION:org-ei-1`. Mais la convention réellement générée est
**individuelle** (`participantId`), parce que la règle payeur du 12/08 envoie un
auto-payeur au contrat individuel. Chercher un document `entityType='organization'`
comme le décrivait le plan n'aurait rien trouvé : refus `DOC_NON_GENERE` sur un
dossier parfaitement sain.

Résolu en réutilisant `releveDeLaConvention` — **la fonction qui a décidé de la forme
au moment de la génération**, donc la seule qui ne peut pas diverger d'elle. Le
signataire suit : cascade `resoudreRepresentantIndividuel`, `EI_SELF` ⇒ l'apprenant
lui-même.

**4. `force` ne doit pas contourner un envoi en cours — et le plan ne le disait pas.**

Le plan traitait `force` comme un contournement des garde-fous. Appliqué à
`sent_for_signature`, il produirait **deux demandes concurrentes sur la même pièce**
chez le prestataire, dont une orpheline. `force` ne lève donc que `DEJA_SIGNE` ; un
envoi en cours s'annule d'abord. Verrouillé par un test qui passe `force: true` et
attend malgré tout `ENVOI_EN_COURS`.

**5. Régénérer un document déjà parti l'aurait EFFACÉ.**

Les quatre générateurs commencent par `prisma.document.deleteMany(...)`. Comme la
régénération a lieu à l'**ouverture** du récapitulatif — donc potentiellement sur une
session dont une pièce est déjà partie —, ouvrir l'écran aurait supprimé le Document
en cours de signature et sa liaison `signatureRequestId`. La demande serait restée
ouverte chez DocuSeal sans plus rien pointer côté QualiOF.

La préparation ne régénère donc **jamais** un document `signed` ou
`sent_for_signature` : elle rend l'empêchement nommé. Mutation à l'appui plus bas.

**6. `cibles` + `hashesConfirmes` + `emailsSaisis` en tableaux parallèles — écarté.**

Le brief nommait trois tableaux. Ils se désaligneraient un jour (un filtre côté UI, un
tri, un envoi partiel) et l'action enverrait alors une adresse à la mauvaise pièce sans
qu'aucun type ne s'en aperçoive. Un seul tableau `cibles: { cle, hashConfirme,
emailSaisi? }[]` porte exactement la même information et rend le désalignement
impossible.

**7. Hermétisme : `provider.ts` valide l'environnement au chargement.**

`vi.importActual('@/lib/signature/provider')` fait tomber la suite entière sur
`DATABASE_URL: [ 'Required' ]` — le module importe `@qualiof/shared/env`, qui appelle
`createEnv` au load. Les deux suites remplacent donc le module **entièrement**, en y
redéfinissant `SignatureNotConfiguredError` : c'est cette classe-là que le code sous
test importe, donc son `instanceof` reste vrai. Contrainte connue du dépôt (« 17-02 »),
mais qui se paye à chaque nouvelle suite touchant la signature.

**8. Le grep de vérification n°4 du plan reste un faux positif**, déjà signalé en
C.2a-1 : `ATLAS` et `OPCOMMERCE` apparaissent dans l'en-tête de commentaire de
`regime.ts`, qui explique justement pourquoi le module existe. Sortie réelle :

```
apps/web/src/lib/signature/regime.ts:6: * `OpcoCatalog.requiredDocs` est de la prose d'affichage (vide chez ATLAS et
apps/web/src/lib/signature/regime.ts:7: * OPCOMMERCE) qui ne dit jamais QUI signe, et le code tranchait par
```

Le test-garde, lui, retire les commentaires et balaie les **4** modules purs
(`regime`, `plan-envoi`, `representant`, `envoi-contrats`) : vert.
`signature-envoi.ts` ne contient aucun code financeur.

## Les mutations, avec leur sortie réelle

Cinq mutations, chacune restaurée aussitôt par `git checkout`.

**1. Le contrôle de hash ne bloque plus** (`if (false && doc.hashSha256 !== …)`) —
**2 tests rouges**, dont le test de puissance (a) :

```
× (a) PUISSANCE — hash divergent : refus, aucun appel prestataire, aucune écriture
  → expected "spy" to not be called at all, but actually been called 1 times
× un refus ne fait pas tomber le lot : la pièce saine part quand même
  → expected [ 'CONVENTION:org-ei-1', …(1) ] to deeply equal [ Array(1) ]
Tests  2 failed | 15 passed (17)
```

**2. La garde « zéro champ de signature » ne se déclenche plus**
(`signatureFieldCount === -1`) — **1 test rouge**, et il tombe sur l'**annulation**,
pas sur le refus :

```
× (b) PUISSANCE — zéro champ de signature : annulation chez le prestataire, rien de persisté
  → expected "spy" to be called 1 times, but got 0 times
Tests  1 failed | 16 passed (17)
```

**3. Un document déjà signé repart sans `force`** (`doc.status === STATUT_SIGNE &&
false`) — **1 test rouge** :

```
× (c) PUISSANCE — document déjà signé : refus sans `force`, aucun appel prestataire
  → expected "spy" to not be called at all, but actually been called 1 times
Tests  1 failed | 16 passed (17)
```

**4. L'OF re-signe le dossier AGEFICE** (ajout d'une ancre `OF` dans
`ANCRES_PAR_PIECE`) — **1 test rouge**, sur l'assertion `toEqual` exacte des
`signers` :

```
× le dossier AGEFICE n’a QU’UN signataire — l’OF n’y re-signe pas
  → expected [ { role: 'Stagiaire', …(3) }, …(1) ] to deeply equal [ { role: 'Stagiaire', …(3) } ]
Tests  1 failed | 16 passed (17)
```

**5. L'aperçu régénère un document déjà parti en signature** (la garde ne retient plus
que `signed`) — **1 test rouge** :

```
× un document DÉJÀ PARTI en signature n’est jamais régénéré — le régénérer l’effacerait
  → expected "spy" to not be called at all, but actually been called 1 times
Tests  1 failed | 9 passed (10)
```

## Ce que les deux actions font, précisément

### `preparerEnvoiSignature({ sessionId, scope, cles? })`

`requireRole(['ADMIN','MANAGER'])` → Zod → session **scopée tenant** → règles lues dans
`OpcoCatalog` (référentiel **global**, sans `tenantId` — dit en commentaire pour que la
revue ne le prenne pas pour un oubli) → `planifierEnvoi` → pour chaque envoi :

1. forme du document (groupe / individuel) par `releveDeLaConvention` ;
2. si `signed` ou `sent_for_signature` ⇒ **aucune régénération**, empêchement nommé ;
3. sinon régénération à `signatureTags: true` ;
4. `AuditLog document.regenerated_for_signature` **seulement si le hash a changé** —
   un journal qui répète « rien n'a changé » cesse d'être lu ;
5. signataire client résolu par la **même cascade** que celle qui imprime
   « Représentée par X » ;
6. signataire OF vérifié **dès l'aperçu** : le découvrir au clic obligerait à annuler
   une demande déjà créée chez le prestataire.

Rend `{ envois: [{ cle, libelle, document: { hash, pdfUrl }, signataire, empechements }],
blocages, avertissements }`. Un signataire sans email **n'empêche pas l'aperçu** : le
hash est rendu quand même, pour que C.2b puisse proposer la saisie d'adresse.

### `sendForSignature({ sessionId, scope, cibles, force? })`

Provider fail-closed d'abord (message rendu tel quel) → session scopée tenant → puis,
par cible, dans l'ordre du **plan** et non de la saisie :

`CLE_INCONNUE` → `DOC_NON_GENERE` → **`DOCUMENT_MODIFIE`** → `DEJA_SIGNE` (sauf
`force`) → `ENVOI_EN_COURS` (que `force` ne lève pas) → `SIGNATAIRE_SANS_EMAIL` →
`SIGNATAIRE_OF_INCOMPLET` → téléchargement du PDF → `createRequest` →
**`AUCUN_CHAMP_DE_SIGNATURE`** (avec `cancel`) → transaction.

La transaction est **par envoi**, jamais autour des appels réseau :
`signatureRequest.create` + `document.update` + `auditLog.create('signature.sent')`,
tous par `tx`. Si elle échoue, `provider.cancel(providerId)` est appelé avant le refus.

L'`AuditLog` porte le **couple retenu** — nom, email, et la provenance des deux
(`sourceNom`, `sourceEmail`). C'est la contrepartie de la dérogation `SAISI_PAR_ADMIN` :
une adresse saisie à la main est tracée avec le nom qu'elle sert.

## La checklist server action, point par point

- [x] `requireRole(['ADMIN','MANAGER'])` en tête des deux actions, avant tout I/O
- [x] toute requête scopée `tenantId` — sauf `OpcoCatalog`, référentiel global, **dit
      en commentaire**
- [x] Zod avant tout I/O, schémas dans `packages/shared/src/schemas/`
- [x] diff + `AuditLog` dans la **même transaction** que l'écriture (`signature.sent`)
- [x] pas d'`AuditLog` vide : la régénération n'en écrit un que si le hash a changé
- [x] `revalidatePath` sur `/app/sessions/{id}` **et** `/app/sessions`
- [x] retour `{ ok: true } | { ok: false, error }`, jamais de `throw` métier
- [ ] **une réserve, assumée** : l'`AuditLog document.regenerated_for_signature` est
      écrit **hors transaction**. Le remplacement du Document est fait par les
      générateurs, partagés avec cinq autres appelants ; les envelopper depuis ici
      demanderait de les réécrire. La trace **suit** l'écriture au lieu de
      l'accompagner. Dit en commentaire dans le code, à corriger le jour où les
      générateurs seront refondus.

## Les gates, sortie réelle

```
pnpm lint      → Tasks: 3 successful, 3 total
                 2 warnings PRÉEXISTANTS, fichiers non touchés :
                   parametres/page.tsx:226 (jsx-a11y/alt-text)
                   diagnostic-r1/use-autosave.ts:51 (react-hooks/exhaustive-deps)
pnpm --filter @qualiof/web exec tsc --noEmit  → aucune erreur
pnpm test      → Test Files 262 passed (262)
                 Tests 2486 passed | 2 skipped (2488)
```

(260 fichiers / 2456 tests avant ce lot : +2 fichiers, +30 tests, zéro régression.)

Vérifications de périmètre :

```
git diff --name-only 2e2355f^..HEAD | grep '\.tsx$'      → aucun
git diff --name-only 2e2355f^..HEAD | grep migrations    → aucune
git status --porcelain apps/web/tsconfig.tsbuildinfo     → propre
```

## Ce qui reste à faire

- **C.2b — l'UI.** Bouton « Envoyer pour signature » (absent, pas grisé, quand le plan
  est vide), récapitulatif appelant `preparerEnvoiSignature`, **aperçu du PDF**, champ
  de saisie d'adresse quand `SIGNATAIRE_SANS_EMAIL`, affichage des blocages et
  avertissements, puis `sendForSignature` avec les hashes rendus par l'aperçu.
  ⚠ **Contrat à respecter côté UI** : le `hashConfirme` envoyé doit être celui rendu
  par le **dernier** appel à `preparerEnvoiSignature`, pas un hash mémorisé plus tôt.
  L'action refusera, mais autant ne pas fabriquer le refus.
- **C.2c** — les emails aux signataires (D-9), avec `signUrl` déjà persisté, plus les
  relances D-5 (J+3 / J+7). **Personne n'est prévenu tant que ce lot n'est pas livré.**
- **C.3** — webhook `POST /api/webhooks/docuseal`, idempotence, retour du signé, cron
  `signature-sync`. Les documents restent `sent_for_signature` jusque-là.
- **Le point du carve-out n°1 du plan est levé** : les ancres sont désormais posées par
  la régénération. Un envoi réel ne rendra plus `signatureFieldCount = 0` pour cause
  d'ancres absentes — reste à le vérifier en sandbox (ci-dessous).

## Vérifications à faire à la main

Ce lot ne produit **aucune interface** : rien à cliquer dans l'application. Deux
vérifications valent la peine, toutes deux en **dry-run ou sandbox**, jamais en réel :

1. **La chaîne bout en bout en dry-run.** `SIGNATURE_PROVIDER=dry-run`, appeler
   `preparerEnvoiSignature` puis `sendForSignature` sur une session AGEFICE réelle, et
   vérifier que le `Document.pdfUrl` régénéré ouvre bien un PDF **sans le tampon de
   l'OF** pour la convention et l'assiduité, et **avec** pour le formulaire AGEFICE.
   C'est la seule chose que les tests ne peuvent pas prouver : ils mockent le rendu.
2. **Le compte de champs en sandbox DocuSeal.** Envoyer une convention régénérée et
   lire le `signatureFieldCount` rendu : il doit valoir 2 (Client + OF), et 1 pour un
   dossier AGEFICE. Un 0 signifierait que les ancres ne survivent pas au rendu
   WeasyPrint/Gotenberg — cas que le lot B a validé sur un PDF fabriqué à la main, pas
   encore sur un PDF sorti de la chaîne complète.

## Point d'hygiène, non traité (hors périmètre)

Un fichier `.planning/quick/260910-liens-publics-lisibilite.md` est apparu **non
suivi** pendant la session ; il n'est de ce lot ni de ce chantier, et n'a été ni
modifié ni commité.

## Self-Check: PASSED

Fichiers annoncés : les 5 existent. Commits annoncés : les 5 existent
(`2e2355f`, `7c67483`, `7e896cc`, `aae2afa`, `e1d58ac`). Les deux server actions
sont bien exportées par `signature-envoi.ts`. Aucun stub, aucune valeur en dur qui
remonterait à l'écran : ce lot ne produit aucune interface.
