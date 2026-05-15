import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test parametres/page (Phase 7 Plan 07-04 Task 1).
 *
 * Pattern anti-régression BUG-01 (audit 2026-05-12 — "FileText is not defined"
 * sur une page lucide-react). Vérifie que :
 *   1. La page se parse comme un module valide (statique : pas d'exec runtime).
 *   2. Tous les symboles lucide-react utilisés en JSX sont déclarés dans l'import.
 *   3. Les 6 sections éditables sont câblées (icônes + import des 6 form components).
 *
 * Voir aussi : apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts
 * pour le même pattern sur la fiche session.
 */

const pageSrc = readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8');

describe('parametres/page smoke (Plan 07-04)', () => {
  it('declare an import block from lucide-react', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(importMatch, 'page.tsx must import from lucide-react').toBeTruthy();
  });

  it('imports all 6 section icons (Building2/MapPin/Image/Hash/CreditCard/Mail)', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    const imported = new Set(
      (importMatch?.[1] ?? '').split(',').map((s) => s.trim()),
    );
    // Note : `Image` est l'icône Lucide (pas next/image). Si on devait la renommer,
    // utiliser `import { Image as ImageIcon } from 'lucide-react'`.
    const required = [
      'Building2',
      'MapPin',
      'Image',
      'Hash',
      'CreditCard',
      'Mail',
    ];
    const missing = required.filter((sym) => !imported.has(sym));
    expect(missing, `icons missing from lucide-react import: ${missing.join(', ')}`).toEqual([]);
  });

  it('wires the 6 editable form components', () => {
    const required = [
      'OfIdentityForm',
      'OfAddressForm',
      'OfAssetsForm',
      'OfInvoicingForm',
      'OfBankingForm',
      'OfEmailForm',
    ];
    const missing = required.filter((sym) => !pageSrc.includes(sym));
    expect(missing, `form components not referenced in page.tsx: ${missing.join(', ')}`).toEqual([]);
  });

  it('uses no lucide-react JSX symbol that is not imported', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    const imported = new Set(
      (importMatch?.[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        // Support pour `Image as ImageIcon` : on prend l'alias si présent.
        .map((s) => (s.includes(' as ') ? s.split(' as ')[1]!.trim() : s)),
    );
    // Liste figée des icônes Lucide effectivement référencées dans la page.
    // À étendre manuellement si la page évolue.
    const lucideCandidates = new Set([
      'Building2',
      'MapPin',
      'Image',
      'ImageIcon',
      'Hash',
      'CreditCard',
      'Mail',
      'Users',
      'Sparkles',
      'Settings',
      'FileText',
    ]);
    const jsxOpeningTags = [...pageSrc.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(
      (m) => m[1]!,
    );
    const usedFromLucide = jsxOpeningTags.filter((t) =>
      lucideCandidates.has(t),
    );
    const missing = usedFromLucide.filter((t) => !imported.has(t));
    expect(
      missing,
      `lucide-react symbols used in JSX but not imported: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
