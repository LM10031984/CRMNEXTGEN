import { describe, it, expect } from 'vitest';
import { AI_PROVIDER_SCHEMA, OPENROUTER_MODEL_FAST_SCHEMA } from '../env';

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
