---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-5
subsystem: inscriptions-crm
tags: [inscription, financeur, sponsor-org, audit, multi-tenant, deep-link]
requires:
  - quick-260910-c2b-1 # lib/signature/participants-regime.ts (le régime lit sponsorOrg.opcoCode)
provides:
  - "changerFinanceurInscription : le commanditaire d'une inscription devient corrigeable sans supprimer/recréer"
  - "deux refus nominatifs — dossier OPCO déjà parti, pièce déjà signée"
  - "AuditLog 'participant.sponsor_changed' écrit DANS la transaction, les deux sponsors nommés"
  - "champ « Financeur de l'inscription » dans EditParticipantButton, distinct du « Mode de financement »"
  - "forme d'URL publiée pour ouvrir ce formulaire sur un participant, champ financeur en évidence"
  - "la seconde porte d'écriture du financeur (updateParticipant) est condamnée"
affects:
  - "apps/web/src/server/actions/sessions.ts (updateParticipant perd sa branche sponsorOrgId)"
  - "le futur lien « Corriger le financeur de l'inscription → » du bloc Signature (lot suivant)"
key-files:
  created:
    - apps/web/src/lib/enrollment/verrou-financeur.ts
    - apps/web/src/lib/enrollment/__tests__/verrou-financeur.test.ts
    - packages/shared/src/schemas/participant-sponsor.ts
    - apps/web/src/server/actions/participant-sponsor.ts
    - apps/web/src/server/actions/__tests__/participant-sponsor.test.ts
    - apps/web/src/lib/sessions/lien-corriger-financeur.ts
    - apps/web/src/lib/sessions/__tests__/lien-corriger-financeur.test.ts
    - apps/web/src/components/sessions/__tests__/edit-participant-financeur.test.tsx
    - apps/web/src/server/actions/__tests__/update-participant-sponsor-verrouille.test.ts
  modified:
    - apps/web/src/components/sessions/edit-participant-button.tsx
    - apps/web/src/server/actions/sessions.ts
    - packages/shared/src/schemas/index.ts
metrics:
  tasks: 4
  commits: 4
  mutations: 11
  tests_ajoutes: 59
---

# Quick C.2b-5 : corriger le financeur d'une inscription

Une inscription rattachée au mauvais commanditaire n'était corrigeable qu'en la
supprimant puis en la recréant. Elle l'est maintenant — sauf quand un dossier est
déjà parti chez le financeur ou qu'une pièce est déjà signée, deux cas où le
changement fabriquerait un mensonge au lieu de corriger une erreur.

## La forme d'URL retenue

C'est le contrat avec le lot qui câblera le lien. Publiée et testée dans
`apps/web/src/lib/sessions/lien-corriger-financeur.ts` :

```
/app/sessions/{sessionId}?tab=session&inscription={participantId}&champ=financeur&retour=avant
```

| Paramètre      | Rôle                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| `tab=session`  | l'onglet qui PORTE le formulaire — **non négociable**, voir ci-dessous    |
| `inscription=` | l'inscription dont la modale s'ouvre (comparée à l'id de chaque ligne)    |
| `champ=`       | le champ mis en évidence — `financeur` est la seule valeur reconnue       |
| `retour=`      | l'onglet où revenir une fois l'édition terminée (validé par `coerceTab`)  |

Le lot suivant n'a pas à recomposer cette chaîne à la main :

```ts
import { lienCorrigerFinanceur, LIBELLE_LIEN_CORRIGER_FINANCEUR }
  from '@/lib/sessions/lien-corriger-financeur';

lienCorrigerFinanceur({ sessionId, participantId, retour: 'avant' });
// → /app/sessions/…?tab=session&inscription=…&champ=financeur&retour=avant
```

**Pourquoi `tab=session` est obligatoire.** Les panneaux d'onglet inactifs sont
rendus `hidden`, donc `display:none`, ce qui masque jusqu'aux enfants
`position:fixed`. Ouvrir la modale depuis `?tab=avant` produirait une modale
RÉELLEMENT ouverte et TOTALEMENT invisible. D'où le détour : le lien emmène sur
l'onglet « Session », et `retour=avant` ramène après enregistrement.

Après enregistrement (ou annulation), `queryApresEdition` efface les trois
paramètres du formulaire, pose `tab=<retour>` et **préserve les paramètres
étrangers** (`from=`, le fil d'Ariane). `retour=session` rend une URL propre,
sans `?tab=session` résiduel — même convention que `<SessionTabs>`.

## Ce qui a été livré, fichier par fichier

### 1. `apps/web/src/lib/enrollment/verrou-financeur.ts` — le verrou, pur

`verrouChangementFinanceur({ nomParticipant, dossiers, pieces })` rend
`{ bloque: false }` ou `{ bloque: true, motif, message }`.

- **Statuts bloquants** : `SENT`, `ACK_RECEIVED`, `APPROVED`, `REIMBURSED`.
- **Non bloquants** : `DRAFT`, `REJECTED`, `CANCELED`. **La lecture de Laurent est
  confirmée par le code** : le schéma commente lui-même `DRAFT` en « composé mais
  pas envoyé » et `REJECTED` en « refus ». Interdire là interdirait la réparation.
- **Pièce signée** : `signedPdfUrl` non vide **ou** `status === 'signed'`.
- Les deux listes de statuts sont écrites en dur et un test de sanité vérifie
  qu'elles couvrent exactement les 7 valeurs de `OpcoSubmissionStatus`, sans
  recouvrement : un 8ᵉ statut ajouté à l'enum fera rougir plutôt que de basculer
  silencieusement du côté non bloquant.

Messages (nominatifs, français, avec une sortie) :

> Financeur non modifiable pour Marion DELAUNAY : son dossier de prise en charge
> chez AGEFICE Grand Est est déjà parti (statut « accord de prise en charge
> reçu »). Faites annuler ou refuser ce dossier (statut Annulé ou Refusé) avant
> de re-rattacher l'inscription — sinon le dossier et l'inscription ne
> désigneraient plus le même financeur.

> Financeur non modifiable pour Marion DELAUNAY : la pièce « Convention de
> formation » est déjà signée et nomme l'entreprise bénéficiaire — la changer
> maintenant la ferait mentir. Désinscrivez puis réinscrivez Marion DELAUNAY avec
> le bon financeur, ou faites annuler cette signature, avant de corriger.

### 2. `packages/shared/src/schemas/participant-sponsor.ts` — Zod

`ChangerFinanceurInscriptionInputSchema` (2 UUID stricts),
`ListerFinanceursInputSchema` (`q` ≤ 120 car., `participantId` UUID optionnel),
`LIMITE_FINANCEURS_PROPOSES = 50`. Exporté depuis `schemas/index.ts`.

### 3. `apps/web/src/server/actions/participant-sponsor.ts` — l'action dédiée

`changerFinanceurInscription({ participantId, sponsorOrgId })` :

1. `requireRole(['ADMIN','MANAGER'])` — le même ensemble que les actions de
   signature, et **plus étroit** que `updateParticipant` (qui inclut `COMMERCIAL`).
2. Zod, avant toute requête.
3. Lecture de l'inscription avec `session.tenantId`, le nom de l'apprenant, les
   `opcoSubmissions` (statut + financeur destinataire nommé) et les
   `agreementDocs` (type, statut, `signedPdfUrl`).
4. **Cloisonnement tenant** → « Inscription introuvable. » (on ne distingue pas
   « pas à vous » de « n'existe pas » : la distinction est déjà une fuite).
5. Même financeur → no-op strict : aucune écriture, aucun `AuditLog` vide.
6. **Les deux refus** via le verrou pur.
7. **Organisation cible** cherchée `{ id, tenantId: user.tenantId }` — un id
   deviné ne suffit pas à rattacher chez le voisin. Refus nominatif si absente,
   refus distinct si archivée.
8. **Transaction interactive** : `tx.sessionParticipant.update` **puis**
   `tx.auditLog.create` avec `action: 'participant.sponsor_changed'`, et un `diff`
   qui porte `{ participant: { id, nom }, sessionId, before: { sponsorOrgId,
   sponsorOrgLabel, opcoCode }, after: { … } }` — **les sponsors nommés**, parce
   qu'un UUID seul ne raconte plus rien six mois après une fusion d'organisations.
9. `revalidatePath('/app/sessions/{sessionId}')`.

`listerFinanceursPossibles({ q?, participantId? })` : `findMany` **toujours** scopé
`tenantId` + `archived: false`, plafonné à 50, et — si `participantId` est fourni —
remonte `financeurActuelId` ainsi que l'organisation courante *même si elle sort
du plafond ou de la recherche*, sinon le sélecteur s'ouvrirait sur « aucun
financeur » pour une inscription qui en a un. La relecture du courant est elle
aussi scopée tenant.

### 4. `apps/web/src/components/sessions/edit-participant-button.tsx`

- Libellé **exactement** « Financeur de l'inscription », `htmlFor`/`id` propres.
- Levée d'ambiguïté explicite à l'écran, sous chacun des deux champs :
  - Mode de financement → « **COMMENT** l'inscription est financée (OPCO, CPF,
    entreprise, autofinancement…). »
  - Financeur de l'inscription → « **PAR QUI** l'inscription est portée :
    l'organisation commanditaire, celle qui apparaît sur la convention et dont
    dépend le régime de signature. »
- Ouverture pilotée par l'URL (`useSearchParams`), mise en évidence
  (`data-champ-en-evidence` + anneau + focus + `scrollIntoView`), retour sur
  l'onglet `?retour=`.
- **Le financeur d'abord, et il peut tout arrêter** : si le changement est refusé,
  `updateParticipant` n'est PAS appelé. Un enregistrement à moitié fait est pire
  qu'un refus.
- Rôle insuffisant : le sélecteur n'est pas rendu et l'écran dit pourquoi. Un
  champ visible que le serveur refusera est un champ qui ment.

### 5. `apps/web/src/server/actions/sessions.ts` — la seconde porte condamnée

Voir « Écart avec l'énoncé » ci-dessous.

## Écart avec l'énoncé — à lire

L'énoncé affirmait : « **aucune server action du dépôt ne met à jour
`sponsorOrgId`** sur une inscription existante ». **C'est inexact à la lettre.**
`updateParticipant` (`apps/web/src/server/actions/sessions.ts`) acceptait
`sponsorOrgId?: string` dans sa signature et l'écrivait :

```ts
if (input.sponsorOrgId && input.sponsorOrgId !== part.sponsorOrgId) {
  const sponsor = await prisma.organization.findFirst({
    where: { id: input.sponsorOrgId, tenantId: user.tenantId },
  });
  ...
  data.sponsorOrg = { connect: { id: input.sponsorOrgId } };
}
```

L'énoncé est en revanche **exact dans les faits** : aucun appelant ne passait ce
champ (vérifié : `updateParticipant` n'a qu'un seul appelant dans tout le dépôt,
`edit-participant-button.tsx`). C'était donc du code mort.

**Mais du code mort qui contourne un garde-fou n'attend qu'un appelant** : ce
chemin n'oppose ni le refus « dossier parti », ni le refus « pièce signée », et
porte un RBAC plus large (`COMMERCIAL` inclus). L'y laisser aurait rendu les deux
refus décoratifs le jour où quelqu'un aurait « simplement branché le champ
existant ». Branche retirée, signature nettoyée, commentaire posé, et gardée par
`update-participant-sponsor-verrouille.test.ts` — dont le test de puissance passe
`sponsorOrgId` **de force** (via un cast) et vérifie que rien n'atteint la base.
Traité en **déviation Rule 2** (garde-fou manquant), pas en Rule 4 : aucune
structure nouvelle, suppression d'un chemin mort.

## Ce que je n'ai PAS fait, et pourquoi

- **`page.tsx` et `session-participants-list.tsx` ne sont pas touchés.** L'autre
  agent travaillait dans `page.tsx` au moment de l'exécution. Plutôt que de
  risquer d'emporter son travail dans un commit, le composant a été rendu
  **autonome** : il relit le financeur courant au serveur à l'ouverture au lieu de
  le recevoir en prop. Ce n'est pas qu'un contournement — c'est la bonne
  conception ici, puisque le formulaire peut s'ouvrir par URL, donc sans que la
  ligne ait été rendue avec une donnée à jour. **Aucun câblage supplémentaire
  n'est requis : le champ est actif dès ce commit.**
- `bloc-signature.tsx` et `recapitulatif-envoi.tsx` : jamais ouverts en écriture.
- Aucune migration : `sponsorOrgId` existe déjà, `NOT NULL`, indexé.

## Une question laissée ouverte (pas tranchée en silence)

Le refus « pièce signée » couvre `signedPdfUrl` non nul **ou** `status = 'signed'`,
exactement comme demandé. **Il ne couvre PAS `status = 'sent_for_signature'`** :
une convention partie chez le signataire, qui imprime déjà l'ancienne entreprise
bénéficiaire, laisse aujourd'hui passer le changement de financeur. C'est
cohérent avec la lettre de l'énoncé, et cohérent aussi avec le fait qu'un envoi en
cours est annulable (lot C.2b-3) — donc réparable. Mais si le bon comportement est
« refuser tant qu'un envoi est en vol, en invitant à l'annuler d'abord », c'est une
ligne à ajouter dans `verrou-financeur.ts`. À trancher.

## Mutations — sortie réelle

Chaque garde-fou a été vérifié en le cassant. `verrou-financeur` est passé par un
stub permissif (RED 12/19) avant son implémentation ; `lien-corriger-financeur`,
le composant et `update-participant-sponsor-verrouille` ont été écrits en RED.

### Les quatre mutations exigées — `participant-sponsor.test.ts` (29 tests)

| # | Mutation                                                                  | Résultat              |
| - | ------------------------------------------------------------------------- | --------------------- |
| a | refus sur `OpcoSubmission` parti retiré (`dossiers: []`)                   | **5 failed** / 24 ok  |
| b | refus sur document signé retiré (`pieces: []`)                            | **2 failed** / 27 ok  |
| c | `AuditLog` sorti de la transaction (client global après le `$transaction`) | **2 failed** / 27 ok  |
| d | `tenantId` retiré des 3 requêtes `organization` (liste, cible, courant)    | **4 failed** / 25 ok  |
|   | *restauré*                                                                | **29 passed**         |

Mutation **c bis**, pour prouver que la ligne
`expect(auditCreateGlobal).not.toHaveBeenCalled()` porte bien quelque chose :
audit écrit **à la fois** dans le `tx` et via le client global → **1 failed**
(`expected "spy" to not be called at all, but actually been called 1 times`).

### Mutations complémentaires

`lien-corriger-financeur.test.ts` (12 tests) — `ONGLET_PORTEUR` passé à `'avant'`
+ `suivants.delete(PARAM_INSCRIPTION)` supprimé → **6 failed / 6 ok** ; restauré →
**12 passed**.

`edit-participant-financeur.test.tsx` (14 tests) :

| Mutation                                                        | Résultat             |
| --------------------------------------------------------------- | -------------------- |
| ouverture redevenue purement locale (`open = openLocal`)          | **4 failed** / 10 ok |
| `data-champ-en-evidence` retiré                                   | **1 failed** / 13 ok |
| un refus n'arrête plus l'enregistrement (pas de `return`)         | **1 failed** / 13 ok |
| `fermer()` n'efface plus les paramètres d'URL                     | **2 failed** / 12 ok |
| les deux textes COMMENT / PAR QUI remplacés par du texte neutre   | **1 failed** / 13 ok |
| *restauré*                                                        | **14 passed**        |

`update-participant-sponsor-verrouille.test.ts` (4 tests) — branche `sponsorOrgId`
rétablie dans `updateParticipant` → **4 failed / 4** ; restauré → **4 passed**.

Aucune mutation n'est restée verte.

## Gates — sortie réelle

```
######## GATE 1 — pnpm lint ########
 Tasks:    3 successful, 3 total
(2 warnings préexistants, hors périmètre : parametres/page.tsx alt-text,
 diagnostic-r1/use-autosave.ts exhaustive-deps)

######## GATE 2 — tsc --noEmit (@qualiof/web) ########
exit=0

######## GATE 3 — turbo run test --force (sans cache) ########
@qualiof/shared:test:  Test Files  15 passed (15)      Tests  195 passed (195)
@qualiof/db:test:      Test Files   3 passed (3)       Tests   20 passed (20)
@qualiof/web:test:     Test Files 279 passed (279)     Tests 2738 passed | 2 skipped (2740)
 Tasks:    3 successful, 3 total
```

## Commits

| Hash      | Objet                                                                 |
| --------- | --------------------------------------------------------------------- |
| `e36a2da` | `feat(inscription)` verrou pur du changement de financeur              |
| `404678d` | `feat(inscription)` server action dédiée + Zod partagé                 |
| `b66af2f` | `feat(inscription)` champ « Financeur de l'inscription », URL          |
| `d431d38` | `fix(inscription)` condamne la seconde porte dans `updateParticipant`  |

## Self-Check: PASSED
