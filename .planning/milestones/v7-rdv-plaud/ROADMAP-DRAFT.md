# ROADMAP — Milestone v7 RDV Plaud → proposition sur mesure (DRAFT)

**Status :** Draft hors workflow GSD standard. À promouvoir en `.planning/ROADMAP.md` officiel lors de la bascule (cf. `README.md`).
**Cadré :** 2026-05-19.
**Numérotation phases :** continue de v5 (dernière phase v5 = Phase 12). v7 démarre à **Phase 13**.

---

## Vue d'ensemble

**10 phases** | **31 requirements mappés** | **~14-19 jours focused estimé**

| # | Phase | Goal | Requirements | Effort |
|---|---|---|---|---|
| 13 | Plaud Ingestion POC | Valider qu'on peut récupérer un transcript Plaud (API ou fallback) | INGEST-01/02/03/04 | 1-2j |
| 14 | MeetingNote schéma + UI | Créer l'entité, la persister, l'afficher | MEET-01/02/03/04 | 2j |
| 15 | RGPD enregistrement vocal | Consentement + purge + bucket privé | RGPD-V7-01/02/03 | 0.5-1j |
| 16 | Analyse besoin LLM | Extraire un JSON structuré du transcript | AI-V7-01/02/03/04 | 2-3j |
| 17 | Génération programme custom | Remplir le squelette Qualiopi à partir de l'analyse | PROG-V7-01/02/03/04 | 2-3j |
| 18 | UI proposition side-by-side | Page d'édition + aperçu PDF + validation | UI-V7-01/02/03/04 | 3j |
| 19 | Matrice pièces nécessaires | Helper + checklist dynamique | PIECES-V7-01/02/03/04 | 1j |
| 20 | Email draft pré-rempli | Template + variables + envoi SMTP | EMAIL-V7-01/02/03/04 | 1j |
| 21 | Conversion → Lead/Person/PreEnrollment | Bascule proposition validée en entités QualiOF | CONV-V7-01/02/03/04 | 1-2j |
| 22 | Tests E2E + smoke 4 piliers | Vérifier non-régression et flow complet | TEST-V7-01/02/03 | 1-2j |

---

## Phase Details

### Phase 13: Plaud Ingestion POC

**Goal :** Confirmer que QualiOF peut récupérer le transcript d'un RDV Plaud, soit via API publique Plaud Cloud, soit via fallback fichier.

**Requirements :** INGEST-01, INGEST-02, INGEST-03, INGEST-04

**Success criteria :**
1. L'utilisateur peut soit (a) connecter son compte Plaud via une clé API renseignée dans Paramètres organisme, soit (b) uploader un fichier `.txt` ou `.md` contenant un transcript
2. Le système liste les 10 derniers enregistrements Plaud d'un compte connecté (ou affiche la liste des uploads manuels)
3. Le système récupère le transcript complet + métadonnées (date, durée) d'un enregistrement sélectionné
4. Si l'API Plaud n'existe pas / n'est pas accessible : message d'erreur explicite + fallback fichier disponible

**⚠️ Phase BLOQUANTE.** Si après le POC l'API Plaud est inaccessible ET le fallback fichier est jugé insuffisant : remettre en cause la milestone (chercher un autre enregistreur, ou repousser).

---

### Phase 14: MeetingNote schéma + UI liste/détail

**Goal :** Persister les transcripts dans QualiOF avec une UI propre liée au CRM.

**Requirements :** MEET-01, MEET-02, MEET-03, MEET-04

**Success criteria :**
1. Une migration Prisma ajoute la table `MeetingNote` (tenantId, leadId|personId, source, transcript, summary, durationMin, recordedAt, archivedAt)
2. La page `/app/reunions` liste les MeetingNote avec filtres (date, lien Lead/Person, statut conversion)
3. La page `/app/reunions/[id]` affiche le transcript brut + résumé IA + bouton "générer une proposition"
4. La fiche Lead ET la fiche Person affichent un panel "Dernières réunions" liant aux MeetingNote

---

### Phase 15: RGPD enregistrement vocal

**Goal :** Mettre QualiOF en conformité RGPD + Qualiopi pour les enregistrements vocaux clients.

**Requirements :** RGPD-V7-01, RGPD-V7-02, RGPD-V7-03

**Success criteria :**
1. Lors de la création d'une MeetingNote, une case "consentement enregistrement obtenu" obligatoire avec date capturée
2. Un cron mensuel purge les MeetingNote `recordedAt > 3 ans` (transcript + métadonnées)
3. Le transcript est stocké en signed URL (bucket privé S3/MinIO), pas en clair en BDD

---

### Phase 16: Analyse besoin LLM → JSON structuré

**Goal :** Transformer un transcript en analyse exploitable (profil, objectifs, contraintes).

**Requirements :** AI-V7-01, AI-V7-02, AI-V7-03, AI-V7-04

**Success criteria :**
1. Un prompt système câblé sur Claude (Anthropic API, abstraction via `lib/llm-provider.ts`) extrait un JSON structuré d'un transcript
2. Le JSON respecte un schéma Zod `AnalysisSchema` : `{ objectifsClient[], dureeSouhaitee, contraintes[], profilPro, thematique, niveauDetecté, urgence }`
3. Si le LLM produit un JSON invalide, le système retry 2 fois puis affiche une erreur claire ("Analyse impossible, recharger le transcript ou éditer manuellement")
4. L'analyse est persistée sur `MeetingNote.analysisJson` et affichée en lecture sur la page détail

**⚠️ Dépend du câblage Anthropic API.** Si milestone v6 prod cloud (Claude provider) pas encore lancée → câbler ici en hybride local Ollama / API Claude pour ne pas bloquer.

---

### Phase 17: Génération programme custom dans squelette Qualiopi

**Goal :** Produire un programme de formation Qualiopi-compliant à partir de l'analyse besoin.

**Requirements :** PROG-V7-01, PROG-V7-02, PROG-V7-03, PROG-V7-04

**Success criteria :**
1. Un squelette JSON figé `QualiopiProgramSchema` (Zod) impose les slots i02 (objectifs mesurables) / i03 (modalités évaluation) / i05 (prérequis) / i06 (durée cohérente) / i20 (PSH) / i22 (accessibilité) + array modules avec présentiel/distanciel
2. Un prompt système "génération programme" consomme l'analysisJson et REMPLIT le squelette (jamais l'inverse) — pattern réutilisé des 5 prompts Qualiopi existants dans `lib/closure/qualiopi-prompts.ts`
3. Tout programme sorti hors-schéma est rejeté (retry 2x puis erreur)
4. Le programme est persisté sur nouvelle table `Proposition` (tenantId, meetingNoteId, programJson, status: 'draft')

---

### Phase 18: UI proposition sur mesure

**Goal :** Donner une vue éditable + aperçu PDF de la proposition avant validation.

**Requirements :** UI-V7-01, UI-V7-02, UI-V7-03, UI-V7-04

**Success criteria :**
1. La page `/app/propositions/[id]` affiche un layout side-by-side (transcript à gauche, proposition à droite) responsive
2. Chaque section (programme, email, checklist pièces) est éditable inline avec sauvegarde optimiste (pattern SettingsSection Phase 7)
3. Un bouton "Aperçu PDF" génère le programme rendu via `lib/pdf-render.ts` (Gotenberg)
4. Un bouton "Valider la proposition" passe `status='validated'` et déclenche la conversion (Phase 21)

---

### Phase 19: Matrice pièces nécessaires

**Goal :** Calculer dynamiquement la checklist des pièces selon profil détecté.

**Requirements :** PIECES-V7-01, PIECES-V7-02, PIECES-V7-03, PIECES-V7-04

**Success criteria :**
1. Helper pur `getRequiredPieces({ profilPro, optionSalarie? })` testable en isolation retourne la liste
2. Profil AE → CNI + RIB + attestation CFP + dernier diplôme (déclaratif) + années d'expérience (déclaratif)
3. Profil Salarié Option A (entreprise gère) → devis simple + RIB entreprise
4. Profil Salarié Option B (Start Academy gère) → devis + champ note "creds OPCO transmis par l'entreprise" sur `OpcoSubmission` + RIB + CNI stagiaire

---

### Phase 20: Email draft pré-rempli

**Goal :** Générer un email prêt à envoyer (avec validation humaine).

**Requirements :** EMAIL-V7-01, EMAIL-V7-02, EMAIL-V7-03, EMAIL-V7-04

**Success criteria :**
1. Template Markdown "proposition" rendu en HTML via marked, design cohérent avec les emails QualiOF existants
2. Variables nominales remplies dynamiquement : nom prénom client, intitulé programme, durée, prix HT, lien tokenisé pré-inscription si déjà créée
3. Section "Pièces à fournir" générée automatiquement à partir de la matrice PIECES (Phase 19)
4. Bouton "Envoyer via SMTP" déclenche `lib/mailer.ts` + AuditLog `proposition.email.sent` + toast confirmation

---

### Phase 21: Conversion proposition → Lead/Person/PreEnrollment

**Goal :** Basculer la proposition validée en entités QualiOF persistées (clôture du workflow).

**Requirements :** CONV-V7-01, CONV-V7-02, CONV-V7-03, CONV-V7-04

**Success criteria :**
1. À la validation, si pas de Lead existant rattaché à la MeetingNote, créer un Lead (depuis email client détecté dans l'analyse)
2. Créer `Person` + `Organization` + `LegalLink` selon profil (cf. pattern agent commercial = EI + Enseigne, 2 LegalLinks systématiques)
3. Créer `PreEnrollment` pré-rempli (programme retenu, montant estimé, financeur cible AE→AGEFICE / Salarié→OPCO)
4. AuditLog convention `proposition.*` posée : `proposition.create`, `proposition.edit`, `proposition.validate`, `proposition.convert`, `proposition.reject`

---

### Phase 22: Tests E2E + smoke 4 piliers

**Goal :** Garantir que la chaîne ne casse aucun des 4 piliers existants.

**Requirements :** TEST-V7-01, TEST-V7-02, TEST-V7-03

**Success criteria :**
1. Test E2E (Vitest + Prisma test DB) : transcript fixture → analyse → programme → email — chaîne complète sans erreur
2. Test E2E : validation proposition → Lead + Person + PreEnrollment créés correctement
3. Smoke manuel : Pack 1-clic Qualiopi (SES-0010 fixture) toujours fonctionnel, OPCO V2 toujours fonctionnel, CRM 360° toujours fonctionnel, Pré-inscriptions toujours fonctionnel
4. Build `npm run build` clean + `tsc --noEmit` clean

---

## Coverage

100% des 31 REQ-IDs sont mappés sur exactement 1 phase. Aucun requirement orphelin.

| Catégorie | REQ-IDs | Phase(s) |
|---|---|---|
| INGEST | INGEST-01..04 | 13 |
| MEET | MEET-01..04 | 14 |
| RGPD-V7 | RGPD-V7-01..03 | 15 |
| AI-V7 | AI-V7-01..04 | 16 |
| PROG-V7 | PROG-V7-01..04 | 17 |
| UI-V7 | UI-V7-01..04 | 18 |
| PIECES-V7 | PIECES-V7-01..04 | 19 |
| EMAIL-V7 | EMAIL-V7-01..04 | 20 |
| CONV-V7 | CONV-V7-01..04 | 21 |
| TEST-V7 | TEST-V7-01..03 | 22 |

---

## Dépendances inter-phases

- Phase 13 (POC API Plaud) BLOQUE toutes les autres si négatif → ré-évaluer milestone
- Phase 14 (MeetingNote) dépend de Phase 13 (besoin de transcript pour persister)
- Phase 16 (analyse LLM) dépend de Phase 14 (besoin de MeetingNote persistée)
- Phase 17 (génération programme) dépend de Phase 16 (besoin analysisJson)
- Phase 18 (UI proposition) dépend de Phase 17 (besoin de Proposition persistée)
- Phase 19/20 (pièces + email) dépendent de Phase 17 (besoin profilPro détecté) — peuvent être faites en parallèle
- Phase 21 (conversion) dépend de Phase 18 (bouton "valider")
- Phase 22 (tests E2E) dépend de Phase 21 (chaîne complète prête)

**Parallélisation possible :** Phases 19 et 20 peuvent être faites en parallèle après Phase 17.

---

## Dépendance externe : milestone v6 prod cloud (Claude API)

Le câblage Claude API (Phase 2-3 de la milestone v6) **doit être fait avant ou pendant la Phase 16** de v7. Si v6 n'est pas encore lancée au moment d'attaquer Phase 16 :
- **Option A (recommandée)** : insérer un Plan préparatoire dans Phase 16 pour câbler `lib/llm-provider.ts` en hybride local Ollama / API Claude (juste pour v7)
- **Option B** : repousser v7 après v6
- **Option C** : utiliser Ollama local pour les premiers tests (Mac de Laurent), accepter qu'en prod cloud (futur) il faudra ajuster

Décision à prendre lors de la bascule en milestone GSD active.
