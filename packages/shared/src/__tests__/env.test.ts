import { describe, it, expect } from 'vitest';
// Import depuis le module pur `env-schemas` (pas `../env`) : `../env` exécute
// createEnv() au chargement et exigerait un .env complet → test non hermétique.
import {
  AI_PROVIDER_SCHEMA,
  OPENROUTER_MODEL_FAST_SCHEMA,
  STORAGE_PROVIDER_SCHEMA,
  WEASYPRINT_URL_SCHEMA,
  DIRECT_URL_SCHEMA,
} from '../env-schemas';

/**
 * Tests Phase 16 Plan 16-01 Task 1 — env.ts boot-safety pour le provider OpenRouter.
 *
 * On teste les schémas Zod isolés (AI_PROVIDER + un défaut OPENROUTER_*) plutôt que
 * `sharedEnv` complet, pour éviter d'avoir à fournir DATABASE_URL/AUTH_SECRET en test
 * (SKIP_ENV_VALIDATION reste disponible mais on veut valider la logique de schéma elle-même).
 *
 * Coverage :
 * - AI_PROVIDER='openrouter' accepté (sans le fix enum, le boot throw `Invalid enum value`).
 * - AI_PROVIDER inconnu rejeté (fail loud au boot).
 * - OPENROUTER_MODEL_FAST non défini → défaut `anthropic/claude-haiku-4.5` appliqué.
 */

describe('AI_PROVIDER enum (env.ts)', () => {
  it("Test 1 — accepte 'openrouter' (boot-safe pour la bascule cloud)", () => {
    expect(() => AI_PROVIDER_SCHEMA.parse('openrouter')).not.toThrow();
    expect(AI_PROVIDER_SCHEMA.parse('openrouter')).toBe('openrouter');
  });

  it("Test 1b — accepte toujours 'ollama' (défaut local préservé)", () => {
    expect(AI_PROVIDER_SCHEMA.parse('ollama')).toBe('ollama');
  });

  it('Test 2 — rejette un provider inconnu (fail loud)', () => {
    expect(() => AI_PROVIDER_SCHEMA.parse('n-importe-quoi')).toThrow();
  });
});

describe('OPENROUTER_MODEL_FAST défaut (env.ts)', () => {
  it('Test 3 — sans valeur → défaut anthropic/claude-haiku-4.5', () => {
    expect(OPENROUTER_MODEL_FAST_SCHEMA.parse(undefined)).toBe('anthropic/claude-haiku-4.5');
  });
});

/**
 * Tests Phase 17 Plan 17-02 Task 1 — 5 clés cloud fail-loud (schémas isolés).
 *
 * On teste les 3 schémas cloud NEUFS (STORAGE_PROVIDER / WEASYPRINT_URL / DIRECT_URL)
 * hors `createEnv` pour rester hermétique. Ce sont les MÊMES schémas que ceux
 * consommés par le bloc `server` de `env.ts`.
 */
describe('STORAGE_PROVIDER enum (env.ts cloud v6)', () => {
  it("Test 4 — rejette une valeur inconnue (fail loud)", () => {
    expect(() => STORAGE_PROVIDER_SCHEMA.parse('s3-random')).toThrow();
  });

  it("Test 5 — sans valeur → défaut 'minio' (dev local préservé)", () => {
    expect(STORAGE_PROVIDER_SCHEMA.parse(undefined)).toBe('minio');
  });

  it("Test 6 — accepte 'supabase' (bascule cloud)", () => {
    expect(STORAGE_PROVIDER_SCHEMA.parse('supabase')).toBe('supabase');
  });
});

describe('DIRECT_URL requise + URL (env.ts cloud v6)', () => {
  it('Test 7 — rejette une non-URL (fail loud)', () => {
    expect(() => DIRECT_URL_SCHEMA.parse('pas-une-url')).toThrow();
  });

  it('Test 8 — accepte une URL postgresql valide', () => {
    expect(() => DIRECT_URL_SCHEMA.parse('postgresql://x:y@h:5432/d')).not.toThrow();
  });
});

describe('WEASYPRINT_URL défaut + URL (env.ts cloud v6)', () => {
  it('Test 9 — sans valeur → défaut http://localhost:5001', () => {
    expect(WEASYPRINT_URL_SCHEMA.parse(undefined)).toBe('http://localhost:5001');
  });

  it('Test 10 — rejette une non-URL (fail loud)', () => {
    expect(() => WEASYPRINT_URL_SCHEMA.parse('pas-url')).toThrow();
  });
});
