# REQUIREMENTS — Milestone v7 RDV Plaud → proposition sur mesure (DRAFT)

**Status :** Draft de cadrage. Pas encore promu en `.planning/REQUIREMENTS.md` officiel (cf. `README.md`).
**Cadré :** 2026-05-19 par Laurent dans session Claude Code.

---

## Vision

Workflow end-to-end qui prend un transcript audio Plaud d'un RDV commercial et produit en sortie :
1. Une proposition de programme de formation 100% custom, dans un squelette Qualiopi-compliant
2. La checklist des pièces nécessaires pour monter le dossier (variant AE / salarié × Option A/B)
3. Un email draft pré-rempli, prêt à valider et envoyer par le commercial

Connecte les 4 piliers QualiOF (CRM 360° / Pack Qualiopi / Trésorerie OPCO+AGEFICE / Pré-inscriptions IA) en automatisant le maillon manquant : conversion RDV → dossier formalisé.

**Différenciateur métier #1** face à Digiforma / Dendreo / Ypareo.

---

## v7 Requirements

Total : **31 REQ-IDs**, regroupés en 10 catégories. Continuation de la numérotation existante (les paliers v5 utilisaient AUDIT-*, UX-*, RESP-*, RBAC-*, CENTRAL-*, etc.).

### 1. INGEST — Ingestion transcript Plaud

- [ ] **INGEST-01** : QualiOF s'authentifie auprès de l'API Plaud Cloud (clé API stockée chiffrée en env / Tenant)
- [ ] **INGEST-02** : QualiOF liste les enregistrements d'un compte Plaud connecté (pagination, filtre par date)
- [ ] **INGEST-03** : QualiOF récupère le transcript + résumé + métadonnées (durée, date, participants détectés) d'un enregistrement
- [ ] **INGEST-04** : Fallback si pas d'API publique Plaud — import manuel d'un fichier `.txt` / `.md` (upload UI) avec parsing des métadonnées en best-effort

### 2. MEET — Entité MeetingNote (réunion client)

- [ ] **MEET-01** : Schéma Prisma `MeetingNote` (tenantId, leadId|personId, source, transcript text, summary text, durationMin, recordedAt, createdAt, archivedAt)
- [ ] **MEET-02** : Page `/app/reunions` liste paginée des MeetingNote (filtre par Lead/Person, par date, par "convertie en proposition" oui/non)
- [ ] **MEET-03** : Page `/app/reunions/[id]` détail : transcript brut + résumé IA + bouton "générer une proposition"
- [ ] **MEET-04** : Lien bidirectionnel depuis fiche Lead/Person → ses MeetingNote (panel "Dernières réunions" sur la fiche)

### 3. RGPD — Conformité enregistrement vocal

- [ ] **RGPD-V7-01** : Champ `consentRecording` (DateTime nullable) sur `MeetingNote` — capture la date de consentement client
- [ ] **RGPD-V7-02** : Politique de purge transcript après 3 ans (conformité Qualiopi + RGPD), cron mensuel
- [ ] **RGPD-V7-03** : Transcript stocké en bucket privé + signed URL (réutilise stockage MinIO/S3 existant)

### 4. AI — Analyse besoin client via LLM

- [ ] **AI-V7-01** : Prompt système "analyse besoin client" structuré (Anthropic Claude via abstraction provider — `.env` `ANTHROPIC_MODEL`)
- [ ] **AI-V7-02** : Schéma Zod du JSON de sortie : `{ objectifsClient[], dureeSouhaitee, contraintes[], profilPro: 'AE'|'salarie'|'mixte', thematique, niveauDetecté, urgence }`
- [ ] **AI-V7-03** : Validation stricte — relance LLM si JSON non conforme au schéma (max 2 retry, sinon erreur explicite UI)
- [ ] **AI-V7-04** : Persistance de l'analyse sur `MeetingNote.analysisJson` (jsonb)

### 5. PROG — Génération programme custom Qualiopi-compliant

- [ ] **PROG-V7-01** : Squelette JSON Qualiopi figé (slots imposés : objectifs pédagogiques mesurables i02, modalités évaluation i03, prérequis i05, durée cohérente i06, adaptation PSH i20, accessibilité i22, modules avec présentiel/distanciel)
- [ ] **PROG-V7-02** : Prompt système "génération programme custom" qui CONSOMME l'analysisJson et REMPLIT le squelette (jamais l'inverse)
- [ ] **PROG-V7-03** : Validation Zod stricte du JSON output — zéro programme rejeté hors squelette
- [ ] **PROG-V7-04** : Persistance sur nouvelle entité `Proposition` (tenantId, meetingNoteId, programJson, status: 'draft'|'validated'|'converted'|'rejected')

### 6. UI — Page proposition sur mesure

- [ ] **UI-V7-01** : Page `/app/propositions/[id]` side-by-side : transcript+résumé à gauche, programme généré + email draft + checklist pièces à droite
- [ ] **UI-V7-02** : Édition humaine inline de chaque section (programme modules, durée, prix, email body, sélection pièces) — réutilise pattern SettingsSection de la Phase 7
- [ ] **UI-V7-03** : Aperçu PDF du programme rendu (réutilise pipeline Gotenberg+WeasyPrint existant `lib/pdf-render.ts`)
- [ ] **UI-V7-04** : Bouton "valider la proposition" → status='validated' + déclenche workflow conversion

### 7. PIECES — Matrice pièces nécessaires

- [ ] **PIECES-V7-01** : Helper `getRequiredPieces(profil, optionSalarie?)` retourne la checklist statique
- [ ] **PIECES-V7-02** : Matrice AE : CNI + RIB + attestation CFP + dernier diplôme (déclaratif) + années d'expérience (déclaratif)
- [ ] **PIECES-V7-03** : Matrice Salarié Option A (entreprise gère) : devis simple + RIB entreprise pour facturation
- [ ] **PIECES-V7-04** : Matrice Salarié Option B (Start Academy gère) : devis + creds OPCO ponctuels (champ note libre sur `OpcoSubmission`) + RIB + CNI stagiaire

### 8. EMAIL — Email draft pré-rempli

- [ ] **EMAIL-V7-01** : Template email "proposition sur mesure" (Markdown → HTML via marked, réutilise pattern de `lib/preinscription-reminder-template.ts`)
- [ ] **EMAIL-V7-02** : Variables nominales (nom prénom client, intitulé programme, durée, prix HT, lien tokenisé pré-inscription si déjà créée)
- [ ] **EMAIL-V7-03** : Section "Pièces à fournir" générée dynamiquement à partir de la matrice PIECES
- [ ] **EMAIL-V7-04** : Bouton "envoyer via SMTP" (réutilise `lib/mailer.ts`) + AuditLog `proposition.email.sent`

### 9. CONVERT — Conversion proposition → entités QualiOF

- [ ] **CONV-V7-01** : Sur validation, créer/lier `Lead` si absent (depuis l'analyse + email client détecté)
- [ ] **CONV-V7-02** : Créer `Person` + `Organization` + `LegalLink` selon profil détecté (pattern agent commercial = EI + Enseigne, cf. mémoire pattern)
- [ ] **CONV-V7-03** : Créer `PreEnrollment` pré-rempli (programme retenu, montant estimé, financeur cible AE→AGEFICE / Salarié→OPCO)
- [ ] **CONV-V7-04** : AuditLog convention `proposition.*` (`proposition.create`, `proposition.edit`, `proposition.validate`, `proposition.convert`, `proposition.reject`)

### 10. TEST — Tests E2E

- [ ] **TEST-V7-01** : Test E2E "1 RDV factice (transcript fixture) → analyse → programme → email" complet
- [ ] **TEST-V7-02** : Test E2E "validation proposition → Lead + Person + PreEnrollment créés"
- [ ] **TEST-V7-03** : Smoke 4 piliers — vérifier que la chaîne ne casse pas Pack 1-clic / Trésorerie / CRM / Pré-inscriptions existants

---

## Future Requirements (deferred)

Les capacités ci-dessous ont été évoquées mais reportées explicitement :

- **PLAUD-FUTURE-01** : Webhook Plaud → ingestion automatique dès qu'un enregistrement est terminé (au lieu du pull manuel INGEST-02/03). À considérer si volume > 5 RDV/semaine.
- **AUTO-EMAIL-01** : Envoi automatique de l'email après validation (sans clic humain). Reporté car risque commercial + Qualiopi (audit oblige une trace de revue humaine).
- **OPCO-AUTO-01** : Automation portail OPCO via Playwright/Puppeteer (Option B complète sans intervention humaine). Reporté car maintenance constante (chaque OPCO = portail différent + CGU à vérifier).

---

## Out of Scope (exclusions explicites)

- **Programme depuis catalogue figé** — Laurent a explicitement choisi génération 100% custom. Le matching avec `TrainingProduct` existant n'est PAS implémenté en v7.
- **Coffre creds OPCO chiffré** — Laurent a explicitement choisi "pas de stockage des identifiants OPCO", seul un champ note textuel ponctuel sur `OpcoSubmission` est ajouté (cf. PIECES-V7-04).
- **Plusieurs OF / SaaS multi-tenant actif** — v7 reste single-tenant Start Academy. La migration vers SaaS B2B reste hors scope projet (cf. `PROJECT.md` contrainte initiale).
- **Autres enregistreurs vocaux que Plaud** — pas de connecteur Otter, Fireflies, Tactiq en v7. INGEST-04 fournit juste un fallback manuel `.txt`.
- **Génération vidéo / audio de la proposition** — uniquement texte + PDF programme. Pas de pitch vidéo IA.

---

## Traceability

À remplir par le roadmapper lors de la bascule en milestone GSD active : tableau REQ-ID → Phase qui couvre.

(Les 31 REQ-IDs sont mappés sur 10 phases dans `ROADMAP-DRAFT.md`.)
