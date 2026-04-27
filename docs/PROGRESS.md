# QualiOF — Progress log

## Palier 1 — Fondations + import SmartOF

**Statut** : code en place, à tester end-to-end après installation Docker (OrbStack).
**Branche git** : commits sur `main` avec Conventional Commits.

### Ce qui est fait

#### Mono-repo
- `pnpm` workspaces avec `apps/*` et `packages/*`
- Turbo pipelines (`build`, `dev`, `lint`, `test`)
- TypeScript strict via `tsconfig.base.json` partagé (avec `noUncheckedIndexedAccess`)
- Prettier + .gitignore + .nvmrc
- 4 commits Git (bootstrap → db schema → shared → import-smartof → web)

#### `packages/db` — Schéma Prisma (32 modèles)
Bien plus large que les 18 prévus initialement, suite à l'analyse de la base **Airtable "BDD Start Academy Refonte"** qui était une modélisation cible riche déjà éprouvée par Laurent.

| Domaine | Modèles |
|---|---|
| Auth | Tenant, User (6 rôles), AuthSession |
| Cœur EI | Person, Organization, LegalLink, Contact, BillingProfile, SensitiveData (RGPD) |
| Catalogue | TrainingProduct, TrainingModule |
| Sessions | TrainingSession, Location, SessionTrainer, SessionSlot, SessionParticipant (28 champs : checklist Qualiopi 14 booleans + workflow OPCO + workflow facturation), Attendance, TrainerAvailability |
| Pipeline | Lead, LeadAction (kanban) |
| Facturation | Invoice (numérotation continue), InvoicePayment |
| Documents | DocumentTemplate, Document, QualiopiDocCatalog (14 types par indicateur Qualiopi) |
| Email | EmailTemplate, EmailMessage |
| OPCO | OpcoCatalog (référentiel partagé) |
| Utilitaires | Task (kanban polymorphe), InternalComment, AuditLog |
| IA / intégrations | AgeficeProfile (54 champs), PedagogicalAsset, AIGenerationJob, ExternalIdentity |

Seed initial : Tenant Start Academy, admin@startacademy.fr / admin, 4 OPCO (AGEFICE/OPCO_EP/ATLAS/CPF), 14 types de docs Qualiopi par indicateur.

#### `packages/shared`
- Helpers : `isValidSiret/Siren` (Luhn + cas La Poste), `cleanSiret`, `sirenFromSiret`, `normalizeName`, `normalizeEmail`, `organizationLooksLikePerson` (heuristique cas EI), `personDedupKey`, `sessionCode`, `productCode`, `documentCode`, `invoiceNumber`
- Constantes : `mapLegalForm` (Excel → enum), `detectOpco`, `mapModality`, `QUALIOPI_INDICATORS`
- Schemas Zod : `loginSchema`, `personSchema`, `organizationSchema`, `addressSchema`
- `sharedEnv` via `@t3-oss/env-nextjs` — validation centralisée des variables d'env
- **11 tests Vitest verts**

#### Importeur SmartOF (`packages/db/scripts/import-smartof.ts`)
- Parse les 4 fichiers Excel du dossier parent
- Idempotent via `ExternalIdentity` (source=smartof, externalId=UID)
- Détection automatique du cas **EI** : si l'organisation porte le nom de l'apprenant → `LegalLink` rôle `EI_SELF`, sinon `DIRIGEANT` par défaut
- Marquage `requiresCleanup=true` pour les 26 SIRET malformés (cas La Poste géré) et les 48 emails apprenants manquants
- Données sensibles séparées dans `SensitiveData` (n° SS) — conformité RGPD
- `AgeficeProfile` pré-rempli avec 9 des 54 champs PDF mappés depuis Excel pour les 175 organisations éligibles
- Formateurs avec SIRET → création automatique d'une Organization sous-traitant + `LegalLink` rôle `FORMATEUR`

#### `apps/web` — Next.js 14
- App Router + Server Components
- Tailwind 3 + charte Start Academy (`#00527A` extrait de Qualiopi Gen)
- **Lucia v3** auth + Argon2 (adapter Prisma)
- Page `/login` avec form RHF + Zod + Server Actions
- Layout `/app` protégé (redirect si non connecté) avec :
  - Sidebar : Tableau de bord, Base contacts (Apprenants/Organisations/Formateurs), Bibliothèque (Produits/Modèles), Activité (Sessions/Inscriptions/Factures/Leads), Paramètres
  - TopBar avec avatar + déconnexion
- Dashboard avec 4 cards stats (apprenants, sessions actives, docs générés, données à corriger) + card jaune "À nettoyer" si SIRET malformés / emails manquants
- Stats fetchent directement Postgres via Server Components (pas de tRPC encore — palier 2)

### Decisions de design

- **Qualiopi Gen reste sur Supabase cloud** comme service IA stateless. Le CRM ne touche jamais aux tables `stagiaires/formations/inscriptions` Supabase ; il appelle uniquement les Edge Functions via HTTPS.
- **AGEFICE pré-rempli + téléchargement manuel** (pas d'envoi auto, pas de signature électronique).
- **Pack fin-de-formation** = 5 docs par apprenant (Attestation, Certificat, QCM, Grille obs, Analyse besoin). AGEFICE bouton séparé.
- **IA Ollama 100% locale** par défaut, calibrée sur les modèles déjà installés sur le M5 Pro 64Go : `mistral-small:24b` (rapide), `qwen3:30b-a3b` (raisonnement), `nomic-embed-text` (embeddings).
- **Modèle de données enrichi** depuis la base Airtable Refonte (Leads, Factures, OPCO workflow, Tasks, données sensibles séparées) — pas juste les référentiels SmartOF.

### Ce qui reste à valider end-to-end

À faire après installation **OrbStack** (Docker manquant sur la machine actuelle) :

1. `make up` — vérifier que Postgres + Redis + MinIO + Gotenberg démarrent
2. `pnpm --filter @qualiof/db db:migrate` — créer les tables
3. `pnpm --filter @qualiof/db db:seed` — Tenant + admin + OPCO + doc catalog
4. `pnpm --filter @qualiof/db import:smartof` — importer les 4 Excel
5. `pnpm --filter @qualiof/web dev` — login admin + voir le dashboard avec les vraies données (≈237 apprenants, 199 organisations, 13 LegalLinks EI_SELF)

### Commits

```
8dcbad2 feat(db): importeur Excel SmartOF (apprenants/entreprises/formateurs/produits + LegalLinks + AgeficeProfile)
de6a6d1 feat(shared): helpers (Luhn SIRET, normalize, codes), constantes (LegalForm, OPCO, Qualiopi), schemas Zod
da2ba7b feat(db): schema Prisma enrichi (32 modeles, alignement Airtable Refonte)
a34c938 chore: bootstrap mono-repo (pnpm + turbo + tsconfig)
```

(le commit web sera ajouté après ce log)

---

## Palier 2 — CRUD + cas EI + adapter Qualiopi Gen (à venir)

- tRPC v11 + sous-routers (person, organization, trainingProduct, trainingSession)
- TanStack Table pour les listes avec recherche full-text via `pg_trgm`
- `<LegalLinkEditor>` sur fiche Person
- ⭐ `<PersonOrOrgPicker>` : combobox + détection des LegalLinks + popup "qui paye ?"
- Wizard création TrainingSession (4 étapes)
- Adapter `IQualiopiAI` + bouton test "Générer analyse besoin" appelant `generate-analyse-besoin`
- Audit + purification des 9 Edge Functions Qualiopi Gen (rendre stateless)
- Test Playwright Pascal BIANCO scénarios A et B (validation cas EI)
- UI `AgeficeProfile` (formulaire 54 champs)

---

## Palier 3 — Doc-engine + 6 templates + AGEFICE (à venir)

- `apps/doc-engine` FastAPI + docxtpl + pypdf
- 6 templates DOCX (convention, programme, convocation, émargement, attestation, certificat)
- Mapping `agefice-2023-2024.mapping.json` versionné
- Adapter `IDocEngine` + tests
- BullMQ workers email + 4 templates MJML

---

## Palier 4 — Bouton magique fin-de-formation + IA locale (à venir)

- Worker BullMQ `closure` qui enchaîne les 5 docs par participant
- UI batch SSE + zip download
- Adapter `IAIProvider` complet (Ollama + Anthropic + QualiopiGen + Mock)
- Recherche sémantique via `pgvector` + `nomic-embed-text`
- Idempotence `AIGenerationJob`
