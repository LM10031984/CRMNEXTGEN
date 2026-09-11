# Spec — Financement FIF PL, circuit individuel (le stagiaire dépose, l'OF fournit les pièces)

Date : 2026-09-11 · Auteur : Laurent (via Cowork) · Statut : à valider (décisions D-1..D-7) puis implémenter

## Besoin

Quelques agents formés par Start Academy sont des professionnels libéraux (agents immobiliers
6831 Z, souvent en micro-entreprise) financés par le FIF PL. Aujourd'hui QualiOF ne sait rien
en faire : `FIFPL` est une étiquette d'affichage, rien n'est piloté, rien n'est généré, rien
n'est suivi. Laurent monte tout à la main (mail au stagiaire, attestation remplie dans le PDF
du FIF PL). Le circuit utilisé est **l'individuel** : le stagiaire saisit lui-même sa demande
sur son espace FIF PL, l'OF lui fournit les pièces avant et après, et c'est le stagiaire qui
est remboursé. Le circuit collectif (convention semestrielle, dossier par session, facture
globale payée à l'OF) est documenté en fin de spec mais **hors périmètre** de ce chantier.

Sources : dossier réel LS Patrimoine / Loïc Simeone (demande en ligne n° 1153544 du
09/10/2024, accord n° 24TEC53529.01 du 23/10/2024, 600 € pour 87 h), attestation unique
FIF PL (version 05/2026), critères 2026 agents immobiliers (modifiés 01/07/2026), fifpl.fr.

## Ce que dit le FIF PL (circuit individuel)

Chronologie imposée par le financeur — c'est elle qui structure le pipeline :

1. **Avant / au plus tard J1 + 10 jours calendaires** : le stagiaire saisit sa *demande
   préalable de prise en charge* en ligne. Passé 10 jours après le 1er jour de formation →
   refus sec. Pièces qu'il doit joindre, toutes fournies par l'OF sauf deux :
   devis de l'OF **ou** convention de stage ; programme **détaillé par journée** ; attestation
   de versement URSSAF (fonds de formation des non-salariés) ou attestation d'exonération ;
   RIB (les deux dernières sont à lui).
2. **Accord de prise en charge** : courrier FIF PL au stagiaire avec n° de dossier
   (`24TEC53529.01`), montant accordé (frais pédagogiques), sous réserve des jours/heures
   portés sur l'attestation finale. Le stagiaire nous le transmet (ou pas).
3. **Après la formation, sous 30 jours** : l'OF remplit l'*Attestation de présence et de
   règlement* (format FIF PL obligatoire), datée, signée, **cachet** obligatoire, et le
   stagiaire l'envoie avec son n° de dossier. Faute de réception sous 30 jours → dossier
   annulé, aucun paiement. Cette attestation certifie deux choses : la présence à la
   **totalité** de la formation, et que le stagiaire **a réglé la totalité** du coût
   pédagogique (montant HT et TTC).
4. Le FIF PL rembourse **le stagiaire** par virement. L'OF n'est jamais payé par le FIF PL
   dans ce circuit → la trésorerie de l'OF, c'est la facture au stagiaire, point.

Contenu de l'attestation (à générer) : responsable OF + fonction, dénomination OF, n° de
déclaration d'activité (11 chiffres), nom/prénom stagiaire, intitulé exact, dates du/au ;
**Partie 1** (présentiel, visio, classe virtuelle) : nombre de jours entiers (≥ 6 h), nombre
de demi-journées (≥ 3 h), total d'heures, ventilation par année civile si la formation est à
cheval sur deux ans ; **Partie 2** (e-learning) : total d'heures, nombre d'étapes validées,
date d'évaluation finale, même ventilation ; blended = parties 1 et 2 ; montant réglé HT et
TTC ; fait à / le ; cachet ; nom, prénom, signature du responsable.

Critères 2026 agents immobiliers (à porter en `FundingRule`, jamais en dur) :

| Règle | Valeur 2026 |
|---|---|
| Plafond annuel par professionnel | 900 € |
| Cœur de métier | coût réel plafonné à 300 €/jour |
| Transversal | 300 €/an, 150 € la demi-journée, en déduction du forfait |
| Durée minimale | 6 h (1 journée, ou 3 × 2 h, ou 2 × 3 h) ; 3 h = prise en charge demi-journée |
| E-learning | 50 % des critères journaliers et 50 % des critères annuels |
| Micro-entrepreneurs | proportionnel à la cotisation CFP : 1–20 € → 20 %, 21–40 € → 60 %, 41–80 € → 80 %, ≥ 81 € → 100 % |
| Formations longues (fonds spécifiques, hors budget annuel) | 70–89 h → 2 000 € ; 90–109 h → 2 500 € ; ≥ 110 h → 3 000 € (1 fois / 3 ans) |
| Exclus | informatique générale, langues, conférences sans atelier, formations CPF |
| Prérequis OF | Qualiopi |

Leçon du dossier réel : 87 h en 2024 → accord 600 €. L'estimation que le CRM affichera est
**indicative** ; le montant qui compte est celui de l'accord.

## État actuel du code (branche `quick/260902-diagnostic-boucle`)

- `lib/funder-codes.ts` connaît `FIFPL` ; `app/dossiers-opco/page.tsx:257` filtre sur
  `'FI-FPL'` (jamais matché) ; `OpcoCatalog` (seed) n'a pas de ligne FIF PL.
- Tout le pipeline financeur est **par participant** : `OpcoSubmission` (mail au financeur +
  PJ + relances), `AgeficeProfile` (1 par org EI, CFP, PDF 92 champs), 4 booléens tréso sur
  `SessionParticipant`, `financingStatus/RefNumber/RequestDate/ApprovalDate` génériques.
  `if (opcoCode === 'AGEFICE')` dans ~15 fichiers (l'audit E-5 du 28/08 demandait déjà de
  piloter par le référentiel).
- Le stagiaire libéral est déjà modélisé comme il faut : `Person` + `Organization` EI
  (SIRET, NAF, TVA) liés par `LegalLink EI_SELF`, `sponsorOrg` = son EI.
- Générateurs réutilisables : `PROGRAMME` (formateurs de session, prérequis, public,
  évaluation, profil formateur ; `derouleJson` par jour), `CONVENTION` individuelle, `Quote`
  (devis DEV-NNNN avec PDF), `FACTURE`, `EMARGEMENT`, et surtout
  `agefice-attendance-generator.ts` + `closure/agefice-attendance-template.ts` (attestation
  d'assiduité et de règlement AGEFICE : cachet via `loadStampDataUrl`, signature dirigeant,
  date de règlement lue sur `Invoice.paidAt`) — cousin direct de l'attestation FIF PL.
- `SessionSlot` porte `date/startTime/endTime/halfDay` → jours entiers, demi-journées, heures
  et ventilation par année civile se calculent sans nouveau champ.
- `PreEnrollment` porte `cfpKey` (attestation CFP AGEFICE) mais rien pour l'URSSAF.
- Tout ce que l'attestation demande sur l'OF existe déjà dans `lib/of-config.ts` : `rnq`
  (= `Tenant.numDA`, le n° de déclaration à 11 chiffres), `resp` (nom, prénom, `titre` =
  fonction exacte), `signatureDirigeantPath`, cachet via `loadStampDataUrl` (`tampon.png`,
  distinct du tampon « Payé » des factures acquittées).
- Le PDF programme rend `programMd` avec des sous-sections `h3.day` (« Jour 1 », « Matin »)
  : le « contenu détaillé par journée » exigé par le FIF PL dépend donc de la rédaction du
  produit, pas du template → prévoir un contrôle (avertissement si aucun titre de journée).
- Crons existants sur le même pattern : `opco-submission-reminders`,
  `preinscription-reminders` (Vercel cron + `CRON_SECRET`).

## Décisions de design

1. **Un dossier FIF PL = une inscription** (`SessionParticipant`), comme l'AGEFICE. Nouveau
   modèle `FifplDossier` plutôt que de tordre `OpcoSubmission` (qui est un *mail au
   financeur* avec relances ; ici on n'écrit jamais au FIF PL, on écrit au stagiaire).
2. **Les champs génériques de `SessionParticipant` restent la projection cross-financeur** :
   `financingMode = AUTRE`→ nouveau `FIFPL`, `financingStatus` (REQUESTED / APPROVED /
   REIMBURSED), `financingRefNumber` = n° de dossier FIF PL, `financingApprovalDate`. Le détail
   vit dans `FifplDossier`. Ainsi `/app/dossiers-opco`, le dashboard et les exports voient les
   lignes FIF PL sans branche spéciale.
3. **Pas de `if (code === 'FIFPL')` dans les générateurs ni le moteur** : la ligne
   `OpcoCatalog FIFPL` porte `requiredDocs`, délais et le *circuit* (`INDIVIDUEL`) ; les
   plafonds sont des `FundingRule` datées (`FIFPL_CAP_YEAR`, `FIFPL_CAP_DAY`,
   `FIFPL_TRANSVERSAL_CAP_YEAR`, `FIFPL_HALF_DAY`, `FIFPL_LONG_70`, `FIFPL_LONG_90`,
   `FIFPL_LONG_110`, `FIFPL_ELEARNING_RATIO`, `FIFPL_MIN_HOURS`, `FIFPL_HALFDAY_MIN_HOURS`,
   `FIFPL_FILING_DELAY_DAYS = 10`, `FIFPL_ATTESTATION_DELAY_DAYS = 30`).
4. **L'attestation de présence et de règlement est générée, jamais recopiée** : nouveau
   `DocType ATTESTATION_FIFPL`, template HTML/PDF au format FIF PL (mêmes libellés, mêmes
   blocs Partie 1 / Partie 2), cachet + signature du dirigeant depuis les assets tenant, hash
   sha256 idempotent comme `agefice-attendance-generator`.
5. **Gating de l'attestation sur la réalité** (sinon on certifie du faux) : présence =
   `Attendance` complète ou `enrollmentStatus = ATTENDED` ; règlement = facture du participant
   `PAID` (`Invoice.amountPaid ≥ amountTTC`). Le générateur refuse avec une erreur métier
   lisible tant que ce n'est pas vrai (cf. D-1 pour l'override).
6. **La trésorerie FIF PL, c'est la facture au stagiaire** : `billingType = STRUCTURE`
   (son EI) ou `PERSONNE`, `paymentStatus` habituel. Les booléens `remboursementOpco`,
   `validationOpco` sont **sans objet** pour FIF PL individuel → masqués, pas cochés.
   Le remboursement du stagiaire par le FIF PL est une info de suivi (`reimbursedAt`,
   déclaratif), pas un encaissement.
7. **Les 2 délais FIF PL deviennent des alertes** (même mécanique que les relances OPCO) :
   `J1 + 7` sans n° de demande en ligne → alerte « dossier FIF PL non déposé, refus dans 3 j » ;
   `fin + 20` sans attestation émise → alerte « attestation à produire, annulation dans 10 j ».
8. **Éligibilité calculée à l'inscription**, affichée, jamais bloquante : durée ≥ 6 h (ou 3 h
   demi-journée), modalité, thème non exclu, produit `fundingType`. Estimation de prise en
   charge = `min(jours × 300, 900 − consommé chez nous cette année)` × ratio micro-entrepreneur
   × ratio e-learning, ou forfait longue durée si ≥ 70 h. Mention « estimation, à confirmer par
   l'accord » obligatoire (règle de prudence financement déjà en vigueur).
9. **Rien de spécifique au tarif** : la décision SessionPricing s'applique (tarif indépendant).
   Le FIF PL prend « au coût réel plafonné », donc on facture le tarif normal.

## Modèle de données

```prisma
enum FinancingMode { OPCO CPF ENTREPRISE AUTOFINANCEMENT POLE_EMPLOI FIFPL AUTRE }

/// Profil libéral FIF PL d'une Organization EI (pendant de AgeficeProfile).
model FifplProfile {
  id                    String       @id @default(uuid())
  organizationId        String       @unique
  organization          Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  nafCode               String?      // "6831ZA" tel que porté par le FIF PL
  microEntrepreneur     Boolean      @default(false)
  vatSubject            Boolean?     // assujetti TVA (case du formulaire FIF PL)
  // Attestation de versement URSSAF (fonds de formation des non-salariés) — pièce du stagiaire
  urssafAttestationKey  String?
  urssafAttestationYear Int?
  cfpAmount             Float?       // cotisation CFP lue sur l'attestation → ratio micro-entrepreneur
  // Dernier n° adhérent / espace FIF PL connu (facultatif, aide à retrouver le dossier)
  fifplMemberNumber     String?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
}

enum FifplCircuit { INDIVIDUEL COLLECTIF }

/// Pipeline FIF PL individuel : ce que l'OF sait de la demande faite par le stagiaire.
enum FifplDossierStatus {
  KIT_TO_SEND     // inscription FIF PL créée, kit pas encore envoyé
  KIT_SENT        // devis/convention + programme + guide envoyés au stagiaire
  FILED           // le stagiaire a saisi sa demande (n° de demande en ligne connu)
  APPROVED        // accord reçu (n° dossier + montant)
  REJECTED
  ATTESTATION_ISSUED // attestation de présence et de règlement générée après la formation
  REIMBURSED      // stagiaire remboursé (déclaratif)
  CANCELED        // hors délai, abandon
}

model FifplDossier {
  id                    String             @id @default(uuid())
  tenantId              String
  participantId         String             @unique   // 1 dossier par inscription (resoumission = même dossier, historique en AuditLog)
  participant           SessionParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  circuit               FifplCircuit       @default(INDIVIDUEL)
  status                FifplDossierStatus @default(KIT_TO_SEND)
  // Étape 1 — kit stagiaire
  kitSentAt             DateTime?
  kitEmailMessageId     String?
  kitQuoteId            String?            // Quote utilisé comme devis (ou null si convention)
  // Étape 2 — demande saisie par le stagiaire
  onlineRequestNumber   String?            // "1153544"
  filedAt               DateTime?
  filingDeadline        DateTime           // session.startDate + 10 jours calendaires (figé à la création, recalculé si dates changent)
  // Étape 3 — accord
  dossierNumber         String?            // "24TEC53529.01"
  approvedAmount        Decimal?           @db.Decimal(10, 2)
  approvedAt            DateTime?
  approvalLetterKey     String?            // PDF de l'accord uploadé
  rejectedAt            DateTime?
  rejectionReason       String?
  // Étape 4 — attestation
  attestationDocId      String?            // Document ATTESTATION_FIFPL
  attestationIssuedAt   DateTime?
  attestationDeadline   DateTime?          // session.endDate + 30 jours
  attestationOverride   Boolean            @default(false) // D-1 : émise malgré facture non soldée
  // Étape 5 — remboursement du stagiaire (déclaratif)
  reimbursedAt          DateTime?
  // Éligibilité & estimation (snapshot à l'inscription, recalculable)
  eligibilityJson       Json?              // { eligible, reasons[], hours, fullDays, halfDays, elearning }
  estimatedAmount       Decimal?           @db.Decimal(10, 2)
  // Relances
  reminderCount         Int                @default(0)
  lastReminderSentAt    DateTime?
  internalNotes         String?
  createdById           String?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  @@index([tenantId, status])
  @@index([filingDeadline])
  @@index([attestationDeadline])
}
```

Ajouts ailleurs : `DocType.ATTESTATION_FIFPL` ; `OpcoCatalog` seed `FIFPL` (type `FAF`,
`website`, `requiredDocs` = [devis ou convention, programme détaillé par journée, attestation
URSSAF, RIB, attestation de présence et de règlement], `averageDelayDays` ≈ 14 pour l'accord,
`conditions` = résumé des critères, `internalNotes` = circuit individuel) ; `PreEnrollment.
urssafAttestationKey` (pièce demandée sur le formulaire public quand le financeur pressenti
est FIF PL, à côté de `cfpKey`) ; `Organization.opcoCode = 'FIFPL'` + `fifplProfile`.
Aucune reprise de l'historique : les dossiers passés restent dans l'Excel.

## Documents générés / envoyés

| Quand | Document | Source | Remarques |
|---|---|---|---|
| Kit stagiaire (avant J1) | Devis DEV-NNNN **ou** convention individuelle | `Quote` existant / `convention-generator` | D-2 : lequel par défaut |
| Kit stagiaire | Programme détaillé **par journée** | `programme-generator` + `derouleJson` | Vérifier que le PDF programme rend bien le contenu jour par jour, intervenants + qualifications, moyens d'accompagnement, type d'évaluation (liste de conformité FIF PL) — sinon compléter le template, c'est du Qualiopi de toute façon |
| Kit stagiaire | Mail « Votre prise en charge FIF PL en 4 étapes » | nouveau `EmailTemplate` | Étapes : télécharger l'attestation URSSAF, RIB, saisir la demande sur fifpl.fr **avant le {filingDeadline}**, nous transmettre l'accord. PJ = devis/convention + programme |
| Accord reçu | Courrier d'accord (upload) | `approvalLetterKey` | Saisie manuelle n° dossier + montant + date ; OCR optionnel plus tard (le courrier est très régulier : `N° de dossier :`, `montant total de … Euros`) |
| Fin + règlement | **Attestation de présence et de règlement** | nouveau `attestation-fifpl-generator` + template | Calculs depuis `SessionSlot` (jours entiers = journées dont heures ≥ 6, demi-journées = 3 ≤ h < 6, total heures, split par année civile), montants HT/TTC depuis la facture soldée, cachet + signature dirigeant, fonction du signataire (paramètre tenant) |
| Fin | Mail au stagiaire avec l'attestation | `EmailTemplate` | Rappel : à envoyer au FIF PL avec le n° de dossier, avant le {attestationDeadline} |

Réglage modalité → parties de l'attestation : `PRESENTIEL`, `DISTANCIEL` (visio/classe
virtuelle) → Partie 1 ; `ELEARNING` → Partie 2 ; `MIXTE` → Parties 1 et 2 avec les heures
ventilées (D-6 : d'où viennent les heures e-learning, les étapes validées et la date
d'évaluation finale pour les parcours Faros).

## Workflow dans l'interface

- **Fiche organisation EI** : bloc « FIF PL » (pendant du bloc AGEFICE) — attestation URSSAF,
  micro-entrepreneur, cotisation CFP, NAF. Badge financeur `FIF PL` partout où `AGEFICE`
  s'affiche (`formatFunderCode` déjà en place).
- **Inscription** (fiche session, onglet participant) : quand `sponsorOrg.opcoCode === FIFPL`
  (résolu via le catalogue, pas en dur), stepper 5 étapes : Kit envoyé → Demande déposée →
  Accord → Attestation → Remboursé, avec les deux échéances en clair et en couleur (vert /
  orange à J-3 / rouge dépassé). Actions : « Envoyer le kit », « Saisir le n° de demande »,
  « Saisir l'accord » (n°, montant, date, PDF), « Générer l'attestation » (désactivé + raison
  tant que présence ou facture non OK), « Marquer remboursé ».
- **/app/dossiers-opco** : les lignes FIF PL apparaissent via la projection
  `financingStatus`/`financingRefNumber` ; les colonnes « Validation OPCO / Remboursement
  OPCO » sont remplacées pour ces lignes par « Accord / Attestation » (rendu piloté par
  `OpcoCatalog.circuit`, pas par le code). Filtre financeur corrigé (`FIFPL`).
- **/app/financeurs/FIFPL** : KPI = dossiers en cours, accords cumulés, montant accordé cumulé,
  attestations en retard.
- **Formulaire public d'inscription / pré-inscription** : si financeur pressenti FIF PL, la
  pièce demandée est l'attestation URSSAF (pas la CFP AGEFICE) ; le texte d'aide explique où
  la télécharger sur urssaf.fr.
- **Alertes** (cron quotidien `fifpl-reminders`, même squelette que
  `opco-submission-reminders`) : J1+7 sans `onlineRequestNumber` ; fin+20 sans attestation ;
  notification interne + mail au stagiaire pour la première, interne seulement pour la seconde
  (c'est nous qui devons agir). Dédoublonnage par `lastReminderSentAt`.

## Lots

### Lot 0 — Référentiel (petit, sans risque)
- `FinancingMode.FIFPL` ; seed `OpcoCatalog FIFPL` ; `FundingRule` FIFPL_* datées 2026 ;
  correction `'FI-FPL'` → `'FIFPL'` ; `OpcoCatalog.circuit` (ou `internalNotes` structuré)
  pour dire « individuel ».
- Test : `formatFunderCode('FIFPL')`, filtre dossiers-opco ne perd plus les lignes.

### Lot 1 — Profil & dossier
- `FifplProfile`, `FifplDossier`, `PreEnrollment.urssafAttestationKey`, migration Prisma
  formelle (`prisma migrate`, pas `db push`, cf. mémoire).
- Création automatique du `FifplDossier` à l'inscription quand le sponsor est FIF PL
  (`enroll-from-request`, `session-enrollment-admin`, `preinscription-convert`) — un seul
  point d'entrée `ensureFifplDossier(participantId)` idempotent.
- Projection vers `SessionParticipant` (`financingMode/Status/RefNumber/ApprovalDate`) à
  chaque transition, dans la même transaction.
- Stepper sur la fiche inscription + bloc FIF PL sur la fiche organisation.
- Recalcul de `filingDeadline` / `attestationDeadline` quand `updateSessionDates` ou le
  wizard change les dates (brancher sur le même point que la dette `SessionSlot` notée dans
  la spec session-collecte).

### Lot 2 — Kit stagiaire
- `EmailTemplate` « kit FIF PL » + action `sendFifplKit(participantId)` : choisit devis ou
  convention (D-2), attache le programme, pose `kitSentAt`, passe en `KIT_SENT`.
- Vérification de conformité du PDF programme contre la liste FIF PL (contenu par journée,
  intervenants + qualifications, moyens d'accompagnement, évaluations) → compléter
  `programme-generator` si un item manque.
- Bloc « Éligibilité & estimation » (`computeFifplEligibility`, `estimateFifplAmount`) — pur,
  testé unitairement sur les cas : 7 h présentiel (300 €), 3 h (150 € transversal ou 300/2),
  14 h sur 2 jours (600 €), 87 h (2 000 € longue durée), e-learning 7 h (150 €),
  micro-entrepreneur CFP 30 € (× 60 %), plafond annuel atteint (0 €, motif).

### Lot 3 — Attestation de présence et de règlement
- `attestation-fifpl-generator.ts` + `closure/attestation-fifpl-template.ts` (clone
  structurel de l'attestation AGEFICE), `DocType ATTESTATION_FIFPL`, entrée dans
  `dispatch-generate-doc`, matrice Qualiopi, dossier apprenant unifié (spec du 10/09).
- Calcul `computeFifplDurations(slots)` pur et testé : jours entiers / demi-journées / heures /
  par année civile, et le cas « 2 × 3 h le même jour = 1 journée » (règle FIF PL des modules
  successifs) — D-5.
- Gating présence + règlement, override tracé (D-1). Deadline fin+30 affichée.
- Mail d'envoi au stagiaire avec rappel du n° de dossier.

### Lot 4 — Alertes & pilotage
- Cron `fifpl-reminders` (Vercel + `CRON_SECRET`), notifications, page financeur FIFPL,
  colonnes dossiers-opco pilotées par le circuit.
- Export CSV dossiers-opco enrichi (n° dossier, montant accordé, échéances).

### Lot 5 (plus tard, spec séparée) — Circuit collectif
Structure différente : convention semestrielle OF ↔ FIF PL avec quota de stagiaires ; **1
dossier par session** (pas par inscription) ; inscription des stagiaires sur l'extranet
≤ 48 h avant J1 (SIRET, coordonnées, attestation URSSAF — import Excel possible → on
générerait ce fichier) ; émargements transmis après ; **facture globale** de la session
payée par le FIF PL à l'OF (`billingType OPCO_DIRECT`, facture multi-participants
`participantIds` déjà prévue sur `Invoice`). `FifplDossier.circuit = COLLECTIF` +
`sessionId` réservent la place sans rien casser.

## Décisions ouvertes (à trancher avant le lot 3)

- **D-1 — Attestation et règlement.** L'attestation certifie que le stagiaire *a réglé la
  totalité*. Position proposée : refus de génération tant que la facture n'est pas soldée,
  avec un override explicite (`attestationOverride`, motif obligatoire, AuditLog) pour les cas
  où Laurent l'assume. Alternative : générer toujours et laisser la responsabilité à l'humain.
- **D-2 — Devis ou convention dans le kit ?** Le FIF PL accepte l'un ou l'autre. Proposé :
  la convention individuelle (déjà générée, obligatoire Qualiopi, porte le prix) ; le devis
  seulement s'il existe déjà (`Quote` lié) ou si Laurent le demande.
- **D-3 — Qui saisit le n° de demande en ligne ?** Le stagiaire ne le communique pas
  spontanément. Proposé : champ facultatif ; l'étape « déposé » peut être cochée sans numéro
  (date seule), l'alerte J1+7 se base sur `filedAt`.
- **D-4 — Suivre le remboursement du stagiaire ?** Ce n'est pas notre trésorerie. Proposé :
  oui mais déclaratif et facultatif (utile pour la relation client et pour savoir si l'accord
  a été honoré → mesure indirecte de la conformité de nos attestations).
- **D-5 — Règle de comptage des journées.** Une journée = ≥ 6 h le même jour ; demi-journée
  = 3 à < 6 h ; que fait-on d'un créneau < 3 h (ex. module de 2 h) ? Proposé : ignoré dans
  jours/demi-journées, compté dans le total d'heures, et signalé en avertissement à la
  génération.
- **D-6 — E-learning / blended (Faros).** Partie 2 exige « nombre d'étapes validées » et
  « date d'évaluation finale ». D'où viennent-elles ? (`Attendance` ne couvre pas
  l'e-learning.) Proposé : champs saisis à la main sur le dossier au moment de générer, en
  attendant un lien avec la plateforme e-learning.
- **D-7 — Programme « par journée ».** Le template ne force pas la structure par jour ;
  pour les produits dont `programMd` n'a pas de titres « Jour N », on complète le contenu
  (édition produit) ou on accepte un avertissement non bloquant à l'envoi du kit ? Proposé :
  avertissement + lien vers l'édition du produit.

## Tests d'acceptation

1. Inscrire un agent dont l'EI est `FIFPL` → `FifplDossier` créé en `KIT_TO_SEND`,
   `filingDeadline = J1 + 10`, estimation affichée avec mention « à confirmer ».
2. « Envoyer le kit » → mail parti avec convention + programme, statut `KIT_SENT`,
   `SessionParticipant.financingStatus = NOT_STARTED` (rien déposé encore).
3. Saisir l'accord `24TEC53529.01` / 600 € → `APPROVED`, `financingStatus = APPROVED`,
   `financingRefNumber` renseigné, ligne visible dans dossiers-opco avec filtre FIF PL.
4. Session terminée, facture non soldée → « Générer l'attestation » refuse avec le motif ;
   facture soldée → PDF conforme (jours/demi-journées/heures/HT/TTC/cachet/signature),
   `ATTESTATION_ISSUED`, document dans le dossier apprenant.
5. Session sur 2 années civiles (déc. → janv.) → ventilation par année correcte.
6. Cron J1+7 sans dépôt → 1 notification, pas de doublon le lendemain.
7. Changement des dates de session → les deux échéances suivent.
