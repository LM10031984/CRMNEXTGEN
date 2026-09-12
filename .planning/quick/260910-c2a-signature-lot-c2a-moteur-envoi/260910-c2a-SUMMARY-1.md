# Quick 260910-c2a — Lot C.2a-1 : les modules purs du moteur d'envoi — Résumé

**Livré le 2026-09-10** · branche `feat/signature-docs-signes` · 6 commits, `fec1113` → `ff0ae78`

Périmètre : **tâches 1 et 2 du plan uniquement** (découpage C.2a-1 proposé par le plan
lui-même). La tâche 3 — `sendForSignature` — n'a **pas** été commencée : c'est C.2a-2.

Spec : `.planning/specs/2026-09-04-signature-electronique-docs-signes.md` §5 lot C
(bloc « Écarts constatés / amendements » ajouté par ce quick), tableau §6 ligne D-4.

## En une ligne

« Qui signe quoi, à quelle adresse, et qu'est-ce qui bloque » se répond désormais
par trois fonctions pures — sans base, sans réseau, sans mock — et la cascade qui
décide du signataire est **la même** que celle qui imprime « Représentée par X »
sur la convention.

## Ce qui est fait, fichier par fichier

| Fichier | Modification |
|---|---|
| `apps/web/src/lib/signature/representant.ts` | **Nouveau, 275 lignes, pur.** `nomAffiche`, `resoudreRepresentantEntreprise`, `resoudreRepresentantIndividuel`, `resoudreEmailRepresentant`. La cascade du nom est l'extraction **stricte** des deux cascades de `convention-core.ts`. |
| `apps/web/src/lib/signature/__tests__/representant.test.ts` | **Nouveau, 18 tests.** Dont l'invariant « le nom ne sort jamais d'un contact non principal », le refus sans repli, et la surcharge admin. |
| `apps/web/src/lib/closure/convention-core.ts` | Les **deux** chemins (individuel L.170-178, groupe L.408-420) appellent le module partagé. Plus aucune cascade en propre. **Aucune requête Prisma modifiée.** |
| `apps/web/src/lib/signature/regime.ts` | **Étendu (+94 lignes).** `SignauxDossierPropre`, `AvertissementRegime`, `ContexteRegime.signauxDossierPropre?` (optionnel), `resolveRegimeSignature` rend `avertissements`. Rien renommé, rien retiré. |
| `apps/web/src/lib/signature/__tests__/regime.test.ts` | **+7 cas** sur le garde-fou ; la garde anti-`if` financeur et la garde de pureté balaient les **3** modules par une boucle factorisée (24 tests). |
| `apps/web/src/lib/signature/plan-envoi.ts` | **Nouveau, 247 lignes, pur.** `planifierEnvoi({ scope, participants })` → `{ envois, blocages, avertissements }`. D-4 amendé : un envoi porte UN document. |
| `apps/web/src/lib/signature/__tests__/plan-envoi.test.ts` | **Nouveau, 11 tests.** Les 4 scénarios exigés + puissance D-4 + déterminisme + garde de contrat « la facturation n'entre pas dans le plan ». |
| `.planning/specs/2026-09-04-signature-electronique-docs-signes.md` | §5 lot C : bloc **« Écarts constatés / amendements (10/09/2026) »** en 4 points, sur le modèle du bloc du lot B. Ligne D-4 du tableau §6 barrée et remplacée. |

Aucun `.tsx`, aucune migration, aucun fichier hors des 8 ci-dessus.

## Les commits

| Hash | Message |
|---|---|
| `fec1113` | `test(signature-C2a)` cascade unique du représentant — tests RED |
| `8c8f446` | `feat(signature-C2a)` une seule cascade du représentant, qui rend aussi l'email |
| `e40b764` | `test(signature-C2a)` l'email du signataire est celui du représentant, ou rien — RED |
| `8ced486` | `feat(signature-C2a)` aucun repli d'email sur un autre contact — GREEN |
| `bf03f06` | `test(signature-C2a)` garde-fou « régime incohérent » + plan d'envoi — tests RED |
| `ff0ae78` | `feat(signature-C2a)` garde-fou « régime incohérent » + plan d'envoi pur (D-4 amendé) |

## Décision de Laurent intégrée en cours de route

**`CONTACT_AUTRE` est supprimé** (message du 10/09, reçu pendant la tâche 2). Le repli
« premier contact avec un email » est **annulé** : envoyer le lien dans la boîte de B
pour une pièce qui nomme A ferait figurer l'email et l'adresse IP de B dans le
certificat de signature — preuve inexploitable devant un financeur.

Ce qui remplace :

- l'email du signataire est celui du **représentant résolu** (`CONTACT_NOMME`), ou celui
  de l'apprenant quand c'est lui qui signe (`PERSON`) ;
- à défaut : **refus nominatif**, qui nomme la personne ET l'organisation, renvoie vers
  `/app/organisations/{id}`, et dit pourquoi on ne se rabat pas sur un autre contact ;
- **seule dérogation** : `emailSaisi`, adresse saisie explicitement par l'admin devant le
  récapitulatif (UI en C.2b), source **`SAISI_PAR_ADMIN`** distincte ;
- la fonction rend le **couple retenu** (`{ nom, email, source }`) pour que la server
  action de C.2a-2 journalise la surcharge sans rien redériver ;
- une saisie qui n'est pas une adresse est **refusée** (un nom tapé dans le champ partirait
  chez le prestataire et le dossier n'avancerait jamais).

Le test d'invariant qui décrivait `CONTACT_AUTRE` a été **remplacé** — pas supprimé — par
le test 6, qui garde la règle : représentant sans email ⇒ refus, **même** si un autre
contact a une adresse, et l'adresse du tiers n'apparaît nulle part dans le message.

## Les mutations, avec leur sortie réelle

Cinq mutations lancées, chacune restaurée aussitôt.

**1. Le NOM peut sortir d'un contact NON principal** (`contacts.find(c => c.isPrimary)` →
`contacts[0]`) — **2 tests rouges** :

```
× Test 4 — INVARIANT : le NOM ne sort JAMAIS d’un contact non principal
  → expected true to be false // Object.is equality
× le premier contact principal l’emporte sur les suivants (ordre donné par l’appelant)
  → expected { Object (ok, nom, ...) } to deeply equal { ok: true, …(2) }
Tests  2 failed | 12 passed (14)
```

**2. Un email vide `''` est accepté comme adresse** (`texteNonVide` → simple test de
nullité) — **5 tests rouges**, dont le test de puissance n°8 :

```
× Test 8 — PUISSANCE : un email vide est une absence d’email, pas une adresse
  → expected true to be false // Object.is equality
× Test 2 — repli sur le contact PRINCIPAL quand `representative` n’est que des espaces
  → expected { ok: true, nom: '   ', …(1) } to deeply equal { ok: true, …(2) }
Tests  5 failed | 9 passed (14)
```

**3. Réintroduction du repli sur un autre contact** (la règle annulée par Laurent) —
**1 test rouge**, exactement celui qui garde la règle :

```
× Test 6 — AUCUN REPLI : représentant sans email ⇒ refus, MÊME si un autre contact en a un
  → expected true to be false // Object.is equality
Tests  1 failed | 17 passed (18)
```

**4. Le garde-fou « régime incohérent » retombe sur un `NA` silencieux**
(`avertissementsRegimeIncoherent` rend toujours `[]`) — **7 tests rouges**, sur les deux
modules :

```
× resolveRegimeSignature > cas Florent HAUSSWIRTH : sponsor salarié + EI rattachée
  → expected [] to deeply equal [ { docType: 'AGEFICE', …(1) }, …(1) ]
× resolveRegimeSignature > PUISSANCE — retomber sur un `NA` silencieux doit ROUGIR
  → expected [] to deeply equal [ { docType: 'AGEFICE', …(1) } ]
× resolveRegimeSignature > EI rattachée SANS catalogue : le lien seul suffit à signaler
  → expected [] to deeply equal [ { docType: 'AGEFICE', …(1) } ]
× resolveRegimeSignature > une autre organisation qui n’ouvre QUE le dossier …
  → expected [] to deeply equal [ { docType: 'AGEFICE', …(1) } ]
× planifierEnvoi > AVANT : la convention part, le dossier de financement est SIGNALÉ
  → expected [] to deeply equal [ { …(4) } ]
× planifierEnvoi > un avertissement ne déclenche AUCUN envoi
  → expected [] to not deeply equal []
× planifierEnvoi > les avertissements suivent le SCOPE
  → expected [] to deeply equal [ 'AGEFICE' ]
```

**5. D-4 d'origine — le dossier de financement rejoint l'envoi de convention** —
**2 tests rouges** :

```
× Scénario 2 — TNS via son EI : TROIS envois distincts, jamais un seul groupé
  → expected [ 'CONVENTION:org-ei-1' ] to deeply equal [ 'CONVENTION:org-ei-1', …(1) ]
× PUISSANCE — fusionner le dossier de financement dans la convention doit ROUGIR
  → expected [ 'CONVENTION:org-ei-a', …(1) ] to deeply equal [ 'CONVENTION:org-ei-a', …(3) ]
Tests  2 failed | 9 passed (11)
```

## Là où le plan s'est révélé faux au contact du code

**1. Ajouter `isPrimary: true` au `select` ne suffit pas — et casse un test existant.**

Le plan désignait cette retouche comme « la seule modification de requête autorisée ».
Appliquée telle quelle (select élargi + lecture du drapeau), elle fait **rougir** un test
que le critère d'acceptation interdit de toucher :

```
× generateConventionEntrepriseCore — représentant légal
  > retombe sur le CONTACT PRINCIPAL quand le champ représentant est vide
  → expected false to be true // Object.is equality
Tests  1 failed | 29 passed (30)
```

Motif : le mock Prisma des tests (`orgFindFirstMock.mockResolvedValue(...)`) rend les
fixtures **telles quelles** et ignore le `select`. La fixture du test écrit
`contacts: [{ firstName: 'Gilles', lastName: 'Blanchon' }]` — sans `isPrimary`. Le drapeau
arrive donc `undefined`, le contact est écarté, et le repli tombe en refus.

Ce qui a été fait à la place : le `select` reste **inchangé**, et l'appelant déclare
`isPrimary: true` en construisant l'objet passé au module. Ce n'est pas une supposition —
la requête filtre déjà `where: { isPrimary: true }`, et cette forme est elle-même
verrouillée par le test « ne charge QUE le contact principal, le plus ancien, scopé
tenant ». Le commentaire du code le dit et pointe le test.

**2. Le cas Florent produit DEUX avertissements, pas un.**

Le plan exigeait `toEqual([{ docType: 'AGEFICE', raison: 'REGIME_INCOHERENT' }])`. Mais
avec le régime réel d'une EI rattachée (`ageficeSigner` **et** `assiduiteSigner` à
`STAGIAIRE`), **deux** pièces sont hors régime chez le sponsor et ouvertes ailleurs :
l'assertion exacte est donc `[AGEFICE, ASSIDUITE]`. C'est plus juste — les deux pièces
manquent réellement — et l'assertion reste exacte, donc mutante. Le cas à un seul
avertissement existe aussi, dans deux tests dédiés : lien `EI_SELF` seul, et autre
organisation dont le catalogue n'ouvre que le dossier de financement.

**3. « les 32 tests de `convention-entreprise.test.ts` » — il y en a 30.**

Comptage réel : 30 tests, tous verts, fichier **non modifié** (`git diff --exit-code`
passe contre la base).

**4. La vérification n°4 du plan (grep brut) est un faux positif depuis C.1.**

```
grep -nE 'OPCO_EP|OPCOMMERCE|FI-FPL|ATLAS|\bCPF\b|\bcode\s*===' …/{regime,plan-envoi,representant}.ts
regime.ts:6: * `OpcoCatalog.requiredDocs` est de la prose d'affichage (vide chez ATLAS et
regime.ts:7: * OPCOMMERCE) qui ne dit jamais QUI signe, et le code tranchait par
```

Les deux lignes sont dans l'**en-tête de commentaire** qui explique justement pourquoi le
module existe. Le test-garde, lui, retire les commentaires avant de chercher et passe sur
les trois modules. Le grep du plan est à corriger, pas le code.

**5. La numérotation `D-5` du plan n'est pas celle de la spec.**

Le plan appelle « D-5 » la décision « régime incohérent ». Dans la spec, **D-5 = relances
aux signataires (cron J+3/J+7)**. Les commentaires du code renvoient donc à « Laurent,
10/09/2026 — spec §5 lot C, amendement n°4 », pas à un numéro qui désignerait autre chose.

## D-4 amendé, tel qu'implémenté

- `CONVENTION` de cible `ORGANISATION` → **un** envoi par organisation, `participantIds`
  triés, libellé `Convention — AGENCE MARTIN (3 participants)`.
- `CONVENTION` de cible `PARTICIPANT` (régime où le stagiaire signe sa propre convention)
  → un envoi par participant.
- `AGEFICE` et `ASSIDUITE` → **toujours** un envoi par participant, jamais fusionné.
- Clé stable et idempotente : `CONVENTION:org-1`, `AGEFICE:part-3`. C'est elle que l'UI
  cochera et que la server action recevra — pas un index de tableau.
- Ordre de sortie déterministe : pièces dans l'ordre de `DOC_TYPES_SIGNABLES`, puis clé
  triée. Vérifié par un test qui appelle deux fois avec les participants inversés.

## Les gates, sortie réelle

```
pnpm lint      → Tasks: 3 successful, 3 total
                 2 warnings PRÉEXISTANTS, fichiers non touchés :
                   parametres/page.tsx:226 (jsx-a11y/alt-text)
                   diagnostic-r1/use-autosave.ts:51 (react-hooks/exhaustive-deps)
pnpm --filter @qualiof/web exec tsc --noEmit  → aucune erreur
pnpm test      → Test Files 260 passed (260)
                 Tests 2456 passed | 2 skipped (2458)
```

Vérifications ciblées :

```
git diff --exit-code 6a2a509..HEAD -- …/convention-entreprise.test.ts   → OK, intact
git diff --name-only 6a2a509..HEAD | grep '\.tsx$'                      → aucun
git diff --name-only 6a2a509..HEAD | grep migrations                    → aucune
```

## Ce qui reste à faire

- **C.2a-2** — tâche 3 du plan : `sendForSignature` (garde-fous, transaction atomique,
  `AuditLog signature.sent`), `sendForSignatureSchema` dans `packages/shared`. Les contrats
  qu'elle consommera sont figés ici. Elle devra **journaliser la surcharge d'email**
  (`source: 'SAISI_PAR_ADMIN'`, nom + email retenus, tous deux rendus par
  `resoudreEmailRepresentant`).
- **C.2b** — l'UI : bouton, récapitulatif des signataires, champ de saisie de l'adresse de
  substitution, affichage des blocages et avertissements.
- **C.2a-bis** — le PDF à signer n'a pas encore ses ancres (`signatureTags: true` n'est
  passé par aucun générateur). Tant qu'il manque, un envoi réel rendra
  `signatureFieldCount = 0` et sera **refusé** — bruyamment, ce qui est le bon
  comportement, mais il faut le savoir.
- **C.2c** (emails aux signataires) et **C.3** (webhook, retour du signé) : inchangés.

## Vérifications à faire à la main

Rien à cliquer : ce lot ne produit **aucune** interface et **aucun** appel réseau. La seule
vérification humaine utile est de relire le bloc d'amendements ajouté en §5 lot C de la
spec, et de confirmer que les 4 points correspondent bien aux décisions prises.

## Point d'hygiène, non traité (hors périmètre)

`apps/web/tsconfig.tsbuildinfo` est un artefact de build **suivi par git** : il se salit à
chaque `tsc --noEmit`. Il a été restauré (`git checkout`) et n'est dans aucun commit de ce
lot. Le retirer du suivi (`git rm --cached` + `.gitignore`) est un chantier à part.
