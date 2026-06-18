# Deferred items — 260618-gux

Out-of-scope discoveries during execution. NOT fixed (SCOPE BOUNDARY rule).

## Pre-existing test failure (unrelated to this plan)

- **File:** `apps/web/src/lib/closure/__tests__/shared-template.test.ts`
- **Test:** `loadAssetDataUrl > Test 6 — loadLogoColorDataUrl essaie logo.png → logo.jpg → logo.svg`
- **Symptom:** `expected 'data:image/jpeg;base64,…' to match /^data:image\/jpg;base64,/`
- **Cause:** mime-type mismatch (`image/jpeg` returned, test expects `image/jpg`) in the logo-loading cascade. Neither `shared-template.ts` nor its test were touched by this plan (verified via `git log c796bfb~1..HEAD`).
- **Status:** pre-existing, out of scope. Discovered while running the full Vitest suite for regression confirmation. The 260618-gux plan touches only generators / deroule-session / pipeline script / pure helpers — none of which import the failing path.
- **Recommendation:** fix in a dedicated quick task (align the mime constant to `image/jpeg` in either the source or the test).
