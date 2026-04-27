# QualiOF — Vision long terme

> Ce fichier décrit la **cible finale** de QualiOF, après le MVP. Il sert de feuille de route et de mémoire d'intention. Pour le travail en cours, voir `MVP-SPEC.md`.

---

## Ambition

Remplacer SmartOF / Digiforma / Dendreo par un outil **Qualiopi-natif**, **multi-tenant**, **multi-utilisateurs**, qui couvre tout le cycle d'un OF : prospection → inscription → formation → facturation → bilan pédagogique → reporting BPF.

**Le différenciateur :** la résolution native du cas EI / multi-casquettes, et la génération automatique de tous les documents Qualiopi avec traçabilité (hash SHA-256, audit log, archivage MinIO).

---

## Roadmap après le MVP

### Lot 2 — Facturation + AGEFICE (4-6 semaines après MVP)

- Devis (modèle `Quote` + `QuoteLine`) avec pipeline commercial (`Opportunity`)
- Facturation complète :
  - Numérotation continue conforme code de commerce français (séquence `FAC-NNNNNN`)
  - Génération PDF + envoi auto par mail
  - Avoirs (`CreditNote`)
  - Multi-modes paiement (virement, prélèvement, CB, chèque)
  - Export FEC pour comptable
- **PDF AGEFICE pré-rempli** (pour les apprenants en EI/auto-entreprise)
  - Template PDF officiel + champs auto-remplis depuis Person + Organization (EI)
  - Génération au moment de l'inscription si OPCO = AGEFICE
- Workflows par session : moteur de règles (`AutomationRule`)
  - Ex : "À J-15, envoyer convocation + programme aux apprenants ; à J-2, envoyer rappel ; à J+1, envoyer attestation"
- BPF Cerfa 10443 : génération automatique du bilan pédagogique annuel

### Lot 3 — Suivi pédagogique + Qualiopi (4-6 semaines)

- 32 indicateurs Qualiopi trackés en feu tricolore (vert/jaune/rouge)
- Mapping indicateur ↔ preuves documentaires (chaque doc généré contribue à un ou plusieurs indicateurs)
- Préparation audit Qualiopi : export d'un dossier complet en 1 clic
- Planning FullCalendar avec détection de conflits formateur/salle
- Workflow Kanban par session avec drag & drop
- Émargement digital sur tablette/mobile via signature_pad + QR code
- Livret accueil + règlement intérieur générés automatiquement
- Bilan pédagogique de fin de session généré + envoyé au commanditaire

### Lot 4 — Signature électronique + IA avancée (3-4 semaines)

- Adapter Yousign pour signature électronique des conventions
- Adapter Anthropic Claude pour assistance IA :
  - Génération automatique du programme depuis un brief
  - Suggestions d'objectifs pédagogiques
  - Reformulation de mentions Qualiopi
  - Analyse des questionnaires de satisfaction (sentiment, thèmes récurrents)
- Vérification automatique de cohérence Qualiopi avant audit

### Lot 5 — Multi-tenant + déploiement cloud (2-3 semaines)

- Vrai isolement multi-tenant (RLS Postgres ou middleware)
- Déploiement VPS Hetzner + reverse proxy Caddy + sauvegardes auto
- Onboarding self-service pour d'autres OF
- Facturation SaaS (Stripe)

### Lot 6 — Intégrations (au fil de l'eau)

- API publique (REST + webhooks) pour interconnecter avec d'autres outils
- Connecteur Pennylane / Sage / EBP pour comptabilité
- Connecteur LinkedIn pour prospection
- Connecteur Mon Compte Formation (CPF)
- Application mobile native (React Native ou PWA installable)

---

## Schéma cible complet (rappel)

Le MVP n'implémente qu'un sous-ensemble du schéma cible. Voici les modèles supplémentaires à ajouter au fil des lots :

- **Lot 2** : `Opportunity`, `Quote`, `QuoteLine`, `Invoice`, `Payment`, `CreditNote`, `WorkflowTemplate`, `WorkflowInstance`, `AutomationRule`, `AutomationRun`
- **Lot 3** : `QualiopiIndicator`, `BpfExport`, `Questionnaire`, `QuestionnaireResponse`, enrichissement `Document` avec `signers`, `Task`, `Ticket`
- **Lot 4** : `SignatureRequest`, enrichissement `Document` avec `yousignId`
- **Lot 5** : enrichissement `Tenant` avec `subscriptionPlan`, `User` avec `mfaSecret`

---

## Stack cible (au-delà du MVP)

- Front : Next.js 14, ajout React Flow pour workflows visuels, FullCalendar pour planning
- Mobile : PWA installable + signature pad pour émargement terrain
- IA : gateway hybride (`apps/ai-gateway`) qui route entre Ollama / Claude / OpenAI selon le job
- Observabilité : OpenTelemetry + Grafana (cloud) ou Plausible pour analytics
- Sauvegardes : pg_dump quotidien vers S3 chiffré, retention 90 jours
- CI/CD : GitHub Actions, déploiement auto sur push `main`

---

## Principe directeur

**Tout doit être généré, archivé, traçable.** Aucune action manuelle qui ne laisse pas de trace dans `AuditLog`. C'est ce qui rend l'outil Qualiopi-friendly : à tout moment, on peut prouver qui a fait quoi, quand, et avec quel document.

---

## Références internes Start Academy à intégrer (lot 2+)

- Templates de mails existants (français, ton Start Academy)
- Charte graphique (couleurs, logo, typo) → à appliquer aux templates DOCX
- Formations existantes du catalogue (à importer)
- Liste OPCO + codes par secteur immobilier
- Mentions légales et CGV à insérer dans les conventions
- Personas IA Iris / Mila / Victor / Alba / Boli (potentiellement intégrés comme "assistants" dans QualiOF)
