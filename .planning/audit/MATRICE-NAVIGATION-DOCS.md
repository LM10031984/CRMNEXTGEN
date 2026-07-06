# Matrice d'audit navigation — Documents Qualiopi

> Phase 1 du plan « usine à gaz docs ». Audit ciblé : pour chaque type de doc,
> où il est généré, à quelle FK réelle il est rattaché, d'où il est visible,
> et en combien de clics depuis les 3 fiches centrales.
> Repo `files/`, branche `cloud-migration`, audité le 2026-06-10.

## 1. Le constat en une phrase

Les rattachements **logiques** sont corrects (ils épousent la chaîne Qualiopi), mais
la **navigation** manque, et le stockage des preuves est **éclaté sur 5 tables** —
ce qui fait qu'« tous les docs de Pascal Bianco en une requête » est aujourd'hui
**impossible**, pas seulement difficile.

## 2. Matrice par type de document

Légende ancrage réel dans `Document` : seules `sessionId?` et `participantId?` sont
de vraies FK Prisma. `product` / `tenant` / `RegulatoryWatch` / `invoice` ne sont
que des chaînes dans `entityType`/`entityId` (aucune FK, aucun JOIN possible).

| Type | Catalogué ? | Généré (fichier) | Ancrage réel | Stockage | Visible depuis | Clics fiche apprenant | Clics fiche produit |
|------|:--:|------|------|------|------|:--:|:--:|
| CONVENTION | ✅ | `convention-generator.ts:167` | sessionId + participantId | Document | DocDock session, onglet Docs apprenant | 1 | INACCESSIBLE (3) |
| PROGRAMME | ✅ | `programme-generator.ts:277` | **entityType=product** (pas de FK) | Document | SessionOnlyDocsBlock, onglet programme produit | INACCESSIBLE (3) | 1 |
| DEROULE_PEDAGOGIQUE | ❌ | `deroule-product-generator.ts:143` | **entityType=product** | Document | SessionOnlyDocsBlock | INACCESSIBLE | INACCESSIBLE |
| CHECKLIST_FORMATION | ❌ | `generate-checklist-formation.ts:193` | sessionId | Document | SessionOnlyDocsBlock | INACCESSIBLE (2) | INACCESSIBLE (2) |
| GRILLE_OBS_SESSION | ❌ | `generate-grille-obs-session.ts:164` | sessionId | Document | SessionOnlyDocsBlock | INACCESSIBLE (2) | INACCESSIBLE (2) |
| CONVOCATION | ✅ | `convocation-generator.ts:163` | sessionId + participantId | Document | DocDock, onglet Docs apprenant | 1 | INACCESSIBLE (3) |
| AGEFICE | ✅ | `agefice-generator.ts:370` | sessionId + participantId | Document | DocDock, onglet Docs apprenant | 1 | INACCESSIBLE (3) |
| ASSIDUITE | ✅ | `agefice-attendance-generator.ts:250` | sessionId + participantId | Document | onglet Docs apprenant | 1 | INACCESSIBLE (3) |
| ATTESTATION_FIN | ✅ | `closure/worker.ts:220` | sessionId + participantId | Document | onglet Docs apprenant | 1 | INACCESSIBLE (3) |
| CERTIFICAT_REALISATION | ✅ | `closure/worker.ts:220` | sessionId + participantId | Document | onglet Docs apprenant | 1 | INACCESSIBLE (3) |
| SATISFACTION_SESSION | ❌ | `closure/satisfaction-session-generator.ts:139` | sessionId | Document | SessionOnlyDocsBlock | INACCESSIBLE (2) | INACCESSIBLE (2) |
| FACTURE | ✅ | `invoices.ts:141 / :330` | sessionId + participantId (+ entityType=invoice) | Document | onglet Docs apprenant | 1 | INACCESSIBLE (3) |
| CGV | ❌ | `legal-docs-generator.ts:95` | **entityType=tenant** | Document (+ markdown Tenant) | /parametres uniquement | INACCESSIBLE | INACCESSIBLE |
| REGLEMENT_INTERIEUR | ❌ | `legal-docs-generator.ts:95` | **entityType=tenant** | Document (+ markdown Tenant) | /parametres uniquement | INACCESSIBLE | INACCESSIBLE |
| VEILLE_AUDIT | ❌ | `veille-export.ts:127` | **entityType=RegulatoryWatch** (entityId = libellé thème, pas un UUID) | Document | /veille uniquement | INACCESSIBLE | INACCESSIBLE |
| **EMARGEMENT** | ✅ | `closure/worker.ts:238` | — | **PedagogicalAsset** (PAS Document) | matrice + onglet Docs apprenant | 1 | INACCESSIBLE |
| **EVALUATION_ACQUIS (QCM)** | ✅ | `closure/worker.ts` (kind=QCM) | — | **PedagogicalAsset** | matrice + onglet Docs apprenant | 1 | INACCESSIBLE |
| ANALYSE_BESOIN / POSITIONNEMENT / SATISFACTION_CHAUD / SATISFACTION_FROID | (matrice) | `closure/worker.ts` | — | **PedagogicalAsset** | matrice + onglet Docs apprenant | 1 | INACCESSIBLE |
| CNI / RIB / CFP (URSSAF) | — | upload manuel | — | **SensitiveData / Person / AgeficeProfile** (clés MinIO éparses) | IdentityDocsCard (onglet info apprenant) | 1 | INACCESSIBLE |
| SATISFACTION | ✅ | **jamais généré** | — | — | label seul | — | — |
| SUPPORT_PEDAGOGIQUE | ✅ | **jamais généré** | — | — | cellule matrice (toujours MISSING) | — | — |
| PRE_ACCORD_OPCO | ✅ | **jamais généré** | — | — | cellule matrice | — | — |
| VALIDATION_OPCO | ✅ | **jamais généré** | — | — | label seul | — | — |
| CUSTOM | ❌ | **jamais généré** | — | — | label seul | — | — |

## 3. Click-depth synthétique

| Fiche de départ | Doc session | Doc participant | Doc produit | Doc tenant (CGV/RI/veille) |
|---|:--:|:--:|:--:|:--:|
| **Fiche SESSION** | 0–1 clic | 1 clic | 0–1 clic | INACCESSIBLE |
| **Fiche APPRENANT** | INACCESSIBLE (2 via session) | 1 clic | INACCESSIBLE (3 via session→produit) | INACCESSIBLE |
| **Fiche PRODUIT** | INACCESSIBLE (2 via session) | INACCESSIBLE (3 via apprenant) | 1 clic | INACCESSIBLE |

## 4. Les 4 angles morts qui changent le plan

1. **Stockage éclaté (le vrai problème).** Les preuves Qualiopi ne vivent pas dans
   une table mais dans **5** : `Document`, `PedagogicalAsset` (émargement, QCM,
   analyse besoin, positionnement, satisfactions chaud/froid, déroulé closure),
   `SensitiveData`/`Person`/`AgeficeProfile` (CNI/RIB/CFP en clés MinIO éparses),
   et le markdown `Tenant` (CGV/RI). Dénormaliser `Document` seul **ne suffit pas**
   à répondre « tous les docs de X » : il manquera la moitié des preuves.

2. **La fiche apprenant charge déjà les docs session ET produit** (`rawSessionDocs`,
   `rawProductDocs` dans `apprenants/[id]/page.tsx:147-154`) — mais ne les **affiche
   pas**, elle ne s'en sert que pour les compteurs de complétude. La donnée est déjà
   au bon endroit ; il manque juste le rendu. **Phase 3 est moins chère que prévu.**

3. **5 types catalogués jamais générés** (SATISFACTION, SUPPORT_PEDAGOGIQUE,
   PRE_ACCORD_OPCO, VALIDATION_OPCO, CUSTOM) → cellules **MISSING permanentes** dans
   la matrice. Risque audit : signal « dossier incomplet » alors qu'il ne l'est pas.

4. **Les docs tenant (CGV, RI, veille) sont orphelins universels** — accessibles
   seulement via `/parametres` et `/veille`, aucun lien croisé depuis les fiches.

## 5. Recommandation (révision du plan advisor)

- **Garder** l'ancrage actuel (ne pas casser la chaîne de conformité). ✅
- **Remplacer** la migration `Document` + backfill (Phase 2, risquée à 3 semaines de
  l'audit) par un **résolveur lecture** : une fonction `getDocsForPerson(personId)` /
  `getDocsForSession` / `getDocsForProduct` qui fait l'UNION des 5 sources et renvoie
  une liste normalisée. Zéro migration, zéro backfill, réversible.
- **Brancher** ce résolveur sur 3 rendus (Phase 3) : onglet Docs apprenant enrichi
  (afficher ce qui est déjà chargé), bloc Docs produit, et liens tenant.
- **Nettoyer** les 5 types fantômes : soit les retirer de la matrice, soit les marquer
  « N/A » au lieu de « manquant ».
