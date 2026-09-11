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
  │                signataires : dirigeant de l'entreprise (Contact / LegalLink)  +  OF (Laurent)
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
| Salarié d'une entreprise (OPCO EP ou autre OPCO) | signée par le **dirigeant de l'entreprise** + OF — le salarié ne signe **rien** | — | **aucune** (l'attestation d'assiduité est une pièce AGEFICE, pas OPCO) | papier, en salle |
| Dirigeant TNS financé AGEFICE | s'il est lui-même l'entreprise bénéficiaire : il signe la convention ; s'il est salarié-dirigeant couvert par la convention entreprise : idem ligne 1 | signée par le **stagiaire-dirigeant** (OF = image) | stagiaire + OF | papier, en salle |
| Indépendant hors AGEFICE / autofinancement | signée par lui-même + OF | — | — | papier, en salle |

Conséquences pour le lot C : l'envoi « AVANT » ne crée un dossier AGEFICE que pour les participants dont le financeur l'exige ; l'envoi « APRÈS » (assiduité) est **vide** pour une session 100 % salariés OPCO et ne doit pas proposer le bouton ; la matrice affiche NA (pas MISSING) pour ASSIDUITE/AGEFICE d'un salarié OPCO.

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

- Server action `sendForSignature({ sessionId, scope: 'BEFORE' | 'AFTER', targets })` :
  - `BEFORE` : pour chaque organisation payeuse → 1 SignatureRequest portant la CONVENTION (+ les AGEFICE de ses participants AGEFICE, chacun signé par son stagiaire) ; pour chaque indépendant → sa convention + son AGEFICE.
  - `AFTER` : 1 SignatureRequest par participant AGEFICE portant l'ASSIDUITE.
  - Résolution des signataires : dirigeant = `Contact` de l'organisation avec `function` dirigeant / signataire, sinon premier `Contact` avec email, sinon **blocage avec message** (« Aucun signataire avec email pour {org} ») — jamais de devinette. Stagiaire = `Person.email`.
  - Garde-fous : doc non généré → refus ; doc déjà `signed` → refus sauf `force` ; doc `sent_for_signature` → propose d'annuler et renvoyer.
  - Transaction : `SignatureRequest` + `Document.status = sent_for_signature` + AuditLog `signature.sent`.
- UI : bouton **« Envoyer pour signature »** dans Avant (convention + AGEFICE) et Après (assiduité), avec récapitulatif des signataires avant confirmation ; badge « En attente » sur les cellules ; lien « Relancer » (renvoi email) ; « Annuler l'envoi ».
- Route `POST /api/webhooks/docuseal` : vérification de la signature/secret, idempotence sur `(providerId, event)`, événements `form.completed` (un signataire), `submission.completed` (tous), `form.declined`. Sur `submission.completed` : télécharge le PDF signé **et le certificat de signature (audit log)** → bucket (§4.4, le certificat en `.audit-trail.pdf`) → `Document.signedPdfUrl / signedAt / signatureKind = E_SIGNATURE / status = signed` → `SignatureRequest.completedAt` → AuditLog `signature.completed` → `Notification` à l'ADMIN.
- Filet : cron quotidien `signature-sync` qui re-interroge DocuSeal pour les requêtes `SENT` > 1 h sans webhook (webhook perdu) et marque `EXPIRED` au-delà de `expiresAt` (30 j par défaut).
- Tests : résolution des signataires (org / indépendant / sans email) ; webhook idempotent ; provider dry-run de bout en bout.

### Lot D — Intégration financeur & audit

- `OpcoSubmission` : la composition des pièces jointes prend `signedPdfUrl` quand il existe ; si convention ou AGEFICE non signés → avertissement bloquant « dossier incomplet : X non signé » (option ADMIN pour forcer).
- Pack closure / ZIP audit (`closure-pack.ts`, `/api/closure/[batch]/zip`) : inclut les signés + audit trails dans un sous-dossier `signes/`.
- Alerte J-15 (plan cloud §E) : `Task` + notification ADMIN/MANAGER « Convention non envoyée pour signature » pour toute session à J-15 sans SignatureRequest.
- Filtre sessions `signed` existant (`sessions/page.tsx`) : le rebrancher sur `Document.status = signed` (aujourd'hui son critère est à vérifier — **D-2**).

## 6. Décisions ouvertes

| # | Question | Proposition par défaut |
|---|---|---|
| D-1 | Où vit le signataire OF (nom/email/ordre) ? | Champs sur `Tenant` (ou `TenantEmailSettings`), édités dans Paramètres. |
| D-2 | ~~Que teste réellement le filtre `signed` de la liste des sessions ?~~ **RÉPONDU 04/09** | Lu : `sessions/page.tsx` filtre sur `TrainingSession.status IN (VALIDATED, IN_PROGRESS, COMPLETED)` — **aucun rapport avec une signature**, le libellé ment. À rebrancher sur `Document.status = 'signed'` en lot D. |
| D-3 | Ordre de signature : client puis OF, ou parallèle ? | Séquentiel client → OF (l'OF signe après avoir vu que le client a signé). |
| D-4 | Convention entreprise multi-participants : 1 envoi avec convention + N AGEFICE, ou envois séparés ? | 1 envoi par organisation (moins de mails pour le dirigeant) ; les stagiaires ne signent que leur AGEFICE. |
| D-5 | Rappels aux signataires | Cron QualiOF J+3 / J+7, catégorie email décochable (DocuSeal a aussi ses relances, mais on garde la main sur les emails). |
| D-7 | Localisation de la zone de signature dans le PDF | Text tags DocuSeal dans les templates (texte blanc). |
| D-9 | Qui envoie les emails aux signataires : DocuSeal ou QualiOF ? | QualiOF (`send_email: false`, lien de signature récupéré via l'API) pour garder le mailer fail-closed et la catégorie décochable. |
| D-8 | Signature OF automatique ou manuelle ? | Manuelle en v1 (DocuSeal envoie le lien à l'OF en dernier ; un clic). Automatique si l'API le permet proprement. |
| D-6 | Copie d'archive Drive ? | Hors scope v1. Si besoin : worker qui pousse `sessions/{code}/signed/*` dans un dossier Drive par session. |

## 7. Ordre de livraison et taille

A (1-1,5 jour) → B (1-2 jours, sandbox DocuSeal) → C (2 jours) → D (1 jour). Le lot A supprime dès demain le besoin de Drive pour l'émargement ; C supprime Adobe Sign pour ≈ 20 $/mois au lieu de 104 €.

### Statut des lots

| Lot | Statut | Détail |
|---|---|---|
| **A** | ✅ **livré 04/09/2026** | Migration `20260904170000_signature_document_signed_fields` (Document.signedPdfUrl / signedAt / signatureKind + enum `SignatureKind`) · `persistSignedScan` partagé entre `uploadSignedDoc` et la nouvelle `uploadSignedScans` · `<SignedDocDropZone>` dans Après (émargement, déplié) et Avant (replié, docType au choix) · pré-affectation par nom de fichier · A.2 découpage multipage · cellule de matrice cible de drop · AuditLog `document.signed_scan_uploaded`. Chemins §4.4 pour les nouveaux écrits. |
| **B** | ✅ **livré — test d'acceptation passé le 10/09/2026** | Migration `20260904190000_signature_request_docuseal` (`SignatureRequest` + `SignatureRequestStatus`, `Document.signatureRequestId`, `Tenant.signatory*` + `SignatoryOrder`) · `lib/signature/` : `port.ts`, `docuseal.ts`, `dry-run.ts`, `provider.ts` (fail-closed), `signatory.ts`, `text-tags.ts` · ancres optionnelles `signatureTags` sur les 3 documents — zones HTML pour la convention et l'assiduité, ancre **dessinée par pdf-lib** pour le formulaire AGEFICE officiel (corrigé le 10/09) · section « Signataire de l'organisme » dans Paramètres (D-1) · env `SIGNATURE_PROVIDER` / `DOCUSEAL_*` en remplacement des `YOUSIGN_*`. **Test d'acceptation passé le 10/09/2026** (envoi 1619115, instance UE, signé par les deux rôles) : Adobe Reader déclare la **signature valide après mise à jour AATL**, certificat **Netrust** ; certificat de signature complet ; les deux pièces servies par `docuseal.eu` ; `send_email=false` et `sent_at=jamais`, aucun email parti de DocuSeal. Pièces versées dans `.planning/specs/evidence/signature-B/`. Placement des signatures corrigé après ce test (zone dédiée 180 × 60 pt alignée à droite) et revérifié sur l'envoi 1619495. |
| **C** | ⬜ à faire | Pas de `/api/webhooks/`, pas de `sendForSignature`. |
| **D** | ⬜ à faire | `opco-submission.ts` ignore `signedPdfUrl` ; le ZIP du pack n'a pas de sous-dossier `signes/` ; pas d'alerte J-15. |

**Trouvé en montant la preuve du lot A** (corrigé dans la foulée, commit `fix(qualiopi-matrix)`) : le SQL brut de `markDocStatus`, `uploadSignedDoc` et `deleteDocument` castait des identifiants **TEXT** en `::uuid` → `operator does not exist: text = uuid`. Les trois actions échouaient à chaque appel depuis leur écriture ; les tests unitaires mockaient `$executeRaw` et ne pouvaient pas le voir.
