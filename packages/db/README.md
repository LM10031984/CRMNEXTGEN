# @qualiof/db

Schéma Prisma + client partagé pour QualiOF.

## Modèles (32)

### Cœur métier
- **Tenant / User / AuthSession** — multi-utilisateurs (5 rôles : ADMIN, MANAGER, FORMATEUR, COMMERCIAL, COMPTABLE, LECTEUR)
- **Person** — apprenants, formateurs, dirigeants. Le rôle vient de **LegalLink**.
- **Organization** — entreprises, EI, agences. Lié à un OPCO via **OpcoCatalog**.
- **LegalLink** — relations Person↔Organization avec rôle (`EI_SELF`, `DIRIGEANT`, `SALARIE`, `FORMATEUR`…). Résout nativement le cas EI multi-casquettes (Pascal BIANCO).
- **Contact** — interlocuteur dans une Organization (RH, comptable…). Distinct d'un Person apprenant.
- **SensitiveData** — données RGPD séparées (n° SS, pièce d'identité), 1:1 Person.
- **BillingProfile** — profils de facturation par Organization.

### Catalogue & sessions
- **TrainingProduct / TrainingModule** — catalogue de formations.
- **TrainingSession / Location / SessionTrainer / SessionSlot** — sessions planifiées.
- **SessionParticipant** — inscription riche (cas EI via `sponsorOrgId`, checklist Qualiopi 14 booleans, workflow OPCO `FinancingStatus`, workflow facturation `PaymentStatus`).
- **Attendance** — émargement par créneau.
- **TrainerAvailability** — dispos formateurs pour planning.

### Pipeline commercial
- **Lead / LeadAction** — pipeline Kanban (`NEW → CONTACTED → QUALIFIED → PROPOSAL_SENT → NEGOTIATION → WON/LOST`).

### Facturation
- **Invoice / InvoicePayment** — facturation avec numérotation continue, suivi paiements multi-modes.

### Documents Qualiopi
- **QualiopiDocCatalog** — référentiel des 14 types de docs avec indicateur Qualiopi associé.
- **DocumentTemplate / Document** — templates DOCX/PDF + docs générés (avec hash SHA-256).

### Email
- **EmailTemplate / EmailMessage** — templates MJML + traçabilité des envois.

### Référentiels
- **OpcoCatalog** — AGEFICE / OPCO_EP / ATLAS / CPF avec délais, plafonds, docs requis.

### Utilitaires CRM
- **Task** — tâches Kanban polymorphes (rattachables session/lead/inscription).
- **InternalComment** — fil de discussion polymorphe.
- **AuditLog** — toutes les actions critiques.

### IA & intégrations
- **AgeficeProfile** — 1:1 Organization (54 champs PDF AGEFICE pré-remplis).
- **PedagogicalAsset** — sortie unifiée des Edge Functions Qualiopi Gen (analyse besoin, QCM, grille, déroulé, compétences).
- **AIGenerationJob** — trace + idempotence des appels IA.
- **ExternalIdentity** — mapping vers IDs SmartOF / Qualiopi Gen / Airtable.

## Commandes

```bash
pnpm --filter @qualiof/db db:generate     # générer le client Prisma
pnpm --filter @qualiof/db db:migrate      # créer une migration
pnpm --filter @qualiof/db db:seed         # seed initial (tenant, admin, OPCO, doc catalog)
pnpm --filter @qualiof/db db:studio       # ouvrir Prisma Studio
pnpm --filter @qualiof/db db:reset        # reset complet (DROP DATABASE)
```

## Inspirations

Le schéma combine :
1. La spec MVP-SPEC.md §4 (modèle Person × Organization × LegalLink — le cœur).
2. La base Airtable "BDD Start Academy Refonte" (Leads, Factures, OPCO workflow, checklist Qualiopi par inscription, Tasks, données sensibles séparées).
3. Les exports SmartOF pour les champs descriptifs (BPF, NAF, expérience pro, niveau de diplôme).
