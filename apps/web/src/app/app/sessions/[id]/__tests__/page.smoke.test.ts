import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Smoke test pour BUG-01 (audit 2026-05-12) :
// l'audit signalait "FileText is not defined" sur cette page. L'analyse code montre
// que l'import est présent (cache `.next` stale probable). Ce test ancre une protection
// contre toute régression future où un symbole lucide-react serait utilisé en JSX
// sans être déclaré dans la liste d'import.

const pageSrc = readFileSync(
  path.join(__dirname, '..', 'page.tsx'),
  'utf8',
);

describe('sessions/[id] page — smoke (BUG-01 + Phase 9.1 Plan 03)', () => {
  it('imports FileText from lucide-react', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(importMatch, 'page.tsx must import from lucide-react').toBeTruthy();
    const importedNames = new Set(
      (importMatch![1] ?? '').split(',').map((s) => s.trim()),
    );
    expect(importedNames.has('FileText')).toBe(true);
  });

  // Phase 9.1 Plan 03 — anti-régression : la fiche session enrichie doit
  // monter <ParticipantDocMatrix> + <SessionOnlyDocsBlock> et charger
  // productDocs (Bug P0 anti-régression) + AGEFICE conditionnel.
  it('mounts ParticipantDocMatrix component (Phase 9.1 Plan 03)', () => {
    expect(pageSrc).toMatch(/<ParticipantDocMatrix/);
  });

  it('mounts SessionOnlyDocsBlock component (Phase 9.1 Plan 03)', () => {
    expect(pageSrc).toMatch(/<SessionOnlyDocsBlock/);
  });

  it("loads Document entityType='product' (Bug P0 anti-régression — 1 PDF / N statuts)", () => {
    expect(pageSrc).toMatch(/entityType:\s*['"]product['"]/);
  });

  it('detects hasAgeficeParticipant for conditional AGEFICE column', () => {
    expect(pageSrc).toMatch(/hasAgeficeParticipant/);
  });

  it('loads pedagogical assets via prisma.pedagogicalAsset.findMany', () => {
    expect(pageSrc).toMatch(/pedagogicalAsset\.findMany/);
  });

  it('uses no lucide-react symbol that is not imported', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    const imported = new Set(
      (importMatch?.[1] ?? '').split(',').map((s) => s.trim()),
    );
    // Symboles JSX (PascalCase tags) effectivement utilisés dans page.tsx.
    // Liste figée à la date du test — élargir manuellement si la page évolue.
    const lucideCandidates = new Set([
      'ArrowLeft',
      'Calendar',
      'Clock',
      'Euro',
      'Users',
      'Briefcase',
      'ClipboardCheck',
      'Check',
      'Minus',
      'Package',
      'ChevronRight',
      'FileText',
    ]);
    const jsxOpeningTags = [
      ...pageSrc.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g),
    ].map((m) => m[1]!);
    const usedFromLucide = jsxOpeningTags.filter((t) => lucideCandidates.has(t));
    const missing = usedFromLucide.filter((t) => !imported.has(t));
    expect(
      missing,
      `lucide-react symbols used in JSX but not imported: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
