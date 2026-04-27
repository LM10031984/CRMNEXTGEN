# QualiOF — Spécification MVP

> **À l'intention de Claude Code.** Ce fichier est ta source de vérité. Lis-le en entier avant de coder. Pose une question avant de commencer si quelque chose est ambigu, sinon attaque le **palier 1**.

---

## 1. Contexte métier

**Client :** Start Academy, organisme de formation Qualiopi spécialisé immobilier (~10 utilisateurs internes).

**Douleurs actuelles :**
1. SmartOF lourd, pas pensé pour le cas auto-entrepreneur, génération de docs limitée.
2. Génération manuelle des conventions / attestations / certificats Qualiopi → 2-3 h par session, source d'erreurs.
3. Cas du conseiller immo qui est **à la fois** auto-entrepreneur ET salarié d'une agence (Orpi, Century 21…). Selon le contexte, on facture l'EI ou l'agence. SmartOF ne sait pas faire.

**Objectif MVP (4 semaines) :** un outil utilisable en interne pour gérer apprenants, sessions, et générer les 6 docs Qualiopi en 1 clic, avec le cas EI résolu nativement.

---

## 2. Stack figée — non négociable

| Couche | Choix |
|---|---|
| Front | Next.js 14 App Router, TypeScript **strict**, Tailwind 3, shadcn/ui |
| API | tRPC v11 (intégré au front Next.js) |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query (intégré tRPC) |
| Tables | TanStack Table |
| ORM | Prisma 5 |
| DB | PostgreSQL 16 (extensions `pgcrypto`, `uuid-ossp`, `pg_trgm`, `unaccent`) |
| Storage | MinIO (S3-compatible) |
| Queue | BullMQ + Redis |
| Auth | Lucia v3 + Argon2 |
| Email | Nodemailer SMTP (prod : adapter Resend en option) |
| Documents | Microservice Python FastAPI + `docxtpl` + Gotenberg |
| IA | Adapter pattern : Ollama (dev) ⇄ Anthropic Claude (prod) |
| Tests | Vitest (unit) + Playwright (e2e) |
| Lint | ESLint + Prettier + TypeScript strict |
| Packaging | pnpm workspaces + Turbo + Docker Compose |

**Principes de code :**
- TypeScript strict partout, pas de `any` non commenté
- Validation Zod à toutes les frontières (input tRPC, formulaires, env vars via `@t3-oss/env-nextjs`)
- Adapters pour tout ce qui est externe (IA, email, storage, signature, services Python)
- Nommage français pour les concepts métier (`apprenants`, `formateurs`, `commanditaires`), anglais pour la tech

---

## 3. Architecture mono-repo

```
qualiof/
├── apps/
│   ├── web/                    # Next.js 14 + tRPC + UI
│   ├── doc-engine/             # Python FastAPI (palier 3)
│   └── workers/                # BullMQ workers email (palier 2)
├── packages/
│   ├── db/                     # Prisma schema + migrations + seed
│   ├── shared/                 # Zod schemas, types, constantes
│   ├── ui/                     # shadcn/ui composants
│   ├── templates-qualiopi/     # 6 DOCX prioritaires
│   └── email-templates/        # 4 MJML prioritaires
├── infra/
│   └── docker-compose.yml      # déjà existant à la racine
├── docs/
│   ├── MVP-SPEC.md             # ce fichier
│   ├── VISION.md               # cible long terme
│   └── PROGRESS.md             # à créer, mis à jour fin de palier
├── .env.example                # déjà existant
├── Makefile                    # déjà existant
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. Schéma Prisma MVP

**À implémenter exactement.** Le triplet `Person` / `Organization` / `LegalLink` est le cœur de la résolution du cas EI.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// === Tenant & Auth ===
model Tenant {
  id        String   @id @default(uuid())
  name      String
  siret     String?
  numDA     String?
  rcs       String?
  users     User[]
  createdAt DateTime @default(now())
}

model User {
  id           String   @id @default(uuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  email        String   @unique
  hashedPwd    String
  firstName    String
  lastName     String
  role         UserRole @default(LECTEUR)
  authSessions AuthSession[]
  createdAt    DateTime @default(now())
}

enum UserRole { ADMIN MANAGER FORMATEUR COMPTABLE LECTEUR }

model AuthSession {
  id        String   @id
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
}

// === CŒUR : résolution du cas EI ===
model Person {
  id              String   @id @default(uuid())
  tenantId        String
  civility        String?
  firstName       String
  lastName        String
  birthName       String?
  birthDate       DateTime?
  email           String?
  phone           String?
  personalAddress Json?
  educationLevel  String?
  bpfDefaultStatus String?
  rgpdConsentAt   DateTime?
  legalLinks      LegalLink[]
  participations  SessionParticipant[]
  trainerSessions SessionTrainer[]
  attendances     Attendance[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([tenantId, lastName, firstName])
}

model Organization {
  id            String   @id @default(uuid())
  tenantId      String
  legalName     String
  legalForm     LegalForm
  siren         String?
  siret         String?
  naf           String?
  vatNumber     String?
  address       Json?
  phone         String?
  email         String?
  opcoCode      String?
  logoUrl       String?
  legalLinks    LegalLink[]
  sponsoredParticipations SessionParticipant[]
  billingProfiles BillingProfile[]
  createdAt     DateTime @default(now())
  @@index([tenantId, legalName])
  @@index([tenantId, siren])
}

enum LegalForm {
  SAS SARL SASU EURL SA EI EIRL AUTO_ENTREPRENEUR
  ASSOCIATION PARTICULIER AUTRE
}

model LegalLink {
  id             String   @id @default(uuid())
  personId       String
  person         Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role           LinkRole
  function       String?
  startDate      DateTime?
  endDate        DateTime?
  isPrimary      Boolean  @default(false)
  @@unique([personId, organizationId, role])
}

enum LinkRole { DIRIGEANT SALARIE EI_SELF ALTERNANT STAGIAIRE CONTACT FINANCEUR_CONTACT }

model BillingProfile {
  id             String   @id @default(uuid())
  tenantId       String
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id])
  invoiceName    String
  address        Json
  legalMentions  String?
  paymentMethod  String?
  createdAt      DateTime @default(now())
}

// === Catalogue ===
model TrainingProduct {
  id              String   @id @default(uuid())
  tenantId        String
  code            String
  title           String
  durationHours   Int
  modality        Modality
  prerequisites   String?
  targetAudience  String?
  objectives      Json
  programMd       String
  pedagogicalMethods String?
  evaluationMethods  String?
  accessibility   String?
  priceHT         Decimal  @db.Decimal(10,2)
  vatRate         Decimal  @default(0) @db.Decimal(5,2)
  version         Int      @default(1)
  isActive        Boolean  @default(true)
  modules         TrainingModule[]
  trainingSessions TrainingSession[]
  @@unique([tenantId, code])
}

enum Modality { PRESENTIEL DISTANCIEL MIXTE ELEARNING }

model TrainingModule {
  id           String @id @default(uuid())
  productId    String
  product      TrainingProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  order        Int
  title        String
  contentMd    String
  durationMin  Int
}

// === Sessions ===
model TrainingSession {
  id            String   @id @default(uuid())
  tenantId      String
  productId     String
  product       TrainingProduct @relation(fields: [productId], references: [id])
  code          String   @unique
  status        SessionStatus
  startDate     DateTime
  endDate       DateTime
  locationId    String?
  location      Location? @relation(fields: [locationId], references: [id])
  modality      Modality
  capacityMin   Int      @default(1)
  capacityMax   Int      @default(12)
  language      String   @default("fr")
  internalNotes String?
  participants  SessionParticipant[]
  trainers      SessionTrainer[]
  slots         SessionSlot[]
  documents     Document[]
  createdAt     DateTime @default(now())
}

enum SessionStatus { DRAFT PLANNED VALIDATED IN_PROGRESS COMPLETED CANCELLED }

model Location {
  id       String  @id @default(uuid())
  tenantId String
  name     String
  address  Json
  capacity Int?
  sessions TrainingSession[]
}

model SessionTrainer {
  id        String  @id @default(uuid())
  sessionId String
  session   TrainingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  personId  String
  person    Person  @relation(fields: [personId], references: [id])
  role      String
  dailyRate Decimal? @db.Decimal(10,2)
}

model SessionSlot {
  id          String   @id @default(uuid())
  sessionId   String
  session     TrainingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  date        DateTime
  startTime   String
  endTime     String
  halfDay     String   // "morning" | "afternoon"
  attendances Attendance[]
}

model SessionParticipant {
  id              String   @id @default(uuid())
  sessionId       String
  session         TrainingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  personId        String
  person          Person   @relation(fields: [personId], references: [id])
  // 👇 LE point de pivot. C'est CETTE org qui paye et qui apparaît sur la convention.
  sponsorOrgId    String
  sponsorOrg      Organization @relation(fields: [sponsorOrgId], references: [id])
  billingProfileId String?
  priceHT         Decimal  @db.Decimal(10,2)
  enrollmentStatus String  @default("pre_enrolled")
  bpfStatus       String?
  @@unique([sessionId, personId])
}

model Attendance {
  id           String   @id @default(uuid())
  slotId       String
  slot         SessionSlot @relation(fields: [slotId], references: [id], onDelete: Cascade)
  personId     String
  person       Person   @relation(fields: [personId], references: [id])
  signatureUrl String?
  signedAt     DateTime?
  ip           String?
  qrToken      String?  @unique
  @@unique([slotId, personId])
}

// === Documents ===
model DocumentTemplate {
  id        String  @id @default(uuid())
  tenantId  String
  type      DocType
  name      String
  fileUrl   String
  format    String  // "docx"
  variables Json
  version   Int     @default(1)
  documents Document[]
}

enum DocType {
  CONVENTION
  PROGRAMME
  CONVOCATION
  EMARGEMENT
  ATTESTATION_FIN
  CERTIFICAT_REALISATION
  CUSTOM
}

model Document {
  id           String  @id @default(uuid())
  tenantId     String
  templateId   String?
  template     DocumentTemplate? @relation(fields: [templateId], references: [id])
  entityType   String  // "session" | "participant"
  entityId     String
  pdfUrl       String
  hashSha256   String  // traçabilité Qualiopi
  status       String  @default("generated")
  sessionId    String?
  session      TrainingSession? @relation(fields: [sessionId], references: [id])
  createdAt    DateTime @default(now())
  @@index([tenantId, entityType, entityId])
}

// === Email ===
model EmailTemplate {
  id        String @id @default(uuid())
  tenantId  String
  code      String @unique
  subject   String
  bodyMjml  String
  variables Json
}

model EmailMessage {
  id            String   @id @default(uuid())
  tenantId      String
  templateId    String?
  fromEmail     String
  toEmails      Json
  subject       String
  bodyHtml      String
  status        String   // "queued" | "sent" | "bounced"
  sentAt        DateTime?
  relatedEntity String?
  createdAt     DateTime @default(now())
}

// === Audit ===
model AuditLog {
  id        String   @id @default(uuid())
  tenantId  String
  userId    String?
  entity    String
  entityId  String
  action    String
  diff      Json
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())
  @@index([tenantId, entity, entityId])
}
```

---

## 5. Cas EI — scénario Pascal BIANCO bout en bout

Ce scénario doit fonctionner après le seed. Il sert de **test d'acceptation** du modèle de données.

### Setup (seed)

- **Person** `pascal-bianco` : Pascal BIANCO, né en 1972, email perso `pascal@gmail.com`
- **Organization A** `bianco-invest-sas` : SAS BIANCO INVEST, SIREN 123456789, OPCO ATLAS
- **Organization B** `bianco-pascal-ei` : "BIANCO Pascal — EI", LegalForm `AUTO_ENTREPRENEUR`, SIREN 987654321, OPCO AGEFICE
- **LegalLink 1** : `pascal-bianco` × `bianco-invest-sas` × `DIRIGEANT`, `isPrimary: false`
- **LegalLink 2** : `pascal-bianco` × `bianco-pascal-ei` × `EI_SELF`, `isPrimary: true`

### Inscription scénario A — Pascal s'inscrit en tant que dirigeant SAS

1. User clique "Inscrire un apprenant" sur la session
2. Le `<PersonOrOrgPicker>` s'ouvre
3. User cherche "Pascal", sélectionne la `Person` Pascal BIANCO
4. Le composant détecte 2 `LegalLink` actifs et propose :
   - "Inscrire en tant que **DIRIGEANT** de **SAS BIANCO INVEST**" (OPCO ATLAS)
   - "Inscrire en tant que **EI_SELF** de **BIANCO Pascal — EI**" (OPCO AGEFICE)
5. User choisit le 1er → `SessionParticipant.sponsorOrgId = bianco-invest-sas`
6. La convention générée porte SAS BIANCO INVEST en commanditaire/payeur

### Inscription scénario B — Pascal s'inscrit en tant qu'auto-entrepreneur

Mêmes étapes mais user choisit le 2e → `sponsorOrgId = bianco-pascal-ei`
La convention générée porte BIANCO Pascal — EI en commanditaire, et le PDF AGEFICE pourra être pré-rempli (lot 2).

### Test d'acceptation Playwright (à coder en palier 2)

```ts
test("EI : Pascal peut s'inscrire avec deux casquettes différentes", async ({ page }) => {
  // ... seed ...
  // Inscription scénario A
  await inscrire(page, "Pascal BIANCO", "DIRIGEANT de SAS BIANCO INVEST");
  await expect(page.getByText("SAS BIANCO INVEST")).toBeVisible();
  // Inscription scénario B sur une autre session
  await inscrire(page, "Pascal BIANCO", "EI_SELF de BIANCO Pascal — EI");
  await expect(page.getByText("BIANCO Pascal — EI")).toBeVisible();
});
```

---

## 6. Palier 1 — Fondations (semaine 1)

### Objectif
Avoir un mono-repo qui boot, une DB seedée, une page de login qui marche, et un layout sidebar inspiré SmartOF.

### Tâches

1. **Init mono-repo**
   - `pnpm init` à la racine
   - `pnpm-workspace.yaml` avec `apps/*` et `packages/*`
   - `turbo.json` avec pipelines `build`, `dev`, `lint`, `test`
   - TypeScript strict via `tsconfig.base.json` partagé

2. **Package `packages/db`**
   - Prisma schema ci-dessus
   - Migration initiale `init`
   - Seed (`prisma/seed.ts`) : 1 tenant Start Academy, 1 admin (`admin@startacademy.fr` / `admin`), Pascal BIANCO + ses 2 organizations + ses 2 LegalLinks, 4 autres apprenants, 3 organisations clientes (Orpi, Century 21, agence indé), 2 sessions de démo (1 future + 1 passée), 2 produits de formation, 6 templates DOCX (placeholders, vrais DOCX en palier 3)

3. **Package `packages/shared`**
   - Types TS partagés
   - Zod schemas par entité (`personSchema`, `organizationSchema`, etc.)
   - Constantes Qualiopi, BPF, NAF, OPCO (énumérations)
   - Helpers : validation SIRET (algo Luhn), formatage TVA, génération codes session/doc

4. **App `apps/web`**
   - Next.js 14 App Router scaffolding
   - Tailwind + shadcn/ui setup (composants à scaffolder à la demande, pas tout d'un coup)
   - tRPC v11 (router racine + sous-routers vides pour l'instant)
   - Lucia Auth v3 + Argon2
   - Page `/login` (form RHF + Zod)
   - Middleware tRPC qui valide la session
   - Layout `/app` avec sidebar :
     ```
     📇 Base contacts
        - Apprenants
        - Organisations
        - Formateurs
     📚 Bibliothèque
        - Produits de formation
        - Modèles de documents
     📅 Sessions
     ⚙️ Paramètres
     ```
   - Page d'accueil `/app` avec 4 cards stats (nb apprenants, nb sessions actives, nb sessions à venir, nb docs générés)

### Definition of Done palier 1

- [ ] `make up` lance Docker, `pnpm dev` lance Next.js sur :3000
- [ ] `pnpm --filter db prisma migrate dev` crée toutes les tables
- [ ] `pnpm --filter db prisma db seed` charge les données + Pascal BIANCO en double
- [ ] Login `admin@startacademy.fr` / `admin` redirige vers `/app`
- [ ] Layout sidebar visible, 4 cards stats remplies depuis la DB
- [ ] `pnpm test` passe (au moins 1 test sur le seed)
- [ ] `pnpm lint` passe sans warning
- [ ] Mise à jour `docs/PROGRESS.md` avec récap palier 1

---

## 7. Palier 2 — Données + UI (semaine 2)

### Objectif
CRUD complet sur les 4 entités principales, et le `<PersonOrOrgPicker>` opérationnel.

### Tâches

1. **CRUD Persons** — liste TanStack Table (recherche full-text via `pg_trgm`), formulaire création/édition Zod + RHF, vue détail avec onglets (infos / liens juridiques / sessions / documents), suppression soft-delete
2. **CRUD Organizations** — idem, avec validation SIRET via algo Luhn, lookup automatique via API INSEE/Sirene (optionnel, à scaffolder mais peut être désactivé)
3. **Composant `<LegalLinkEditor>`** — sur la fiche Person, permet d'ajouter/retirer des liens vers des Organizations avec un rôle, et de marquer un lien comme `isPrimary`
4. **Composant `<PersonOrOrgPicker>`** ⭐ pièce maîtresse :
   - Combobox unique
   - Tape "Pascal" → liste les `Person` matching
   - Quand on sélectionne, popup qui montre les LegalLinks et demande "qui est le commanditaire ?"
   - Renvoie `{ personId, sponsorOrgId, role }`
5. **CRUD TrainingProduct + TrainingModule** — éditeur Markdown TipTap pour `programMd` et `contentMd`
6. **CRUD TrainingSession** — wizard 4 étapes : produit → dates/lieu → apprenants (via PersonOrOrgPicker) + formateurs → récap. À l'étape 2, génère automatiquement les `SessionSlot` selon les dates et la durée du produit
7. **Page liste session** — TanStack Table avec filtres statut, dates, formateur

### Definition of Done palier 2

- [ ] CRUD complet sur les 4 entités, accessible depuis la sidebar
- [ ] Le scénario Pascal BIANCO marche (test Playwright écrit + vert)
- [ ] On peut créer une session de A à Z avec Pascal en EI puis avec Pascal en SAS
- [ ] Tous les formulaires valident avec Zod, erreurs affichées proprement
- [ ] Mise à jour `docs/PROGRESS.md`

---

## 8. Palier 3 — Génération de docs (semaines 3-4)

### Objectif
Le truc qui fait gagner du temps à Laurent : 1 clic = convention + programme + convocation générés et archivés.

### Tâches

1. **Microservice `apps/doc-engine`** (Python FastAPI)
   - Endpoints : `POST /render/docx`, `POST /render/pdf`, `POST /render/full`, `POST /variables/extract`
   - Utilise `docxtpl` pour le remplissage Jinja, Gotenberg pour DOCX→PDF/A
   - Auth simple via header `X-Internal-Token` partagé dans `.env`
   - Dockerfile + lancement via docker-compose

2. **6 templates DOCX dans `packages/templates-qualiopi/`**
   - `convention-formation.docx`
   - `programme-formation.docx`
   - `convocation.docx`
   - `feuille-emargement-demi-journee.docx`
   - `attestation-fin-formation.docx`
   - `certificat-realisation.docx`

   Variables Jinja standardisées (voir section 9).

3. **Adapter `IDocEngine` côté Node**
   - Interface TypeScript dans `packages/shared/adapters/`
   - Implémentation HTTP qui call `apps/doc-engine`
   - Mock implementation pour tests unitaires

4. **UI `/app/sessions/[id]/documents`**
   - Liste des docs déjà générés pour cette session (avec badge statut, hash SHA-256, date)
   - Bouton "Générer un document" → modale :
     - Choisir un template
     - Choisir une cible (toute la session, un participant)
     - Preview des variables qui vont être remplies
     - Bouton "Générer" → loader → résultat avec lien download + envoi par mail
   - Sur chaque doc : actions "Télécharger PDF", "Renvoyer par mail", "Voir le hash"

5. **Worker BullMQ pour les emails** (`apps/workers/`)
   - Queue `emails`
   - Job `sendEmailWithAttachment` : récupère doc depuis MinIO, envoie via Nodemailer, log dans `EmailMessage`

6. **4 templates MJML dans `packages/email-templates/`**
   - `convocation.mjml` (envoyé J-15 avec convocation + programme en PJ)
   - `relance-emargement.mjml`
   - `fin-formation.mjml` (envoyé J+1 avec attestation + certif)
   - `notification-interne.mjml` (pour les admins)

7. **Branchement outil questionnaires existant**
   - Ajout `QUESTIONNAIRE_SERVICE_URL` dans `.env`
   - Adapter `IQuestionnaireGenerator` HTTP
   - Bouton "Envoyer questionnaire à chaud" sur fiche session → call HTTP → email envoyé
   - Pas d'UI dédiée pour le moment, juste le déclenchement

### Definition of Done palier 3

- [ ] Sur une session, je clique "Générer convention" → PDF dans MinIO en moins de 5s
- [ ] Le PDF contient les bonnes mentions légales L.6353-1
- [ ] Hash SHA-256 enregistré et vérifiable
- [ ] Email automatique avec PJ part bien (testé avec Mailhog en dev)
- [ ] Le branchement questionnaires call bien le service externe
- [ ] Mise à jour `docs/PROGRESS.md` avec démo vidéo si possible

---

## 9. Variables Jinja standardisées pour les templates DOCX

Tous les templates reçoivent ce contexte :

```python
{
  "tenant": {
    "name": "Start Academy",
    "siret": "...",
    "num_da": "...",
    "address": {...},
    "rcs": "..."
  },
  "session": {
    "code": "SES-2026-001",
    "title": "Stratégie d'acquisition de mandats",
    "start_date": "2026-05-12",
    "end_date": "2026-05-13",
    "duration_hours": 14,
    "modality": "PRESENTIEL",
    "location": {"name": "...", "address": {...}}
  },
  "product": {
    "title": "...",
    "objectives": ["...", "..."],
    "target_audience": "...",
    "prerequisites": "...",
    "program_md": "...",
    "pedagogical_methods": "...",
    "evaluation_methods": "...",
    "accessibility": "..."
  },
  "participant": {
    "person": {"first_name": "Pascal", "last_name": "BIANCO", ...},
    "sponsor_org": {"legal_name": "...", "siret": "...", "address": {...}, "opco": "..."},
    "billing": {"invoice_name": "...", "address": {...}},
    "price_ht": "1200.00"
  },
  "trainers": [
    {"first_name": "Jean-Guy", "last_name": "...", "function": "Formateur principal"}
  ],
  "slots": [
    {"date": "2026-05-12", "morning": {"start": "09:00", "end": "12:30"}, "afternoon": {...}}
  ],
  "generated_at": "2026-04-27",
  "doc_code": "CONV-2026-0001"
}
```

---

## 10. Conventions de code

- Commits Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- Branche par palier (`palier-1-fondations`, `palier-2-crud`, `palier-3-docs`)
- 1 PR à la fin de chaque palier, merge sur `main` après self-review
- Pas de fichier > 400 lignes : si ça déborde, c'est qu'il faut splitter
- Tests obligatoires : 1 test par procédure tRPC, 1 e2e par parcours utilisateur critique
- Pas de `console.log` en prod, utiliser `pino`
- Logs structurés JSON
- Erreurs en français côté UI, anglais côté logs

---

## 11. Hors scope MVP — à ne PAS coder

Pour éviter le scope creep, voici ce qu'on **ne** fait **pas** :

- ❌ Workflows Kanban / automatisations conditionnelles
- ❌ Signature électronique Yousign
- ❌ Planning FullCalendar avec détection conflits
- ❌ Facturation, devis, avoirs, FEC
- ❌ BPF Cerfa 10443
- ❌ PDF AGEFICE
- ❌ 32 indicateurs Qualiopi en feu tricolore
- ❌ Tickets, Tasks
- ❌ Multi-tenant complet (1 tenant suffit pour le MVP)
- ❌ 2FA TOTP (login simple OK pour le MVP interne)
- ❌ UI questionnaires de satisfaction (puisque l'outil existe à part)
- ❌ App mobile / PWA / signature pad pour émargement (on fera ça quand le MVP tourne)

Tout ça est documenté dans `docs/VISION.md` et sera attaqué après que le MVP soit en prod et utilisé.

---

## 12. Si tu bloques

- **Question métier ambiguë** → arrête-toi et demande à Laurent (mentionne précisément la ligne du fichier qui pose problème)
- **Dépendance manquante** → propose une alternative équivalente avant d'installer
- **Choix de design UI** → demande un mockup ou utilise les patterns shadcn/ui standards
- **Erreur de compile/runtime** → debug avant de demander, partage logs si tu demandes

Bon code 🚀
