# Spec — Envoi de la demande de prise en charge AGEFICE depuis QualiOF

**Date** : 14/09/2026 · **Auteur** : Laurent (besoin) / Claude (rédaction) · **Statut** : à lancer
**Base auditée** : `origin/main` e162f763 (14/09, PR #73) — pas une branche de travail.
**Spec mère** : `.planning/specs/2026-09-04-signature-electronique-docs-signes.md` (lots A→D en prod le 12/09).
**Commandes** : `/signature` (règles de test §3 bis, opposables ici aussi), `/financeur`.

---

## 0. Le besoin, tel que formulé le 14/09

> Maintenant que la signature électronique marche, je veux envoyer depuis le CRM le mail aux
> AGEFICE pour la prise en charge. La règle : **un mail par apprenant s'il est AGEFICE**. Dedans :
> la demande de prise en charge, le programme, la convention signée, le RIB, la CNI et
> l'attestation URSSAF. Le message est le suivant :

```
Bonjour,

Je vous prie de trouver ci-joint une nouvelle demande de prise en charge pour {Prénom NOM}
Son numéro de sécurité sociale : {NIR}

Merci

Bien à vous,

{Signataire}
```

> Avec les PJ évidemment.

Deuxième question du même message : *« À quel endroit je dépose les docs signés comme
l'émargement ? ou encore l'assiduité AGEFICE ? Est-ce prévu ? »* → **réponse en §1 : le moteur existe, l'écran le cache → lot 0.**

---

## 1. Où déposer les pièces signées à la main — le moteur est livré, l'accès ne l'est pas

Vérifié sur `main` le 14/09. Le chemin d'écriture existe ; ce qui manque est l'affordance (voir le constat en fin de section → lot 0).

| Pièce | Comment elle se signe | Où déposer le scan |
|---|---|---|
| **Émargement** (fiche individuelle, papier en salle) | À la main, toujours (décision socle 04/09) | Fiche session → onglet **Après** → bloc **Signature** → section **« Exemplaire signé à la main ? »** → sélecteur **« Émargements »** |
| **Attestation d'assiduité AGEFICE** (générée par le pack de fin de formation, type `ASSIDUITE`) | Le plus souvent à la main en fin de session ; e-signature possible (STAGIAIRE pour AGEFICE, lot C) | Même section, sélecteur **« Attestations d'assiduité »** |
| **Convention** / **Demande de prise en charge AGEFICE** | E-signature (lot C) ou à la main | Fiche session → onglet **Avant** → bloc Signature → même section |

Trois portes d'entrée, toutes écrivent par le même chemin (`uploadSignedScans` / `uploadSignedDoc`
→ `persistSignedScan`, `Document.signedPdfUrl`, `status = signed`) :

1. **Glisser N PDF** dans la zone : chaque fichier est rattaché au stagiaire dont le nom figure dans
   le nom du fichier (`autoAssignFiles`), sinon on choisit dans la liste.
2. **Un seul PDF multipage** sorti du scanner, mode « une fiche par page », dans l'ordre de la liste
   (réordonnable).
3. **La cellule du participant** dans la matrice Qualiopi → menu → « Téléverser le PDF signé ».

Règle à retenir (affichée à l'écran) : **une pièce partie en signature électronique ne passe pas par
là** — le PDF signé et son certificat reviennent seuls ; déposer un scan sur une pièce partie
**annule** l'envoi chez DocuSeal (décision n°4, garde fail-closed).

Fichiers : `components/sessions/tabs/tab-apres.tsx` (l. ~395, `depotDocType="EMARGEMENT"`,
options Émargements / Attestations d'assiduité), `tab-avant.tsx` (conventions / AGEFICE),
`qualiopi-matrix/signed-doc-drop-zone.tsx`, `upload-signed-doc-dialog.tsx`,
`server/actions/qualiopi-matrix.ts` (`uploadSignedScans`, `uploadSignedDoc`),
`lib/sessions/titre-depot-signe.ts` (textes).

**⚠ Constat de Laurent (14/09, session SES groupe OPTIMMO, onglet Après)** : « il n'y a nulle part la
possibilité de mettre des docs ». Vérifié : la zone existe mais est **repliée par défaut**
(`defaultOpen={false}`, `bloc-signature.tsx` l. 586) et son en-tête « Exemplaire signé à la main ? »
est un accordéon dont rien ne dit qu'il s'ouvre — un titre avec un chevron, sous le bloc « Envoyer
pour signature ». Dans la liste « Après la formation · par apprenant » (Attestation, Certificat,
Assiduité… Ouvrir / Télécharger) il n'y a **aucune action « Déposer le signé »** par ligne.
Un dépôt que l'utilisateur ne trouve pas n'existe pas. → **Lot 0 (quick, avant le lot A)** :
1. la zone s'ouvre **par défaut** dès que la session a commencé (onglet Après) ou qu'une convention /
   un formulaire AGEFICE est généré (onglet Avant), avec un bouton explicite **« Déposer les scans
   signés »** dans l'en-tête, pas seulement un chevron ;
2. dans la liste par apprenant du pack (pendant / après), chaque ligne Émargement, Assiduité,
   Convention, AGEFICE reçoit une action **« Déposer le signé »** qui ouvre `UploadSignedDocDialog`
   (déjà existante, même server action) ; badge « signé le … » quand `signedPdfUrl` est posé ;
3. test de câblage sur `defaultOpen` et sur la présence de l'action par type (règle n°1 de
   `/signature`).

**Ce qui n'existe PAS** (et n'est pas dans ce chantier) : l'envoi du **dossier de solde** au point
d'accueil après la formation (attestation d'assiduité signée + facture acquittée). À ouvrir comme
lot E après ce chantier, sur le même `OpcoSubmission` (voir §8, D-6).

---

## 2. Ce qui existe déjà pour l'envoi (ne rien reconstruire)

Le lot D de la spec signature (PR #66, prod 12/09) a posé presque tout le moteur. Ce chantier
**corrige et branche**, il ne recrée pas.

| Brique | Fichier | État |
|---|---|---|
| Modèle `OpcoSubmission` (DRAFT → SENT → ACK/APPROVED/REJECTED/REIMBURSED/CANCELED), `attachments` Json, `threadId`, relances | `packages/db/prisma/schema.prisma` l. 1449-1490 | OK, **aucune migration à prévoir** |
| Composition du dossier : CNI (`SensitiveData.idDocumentUrl`), RIB (`Person.ribKey`), attestation CFP URSSAF (`AgeficeProfile.cfpAttestationKey`), convention (individuelle ou groupe, **version signée fait foi**), programme, formulaire AGEFICE PA, certificats de signature (1 par demande) | `server/actions/opco-submission.ts` → `composeOpcoSubmission` | OK |
| Destinataire = **point d'accueil** AGEFICE de l'organisation commanditaire (annuaire importé, règle département puis PTA nationale), jamais l'EI du stagiaire ; motif d'absence remonté | `lib/opco/destinataire-dossier.ts` | OK |
| Refus nominatif si convention / formulaire AGEFICE non signés ; « Envoyer quand même » réservé ADMIN | `lib/opco/pieces-dossier.ts`, `sendOpcoSubmission` | OK |
| Envoi SMTP, expéditeur Start Academy, utilisateur en **cc**, catégorie `opco_submission` (« Envoi dossiers OPCO » dans Paramètres), trace `EmailMessage` + `documentIds` | `sendOpcoSubmission`, `lib/mailer.ts`, `lib/email-policy.ts` | OK |
| Écran de prévisualisation / édition (objet, corps, PJ cochables, destinataire) puis Envoyer | `app/app/dossiers-opco/envoyer/[id]/page.tsx`, `components/dossiers-opco/submission-editor.tsx` | OK |
| Liste des dossiers, bouton « Composer » | `app/app/dossiers-opco/page.tsx` | Existe, **mal gaté** (§3 E-3) |
| Qui est AGEFICE — source unique (`OU_AGEFICE` Prisma + `estEligibleAgefice` mémoire) | `lib/agefice/eligibilite.ts` | OK, à réutiliser tel quel |
| NIR de l'apprenant | `SensitiveData.socialSecurityNb` — saisi à la pré-inscription et à la création d'apprenant, affiché sur la fiche apprenant | Existe, **jamais exigé ni validé** |
| Cron relances J+30 sur SENT | `api/cron/opco-submission-reminders` | OK |

---

## 3. Les écarts entre l'existant et le besoin (vérifiés sur `main` le 14/09)

| # | Écart | Preuve | Conséquence |
|---|---|---|---|
| **E-1** | Le corps du mail est un long HTML : liste à puces stagiaire/formation/dates/durée/**montant HT**, liste des PJ, et **« ⚠ pièces manquantes »** envoyé au financeur | `opco-submission.ts` l. 318-340 | Ce n'est pas le message de Laurent ; un financeur qui lit « pièces manquantes » classe sans suite |
| **E-2** | Le NIR n'est ni dans le mail, ni exigé | idem | L'AGEFICE identifie le cotisant par son NIR — dossier incomplet |
| **E-3** | Seul point d'entrée : `/app/dossiers-opco`, bouton grisé tant que la facture n'est pas envoyée (`disabled={!r.invoiceSent}`, tooltip « Émets d'abord la facture ») ; **rien sur la fiche session** | `dossiers-opco/page.tsx` l. 466-469 | Une demande de prise en charge se dépose **avant** le début de la formation, donc avant toute facture. Le gate interdit l'usage réel |
| **E-4** | Pièce **manquante** (CNI, RIB, CFP, programme) → le mail part quand même, le manque est juste listé dedans | `composeOpcoSubmission` (`missing`), `sendOpcoSubmission` ne relit pas `missing` | Envoi partiel silencieux — exactement ce que le lot D interdisait pour les signatures |
| **E-5** | `status = SENT` écrit même quand le mailer n'a rien envoyé (`dryRun` / catégorie décochée → `{ ok:true, dryRun:true }`) | `sendOpcoSubmission` l. 483 écrit `SENT` sans lire `result.dryRun` | Un dossier marqué envoyé qui n'est jamais parti ; déjà relevé par l'audit du 12/09 |
| **E-6** | Lien « Voir le dossier OPCO » → `/app/dossiers-opco/{id}` = **404** (la route est `/envoyer/[id]`) | `step-facturation.tsx` l. 124 | Relevé le 12/09, toujours là |
| **E-7** | Aucun contrôle de format sur `recipientEmail` (modifiable à la main dans l'éditeur) | `updateOpcoSubmissionDraft` | Envoi qui bounce en silence |
| **E-8** | Objet : `Dossier de prise en charge AGEFICE — Prénom NOM — SES-xxxx` ; ordre des PJ : CNI, RIB, CFP, convention, programme, AGEFICE, certificats | `composeOpcoSubmission` | À aligner sur la liste de Laurent (demande, programme, convention, RIB, CNI, URSSAF) |
| **E-9** | Le « Envoyer quand même » ADMIN couvre une pièce **non signée** ; il ne doit pas couvrir une pièce **absente** | `sendOpcoSubmission` | Périmètre à fermer explicitement |

Hors périmètre (rappel audit 12/09, non traités ici) : étape « déposé » / accusé de réception,
UI accord/refus, alerte d'antériorité généralisée, dossier de solde (D-6).

---

## 4. Règles métier (gravées — chaque règle a son test)

- **R-1 Un mail par apprenant AGEFICE.** Population = `estEligibleAgefice` / `OU_AGEFICE`
  (`lib/agefice/eligibilite.ts`), pas un nouveau `if (opcoCode === 'AGEFICE')`. Jamais de
  regroupement, même quand plusieurs stagiaires d'une même session relèvent du même point d'accueil :
  un `OpcoSubmission` = un participant = un email.
- **R-2 Destinataire = point d'accueil résolu** (`resoudreDestinataireDossier`, existant). Aucun point
  d'accueil → **bloquant** avec lien vers la fiche organisation (« Financeur »). Jamais de repli sur
  l'adresse de l'entreprise.
- **R-3 Corps du mail = le texte de Laurent, au mot près** (§0), en **texte + HTML minimal**
  (`<p>` et `<br>`, pas de tableau, pas de montant, pas de liste des PJ, pas de « pièces
  manquantes »). Variables : `{Prénom NOM}` (prénom tel quel, NOM en capitales — même règle que
  l'objet existant), `{NIR}` sans espaces, `{Signataire}` = prénom nom de l'utilisateur connecté
  (D-1). Le gabarit vit dans **un module pur** (`lib/opco/gabarit-prise-en-charge.ts`) sous test
  littéral ; le corps reste éditable dans l'écran d'envoi.
- **R-4 Objet** : `Demande de prise en charge — {Prénom NOM} — {intitulé de la formation}` (D-2).
- **R-5 Six pièces obligatoires, dans cet ordre, toutes présentes ou pas d'envoi** :
  1. Demande de prise en charge AGEFICE (formulaire PA, **signée**)
  2. Programme pédagogique
  3. Convention de formation (**signée**)
  4. RIB
  5. Carte d'identité
  6. Attestation URSSAF de contribution à la formation professionnelle (CFP)
  7. + Certificat(s) de signature (règle n°3 de la spec signature ; D-4)

  Une pièce **absente** → refus nominatif qui nomme la pièce **et le geste** : générer (programme,
  formulaire AGEFICE), faire signer / déposer le scan (convention, formulaire), déposer sur la fiche
  apprenant (CNI, RIB), déposer sur la fiche organisation → profil AGEFICE (attestation CFP).
  **Pas de « Envoyer quand même » pour une pièce absente** (E-9) : la dérogation ADMIN reste
  limitée à « présente mais non signée », comme aujourd'hui.
- **R-6 NIR obligatoire et valide.** `validerNir(valeur)` (module pur `lib/opco/nir.ts`) : on
  retire espaces et points ; 13 chiffres obligatoires, 15 acceptés (13 + clé) ; Corse `2A`/`2B`
  admise en position 6-7 ; si la clé est présente elle doit valoir `97 − (NIR mod 97)` (Corse :
  2A → 19, 2B → 18 avant le calcul). Le mail porte le NIR **sans espaces** (comme l'exemple de
  Laurent). Absent ou invalide → refus nominatif avec lien vers la fiche apprenant.
- **R-7 `SENT` seulement si l'email est réellement parti.** `result.dryRun === true` ou
  `suppressed` → le dossier **reste DRAFT** et l'écran dit pourquoi (« La catégorie "Envoi
  dossiers OPCO" est désactivée dans Paramètres → Envois d'emails » / « SMTP non configuré »).
- **R-8 Expéditeur et copie** : inchangés (Start Academy `<formation@start-academy.fr>`, réponses
  dans `formation@`, utilisateur en cc).
- **R-9 Adresse destinataire** : Zod `email()` à la saisie manuelle (`updateOpcoSubmissionDraft`) et
  à l'envoi. Une adresse invalide ne part pas.
- **R-10 Une demande déjà envoyée** (statut SENT/ACK/APPROVED/REIMBURSED) pour ce participant et
  cette session → le bloc affiche « Envoyée le {date} à {adresse} » et **ne propose pas** de
  nouvel envoi. Après REJECTED ou CANCELED : « Préparer un nouvel envoi » (nouveau
  `OpcoSubmission`, l'historique reste).
- **R-11 Antériorité (avertissement, non bloquant)** : si la session a déjà commencé ou commence
  dans moins de **7 jours** (D-5), bandeau « L'AGEFICE exige le dépôt de la demande avant le début
  de la formation ». On n'empêche pas : c'est l'AGEFICE qui tranche, pas QualiOF.
- **R-12 Le NIR ne va nulle part ailleurs que dans le mail** : pas dans `AuditLog`, pas dans les
  logs serveur (masquer comme la clé bucket dans `documents.upload_signed`). Il figure dans
  `EmailMessage.bodyHtml` (même base et même périmètre tenant que `SensitiveData`) — accepté
  (D-3).

---

## 5. L'écran — bloc « Prise en charge AGEFICE » sur la fiche session, onglet Avant

Placé **sous le bloc Signature** de l'onglet Avant : c'est la suite logique (signé → envoyé).
Rendu uniquement s'il existe au moins un inscrit AGEFICE dans la session (sinon rien — pas un bloc
vide qui dit « aucun »).

Une ligne par inscrit AGEFICE :

```
Jean-Baptiste BOUTRY · Point d'accueil : UMIH Nice Azur et Alpes
Pièces 6/6 · NIR ✓ · Signatures ✓                        [ Préparer l'envoi ]
```

- **État à gauche** (calcul pur, `lib/opco/etat-prise-en-charge.ts`) : `Pièces x/6` avec, au
  survol ou dépliage, la liste de ce qui manque et le geste ; `NIR ✓/✗` ; `Signatures ✓/✗`
  (convention + formulaire) ; point d'accueil ou « Point d'accueil manquant → fiche organisation ».
- **Bouton à droite** :
  - tout vert → **« Préparer l'envoi »** → `composeOpcoSubmission` → écran existant
    `/app/dossiers-opco/envoyer/[id]`, retitré **« Demande de prise en charge AGEFICE »**, avec les
    PJ dans l'ordre R-5 et le corps R-3 ; un seul bouton **Envoyer**.
  - quelque chose manque → bouton désactivé, le manque est la ligne d'état elle-même (pas de
    tooltip caché).
  - déjà envoyée → **« Envoyée le 14 sept. à …@… »** + lien « Voir » (R-10).
- Bandeau d'antériorité R-11 au-dessus du bloc quand il s'applique.
- Lien discret « Tous les dossiers » → `/app/dossiers-opco`.

Sur `/app/dossiers-opco` : le bouton « Composer » **n'est plus gaté par la facture pour un inscrit
AGEFICE** (E-3) ; il garde le gate pour les autres financeurs (un dossier OPCO EP se compose après
facture — comportement d'origine, pas touché).

Textes : dans un module (`lib/opco/textes-prise-en-charge.ts`) sous test littéral, comme
`titre-depot-signe.ts`. Vocabulaire : « demande de prise en charge », « point d'accueil »,
« commanditaire » — jamais « dossier OPCO » dans un bloc qui parle d'AGEFICE.

---

## 6. Modèle de données

**Aucune migration.** `OpcoSubmission` porte tout ce qu'il faut ; `attachments` (Json) garde
`{ key, filename, kind, included, signe }`. L'ordre des PJ est l'ordre du tableau.

Un seul ajout de type, sans colonne : `KindPieceDossier` reste identique ; on ajoute dans
`pieces-dossier.ts` la constante `PIECES_OBLIGATOIRES_AGEFICE` (ordre R-5) et
`messageDossierManquant(pieces)` (pendant de `messageDossierIncomplet` pour l'absence).

---

## 7. Lots (un worktree, une branche par lot, session Claude Code fraîche depuis `main`)

### Lot 0 — Rendre le dépôt des scans trouvable (½ jour) — `quick/260914-depot-scans-visible`
Détail en §1 (constat de Laurent). Zone ouverte par défaut + bouton explicite, action « Déposer le
signé » sur chaque ligne de document du pack, badge « signé le … ». Aucune nouvelle server action.

### Lot A — Règles pures et gabarit (½ jour) — `feat/agefice-envoi-lot-a`
- `lib/opco/gabarit-prise-en-charge.ts` : `objetPriseEnCharge(...)`, `corpsPriseEnCharge(...)` →
  `{ text, html }`. Test **littéral** : le texte attendu est le message de Laurent recopié dans le
  test avec un NIR fictif **à clé juste** : `185057800608491` (le placeholder du formulaire
  d'inscription, `1 85 05 78 006 084 36`, porte une clé FAUSSE — 91 attendue — à corriger au
  passage dans `session-enrollment-form.tsx`), pas reconstruit par le même code.
- `lib/opco/nir.ts` : `validerNir` (R-6) — tests : 13 chiffres, 15 avec clé juste, clé fausse,
  Corse 2A/2B, espaces, vide, lettres.
- `lib/opco/pieces-dossier.ts` : `PIECES_OBLIGATOIRES_AGEFICE`, `ordonnerPieces`,
  `messageDossierManquant` (nomme pièce + geste).
- `lib/opco/etat-prise-en-charge.ts` : état d'une ligne (§5) à partir de données déjà chargées —
  pur, testé.
- Mutation obligatoire avant de déclarer le lot livré (`/signature` §3 bis).

### Lot B — Moteur (½ jour) — `feat/agefice-envoi-lot-b`
- `composeOpcoSubmission` : si `estEligibleAgefice(participant)` → objet R-4, corps R-3 (NIR lu dans
  `SensitiveData`), PJ dans l'ordre R-5 ; sinon comportement d'origine (autres financeurs).
- `sendOpcoSubmission` : refus si pièce absente (R-5, sans dérogation), refus si NIR absent/invalide
  (R-6), Zod email (R-9), **`SENT` seulement si `!result.dryRun`** (R-7) avec message explicite ;
  R-12 (rien du NIR dans AuditLog / logs).
- `updateOpcoSubmissionDraft` : Zod sur `recipientEmail`.
- E-6 : `step-facturation.tsx` → `/app/dossiers-opco/envoyer/${id}` ; test de câblage (valeur
  littérale de la route, règle n°2 de `/signature`).
- Recette locale en `SIGNATURE_PROVIDER=dry-run` + mailer dry-run : vérifier que le dossier
  **reste DRAFT** et que le message dit pourquoi.

### Lot C — Écran (1 jour) — `feat/agefice-envoi-lot-c`
- Bloc « Prise en charge AGEFICE » onglet Avant (§5) : composant + test de câblage depuis
  `page.tsx` (props qui traversent), textes en module.
- Retitrage de l'écran `envoyer/[id]` quand le financeur est AGEFICE.
- `/app/dossiers-opco` : gate facture levé pour AGEFICE seulement.
- Bandeau antériorité R-11.
- Checklist server action de `/quick` (requireRole, tenantId partout, Zod avant I/O, AuditLog dans
  la transaction, `revalidatePath` de la fiche session).

### Lot D — Recette et mise en prod (½ jour)
1. Preview Vercel en mode test emails (catégorie `opco_submission` seule, destinataire forcé sur
   l'adresse de Laurent) : un envoi complet sur DEMO-SIG-01, contrôler les 6 PJ + certificat, le
   corps, l'objet, le cc.
2. Prod : **cocher « Envoi dossiers OPCO »** (Paramètres → Envois d'emails) — c'est le pré-requis
   noté le 12/09, sinon R-7 laissera tout en DRAFT.
3. Premier envoi réel : **un seul dossier**, Laurent choisit lequel ; journal de recette dans
   `.planning/specs/evidence/agefice-envoi/JOURNAL-RECETTE.md` (même forme que signature-C3).

---

## 8. Décisions ouvertes (défauts appliqués sauf contre-ordre de Laurent)

| # | Question | Défaut |
|---|---|---|
| D-1 | Qui signe le mail ? L'exemple est signé « Béatrice Blanc » | **L'utilisateur connecté** (prénom nom). Si Laurent veut un signataire fixe par tenant, c'est un champ `TenantEmailSettings` — à dire avant le lot A |
| D-2 | Objet du mail | `Demande de prise en charge — {Prénom NOM} — {intitulé formation}` |
| D-3 | NIR en clair dans un email | Oui : c'est ce que l'AGEFICE demande et la pratique actuelle. SMTP en TLS ; rien dans AuditLog/logs (R-12) |
| D-4 | Joindre les certificats de signature en plus des 6 pièces ? | **Oui** (règle n°3 de la spec signature — « c'est ce que les AGEFICE réclament ») |
| D-5 | Seuil d'alerte antériorité | 7 jours avant le début, non bloquant |
| D-6 | Dossier de **solde** (attestation d'assiduité signée + facture acquittée) au point d'accueil | **Lot E, chantier suivant** — même `OpcoSubmission`, nouveau `kind` de pièce, nouveau gabarit. Ne pas l'ouvrir dans ce chantier |
| D-7 | Corps modifiable avant envoi ? | Oui (écran existant), mais toute recomposition (« Préparer l'envoi » à nouveau) repart du gabarit |

---

## 9. Ce que la recette doit prouver (opposable)

1. Un inscrit AGEFICE avec 6 pièces + NIR + signatures → un email, 7 PJ dans l'ordre R-5, corps
   identique au texte de Laurent, objet R-4, cc utilisateur, statut SENT, `EmailMessage` tracé
   avec `documentIds`.
2. Le même inscrit sans RIB → **aucun** email, message « RIB manquant — déposez-le sur la fiche
   apprenant », statut DRAFT.
3. NIR `1640899350527` (clé fausse) → refus nominatif, DRAFT.
4. Catégorie « Envoi dossiers OPCO » décochée → DRAFT + message explicite, pas de SENT.
5. Session avec 3 inscrits AGEFICE → 3 lignes, 3 envois, 3 `OpcoSubmission`, jamais un mail
   groupé.
6. Inscrit non AGEFICE dans la même session → absent du bloc.
7. Lien « Voir le dossier OPCO » depuis l'étape Facturation → ouvre l'écran, pas de 404.
8. Mutation lancée sur les modules purs du lot A ; toute mutation restée verte est nommée dans le
   SUMMARY du lot.
