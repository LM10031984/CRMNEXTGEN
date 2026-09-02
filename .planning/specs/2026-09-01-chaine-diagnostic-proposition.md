# Spec — Chaîne Diagnostic → Proposition (R1 → R2) intégrée à QualiOF

> **Date** : 2026-09-01 · **Auteur** : Laurent + Claude (session Cowork)
> **Statut** : SPEC VALIDÉE À IMPLÉMENTER — découpage en lots A→H, chaque lot livrable seul.
> **Pour** : Claude Code, sur le dépôt QualiOF (`files/`), branche de travail à créer depuis `cloud-migration`.
> **Sources** : repo GitHub `jean-guy-gif/start-academy-diagnostic` (l'app pilote Supabase, ci-après « le repo diag »), le CRM QualiOF actuel, les décisions déjà tranchées en mémoire projet (SessionPricing 28/08, audit produit 28/08, stand MLS 01/09).
> **Commande dédiée** : `/chaine-diagnostic [lot A..H | suite | --etat]` (`.claude/commands/chaine-diagnostic.md`) — c'est elle qu'on tape dans Claude Code pour exécuter cette spec.
> **Maquettes de rendu** : `2026-09-01-maquette-proposition.html` (3 pages) et `2026-09-01-maquette-audit.html` (**17 pages, v2**) — ce sont les références visuelles des deux sorties documentaires. La v2 de l'audit s'inspire de la business review Keller Williams fournie par Laurent le 01/09 (chiffres et objectifs par agent, préconisations individuelles, GPS 1 objectif → 3 priorités → plan d'action).

---

## 0. Décisions d'orientation (déjà arbitrées par Laurent le 01/09/2026)

| # | Décision | Conséquence |
|---|---|---|
| O-1 | **Tout vit dans QualiOF.** | Le repo diag n'est PAS déployé ni synchronisé : c'est une carrière de contenu et de logique (questions, moteurs, PRD financement) qu'on transpose. Une fois les lots A→E livrés, le repo diag est archivé. |
| O-2 | **Le diagnostic léger R1 est un sous-ensemble du complet** (~25 questions, mêmes IDs). | Un léger s'upgrade en complet sans re-saisie. L'express 8 questions du stand reste l'outil grand public (QR/salon) et n'est pas touché. |
| O-3 | **La proposition R2 est un document riche qui génère le devis officiel** (`Quote` DEV-NNNN existant). | Deux objets, zéro double saisie : la proposition porte le récit + le chiffrage ; le devis porte l'engagement juridique. Montants identiques par construction (test de contrat). |
| O-4 | La matière NXT coach (coachings, grilles d'analyse d'agences) nourrit le contenu de l'audit et des recommandations. | Voir §12 (Coach Brain) et l'annexe A quand le dossier est raccordé. |

**Le fil rouge métier** : la chaîne de vente Start Academy est un miroir de ce qu'on enseigne aux agences — un R1 de découverte qui pose un diagnostic, un R2 de restitution qui présente une stratégie chiffrée. L'outil doit faire vivre au dirigeant d'agence exactement la méthode qu'on lui vend.

---

## 1. Objectif business

Signer plus vite et suivre mieux, en connectant tous les rôles sur une seule chaîne :

```
Lead (stand express / reco / prospection)
  └─ R1 (commercial en RDV) : diagnostic COMPLET (69 q + équipe) ou LÉGER (~25 q)
       ├─ mode guidé / transcript / hybride (collage Plaud → pré-remplissage IA)
       ├─ synthèse FINANCEMENT en direct après le chapitre Équipe  ← l'effet démonstration en RDV
       └─ synthèse PIPELINE en direct après le chapitre Transformation
  └─ Entre R1 et R2 (asynchrone, jamais en live) :
       ├─ rapport d'AUDIT généré (moteur ratios + IA relue par le commercial)
       ├─ PROPOSITION chiffrée composée par le commercial (la main sur le prix)
       └─ lien public de PRÉ-INSCRIPTION du RDV : les participants déposent leurs pièces,
          choisissent parmi les dates proposées ; l'admin voit ce qui est bon / pas bon
  └─ R2 : remise de l'audit + de la proposition (PDF + lien web en lecture seule)
       └─ budget total par participant, prise en charge par régime, reste à charge
          du dirigeant — modifiable, remisable, et affichable « OFFERT »
  └─ Acceptation : devis DEV-NNNN par payeur + session + SessionPricing + conventions
  └─ Suivi : relances auto sur RDV pris / propositions sans réponse (lot H), pilotage patrons
```

Rôles connectés : **COMMERCIAL** (mène R1/R2, compose la proposition), **ADMIN** (valide les pièces, convertit, monte les dossiers financeurs), **MANAGER/patrons** (pilotage, arbitrage des gestes commerciaux), COMPTABLE (devis/factures en lecture), LECTEUR.

---

## 2. Ce qu'on réutilise de QualiOF (ne rien reconstruire de tout ça)

| Brique QualiOF | Usage dans la chaîne |
|---|---|
| `Lead` + `LeadAction` + distribution (phase 9) | Point d'entrée de la chaîne. Un diagnostic est TOUJOURS rattaché à un Lead (créé si besoin). `LeadStatus.PROPOSAL_SENT / NEGOTIATION / WON` scandent déjà le funnel. |
| `Person` / `Organization` / `LegalLink` + `payer-rule.ts` | Identité (Ch.1) et résolution du payeur. **Aucune table « clients » parallèle** (le repo diag en avait une — on ne la porte pas). |
| `PreEnrollment` + pipeline OCR + relances + validation admin | Le dépôt de dossier des participants. On ajoute une notion de **campagne par RDV** (§7), on ne refait ni l'OCR ni la validation. |
| `Quote` / `QuoteLine` (module Devis, DEV-NNNN) | Le devis officiel généré depuis la proposition acceptée (ou dès l'envoi, au choix du commercial). |
| `TrainingProduct` / `TrainingModule` | Le catalogue unique. Les 79 modules du repo diag y sont réconciliés (§5.3), jamais un 2ᵉ catalogue. |
| `OpcoCatalog` + `funder-codes.ts` | Référentiel financeurs. Le moteur budget lit `OpcoCatalog.requiredDocs` — pas de `if (code === 'AGEFICE')` (règle `/financeur`). |
| `AgeficeProfile` (`lastCfpAmount/Year/EligibleBudget`) + `OpcoSubmission` | La **consommation réelle** et l'éligibilité vérifiée des clients existants — prioritaire sur le déclaratif (§8.4). |
| `Document` / `DocType` / templates + chaîne WeasyPrint (footer HTML dans le body) | Rendu PDF de l'audit et de la proposition. + `sourceFingerprint` (§9.3). |
| RBAC `UserRole` + `requireRole` + scope `tenantId` + `AuditLog` en transaction | Toutes les nouvelles server actions suivent la check-list de `/quick` (commandes `.claude/commands/`). |
| `Task` / `Notification` / mailer fail-closed (`TenantEmailSettings`) + cron Vercel (`diagnostic-worker` existe) | Envois d'emails et relances (lot H). Chaque nouveau type d'email = une **catégorie décochable**, fail-closed. |
| Express du stand (`DiagnosticSubmission`, `/diagnostic`, `lib/diagnostic/questions.ts`) | **Gelé tel quel jusqu'au 10/09** (stand MLS le 09/09). Il reste l'outil grand public ; il crée des Leads que la chaîne R1 reprend. Pas de fusion de modèle en v1. |

## 3. Ce qu'on transpose du repo diag (la carrière)

| Actif du repo diag | Où il atterrit dans QualiOF |
|---|---|
| `docs/Diagnostic question referential.md` (11 chapitres, règles transverses) | Recopié dans `files/docs/` comme source de vérité métier, adapté (§6). Règle inchangée : toute modif du code ⇄ doc. |
| `src/lib/data/diagnostic-questions.ts` (69 questions typées, `showIf`, `prefillFrom`, libellés conversationnels + hints commercial) | `apps/web/src/lib/diagnostic-agence/questions.ts` — port quasi tel quel (§6.2). |
| `diagnostic-chapters.ts` (méta chapitres + synthèses intermédiaires) | `apps/web/src/lib/diagnostic-agence/chapters.ts`. |
| `ratios-service.ts` (ratios, benchmarks, alertes, `missing_required_data`) | `apps/web/src/lib/diagnostic-agence/ratios.ts` — **fonction pure sans dépendance** (contrainte sandbox : testable dans le conteneur). |
| `training-funding.ts` + `funding-config-service.ts` + PRD `funding-opco-ep-prd.md` | Moteur budget §8 + modèle `FundingRule` (§4). Le PRD OPCO EP du repo diag est LA spec du calcul — le recopier dans `files/docs/`. |
| `proposal-schema.ts` + `apply-commercial-discount.ts` (+ `describeCoverageState` : « pris en charge » ≠ « offert ») | `apps/web/src/lib/proposition/` — port avec extensions §9. Les tests du repo (remise plafonnée au reste à charge, motif obligatoire, warning > 15 %) sont portés aussi. |
| `build-recommendation-prompt.ts`, `build-proposal-prompt.ts`, `heuristic-*.ts` | `apps/web/src/lib/proposition/prompts/` — adaptés au catalogue QualiOF. Règle conservée telle quelle : **le LLM ne produit JAMAIS un prix** ; `costPerParticipant`/totaux toujours `null` en sortie IA, calculés par le code. |
| `build-audit-content.ts` + `audit-view` (couverture, synthèse dirigeant, chaîne commerciale, pratiques, priorités) | Structure du rapport d'audit §9.2, rendu WeasyPrint. |
| Doctrine `public-access-flow.md` (« **le client ne fait JAMAIS son diagnostic** », tokens hashés SHA-256, jamais le brut en base, `timingSafeEqual`, expiration/quota/révocation) | Reprise intégrale pour les liens publics §7/§9.5. |
| Modes `guided | transcript | hybrid` (déjà dans le contrat de création du repo) | §6.4 — avec, cette fois, une vraie UX de pré-remplissage (le point de douleur n°1 constaté). |
| `coach-brain-integration-plan.md` (couche consommatrice COACHNXT, inerte tant que vide) | §12 — on pose la même couche, brancheable sur la matière NXT coach. |
| PRD `proposition-commerciale-v2-prd.md` (blocs qui font signer : bios formateurs, chiffres cumulés, différenciants contractuels, charte) | Blocs optionnels de la proposition §9.1 — chiffres et bios en **paramètres tenant**, jamais en dur. |

## 4. Modèle de données (Prisma — additif, aucune reprise du passé)

> Conventions : `tenantId` partout, index sur les chemins de liste, `Decimal` pour les montants, relations nommées. Migrations `prisma migrate` (jamais `db push` — règle `/livraison`).

```prisma
// ============ Référentiel financement paramétrable (port de funding_config) ============
model FundingRule {
  id           String    @id @default(uuid())
  tenantId     String
  key          String    // cf. seeds ci-dessous
  valueNumeric Decimal?  @db.Decimal(12, 2)
  valueText    String?
  validFrom    DateTime  @default(now())
  validTo      DateTime? // null = actif
  notes        String?
  createdById  String?
  createdAt    DateTime  @default(now())
  // Une seule ligne active par clé : index partiel à poser en SQL dans la migration
  // (CREATE UNIQUE INDEX ... WHERE "validTo" IS NULL) — pattern du repo diag.
  @@index([tenantId, key, validTo])
}

// ============ Le diagnostic d'agence (R1) ============
enum DiagnosticVariant { LEGER  COMPLET }
enum DiagnosticMode    { GUIDE  TRANSCRIPT  HYBRIDE }
enum DiagnosticStatus  { EN_COURS  TERMINE  ARCHIVE }

model Diagnostic {
  id                 String            @id @default(uuid())
  tenantId           String
  reference          String            @unique // DIAG-NNNN (compteur tenant, comme DEV/SES)
  leadId             String
  lead               Lead              @relation(fields: [leadId], references: [id])
  organizationId     String?           // l'agence diagnostiquée (créée/liée dès que SIRET connu)
  organization       Organization?     @relation(fields: [organizationId], references: [id])
  ownerUserId        String            // le commercial qui mène le RDV
  owner              User              @relation(fields: [ownerUserId], references: [id])
  variant            DiagnosticVariant @default(LEGER)
  mode               DiagnosticMode    @default(GUIDE)
  status             DiagnosticStatus  @default(EN_COURS)
  meetingAt          DateTime?         // date du R1
  r2PlannedAt        DateTime?         // date du R2 (pilotage + relances lot H)
  referentialVersion String            // ex "2026-09" — fige le set de questions applicable
  // Contexte agence déclaré en Ch.1 qui n'a PAS sa place sur Organization
  // (CA N-1, ventes N-1, répartition activité, objectif CA, ambition 3 ans)
  // → vit en DiagnosticAnswer comme le reste. Organization ne porte QUE l'identité durable.
  declaredGoal        String?
  expectedParticipants Int?
  // Transcript (mode TRANSCRIPT/HYBRIDE)
  transcriptText     String?           // collé par le commercial — JAMAIS exposé en public
  transcriptSource   String?           // "colle" | "fichier" | "plaud" (lot H)
  prefillModel       String?           // modèle IA utilisé pour le pré-remplissage
  prefillAt          DateTime?
  // Snapshot moteur (recalculé à chaque complétion de chapitre, versionné)
  computedSnapshot   Json?             // { ratios, alerts, funding, computedAt, rulesVersion }
  completedAt        DateTime?
  answers            DiagnosticAnswer[]
  participants       DiagnosticParticipant[]
  proposals          Proposal[]
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  @@index([tenantId, status])
  @@index([tenantId, ownerUserId, status])
  @@index([organizationId])
}

enum AnswerOrigin { COMMERCIAL  IA_TRANSCRIPT }

model DiagnosticAnswer {
  id           String       @id @default(uuid())
  diagnosticId String
  diagnostic   Diagnostic   @relation(fields: [diagnosticId], references: [id], onDelete: Cascade)
  questionId   String       // id du référentiel code (ex "mandates-exclusivity-percent")
  value        Json?        // typé selon la question (int/percent/choice/multichoice/text/yesno)
  isSkipped    Boolean      @default(false)
  origin       AnswerOrigin @default(COMMERCIAL)
  aiConfidence Decimal?     @db.Decimal(4, 3) // 0..1 — seulement si origin = IA_TRANSCRIPT
  confirmedAt  DateTime?    // null + origin IA = « à confirmer » (revue par exception §6.4)
  confirmedById String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  @@unique([diagnosticId, questionId])
  @@index([diagnosticId])
}

// Ch.2 — fiches équipe répétables (indés / salariés). C'est CE modèle qui alimente
// le moteur budget. personId nullable : en R1 on saisit vite, le lien CRM se fait après.
enum DiagParticipantStatut { INDEPENDANT  SALARIE  DIRIGEANT }

model DiagnosticParticipant {
  id             String     @id @default(uuid())
  diagnosticId   String
  diagnostic     Diagnostic @relation(fields: [diagnosticId], references: [id], onDelete: Cascade)
  personId       String?    // lié au CRM 360° quand la personne existe / est créée
  displayName    String     // saisi en RDV — donnée sensible : jamais en lien public ni prompt IA
  statut         DiagParticipantStatut
  fonction       String?    // salariés
  fullTime       Boolean?
  entryDate      DateTime?
  experienceLevel String?   // debutant | confirme | expert
  caN1           Decimal?   @db.Decimal(12, 2) // indés — pivot AGEFICE (seuil 7 000 €)
  caCurrent      Decimal?   @db.Decimal(12, 2) // projection — JAMAIS présentée comme acquise
  opcoEligible   Boolean?   // salariés — pré-coché oui (IDCC 1527)
  trainings24mCount Int?
  trainings24mHours Int?
  trainings24mFunded Decimal? @db.Decimal(12, 2)
  wantsTraining  Boolean?
  priorityNeed   String?    // mapping familles catalogue
  objectiveCa    Decimal?   @db.Decimal(12, 2) // objectif proposé (page « équipe » de l'audit), validé en entretien
  strengths      String?    // forces/constats individuels saisis par le commercial — nourrit la préconisation nominative
  includedInProposal Boolean @default(true)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  @@index([diagnosticId])
}
```

```prisma
// ============ La proposition (R2) ============
enum ProposalStatus { BROUILLON  PRETE  ENVOYEE  ACCEPTEE  REFUSEE  EXPIREE }

model Proposal {
  id             String         @id @default(uuid())
  tenantId       String
  reference      String         @unique // PROP-NNNN
  diagnosticId   String
  diagnostic     Diagnostic     @relation(fields: [diagnosticId], references: [id])
  leadId         String
  organizationId String?
  ownerUserId    String
  status         ProposalStatus @default(BROUILLON)
  title          String
  validUntil     DateTime?      // défaut : +30 j (paramètre FundingRule PROPOSAL_VALIDITY_DAYS)
  // Contenu narratif structuré (port du ProposalSchema Zod — §9.1) :
  // executiveSummary, constats, programme (modules), calendrier, prochaines étapes…
  contentJson    Json
  // Chiffrage : LIGNES PAR PAYEUR (§8.3) — la main du commercial
  pricingJson    Json
  // Ventilation financement par régime (§8) + reste à charge consolidé
  fundingJson    Json
  generationSource String       // "llm:<model>" | "heuristique" | "manuel" — E-3 : jamais silencieux
  reviewedAt     DateTime?      // relecture humaine OBLIGATOIRE avant envoi (§10)
  sentAt         DateTime?
  acceptedAt     DateTime?
  declinedAt     DateTime?
  declineReason  String?
  publicTokenHash String?       // lien lecture seule dirigeant — SHA-256, jamais le brut
  publicTokenExpiresAt DateTime?
  pdfKey         String?        // MinIO
  sourceFingerprint String?     // SHA-256 des données rendues → isDocumentStale() (E-1)
  quotes         Quote[]        // devis générés (un par payeur) — FK ajoutée sur Quote
  sessionId      String?        // session créée à l'acceptation (lot G)
  batchId        String?        // campagne de pré-inscription liée (§7)
  version        Int            @default(1)
  supersedesId   String?        // une proposition renégociée = NOUVELLE version, l'ancienne EXPIREE
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  @@index([tenantId, status])
  @@index([diagnosticId])
}
// Sur Quote : ajouter `proposalId String?` + relation (additif, sans casser le module Devis).

// ============ Campagne de pré-inscription par RDV (§7) ============
enum BatchStatus { OUVERTE  CLOTUREE  ANNULEE }

model EnrollmentBatch {
  id           String      @id @default(uuid())
  tenantId     String
  label        String      // "RDV OPTIMMO — R1 du 12/09"
  diagnosticId String?     @unique
  proposalId   String?
  productId    String?     // produit pressenti (pré-remplit les pré-inscriptions)
  tokenHash    String      // lien public multi-usages, hashé (doctrine §3 repo diag)
  expiresAt    DateTime
  maxUses      Int?        // défaut : 3 × effectif attendu
  usedCount    Int         @default(0)
  status       BatchStatus @default(OUVERTE)
  createdById  String
  dateOptions  BatchDateOption[]
  preEnrollments PreEnrollment[] // FK batchId ajoutée sur PreEnrollment (additif)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([tenantId, status])
}

model BatchDateOption {
  id        String          @id @default(uuid())
  batchId   String
  batch     EnrollmentBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  startsAt  DateTime
  endsAt    DateTime
  label     String?         // "Journée 1 — 8 h, dans vos locaux"
  isRetained Boolean        @default(false) // la date retenue devient la session (lot G)
  votes     Json?           // { preEnrollmentId: true } — choix des participants
  @@index([batchId])
}
```

**Seeds `FundingRule`** (valeurs initiales, datées, révisables sans redéploiement — les chiffres de Laurent du 01/09 et du PRD OPCO EP) :

| key | valeur | Sémantique |
|---|---|---|
| `AGEFICE_THRESHOLD_CA_N1` | 7 000 | Seuil CA N-1 (€) rendant un indé **potentiellement** éligible (proxy commercial en R1) |
| `AGEFICE_ANNUAL_CAP` | 3 000 | Enveloppe annuelle indicative par indé éligible |
| `AGEFICE_ANNUAL_CAP_REDUCED` | 600 | Enveloppe si CFP < 7 € (aligné `AgeficeProfile.lastCfpEligibleBudget`) |
| `AGEFICE_HOURLY_PRESENTIEL` | 42 | €/h pris en charge présentiel (vérifié 01/09/2026) |
| `AGEFICE_HOURLY_DISTANCIEL` | 35 | €/h distanciel synchrone |
| `AGEFICE_LEAD_DAYS_MIN` | 15 | Dépôt du dossier ≥ 15 jours calendaires avant démarrage |
| `OPCO_EP_ENVELOPE_LT_11` | 2 500 | Enveloppe entreprise/an, < 11 salariés (« l'entreprise entière ») |
| `OPCO_EP_ENVELOPE_11_TO_50` | 4 500 | Enveloppe entreprise/an, 11 à 50 salariés |
| `OPCO_EP_RATE_REGLEMENTAIRE` | 40 | €/h (UNIQUEMENT TRACFIN / non-discrimination / déontologie) |
| `OPCO_EP_RATE_COEUR_METIER` | 30 | €/h (tout le reste — défaut) |
| `PRICE_PER_HOUR_PER_PARTICIPANT` | 84 | Tarif de vente Start Academy tout compris, €/h/participant — PARAMÈTRE, la main de Laurent |
| `CONSUMPTION_LEVER_PERCENT` | 30 | Sous ce taux de consommation 24 mois → levier « droits sous-utilisés » |
| `DISCOUNT_WARNING_PERCENT` | 15 | Au-delà, remise à faire valider par un MANAGER/ADMIN (§8.3) |
| `PROPOSAL_VALIDITY_DAYS` | 30 | Validité par défaut d'une proposition |

⚠ **Note de réconciliation AGEFICE** (à écrire en commentaire du moteur) : en R1 prospect, on ne connaît pas la CFP → le seuil CA N-1 > 7 000 € sert d'**estimation commerciale**. Dès que le client existe au CRM avec `AgeficeProfile.lastCfpEligibleBudget`, c'est la **CFP réelle qui fait foi** (3 000 / 600 / 0) et l'UI passe le badge de « estimation déclarative » à « vérifié CRM » (§8.4). Une estimation n'est jamais affichée comme un droit acquis.

---

## 5. Ce qu'on NE reprend PAS du repo diag — et pourquoi (le « lourd » identifié)

C'est la section demandée explicitement : ce qui est lourd, ce qui pose problème, et le choix fait.

| # | Point lourd / problème | Décision |
|---|---|---|
| L-1 | **Toute la pile Supabase** : 35 migrations, RLS hardening en 7 phases, `service_role`, auth séparée. | On ne porte RIEN de l'infra. QualiOF a déjà auth, RBAC, tenancy, storage MinIO. On porte du **contenu** et des **fonctions pures**. |
| L-2 | **Le flow de saisie « une question par écran »** (`new-diagnostic-flow.tsx`, 2 181 lignes). C'est LE point de douleur cité par Laurent : en RDV on est obligé de faire défiler 69 questions une à une, et coller un transcript n'en dispense pas. | Ré-UX complète : **une page par chapitre** (11 pages en complet, 5 en léger), champs compacts, navigation clavier (Entrée = champ suivant, ⌘←/→ = chapitre), autosave par réponse. Le composant est découpé (1 composant par type de question + 1 orchestrateur < 300 lignes). |
| L-3 | **Le mode transcript sous-exploité** : le contrat `guided|transcript|hybrid` existe côté API mais l'UI force la saisie question par question. | §6.4 : collage du transcript → extraction IA → **revue par exception** (on ne relit que les réponses incertaines ou vides, pas les 69). |
| L-4 | **La table `clients` du repo** (doublon de Person/Organization). | Poubelle. Identité = `Organization` + `Lead`, point. |
| L-5 | **La génération de supports pédagogiques + slides designées** (`training-support`, `designed-support`, quality reviews). | Hors périmètre : c'est de l'après-signature, QualiOF a déjà sa production documentaire. On garde uniquement le pattern « IA + fallback heuristique + schéma Zod strict ». |
| L-6 | **Mail dirigeant IA + pack communication interne (WhatsApp/LinkedIn/pitch réunion)**. | Reporté en lot H : différenciant sympa, pas structurant. La proposition v1 sort avec un email d'envoi sobre (template mailer). |
| L-7 | **Chiffres en dur datés** (« +500 professionnels formés », bios formateurs) dans la proposition v2 du repo. | Paramètres tenant (`TenantSettings` / table dédiée §9.1) révisables sans re-générer. Jamais dans le template. |
| L-8 | **Les appels IA pendant le RDV**. Latence OpenRouter + risque de stub silencieux (leçon E-3 : `usedStub=true` non bloquant = PDF générique livré avec badge vert). | Règle d'architecture : **en RDV, uniquement des fonctions pures** (synthèse financement, funnel) — réponse instantanée, zéro IA. L'IA travaille **entre R1 et R2** (jobs asynchrones) et sa sortie est TOUJOURS relue (`reviewedAt` obligatoire avant envoi). `generationSource` visible ; une proposition heuristique non relue ne part jamais. |
| L-9 | **Deux référentiels qui divergent** (doc ⇄ code) et **deux catalogues** (79 modules repo vs `TrainingProduct/TrainingModule` QualiOF). | Tests de contrat doc ⇄ code (compte + IDs) portés du repo. Catalogue : réconciliation à sens unique vers QualiOF (§5.3), le fichier `module-catalog.ts` du repo meurt après import. |
| L-10 | **PII des fiches équipe** (nom + CA N-1 par agent = donnée sensible). Règle du référentiel : jamais dans les liens publics, jamais dans les prompts IA en brut. | Le moteur ratios reçoit des **agrégats** ; les prompts reçoivent ratios + alertes + benchmarks, pas les réponses nominatives (règle 5 du référentiel). Les pages publiques n'affichent AUCUNE donnée individuelle du diagnostic. |
| L-11 | **La pige** : interdite dans tout contenu public depuis le 11/08/2026 (règle métier confirmée le 01/09). Or le référentiel interne et le catalogue en parlent. | Le questionnaire interne PEUT poser les questions pige (outil commercial). Les **sorties client** (audit remis, proposition, pages publiques) ne recommandent jamais un module pige : filtre `excludedFromClientOutputs` sur `TrainingModule` + test de contrat. |
| L-12 | **Fenêtre de tir** : phase 22 (bascule prod RGPD) en cours + stand MLS le 09/09 (express gelé, `MAIL_DRY_RUN` à surveiller). | Le lot A ne touche ni l'express, ni le mailer, ni le worker existant. Démarrage conseillé : après le 10/09, sur branche dédiée. |
| L-13 | **> 50 salariés** : enveloppe OPCO EP non calculable automatiquement. | Alerte bloquante d'affichage « à valider manuellement avec l'OPCO EP » (PRD §3.1) — le moteur n'invente rien. |
| L-14 | **Surplus au-delà de l'enveloppe** : PAS de règle de priorité automatique entre participants. | Le surplus = reste à charge additionnel, arbitré par le commercial (répartir / renoncer à des modules / assumer). L'UI expose les trois leviers, n'en choisit aucun en silence (PRD §5.3 — même philosophie que l'exception dure SessionPricing). |

### 5.3 Réconciliation du catalogue (pré-requis du lot D)

**Sources, par ordre de vérité** : ① les produits QualiOF existants (`TrainingProduct`, PROD-NNNN — cf. « QCM par produit » : IA 8 h/16 h/24 h/40 h/72 h…, Booster vendeur 0059, Cycle prospection 053, Cadastre 1&2, Tracfin 0062/0671) ; ② le dossier Drive **« Formations et programmes »** (programmes numérotés 008 → 074, dont les métier purs : 008 Face à face acheteurs, 013 Basic vendeur, 055 Maîtrise des techniques de vente, 058 Booster vendeur, 059 Booster Acheteurs, dossiers Mindset / Manager directeur) ; ③ le repo diag et le parcours Agent Incomparable comme **compléments** (signaux diagnostic, e-learning). Le mapping `diagnosticSignals → modules` couvre les DEUX familles — chaque chapitre faible a au moins un programme métier ET un programme IA candidats.

Script one-shot `scripts/import-diag-catalog.ts` : lit le `module-catalog.ts` du repo diag (79 modules, familles, `diagnosticSignals`, `needIdentification`, `isFoundationModule`, profils cibles) et l'aligne sur QualiOF :

- `TrainingModule` reçoit 3 champs additifs : `diagnosticSignals Json?`, `needIdentification String?`, `isFoundation Boolean @default(false)` + `targetProfile String?` + `family String?`.
- Matching par nom normalisé sur les modules existants ; création des manquants en `isActive=false` (Laurent active ce qu'il vend réellement).
- Ajout `TrainingProduct.fundingType` : `REGLEMENTAIRE | COEUR_METIER` (défaut `COEUR_METIER`) + `format` par session déjà couvert par `Modality`.
- Rapport d'import (créés / matchés / ambigus) déposé en `.planning/`, à valider par Laurent AVANT activation.

---

## 6. Le diagnostic R1

### 6.1 Structure — 3 étages, pas 69 écrans

1. **Étage identité (Ch.1)** — pré-rempli depuis `Lead`/`Organization` (+ `lookupSiret` pour SIRET/APE/adresse). Les déclaratifs de contexte (CA N-1 agence, ventes N-1, répartition transaction/location/gestion, objectif CA, ambition 3 ans) sont des `DiagnosticAnswer` (IDs `identity-*` à créer, même mécanique). Alerte non bloquante si transaction ancien < 50 % du CA.
2. **Étage équipe & financement (Ch.2)** — grille `DiagnosticParticipant` répétable (une ligne par indé/salarié, saisie 15 s par ligne), complétable après le RDV. Contrôle de cohérence effectifs (somme ≈ total, avertissement non bloquant). **À la sortie du chapitre : SYNTHÈSE FINANCEMENT en direct** (§8) — c'est le moment de démonstration du R1.
3. **Étage questionnaire (Ch.3 → Ch.11)** — les 69 questions portées du repo, une page par chapitre, `showIf`/`prefillFrom` respectés (jamais reposer une question déjà répondue — outils Ch.3/4 → Ch.10). **Après Ch.8 : SYNTHÈSE PIPELINE** (funnel + 2 maillons faibles vs benchmarks).

Règles transverses conservées : une donnée obligatoire manquante **ne bloque jamais** — elle génère l'alerte `missing_required_data` (contrat du repo : uniquement si la question a une trace) visible au cockpit et dans le rapport.

### 6.2 Les deux variantes

- **COMPLET** = tout (l'audit 360°, ~60-90 min, se vend comme une prestation en soi).
- **LÉGER** = le sous-ensemble ci-dessous (~25-35 min), pensé pour un R1 sec : funnel complet + financement + douleurs. Même IDs → **un LÉGER s'upgrade en COMPLET** (bouton « Passer en audit complet » : les réponses restent, les questions restantes apparaissent).

Set léger v1 (constante `LIGHT_QUESTION_SET`, versionnée `referentialVersion`, ~25 questions — à faire valider par Laurent au premier test terrain) :

| Chapitre | Questions retenues |
|---|---|
| Ch.1 identité | org + SIRET + effectifs + CA N-1 + ventes N-1 + répartition activité + objectif CA |
| Ch.2 équipe | la grille participants (obligatoire — sans elle, pas de budget) + « déjà utilisé AGEFICE / OPCO ? » + « refus antérieurs ? » |
| Ch.3 | prospecting-methods · prospecting-who · prospecting-contacts-per-month |
| Ch.4 | seller-meetings-per-month · seller-discovery-formalized |
| Ch.5 | mandates-per-month · mandates-active-stock · mandates-exclusivity-percent · mandates-price-above-market |
| Ch.6 | commercial-followup-frequency · commercial-price-drop-per-month-percent |
| Ch.7 | buyers-contacts-per-month · buyers-financing-verified |
| Ch.8 | visits-per-month · offers-per-month · compromis-per-month · actes-per-month |
| Ch.9 | db-volume · google-reviews-count · google-reviews-score |
| Ch.10 | tools-metier · tools-ai-usage |
| Ch.11 | mgmt-indicators-followed · mgmt-top3-difficulties · mgmt-top3-priorities |

Le léger couvre ainsi : le funnel de bout en bout, toutes les « alertes fortes » du référentiel, le financement, et les priorités du dirigeant — de quoi produire une proposition R2 étayée. Ce qui saute : le détail des pratiques, l'outillage fin (Ch.10 long), le management détaillé.

### 6.3 UX de saisie (exigences non négociables)

- **Autosave par réponse** (server action par champ, débouncée) avec retry réseau et indicateur d'état — un R1 se fait dans une agence au wifi douteux ; en cas d'échec réseau persistant, la saisie continue en mémoire et se rejoue (PAS de localStorage non gaté — contrat existant du projet).
- Reprise : rouvrir un diagnostic EN_COURS ramène au premier chapitre incomplet.
- Barre de progression PAR CHAPITRE (pas globale question par question).
- Chaque question affiche le **hint commercial** du référentiel (la façon de poser la question à l'oral — c'est le script de l'entretien).
- Utilisable au clavier seul, iPad OK (le commercial est en face du client, pas derrière un 27").

### 6.4 Mode transcript / hybride — la réponse au point de douleur n°1

Parcours : le commercial mène son R1 en conversation libre (enregistré, ex. Plaud), puis :

1. Colle le transcript (ou dépose un `.txt`/`.md`/`.vtt`) dans l'onglet « Transcript » du diagnostic. v1 = collage ; l'import direct Plaud est un connecteur lot H.
2. Job asynchrone `prefill-from-transcript` : UN appel LLM structuré qui mappe le transcript sur le set de questions de la variante. Sortie Zod stricte : `{ questionId, value, confidence, quote }` — `quote` = l'extrait du transcript qui justifie la réponse (affiché au survol, c'est ce qui rend la revue rapide et confiante). Règles prompt : ne JAMAIS inventer ; pas déductible = absent ; les montants ne sont jamais arrondis « embellis ».
3. Les réponses arrivent en `origin=IA_TRANSCRIPT`, `confirmedAt=null` → badge « à confirmer ».
4. **Écran de revue par exception** : 3 files — (a) confiance < seuil (paramètre, défaut 0,7) à vérifier en premier, (b) confiance ≥ seuil confirmables en masse (« Tout confirmer » chapitre par chapitre), (c) sans réponse → à poser au R2 ou par téléphone. On ne défile plus jamais 69 écrans.
5. Mode HYBRIDE = les deux : saisie guidée partielle en RDV + transcript pour boucher les trous (l'extracteur ne touche JAMAIS une réponse `origin=COMMERCIAL`).

Garde-fous : transcript jamais dans un lien public, jamais dans le rapport client ; purge du `transcriptText` à J+90 (paramètre RGPD, aligné phase 22) ; l'extraction passe par le rate-limit et le monitoring IA existants ; job visible avec statut (pattern `AIGenerationJob`).

---

## 7. Le lien de pré-inscription par RDV (`EnrollmentBatch`)

**Besoin exprimé** : « générer un lien par rapport à ce rendez-vous où les gens peuvent se préinscrire, déposer leur dossier et leurs papiers. Comme ça, l'admin peut voir ce qui est bon ou pas bon. On peut mettre des dates préalables de formation. »

### 7.1 Parcours

1. Depuis le diagnostic (ou la proposition), le commercial crée une **campagne de RDV** : libellé, produit pressenti, 2-3 **dates prévisionnelles** (`BatchDateOption`), expiration (défaut : date du R2 + 30 j). Un seul lien multi-usages est généré (token affiché une seule fois, doctrine §3 du repo diag).
2. Le dirigeant diffuse le lien à son équipe (ou Start Academy l'envoie — email catégorie « Lien de pré-inscription », fail-closed).
3. Chaque participant ouvre le lien → page publique `/rdv/[token]` : identité + statut (agent co / salarié / dirigeant) + choix de date préférée + dépôt des pièces (CNI recto/verso, RIB, attestation CFP pour les TNS — **exactement le formulaire `PreEnrollment` existant**, pré-configuré par la campagne). Chaque soumission crée un `PreEnrollment(batchId=…)` qui entre dans le pipeline existant : OCR, extraction, **validation admin** (bon / pas bon / motif de rejet / relance) — rien de nouveau à construire ici.
4. Le commercial et l'admin voient l'avancement AGRÉGÉ sur la fiche campagne : X pré-inscrits / Y attendus, pièces complètes / incomplètes / rejetées, votes par date. C'est l'écran « ce qui est bon ou pas bon ».
5. À l'acceptation de la proposition (lot G) : la date retenue devient la (les) `TrainingSession`, les PreEnrollments validés sont convertis (Person/Org/LegalLink/participants) par le flux de conversion existant.

### 7.2 Règles

- Un participant ne voit JAMAIS le diagnostic, la proposition ou les autres participants — il ne voit que SON formulaire (doctrine « le client ne fait jamais son diagnostic », étendue : il ne voit pas non plus le chiffrage des autres).
- La deadline administrative est calculée et AFFICHÉE : `date de session la plus proche − AGEFICE_LEAD_DAYS_MIN (15 j)` — « pièces réunies au plus tard le … » (c'est déjà l'argument de la proposition OPTIMO réelle).
- Compteur `usedCount`/`maxUses`, révocation (`status=ANNULEE`), pas de PII dans les URL, `Cache-Control: no-store`.
- La campagne alimente la relance admin existante des `PreEnrollment` PENDING_FORM (lastReminderSentAt/reminderCount) — pas de second système de relance.

---

## 8. Le moteur budget & tarification (règles Laurent du 01/09/2026 — consolidées)

> Port du PRD `funding-opco-ep-prd.md` (repo diag) + règles dictées par Laurent le 01/09. Tout paramètre vit dans `FundingRule` (§4). Moteur = **fonctions pures** dans `apps/web/src/lib/financement/` (mêmes signatures d'esprit que `training-funding.ts`), testables hors DB.

### 8.1 La règle de tarification Start Academy

- **Une demi-journée de formation (4 h sur site, co-animée par 2 formateurs) est facturée 336 € HT par participant.**
- Le dossier de financement correspondant est monté sur **8 heures conventionnées** (4 h × 2 formateurs — « à deux, ça avance plus vite ») : paramètres `TRAINER_COUNT_DEFAULT = 2` et `heures conventionnées = heures sur site × nb formateurs`.
- Équivalence : 336 € = 8 h conventionnées × 42 €/h — soit, côté AGEFICE présentiel, **une prise en charge de 100 %** de la demi-journée pour un indé éligible.
- **⚠ Ligne rouge de cohérence (non négociable, héritée du PRD proposition v2)** : les heures conventionnées sont LA valeur de référence UNIQUE — proposition, convention, feuilles d'émargement, attestation d'assiduité, dossier financeur portent LE MÊME nombre d'heures. Le système l'impose par construction (une seule source, `SessionSlot`/produit) et un test de contrat le verrouille. Le multiplicateur co-animation est un paramètre métier assumé par Laurent — à faire valider une fois par l'expert-comptable/l'auditeur Qualiopi, et la génération d'émargement doit refléter les 2 formateurs.

### 8.2 Dimensionnement automatique : le budget fabrique le volume

Le moteur propose le **nombre de demi-journées** qui consomme le budget mobilisable — c'est le renversement commercial clé : on ne vend pas un prix, on dimensionne une formation à la hauteur des droits disponibles.

Exemple canonique (validé par Laurent) : 4 agents commerciaux avec production N-1 > 7 000 € → 4 × 3 024 € (72 h conventionnées × 42 €) = **12 096 € de volume visé** → 12 096 / 336 = **36 demi-journées-participant** → le groupe de 4 avançant ensemble : **9 demi-journées de groupe**, prise en charge ≈ 100 %.

⚠ **Nuance moteur (D-8)** : 72 h × 42 € = 3 024 € dépasse de 24 € le **plafond AGEFICE de 3 000 €/an** (vérifié le 01/09/2026). Le moteur retient toujours `min(heures × taux, plafond)` = 3 000 €/agent — l'écart (96 € pour 4 agents) apparaît explicitement en reste à charge, que le commercial facture, arrondit en réduisant le volume, ou offre (traçé comme remise). **Jamais un montant de prise en charge affiché au-dessus du plafond** — c'est exactement la « mention trompeuse de financement » que le référentiel Qualiopi 33 indicateurs sanctionne (leçon déjà payée sur l'email du stand MLS).

```
budget_indé(p)        = si CFP connue (AgeficeProfile) : lastCfpEligibleBudget (3000|600|0)
                        sinon : caN1 > AGEFICE_THRESHOLD_CA_N1 ? AGEFICE_ANNUAL_CAP : 0   [estimation]
                        − consommation AGEFICE année en cours (dossiers CRM ou déclaratif diag)
budget_entreprise     = OPCO_EP_ENVELOPE selon effectif salarié (< 11 : 2 500 € ; 11-50 : 4 500 € ; > 50 : manuel)
                        − consommation OPCO EP année en cours (OpcoSubmission ou déclaratif)
budget_total          = Σ budget_indé + budget_entreprise            [affiché par financeur, jamais fusionné en calcul]

volume_proposé        = ⌈ heures_finançables_moyennes / heures_conventionnées_par_demi_journée ⌉
                        demi-journées de groupe — arrondi SUPÉRIEUR (D-11 du 02/09/2026)
                        (le commercial ajuste ensuite librement : le moteur PROPOSE, il n'impose pas)

prise_en_charge_indé  = min(heures_conventionnées × 42 €, budget_indé)         [AGEFICE présentiel ; distanciel : 35 €/h]
prise_en_charge_sal   = min(Σ heures_conventionnées × taux_opco (30 ou 40 €/h), budget_entreprise)   [présentiel uniquement]
reste_à_charge        = Σ prix_vente − Σ prises_en_charge   [UN seul montant consolidé présenté au dirigeant]
```

Règles conservées du PRD : régimes **séparés en calcul, consolidés en affichage** (mention obligatoire « deux dossiers administratifs distincts ») · un participant appartient à UN régime · surplus au-delà d'une enveloppe = reste à charge additionnel, **arbitrage humain, jamais automatique** · modules distanciels : alerte « non pris en charge OPCO EP » · > 50 salariés : blocage doux « à valider avec l'OPCO EP » · une projection (CA en cours) n'est JAMAIS un droit acquis · taux de consommation 24 mois affiché « Environ X % » — sous 30 % : levier « vos droits sont sous-utilisés ».

Arguments contractuels affichés d'office (blocs OPTIMO réels) : **montage administratif 100 % Start Academy** · **zéro avance de trésorerie** · **indemnisation AGEFICE ~700-800 € perçue par chaque agent formé** (paramètre `AGEFICE_INDEMNITY_RANGE`) · **valide les heures obligatoires loi ALUR** · **droits perdus au 31/12 s'ils ne sont pas consommés**.

### 8.3 « La main sur le prix » — ce que le commercial peut faire, et sous quel contrôle

| Levier | Règle |
|---|---|
| Prix unitaire d'une ligne (€/demi-journée/participant ou forfait entreprise) | Éditable tant que la proposition est BROUILLON/PRETE (classe LIBRE). Après acceptation → logique 4 classes de `/tarif` (ENGAGÉ OPCO / FACTURÉ → avoir / SIGNÉ → avenant). |
| Forfait entreprise négocié | Une ligne PAR entreprise payeuse (deux entreprises d'une même session peuvent avoir deux forfaits — décision SessionPricing). Le forfait est FERME (clause de fermeté + droit de remplacement jusqu'à J-X dans la convention). |
| Remise commerciale | UNIQUEMENT sur le reste à charge (règle de non-transfert de dette : ne réduit jamais l'assiette des droits). Motif obligatoire. > 15 % du reste → validation MANAGER/ADMIN requise (workflow de validation simple : notification + blocage d'envoi tant que non approuvé). |
| « OFFERT » | = remise qui ramène le reste à charge à 0. Affiché **OFFERT** sur la proposition, distinct de « pris en charge à 100 % » (`describeCoverageState` porté tel quel : fully_covered_by_funding ≠ offered_via_discount). Le cumul des « offert » est un KPI patrons (§11). |

---

## 9. Les sorties documentaires

### 9.1 La proposition (« comme un devis, mais hyper détaillé »)

**Le modèle de référence est la proposition OPTIMO du 11/08/2026** (`nxt-coach/Formation Faros/PROPOSITION-OPTIMO/`) — c'est le format qui a fait mouche en vrai, la maquette `2026-09-01-maquette-proposition.html` le systématise. Structure contractuelle du `contentJson` (schéma Zod `PropositionSchema`, port étendu du repo diag) :

1. **Page de garde** — charte (bleu #00527A / #3EA9FF, Rajdhani/Montserrat), destinataire nommé, n° PROP-NNNN, date, validité, contact commercial.
2. **« Ce que nous avons entendu »** — les constats du diagnostic : 4-8 puces par pôle/enjeu, chiffres du client dedans (c'est l'ultra-personnalisation : chaque puce provient d'une réponse ou d'un ratio, jamais du générique). En audit COMPLET : renvoi au rapport d'audit joint.
3. **« Notre proposition en phases »** — le programme : phases/journées composées depuis le **catalogue complet Start Academy** — programmes MÉTIER purs (Booster vendeur 058, Booster Acheteurs 059, Face à face acheteurs 008, Maîtrise des techniques de vente 055, Cycle prospection/négociation 053, Cadastre, Tracfin/déontologie 063…) ET programmes IA (065/070/073…) — chaque module avec « pourquoi ce module » relié à un signal du diagnostic. **Règle produit : un point de douleur métier reçoit un programme métier — l'IA n'est jamais la réponse par défaut** (retour de Laurent du 01/09 sur la maquette v1).
4. **Planning proposé** — les dates de la campagne (§7), équipes/groupes, et la ligne « pièces réunies au plus tard le [date session − 15 j] ».
5. **Budget mobilisable** — LE tableau qui signe : lignes par financeur × bénéficiaires × base × montant (AGEFICE agents éligibles, AGEFICE TNS dirigeants « sous réserve attestation CFP », OPCO EP par entreprise du groupe, déductions consommation déjà engagée), total « ENVELOPPE MOBILISABLE ESTIMÉE », potentiel complémentaire. Encadré « points clés » (indemnisation agents, ALUR, montage 100 %, zéro avance). |
6. **Détail type devis** — tableau des lignes de vente par payeur (désignation, participants, demi-journées, heures conventionnées, PU HT, total HT, TVA formation exonérée art. 261-4-4° a CGI), prise en charge estimée, **reste à charge par payeur** puis consolidé — avec remise/OFFERT le cas échéant. Ces lignes = exactement les futures `QuoteLine`. |
7. **Pourquoi Start Academy** — résultats mesurés (paramètres tenant), bios formateurs (paramètres), avis Google (paramètres, datés).
8. **Prochaines étapes** — tableau Action / Qui / Échéance (généré : pièces, accès OPCO, lien de pré-inscription, dépôt dossiers, 1ʳᵉ session).
9. **Mention légale** — « Montants estimatifs, sous réserve des droits réellement disponibles et de l'acceptation des dossiers par les financeurs. Proposition valable N jours. » (jamais retirable).

Rendus : **PDF** (WeasyPrint, chaîne existante) + **lien web lecture seule** `/proposition/[token]` (même contenu, même charte, token hashé, expiration = validité). L'envoi passe par le mailer (catégorie « Proposition », fail-closed) OU par le canal du commercial (copie du lien).

**Génération du devis** : bouton « Générer le(s) devis » → un `Quote` par payeur depuis les lignes §6 (recipient depuis `payer-rule.ts`, personne morale → entreprise, indés autofinancés/subrogés selon montage). Test de contrat : Σ `QuoteLine` = montants proposition, heures devis = heures conventionnées proposition.

### 9.2 Le rapport d'audit complet — un livrable de 15 pages minimum, valorisé 3 000 €

**Exigence de Laurent (01/09)** : l'audit complet est une prestation à part entière, **valorisée 3 000 € HT** (paramètre `AUDIT_DISPLAY_VALUE`, affiché en couverture « offerte dans le cadre de votre accompagnement »), donc un document **d'au moins 15 pages qui restitue ce qui s'est dit** — pas une synthèse. Il parle au dirigeant : ses mots, ses chiffres, ses enjeux en euros, son équipe. Généré pour un diagnostic COMPLET (un LÉGER produit une « Synthèse diagnostic » de 2-3 pages sur la même mécanique). Structure de référence = la maquette 17 pages :

1. **Couverture** — valeur de la prestation, badges (66 questions · 11 chapitres · N personnes cartographiées), dates réalisé/restitué.
2. **Pourquoi cet audit & comment le lire** — méthode, promesse des 3 étages (restitution → lecture → enjeu/levier), sommaire, origine des repères.
3. **L'agence en un coup d'œil** — identité/contexte (Ch.1), équipe (Ch.2), **score global /100 + scorecard par chapitre** (barres, statut ✓/⚠/✗).
4. **Synthèse dirigeant** — verbatim top-3 difficultés, lecture en 3 fuites chiffrées + ce qui va bien, enjeu consolidé en €/an (IA relue, jamais envoyée brute).
5. **La chaîne commerciale** — funnel + tableau des ratios vs repères, 2 maillons faibles surlignés.
6-14. **Un chapitre par page (Ch.3 → Ch.11)**, gabarit fixe : n° + titre + **score du chapitre** + « X questions · Y renseignées » · **« Ce que vous nous avez dit »** (restitution fidèle, tableau question → réponse, verbatims) · **« Notre lecture »** (2 paragraphes) · **Repères** (2-3 ratios, chips) · **« L'enjeu en euros »** quand quantifiable (encadré or, estimation prudente à volume constant) · **« Premier levier »** (encadré vert, action immédiate).
15. **La performance de votre équipe** (inspiration business review KW) — une carte par personne depuis les fiches `DiagnosticParticipant` : production N-1 (barre vs **objectif proposé**), statut/ancienneté, budget formation individuel, forces, **préconisation nominative** ; salariés et dirigeant inclus ; mention « point zéro re-mesuré à 6 mois ».
16. **Un objectif, trois priorités, un plan de 90 jours** (GPS) — l'objectif déclaré du dirigeant en hero, 3 priorités numérotées reliées aux pages de constats et aux **programmes de la proposition**, plan S1→S12 avec « ce qui est mesuré », mention re-mesure à 6 mois + disclaimers.
17. **Votre potentiel de financement — TOUJOURS en dernière page** (exigence Laurent 02/09) : tableau par financeur/bénéficiaires, mobilisable maintenant vs potentiel (TNS sous réserve CFP), consommation 24 mois, indemnisation agents, ALUR — le rapport se ferme sur l'argent disponible et le renvoi à la proposition jointe.

Règles de génération : les scores par chapitre viennent d'un **barème pondéré paramétrable** (D-9) calculé par le moteur (fonction pure) ; les textes « lecture/synthèse/préconisations » sont générés par IA depuis ratios+alertes+verbatims (jamais les données nominatives brutes en prompt — la page 15 est assemblée par le code depuis les fiches, l'IA ne reçoit que des agrégats par personne pseudonymisés p1/p2/…) et **relus avant remise**. Les enjeux € utilisent les formules simples documentées dans le référentiel (exclusivité, compromis→acte, temps) avec le disclaimer systématique.

Le rapport est un `Document` (nouveau `DocType.DIAGNOSTIC_AUDIT`) rattachable au dossier Qualiopi : c'est l'**analyse du besoin du bénéficiaire** (indicateur 4) — même mécanique documentaire que les « Analyse-besoins-*.pdf » actuels, en beaucoup plus fort. `DocType.PROPOSITION` ajouté de même.

### 9.3 Anti-péremption (leçon E-1 — obligatoire)

`Proposal.sourceFingerprint` = SHA-256 du JSON canonique {réponses du diagnostic à la génération, lignes de prix, version FundingRule, modules retenus, dates}. `isProposalStale()` compare au recalcul courant → bandeau « Cette proposition ne reflète plus le diagnostic / le tarif » + action « Régénérer » (nouvelle version, l'envoyée reste archivée). Même mécanique sur le rapport d'audit. **La nouvelle feature naît avec la détection de péremption — elle ne reproduit pas le défaut racine du produit.**

### 9.4 Sécurité des liens publics

Port de la doctrine du repo diag : token 256 bits, stockage du hash seul, affichage une seule fois, `timingSafeEqual`, expiration + `maxUses` + révocation UI, `force-dynamic`/no-store, aucune donnée nominative des participants dans les pages publiques, AuditLog des consultations (date de 1ʳᵉ ouverture = signal commercial « proposition vue » → futur déclencheur de relance lot H).

---

## 10. IA : où elle intervient, et sous quels garde-fous

| Usage | Moment | Garde-fous |
|---|---|---|
| Pré-remplissage depuis transcript (§6.4) | Entre R1 et R2 (job async, ~1 appel) | Schéma Zod strict, `confidence` + `quote` par réponse, revue par exception obligatoire, jamais d'invention, rate-limit + `AIGenerationJob`. |
| Synthèse dirigeant + « ce que nous avons entendu » + « pourquoi ce module » | À la génération de l'audit / de la proposition | Le prompt reçoit **ratios + alertes + benchmarks + signaux modules** (jamais les réponses nominatives). Sortie relue : `reviewedAt` requis avant envoi. Fallback heuristique possible mais **badgé et bloquant pour l'envoi** tant que non relu (anti-E-3). |
| Recommandation de modules | idem | Uniquement des modules du catalogue actif (`isActive`, hors `excludedFromClientOutputs`) — zéro module fantôme. Matching par `diagnosticSignals` (heuristique déterministe d'abord, IA pour l'argumentaire). |
| JAMAIS | Pendant le RDV · calcul d'un prix · calcul d'un droit | Prix et droits = fonctions pures du code, toujours. |

---

## 11. Rôles, écrans et pilotage patrons

Navigation : nouvelle entrée **« Diagnostics »** dans `/app` (liste + fiche), la proposition vit sous la fiche diagnostic (`/app/diagnostics/[id]/proposition`) et apparaît aussi dans `/app/devis` via les Quotes générées. Redirects 308 pour variantes d'URL (convention routes).

| Rôle | Droits sur la chaîne |
|---|---|
| COMMERCIAL | Crée/mène ses diagnostics (scope : ses leads + non assignés), compose/envoie ses propositions, crée les campagnes RDV, remises ≤ 15 % du reste à charge. |
| MANAGER | Tout voir, valider les remises > 15 %, réassigner, pilotage. |
| ADMIN | Tout + validation des pièces (pipeline PreEnrollment), conversion, génération devis/sessions, paramètres FundingRule et contenus proposition (bios, chiffres, arguments). |
| COMPTABLE | Lecture devis/factures issus de la chaîne. |
| FORMATEUR / LECTEUR | Rien en v1 (le lien formateur lecture seule du repo diag = lot H). |

**Pilotage (extension `/app/pilotage`)** — le funnel commercial de la chaîne : diagnostics réalisés (léger/complet) par commercial · délai moyen R1 → envoi proposition · propositions envoyées / vues / acceptées / expirées · taux R1→R2 et R2→signature · CA proposé vs signé (branché `RevenueTarget`) · budget financeur mobilisé vs reste à charge facturé · **cumul des remises et des « OFFERT » consentis** (le coût commercial réel) · pré-inscriptions en attente de pièces. AuditLog sur chaque transition (création, envoi, acceptation, remise, régénération) — dans la transaction, règle E-4.

---

### 11.1 Alertes opérationnelles (demande de Laurent du 02/09 — « tant qu'on y est »)

| # | Événement | Qui est alerté | Canal & règle |
|---|---|---|---|
| A-1 | **Nouveau lead** créé (express du stand, campagne RDV, saisie manuelle, import) | Le commercial assigné ; si non assigné : tous les COMMERCIAL + MANAGER | Notification in-app immédiate + email (catégorie « Nouveaux leads », décochable, fail-closed), lien direct vers la fiche lead. |
| A-2 | **Lead non traité depuis 24 h** (statut NEW, aucune `LeadAction`) | Commercial assigné + MANAGER en escalade | Cron horaire (route `/api/cron/alerts`, ajoutée à `vercel.json`) ; **une seule alerte par lead** (marqueur `staleAlertedAt` — pas de mitraillage) ; tuile « leads en retard » au pilotage. Seuil paramétrable, défaut 24 h. |
| A-3 | **Nouvelle pré-inscription soumise** (`PreEnrollment.submittedAt` posé) | ADMIN | Notification in-app + email (catégorie « Pré-inscriptions ») avec lien direct vers l'écran de validation ; plusieurs soumissions d'une même campagne dans l'heure → regroupées en un digest. |

Règles d'implémentation : réutiliser `Notification` et le mailer existants (pas de second système) ; idempotence par (type, entityId) ; la décision d'alerte est une **fonction pure testable** (`decideLeadStaleAlert(lead, now)`) ; chaque type d'email = une catégorie décochable fail-closed. **A-1 et A-2 ne dépendent d'aucun lot de la chaîne** (module leads existant) : livrables immédiatement en `/quick` ; A-3 s'appuie sur le pipeline PreEnrollment existant — utile dès aujourd'hui, indispensable avec le lot F.

## 12. Coach Brain / NXT coach (la matière est là — inventaire du 01/09)

Le dossier `~/Documents/nxt-coach` contient : **(a)** l'app COACHNXT (RAG local Ollama + sqlite-vec — l'architecture décrite dans `coach-brain-integration-plan.md` du repo diag) ; **(b)** `sources/` : ~138 documents de coaching réels (transcripts de séances, notes Gemini, conférences, livre S. Tedesco) ; **(c)** `Formation Faros/LIVRAISON_PARCOURS` : **le parcours « L'Agent Incomparable »** — M0 Socle IA · M1 Trouver des vendeurs · M2 Gagner le mandat (préparer R1, protocole vendeur, préparer R2 closer !) · M3 Commercialiser · M4 Suivi vendeur · M5 Gagner 5-10 h · M6 Acheteur & pilotage — avec livrets HTML/PDF et exercices ; **(d)** la proposition OPTIMO réelle (§9.1).

En v1 (lots A-G), on consomme cette matière de deux façons **statiques** :
1. **Catalogue** : les modules M0→M6 entrent dans `TrainingProduct`/`TrainingModule` comme « programmes immobiliers purs » via le script d'import §5.3 (familles alignées sur les chapitres du diagnostic — le mapping signal → module devient naturel : Ch.3 faible → M1, Ch.4/5 → M2, Ch.6 → M3/M4, Ch.10 → M0/M5, Ch.7 → M6…). ⚠ statut « pré-livraison, trous non levés » selon le MANIFESTE : importer en `isActive=false`, activation par Laurent.
2. **Prompts** : les axes pédagogiques et le vocabulaire des livrets nourrissent les prompts de recommandation (pas de RAG en v1).

En lot H : la couche `CoachBrainContext` du repo diag est posée telle quelle (consommatrice, inerte si vide) et branchée en lecture sur les patterns COACHNXT — jamais de RAG recodé dans QualiOF.

---

## 13. Lots de livraison (chaque lot = mergeable, testable, utile seul)

| Lot | Contenu | Dépendances | Taille |
|---|---|---|---|
| **A — Socle** | Modèles Prisma (§4) + seeds FundingRule + port questions/chapitres/light-set + tests de contrat référentiel + import catalogue (§5.3, avec M0→M6) | Aucune (après le 10/09) | M |
| **B — Saisie R1** | Écrans diagnostic (léger/complet, page-par-chapitre, autosave, grille équipe, reprise) + synthèses financement & pipeline en direct (fonctions pures §8) | A | L |
| **C — Transcript** | Collage/upload + job d'extraction + revue par exception | A, B | M |
| **D — Audit** | Moteur ratios/alertes + rapport d'audit (PDF + écran) + DocType + fingerprint | A, B | M |
| **E — Proposition** | Éditeur (modules, lignes par payeur, remise/OFFERT avec validation > 15 %), génération IA relue, PDF + lien public, envoi email, génération devis, fingerprint | A, B, D (utilisable sans C) | XL |
| **F — Campagne RDV** | EnrollmentBatch + dates + page publique `/rdv/[token]` + écran d'avancement (réemploi PreEnrollment) + alertes A-1/A-2/A-3 (§11.1 — A-1/A-2 anticipables en `/quick`) | A (parallèle à D/E) | M |
| **G — Acceptation → session** | Acceptation de proposition → sessions sur la date retenue + **SessionPricing** (forfait entreprise ferme / lignes indés) + conversion pré-inscrits + conventions | E, F, **phase 23 SessionPricing livrée** | L |
| **H — Suite** | Relances auto (J+1 lead sans proposition · proposition envoyée non vue J+3 · vue sans réponse J+7 · date limite J-5 — pattern stand MLS, cron + fail-closed) · import Plaud · Coach Brain branché · pack communication dirigeant · lien formateur · signature électronique | G + arbitrages Laurent | L |

Ordre recommandé : **A → B → (C ∥ D) → E → F → G**, H au fil de l'eau. La valeur tombe dès B (le R1 outillé) et devient décisive à E (la proposition qui signe).

## 14. Critères d'acceptance globaux & tests

- [ ] Un diagnostic LÉGER se fait en < 30 min au clavier, sans blocage réseau visible, et s'upgrade en COMPLET sans re-saisie.
- [ ] La synthèse financement s'affiche < 1 s après la grille équipe, avec l'exemple canonique : 4 indés > 7 k€ → 36 demi-journées cumulées / 9 demi-journées de groupe / prise en charge 12 000 € (plafond) / écart de 96 € traité selon D-8.
- [ ] Un transcript collé pré-remplit ≥ 60 % des questions du set avec justification (`quote`), et AUCUNE réponse pré-remplie non confirmée ne sort dans un document client.
- [ ] Rapport d'audit conforme à la maquette v2 : **≥ 15 pages**, restitution chapitre par chapitre des réponses, score global + scores par chapitre, page équipe alimentée par les fiches (objectifs + préconisations individuelles), enjeux chiffrés en €, valeur 3 000 € en couverture ; proposition conforme à sa maquette ; PDF via la chaîne existante.
- [ ] La recommandation de programme propose au moins un programme MÉTIER pour chaque priorité métier détectée (test sur fixtures : exclusivité faible → 055/058 proposés, jamais un module IA seul).
- [ ] Σ devis = Σ proposition ; heures conventionnées identiques proposition/convention/émargement (tests de contrat).
- [ ] Remise > 15 % du reste à charge impossible à envoyer sans validation MANAGER/ADMIN ; « OFFERT » ≠ « pris en charge » dans le rendu.
- [ ] Proposition périmée détectée (fingerprint) après modification du diagnostic OU d'une FundingRule.
- [ ] Aucune donnée nominative de fiche équipe dans : pages publiques, prompts IA, logs.
- [ ] `pnpm lint` + `tsc --noEmit` + suite complète verts **sur le Mac de Laurent** avant tout commit (la sandbox ne peut pas les jouer — les moteurs purs se testent en conteneur, le reste non).
- [ ] Chaque server action : requireRole + scope tenantId + Zod avant I/O + AuditLog en transaction + revalidatePath (check-list `/quick`).

### Décisions TRANCHÉES

| # | Question | Décision de Laurent | Date |
|---|---|---|---|
| **D-11** | Arrondi du dimensionnement : les droits d'un agent financent 8,93 demi-journées — on arrondit comment ? | **À la demi-journée SUPÉRIEURE.** Aucun droit ne se perd : mieux vaut un dépassement visible qu'une enveloppe entamée pour rien. L'écart créé par l'arrondi apparaît en reste à charge. **Dans l'éditeur de proposition (lot E), un bouton propose de l'offrir en un clic, motif pré-rempli « arrondi de parcours »** — la remise reste tracée comme toutes les autres. | 02/09/2026 |
| **D-12** | L'enjeu en € affiché sur un maillon faible : le calcul complet donne des montants énormes (480 000 € sur une agence à 720 000 €). Que met-on en avant ? | **La MOITIÉ du chemin vers le repère**, et uniquement tant qu'elle reste **sous 25 % du CA N-1**. Au-delà, aucun montant : on affiche le ratio et « **potentiel majeur — à chiffrer ensemble** ». Le calcul complet reste consultable dans le détail. Motif : un chiffre qu'on ne peut pas tenir en rendez-vous détruit la crédibilité de tout le reste de l'audit. | 02/09/2026 |

### Décisions restantes pour Laurent (à trancher au fil des lots, pas bloquantes pour A)

| # | Question | Défaut proposé |
|---|---|---|
| D-1 | Composition exacte du set LÉGER (§6.2) | La liste proposée, ajustée après 2 RDV réels |
| D-2 | Benchmarks initiaux des ratios (seuils d'alerte) | Valeurs du référentiel v1.0 du repo diag |
| D-3 | Qui peut créer une remise > 15 % (MANAGER suffit, ou ADMIN seul ?) | MANAGER |
| D-4 | Devis générés à l'envoi de la proposition ou à l'acceptation ? | À l'acceptation (moins de DEV-NNNN morts) |
| D-5 | Durée de validité par défaut (30 j ?) et relance à J-5 | 30 j |
| D-6 | Le multiplicateur co-animation (8 h conventionnées / demi-journée) — validation comptable/auditeur à documenter | Paramètre actif, note de conformité dans la convention |
| D-7 | Montants OPCO EP : 4 500 € (dit le 01/09) vs ≈ 4 000 € (proposition OPTIMO du 11/08) pour > 10 salariés | 4 500 en seed, modifiable dans Paramètres |
| D-8 | Volume 72 h × 42 € = 3 024 € vs plafond AGEFICE 3 000 € : que faire des 24 €/agent d'écart ? | ✅ **Tranchée avec D-11** : plafonner à 3 000, afficher l'écart en reste à charge, geste commercial en un clic dans la proposition |
| D-9 | Barème de scoring (pondérations par question → score chapitre → score global) | Barème v1 proposé avec le lot D, calibré sur 3 audits réels puis figé/versionné |
| D-10 | Page équipe : faut-il des champs d'activité par agent (RDV, mandats, exclus individuels) en plus du CA N-1 ? | v1 : CA N-1 + objectif + forces saisies par le commercial ; ratios individuels = extension du référentiel v2 |

---

## Annexe A — Matière NXT coach exploitable (relevé du 01/09/2026)

- `Formation Faros/LIVRAISON_PARCOURS/` : parcours Agent Incomparable M0→M6 (livrets HTML+PDF, exercices, MANIFESTE — statut pré-livraison v0.9, trous 🔴/🟠 non levés → importer inactif).
- `Formation Faros/PROPOSITION-OPTIMO/` : la proposition de référence (structure §9.1) — cas réel groupe 27 collaborateurs, 4 structures, ~27 k€ mobilisables sans reste à charge, dates pré-positionnées, pièces à J-15.
- `Formation Faros/SA_ADM_M001_AGEFICE_*`, `SA_ACQ_M003_TROUVER_VENDEURS_*` : modules produits finis (nomenclature SA_<FAM>_M<NNN>).
- `sources/text/` (~100 transcripts de coachings réels 2025-2026) + `sources/pdf/` (conférences, livre) : la future base Coach Brain (lot H) — données clients réelles : anonymisation obligatoire avant toute ingestion.
- `youtube-links.txt`, `sources/audio|video` : idem, pipeline COACHNXT existant.
