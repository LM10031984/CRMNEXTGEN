# Audit complet QualiOF — 12 août 2026

**Auditeur** : Claude (boucle d'audit automatisée en sandbox cloud isolée)
**Base auditée** : snapshot du repo `files/` du 12/08/2026 ~15h20 (avant ton commit `a61a8e4` de 18h04)
**Environnement de test** : stack complète reconstruite en sandbox — PostgreSQL 16 (migrations SQL + seed), Redis, S3 local (mock MinIO), WeasyPrint 60.2 réel, moteur Chromium équivalent Gotenberg, workers closure + OCR. IA volontairement absente → chaîne de secours stub exercée. Données réelles : tes 3 exports SmartOF du 12/08 importés via `sync-smartof-1208.ts` (272 apprenants, 234 entreprises, 28 produits, 84 sessions, 322 inscriptions) + 5 formateurs recréés avec leurs UID SmartOF.

---

## Verdict global

**L'outil est fonctionnel de bout en bout sur ses 4 piliers.** J'ai déroulé le cycle de vie complet d'une session créée via le wizard (SES-0106, 2 apprenantes réelles) : création → 10 docs avant-formation → statuts → pack fin de formation 16/16 → facturation → encaissement → avoir — et le circuit pré-inscription publique jusqu'à la conversion en apprenant + EI + lien EI_SELF. **7 bugs corrigés en route** (dont 1 bloquant build, 2 bloquants métier), tout re-testé après correction.

### Portes de qualité — état final

| Porte | Avant audit | Après audit |
|---|---|---|
| `pnpm build` (turbo) | ❌ cassé (cycle shared↔db) | ✅ |
| `pnpm lint` | ✅ | ✅ |
| Tests unitaires/intégration | ❌ 1331 dont erreurs non gérées + 1 fail | ✅ 1331 verts (10 db + 113 shared + 1208 web) |
| E2E Playwright | ❌ 4 échecs (2 env, 1 données, 1 image) | ✅ 21 verts + 2 skips conditionnels documentés |

---

## Bugs corrigés (livrés dans ton repo — `git diff` pour tout revoir)

### P0/P1 — bloquants

1. **`pnpm build` cassé — cycle de dépendances `@qualiof/shared` ↔ `@qualiof/db`** (turbo 2.9.6 refuse). `packages/shared` n'importait `@qualiof/db` que pour 3 enums Prisma. → Import direct `@prisma/client` dans 4 fichiers + dépendance `@prisma/client` dans shared, dépendance `@qualiof/db` retirée. Le build monorepo refonctionne (Vercel n'était pas affecté, ton poste oui).
2. **Formulaire public de pré-inscription : upload impossible en mode local/MinIO.** `createSignedUploadUrl` jetait « Supabase uniquement » → aucune pièce (CNI/RIB/CFP) ne pouvait être déposée hors cloud. → Presigned PUT S3-compatible ajouté (`@aws-sdk/s3-request-presigner`), parité de providers rétablie, test unitaire mis à jour, flux public re-testé de bout en bout (soumission réussie, OCR gracieux, conversion OK).
3. **Formulaire public : champs « Niveau d'étude » et « Dernier diplôme obtenu » INVERSÉS** (`public-form.tsx` bindait le select de niveau sur `diploma` et le texte libre sur `educationLevel`). Conséquence : niveau d'étude en texte libre → pré-remplissage AGEFICE (liste fermée de diplômes) cassé pour tout apprenant converti. → Bindings remis à l'endroit.
4. **Mode de financement non modifiable après création** : seul le wizard le posait ; aucun UI ni action pour corriger ensuite (refus OPCO → autofinancement, bascule AGEFICE… cas quotidiens d'OF). → `updateParticipant` étendu (`financingMode`, validation enum) + select ajouté au dialog d'édition d'inscription.
5. **Dialog « Éditer l'inscription » jamais branché** : `EditParticipantButton` (prix HT, statut, date dépôt dossier) existait mais n'était rendu nulle part (import mort dans la page session). → Branché dans la liste « Apprenants inscrits » (visible ADMIN/MANAGER/COMMERCIAL uniquement). ⚠️ **Ce branchement touche `sessions/[id]/page.tsx` que ton commit de 18h04 a aussi modifié → livré en patch séparé à appliquer à la main (`AUDIT-2026-08-12/patch-sessions-page.diff`), PAS écrit directement.**
6. **Incohérence trésorerie dossier ↔ facture** : cocher « Paiement client » ou « Remboursement OPCO » dans la timeline dossiers passait le participant en encaissé **sans solder la facture liée** → page Factures affichait « impayé » pendant que Dossiers OPCO affichait « encaissé » (la synchro existait dans l'autre sens uniquement). → `settleInvoiceForParticipant` : la facture liée est soldée (InvoicePayment tracé « synchro dossier OPCO » + statut PAID). Le dé-toggle ne reverse rien automatiquement (un mouvement d'argent ne s'annule pas silencieusement). **Testé** : FAC-000002 soldée automatiquement au remboursement. *Règle métier à valider par toi — facile à ajuster si tu préfères un comportement différent.*

### P2 — robustesse

7. **`INTERVAL '${n} minutes'` dans le claim SQL du worker closure** (`queue-postgres.ts`) : le placeholder tombait dans un littéral → paramètre non typé (42P18 sous driver pg ; fonctionnait par accident avec le moteur natif). → `make_interval(mins => ${n})`, sémantique identique, robuste partout.
8. **Constructions `new Prisma.Decimal(decimal)` sur des valeurs issues de la BDD** (dossiers-opco, invoices) : fragiles cross-réalme. → `String()` défensif, comportement identique en prod.
9. **Hygiène de tests** : mock prisma manquant dans `import-veille.mapping.test.ts` (rejet non géré), `dedupe.merge.test.ts` migré sur la nouvelle factory `createPrismaClientForUrl`, script `test` de `packages/db` aligné sur le pattern dotenv de web.
10. **Suite E2E rendue exécutable en local** : assertion bandeau STAGING conditionnée à `E2E_TARGET_ENV`, spec upload Supabase skippée si `STORAGE_PROVIDER≠supabase`, spec closure « 0 stub » skippée si `E2E_SKIP_REAL_AI=1`, chemin Chromium surchargeable (`PW_EXECUTABLE_PATH`).

---

## Modules audités — résultats détaillés

| Module | Test réalisé | Résultat |
|---|---|---|
| **Wizard session 4 étapes** | Création réelle SES-0106 (produit 16h, dates auto J+jours ouvrés, lieu, formateur dispo, 2 apprenantes multi-casquette via recherche, tarif 672 €) | ✅ Excellent. Auto-calc date fin (16h→2j) et CA prévu corrects |
| **Docs avant formation** | Génération auto à la création + « Tout générer » | ✅ 10/10 : convention (L.6353-1, art. 293 B, rétractation, RGPD, programme intégré), convocation, AGEFICE pdf-lib **81/94 champs** vérifiés, assiduité, analyse besoin |
| **Pack fin de formation 1-clic** | Modale (16 docs estimés) → file Postgres → worker → ZIP | ✅ 16/16 PDF en ~1 min (stubs IA), ZIP par apprenant : attestation, certificat, émargement (par demi-journée 9h-13h/14h-18h), QCM, grille obs, positionnement, satisfaction ×2 |
| **Fallback IA** | Ollama absent volontairement | ✅ Chaîne stub déterministe, jobs ok=16 fail=0 ; déroulé produit généré **sans IA** par parse du programme |
| **Statuts session** | Brouillon → Validée → Terminée | ✅ transitions + timeline correctes |
| **Facturation** | Émission depuis dossier (modale : montant, TVA art. 261-4-4°, échéance) → PDF → paiement partiel 300 € → avoir 100 € | ✅ FAC-000001/2 conformes (mentions L441-10, 293 B, NDA, « ne vaut pas agrément » L6352-12), statuts ISSUED/PARTIAL/PAID, AVO-000001 lié, motif obligatoire |
| **Pipeline dossiers OPCO** | 4 étapes facture → validation → remboursement → paiement sur 2 dossiers | ✅ + DSO, dates de transition mémorisées, synchro OpcoSubmission |
| **Budget AGEFICE** | Page + barres de budget par apprenant dans dossiers | ✅ règle année = date de dépôt respectée (`financingRequestDate`) |
| **Pré-inscriptions (pilier 4)** | Lien tokenisé → formulaire public (RGPD, France) → upload CNI+RIB → soumission → OCR (IA down) → validation admin → conversion | ✅ complet. OCR dégradé proprement (« pièce archivée, saisis manuellement », warnings détaillés) ; conversion crée Person + EI + LegalLink EI_SELF |
| **CRM 360 apprenant** | Fiche multi-casquettes du converti + fiche KING avec participations et docs | ✅ onglets, docs par session, complétude |
| **Devis** | Création DEV-0001 → ligne depuis catalogue → PDF | ✅ numérotation, entête OF, PDF propre |
| **Relances factures** | Relance manuelle niveau 1 (dialog Radix) | ✅ exemplaire : dry-run affiché à l'utilisateur, compteur **non** consommé sans envoi réel (Pitfall 22-11 fermé), AuditLog complet |
| **Garde emails 22-11** | SMTP vide + settings absents | ✅ fail-closed vérifié |
| **Exports** | Factures xlsx (12 colonnes) + Bilan Qualiopi xlsx (agrégats formateurs) | ✅ xlsx valides |
| **RBAC** | Login LECTEUR réel : boutons d'écriture masqués, actions serveur balayées | ✅ 167 actions serveur analysées : toutes gardées (`requireRole`/`validateRequest`/token public par design) |
| **Audit log** | — | ✅ login, exports, devis, avoirs, paiements, relances tracés |
| **Notifications** | Cloche 50 | ✅ panneau présent (« 50 fiches apprenant à corriger ») — le trou de mai est comblé |
| **Multi-tenant** | Scoping `tenantId` sur les requêtes des actions vérifié par sondage | ✅ |
| **Routes** | 21 routes principales | ✅ toutes 200 avec contenu, zéro 500 |
| **Import SmartOF** | Sync 12/08 en dry-run puis réel, relancé 2× | ✅ idempotent (0 doublon au 2ᵉ passage) |

---

## Points restants (non corrigés — à arbitrer)

**P2 · Horaires convocation incohérents** : la convocation annonce « 9h00 – 17h00 (pauses incluses) » alors que créneaux/convention/émargement disent 9h-13h / 14h-18h. → harmoniser `convocation-template.ts`.

**P2 · Rapport de sync SmartOF** : compteur « LegalLinks créés » affiche 0 au 1er passage alors que 288 liens sont bien créés (le 2ᵉ passage dit « 288 déjà reliés »). Bug d'affichage du rapport, pas des données.

**P2 · Formateurs absents des exports 12/08** : 81 affectations restaient « non résolues » tant que les 5 formateurs n'existaient pas en base avec leur UID SmartOF. Vérifie qu'en cloud prod ils ont bien leurs `ExternalIdentity` (`entityType='Person'` — sensible à la casse).

**P3 · Recherche apprenant (wizard)** : « KING » classe l.baudu@kingimmobilier.com (match email) avant Kristin KING (match nom exact) — prioriser le nom exact.

**P3 · `lookupSiret`** : action serveur appelable sans session (proxy vers recherche-entreprises.api.gouv.fr) — pas de fuite de données mais rate-limit conseillé.

**P3 · A11y** : dropdowns custom sans `role=menu/menuitem` (statut session, modale pack sans `role=dialog`) — les tests automatisés et lecteurs d'écran les ratent. Favicon absent (404 console sur chaque page).

**Self-host uniquement · Optimiseur d'images Next 14** : sous requêtes AVIF concurrentes interrompues, l'optimiseur peut se bloquer durablement (reproduit en sandbox ; le PNG direct reste servi). Sans impact Vercel. Si un jour tu sers le web ailleurs : à surveiller (`images.unoptimized` en secours).

**Périmètre non testable en sandbox** (rien détecté d'anormal en lecture de code) : envoi SMTP réel, génération IA réelle (OpenRouter/Ollama — la structure stub/parse/Zod est saine), Google Calendar (bouton présent, non cliqué sans credentials), Yousign (non câblé), qualité de contenu pédagogique des programmes existants (le P0 de l'audit de mai sur les verbes Bloom reste un chantier de contenu, pas de code).

---

## Ce qui est livré sur ton Mac

**24 fichiers corrigés écrits directement dans `files/`** (arbre source propre au moment de l'écriture — tout est visible dans `git diff`) :

- `packages/shared/` : package.json + 4 imports enum → **répare `pnpm build`**
- `packages/db/` : package.json (deps adapter + script test), `src/index.ts` (factory `createPrismaClientForUrl` + branche adapter WASM inerte hors sandbox, activable par `PRISMA_USE_PG_ADAPTER=1`), `prisma/seed.ts` (client partagé), test veille
- `apps/web/` : `lib/storage.ts` (presigned MinIO), `components/preinscriptions/public-form.tsx` (swap niveau/diplôme), `server/actions/sessions.ts` (+`financingMode`), `server/actions/dossiers-opco.ts` (Decimal + `settleInvoiceForParticipant`), `server/actions/invoices.ts` (Decimal), `lib/closure/queue-postgres.ts` (make_interval), `components/sessions/edit-participant-button.tsx` + `session-participants-list.tsx`, tests storage/dedupe, e2e ×3, playwright.config, package.json (presigner)

**Dossier `AUDIT-2026-08-12/`** à la racine du projet : ce rapport + `patch-sessions-page.diff` (le branchement du bouton Éditer dans `sessions/[id]/page.tsx`, à appliquer sur TA version d'après 18h04 : `git apply --3way AUDIT-2026-08-12/patch-sessions-page.diff`).

**Après pull des changements** : `pnpm install` (2 nouvelles petites deps : `@prisma/adapter-pg`, `pg`, `@aws-sdk/s3-request-presigner`), puis `pnpm build && pnpm test` — tout doit être vert comme en sandbox.

**Non livré (spécifique sandbox)** : surcharges du package.json racine (miroir xlsx, postinstalls), `schema.prisma` (+`driverAdapters` en previewFeatures — nécessaire seulement si tu actives un jour `PRISMA_USE_PG_ADAPTER`), `next.config.mjs` (garde optionnelle optimiseur d'images), scripts de patch moteur WASM.

---

## Couverture des besoins d'un OF — état

Conventions/convocations conformes ✅ · Émargement par demi-journée ✅ · Attestations & certificats L.6353-1 ✅ · Pack Qualiopi par stagiaire ✅ · Matrice apprenant×document avec indicateurs (IND 1→30) ✅ · Bilan Qualiopi exportable ✅ · Veille réglementaire ✅ · AGEFICE (formulaire officiel pré-rempli, budget 3000 €/an par année de dépôt, assiduité) ✅ · Dossiers OPCO avec pipeline et DSO ✅ · Factures/avoirs conformes CGI ✅ · Relances bordées ✅ · Devis ✅ · Pré-inscriptions self-service RGPD ✅ · Multi-casquette EI/enseigne ✅ · RBAC 6 rôles ✅ · Audit log ✅ · Exports xlsx ✅ · BPF : les données nécessaires existent (statuts BPF sur Person, CA par financeur) — pas encore d'état « Cerfa 10443 prêt à déposer », seul vrai manque structurel identifié pour du 100 % OF. Signature électronique (Yousign) prévue non câblée — l'émargement papier couvre le besoin aujourd'hui.
