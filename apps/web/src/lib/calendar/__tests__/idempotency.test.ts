import { describe, it, expect } from 'vitest';
import { buildEventKey, QUALIOF_KEY_PROP } from '../idempotency';

describe('buildEventKey', () => {
  it('formation sans dayIndex → clé unique par session', () => {
    expect(buildEventKey('SES-0097', 'formation')).toBe('qualiof_ses-0097_formation');
  });

  it('rappel avec dayIndex → suffixe inclus', () => {
    expect(buildEventKey('SES-0097', 'rappel', 3)).toBe('qualiof_ses-0097_rappel_3');
  });

  it('froid avec dayIndex → suffixe inclus', () => {
    expect(buildEventKey('SES-0097', 'froid', 1)).toBe('qualiof_ses-0097_froid_1');
  });

  it('déterministe : même entrée → même sortie (lowercase, pas de timestamp)', () => {
    const a = buildEventKey('SES-0097', 'rappel', 3);
    const b = buildEventKey('ses-0097', 'rappel', 3);
    expect(a).toBe(b);
    expect(buildEventKey('SES-0097', 'rappel', 3)).toBe(a);
  });

  it('la clé ne contient que [a-z0-9_-] (compatible extendedProperties.private)', () => {
    expect(buildEventKey('SES-0097', 'formation')).toMatch(/^[a-z0-9_-]+$/);
    expect(buildEventKey('SES-0097', 'rappel', 3)).toMatch(/^[a-z0-9_-]+$/);
    expect(buildEventKey('SES-0097', 'froid', 1)).toMatch(/^[a-z0-9_-]+$/);
  });

  it('QUALIOF_KEY_PROP vaut "qualiof_key"', () => {
    expect(QUALIOF_KEY_PROP).toBe('qualiof_key');
  });
});
