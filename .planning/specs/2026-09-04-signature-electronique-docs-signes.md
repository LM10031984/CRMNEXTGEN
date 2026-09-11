# Spec — Signature électronique & retour des documents signés dans QualiOF

> **Date** : 2026-09-04 · **Auteur** : Laurent + Claude (session Cowork)
> **Statut** : SPEC À VALIDER PAR LAURENT, puis à implémenter — lots A → D, chaque lot livrable seul.
> **Pour** : Claude Code, dépôt QualiOF (`files/`), worktree `files-signature` sur la branche `feat/signature-docs-signes` créée depuis `cloud-migration`.
> **Pré-requis de lecture** : `.planning/notes/PLAN-CLOUD-MIGRATION.md` §E (Yousign — décision initiale, écartée le 04/09 pour le prix), `VISION.md` Lot 4, `apps/web/src/server/actions/qualiopi-matrix.ts` (`uploadSignedDoc` — l'upload signé existe déjà par cellule).

---

## 0. Le problème, tel que formulé le 04/09

Le CRM génère conventions, dossiers AGEFICE, attestations d'assiduité et fiches d'émargement, mais la signature se passe **hors** CRM : envoi par Adobe Sign (« une merde absolue »), puis les PDF signés atterrissent sur Google Drive et s'éparpillent. La source de vérité documentaire n'est donc plus QualiOF, ce qui casse le pack audit Qualiopi et le dossier financeur.

## 1. Décisions d'orientation (Laurent, 04/09/2026)

| # | Décision | Conséquence |
|---|---|---|
| O-1 | **Le PDF signé revient dans QualiOF.** Drive n'est plus une destination de travail (au mieux une copie d'archive, hors scope v1). | Toute signature — électronique ou manuscrite scannée — finit dans le bucket `qualiof-docs` et sur la ligne `Document` / `docStatus` correspondante. |
| O-2 | **Signature électronique pour 3 types** : `CONVENTION`, `AGEFICE`, `ASSIDUITE`. Niveau **simple (SES)**, mais avec une **preuve de signature délivrée par un tiers** : les AGEFICE demandent régulièrement le rapport d'audit / certificat de signature « comme Adobe » (précision Laurent 04/09). Une page de preuve maison risque d'être refusée par le financeur. | Yousign écarté (API Plus 104 € HT/mois = 1 248 €/an pour 500 signatures — « abusé »). **Choix : DocuSeal** (cloud Pro ≈ 20 $/utilisateur/mois, signatures illimitées, API + webhooks ; certificat de signature / audit log généré à la complétion : horodatages, IP, email vérifié, ID d'enveloppe ; PDF final signé numériquement — à **vérifier en sandbox qu'Adobe Reader affiche bien le panneau de signature**, c'est le test d'acceptation du lot B). Port `SignatureProvider` pour pouvoir remplacer par Yousign si un jour un financeur exige un prestataire français, ou par une implémentation native si DocuSeal disparaît. |
| O-3 | **L'émargement reste signé à la main** (feuille papier en salle). | Il faut un **endroit visible où déposer le scan** — glisser-déposer au niveau session, pas seulement le menu caché d'une cellule de la matrice. |
| O-4 | Adobe Sign est abandonné dès que le lot C est livré. | Aucune migration des envois Adobe passés. |

## 2. Ce qui existe déjà (ne rien reconstruire)

| Brique | État au 04/09 | Usage ici |
|---|---|---|
| `Document` (Prisma) | `pdfUrl`, `hashSha256`, `status` (défaut `"generated"`, jamais avancé), `entityType` session/participant/product | On lui ajoute la trace de signature (§4). |
| `uploadSignedDoc` (`qualiopi-matrix.ts`) + `UploadSignedDocDialog` + `DocCellMenu` → « Téléverser le PDF signé » | **Fonctionne**, par cellule participant × docType. Clé `signed/{tenantId}/{sessionCode}/{participantId}-{docType}-{sha8}.pdf`, `docStatus[docType] = { state: 'MANUAL_OK', uploadedSignedPdfKey }`. | C'est le socle du lot A : on le rend visible et multi-participants, on ne le refait pas. |
| `deriveCellState` | États `GENERATED / MANUAL_OK / MISSING / NA`, `MANUAL_OK` prioritaire. | On ajoute `E_SIGNED` (§4.3). |
| Storage adapter (`lib/storage.ts`) MinIO local / Supabase cloud | `uploadFile`, `downloadFile`, `createSignedDownloadUrl`. | Inchangé. |
| `/api/documents/[id]` | Sert le PDF d'un `Document` (302 signed URL en prod). | Doit servir le **signé** quand il existe (§4.2). |
| `OpcoSubmission` (DRAFT → SENT → …), pièces jointes `attachments` | Le dossier AGEFICE part par mail au financeur. | L'envoi financeur doit prendre les **versions signées** (§5.4). |
| Cron Vercel (`opco-submission-reminders`, `closure-worker`…), `AuditLog`, mailer fail-closed, `Task` | Patterns à réutiliser tels quels. | Relances, journal, alertes. |
| Fiche session, onglets Avant / Après / Tous les documents (`tab-avant.tsx`, `tab-apres.tsx`, `tab-tous-documents.tsx`) | Règle LOCKED « 1 doc = 1 maison » : Tous-docs MONTRE, Avant/Après AGISSENT. | Le bouton « Envoyer pour signature » vit dans Avant (convention, AGEFICE) et Après (assiduité). La zone de dépôt (lot A) est une action → elle vit dans Avant/Après aussi, pas dans Tous-docs. |

## 3. Les 3 moments de signature

```
AVANT session (J-15 idéalement, cf. plan cloud §E)
  ├─ CONVENTION  : 1 doc par organisation payeuse (convention entreprise) ou par participant (indépendant)
  │                signataires : responsable de l'organisation bénéficiaire (Contact / LegalLink)  +  OF
  └─ AGEFICE     : 1 doc par participant AGEFICE — demande de prise en charge
                   FORMULAIRE OFFICIEL rempli par pdf-lib (pas un gabarit HTML) ;
                   ancre DESSINÉE dans la case « signature du demandeur ».
                   1 SEUL signataire : le stagiaire-dirigeant TNS (Person.email).
                   L'OF n'y re-signe pas — son image est déjà apposée.
PENDANT session
  └─ EMARGEMENT  : papier, signé en salle → scan déposé (lot A). Pas de Yousign.
APRÈS session (clôture)
  └─ ASSIDUITE   : 1 doc par participant AGEFICE
                   signataires : stagiaire  +  OF
```

**Règle métier ajoutée le 10/09 (Laurent) — qui signe quoi dépend du régime de financement du participant, jamais d'un `if` sur le code financeur (piloter par `OpcoCatalog.requiredDocs`, règle `/financeur`) :**

| Participant | CONVENTION | AGEFICE | ASSIDUITE | EMARGEMENT |
|---|---|---|---|---|
| Salarié d'une entreprise (OPCO EP ou autre OPCO) | signée par le **responsable de l'organisation** + OF — le salarié ne signe **rien** | — | **aucune** (l'attestation d'assiduité est une pièce AGEFICE, pas OPCO) | papier, en salle |
| Dirigeant TNS financé AGEFICE | s'il est lui-même l'entreprise bénéficiaire : il signe la convention ; s'il est salarié-dirigeant couvert par la convention entreprise : idem ligne 1 | signée par le **stagiaire-dirigeant** (OF = image) | stagiaire + OF | papier, en salle |
| Indépendant hors AGEFICE / autofinancement | signée par lui-même + OF | — | — | papier, en salle |

Conséquences pour le lot C : l'envoi « AVANT » ne crée un dossier AGEFICE que pour les participants dont le financeur l'exige ; l'envoi « APRÈS » (assiduité) est **vide** pour une session 100 % salariés OPCO et ne doit pas proposer le bouton ; la matrice affiche NA (pas MISSING) pour ASSIDUITE/AGEFICE d'un salarié OPCO.

### 3 bis. Qui signe quoi dépend du RÉGIME DE FINANCEMENT (Laurent, 10/09/2026)

Le découpage ci-dessus vaut pour un dossier AGEFICE. Il ne vaut pas pour tous.

| Régime | Convention | Dossier AGEFICE | Assiduité |
|---|---|---|---|
| **Salarié financé OPCO** | signée par le **responsable de l'organisation** | — | **aucune** |
| | le salarié ne signe **rien** | | |
| **TNS AGEFICE** | — | **oui**, par le stagiaire-dirigeant | **oui** |
| **Indépendant** | **sa** convention, qu'il signe lui-même | selon éligibilité | selon éligibilité |

Conséquences attendues :
- une session **100 % OPCO** n'a **rien** à envoyer en signature côté APRÈS :
  le bouton « Envoyer pour signature » doit être **absent**, pas grisé — un bouton
  grisé laisse croire qu'il manque un réglage ;
- dans la matrice, un document **hors régime** est **`NA`**, jamais `MISSING`.
  `MISSING` appelle une action ; `NA` dit qu'il n'y a rien à faire. Confondre les
  deux fait courir l'admin après des pièces qui n'existent pas.

**Piloté par la donnée, pas par le code financeur.** Aucun `if (code === 'AGEFICE')`
dans le moteur : c'est `OpcoCatalog` qui porte la règle, comme
`ProductFundingType` porte le taux horaire.

> ⚠ **`OpcoCatalog.requiredDocs` ne peut pas piloter ça en l'état** — constaté le
> 10/09/2026 en prod. C'est du texte libre destiné à la fiche financeur :
> « Convention de formation signée, Programme de formation détaillé, … ». Deux
> financeurs sur six (ATLAS, OPCOMMERCE) l'ont **vide**. Un moteur qui déduirait
> les signataires de cette prose serait un analyseur de chaînes déguisé.
>
> Il faut donc, avant le lot C, **structurer la règle** : soit `requiredDocs`
> devient une liste de `DocType` (et la prose actuelle passe dans un champ
> d'affichage), soit on ajoute à `OpcoCatalog` un champ dédié — par exemple
> `signatureMatrix: Json` de forme `{ CONVENTION: 'DIRIGEANT' | 'STAGIAIRE' | null,
> AGEFICE: 'STAGIAIRE' | null, ASSIDUITE: 'STAGIAIRE' | null }`. **Décision à
> prendre (D-10)**, avec reprise des 6 financeurs du catalogue.

### 3 ter. Le MOT — « responsable de l'organisation », jamais « dirigeant » (Laurent, 11/09/2026)

Précision métier, et elle change ce que l'écran doit écrire : pour un salarié, le
signataire de la convention est le **responsable d'agence** — la personne désignée
comme `Organization.representative` sur la fiche de l'organisation bénéficiaire.
**Pas nécessairement le représentant légal.**

- **« Dirigeant » est proscrit à l'écran et dans cette spec** partout où le mot
  désigne ce signataire. Motif : « dirigeant » (comme « représentant légal »)
  affirme une **qualité juridique que la donnée ne porte pas**. `representative`
  est un champ libre ; il dit seulement **qui représente l'organisation et signe
  ses conventions**. Le mot faux fait chercher un mandataire social, fait hésiter
  à saisir le nom qui convient, et pousse à « corriger » une cascade qui est juste.
- **La cascade ne change pas** : `Organization.representative`, sinon le **premier
  contact principal** (`isPrimary`, le plus ancien) — `lib/signature/representant.ts`,
  appelée par la génération de convention ET par le moteur d'envoi. Seul le
  vocabulaire bouge.
- **Le renommage est TEXTUEL, jamais structurel.** `SignerRole.DIRIGEANT`,
  `LinkRole.DIRIGEANT`, la colonne `OpcoCatalog.conventionSigner` et les
  migrations gardent leurs valeurs : elles sont en base, seedées et migrées.
  Migrer des valeurs d'enum dans un lot de libellés ne se voit qu'en production.
  Garde exécutable : `lib/signature/__tests__/vocabulaire-responsable.source.test.ts`
  (le mot interdit dans les fichiers d'écran **et** la frontière des enums).
- **`LinkRole.DIRIGEANT` garde son libellé « Dirigeant »** sur la fiche
  organisation : il dit le rôle d'une PERSONNE dans une organisation, pas qui
  signe. Aligner les deux mots ferait croire que le badge désigne le signataire.
- **Sur la fiche organisation**, le champ s'appelle **« Responsable — signe les
  conventions »**, affiche **son email**, et porte un **avertissement nominatif
  quand l'adresse manque** : sans elle, aucune convention ne peut partir en
  signature pour cette organisation (refus nominatif du moteur depuis C.2a).
  L'admin l'apprenait jusqu'ici au moment d'envoyer, sur un autre écran, après
  avoir préparé son dossier.

> Reste volontairement « dirigeant » dans cette spec : **« stagiaire-dirigeant »**
> et **« Dirigeant TNS »** (§3, §3 bis, lot B). Le mot y désigne le TNS
> lui-même — celui qui signe son dossier AGEFICE via `Person.email` — et pas le
> signataire résolu sur `representative`. Le remplacer y serait faux.

Le signataire « OF » est toujours le même : un `TenantSignatory` (nom, email, rôle) configuré une fois dans les paramètres tenant, signé automatiquement en premier ou en dernier selon le réglage (par défaut : OF signe **après** le client, comme aujourd'hui).

## 4. Modèle de données

### 4.1 `Document` — enrichissement (migration additive, aucun backfill)

```prisma
model Document {
  // … existant …
  signedPdfUrl     String?    // clé bucket du PDF signé (provider e-signature OU scan)
  signedAt         DateTime?
  signatureKind    SignatureKind?   // E_SIGNATURE | MANUAL_SCAN
  signatureRequestId String?  @unique
  signatureRequest SignatureRequest? @relation(fields: [signatureRequestId], references: [id])
}
enum SignatureKind { E_SIGNATURE MANUAL_SCAN }
```

`status` (String) prend les valeurs `generated | sent_for_signature | signed | declined | expired`. On n'en fait pas un enum Prisma en v1 (colonne String existante, aucune reprise).

### 4.2 `SignatureRequest` (nouveau, prévu VISION Lot 4)

```prisma
model SignatureRequest {
  id              String   @id @default(uuid())
  tenantId        String
  provider        String   @default("yousign")
  providerId      String   @unique      // id de la submission chez le provider
  status          SignatureRequestStatus @default(DRAFT)
  sessionId       String
  session         TrainingSession @relation(...)
  documents       Document[]            // 1 envoi peut porter plusieurs docs (convention + AGEFICE)
  signers         Json                  // [{ role, name, email, providerSignerId, status, signedAt }]
  sentAt          DateTime?
  completedAt     DateTime?
  expiresAt       DateTime?
  auditTrailUrl   String?               // clé bucket du certificat de signature (audit log) du provider
  lastError       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([tenantId, sessionId])
}
enum SignatureRequestStatus { DRAFT SENT PARTIALLY_SIGNED DONE DECLINED EXPIRED CANCELED }
```

### 4.3 `deriveCellState` — nouvel état

`E_SIGNED` (pdfRef → `Document.signedPdfUrl`), prioritaire sur `GENERATED`, au même rang que `MANUAL_OK`. Badge matrice : vert plein « Signé ✓ » ; `MANUAL_OK` reste « Signé (scan) » ; nouveau `PENDING_SIGNATURE` (orange, « En attente de signature ») quand `status = sent_for_signature`.

`/api/documents/[id]` sert `signedPdfUrl ?? pdfUrl`. Un paramètre `?original=1` sert le non signé (pour re-envoi).

### 4.4 Chemins bucket (convention de nommage unique)

```
sessions/{tenantId}/{sessionCode}/signed/{docType}-{entityId}-{sha8}.pdf
sessions/{tenantId}/{sessionCode}/signed/{docType}-{entityId}-{sha8}.audit-trail.pdf
```
L'ancien préfixe `signed/{tenantId}/…` de `uploadSignedDoc` reste lisible (pas de déplacement) ; les nouveaux écrits utilisent ce chemin. Une session = un préfixe = un dossier qu'on peut zipper (pack audit).

## 5. Lots

### Lot A — Zone de dépôt des scans (émargement & tout doc signé à la main) — ✅ **LIVRÉ le 04/09/2026** (branche `feat/signature-docs-signes`)

Rappel métier (Laurent 04/09) : **la fiche d'émargement est individuelle** (1 PDF par participant, généré par le closure worker, `entityType = participant`). Le scan revient donc participant par participant.

- Composant `<SignedDocDropZone sessionId docType="EMARGEMENT">` dans `tab-apres.tsx` (et, replié, dans `tab-avant.tsx` avec `docType` au choix) : **glisser-déposer multi-fichiers PDF** (max 10 Mo/fichier, mêmes garde-fous que `uploadSignedDoc`).
- Après le drop, une **liste d'affectation** : à gauche les fichiers déposés, à droite les participants de la session (nom + état actuel de la cellule). Chaque fichier se rattache à un participant par un select ; **pré-affectation automatique** quand le nom du fichier contient le nom ou prénom du participant (normalisation sans accents/casse — ex. `emargement-dupont.pdf` → Dupont), sinon vide. Bouton « Enregistrer N fichiers ».
- Variante « un seul scan multipages » : case « Ce PDF contient une fiche par page » → découpage par page (pdf-lib), une fiche par participant dans l'ordre de la liste, ordre modifiable par glisser. Livrable en A.2 si A.1 suffit dans un premier temps.
- Chaque affectation appelle `uploadSignedDoc` existant (refactorisé pour accepter un `Buffer` déjà lu, pas seulement un `FormData`) → clé `signed/…`, `docStatus[docType] = MANUAL_OK`. Si un `Document` de ce type existe pour le participant : `signedPdfUrl / signedAt / signatureKind = MANUAL_SCAN / status = signed`.
- La cellule de la matrice devient elle-même **cible de drop** (survol → surbrillance) : lâcher un PDF sur la cellule Émargement d'un participant = affectation directe, sans passer par la liste. C'est le geste le plus rapide pour 5-8 stagiaires.
- AuditLog `document.signed_scan_uploaded` (sessionId, docType, participantId, key) par fichier.
- RBAC : ADMIN, MANAGER. Tests : affectation, pré-affectation par nom, refus non-PDF / > 10 Mo, découpage multipage.

### Lot B — Modèle + adaptateur DocuSeal (port/adaptateur, comme la facturation électronique)

> **Écarts constatés à l'implémentation (04/09/2026)** — la spec est corrigée ici :
> 1. **§4.1 `signatureRequestId @unique` est retiré.** `@unique` sur la clé étrangère
>    force du 1-1 et rend `documents Document[]` (§4.2) impossible à compiler. C'est
>    « plusieurs documents par envoi » qui porte le besoin (D-4 : convention + N AGEFICE).
> 2. **§4.2 `provider @default("yousign")` devient `"docuseal"`** (décision O-2).
> 3. **`POST /submissions/pdf` répond un OBJET**, pas un tableau de submitters : `{ id,
>    submitters, fields, status }`. L'exemple de la spec OpenAPI publiée décrit la forme
>    de `POST /submissions` (depuis un Template). Vérifié contre l'API réelle.
> 4. **`GET /submissions/{id}` ne renvoie pas `embed_src`**, seulement `slug` : le lien de
>    signature est reconstruit (`https://docuseal.com/s/{slug}`), sinon la relance du lot C
>    n'a aucun lien à envoyer (D-9).
> 5. **Ancres optionnelles** (`signatureTags`, faux par défaut) et non systématiques : la
>    convention et l'attestation d'assiduité **tamponnent la signature de l'OF**. En mode
>    e-signature le tampon est retiré, sinon Laurent signerait deux fois la même pièce dont
>    une fois hors certificat. Le lot C génère donc le PDF à signer avec `signatureTags: true`.
> 6. **Ajout `signatureFieldCount`** sur le retour de `createRequest` : si DocuSeal ne
>    reconnaît aucune ancre, l'envoi part quand même et personne n'a rien à signer —
>    échec silencieux. Le lot C doit refuser un envoi à zéro champ.
> 7. **`/api/documents/[id]` sert `signedPdfUrl ?? pdfUrl`** (règle métier n°2) : c'était
>    une boucle ouverte du lot A, qui écrivait `signedPdfUrl` sans que la route ne le serve.
> 8. **L'ancre réserve la place du champ.** Sur la première convention réellement
>    signée (envoi EU 1619115, 10/09/2026), les deux signatures **débordaient de leur
>    cadre** — celle du client chevauchait la bordure et le libellé du bloc de l'OF.
>    Le champ DocuSeal démarre à l'ancre et s'étend vers le bas : sans place réservée
>    sous elle, il sort du cadre. Sur une pièce contractuelle destinée à un financeur,
>    une signature à cheval entre les deux parties est contestable.
>    L'ancre est devenue une **zone dédiée** : 180 × 60 pt, alignée à droite sous
>    « Date et signature : », marge de 8 pt sur les quatre côtés. Mesuré côté DocuSeal
>    (envoi 1619503) : champs de 180 × 60 pt, bord droit à 525 pt pour un cadre qui
>    s'arrête à ~545 pt, et 10 à 14 pt de garde sous chaque champ. Une seule taille de
>    signature dans tout le corpus documentaire — les 3 gabarits ne portent plus de
>    dimensions propres.

- Migration §4.1 / §4.2 (`SignatureRequest.provider = "docuseal"`, `providerId` = id de submission DocuSeal).
- Dépendance : aucune lib DocuSeal obligatoire (REST simple, `fetch`). `packages/shared` : `TenantSignatory` (nom, email, ordre) dans les paramètres tenant — **D-1**.
- `apps/web/src/lib/signature/port.ts` : interface `SignatureProvider { createRequest, cancel, remind, downloadSignedDocument, downloadAuditTrail, verifyWebhook, parseEvent }`.
- `apps/web/src/lib/signature/docuseal.ts` : API DocuSeal — création d'une *submission* à partir du PDF généré (envoi du PDF en base64 avec champs de signature positionnés), signataires ordonnés (client puis OF), envoi des emails par DocuSeal (ou par QualiOF avec `send_email: false` + lien de signature — **D-9**, préférer QualiOF pour garder le mailer fail-closed et la catégorie décochable), webhooks `form.completed` / `form.declined` / `submission.completed`.
- Champs de signature : DocuSeal supporte les **text tags** dans le PDF
  (`{{Signature;role=…}}`). **Deux mécanismes, pas un** — corrigé le 10/09/2026 :
  - **Convention** (`convention-template.ts`) et **attestation d'assiduité**
    (`closure/agefice-attendance-template.ts`, rendue par le générateur
    `agefice-attendance-generator.ts`) : HTML → WeasyPrint, l'ancre est une
    **zone HTML invisible** (`renderSignatureAnchor`).
  - **Dossier AGEFICE** : ce n'est PAS un gabarit HTML. C'est le **formulaire
    officiel** `src/assets/agefice-template.pdf`, rempli champ par champ par
    `agefice-form-fill.ts` (pdf-lib). `renderAgeficeHtml` n'est appelé par
    personne — vérifié le 10/09. L'ancre y est donc **dessinée** par pdf-lib
    dans la case « Nom prénom et signature du demandeur » (page 3, bas gauche),
    aux coordonnées `ANCRE_DEMANDEUR`.

  Dans les deux cas le port `SignatureProvider` reste ignorant de toute
  géométrie : c'est le PDF qui porte l'ancre, jamais l'appel au prestataire.
  L'alternative — passer à DocuSeal un champ positionné par coordonnées — a été
  écartée pour cette raison : elle aurait fait entrer les `areas` du prestataire
  dans le port, et compliqué toute implémentation future.

  **Le dossier AGEFICE n'a qu'UNE partie signataire** : le stagiaire-dirigeant.
  La case de droite est celle de l'OF et porte déjà l'image de signature de
  Laurent (`applyOfSignature`) — on ne la fait pas re-signer (décision Laurent
  du 10/09/2026).
- `apps/web/src/lib/signature/dry-run.ts` : provider fictif quand `DOCUSEAL_API_KEY` est vide (comme `MAIL_DRY_RUN`) → statut simulé, complétion déclenchable depuis une route dev, pour tests et preview.
- Env : `SIGNATURE_PROVIDER=docuseal|dry-run`, `DOCUSEAL_API_KEY`, `DOCUSEAL_BASE_URL` (cloud `https://api.docuseal.com` ou instance auto-hébergée), `DOCUSEAL_WEBHOOK_SECRET`. Fail-closed : sans clé en prod → bouton désactivé avec message, jamais d'envoi silencieux.
- **Test d'acceptation du lot** : ✅ **PASSÉ le 10/09/2026** (envoi **1619115**, instance UE).
  - Adobe Reader affiche le panneau de signature et déclare la **signature valide
    après mise à jour AATL** — certificat **Netrust**. (`/Type /Sig`,
    `/ByteRange[0 95960 135962 7900]`, `/SubFilter /adbe.pkcs7.detached`, `/AcroForm`.)
  - Le certificat de signature contient l'ID d'enveloppe, les SHA-256 avant/après,
    l'horodatage, et par signataire : email, IP, ID de session, user-agent, fuseau
    et image de la signature tracée. C'est ce qu'on joint au dossier AGEFICE.
  - Pièces versées : `.planning/specs/evidence/signature-B/`.
  - Les deux pièces sont servies par `docuseal.eu` ; `send_email=false` et
    `sent_at=jamais` sur les deux signataires — aucun email n'est parti de DocuSeal.
- Hébergement : cloud DocuSeal en v1 (zéro ops). Auto-hébergement sur Railway (image Docker officielle, gratuit hors infra) envisageable plus tard si le volume ou la souveraineté le justifient — vérifier alors que l'API est incluse dans la version open source.

### Lot C — Envoi, webhook, retour du PDF signé

> **Écarts constatés / amendements (10/09/2026, lot C.2a)** — la spec est corrigée ici,
> sur le modèle du bloc du lot B :
>
> 1. **D-4 AMENDÉ — un envoi porte UN document.** La spec écrivait « 1 SignatureRequest
>    portant la CONVENTION (+ les AGEFICE de ses participants) ». On sépare : une
>    `SignatureRequest` par **organisation bénéficiaire** portant la **seule convention**, et
>    une **par participant** pour son dossier AGEFICE. **Motif** : un dossier AGEFICE n'a
>    qu'UN signataire — le grouper ferait dépendre sa complétion de celle du responsable de
>    l'organisation, et un
>    dossier prêt à partir resterait bloqué derrière une signature qui ne le concerne pas.
>    Implémenté dans `lib/signature/plan-envoi.ts`, verrouillé par un test de puissance
>    (fusionner AGEFICE dans la convention fait rougir la suite).
> 2. **La cascade du signataire n'est pas celle décrite plus bas.** La spec proposait
>    « `Contact` de l'organisation avec `function` dirigeant / signataire » — formulation d'origine,
>    citée telle quelle. Le code qui
>    imprime « Représentée par X » sur la convention depuis le 21/08 résout autrement :
>    `Organization.representative`, sinon le **premier contact principal** (`isPrimary`, le
>    plus ancien). **`Contact.function` n'y joue aucun rôle** — il est saisi librement et ne
>    prouve rien. C'est cette cascade RÉELLE qui fait foi ; elle a été extraite dans
>    `lib/signature/representant.ts` et les deux chemins de `convention-core.ts` l'appellent,
>    pour que le signataire ne puisse plus diverger du nom que le PDF imprime.
> 3. **Aucun repli sur un autre contact** (Laurent, 10/09/2026). Le « sinon premier `Contact`
>    avec email » est **annulé**. Envoyer le lien dans la boîte de B pour une pièce qui nomme
>    A ferait enregistrer l'email et l'adresse IP de B dans le certificat de signature : la
>    preuve serait inexploitable devant un financeur. Représentant sans email ⇒ **refus
>    nominatif**. Seule dérogation : une adresse **saisie explicitement par l'admin** au
>    moment de l'envoi (source `SAISI_PAR_ADMIN`), journalisée avec le nom retenu.
> 4. **Garde-fou « régime incohérent »** (Laurent, 10/09/2026 — cas Florent HAUSSWIRTH). Un
>    participant dont le dossier porte les signaux d'un autre régime (lien `EI_SELF` vers une
>    organisation qui n'est pas le sponsor, ou autre organisation rattachée dont le catalogue
>    OUVRE la pièce) alors que son organisation bénéficiaire ne l'ouvre pas produit un
>    **avertissement nommé**, jamais un `NA` silencieux — un dossier qui disparaît de l'écran
>    ne se corrige jamais. L'avertissement ne déclenche **aucun** envoi : il invite à corriger
>    la donnée.
> 5. **La régénération se fait à l'OUVERTURE DU RÉCAPITULATIF, pas à l'envoi** (Laurent,
>    10/09/2026 — clôt le « point ouvert » ci-dessous). « La régénération avec ancres se fait à
>    l'ouverture du récapitulatif, qui affiche un aperçu du PDF exact qui partira ; le clic
>    Envoyer confirme ce PDF-là, jamais une autre version. » D'où **deux server actions** :
>    `preparerEnvoiSignature` (plan + régénération + hashes + signataires résolus) puis
>    `sendForSignature` (envoi de ce qui a été confirmé).
>
>    ⚠ **Ce que l'ordre des écrans ne garantit pas.** Deux admins en parallèle, ou une
>    régénération déclenchée ailleurs entre l'aperçu et le clic, enverraient autre chose que ce
>    qui a été relu. `sendForSignature` reçoit donc les **hashes vus à l'aperçu** et **refuse**
>    dès qu'un hash a bougé, en invitant à rouvrir le récapitulatif. C'est un contrôle, pas une
>    convention d'appel — verrouillé par un test de puissance.
>
> 6. **Le rôle de l'ancre vient du GABARIT, jamais du régime** (constaté à l'implémentation,
>    10/09/2026). `ANCRES_PAR_PIECE` (`lib/signature/envoi-contrats.ts`) est la **seule
>    autorité** sur le nom de rôle passé au prestataire.
>
>    Le piège, qui aurait été **silencieux** : le régime dit `STAGIAIRE` pour un indépendant
>    signant sa propre convention — mais le gabarit de convention n'écrit qu'une ancre
>    `role=Client`, quel que soit le signataire. Dériver le rôle du régime aurait envoyé un
>    signataire « Stagiaire » sur un PDF ne portant aucune ancre de ce nom : champ non
>    attribué, **personne ne signe, aucune alerte**. `signatureFieldCount` ne l'aurait pas vu
>    — le champ existe bel et bien, il n'est simplement attribué à personne. C'est l'échec
>    silencieux que l'écart n°6 du lot B fermait, revenu par une autre porte.
>
>    **Règle, pour toute pièce signable à venir** : elle déclare son rôle d'ancre dans
>    `ANCRES_PAR_PIECE`, en recopiant ce que son gabarit écrit réellement. Le régime décide
>    **QUI** signe ; le gabarit décide **COMMENT le champ s'appelle**. Ne jamais dériver l'un
>    de l'autre.
>
> 7. **Deux traces pour la régénération : intention puis résultat** (Laurent, 10/09/2026).
>    `document.regenerated_for_signature` ne peut pas partager la transaction du remplacement
>    du `Document` : celui-ci est fait par les générateurs, partagés avec cinq autres
>    appelants (dette ouverte en **lot H**). Si cette trace échouait, un document serait
>    remplacé — `pdfUrl` et `hashSha256` changés — **sans trace**, sur un outil dont un
>    auditeur Qualiopi lit le journal.
>
>    Le trou se ferme par l'autre bout : **`document.regeneration_requested` est écrite AVANT
>    la régénération**, validée seule, et porte **l'ANCIEN hash**. Couplée à `signature.sent`
>    — transactionnel, porteur des hashes réellement confirmés — elle permet de reconstituer
>    ce qui s'est passé même quand la trace de résultat manque. Elle est écrite même si la
>    régénération ne change rien : avant de l'avoir faite, on ne peut pas le savoir. C'est le
>    prix de l'antériorité.
>
> 8. **Le lien « Relancer » du §5 est RETIRÉ de C.2b** (Laurent, 10/09/2026 — lot C.2b-2). Il
>    suppose deux choses qui n'existent pas : un email de relance (**lot C.2c**) et une server
>    action appelant `provider.remind(providerId, signerId)`, qui n'a **aucun appelant**. Un
>    lien qui ne relance rien — ou grisé avec une infobulle — est exactement le « bouton qui
>    laisse croire qu'il manque un réglage » que la décision n°3 interdit.
>
>    À la place, une pièce en attente de signature porte une phrase honnête : « Le lien de
>    signature n'a encore été communiqué à personne : l'envoi automatique des emails aux
>    signataires arrive au lot C.2c. » Vérifié par test : aucun élément nommé /relancer/i
>    n'existe dans `components/sessions/signature/`.
>
> 9. **Deux contrats manquaient au moteur pour que C.2b soit UTILISABLE — les deux sont
>    livrés au lot C.2b-bis** (Laurent, 10/09/2026).
>
>    - **`signUrl` en retour de `sendForSignature`.** Le lien était persisté dans
>      `SignatureRequest.signers[]` depuis le lot B, mais **aucun chemin de lecture ne
>      l'exposait**. DocuSeal partant en `send_email: false` (D-9) et QualiOF n'envoyant rien
>      avant C.2c, **personne n'était prévenu et personne ne POUVAIT l'être**. `EnvoiEffectue`
>      porte désormais `signUrl: string | null`, et le récapitulatif l'affiche avec de quoi le
>      copier — seul moyen de transmettre le lien en attendant C.2c.
>    - **`annulerEnvoiSignature({ signatureRequestId })`.** Sans elle, une pièce partie était
>      **gelée** : `Document.status = 'sent_for_signature'` fait refuser la régénération par
>      `preparerEnvoiSignature` **et** le renvoi par `sendForSignature` (`ENVOI_EN_COURS`, que
>      `force` ne lève pas), jusqu'à un webhook — lot C.3 — qui ne se déclencherait pas
>      puisque personne n'a reçu le lien. `messageEnvoiEnCours` promettait d'ailleurs
>      « Annulez l'envoi en cours », un geste qui n'existait nulle part. L'action annule chez
>      le prestataire **d'abord** (échec ⇒ rien n'est écrit en local), puis passe la demande en
>      `CANCELED`, rend au document le statut que le journal lui connaissait avant l'envoi, et
>      le régénère **sans** ses ancres — sauf s'il porte déjà une preuve signée, auquel cas
>      elle s'abstient et le dit. Le bouton qui l'appelle vit dans le bloc « Signature » des
>      onglets Avant / Après (lot C.2b-2).

>
> 10. **« UNE PIÈCE, UN SEUL CHEMIN OUVERT » — déposer un scan sur une pièce en attente de
>     signature ANNULE l'envoi** (Laurent, 11/09/2026 — lot C.2b-3). Tranche l'écart n°6 du
>     SUMMARY-2 de C.2b-2, laissé « à confirmer par Laurent ».
>
>     L'écran livré en C.2b-2 proposait « Déposer le scan » **à côté** d'« Annuler l'envoi »
>     sur une ligne `sent_for_signature` : deux chemins ouverts sur la même pièce. Or les deux
>     mènent à la MÊME preuve. Les laisser coexister, c'est accepter qu'un scan arrive pendant
>     qu'une signature électronique aboutit chez le prestataire — **deux preuves concurrentes
>     sur une pièce contractuelle destinée à un financeur**, et rien dans le journal pour dire
>     laquelle fait foi. L'argument de C.2b-2 (« le scan papier peut revenir pendant que la
>     demande dort ») décrit exactement le risque, il ne le lève pas.
>
>     **La règle** : le dépôt ferme l'autre chemin. `provider.cancel(providerId)` est appelé,
>     la demande passe en `CANCELED`, le document retrouve son statut d'avant l'envoi et est
>     régénéré **sans** ses ancres — tout cela par `annulerEnvoiSignature` (C.2b-bis), **réutilisée
>     et non réécrite** : une seconde annulation aurait divergé de la première au premier
>     changement.
>
>     **Trois points qui ne se négocient pas :**
>
>     - **Le motif entre dans la trace.** `annulerEnvoiSignatureSchema` porte un champ `motif`
>       **énuméré** (`user_requested` par défaut, `scan_deposited` pour le dépôt), et
>       `AuditLog signature.canceled` écrit le **code** (pour interroger) *et* la **phrase**
>       (pour lire). Sans lui, une annulation volontaire et une annulation provoquée par un
>       dépôt produisent la même ligne — or c'est la première question qu'un auditeur pose
>       devant deux preuves d'une même pièce. Énuméré, et non du texte libre : un journal doit
>       rester interrogeable.
>     - **Jamais en silence.** Le dépôt ne s'exécute qu'après une **confirmation explicite** :
>       `<UploadSignedDocDialog>` affiche l'avertissement dès l'ouverture, puis impose une
>       **étape** (et non une case à cocher — une case se coche sans lire) dont le bouton
>       **nomme l'annulation**. Le drapeau envoyé au serveur suit la CONFIRMATION, jamais la
>       prop `envoiEnAttente` : si l'étape disparaissait, le drapeau disparaîtrait avec elle et
>       le serveur refuserait — l'échec serait visible, jamais silencieux.
>     - **Le garde-fou vit dans `persistSignedScan`**, seul point par lequel passent TOUS les
>       dépôts (modale de cellule, cellule cible de drop, zone de dépôt de la fiche session).
>       Posé dans un seul écran, il aurait laissé les autres rouvrir le second chemin. Et
>       l'**ordre** n'est pas décoratif : on annule d'abord, on écrit ensuite — la régénération
>       sans ancres commence par un `deleteMany` qui effacerait un `signedPdfUrl` posé trop tôt,
>       et une annulation refusée par le prestataire ne doit rien laisser derrière elle.
>
>     **Limite assumée — la zone de dépôt multi-fichiers ne confirme jamais.** Elle traite N
>     fichiers pour N stagiaires : elle ne peut pas montrer, pièce par pièce, ce qu'une
>     annulation coûterait, et une confirmation globale « oui, annulez ce qu'il faut » serait
>     précisément la confirmation aveugle que cette règle interdit. Une pièce partie y ressort
>     donc en `failures`, avec le message qui renvoie au bloc « Signature » — les autres
>     fichiers du lot passent.

- Server actions `preparerEnvoiSignature({ sessionId, scope, cles? })` puis `sendForSignature({ sessionId, scope, cibles, force? })` — chaque cible porte `{ cle, hashConfirme, emailSaisi? }` (amendement n°5) :
  - **Un envoi porte UN document** (D-4 amendé, amendement n°1 ci-dessus).
    - `BEFORE` : une `SignatureRequest` par **organisation bénéficiaire** portant la **seule convention** (signée par son représentant) ; une `SignatureRequest` **par participant** pour son dossier AGEFICE (signé par le stagiaire seul, l'OF ayant déjà son image apposée).
    - `AFTER` : une `SignatureRequest` par participant portant l'ASSIDUITE.
    - Quelles pièces pour qui : jamais un `if` sur un code financeur — `sponsorOrg.opcoCode` → `OpcoCatalog` → colonnes `conventionSigner` / `ageficeSigner` / `assiduiteSigner` (lot C.1). `null` ⇒ hors régime ⇒ `NA`, jamais `MISSING`.
  - **Deux organisations à ne pas confondre**, portées par le même participant :
    - `sponsorOrg` = l'**entreprise bénéficiaire** (l'employeur, ou l'EI du TNS). C'est elle qui groupe la convention et fournit le représentant — c'est déjà elle que `convention-core.ts` imprime en « entreprise bénéficiaire ». Son champ `opcoCode` désigne le financeur.
    - `payerOrg` ne sert qu'à la **facturation** et n'a **aucun effet** sur la signature. **Le financeur n'est jamais signataire.**
  - **Résolution des signataires — la cascade RÉELLE, pas une nouvelle** (amendement n°2) :
    - `DIRIGEANT` → lien `EI_SELF` vers l'organisation ⇒ l'apprenant lui-même ; sinon `Organization.representative` ; sinon le **contact principal** (`isPrimary`, le plus ancien). **`Contact.function` ne joue aucun rôle** : saisi librement, il ne prouve rien.
    - `STAGIAIRE` → `Person.email`.
    - Une seule implémentation, `lib/signature/representant.ts`, appelée par la génération de la convention **et** par l'envoi : le signataire ne peut pas diverger du nom que le PDF imprime.
    - **Email : celui du représentant, ou rien** (amendement n°3). Pas d'email ⇒ **refus nominatif** renvoyant vers la fiche entreprise. **Aucun repli sur un autre contact.** Seule dérogation : une adresse **saisie explicitement par l'admin** au récapitulatif d'envoi (source `SAISI_PAR_ADMIN`), journalisée avec le nom retenu.
    - Participant sans organisation bénéficiaire résoluble ⇒ blocage nominatif. Jamais de devinette.
  - **Régénération à l'ouverture du récapitulatif** (Laurent, 10/09 — amendement n°5) : le document part **avec ses ancres et sans le tampon image de l'OF** (convention et assiduité ; le formulaire AGEFICE conserve son image, une seule partie y signe). Le générateur **écrase `pdfUrl` et recalcule `hashSha256`** — un seul objet, jamais deux, sans quoi le hash cesserait de décrire ce qui est réellement parti en signature. `AuditLog document.regenerated_for_signature` avant `sent_for_signature`.
    - **Qui garde son tampon vient du GABARIT**, pas d'un `if` sur le type de document : `signatureTags: true` est passé à l'identique aux trois générateurs, et chaque gabarit tranche chez lui. La table `ANCRES_PAR_PIECE` (`lib/signature/envoi-contrats.ts`) est la lecture de cette réalité — elle dit du même coup **quel nom de rôle** le gabarit attend dans son ancre.
    - ~~Point ouvert : ce qui part n'est pas forcément ce que l'admin a relu.~~ **TRANCHÉ le 10/09** : l'aperçu affiche le PDF régénéré lui-même, et l'envoi refuse si son hash a bougé depuis. Le décalage ne peut plus exister sans être nommé.
  - Garde-fous : doc non généré → refus ; doc déjà `signed` → refus sauf `force` ; doc `sent_for_signature` → propose d'annuler et renvoyer ; **`signatureFieldCount === 0` → refus** (écart n°6 du lot B : sinon l'envoi part et personne n'a rien à signer).
    - Tout refus survenant **après** la création de la submission chez le prestataire appelle `provider.cancel(providerId)` d'abord — sans quoi une submission zombie subsiste et le prochain envoi fait doublon.
  - Transaction : `SignatureRequest` + `Document.status = sent_for_signature` + AuditLog `signature.sent`.
  - **Les emails aux signataires ne sont PAS dans ce lot** : D-9 exige que QualiOF les envoie (catégorie décochable, `EmailTemplate`, relances D-5 J+3/J+7). C'est le **lot C.2c**. C.2a persiste `signUrl` ; personne n'est prévenu tant que C.2c n'est pas livré.
- UI : bouton **« Envoyer pour signature »** dans Avant (convention + AGEFICE) et Après (assiduité), avec récapitulatif des signataires avant confirmation ; badge « En attente » sur les cellules ; lien « Relancer » (renvoi email) ; « Annuler l'envoi ».
- Route `POST /api/webhooks/docuseal` : vérification de la signature/secret, idempotence sur `(providerId, event)`, événements `form.completed` (un signataire), `submission.completed` (tous), `form.declined`. Sur `submission.completed` : télécharge le PDF signé **et le certificat de signature (audit log)** → bucket (§4.4, le certificat en `.audit-trail.pdf`) → `Document.signedPdfUrl / signedAt / signatureKind = E_SIGNATURE / status = signed` → `SignatureRequest.completedAt` → AuditLog `signature.completed` → `Notification` à l'ADMIN.
- Filet : cron quotidien `signature-sync` qui re-interroge DocuSeal pour les requêtes `SENT` > 1 h sans webhook (webhook perdu) et marque `EXPIRED` au-delà de `expiresAt` (30 j par défaut).
- Tests : résolution des signataires (org / indépendant / sans email) ; webhook idempotent ; provider dry-run de bout en bout.

#### C.3 — deux choses à ne pas découvrir en cours de route (11/09/2026)

> **RÉSOLUES LE 11/09/2026, à la livraison du lot C.3.** Les deux notes ci-dessous
> ont servi ; ce qu'elles annonçaient s'est vérifié à moitié, et l'autre moitié
> mérite d'être corrigée ici plutôt que laissée à un futur lecteur :
>
> - **Les crons : la crainte du NOMBRE était infondée.** Vérifié à la source
>   (`vercel.com/docs/cron-jobs/usage-and-pricing`, 11/09/2026) : **100 crons par
>   projet sur TOUS les plans**, Hobby compris. Ce qui contraint est la
>   **fréquence** — Hobby plafonne à une fois par jour, et une expression plus
>   fréquente **fait échouer le déploiement**. Le déploiement de production porte
>   `*/5 * * * *` et il est `Ready` : le compte n'est pas sur Hobby. Les SIX
>   routes sont donc déclarées, et un test garde les deux sens (une route non
>   planifiée rougit, un chemin planifié qui n'existe pas rougit).
> - **La règle `parseSignatureSigners` a servi immédiatement** : `declinedAt` est
>   entré au schéma en `.optional()` avec `.default(null)`, et la garde est une
>   fixture portant exactement les sept champs du lot C.2a.

Écrites ici et pas dans un plan, parce que les deux se paient au moment du merge,
pas au moment de l'écriture.

**1. Déclarer les 3 crons dans `apps/web/vercel.json`.** Le fichier ne planifie
**qu'une** route : `diagnostic-worker`, toutes les 5 minutes. Trois autres routes
existent sous `apps/web/src/app/api/cron/` et **ne sont planifiées par rien** —
elles attendent un déclencheur externe protégé par `CRON_SECRET` :
`preinscription-reminders`, `opco-submission-reminders`, `closure-worker`. Le lot
C.3 ajoute une quatrième route à ce tas (`signature-sync`, le filet des webhooks
perdus), et le lot C.2c-2 une cinquième (`signature-reminders`). Tant que rien ne
les planifie, un webhook perdu reste perdu et une relance ne part jamais : la
fonctionnalité a l'air livrée et ne tourne pas.

⚠ **Vérifier d'abord le plan Vercel du projet** (nombre de crons autorisés,
fréquence minimale). Si la limite est atteinte, la bonne réponse est le
déclencheur externe — pas un cron à 5 minutes qui mangerait le dernier slot.
Détail et constat d'origine : DIV-6 du plan
`.planning/quick/260911-c2c-signature-emails-relances/260911-c2c-PLAN.md`.

**2. Tout nouveau champ de signataire est OPTIONNEL avec valeur par défaut,
jamais requis.** `parseSignatureSigners` (`packages/shared/src/schemas/signature.ts`)
est le seul point de lecture de la colonne Json `SignatureRequest.signers`, et il
**écarte silencieusement** tout élément qui ne passe pas `signatureSignerSchema` —
c'est délibéré : une fiche session ne doit pas tomber en erreur parce qu'un webhook
a écrit une ligne inattendue.

Le revers est un piège **silencieux**, et C.3 marche droit dessus puisqu'il
enrichit les signataires (`signedAt`, `declinedAt`, `ip`, `auditTrailUrl`…) :
ajouter un champ **requis** au schéma invalide d'un coup **toutes les lignes déjà
en base**, écrites avant que le champ existe. Elles ne lèvent pas d'erreur, elles
**disparaissent** — l'écran affiche un envoi sans aucun signataire, la relance ne
trouve personne, et rien dans les logs ne le dit.

**La règle** : `.optional()` **avec** `.default(...)`, jamais `.min(1)` nu sur un
champ neuf. **Et la garde** : un test qui fait passer par `parseSignatureSigners`
un signataire **de la forme réellement présente en base aujourd'hui** — les sept
champs de C.2a, pas un de plus — et qui exige qu'il ressorte. Une fixture
recopiée du nouveau schéma ne garderait rien : elle porte le champ neuf, donc
elle passe quoi qu'il arrive.

### ⚠ Données de production à corriger AVANT le merge du lot C

Inventaire joué **sur la base de production** le 11/09/2026, en lecture seule
(`pnpm --filter @qualiof/db run db:query:prod`, transaction `READ ONLY` close par
un `ROLLBACK`). Requête conservée :
`.planning/quick/260910-c2b-signature-lot-c2b-ecran-envoi/inventaire-bug11.sql`.

Le passage de la règle élargie BUG-11 au régime de financement change l'affichage
de **deux inscriptions**, et de deux seulement :

| Session | Apprenant | Sponsor | Financeur | Autre rattachement | Dossier déjà généré | À trancher |
|---|---|---|---|---|---|---|
| SES-0048 | **Marion MAINO** | son EI « MAINO Marion » | *aucun* | AGEFICE | non | **sponsor → PTA AGEFICE** |
| SES-0002 | **Clothilde MANUEL** | Sigma | OPCO_EP | AGEFICE | non | **salariée Sigma, ou TNS ?** |

**Aucune des deux n'a de dossier AGEFICE généré** : rien ne disparaîtra de l'écran.
Le garde-fou « colonne visible si un document existe » n'est sollicité par ni
l'une ni l'autre — il reste le bon filet, il ne sert simplement pas ici.

Depuis le lot C.2b-5, la correction se fait **dans l'application** : champ
« Financeur de l'inscription » du formulaire d'édition, atteignable d'un clic
depuis l'avertissement lui-même. Elle était impossible auparavant autrement qu'en
supprimant puis recréant l'inscription.

> **Le cas qui a motivé la règle élargie n'existe pas dans la donnée.** Le
> commentaire BUG-11 de `page.tsx` invoquait « Florent HAUSSWIRTH / Imagimmo
> OPCO_EP, aussi auto-entrepreneur AGEFICE en parallèle ». Vérifié le 11/09 en
> production : il n'est **inscrit à aucune session**, et son seul rattachement est
> `AGENT_COMMERCIAL / OPCO_EP` — **ni `EI_SELF`, ni organisation AGEFICE**. La
> règle a donc été écrite pour une situation que la base ne porte pas (ou ne porte
> plus), et elle en couvrait deux autres sans que personne le sache. À garder en
> tête avant d'élargir une règle sur la foi d'un cas nominatif : vérifier qu'il
> est encore dans la donnée.

### Lot D — Intégration financeur & audit

**Attente Laurent (10/09) — « le dossier AGEFICE prêt à partir en un geste »** : quand conventions et dossiers AGEFICE sont signés, l'admin ouvre le dossier du participant et trouve un écran « Dossier prêt » : point d'accueil AGEFICE **résolu automatiquement depuis le département du stagiaire** (table `agefice_pta_departments_served` de main, 08/09), destinataire pré-rempli, objet et corps pré-composés (`OpcoSubmission` existant), pièces jointes = versions **signées** + certificats de signature, et **un seul bouton Envoyer**. Envoi depuis QualiOF avec l'expéditeur en copie (le mail arrive aussi dans sa boîte, avec les pièces) — pas de `mailto:` (ne joint pas de fichiers de façon fiable). Si une pièce manque ou n'est pas signée : bloquant nominatif, jamais d'envoi partiel silencieux.


- `OpcoSubmission` : la composition des pièces jointes prend `signedPdfUrl` quand il existe ; si convention ou AGEFICE non signés → avertissement bloquant « dossier incomplet : X non signé » (option ADMIN pour forcer).
- Pack closure / ZIP audit (`closure-pack.ts`, `/api/closure/[batch]/zip`) : inclut les signés + audit trails dans un sous-dossier `signes/`.
- Alerte J-15 (plan cloud §E) : `Task` + notification ADMIN/MANAGER « Convention non envoyée pour signature » pour toute session à J-15 sans SignatureRequest.
- Filtre sessions `signed` existant (`sessions/page.tsx`) : le rebrancher sur `Document.status = signed` (aujourd'hui son critère est à vérifier — **D-2**).

### Lot H — Générateurs transactionnels (dette, à planifier APRÈS le lot D)

**Décision Laurent, 10/09/2026** — ouvert en dette assumée plutôt que toléré en silence.

Les générateurs remplacent un `Document` en deux temps (`deleteMany` puis `create`) **hors
transaction**, et sont appelés depuis **six** endroits. Conséquence constatée en lot C.2a :
aucun appelant ne peut envelopper le remplacement dans sa transaction, donc aucun ne peut
écrire sa trace d'audit *avec* l'écriture qu'elle décrit. Le lot C s'en accommode par la
trace d'intention (amendement n°7) — un filet, pas une solution.

Portée : rendre le remplacement atomique et accepter un client transactionnel en paramètre,
pour les six appelants. Le bénéfice dépasse la signature : tout appelant qui journalise un
remplacement de document y gagne la même garantie.

**À planifier après le lot D.** Ne pas l'entamer pendant C — toucher aux générateurs pendant
qu'on bâtit dessus, c'est déplacer les fondations sous le chantier.

## 6. Décisions ouvertes

| # | Question | Proposition par défaut |
|---|---|---|
| D-1 | Où vit le signataire OF (nom/email/ordre) ? | Champs sur `Tenant` (ou `TenantEmailSettings`), édités dans Paramètres. |
| D-2 | ~~Que teste réellement le filtre `signed` de la liste des sessions ?~~ **RÉPONDU 04/09** | Lu : `sessions/page.tsx` filtre sur `TrainingSession.status IN (VALIDATED, IN_PROGRESS, COMPLETED)` — **aucun rapport avec une signature**, le libellé ment. À rebrancher sur `Document.status = 'signed'` en lot D. |
| D-3 | Ordre de signature : client puis OF, ou parallèle ? | Séquentiel client → OF (l'OF signe après avoir vu que le client a signé). |
| D-4 | ~~Convention entreprise multi-participants : 1 envoi avec convention + N AGEFICE, ou envois séparés ?~~ **AMENDÉ 10/09** | **Envois séparés — un envoi porte UN document.** 1 `SignatureRequest` par organisation bénéficiaire portant la seule convention ; 1 par participant pour son dossier AGEFICE. Motif et détail : §5 lot C, amendement n°1. |
| D-5 | Rappels aux signataires | Cron QualiOF J+3 / J+7, catégorie email décochable (DocuSeal a aussi ses relances, mais on garde la main sur les emails). |
| D-7 | Localisation de la zone de signature dans le PDF | Text tags DocuSeal dans les templates (texte blanc). |
| D-9 | Qui envoie les emails aux signataires : DocuSeal ou QualiOF ? | QualiOF (`send_email: false`, lien de signature récupéré via l'API) pour garder le mailer fail-closed et la catégorie décochable. |
| D-8 | Signature OF automatique ou manuelle ? | Manuelle en v1 (DocuSeal envoie le lien à l'OF en dernier ; un clic). Automatique si l'API le permet proprement. |
| D-10 | Comment `OpcoCatalog` porte-t-il « qui signe quoi » ? `requiredDocs` est de la prose libre, vide chez 2 financeurs sur 6. | Champ dédié `signatureMatrix: Json` sur `OpcoCatalog`, `requiredDocs` restant l'affichage. À trancher AVANT le lot C — c'est lui qui décide si le bouton d'envoi existe. |
| D-6 | Copie d'archive Drive ? | Hors scope v1. Si besoin : worker qui pousse `sessions/{code}/signed/*` dans un dossier Drive par session. |

## 7. Ordre de livraison et taille

A (1-1,5 jour) → B (1-2 jours, sandbox DocuSeal) → C (2 jours) → D (1 jour). Le lot A supprime dès demain le besoin de Drive pour l'émargement ; C supprime Adobe Sign pour ≈ 20 $/mois au lieu de 104 €.

### Statut des lots

| Lot | Statut | Détail |
|---|---|---|
| **A** | ✅ **livré 04/09/2026** | Migration `20260904170000_signature_document_signed_fields` (Document.signedPdfUrl / signedAt / signatureKind + enum `SignatureKind`) · `persistSignedScan` partagé entre `uploadSignedDoc` et la nouvelle `uploadSignedScans` · `<SignedDocDropZone>` dans Après (émargement, déplié) et Avant (replié, docType au choix) · pré-affectation par nom de fichier · A.2 découpage multipage · cellule de matrice cible de drop · AuditLog `document.signed_scan_uploaded`. Chemins §4.4 pour les nouveaux écrits. |
| **B** | ✅ **livré — test d'acceptation passé le 10/09/2026** | Migration `20260904190000_signature_request_docuseal` (`SignatureRequest` + `SignatureRequestStatus`, `Document.signatureRequestId`, `Tenant.signatory*` + `SignatoryOrder`) · `lib/signature/` : `port.ts`, `docuseal.ts`, `dry-run.ts`, `provider.ts` (fail-closed), `signatory.ts`, `text-tags.ts` · ancres optionnelles `signatureTags` sur les 3 documents — zones HTML pour la convention et l'assiduité, ancre **dessinée par pdf-lib** pour le formulaire AGEFICE officiel (corrigé le 10/09) · section « Signataire de l'organisme » dans Paramètres (D-1) · env `SIGNATURE_PROVIDER` / `DOCUSEAL_*` en remplacement des `YOUSIGN_*`. **Test d'acceptation passé le 10/09/2026** (envoi 1619115, instance UE, signé par les deux rôles) : Adobe Reader déclare la **signature valide après mise à jour AATL**, certificat **Netrust** ; certificat de signature complet ; les deux pièces servies par `docuseal.eu` ; `send_email=false` et `sent_at=jamais`, aucun email parti de DocuSeal. Pièces versées dans `.planning/specs/evidence/signature-B/`. Placement des signatures corrigé après ce test (zone dédiée 180 × 60 pt alignée à droite) et revérifié sur l'envoi 1619495. |
| **C** | 🟨 en cours | **C.1** (régime : 3 colonnes `SignerRole` sur `OpcoCatalog`) et **C.2a** livrés le 10/09/2026 : `lib/signature/{representant,plan-envoi,envoi-contrats}.ts` (purs), `server/actions/signature-envoi.ts` (`preparerEnvoiSignature` + `sendForSignature`), `signatureTags` plombé dans les 4 générateurs. **C.2b** livré le 10/09/2026 (l'écran : bloc « Signature », récapitulatif, saisie d'adresse, annulation — C.2b-1/bis/2). **C.2b-3** (11/09/2026) : « une pièce, un seul chemin ouvert » — le dépôt d'un scan sur une pièce en attente annule l'envoi, après confirmation explicite, avec le motif `scan_deposited` dans la trace (amendement n°10). **C.2b-10** (11/09/2026) : une pièce PARTIE en signature gèle le commanditaire de l'inscription — troisième refus nominatif de `lib/enrollment/verrou-financeur.ts`, nommé en dernier parce qu'il est le seul des trois qu'un clic fait tomber. **C.2c** livré le 11/09/2026 : catégorie d'email `signature` décochable et fail-closed (migration `20260911101421_signature_email_category`), les **cinq** gabarits écrits (`lib/mailer-templates/signature-{demande,relance,exemplaire}.ts`), `lib/signature/notifier.ts` comme seul point d'envoi, câblé dans `sendForSignature`, et l'écran qui dit par pièce si l'email est parti. ⚠ **DEUX gabarits sur cinq sont branchés** — demande bénéficiaire et « à votre tour » organisme ; relances J+3/J+7 et exemplaire signé sont rendus et prouvés (`.planning/specs/evidence/signature-C/`) mais attendent leur déclencheur au lot C.3 (décision Laurent du 11/09/2026). Reste **C.3** (webhook `POST /api/webhooks/docuseal`, cron `signature-sync`, cron `signature-reminders`, et le câblage des trois derniers gabarits) — lire d'abord le bloc « deux choses à ne pas découvrir en cours de route » du §5. |
| **C.3** | 🟨 **code livré le 11/09/2026, preuve d'acceptation à faire** | Route `POST /api/webhooks/docuseal` (secret HMAC fail-closed, octets exacts, idempotence `(providerId, eventType, signerKey)` — la clé porte le SIGNATAIRE, `form.completed` partant une fois par signataire). `server/signature-retour.ts` traite les quatre événements ; `lib/signature/retour.ts` porte les décisions pures. `form.completed` ⇒ `PARTIALLY_SIGNED` + `signedAt` + email « à votre tour » au suivant — **jamais `DONE`**, qui signifie « la preuve est en bucket ». `submission.completed` ⇒ PDF signé + certificat téléchargés PUIS écrits en une transaction (`signedPdfUrl` / `signedAt` / `signatureKind=E_SIGNATURE` / `status=signed`), notification ADMIN, exemplaire envoyé aux seuls signataires avec les deux fichiers. Refus et expiration relâchent la pièce par le chemin PARTAGÉ avec l'annulation (`server/signature-relacher.ts`). Crons `signature-reminders` (J+3/J+7, compteur consommé sur départ réel seulement) et `signature-sync` (filet des webhooks perdus, > 1 h, même clé d'idempotence que le webhook). **Les six routes cron sont déclarées dans `vercel.json`** — les trois orphelines comprises. ⚠ **Reste la preuve d'acceptation** : envoi réel depuis un aperçu Vercel, signature client, « à votre tour », signature OF, retour du PDF + certificat, cellule verte, exemplaire reçu. |
| **D** | ⬜ à faire | `opco-submission.ts` ignore `signedPdfUrl` ; le ZIP du pack n'a pas de sous-dossier `signes/` ; pas d'alerte J-15. |

**Trouvé en montant la preuve du lot A** (corrigé dans la foulée, commit `fix(qualiopi-matrix)`) : le SQL brut de `markDocStatus`, `uploadSignedDoc` et `deleteDocument` castait des identifiants **TEXT** en `::uuid` → `operator does not exist: text = uuid`. Les trois actions échouaient à chaque appel depuis leur écriture ; les tests unitaires mockaient `$executeRaw` et ne pouvaient pas le voir.
