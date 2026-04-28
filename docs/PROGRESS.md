# QualiOF — Progress log

## ✅ Palier 1 — Fondations + import SmartOF (TERMINÉ)

- Mono-repo pnpm + Turbo + TS strict (12 commits)
- Schéma Prisma 32 modèles (Person × Organization × LegalLink + Leads + Factures + OPCO + Tasks + RGPD)
- Importeur Excel SmartOF → 237 apprenants, 199 organisations, 250 LegalLinks (158 EI_SELF), 19 produits, 5 formateurs, 140 AgeficeProfile pré-remplis
- Lucia v3 auth + Argon2
- Layout sidebar + dashboard 4 cards
- Tests Vitest verts (helpers Luhn, normalize, etc.)

## ✅ Palier 2.1 — CRUD lecture + sessions importées (TERMINÉ)

- 4 listes opérationnelles : Apprenants / Organisations / Produits / Formateurs (recherche, pagination, filtres EI/cleanup)
- Fiches détail pour chaque entité
- Importeur sessions Excel SmartOF → 77 sessions + 231 inscriptions (84% sponsor EI, 14 multi-casquettes résolus)
- Pages Sessions liste + détail avec mise en évidence cas EI multi-casquettes
- Dashboard piloté : CA prévisionnel, CA 30 jours, à facturer, mini chart sessions×CA par mois, top 5 commanditaires, top 5 formations
- Page formateur dédiée (sessions animées, dispos, structure sous-traitance)
- Placeholders propres pour Inscriptions / Factures / Leads / Templates

## 🚧 Palier 2.2 — Édition + cas EI interactif (EN COURS)

- ✅ `<PersonOrOrgPicker>` ⭐ — combobox + popup multi-casquettes (cas EI Pascal BIANCO)
- ✅ `<LegalLinkEditor>` — ajout/retrait/marquer-principal sur fiche apprenant
- ✅ `<AddParticipantDialog>` — bouton "Inscrire un apprenant" sur fiche session
- ✅ Page `/app/sessions/rattrapage` ⭐ — détecte les 81 inscriptions Excel non importées, propose les meilleurs candidats par similarité de nom, 1 clic pour valider
- ✅ Mode dark macOS forcé en clair (color-scheme: light only)

### Reste à faire pour finir palier 2.2
1. **Test côté user** : valider les 81 inscriptions manquantes via /app/sessions/rattrapage
2. **Page `/app/financeurs`** dans la sidebar (OPCO/FAF — délais, plafonds, orgs affiliées, CA cumulé par OPCO)
3. **Audit UI** : retirer toute mention AGEFICE/OPCO directe de la fiche `Person`. AGEFICE est un attribut d'**Organization**, jamais de Person. Passer par chaine `legalLink → org → opco`.

## 🔮 Palier 2.3 — Wizard création session (À VENIR)

- Wizard 4 étapes : Produit → Dates/lieu/formateur → Participants (via PersonOrOrgPicker) → Récap
- Génération auto des SessionSlot selon dates et durée
- CRUD édition Person/Organization/Product (formulaires complets via React Hook Form + Zod)

## 🔮 Palier 3 — Doc-engine + AGEFICE + module pré-inscription IA

### Module pré-inscription IA (priorité forte demandée par user)
- Page `/app/preinscriptions` avec drag-drop CNI/RIB/Attestation URSSAF
- Pipeline : pypdf/pdfminer (extraction texte) + Tesseract OCR (scans) + Ollama qwen3:30b-a3b (extraction structurée JSON)
- Détection auto type doc (CNI / RIB / URSSAF) par mots-clés
- Pré-remplit `Person` + `SensitiveData` (CNI), `BillingProfile` (RIB), `AgeficeProfile` de l'**Organization EI** (URSSAF)
- Archivage PDFs dans MinIO + liens sur la fiche

### Doc-engine FastAPI (existait déjà dans le plan original)
- Microservice Python : `/render/docx`, `/render/pdf`, `/render/agefice` (54 champs PDF officiel via pypdf), `/variables/extract`
- 6 templates DOCX Qualiopi : convention, programme, convocation, émargement, attestation, certificat
- Mapping `agefice-2023-2024.mapping.json` versionné

### Bouton AGEFICE sur fiche inscription
- Logique : participant.sponsorOrg.opcoCode = AGEFICE && participant.sponsorOrg.ageficeProfile != null
- Pré-remplit avec chaîne : Person + sponsorOrg + ageficeProfile.paFields + tenant + session

## 🔮 Palier 4 — Bouton magique pack fin-de-formation

- Worker BullMQ `closure` : 5 docs par apprenant (Attestation + Certificat + QCM + Grille obs + Analyse besoin)
- Adapter `IAIProvider` complet (Ollama + Anthropic + QualiopiGen + Mock)
- Recherche sémantique apprenants/orgs via pgvector + nomic-embed-text
- UI batch SSE + zip download

## 🔮 Lot 2 — Module Factures

- Numérotation continue conforme code commerce (FAC-NNNNNN)
- Génération PDF + envoi mail
- Avoirs, multi-modes paiement, export FEC
- Workflow OPCO : pré-accord → validé → remboursement reçu (champs déjà dans SessionParticipant)

## Commits récents
```
479dc3f fix(web): badges rattrapage tronqués + mode dark macOS forcé en clair
21eb24a fix(web): chemin Excel rattrapage (3 niveaux up depuis apps/web/, pas 2)
66e0f15 feat(web): page rattrapage inscriptions + fix server action compile
4f8e233 feat(web): PersonOrOrgPicker + LegalLinkEditor + bouton 'Inscrire un apprenant'
27594b8 feat(web): dashboard piloté avec CA + fiche formateur dédiée
1af5105 feat(web): page Sessions liste + détail (visualisation cas EI multi-casquettes)
3118f2c feat(db): importeur sessions SmartOF + résolution cas EI multi-casquettes
06fd4ca feat(web): listes apprenants/organisations/produits/formateurs + placeholders
8dcbad2 feat(db): importeur Excel SmartOF
de6a6d1 feat(shared): helpers + constantes + schemas Zod
da2ba7b feat(db): schema Prisma enrichi (32 modèles)
a34c938 chore: bootstrap mono-repo
```

## Commande de relance

```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files/"
make up                                     # Postgres + Redis + MinIO + Gotenberg
pnpm --filter @qualiof/web dev              # Next.js (port libre auto)
```

Login : `admin@startacademy.fr` / `admin` · URL : http://localhost:3002/app (ou 3000 si libre)
