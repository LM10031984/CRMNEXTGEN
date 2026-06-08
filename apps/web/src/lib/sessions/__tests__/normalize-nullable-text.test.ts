/**
 * Tests `normalizeNullableText` — SOURCE UNIQUE de normalisation "champ vidé"
 * pour la modale, les éditeurs inline, et tout futur point d'écriture.
 *
 * Anti-régression garde-fou Laurent ui-e2 :
 *   - '' devient null
 *   - '   ' (whitespace seul) devient null aussi (pas stocké brut)
 *   - les espaces autour d'un texte sont trimmed (pas de '  ab  ' en DB)
 *   - null et undefined retournent null
 *   - texte non vide retourné tel quel après trim
 */

import { describe, expect, it } from 'vitest';
import { normalizeNullableText } from '../normalize-nullable-text';

describe('normalizeNullableText', () => {
  it('null → null', () => {
    expect(normalizeNullableText(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(normalizeNullableText(undefined)).toBeNull();
  });

  it('"" → null', () => {
    expect(normalizeNullableText('')).toBeNull();
  });

  it('"   " (espaces seuls) → null', () => {
    expect(normalizeNullableText('   ')).toBeNull();
  });

  it('"\\n\\t \\r" (whitespace varié) → null', () => {
    expect(normalizeNullableText('\n\t \r')).toBeNull();
  });

  it('"abc" → "abc"', () => {
    expect(normalizeNullableText('abc')).toBe('abc');
  });

  it('"  abc  " → "abc" (trim conservé)', () => {
    expect(normalizeNullableText('  abc  ')).toBe('abc');
  });

  it('"  Note avec\\nnewline  " → "Note avec\\nnewline" (newline interne préservé)', () => {
    expect(normalizeNullableText('  Note avec\nnewline  ')).toBe('Note avec\nnewline');
  });

  it('idempotent : f(f(x)) === f(x)', () => {
    for (const x of [null, undefined, '', '   ', 'abc', '  abc  ']) {
      const once = normalizeNullableText(x);
      const twice = normalizeNullableText(once);
      expect(twice).toEqual(once);
    }
  });
});
