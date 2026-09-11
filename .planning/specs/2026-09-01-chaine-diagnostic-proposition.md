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
  id             String    @id @default(uuid())
  tenantId       String
  label          String    // "RDV OPTIMMO — R1 du 12/09"
  organizationId String    // D-22 — OBLIGATOIRE : le rattachement canonique
  diagnosticId   String?   @unique // contexte, jamais une alternative à l'agence
  leadId         String?   // contexte, jamais une alternative à l'agence
  proposalId     String?
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

#### D-19 — le catalogue est une BIBLIOTHÈQUE DE MODULES, pas une liste de produits figés (recadrage Laurent du 04/09/2026)

C'est le renversement qui explique pourquoi les programmes métier de Laurent
« manquaient » au catalogue QualiOF : **ils n'y sont pas parce qu'un programme
ne se vend pas tel quel — il SE COMPOSE**. On assemble des modules venant de
plusieurs programmes selon le point de douleur de l'agence. Le produit figé
était une hypothèse de l'outil, pas une réalité du métier.

Ce que ça change, et qui remplace le mapping « signal → programme vendu » :

1. **La recommandation recommande des MODULES**, pas seulement des produits
   entiers. Le rapprochement se fait **module ↔ signal ↔ réponse du
   diagnostic**, et il est traçable : on doit pouvoir dire de chaque module
   retenu quelle réponse l'a fait entrer.
2. **La proposition COMPOSE le programme sur mesure** à partir des modules
   retenus, et ce programme composé **devient le produit vendu à ce client** —
   un `TrainingProduct` généré, avec son programme Qualiopi dérivé des modules
   (objectifs, durées, prérequis).
3. Tout doit pouvoir entrer dans la bibliothèque : le catalogue diag déjà
   importé, la **formation Faros**, et la production du Drive « Formations et
   programmes » (008 → 074).

**C'est la vraie réponse au problème des signaux coincés sur PROD-0675..0680** :
il ne s'agit pas de relier ces conteneurs à des produits vendus, il s'agit de
cesser de vendre des produits pour vendre des compositions. Les conteneurs
deviennent ce qu'ils sont : des rayons de la bibliothèque.

##### Corollaire — `isActive` ne dit pas la même chose sur un rayon et sur un produit (Laurent, 10/09/2026)

L'import du catalogue diagnostic a créé les conteneurs **inactifs**, et son
rapport annonçait « à toi de cocher ce que tu vends réellement ». **Ce cadrage
était faux, et il est corrigé ici : on n'active pas les conteneurs.** Un rayon de
bibliothèque n'est pas une offre ; le cocher ferait réapparaître exactement ce
que D-19 vient d'abolir — des produits figés vendus tels quels.

Ce qui devient vendable est le **programme COMPOSÉ** (lot I), et lui seul porte
l'état vendable.

Conséquence à traiter dès **I-1**, avant le moteur de recommandation :

- **la reco et le composeur lisent les modules quel que soit l'`isActive` de
  leur conteneur.** Filtrer sur le conteneur actif viderait la bibliothèque de
  tout ce qui vient d'être importé — 86 modules invisibles, et une reco qui
  retomberait sur les seuls produits historiques ;
- **`TrainingProduct.isActive` garde son sens habituel sur les produits vendus**
  (catalogue commercial, pages publiques) et n'est simplement **pas un critère**
  dans le chemin de composition. Deux lectures du même champ : à distinguer
  explicitement dans le code, jamais à deviner ;
- le produit composé généré pour un client naît, lui, **actif** : c'est l'offre
  réelle, celle qui porte la convention et le programme Qualiopi.

Test qui tient la règle : une recommandation jouée alors que **tous** les
conteneurs sont inactifs doit continuer à proposer des modules. Une liste vide
signifie qu'un filtre `isActive` s'est glissé dans le chemin de composition.

##### D-19 bis — quand un rayon importé double un produit vendu, **la version VENDUE fait foi** (arbitrage Laurent du 10/09/2026)

L'import du Drive a créé quatre rayons qui portent le même programme qu'un
produit réellement vendu : `drive:055` ↔ `PROD-055`, `drive:053` ↔ `PROD-053`,
`drive:046` ↔ `PROD-0671`, `drive:074` ↔ `PROD-0662`.

**Le produit vendu ne bouge pas** — ni sa durée, ni ses modules, ni sa page
publique « Programme détaillé ». Cette page **est** l'information préalable
remise au client, et la modifier après coup crée un écart entre ce qui a été
annoncé et ce qui est réalisé : une réserve en audit Qualiopi.

**C'est donc le RAYON qui s'efface** : il reste en base et reste consultable,
mais ses modules **sortent du chemin de composition**. Motif : deux versions du
même programme dans la bibliothèque, c'est l'occasion d'en vendre une et d'en
animer une autre. Composer depuis la version Drive bâtirait une proposition sur
un contenu qui n'est pas celui que la convention annonce.

**Comment le doublon est détecté — et pourquoi il ne peut pas revenir :**

1. **À l'import seulement**, et par **égalité de nom normalisée** (accents,
   casse et ponctuation neutralisés) contre les produits **vendus** —
   c'est-à-dire ceux qui ne viennent pas d'un import (`sourceRef` nul) **et qui
   sont actifs**. Un produit qu'on ne vend plus ne peut pas « faire foi » contre
   un rayon : l'écarter au profit d'un produit mort retirerait le contenu de la
   reco sans rien mettre à la place.
2. **Le lien est PERSISTÉ**, pas recalculé : `TrainingProduct.supersededByProductId`.
   C'est le point qui compte. Un rapprochement par titre est fragile — il suffit
   que le dossier Drive soit renommé pour qu'il ne matche plus. Un lien stocké,
   lui, survit au renommage.
3. **Un lien déjà posé n'est JAMAIS recalculé ni retiré par un import.** Le
   script se contente de le reconduire et de le dire au rapport. Délier un rayon
   est une décision de catalogue, pas un effet de bord d'un script — comme la
   suppression d'un module orphelin.
4. **Le moteur filtre aussi**, en plus de l'import (`recommendModules` écarte
   tout module dont le rayon est écarté, et le dit en notice avec le couple
   `rayon → produit vendu`). Défense en profondeur : la même doctrine que pour
   la pige, où un filtre oublié dans un template reste invisible jusqu'au jour
   où un client le lit.

⚠ **À ne pas confondre avec `isActive`.** Un rayon **inactif** est la norme
depuis le corollaire D-19 — les 81 rayons le sont, et ça n'en écarte aucun. Un
rayon **écarté** est un doublon, et il n'y en a que quatre. Deux notions, deux
champs, et un test qui vérifie qu'on ne les confond pas.

**Conséquence assumée, à connaître avant I-2** : ces quatre produits vendus ne
portent **aucun module** (leur contenu vit dans `programMd`). Les écarter côté
rayon les rend donc **invisibles à la recommandation au niveau module** — y
compris `PROD-055 Maîtrise des techniques de vente`, qui est du métier pur. Le
jour où le composeur devra piocher dedans, il faudra créer les modules **sur le
produit vendu lui-même**, à partir de son `programMd` — ce qui est un travail de
catalogue, à faire les yeux ouverts, pas un import automatique.

##### D-19 bis, suite — quand le doublon oppose **deux rayons**, c'est Laurent qui désigne (11/09/2026)

D-19 bis tranche un rayon contre un produit **vendu** : la convention et la page
publique font foi. **Entre deux RAYONS, la règle est muette** — ils ont le même
statut, rien ne les départage. C'est ce qu'a montré `drive:008` « Face à face
acheteurs » contre `drive:020` « Face a face acheteurs » : le même programme
rangé sous deux numéros, invisible jusqu'ici parce que la détection ne comparait
qu'aux produits vendus.

**Arbitrage de Laurent** : garder `BIB-D008`, écarter `BIB-D020`. Motif — **008
est le numéro de ce programme dans la numérotation catalogue de Laurent**
(008 → 074) ; 020 est une copie rangée sous un autre numéro.

**Comment la décision est tenue** :

1. Elle est **déclarée dans le code**, datée et motivée (`RAYONS_TRANCHES` dans
   `import-drive-catalog.ts`), pas passée une fois à la main sur une base. Un
   arbitrage appliqué par un `UPDATE` manuel est perdu à la prochaine base.
2. Elle se pose dans le **même champ** qu'un doublon D-19 bis
   (`supersededByProductId`), donc elle hérite de la même garantie : **un lien
   déjà posé n'est jamais recalculé**, et un dossier Drive renommé ne peut pas
   réintroduire le doublon.
3. Le rayon écarté **reste en base et reste consultable** — seuls ses modules
   sortent de la composition. On ne supprime rien.
4. **Le rapport le DIT** plutôt que de le faire disparaître : un doublon réglé
   par la règle est une non-information, un doublon réglé par une **décision**
   doit rester lisible, sinon quelqu'un la reprendra un jour depuis zéro.
5. **Refus de sécurité** : si le rayon gardé est introuvable en base, aucun lien
   n'est posé et le rapport le signale. Écarter au profit d'un gardien absent
   retirerait du contenu de la reco sans rien mettre à la place.

##### Chantier identifié — nettoyage de l'extraction Drive (11/09/2026)

Écrire les rattachements a fait entrer de vrais modules dans le programme
composé de DIAG-0001, et **ce qu'ils ont remplacé masquait trois défauts de
données**. Ils n'étaient pas visibles tant que les créneaux étaient tenus par
des modules du catalogue diagnostic sans déroulé : une place vide ne montre
rien. Ce n'est **pas** de l'écriture de contenu — c'est du travail de machine
sur l'extraction, et il se planifie à part.

1. **Les pieds de page de programme ont été avalés dans les déroulés de
   modules.** « QCM évaluation des acquis », « Questionnaire de satisfaction et
   clôture de la formation », et jusqu'aux états de service des formateurs
   (« Tous les formateurs de l'équipe Start-Academy ont minimum 8 années
   d'expérience… ») figurent comme des **puces du déroulé** de `BIB-D034` et de
   `BIB-D012`. Ce sont des **mentions d'organisme** — elles ont leur section
   dédiée depuis les trois colonnes `Tenant.qualiopi*`. Sur le programme de
   DIAG-0001, « Gérer les objections » se termine donc par l'expérience des
   formateurs présentée comme une étape pédagogique, et un financeur le lit.

2. **Certains « modules » sont des journées entières.** `BIB-D012` « Pratiquer
   une découverte acheteur… » porte **38 puces** et un « Après-midi : » en plein
   milieu, pour une durée déclarée de **60 min**. L'extraction ne l'a pas
   découpé : le rapport d'import du 10/09 le signalait déjà sous « 17 programmes
   en bloc unique », et la conséquence se voit maintenant sur un document
   client. Effet de bord à connaître : un tel module fausse le remplissage des
   blocs de 8 h (D-20), puisqu'il annonce 60 min pour une journée de contenu.

3. **Les titres ne sont pas présentables.** Deux-points final (« …besoins des
   acheteurs : », 114 caractères), capitales erratiques (« Mettre en Pratique
   des Situations de Découverte du Projet Acheteur-Vendeur »), titres muets pour
   un client (« Suivi », « e réputation »). Le point qui aggrave : **les
   objectifs pédagogiques dérivent des titres** — chaque défaut de titre devient
   un défaut d'objectif sur la pièce remise au financeur.

**Ce que ce chantier n'est PAS** : l'écriture des déroulés manquants. Trois
modules sortent encore « déroulé à compléter » sur DIAG-0001 — c'est du contenu,
c'est le chantier de Laurent, et le confondre avec celui-ci ferait attendre
l'un pour l'autre.

##### D-19 ter — un programme **NON DIFFUSABLE** ne sort jamais, ni lui ni ses modules (relecture du 11/09/2026)

La liste de rattachement du 11/09 proposait **« L'Agent Incomparable » en tête
de deux douleurs** — « rythme de suivi vendeur » (module M4) et « diversité des
sources de contacts » (module M1). Or ce parcours est en **v0.9 de
pré-livraison**, son manifeste porte « trous 🔴/🟠 NON levés — NE PAS DIFFUSER
AUX APPRENANTS », et il a été importé inactif *pour cette raison*.

**Pourquoi le filtre ne l'a pas retenu** : l'interdiction n'existait nulle part
dans la donnée. Elle vivait dans un manifeste au fond d'un dossier et dans une
phrase du `programMd`. Le seul champ qui en portait la trace était `isActive` —
et c'est précisément le champ sur lequel le corollaire D-19 **interdit** de
filtrer, puisque les 81 rayons importés sont inactifs par construction. Filtrer
sur `isActive` aurait vidé la bibliothèque ; ne pas filtrer laissait passer le
seul programme qu'il fallait arrêter.

**La règle** : `TrainingProduct.excludedFromClientOutputs` — même sens et même
nom que le champ de la pige sur `TrainingModule`, posé un cran au-dessus.
L'interdiction porte sur le **programme**, donc sur **tout ce qu'il contient**,
y compris les modules qu'on lui ajouterait après la relecture. Elle est posée
par l'import (`import:diag-catalog`, à la création **et** en réparation d'une
ligne existante), et tenue par le moteur : `recommendModules` écarte ces modules
et le **dit** en notice, comme pour la pige et le doublon.

⚠ **Trois notions, trois champs, à ne jamais confondre :**

| Champ | Ce qu'il dit | Combien de produits |
|---|---|---|
| `isActive: false` | pas vendu tel quel — **la norme** pour un rayon de bibliothèque | 81 rayons sur 81 |
| `supersededByProductId` | doublon d'un produit vendu, la version vendue fait foi (D-19 bis) | 4, bientôt 6 |
| `excludedFromClientOutputs` | **interdit de sortie client** — une interdiction, pas un état de vente | 1 (`PROD-0681`) |

**Test** : un module porteur du signal exact d'une douleur, marqué socle, venu
d'un programme non diffusable, ne doit ressortir nulle part — et la règle vaut
pour un module ajouté au programme sans être marqué lui-même. Le test jumeau
vérifie qu'un rayon simplement inactif, lui, n'est pas écarté.

##### D-27 — **deux mots pleins concordants, ou rien** (relecture du 11/09/2026)

Le rapprochement lexical acceptait un mot unique s'il était rare dans le
catalogue et long d'au moins 8 caractères. Rare et long n'est pas qualifiant :
sur les 17 douleurs « couvertes » du 11/09, **six lignes venaient d'un seul
mot**, et les six étaient fausses.

| Le mot | Ce qu'il proposait | À quelle douleur |
|---|---|---|
| « formation » | un programme de **déontologie** | « le dirigeant connaît ses droits à formation » |
| « collecte » | une **collecte d'e-mails** | « processus de collecte d'avis » |
| « nécessaires » | la **synthèse d'une journée de tournage** | « nombre de visites nécessaires par vente » |
| « contacts » | une formation aux **newsletters** | « transformation contacts → rendez-vous » |
| « régulièrement » | réévaluer un **plan d'action** | « indicateurs suivis » |
| « conseiller » | le **cadastre** | « trame d'appel commune » |

**La règle** : un rapprochement fondé sur un seul mot commun n'est **pas proposé
du tout**. Il faut deux mots pleins concordants — deux mots qui qualifient,
c'est-à-dire dont le pouvoir discriminant mesuré sur la bibliothèque est non nul
(D-18).

**Le raisonnement, et il vaut au-delà de ce script** : une ligne fausse n'est
pas neutre. Elle se lit, se comprend, se vérifie, se barre — elle coûte du temps
de relecture, et elle **cache** la vérité utile, qui est que la douleur n'est
pas couverte. Mieux vaut une douleur déclarée non couverte, qui dit à Laurent
d'écrire du contenu, qu'une proposition qui lui fait croire le contraire.

**Conséquence chiffrée, assumée** : le nombre de douleurs sans réponse **monte**
de 17 à 21. C'est le chiffre vrai — les 4 douleurs hors champ en sortent (D-28),
mais les 4 barrées et les 2 tombées y entrent.

⚠ **Ce que D-27 ne recouvre PAS, et c'est définitif** : le moteur de recommandation
(`recommendModules`) garde sa propre échelle — signaux, lexique, confiance
`forte`/`faible`. **Laurent a tranché le 11/09 : on ne l'aligne pas.**

Son motif, qui vaut plus que la règle elle-même : **le seuil lexical est une
béquille de relecture, pas une doctrine de moteur.** Il sert à protéger un
humain qui relit des rapprochements devinés. Une fois les rattachements écrits,
le moteur ne devine plus — il suit les **étiquettes** posées sur les modules, et
le lexical n'est plus qu'un filet de sécurité. Durcir un filet qu'on s'apprête à
ne plus utiliser reviendrait à optimiser le mauvais chemin.

**Quand rouvrir la question** : seulement si, après l'écriture des
rattachements, le lexical sert encore — c'est-à-dire si des recommandations
continuent de sortir en `source: 'lexique'` sur des dossiers réels. Si elles
sortent toutes en `source: 'signaux'`, le sujet est clos pour de bon.

##### D-28 — toutes les douleurs ne sont pas des besoins de **formation** (relecture du 11/09/2026)

Quatre règles du barème sur trente-quatre notent un fait de **contexte** ou de
**financement**, jamais une pratique qui s'apprend : « part de la transaction
dans l'ancien », « le dirigeant connaît ses droits à formation », « au moins une
action de formation sur 24 mois », « aucun refus de prise en charge à traiter ».
Aucun module ne leur répondra jamais — la réponse est un dossier AGEFICE, une
explication en rendez-vous ou un fait de marché.

**La règle** : `Rule.answerableByTraining` dans le barème, exposé par
`listDiagnosticPainPoints()`. Ces douleurs **restent notées** — savoir que le
dirigeant ignore ses droits change le rendez-vous — mais elles **sortent de
l'exercice de rattachement** : ni proposées, ni comptées comme « non couvertes ».

**Pourquoi la décision vit dans le barème et pas dans le script qui en a
besoin** : le composeur (I-2) et l'éditeur de proposition poseront la même
question, et deux définitions de « douleur adressable par une formation »
finiraient par diverger. Les compter comme non couvertes gonflait par ailleurs
le nombre de douleurs à combler et décourageait pour rien.

#### D-20 — l'unité de vente est le bloc de 8 h, pas la somme des modules

Un programme composé est un **multiple du bloc de 8 h** = une demi-journée de
4 h sur site co-animée à deux formateurs — la même unité que le tarif
(336 € HT/participant/demi-journée, §8.1). Conséquence directe :

- **le total d'un programme composé ne se déduit plus de la somme des durées de
  ses modules**. Les durées de modules servent à savoir **ce qui TIENT dans un
  bloc de 8 h**, rien de plus ;
- ceci clôt le sujet des 16 modules sans durée (D-17) : la valeur par défaut ne
  pilote plus aucun montant vendu, elle ne sert qu'à la composition. Le badge
  « durée à confirmer » reste, parce qu'il reste utile pour composer.

⚠ **Ligne rouge — périmètre du chantier** : diagnostic et modules UNIQUEMENT.
**Interdiction de retoucher la durée d'un produit qui porte déjà des sessions
ou des conventions signées** (journées Faros) : les documents déjà émis
porteraient alors des heures qui ne correspondent plus à leur produit, ce qui
est une non-conformité en contrôle. _Vérifié le 10/09/2026 : les 7 conteneurs
touchés par la passe de réparation de l'import sont inactifs et portent zéro
session — la règle a été respectée rétroactivement, et le script la refuse
désormais explicitement._

#### Dimensionner au budget sans jamais remplir pour remplir

Selon les points de douleur, on compose **plusieurs journées** de façon à
mobiliser le maximum des droits disponibles (AGEFICE plafonné à 3 000 €/agent,
enveloppe OPCO EP) : des droits non consommés au 31 décembre sont des droits
perdus, et les laisser dormir n'aide personne.

**Garde-fou non négociable** : chaque module retenu est **justifié par un point
de douleur tracé**. Quand toutes les douleurs sont couvertes et qu'il reste de
l'enveloppe, c'est un **arbitrage humain affiché**, jamais un remplissage
automatique — c'est la règle « surplus d'enveloppe = arbitrage humain » de §8.2,
appliquée à la composition. Un contrôle OPCO regarde la cohérence
**besoin ↔ programme ↔ durée** : un programme dont on ne peut pas expliquer
pourquoi chaque module y est ne la passe pas.

> **État au 04/09/2026 — import VALIDÉ par Laurent et appliqué sur la base LOCALE** (`qualiof_dev`). 79 modules, 6 conteneurs inactifs, aucun module à 0 h (D-17), 3 modules pige exclus des sorties client (« Pige Faq », « Veille concurrentielle » ×2 — confirmé par Laurent : ils restent au catalogue interne). Le script est **idempotent ET réparateur** : rejoué, il corrige la durée de ce qu'il possède au lieu de ne rien faire. L'`--apply` en production reste à la checklist du 10/09.
>
> ✅ **Maillon rétabli par le lot I-1 (10/09/2026).** Le constat qui précédait — « les signaux vivent sur les modules des conteneurs inactifs, aucun produit ACTIF n'en porte, la reco se rabat sur le lexique » — décrivait un moteur qui lisait les PRODUITS et filtrait sur `isActive`. Il ne lit plus que des MODULES, et ne filtre plus sur l'état du conteneur : les signaux du catalogue diagnostic sont redevenus lisibles sans qu'aucun rayon n'ait été activé. Relier les modules aux produits vendus n'est donc plus nécessaire — c'était la bonne réponse à la mauvaise question. `pnpm --filter @qualiof/web probe:reco` (ou `probe:reco:local`) montre le rapprochement sur un dossier réel, sans rien écrire.

> **État au 10/09/2026 — lot I-1 livré (bibliothèque + reco au niveau module).**
>
> - **Bibliothèque** : 479 modules dans 81 rayons sur la base locale — les 86 du catalogue diagnostic, plus **402 extraits du Drive « Formations et programmes » (74 rayons) et de la formation Faros**. **Aucun rayon actif** : les 41 produits vendus n'ont pas été touchés.
> - **Chaîne d'extraction** : `extract:drive-catalog` lit les `.docx` et écrit un **instantané versionné** (`data/drive-programmes-catalog.json`) ; `import:drive-catalog` l'écrit en base, dry-run par défaut, idempotent, avec rapport dans `.planning/`. Cinq motifs de découpage reconnus (horaire, module numéroté, demi-journée, durée déclarée, liste imbriquée Word) ; **17 programmes restent en bloc unique** et attendent un découpage à la main — ils sont listés dans le rapport, et restent recommandables par leur intitulé.
> - **Ce que l'import NE fait PAS** : il ne fusionne aucun rayon avec un produit vendu qui lui ressemble (`drive:055` ↔ `PROD-055`, `drive:053` ↔ `PROD-053`, `drive:046` ↔ `PROD-0671`, `drive:074` ↔ `PROD-0662`). Rattacher des modules à un produit ACTIF changerait sa page publique « Programme détaillé », donc l'information préalable remise au client. Les correspondances sont **signalées dans le rapport**, à charge du composeur (I-2) de savoir qu'elles parlent du même métier.
> - **Traçabilité** : `DiagnosticAlert.questionIds` et `ChapterScore.breakdown[].questionId` (ajouts purs) permettent de remonter de chaque axe recommandé à **la réponse du dirigeant** qui l'a déclenché. Vérifié sur DIAG-0001 : chaque axe servi cite son alerte ET la réponse chiffrée derrière elle.
> - **Deux règles de moteur ajoutées, dans le prolongement de D-18** : ① les mots-clés sont **pesés par leur pouvoir discriminant** mesuré sur la bibliothèque du moment — « vendeur » touche un module sur cinq et ne suffit plus à badger un rapprochement « forte », « exclusivité » en touche 2 % et vaut plein tarif ; la pondération ne s'applique qu'au-dessus de 30 modules, en dessous elle mesurerait du bruit. ② **deux modules maximum par programme source dans un axe** : sans plafond, un module du catalogue diagnostic portant huit signaux transverses raflait les cinq places de presque chaque axe — l'inverse de ce que D-19 demande.
> - **Résultat sur DIAG-0001** : 7 programmes sources représentés, dont 2 rayons du Drive, tous conteneurs inactifs, 9 modules pige écartés d'office.
> - **Arbitrages de Laurent sur le rapport d'import (10/09/2026)** : ① **D-19 bis** — la version vendue fait foi pour les 4 doublons, cf. ci-dessus (59 modules écartés de la reco, bibliothèque utilisable 479 → 420) ; ② **les 17 programmes en bloc unique restent tels quels** — recommandables entiers, ça suffit à I-1, à réexaminer quand le composeur devra piocher dedans ; ③ **le dossier Drive `069` est en cours de vérification** par Laurent (il contient un fichier nommé `068`) — **ne rien y réimporter avant son retour**.
> - **Reste à I-2** : le composeur par blocs de 8 h, le programme Qualiopi du produit composé, et l'éditeur de proposition branché dessus. L'éditeur lit encore `recommendProgrammes` (niveau produit) — c'est délibéré : le rebrancher sans le composeur laisserait l'écran à mi-chemin.

> **État au 10/09/2026 — lot I-2 livré (le composeur).**
>
> - **L'unité est le BLOC** : 1 bloc = 1 demi-journée = 4 h sur site = 8 h conventionnées, tout dérivé des `FundingRule`. Ce qui TIENT dans un bloc se mesure en heures sur site ; ce que le bloc DÉCLARE au financeur se compte en heures conventionnées. Les deux valeurs cohabitent partout, aucune ne s'affiche nue.
> - **Un axe de proposition = une demi-journée**, pas un thème. Un thème n'a pas de durée : il s'étale sur un bloc et demi, et le dirigeant perd tout moyen de vérifier que le parcours détaillé explique le volume facturé. Le titre reste thématique (il nomme les besoins servis), le décompte devient vérifiable — Σ axes = volume vendu, exactement.
> - **Le chiffrage suit la COMPOSITION, plus l'enveloppe** (`seedPayers({ halfDaysSold })`). C'était le vrai défaut caché : la proposition facturait les 9 demi-journées que les droits permettaient, alors que 5 seulement étaient justifiées. Facturer l'enveloppe est précisément le « remplir pour remplir » que §8.2 interdit, et c'est ce qu'un contrôle OPCO cherche. Le surplus s'affiche désormais comme arbitrage humain.
> - **Aucun module n'entre sans justification tracée** : un besoin déclenché qu'aucune réponse ne documente voit ses modules REFUSÉS, et le refus se dit. Un module qu'on ne sait pas expliquer ne passe pas un contrôle.
> - **Un module ne se programme qu'une fois** — par identifiant ET par intitulé. Constaté sur DIAG-0001 : un module portant huit signaux transverses remontait en tête sur deux besoins et se retrouvait programmé deux fois ; et deux identifiants distincts portent le même titre (« Chatbot mandat » sous deux familles). La place libérée revient au candidat suivant du besoin.
> - **Le programme Qualiopi ne cite jamais les chiffres du client.** La justification chiffrée (« votre exclusivité est à 25 % ») vit dans la proposition, qui s'adresse au dirigeant ; le programme s'attache à la convention et part au FINANCEUR, il ne porte que le libellé du besoin. Cela suffit à montrer la cohérence besoin ↔ programme ↔ durée sans livrer les ratios commerciaux de l'agence.
> - **Les objectifs dérivent des modules retenus**, pas des objectifs du programme source : ne retenir qu'un module sur dix et recopier les dix objectifs promettrait neuf choses qu'on n'anime pas. Détection du verbe par **liste blanche** relevée sur le corpus réel — une liste noire aurait le mauvais mode d'échec (du français cassé sur une pièce financeur), la liste blanche produit au pire « Maîtriser « … » », plus lourd mais correct.
> - **Le produit composé** (`SUR-NNNN`) naît ACTIF et porte `sourceRef = proposal:PROP-NNNN` ; `Proposal.composedProductId` le relie. Il est bâti depuis les axes ENREGISTRÉS, jamais recomposé : le composeur propose, le commercial dispose, et c'est ce qu'il a laissé que le client signe. **Un produit portant déjà des sessions ne se régénère pas** — la convention émise divergerait de sa source.
> - **Vérifié sur DIAG-0001** (`probe:composition:local`) : 5 demi-journées composées depuis **4 programmes sources**, 40 h conventionnées = 5 × 8, chaque module rattaché à une réponse, **Σ devis = Σ proposition au centime** (6 720,00 €), 4 demi-journées d'enveloppe affichées et non facturées.
>
> ⚠ **Ce que la composition a mis au jour, et qui est une décision de CATALOGUE.** Le programme composé sur DIAG-0001 **n'est pas remettable en l'état** : les huit modules retenus viennent du catalogue diagnostic, qui porte des signaux et des questions de rendez-vous — **aucun déroulé pédagogique** (l'import du lot A a rangé `needIdentification` dans `contentMd`, faute de contenu dans la source). Le générateur refuse de les imprimer : un financeur qui lit « à quelle fréquence les vendeurs reçoivent-ils un compte rendu ? » y verrait un rendez-vous commercial, pas une formation. Il laisse la place vide et le DIT — dans l'éditeur, pas seulement dans un log.
>
> Deux leviers pour Laurent, à trancher : ① écrire les déroulés des modules diag les plus utilisés ; ② **attacher les signaux diagnostic aux modules du Drive**, qui ont du contenu — ainsi le meilleur rapprochement et le meilleur déroulé cesseraient d'être portés par deux modules différents. ② est le fond du sujet, et c'est le prolongement naturel de D-19.

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

**Tranché à la construction du lot C (10/09/2026) — ces points ne se renégocient plus :**

1. **La citation fait foi, et son absence fait rejeter.** Une réponse dont le `quote` ne se retrouve pas dans le transcript (comparaison insensible à la casse, aux accents, à la ponctuation et aux retours à la ligne — mais pas à un mot changé) est ÉCARTÉE, pas rétrogradée en « confiance faible ». Motif : une citation inventée mais crédible est exactement ce qu'une relecture rapide ne rattrape pas — le relecteur la lit, elle sonne juste, il confirme. Le prompt l'interdit, `normalize.ts` le vérifie ; un prompt n'est pas un garde-fou.
2. **Une extraction non confirmée compte dans la PROGRESSION, jamais dans un CHIFFRE.** Le champ est rempli à l'écran : prétendre le contraire serait faux. Mais synthèse financement, pipeline, snapshot, rapport d'audit et proposition lisent tous par `REPONSES_CONFIRMEES`. Le constat qui l'impose : avant le lot C, **personne ne lisait `confirmedAt`** — les six lecteurs auraient imprimé du non-relu. Un test de contrat lit désormais le code source pour qu'un septième lecteur ait à choisir explicitement.
3. **Reprendre la main vaut confirmation.** Modifier une valeur extraite dans son chapitre la repasse en `origin=COMMERCIAL`, confirmée, `aiConfidence`/`aiQuote` effacées : il n'existe pas d'état « corrigée mais toujours douteuse ».
4. **Rétention : 90 jours après la dernière preuve d'usage**, c'est-à-dire le plus récent de `meetingAt`, `prefillAt` et `createdAt` — et non la seule date de rendez-vous. Sinon un enregistrement qui a dormi trois mois dans un Plaud serait purgé la nuit de son dépôt. La purge efface le TEXTE seul ; les réponses confirmées survivent, ainsi que `prefillAt`/`prefillModel` (traçabilité Qualiopi, pas donnée personnelle). Greffée sur le worker quotidien, à côté de la purge des traces d'envoi.
5. **Le mode se déduit, on ne le demande pas** : un questionnaire déjà entamé au clavier passe en `HYBRIDE`, un questionnaire vierge en `TRANSCRIPT`.
6. **Aucune migration** : le lot A avait déjà posé `transcriptText`, `transcriptSource`, `prefillModel`, `prefillAt`, `AnswerOrigin.IA_TRANSCRIPT`, `aiConfidence`, `aiQuote`, `confirmedAt`, `confirmedById`.
7. **L'échafaudage de diarisation n'est pas de la parole.** Le contrôle d'ancrage compare la citation au transcript **dépouillé** de ce qu'a écrit la machine qui a transcrit — horodatage suivi d'un libellé court de locuteur, cues WebVTT, « Speaker 3 : » en tête de ligne. Sans ça, toute citation enjambant un changement de tour est rejetée, ce qui condamne le format même que la fonctionnalité vise. La parole, elle, reste intouchée : un mot changé reste un rejet. Ligne rouge : une ligne qui commence par une heure mais poursuit en phrase est de la parole, pas un en-tête.

**Première mesure sur un transcript réel — 11/09/2026, transcript Optimmo du 11/08 :**

**19 % de pré-remplissage (7/37 du set léger)**, 7 réponses retenues sur 7 exactes, une seule écartée. Ce que la répartition par chapitre raconte :

| Chapitre | Retenues |
|---|---|
| 1 · Identité | 1/5 |
| 2 · Équipe & financement | 4/7 |
| **3 à 8 · Prospection, RDV vendeur, mandats, suivi, acquéreurs, visites & offres** | **0/17** |
| 9 · Base de données & e-réputation | 1/3 |
| 10 · Outils & IA | 1/2 |
| 11 · Management & vision | 0/3 |

**Les chapitres 3 à 8 sont absents parce que le rendez-vous n'est pas un R1 de diagnostic : c'est l'entretien commercial qui l'accompagne** — le cas OPTIMO de l'annexe A. On y parle d'automatiser la location, du recouvrement, des sinistres et du budget OPCO ; jamais de prospection, de mandats, de visites ni d'offres. Le taux mesure donc ce que la conversation contenait, pas ce que l'extracteur sait faire. Sur les seuls chapitres réellement abordés, il est de **41 %**.

Deux enseignements qui, eux, portent sur le moteur : le chapitre 2 — celui qui alimente le moteur budget, donc la moitié utile du R2 — est le mieux servi (4/7) ; et **la confiance est calibrée sans complaisance** (50 % sur un effectif qu'il a fallu reconstituer d'une énumération, 90 % sur un chiffre donné en clair).

**Ce que cette mesure a corrigé dans le moteur** : avant `1d7a55e`, le taux tombait à **3 %** — sept propositions sur huit écartées pour « citation absente », alors que le modèle n'avait rien inventé. Dans un transcript diarisé, le dirigeant répond au tour de parole SUIVANT la question ; le modèle cite les deux ensemble, fidèlement, mais le texte source intercale `00:17:19 Speaker 3` entre les deux. Le garde-fou mordait la main du modèle honnête, sur le format même que la fonctionnalité vise. Cf. point 7 ci-dessus.

**Reste ouvert après le lot C :**

- **Le seuil de 0,7 n'est pas encore réglable par tenant.** Il est un paramètre de `trierParException`, pas un champ de `TenantEmailSettings` : le rendre configurable demande une migration, à faire quand deux R1 réels auront dit si 0,7 est le bon nombre.
- **Le registre des traitements connaît désormais le transcript** — `docs/rgpd/REGISTRE-TRAITEMENTS.md` v1.7, **Traitement 11**, amendé le 11/09/2026. Restent à contresigner par le responsable de traitement : la durée de 90 jours, la base d'intérêt légitime retenue pour les collaborateurs cités, et la **limite de l'art. 14** (point 5 des limites connues) — ces collaborateurs ne sont pas informés, et ne peuvent pas l'être individuellement tant qu'ils ne sont pas inscrits à une formation.
- **L'import direct Plaud reste au lot H**, comme prévu : v1 = collage et dépôt de fichier (`.txt`, `.md`, `.vtt`, `.srt`).

---

## 7. Le lien de pré-inscription par RDV (`EnrollmentBatch`)

**Besoin exprimé** : « générer un lien par rapport à ce rendez-vous où les gens peuvent se préinscrire, déposer leur dossier et leurs papiers. Comme ça, l'admin peut voir ce qui est bon ou pas bon. On peut mettre des dates préalables de formation. »

### 7.1 Parcours

1. Depuis le diagnostic (bouton « Organiser les pré-inscriptions ») ou depuis la liste des campagnes, le commercial crée une **campagne de RDV** : **agence (obligatoire — D-22)**, libellé, produit pressenti, 2-3 **dates prévisionnelles** (`BatchDateOption`), expiration (défaut : date du R2 + 30 j). Un seul lien multi-usages est généré (token affiché une seule fois, doctrine §3 du repo diag).
   - **Le rattachement est l'agence, et elle seule (D-22).** Ouverte depuis un diagnostic, l'agence est reprise de lui et verrouillée, le lead suit en contexte, et le libellé se pré-remplit (agence + date du RDV). Ouverte depuis la liste, l'agence se choisit dans le CRM et le diagnostic reste vide — c'est le cas du **client récurrent reformé sans nouveau R1**. Une campagne sans aucun client n'existe plus.
   - **Les dates se saisissent en demi-journées (D-23)**, l'unité de vente de §8.1. Trois préréglages : Matin, Après-midi, Journée (= 2 demi-journées, et c'est écrit). Chaque date affiche ses demi-journées, ses heures sur site et ses heures conventionnées — le même nombre que la proposition, la convention, l'émargement et le dossier financeur.
2. Le dirigeant diffuse le lien à son équipe (ou Start Academy l'envoie — email catégorie « Lien de pré-inscription », fail-closed).
3. Chaque participant ouvre le lien → page publique `/rdv/[token]`. **Précision de Laurent du 10/09/2026, qui remplace la formulation initiale : cette page NE PORTE PAS de formulaire. Elle DISTRIBUE des liens individuels.** Le participant y donne son identité minimale (prénom, nom, email) et son choix de date ; on lui remet alors SON lien `/preinscription/[token]`, et c'est ce lien-là qui porte le formulaire complet (statut, pièces CNI recto/verso, RIB, attestation CFP pour les TNS). **Motif** : tout le pipeline existant — OCR, extraction, validation admin, motif de rejet, relances des dossiers non rendus — est accroché à une pré-inscription INDIVIDUELLE. Un formulaire porté par le lien partagé aurait obligé à recréer chacune de ces briques à côté des premières, soit exactement le second pipeline que §13 interdit. Chaque demande crée un `PreEnrollment(batchId=…)` qui entre dans le pipeline existant — rien de nouveau à construire.
   - **Idempotence sur l'email** : rouvrir le lien avec la même adresse rend le MÊME lien individuel, jamais un second. C'est ce qui permet de reprendre son dossier depuis son téléphone après l'avoir commencé sur son poste, et ça évite les doublons que l'admin devrait démêler.
4. Le commercial et l'admin voient l'avancement AGRÉGÉ sur la fiche campagne : X pré-inscrits / Y attendus, pièces complètes / incomplètes / rejetées, votes par date. C'est l'écran « ce qui est bon ou pas bon ».
5. À l'acceptation de la proposition (lot G) : la date retenue devient la (les) `TrainingSession`, les PreEnrollments validés sont convertis (Person/Org/LegalLink/participants) par le flux de conversion existant.

### 7.2 Règles

- L'écran de campagne affiche en tête **l'agence, la formation et la date limite de dépôt** — les trois faits qui gouvernent le dossier. La liste affiche l'agence en première colonne.
- Un participant ne voit JAMAIS le diagnostic, la proposition ou les autres participants — il ne voit que SON formulaire (doctrine « le client ne fait jamais son diagnostic », étendue : il ne voit pas non plus le chiffrage des autres).
- **Aucun nombre d'heures ne s'affiche sans dire lequel il est** (D-25) : « 36 h sur site · 72 h conventionnées », jamais « 36 h ».
- **Les compteurs sont exclusifs et totalisants** (D-24) : Non rendu · Pièces manquantes · Rejeté · Bon, somme = effectif attendu.
- **Les dates s'écrivent en minuscules** — « jeudi 8 octobre 2026 ». Le formatage vient de `lib/dates-fr.ts`, jamais d'une classe CSS `capitalize`, qui majuscule chaque mot.
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

> ### Observation du 11/09/2026 — enrichir le catalogue augmente le volume VENDU, à droits constants
>
> Constatée en écrivant trois modules réels au catalogue, sur DIAG-0001 : le
> parcours composé est passé de **5 demi-journées à 6**, de 40 h à 48 h, et de
> **6 720 € à 8 064 € HT**.
>
> **Ce n'est pas une dérive, c'est l'effet recherché — et le garde-fou §8.2 tient
> toujours.** Le mécanisme : les modules retenus jusque-là étaient des étiquettes
> du catalogue diagnostic, sans déroulé, qui occupaient 60 à 90 min. Les modules
> réels qui les remplacent portent 120 à 240 min de contenu animable. **Le même
> point de douleur justifie donc plus d'heures**, parce qu'il y a enfin de quoi
> les remplir.
>
> Ce que §8.2 interdit reste interdit : **ajouter un module sans point de douleur
> derrière**. Ici, aucun module n'a été ajouté sans justification — c'est le
> contenu par douleur qui s'est étoffé.
>
> **À droits constants.** DIAG-0001 mobilise 12 096 € de droits ; 8 064 € reste
> dessous. **Le reste à charge du dirigeant ne bouge pas**, et le client reçoit
> une demi-journée de formation en plus. C'est exactement le renversement que
> §8.2 décrit — on ne vend pas un prix, on convertit un budget — appliqué à la
> profondeur du catalogue plutôt qu'au nombre d'agents.
>
> **La conséquence à connaître pour la suite** : chaque fois que Laurent écrira
> un déroulé manquant, le volume justifié des dossiers concernés montera.
> Tant que le total reste sous les droits mobilisables, c'est une bonne
> nouvelle commerciale ; **le jour où il les dépasse, ce n'est plus une
> conséquence automatique mais un arbitrage** — le surplus s'affiche déjà comme
> tel, et il se présente au dirigeant.

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
3. **« Notre proposition en phases »** — le programme, **COMPOSÉ à la carte** (D-19 du 04/09/2026) : les axes ne citent plus des produits pris tels quels mais des **modules assemblés** venant de plusieurs programmes, chacun rattaché au point de douleur qui l'a fait entrer (module ↔ signal ↔ réponse, traçable). Chaque axe est un **multiple du bloc de 8 h** (D-20) — les durées de modules disent ce qui tient dans un bloc, elles ne fixent pas le total vendu. Le programme ainsi composé **devient le produit vendu à ce client**, avec son programme Qualiopi dérivé (objectifs, durées, prérequis). Composés depuis le **catalogue complet Start Academy** — programmes MÉTIER purs (Booster vendeur 058, Booster Acheteurs 059, Face à face acheteurs 008, Maîtrise des techniques de vente 055, Cycle prospection/négociation 053, Cadastre, Tracfin/déontologie 063…) ET programmes IA (065/070/073…) — chaque module avec « pourquoi ce module » relié à un signal du diagnostic. **Règle produit : un point de douleur métier reçoit un programme métier — l'IA n'est jamais la réponse par défaut** (retour de Laurent du 01/09 sur la maquette v1).
4. **Planning proposé** — les dates de la campagne (§7), équipes/groupes, et la ligne « pièces réunies au plus tard le [date session − 15 j] ».
5. **Budget mobilisable** — LE tableau qui signe : lignes par financeur × bénéficiaires × base × montant (AGEFICE agents éligibles, AGEFICE TNS dirigeants « sous réserve attestation CFP », OPCO EP par entreprise du groupe, déductions consommation déjà engagée), total « ENVELOPPE MOBILISABLE ESTIMÉE », potentiel complémentaire. Encadré « points clés » (indemnisation agents, ALUR, montage 100 %, zéro avance). |
6. **Détail type devis** — tableau des lignes de vente par payeur (désignation, participants, demi-journées, heures conventionnées, PU HT, total HT, TVA formation exonérée art. 261-4-4° a CGI), prise en charge estimée, **reste à charge par payeur** puis consolidé — avec remise/OFFERT le cas échéant. Ces lignes = exactement les futures `QuoteLine`. |
7. **Pourquoi Start Academy** — résultats mesurés (paramètres tenant), bios formateurs (paramètres), avis Google (paramètres, datés).
8. **Prochaines étapes** — tableau Action / Qui / Échéance (généré : pièces, accès OPCO, lien de pré-inscription, dépôt dossiers, 1ʳᵉ session).
9. **Mention légale** — « Montants estimatifs, sous réserve des droits réellement disponibles et de l'acceptation des dossiers par les financeurs. Proposition valable N jours. » (jamais retirable).

Rendus : **PDF** (WeasyPrint, chaîne existante) + **lien web lecture seule** `/proposition/[token]` (même contenu, même charte, token hashé, expiration = validité). L'envoi passe par le mailer (catégorie « Proposition », fail-closed) OU par le canal du commercial (copie du lien).

> **État au 10/09/2026** — le lot E a livré la remise (`markProposalSent`) sans
> brancher le mailer : la proposition se présente en rendez-vous, c'est là
> qu'elle se vend. Le bouton d'envoi manuel est tranché (**D-21**) et arrive
> avec le **lot F**. D'ici là, seul le canal du commercial existe, et le statut
> « ENVOYEE » veut dire « remise », pas « expédiée ».

**Génération du devis** : bouton « Générer le(s) devis » → un `Quote` par payeur depuis les lignes §6 (recipient depuis `payer-rule.ts`, personne morale → entreprise, indés autofinancés/subrogés selon montage). Test de contrat : Σ `QuoteLine` = montants proposition, heures devis = heures conventionnées proposition.

> **D-15 (tranchée à la livraison du lot E, 04/09/2026) — ce que le devis porte, et ce qu'il ne retranche pas.** Le devis reproduit le **coût pédagogique** — l'assiette des droits — et **pas** le reste à charge après geste commercial. Une remise portée en ligne négative sur le devis diminuerait le coût déclaré, donc la prise en charge : le client paierait lui-même le cadeau qu'on prétend lui faire. La prise en charge attendue, le reste à charge et le geste commercial sont donc écrits **en clair dans les notes du devis**, jamais retranchés de ses lignes. C'est ce qui rend le test de contrat exact : **Σ lignes de devis = coût pédagogique de la proposition, au centime**. Un devis par PAYEUR, jamais par bandeau d'affichage : la subrogation AGEFICE se monte par personne (4 indés = 4 devis sous un seul bandeau). À confirmer par Laurent au premier dossier réel envoyé.

### 9.2 Le rapport d'audit complet — un livrable de 15 pages minimum, valorisé 3 000 €

**Exigence de Laurent (01/09)** : l'audit complet est une prestation à part entière, **valorisée 3 000 € HT** (paramètre `AUDIT_DISPLAY_VALUE`, affiché en couverture « offerte dans le cadre de votre accompagnement »), donc un document **d'au moins 15 pages qui restitue ce qui s'est dit** — pas une synthèse. Il parle au dirigeant : ses mots, ses chiffres, ses enjeux en euros, son équipe. Structure de référence = la maquette 17 pages.

**Deux formats pour une seule structure (D-13, tranchée le 03/09/2026)** — les **17 sections** ci-dessous existent dans les deux cas et gardent leur numéro ; c'est le nombre de PAGES qui change :

- **COMPLET → 17 pages**, un chapitre par page, exactement la maquette.
- **LÉGER → format CONDENSÉ**. Les chapitres s'enchaînent au fil de l'eau, 2 à 3 par page selon leur contenu réel, **sans qu'un chapitre soit jamais coupé en deux**. Les huit sections hors chapitres gardent leur page. Sur DIAG-0001 (37 réponses) : **13 pages pleines** au lieu de 17 à moitié vides.
- Conséquence : en condensé, **n° de section ≠ n° de page**. Le sommaire affiche les deux (numéro de section à gauche, page réelle à droite) et les pages sont résolues par le moteur d'impression (`target-counter`), jamais écrites en dur.
- Le plancher « 15 pages minimum » de la présente section vaut **pour le format COMPLET**. Le condensé est plus court par construction — c'est son objet.

Structure de référence = la maquette 17 pages :

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

### 9.5 Le socle de rendu WeasyPrint — UN bloc de compatibilité pour tous les documents

Acquis de la QA du 03/09/2026 sur le premier audit réel. Le moteur d'impression
échoue **en silence** sur plusieurs propriétés courantes : rien dans les logs,
rien dans les tests unitaires, un défaut visible seulement en ouvrant le PDF.
Ces règles ne se redécouvrent pas document par document.

**Le socle vit dans `apps/web/src/lib/docs/weasyprint-base.ts`** (extrait de
`audit-styles.ts` à la livraison du lot E, 04/09/2026, sans changer d'un
caractère le rendu de l'audit — ses 46 tests de contrat le vérifient) : modèle
de page `@page`, pile de fontes forcée, pied de page en boîtes de marge avec
`counter(page)/counter(pages)`, blocs héros en table-cell, pastilles en inline.
Toute nouvelle sortie documentaire de la chaîne (proposition, devis, pack)
l'**importe** au lieu d'en retranscrire une variante à la main ; ne restent
dans chaque feuille que les transpositions propres à son gabarit. Ce que le
socle porte :

| Ce que le moteur ne sait pas faire | Ce qu'on écrit à la place |
|---|---|
| **CSS Grid** et **`gap`** (ni en grid, ni en flex) — échec muet | flex + marges explicites ; **table/table-cell** dès qu'il faut des colonnes qui ne se chevauchent jamais (blocs héros à gros chiffre) |
| `min-height` n'établit pas le bloc conteneur d'un enfant `position:absolute` | pied de page en **boîte de marge `@page`**, avec `counter(page)` / `counter(pages)` (D-14) — jamais de total écrit en dur |
| `overflow:hidden` masque le débordement… et **tronque en silence** | **interdit** sur les blocs de page : un débordement doit produire une page de plus, un défaut qui se VOIT |
| `columns:2` | flex `flex-wrap` (cf. sommaire) |
| `var(--x)` dans une propriété raccourcie (`background:var(--x)` ignoré, `color:` OK) | palette **résolue en littéraux** |
| Fontes : le conteneur ne porte **que Liberation**. `DejaVu Sans`, `Montserrat`, `system-ui` et même le générique `sans-serif` tombent tous sur Liberation **Mono** | `'Liberation Sans', Helvetica, Arial` (Helvetica/Arial = alias fontconfig) |
| Glyphes hors fonte (✓ U+2713, ✗ U+2717) — sortent **blancs** | couleur + mots ; **test de contrat** qui refuse tout caractère hors fonte |
| Pagination d'un flux | `break-inside:avoid` sur le bloc à ne pas couper, et on laisse le moteur décider combien tiennent par page — **jamais d'estimation de hauteur** (une estimation ratée tronque) |

**Dette technique OPTIONNELLE (non bloquante, après le 10/09)** — le PDF sort
aujourd'hui en **Liberation Sans**, pas dans les fontes de la maquette. Pour un
rendu identique à `2026-09-01-maquette-audit.html`, il faut **installer
Montserrat et Rajdhani dans l'image du conteneur de rendu**
(`docker/weasyprint/`) puis retirer le `!important` de la pile de compatibilité.
À faire seulement si Laurent veut le rendu maquette exact : la lisibilité et la
mise en page sont correctes en Liberation Sans, ce n'est pas un défaut de
conformité.

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
| **C — Transcript** | Collage/upload + job d'extraction + revue par exception. **Fini quand** : zéro réponse fausse parmi les retenues, ancrage de citation tenant sur le format diarisé comme sur la reformulation, et rien de non confirmé dans un document client. Le **taux** de pré-remplissage se constate et ne bloque pas (§14). | A, B | M |
| **D — Audit** | Moteur ratios/alertes + rapport d'audit (PDF + écran) + DocType + fingerprint | A, B | M |
| **E — Proposition** | Éditeur (modules, lignes par payeur, remise/OFFERT avec validation > 15 %), génération IA relue, PDF + lien public, envoi email, génération devis, fingerprint. **Rendu : réutilise le socle de compatibilité WeasyPrint de §9.5** — pas une seconde transposition à la main. Maquette `2026-09-01-maquette-proposition.html` = référence exacte. **Fini quand** : une proposition réelle générée depuis DIAG-0001, PDF **relu page par page**, Σ devis = Σ proposition **au centime**, heures conventionnées identiques partout, trois gates vertes. | A, B, D (utilisable sans C) | XL |
| **F — Campagne RDV** | EnrollmentBatch + dates + page publique `/rdv/[token]` + écran d'avancement (réemploi PreEnrollment) + alertes A-1/A-2/A-3 (§11.1 — A-1/A-2 anticipables en `/quick`) **+ le bouton « Envoyer la proposition par email » (D-21)** : c'est ici que le mailer est déjà ouvert, donc ici que la catégorie fail-closed se pose, plutôt que dans un lot à part | A (parallèle à D/E) | M |
| **G — Acceptation → session** | Acceptation de proposition → sessions sur la date retenue + **SessionPricing** (forfait entreprise ferme / lignes indés) + conversion pré-inscrits + conventions | E, F, **phase 23 SessionPricing livrée** | L |
| **I — Composition** | **Refonte D-19/D-20 : le catalogue devient une bibliothèque de modules.** **I-1 et I-2 — ✅ livrés le 10/09/2026** (cf. bilans §5.3) : `TrainingModule` promu au rang d'unité recommandable (index par signal, rattachement multi-produits), `TrainingProduct` composé généré, **et la lecture des modules affranchie de l'`isActive` du conteneur** (corollaire D-19 du 10/09 : les conteneurs importés ne sont jamais activés, c'est le produit composé qui porte l'état vendable — test : reco jouée avec tous les conteneurs inactifs, elle doit encore proposer des modules) ; ② import de la formation Faros et du Drive « Formations et programmes » (008 → 074) dans la bibliothèque ; ③ moteur de recommandation au niveau MODULE (module ↔ signal ↔ réponse, traçable) ; ④ composeur de programme par blocs de 8 h avec justification obligatoire par point de douleur et arbitrage humain affiché sur le surplus d'enveloppe ; ⑤ génération du programme Qualiopi du produit composé (objectifs, durées, prérequis) ; ⑥ éditeur de proposition branché sur la composition. **Ligne rouge** : diagnostic et modules uniquement — aucun produit portant sessions ou conventions signées n'est retouché. **Fini quand** : une proposition réelle compose un programme sur mesure depuis ≥ 2 programmes sources, chaque module y est justifié par une réponse du diagnostic, le volume tombe en multiple de 8 h, et le programme Qualiopi généré est relu par Laurent. | A, D, E | **XL** |
| **H — Suite** | Relances auto (J+1 lead sans proposition · proposition envoyée non vue J+3 · vue sans réponse J+7 · date limite J-5 — pattern stand MLS, cron + fail-closed) · import Plaud · Coach Brain branché · pack communication dirigeant · lien formateur · signature électronique | G + arbitrages Laurent | L |

Ordre recommandé : **A → B → (C ∥ D) → E → F → G**, H au fil de l'eau. Le lot **I (composition, D-19/D-20)** se prend **après F**, et se chiffre à part : il touche le modèle du catalogue, le moteur de recommandation et l'éditeur de proposition — le mener dans la foulée d'un autre lot mélangerait deux refontes. La valeur tombe dès B (le R1 outillé) et devient décisive à E (la proposition qui signe).

## 14. Critères d'acceptance globaux & tests

- [ ] Un diagnostic LÉGER se fait en < 30 min au clavier, sans blocage réseau visible, et s'upgrade en COMPLET sans re-saisie.
- [ ] La synthèse financement s'affiche < 1 s après la grille équipe, avec l'exemple canonique : 4 indés > 7 k€ → 36 demi-journées cumulées / 9 demi-journées de groupe / prise en charge 12 000 € (plafond) / écart de 96 € traité selon D-8.
- [x] **Lot C — BLOQUANT, atteint le 11/09/2026** : ① **zéro réponse fausse** parmi les retenues — 7 sur 7 exactes sur le transcript Optimmo du 11/08, mesuré le 11/09 ; ② **l'ancrage de citation tient sur le format diarisé** (corrigé en `1d7a55e` : `depouillerTranscript` retire horodatages, libellés de locuteur et cues WebVTT, jamais la parole) **comme sur la reformulation** — « l'on ne s'en sert pas » cité « l'on ne se sert pas » reste rejeté, et un test de mutation le prouve ; ③ AUCUNE réponse pré-remplie non confirmée ne sort dans un document client (`REPONSES_CONFIRMEES` + test de contrat sur le code source).
- [ ] **Lot C — CONSTATÉ, non bloquant** : le taux de pré-remplissage **mesure la conversation, pas le moteur**. Il se constate, il ne barre rien. Relevé du 11/09/2026 sur le transcript Optimmo : **19 % (7/37)** sur le set léger, **41 % sur les seuls chapitres abordés** (1 · Identité, 2 · Équipe & financement, 9 · Base & e-réputation, 10 · Outils & IA). Décision de Laurent du 11/09 : ce seuil ne conditionne plus la livraison du lot.
- [ ] **Lot C — À REMESURER** sur le premier vrai R1 mené avec la trame, sans que le résultat bloque quoi que ce soit. C'est cette mesure-là qui dira ce que le mode transcript fait gagner ; celle du 11/09 dit seulement ce qu'un entretien commercial contient.
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

| **D-19** | Les programmes métier de Laurent « manquaient » au catalogue QualiOF. Fallait-il les y créer un par un ? | **Non — ils n'y sont pas parce qu'un programme SE COMPOSE.** Le catalogue est une **bibliothèque de modules**, pas une liste de produits figés : on assemble des modules venant de plusieurs programmes selon le point de douleur de l'agence. La reco recommande donc des MODULES (module ↔ signal ↔ réponse, traçable), la proposition compose le programme sur mesure, et ce programme composé devient le produit vendu à ce client. **Remplace le mapping « signal → programme vendu »** : c'est la vraie réponse aux signaux coincés sur PROD-0675..0680. Cf. §5.3. **Corollaire du 10/09 : on n'active JAMAIS les conteneurs importés** — la reco et le composeur lisent les modules quel que soit l'`isActive` du conteneur, et c'est le produit composé qui porte l'état vendable. **Appliqué en I-1 le 10/09/2026** : `recommendModules` ne filtre nulle part sur `source.isActive`, et deux tests tiennent la règle — l'un joue la reco avec TOUS les conteneurs inactifs, l'autre vérifie que les activer ne change strictement rien au résultat. Cf. §5.3. | 04/09/2026 |
| **D-19 bis** | Quatre rayons importés du Drive portent le même programme qu'un produit déjà vendu (`drive:055`↔`PROD-055`, `drive:053`↔`PROD-053`, `drive:046`↔`PROD-0671`, `drive:074`↔`PROD-0662`). Lequel fait foi ? | **La version VENDUE.** Le produit vendu ne bouge pas — ni sa durée, ni sa page publique « Programme détaillé », qui EST l'information préalable remise au client ; la modifier après coup crée un écart annoncé/réalisé, donc une réserve Qualiopi. C'est le RAYON qui s'efface : il reste consultable, mais **ses modules sortent du chemin de composition**. Motif : deux versions du même programme dans la bibliothèque, c'est l'occasion d'en vendre une et d'en animer une autre. **Détection** : égalité de nom normalisée, à l'import uniquement, contre les seuls produits **vendus** (non importés ET actifs) ; le lien est **persisté** dans `TrainingProduct.supersededByProductId` et **jamais recalculé ni retiré** par un import — c'est ce qui empêche un dossier Drive renommé de réintroduire le doublon. Le moteur filtre en plus, et le dit en notice. **À ne pas confondre avec `isActive`** : inactif = la norme (81 rayons sur 81), écarté = doublon (4). **Conséquence assumée** : ces quatre produits ne portant aucun module, ils deviennent invisibles à la reco au niveau module — cf. §5.3. | 10/09/2026 |
| **D-19 ter** | « L'Agent Incomparable » (`PROD-0681`), parcours v0.9 dont le manifeste porte « NE PAS DIFFUSER AUX APPRENANTS », était proposé en tête de deux douleurs sur la liste de rattachement du 11/09. Pourquoi le filtre ne l'a-t-il pas arrêté ? | **Parce que l'interdiction n'était nulle part dans la donnée** — elle vivait dans un manifeste et dans une phrase de `programMd`. Le seul champ qui en portait la trace, `isActive`, est précisément celui sur lequel le corollaire D-19 interdit de filtrer (81 rayons sur 81 sont inactifs). **Règle** : `TrainingProduct.excludedFromClientOutputs`, même sens et même nom que la pige sur `TrainingModule`, posé un cran au-dessus — l'interdiction porte sur le PROGRAMME, donc sur tous ses modules, **y compris ceux qu'on lui ajouterait demain**. Posée par l'import (création ET réparation), tenue par `recommendModules` qui écarte et le DIT en notice. **Trois notions, trois champs** : inactif = la norme (81), écarté = doublon (4), non diffusable = interdiction (1). Quatre tests, dont un qui vérifie qu'un rayon simplement inactif n'est PAS écarté. | 11/09/2026 |
| **D-19 bis (suite)** | D-19 bis tranche un rayon contre un produit VENDU. Entre **deux rayons**, elle est muette : rien ne les départage. `drive:008` « Face à face acheteurs » et `drive:020` « Face a face acheteurs » sont le même programme sous deux numéros. | **C'est Laurent qui désigne, et la décision est déclarée dans le code** (`RAYONS_TRANCHES`), datée et motivée — jamais passée à la main sur une base, sinon elle est perdue à la prochaine. **Arbitrage du 11/09** : garder `BIB-D008`, écarter `BIB-D020` ; motif — **008 est le numéro de ce programme dans la numérotation catalogue de Laurent** (008 → 074), 020 est une copie rangée sous un autre numéro. Le lien se pose dans le même champ que D-19 bis, donc il **n'est jamais recalculé** : un prochain import du Drive ne peut pas réintroduire le doublon. Le rayon écarté **reste en base et consultable**, et le rapport le **dit** — un doublon réglé par une décision doit rester lisible, sinon quelqu'un la reprendra depuis zéro. Refus de sécurité si le rayon gardé est introuvable. | 11/09/2026 |
| **D-20** | Le total d'un programme composé se déduit-il de la somme des durées de ses modules ? | **Non — l'unité de vente est le bloc de 8 h** (4 h sur site × 2 formateurs, cohérent avec 336 €/participant/demi-journée). Un programme composé est un multiple de ce bloc ; les durées de modules servent uniquement à savoir ce qui TIENT dans un bloc. Clôt le sujet des 16 modules à 1 h (D-17) : le défaut ne pilote plus aucun montant vendu. **Ligne rouge** : diagnostic et modules uniquement — interdiction de retoucher la durée d'un produit portant sessions ou conventions signées (journées Faros), sinon les documents émis ne correspondent plus. | 04/09/2026 |
| **D-21** | La proposition doit-elle partir par email, et si oui automatiquement ? | **Elle se PRÉSENTE en rendez-vous — c'est là qu'elle se vend.** Mais le commercial doit pouvoir l'envoyer : bouton **« Envoyer par email », déclenché par lui, jamais automatique**. Trois garde-fous : ① une **catégorie d'email décochable de plus** dans `TenantEmailSettings`, fail-closed comme les autres (sans la case, rien ne part) ; ② on envoie le **lien de lecture public**, jamais une fiche nominative en pièce jointe — le lien porte déjà la règle « sans PII » du lot E ; ③ l'envoi est tracé comme une remise via `markProposalSent`, donc un envoi et une remise en main propre laissent la même trace et le statut ne ment pas. Livré **dans le lot F**, où le mailer est déjà touché. Les relances AUTOMATIQUES restent au **lot H** — ce sont deux sujets, et les mélanger ferait partir un rappel sur une proposition qu'on n'a jamais voulu envoyer. | 10/09/2026 |
| **D-22** | Une campagne de pré-inscription doit-elle porter un client, et lequel ? | **Elle porte TOUJOURS une agence — `organizationId` non-null sur `EnrollmentBatch`.** `diagnosticId` et `leadId` restent facultatifs, en contexte supplémentaire, jamais comme alternatives. **Motif** : un rattachement unique et obligatoire évite d'avoir à deviner, dans chaque écran et à la conversion des pré-inscriptions, lequel de trois liens facultatifs a été renseigné. Deux chemins de création, une seule règle : depuis la fiche diagnostic (bouton « Organiser les pré-inscriptions » — l'agence, le lead et le libellé se pré-remplissent), ou depuis la liste en choisissant l'agence dans le CRM, ce qui couvre le **client récurrent reformé sans nouveau R1** — l'interdire pousserait à saisir un faux diagnostic. **La création sans aucun client disparaît.** Aucune reprise de données : la fonctionnalité n'a jamais tourné en production. | 10/09/2026 |
| **D-23** | Un créneau de campagne se saisit-il en journées ou en demi-journées ? | **En demi-journées — c'est l'unité de vente (§8.1), et l'écran doit la dire.** Le défaut passe de 09:00–17:00 (une journée pleine, muette sur ce qu'elle vaut) à une demi-journée le matin, avec trois préréglages Matin / Après-midi / **Journée (2 × 4 h)**. Chaque date annonce en clair ses demi-journées, ses heures sur site et ses **heures conventionnées** — dérivées de `conventionedHoursPerHalfDay`, le helper qu'utilise déjà le chiffrage, jamais d'une seconde formule (ligne rouge §8.1). Le participant lit le même horaire et le même décompte sur `/rdv/[token]` : il ne pouvait pas, avant, distinguer une matinée d'une journée. Arrondi : durée du créneau ÷ durée d'une demi-journée, **au plus proche avec plancher à 1** — une journée réelle de 09:00 à 18:00 vaut 2 demi-journées et non 3, la pause déjeuner ne se facturant pas. **Les heures s'affichent en `Europe/Paris`, jamais dans le fuseau du serveur** : l'aperçu rendu en UTC annonçait « 07:00 – 11:00 » un créneau de 09:00, écart invisible depuis un poste français. | 10/09/2026 |
| **D-24** | Les compteurs de la fiche campagne : cinq axes, ou quatre cases ? | **Quatre tuiles EXCLUSIVES et TOTALISANTES**, dans l'ordre du parcours : **Non rendu · Pièces manquantes · Rejeté · Bon**, dont la somme vaut l'effectif attendu. L'aperçu en affichait cinq dont le total faisait 5 pour 4 dossiers : « en cours de vérification » disait un STATUT, « pièces manquantes » une COMPLÉTUDE, et un même dossier tombait dans les deux. Arbitrages qui en découlent : un dossier **en vérification ET incomplet** compte comme « pièces manquantes » (la seule information actionnable) ; un dossier **rendu, complet, pas encore validé** compte comme « bon » — rien ne bloque — et le nombre de non-tranchés se dit en **sous-libellé, jamais en tuile** ; une **validation admin l'emporte** sur le contrôle automatique des pièces ; les **attendus qui n'ont pas ouvert le lien** comptent comme non rendus, sinon la somme ne vaudrait que le nombre de dossiers ouverts. Les compteurs s'accordent alors exactement avec « ce qui bloque » : une ligne de relance par dossier non bon, jamais deux. | 10/09/2026 |
| **D-25** | Que compte `TrainingProduct.durationHours` — heures sur site ou heures conventionnées ? | **Heures CONVENTIONNÉES.** Preuve dans le catalogue réel : les journées Faros (FRM-0004..0007) valent 336 € HT — une demi-journée au tarif §8.1 — pour `durationHours = 8`. Et ce champ alimente `convention-template.ts` et `agefice-attendance-generator.ts`, donc la convention et le dossier financeur : c'est bien la valeur unique de la règle gravée n°2. **Conséquence d'écran** : aucun nombre d'heures ne s'affiche sans dire lequel il est. La page publique montrait « 36 h » nu sous le nom de la formation, juste au-dessus de dates qui, elles, distinguaient « h sur site » et « h conventionnées » ; elle affiche désormais les deux, dérivées par `decrireDureeProduit`. Un parcours de 9 demi-journées porte donc **72 h conventionnées / 36 h sur site**, le nombre même que verrouille le test de contrat de la proposition. **Précision de Laurent du 10/09/2026** : le facteur ×2 est une règle de **TARIFICATION** — il dit ce que vaut une demi-journée co-animée, pas ce que la convention doit raconter. **La convention n'a pas à nommer deux formateurs.** | 10/09/2026 |
| **D-25 bis** | Conséquence directe de D-25, à lire avec elle | Ce même facteur de tarification fixe le **nombre d'heures déclaré au financeur** — 8 h pour 4 h sur site — et ce nombre-là **s'imprime sur la convention et sur l'attestation d'assiduité**. Autrement dit : on ne nomme pas deux formateurs, mais on déclare leurs heures. C'est exactement ce que **D-6** doit trancher, et sa question est désormais écrite en toutes lettres dans le tableau des décisions restantes. Tant que la réponse n'est pas là, le paramètre `TRAINER_COUNT_DEFAULT` reste actif et la valeur qu'il produit est la seule qui circule — aucun écran, aucun document n'en fabrique une deuxième. | 10/09/2026 |
| **D-26** | Le nombre de formateurs est-il toujours de deux ? | **Non — Laurent anime rarement, mais parfois SEUL.** Deux formateurs restent le défaut, mais le nombre doit être **corrigeable SUR UNE SESSION, avant émission des documents** : sinon la convention et l'attestation déclarent le double de ce qui s'est réellement passé, ce qui est un faux en pièce financeur. À porter au modèle : **nombre de formateurs par session** (défaut = la règle du tenant), **heures conventionnées dérivées** de ce nombre et non plus de la seule règle, **émargement cohérent** avec lui. **À PLANIFIER APRÈS LE LOT F — pas dedans** (décision Laurent du 10/09/2026) : la campagne de RDV ne produit aucun document conventionnel, elle peut donc être fusionnée sans attendre. | 10/09/2026 |
| **D-27** | Le rapprochement lexical acceptait un mot unique s'il était rare et long (≥ 8 caractères). Sur les 17 douleurs « couvertes » du 11/09, six lignes venaient d'un seul mot — et les six étaient fausses (« formation » → déontologie, « collecte » → e-mails, « nécessaires » → journée de tournage, « contacts » → newsletters, « régulièrement » → plan d'action, « conseiller » → cadastre). | **Deux mots pleins concordants, ou rien.** Un rapprochement fondé sur un seul mot commun n'est plus proposé du tout. Motif : une ligne fausse n'est pas neutre — elle se lit, se vérifie, se barre, et surtout elle **cache** la vérité utile, qui est que la douleur n'est pas couverte. Mieux vaut une douleur déclarée non couverte, qui dit d'écrire du contenu. **Conséquence chiffrée assumée** : les douleurs sans réponse montent de 17 à 21 — c'est le chiffre vrai. ⚠ **Ne recouvre PAS `recommendModules`** — **tranché par Laurent le 11/09 : on ne l'aligne pas.** Motif : le seuil lexical est une **béquille de relecture**, pas une doctrine de moteur ; une fois les rattachements écrits, le moteur suit les étiquettes et ne devine plus. À rouvrir seulement si des recommandations sortent encore en `source: 'lexique'` sur dossiers réels après l'écriture. | 11/09/2026 |
| **D-28** | « Le dirigeant connaît ses droits à formation », « au moins une action de formation sur 24 mois », « part de la transaction dans l'ancien », « aucun refus de prise en charge à traiter » : quatre douleurs qui recevaient des propositions de modules, et qui en recevront toujours de mauvaises. | **Ce ne sont pas des besoins de formation.** Ce sont des faits de contexte ou de financement ; la réponse est un dossier AGEFICE, une explication en rendez-vous ou un fait de marché, jamais un programme. **Règle** : `Rule.answerableByTraining` dans le barème, exposé par `listDiagnosticPainPoints()`. Elles **restent notées** — savoir que le dirigeant ignore ses droits change le rendez-vous — mais sortent de l'exercice de rattachement : **ni proposées, ni comptées comme non couvertes**. La décision vit dans le barème et non dans le script, parce que le composeur (I-2) et l'éditeur de proposition poseront la même question. | 11/09/2026 |
| **D-17** | Le catalogue diag déclare le même module pour trois profils (`conseiller`, `manager`, `assistant`) et ne porte la durée que sur `conseiller` — 30 modules sur 79 sortaient sans durée, et le conteneur « Usecases » à **0 h**. | **Deux étages, jamais zéro.** ① la durée déclarée pour le même module sous un autre profil (14 modules — c'est la vraie durée, simplement rangée ailleurs) ; ② 1 h par défaut pour les 16 restants, la durée la plus fréquente du catalogue déclaré, **choix conservateur** (surestimer des heures qui finiront sur une convention ou un dossier financeur est une non-conformité ; les sous-estimer n'est qu'un catalogue à affiner). Le rapport les liste une par une. Seul « L'Agent Incomparable » reste à 0 h : parcours v0.9 explicitement non diffusable, aucune durée connue — l'inventer serait pire. | 04/09/2026 |
| **D-18** | La recommandation faisait remonter un programme « pour activité événementielle » sur l'e-réputation d'une agence immobilière. Faut-il un filtre de domaine ? | **Non — des mots-clés qui qualifient.** « marketing », « communication », « digital » sont du vocabulaire d'entreprise : ils matchent tout, donc ne qualifient rien. Le besoin e-réputation ne cherche plus que « avis », « réputation », « visible », « recommandation », « présence locale ». Et un besoin déclare désormais les **familles qu'il accepte, par ordre de préférence** : les sept besoins de la chaîne commerciale n'acceptent que `METIER` ; l'e-réputation accepte `METIER` puis `IA` (demander et suivre des avis est un sujet d'outillage autant que de méthode) — le métier passe devant, et servir une autre famille se DIT dans le rapport. | 04/09/2026 |
| **D-15** | Le devis doit-il porter le reste à charge après remise, ou le coût pédagogique ? | **Le coût pédagogique**, et lui seul. Une remise en ligne négative sur le devis réduirait le coût déclaré, donc l'assiette des droits — le client financerait le geste qu'on lui fait. La prise en charge, le reste à charge et le geste commercial vivent dans les **notes** du devis. Σ lignes de devis = coût pédagogique de la proposition, au centime (test de contrat). Cf. §9.1. | 04/09/2026 |
| **D-16** | Trois pages fixes comme la maquette, ou un document qui coule ? | **Il coule.** Forcer les trois pages produisait une page à moitié vide dès qu'un axe débordait (constaté sur PROP-0001 : la page 2 ne portait qu'un axe et 20 cm de blanc). Les sections s'enchaînent, les blocs ne se coupent jamais (`break-inside:avoid`), et c'est le moteur qui décide où couper — jamais une estimation de hauteur. Même doctrine que le format condensé de l'audit (D-13). | 04/09/2026 |

| **D-13** | Un diagnostic LÉGER produisait un audit de 17 pages à moitié vides (un chapitre de 2 réponses occupait une page entière). Fallait-il une « synthèse 2-3 pages » distincte ? | **Non — un seul document, deux formats.** Le LÉGER sort au **format condensé** : mêmes 17 sections, mêmes contenus, mais les chapitres s'enchaînent en flux (2-3 par page, jamais coupés). Le COMPLET garde une page par chapitre. Motif : deux documents distincts, c'est deux gabarits à maintenir et deux occasions de diverger — alors que la seule différence utile est la densité. Cf. §9.2. **Densité tranchée le 03/09 après relecture du PDF : DEUX chapitres par page, on garde** — pas de rabotage des encadrés « Repères » / « Premier levier » pour en faire tenir un troisième. C'est le moteur qui décide, sur le contenu réel. | 03/09/2026 |
| **D-14** | Le pied de page portait « n / 17 » écrit en dur, et un chapitre non noté affichait « — / 100 ». Quelle source pour la numérotation ? | **Les compteurs du moteur d'impression** (`counter(page)` / `counter(pages)` en boîte de marge `@page`). En condensé, le total n'est pas connu à la génération : tout total écrit en dur ment. Effet de bord bienvenu : le pied de page est enfin réellement ancré en bas — un bloc `position:absolute` dans une page en `min-height` retombe dans le flux sous WeasyPrint. | 03/09/2026 |

### Décisions restantes pour Laurent (à trancher au fil des lots, pas bloquantes pour A)

| # | Question | Défaut proposé |
|---|---|---|
| D-1 | Composition exacte du set LÉGER (§6.2) | La liste proposée, ajustée après 2 RDV réels |
| D-2 | Benchmarks initiaux des ratios (seuils d'alerte) | Valeurs du référentiel v1.0 du repo diag |
| D-3 | Qui peut créer une remise > 15 % (MANAGER suffit, ou ADMIN seul ?) | MANAGER |
| D-4 | Devis générés à l'envoi de la proposition ou à l'acceptation ? | À l'acceptation (moins de DEV-NNNN morts) |
| D-5 | Durée de validité par défaut (30 j ?) et relance à J-5 | 30 j |
| D-6 | **Question exacte (formulée le 10/09/2026)** : « sur une demi-journée de 4 h sur site co-animée par deux formateurs, le dossier se déclare-t-il en 4 h ou en 8 h ? » À poser à l'expert-comptable et à l'auditeur Qualiopi. **Réponse et SOURCE à consigner ici** dès que Laurent l'a — une réponse sans sa source ne vaut rien le jour d'un contrôle. Enjeu : c'est le nombre qui s'imprime sur la convention, l'émargement, l'attestation d'assiduité et le dossier financeur (cf. D-25 et D-25 bis). | Paramètre `TRAINER_COUNT_DEFAULT` actif à 2 (donc 8 h), note de conformité dans la convention. Non bloquant pour le lot F, qui ne produit aucun document conventionnel. |
| D-7 | Montants OPCO EP : 4 500 € (dit le 01/09) vs ≈ 4 000 € (proposition OPTIMO du 11/08) pour > 10 salariés | 4 500 en seed, modifiable dans Paramètres |
| D-8 | Volume 72 h × 42 € = 3 024 € vs plafond AGEFICE 3 000 € : que faire des 24 €/agent d'écart ? | ✅ **Tranchée avec D-11** : plafonner à 3 000, afficher l'écart en reste à charge, geste commercial en un clic dans la proposition |
| D-9 | Barème de scoring (pondérations par question → score chapitre → score global) | Barème v1 proposé avec le lot D, calibré sur 3 audits réels puis figé/versionné |
| D-10 | Page équipe : faut-il des champs d'activité par agent (RDV, mandats, exclus individuels) en plus du CA N-1 ? | v1 : CA N-1 + objectif + forces saisies par le commercial ; ratios individuels = extension du référentiel v2. **Complété le 03/09** : quand le commercial n'a rien saisi, l'objectif et la préconisation sont **proposés par une règle pure** (objectif = production N-1 × croissance visée par l'agence ; préconisation = position vs moyenne d'équipe). Ce que l'humain a saisi gagne toujours. Si rien n'est calculable, les deux colonnes sont **masquées** — pas remplies de tirets. **✅ Règle VALIDÉE par Laurent le 03/09/2026, telle quelle**, après relecture de la page équipe de DIAG-0001 (objectifs 150/119/100/53 k€ pour une croissance visée de +25 %). |

---

## Annexe A — Matière NXT coach exploitable (relevé du 01/09/2026)

- `Formation Faros/LIVRAISON_PARCOURS/` : parcours Agent Incomparable M0→M6 (livrets HTML+PDF, exercices, MANIFESTE — statut pré-livraison v0.9, trous 🔴/🟠 non levés → importer inactif).
- `Formation Faros/PROPOSITION-OPTIMO/` : la proposition de référence (structure §9.1) — cas réel groupe 27 collaborateurs, 4 structures, ~27 k€ mobilisables sans reste à charge, dates pré-positionnées, pièces à J-15.
- `Formation Faros/SA_ADM_M001_AGEFICE_*`, `SA_ACQ_M003_TROUVER_VENDEURS_*` : modules produits finis (nomenclature SA_<FAM>_M<NNN>).
- `sources/text/` (~100 transcripts de coachings réels 2025-2026) + `sources/pdf/` (conférences, livre) : la future base Coach Brain (lot H) — données clients réelles : anonymisation obligatoire avant toute ingestion.
- `youtube-links.txt`, `sources/audio|video` : idem, pipeline COACHNXT existant.
