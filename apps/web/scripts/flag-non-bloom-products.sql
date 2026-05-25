-- BUG-P0-01 — Flag tous les produits dont le programme n'a pas au moins 3 verbes
-- Bloom distincts. Force la validation humaine via la bannière "Brouillon IA"
-- avant utilisation en convention Qualiopi (cf. lib/sessions/completeness.ts
-- blocker `product_ai_unreviewed`).
--
-- Idempotent : `aiDraftedAt IS NULL` empêche d'écraser un timestamp existant.
-- Exécuté manuellement le 2026-05-25 — 26 produits flaggés, 203 apprenants impactés.
-- Pour relancer : `psql -U qualiof -d qualiof -f flag-non-bloom-products.sql`

WITH non_bloom AS (
  SELECT p.id, p.code FROM "TrainingProduct" p
  WHERE p."isActive" = true AND p."aiDraftedAt" IS NULL
  AND (
    (p."programMd" ~* '\mIdentifier\M')::int +
    (p."programMd" ~* '\mExpliquer\M')::int +
    (p."programMd" ~* '\mUtiliser\M')::int +
    (p."programMd" ~* '\mAnalyser\M')::int +
    (p."programMd" ~* '\mÉvaluer\M')::int +
    (p."programMd" ~* '\mAppliquer\M')::int +
    (p."programMd" ~* '\mConcevoir\M')::int +
    (p."programMd" ~* '\mCréer\M')::int +
    (p."programMd" ~* '\mDéfinir\M')::int +
    (p."programMd" ~* '\mDécrire\M')::int +
    (p."programMd" ~* '\mMettre en œuvre\M')::int +
    (p."programMd" ~* '\mMaîtriser\M')::int
  ) < 3
)
UPDATE "TrainingProduct" SET "aiDraftedAt" = NOW()
WHERE id IN (SELECT id FROM non_bloom)
RETURNING code;
