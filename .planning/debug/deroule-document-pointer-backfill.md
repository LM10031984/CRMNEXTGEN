---
status: awaiting_human_verify
trigger: "déroulé pédagogique non cliquable dans les fiches session (LOT 1 — backfill)"
created: 2026-06-25
updated: 2026-06-25
---

## Current Focus

hypothesis: Le Document pointer DEROULE_PEDAGOGIQUE manque pour 12 produits dont le déroulé est figé dans TrainingProduct.derouleJson.
test: Backfill déterministe — re-rendre le PDF depuis derouleJson (sans LLM), uploader, créer le Document. Puis re-run de la requête de vérification.
expecting: 12 Document rows créés → toutes les sessions de ces produits affichent "Voir le PDF".
next_action: Lancer le script puis re-vérifier le compte.

## Symptoms

expected: Ouvrir une fiche session → le déroulé pédagogique est cliquable en un clic ("Voir le PDF").
actual: ~35 sessions affichent "Générer le déroulé" alors que le PDF existe déjà dans le Drive.
errors: Aucune erreur runtime — le lien est absent car le Document pointer n'existe pas en base.
reproduction: Ouvrir une session dont le produit n'a pas de Document DEROULE_PEDAGOGIQUE (entityType='product').
started: Après la génération de masse 2025/2026 (déroulés écrits dans Drive, pointeurs Document partiellement persistés).

## Eliminated

(root cause déjà confirmé en amont — pas de réinvestigation)

## Evidence

- timestamp: 2026-06-25
  checked: Requête de comptage sur TrainingProduct/TrainingSession/Document (Postgres Docker)
  found: 25 produits utilisés ; 21 avec derouleJson ; 9 avec Document ; 12 avec derouleJson SANS Document (LOT 1) ; 4 sans rien.
  implication: Les 12 cibles ont leur contenu figé → re-render déterministe possible sans LLM.

- timestamp: 2026-06-25
  checked: apps/web/src/app/app/sessions/[id]/page.tsx (productAssets query)
  found: La carte déroulé est cliquable ssi un Document existe avec entityType='product', type='DEROULE_PEDAGOGIQUE', entityId=productId.
  implication: Créer ce Document rend immédiatement le lien cliquable. La requête de vérif matche la logique UI.

- timestamp: 2026-06-25
  checked: apps/web/src/server/actions/deroule-product-generator.ts (lignes 117-152)
  found: Le générateur produit rend via renderProductDerouleHtml({produitTitre,produitCode,produitDureeHeures}, content) puis renderHtmlToPdfWeasy, hash sha256, objectKey=deroules/produits/<slug>-<hash8>.pdf, uploadFile(DOCS_BUCKET,...), Document.create.
  implication: Le backfill réutilise EXACTEMENT ce chemin, en passant content=derouleJson figé (pas de parse/Ollama/stub).

- timestamp: 2026-06-25
  checked: Shape de derouleJson (PROD-0041) et convention de clé des Documents existants
  found: derouleJson = { jours: [...] } (= DerouleContent) ; clés existantes deroules/produits/<slug>-<hash8>.pdf.
  implication: Compatibilité parfaite avec renderProductDerouleHtml et la convention d'objectKey.

## Evidence (LOT 1.5 — 2e root cause, le VRAI 404 "impossible d'ouvrir le déroulé")

- timestamp: 2026-06-25
  checked: apps/web/src/lib/docs/resolve-docs.ts (href des UnifiedDoc)
  found: href = clé MinIO BRUTE (Document l.236 doc.pdfUrl ; PedAsset l.255 pa.pdfUrl ; CNI l.278 ; RIB l.291 ; CFP l.305), sans slash initial.
  implication: Le navigateur résout la clé RELATIVEMENT à l'URL courante (/app/produits/{id}/… + clé → 404). Lien « Télécharger » cassé pour TOUS les docs de la liste unifiée.

- timestamp: 2026-06-25
  checked: /api/documents/[id]/route.ts et /api/pedagogical-assets/[id]/route.ts
  found: Routes existantes (GET par row id → downloadFile(pdfUrl) → stream PDF). Aucune route pour CNI/RIB/CFP (PII).
  implication: Mapping correct : Document→/api/documents/{id} ; PedAsset→/api/pedagogical-assets/{id} ; CNI/RIB/CFP→null (pas de route ; vus via IdentityDocsCard) ; Tenant CGV/RI→null (markdown).

- timestamp: 2026-06-25
  checked: Consommateurs UI (unified-docs-list.tsx:131-133 ; apprenants/[id]/page.tsx:851/890)
  found: unified-docs-list rend <a href={doc.href}> et garde déjà `doc.href &&`. La liste DocItem de la page apprenant (l.240/251) construit DÉJÀ ses propres URLs API (non concernée). Seul <UnifiedDocsList> (l.890) consomme le résolveur buggé. get-docs-for.ts ne re-dérive pas href (passe les rows → resolveDocs).
  implication: Corriger au résolveur (source unique) suffit ; aucun changement UI nécessaire.

## Evidence (LOT 3 — clarté UX, 2 correctifs bornés)

- timestamp: 2026-06-25
  checked: apps/web/src/components/sessions/session-header-bar.tsx:110 (h1 titre) + min-w-0 flex-1 du parent l.96 + session-title-inline.tsx:48
  found: <h1> avait `truncate` → titres longs coupés sur 1 ligne. Le parent a déjà min-w-0 flex-1 (wrap OK). SessionTitleInline fournit son propre inputClassName, ne dépend pas du truncate parent.
  implication: Retirer `truncate` → `break-words` est sûr (pas de débordement, édition inline intacte).

- timestamp: 2026-06-25
  checked: session-only-docs-block.tsx (branches hasPdf l.181 et !hasPdf l.196) + page.tsx l.997 (garde canWrite &&)
  found: Le composant garde DÉJÀ les 2 boutons de génération (« Re-générer » l.181, « Générer » l.196) par canWrite. Le lien « Voir le PDF » (l.168) est toujours rendu si PDF présent. Seul le garde AU NIVEAU PAGE (l.997 canWrite &&) masquait tout le bloc aux lecteurs.
  implication: Retirer le seul garde page → lecteurs voient le bloc (consultation) ; génération reste gardée dans le composant. Aucune action de génération exposée à un lecteur.

## Resolution

root_cause: |
  TROIS causes successives (déroulé non consultable + UX confuse).
  (LOT 1) La génération de masse a écrit les PDF déroulé dans le Drive mais n'a persisté le Document pointer (entityType='product', type='DEROULE_PEDAGOGIQUE') que pour ~9 produits sur 25 utilisés. La carte session n'affiche un lien que si ce Document existe → "Générer" au lieu de "Voir le PDF".
  (LOT 1.5 — le blocage réel) Même avec le Document présent, UnifiedDoc.href portait la clé MinIO BRUTE au lieu d'une URL. Sans slash initial, le navigateur la résolvait relativement → 404. Lien "Télécharger" cassé pour TOUS les docs (déroulé, programme, attestations, certificats…) de la liste unifiée.
  (LOT 3 — clarté) (a) le titre de session était `truncate` (coupé sur 1 ligne) ; (b) le bloc « Documents session » était gardé par `canWrite &&` au niveau page → les LECTEURs ne voyaient AUCUN de ces docs (régression d'accès en consultation).
fix: |
  (LOT 1) Script de backfill déterministe apps/web/scripts/_backfill-deroule-product-docs.ts — re-rend le PDF depuis derouleJson (NO LLM), upload MinIO, crée le Document. Idempotent.
  (LOT 1.5) Helper downloadHrefFor(sourceTable, sourceId) dans resolve-docs.ts, appliqué à chaque assignation de href : Document→/api/documents/{id}, PedagogicalAsset→/api/pedagogical-assets/{id} (uniquement si pdfUrl présent), CNI/RIB/CFP→null (PII sans route), Tenant→null. Statut (present/stub/missing) inchangé. Aucun changement UI (correction au résolveur = source unique).
  (LOT 3a) session-header-bar.tsx — `truncate` → `break-words` sur le <h1> (titre lisible en entier, wrap autorisé).
  (LOT 3b) page.tsx — retrait du garde `canWrite &&` autour de <SessionOnlyDocsBlock> (consultation ouverte à tous). La génération reste gardée DANS le composant (déjà le cas, inchangé).
verification: |
  (LOT 1) Run 1 : 12/12 Document créés, 0 échec. with_document 9→21 ; still_deroule_no_doc 0 ; still_neither 4. Sessions cliquables 69/74 (5 restantes = 4 produits hors scope, dont PROD-0043 ×2 SES-0013/0014 "0 app"). Run 2 idempotence : 0 cible.
  (LOT 1.5) vitest resolve-docs : 29/29 vert (+ smoke unified-docs-list 6/6 → 35/35). tsc apps/web : exit 0.
  Test de puissance (convention Laurent) : en remplaçant le mapping Document par la clé brute (`http://minio/${sourceId}.pdf`) → 3 tests VIRENT ROUGE → restauré → vert. Garde la FORME de l'URL.
  Before/after déroulé (Document id=d1) : AVANT href="http://minio/d1.pdf" → APRÈS href="/api/documents/d1".
  (LOT 3) tsc apps/web : exit 0. vitest session-only-docs-block 7/7 + page.smoke 24/24 = 31/31 vert.
  Titre AVANT : `text-xl sm:text-2xl font-bold tracking-tight leading-tight truncate` → APRÈS : `text-xl sm:text-2xl font-bold tracking-tight leading-tight break-words`.
  Garde-fou RBAC ajouté (test de puissance) : ungater « Re-générer » (canWrite→true) → test ROUGE → restauré → vert. Prouve que la génération reste gardée canWrite et que « Voir le PDF » ne l'est pas.
files_changed:
  - apps/web/scripts/_backfill-deroule-product-docs.ts (LOT 1 — backfill, commit 0becc22)
  - apps/web/src/lib/docs/resolve-docs.ts (LOT 1.5 — downloadHrefFor + 5 href, commit fec3531)
  - apps/web/src/lib/docs/__tests__/resolve-docs.test.ts (LOT 1.5 — assertions + power test, commit fec3531)
  - apps/web/src/components/sessions/session-header-bar.tsx (LOT 3a — truncate→break-words)
  - apps/web/src/app/app/sessions/[id]/page.tsx (LOT 3b — retrait garde canWrite autour du bloc docs)
  - apps/web/src/components/sessions/qualiopi-matrix/__tests__/session-only-docs-block.smoke.test.ts (LOT 3b — garde-fou RBAC)
