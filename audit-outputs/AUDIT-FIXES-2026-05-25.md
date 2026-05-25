# Audit fixes appliqués — 25/05/2026

Résultat de la session d'audit + fix sur QualiOF, à partir du rapport `AUDIT-REPORT.md` (racine `files/`).

## Fixes livrés

### P1-03 — Pack fin de formation : validation early-feedback

**Avant :** le bouton "Lancer la génération" restait actif même sur session incomplète. L'erreur "Formateur principal manquant" n'apparaissait qu'après le clic (late server feedback).

**Après :**
- `GenerateClosurePackButton` accepte une prop optionnelle `blockers: SessionCompletenessBlocker[]`.
- Si présents : affichage d'un bloc amber listant les blockers AVANT le clic, avec un lien deep-link vers la section concernée (`#section-formateurs`, `#section-lieu`, etc.).
- Le bouton "Lancer la génération" est désactivé (`disabled` + `cursor-not-allowed` + `title`) tant que des blockers existent.
- Le parent `sessions/[id]/page.tsx` passe désormais `sessionCompleteness.blockers`.

**Fichiers modifiés :**
- `apps/web/src/components/sessions/generate-closure-pack-button.tsx`
- `apps/web/src/app/app/sessions/[id]/page.tsx` (1 ligne)

**Donnée résiduelle :** 81/87 sessions n'ont pas de `SessionTrainer` (héritage import SmartOF — limite API SmartOF qui ne fournit pas les formateurs par session). Cette dette data est **séparée du fix UX** ci-dessus et nécessitera soit :
- un script de complétion (assignation par défaut formateur principal),
- soit une vague de saisie manuelle via la fiche session.

À décider — pas fait dans cette session.

---

### P0-02 + P0-03 — Génération IA produit : étape révision humaine + markdown rendu

**Avant :**
- Un produit auto-rempli par IA était publié directement dans le catalogue sans validation.
- Le tab Programme affichait le markdown brut (`##`, `###`, `-` visibles).

**Après :**
1. **Schema Prisma** : nouvelle colonne `TrainingProduct.aiDraftedAt: DateTime?`. Non-null = brouillon IA en attente de revue.
   - Migration : `packages/db/prisma/migrations/20260525120000_add_product_ai_draft/migration.sql`
   - `ALTER TABLE` appliqué sur la BDD live + entrée `_prisma_migrations` créée.
2. **`createProduct` server action** : set `aiDraftedAt = new Date()` quand `autoFillWithAI` réussit.
3. **`validateAiDraftProduct` (nouvelle server action)** : ADMIN/MANAGER uniquement. Passe `aiDraftedAt = null` + crée un `AuditLog` action `products.validate_ai_draft`.
4. **`getSessionCompleteness`** : nouveau blocker `product_ai_unreviewed`. Tant que le produit est en draft IA, le pack fin de formation est bloqué sur toutes ses sessions (via le mécanisme livré en P1-03).
5. **UI tab Programme** :
   - Bannière amber `AiDraftValidationBanner` quand `aiDraftedAt` non-null, avec bouton **Valider le programme** (ADMIN/MANAGER) et **Réviser le contenu** (édition).
   - Programme markdown rendu en HTML via `marked` (au lieu de `<pre whitespace-pre-wrap>`).
   - Styling Qualiopi-friendly via classes Tailwind scoped (`[&_h1]:`, `[&_h2]:`, listes, tableaux).

**Fichiers créés/modifiés :**
- `packages/db/prisma/schema.prisma` (ajout colonne `aiDraftedAt`)
- `packages/db/prisma/migrations/20260525120000_add_product_ai_draft/migration.sql` (nouveau)
- `apps/web/src/server/actions/crud-edits.ts` (set draft + nouvelle action `validateAiDraftProduct`)
- `apps/web/src/lib/sessions/completeness.ts` (nouveau blocker, `product` accepte `aiDraftedAt`)
- `apps/web/src/app/app/sessions/[id]/page.tsx` (propagation `aiDraftedAt`)
- `apps/web/src/app/app/produits/[id]/page.tsx` (props passées au tab)
- `apps/web/src/components/produits/tabs/product-programme-tab.tsx` (marked + bannière)
- `apps/web/src/components/produits/ai-draft-validation-banner.tsx` (nouveau)

---

### P0-01 — 26/32 produits non-Bloom flaggés "Brouillon IA"

Stratégie retenue : flagger massivement les produits dont le programme n'a **pas au moins 3 verbes Bloom distincts** (heuristique safe). La bannière de validation P0-02 s'applique automatiquement à ces produits, ce qui :
- bloque la génération de pack fin de formation tant qu'un humain n'a pas validé chaque programme,
- impose une revue Qualiopi avant que le produit serve à une convention.

**Résultat de l'audit BDD :**
- 32 produits actifs au total
- 26 produits non-Bloom-conformes → flaggés `aiDraftedAt = NOW()`
- 203 apprenants déjà formés sur des produits non-conformes (dette historique)
- 6 produits restent conformes (≥ 3 verbes Bloom)

**Top 10 par impact (apprenants formés) :**

| Code | h | Bloom | Sessions | Apprenants | Titre |
|---|---|---|---|---|---|
| PROD-0066 | 16h | 1 | 10 | 54 | L'IA au service des conseillers immobiliers - 16h |
| PROD-0042 | 72h | 0 | 11 | 46 | L'IA au service des conseillers immobiliers (72h) |
| PROD-0041 | 8h | 1 | 4 | 29 | Cadastre Niveau 1 |
| PROD-0062 | 8h | 1 | 7 | 17 | Non discrimination, Tracfin et déontologie |
| PROD-0065 | 24h | 1 | 6 | 15 | Exploiter l'IA dans l'immobilier - 24h |
| PROD-0058 | 8h | 0 | 3 | 10 | L'IA au service des conseillers immo (8h) |
| PROD-0063 | 40h | 1 | 6 | 10 | Intégrer l'IA - 40h |
| PROD-0064 | 72h | 0 | 4 | 10 | Maitriser l'IA - 72h |
| PROD-0059 | 8h | 1 | 2 | 5 | Booster vendeur (8h) |
| PROD-0061 | 77h | 0 | 1 | 3 | Intégrer l'IA - 77h |

Liste complète : `audit-outputs/products-non-bloom-2026-05-25.txt`

**Traçabilité :**
- Script idempotent : `apps/web/scripts/flag-non-bloom-products.sql` (rerunnable safe)
- `AuditLog` entry : `entity=TrainingProduct, entityId=batch-2026-05-25-non-bloom-flag, action=products.flag_ai_draft_batch`

**Heuristique utilisée :**
```
bloom_count = SUM(matches in programMd, case-insensitive, word boundary) for:
  Identifier, Expliquer, Utiliser, Analyser, Évaluer, Appliquer,
  Concevoir, Créer, Définir, Décrire, Mettre en œuvre, Maîtriser

Si bloom_count < 3 → flagged
```

Note : un produit peut avoir un score bas mais être en réalité conforme (par ex. si le programme utilise massivement le verbe "Comprendre" qui n'est pas dans la liste). La bannière permet à Laurent ou un Manager de **valider sans modifier** si le contenu est déjà bon.

---

## Suivi recommandé

1. **Tester le flow complet** : ouvrir `/app/produits/c15f333f-3e48-4884-98fe-d7d46b85378c` (PROD-0066) → tab Programme → bannière amber visible avec "Valider" / "Réviser".
2. **Tester le blocage du pack** : ouvrir SES-0081 (PROD-0066) → "Pack fin de formation" → la modale doit lister les blockers incluant "Programme IA en attente de validation humaine".
3. **Plan de complétion contenu** : Laurent et un Manager parcourent les 26 produits flaggés et soit (a) valident tel quel, soit (b) éditent le programme avec verbes Bloom avant validation.
4. **Dette `SessionTrainer`** : décider du backfill formateur principal pour les 81 sessions sans formateur.

---

## Bugs NON corrigés (du rapport initial)

Restent à traiter, par ordre de priorité opérationnelle :

- **P1-01** 25/32 produits sans `priceHT` (import SmartOF) — UI bulk-edit à prévoir
- **P1-02** Dashboard "Sessions à risque 215" sémantiquement trompeur — XS (renommer + détailler)
- **P2-01** Durée affichée "Xh" sans "/Yj" partout — XS (helper `formatDuration`)
- **P2-02** 4ᵉ KPI Budget AGEFICE tronqué en 1440px — XS (grid responsive)
- **P2-03** Page 404 non stylisée — XS (`app/(app)/not-found.tsx`)
- **P3-01** Cache `.next` corrompu en dev:full après interruption — S (envisager `next build` pour QA prolongée)
- **P3-02** Alignement doc/code rôle `USER`/`COMMERCIAL` — XS (doc à corriger, le code est cohérent)
