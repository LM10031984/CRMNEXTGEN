import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Phase 9.1 Plan 09.1-05 Task 2 — Smoke source-regex pour les 5 composants
 * `produits/tabs/*` (CENTRAL-04 + CENTRAL-05 cross-nav).
 *
 * Pattern source-regex car `@testing-library/react` non installé + vitest
 * environment=node (cf. apps/web/vitest.config.ts). Identique aux smokes Phase 9
 * (cf. `D-Phase9-N` STATE.md).
 *
 * Anti-régressions critiques :
 *  - 4 tabs labels FR EXACTS UI-SPEC §Copywriting (Stats / Sessions / Apprenants formés / Programme)
 *  - URL state `?tab=` (pas de client state)
 *  - aria-selected + role="tab" (a11y UI-SPEC §A11y Contract)
 *  - Cross-nav D-05 vers /app/sessions/ + /app/apprenants/ (ProductSessionsTab + ProductLearnersTab)
 *  - Copy empty states FR EXACTES UI-SPEC §Copywriting §Empty states
 *  - PrioCard labels EXACTS UI-SPEC §Copywriting Surface 3 (SESSIONS RÉALISÉES, APPRENANTS FORMÉS, HEURES TOTALES, CA CUMULÉ)
 */

const DIR = path.join(__dirname, '..');

function readSrc(file: string) {
  return readFileSync(path.join(DIR, file), 'utf-8');
}

describe('ProductTabs (compound) smoke (Plan 09.1-05)', () => {
  const src = readSrc('product-tabs.tsx');

  it("is a 'use client' Component (URL state via usePathname + useSearchParams)", () => {
    expect(src).toMatch(/^'use client'/);
    expect(src).toMatch(/usePathname|useSearchParams/);
  });

  it('declares the 4 tab ids stats|sessions|apprenants|programme', () => {
    expect(src).toMatch(/'stats'/);
    expect(src).toMatch(/'sessions'/);
    expect(src).toMatch(/'apprenants'/);
    expect(src).toMatch(/'programme'/);
  });

  it('uses tab labels EXACTS UI-SPEC §Copywriting (Stats, Sessions, Apprenants formés, Programme)', () => {
    expect(src).toMatch(/['"`]Stats['"`]/);
    expect(src).toMatch(/['"`]Sessions['"`]/);
    expect(src).toMatch(/Apprenants formés/);
    expect(src).toMatch(/['"`]Programme['"`]/);
  });

  it('uses a11y attributes role="tab" + aria-selected + aria-controls', () => {
    expect(src).toMatch(/role=['"]tab['"]/);
    expect(src).toMatch(/aria-selected/);
    expect(src).toMatch(/aria-controls/);
  });

  it('uses Link with `?tab=` URL navigation (no client state)', () => {
    expect(src).toMatch(/\?tab=/);
    // import Link from 'next/link'
    expect(src).toMatch(/from\s+['"]next\/link['"]/);
  });

  it('applies underline visual UI-SPEC §Component Contracts > ProductTabs', () => {
    expect(src).toMatch(/border-primary/);
    expect(src).toMatch(/text-primary/);
    expect(src).toMatch(/border-b/);
    // Horizontal scroll mobile (UI-SPEC §Responsive)
    expect(src).toMatch(/overflow-x-auto/);
  });
});

describe('ProductStatsTab smoke (Plan 09.1-05)', () => {
  const src = readSrc('product-stats-tab.tsx');

  it('imports ProductStats type from product-stats helper (Task 1)', () => {
    expect(src).toMatch(/product-stats/);
  });

  it('renders the 4 PrioCard labels EXACTS UI-SPEC §Copywriting Surface 3', () => {
    expect(src).toMatch(/SESSIONS RÉALISÉES/);
    expect(src).toMatch(/APPRENANTS FORMÉS/);
    expect(src).toMatch(/HEURES TOTALES/);
    expect(src).toMatch(/CA CUMULÉ/);
  });

  it('renders 4 sub labels (depuis {firstYear} / tous temps / délivrées / HT facturé)', () => {
    expect(src).toMatch(/depuis/);
    expect(src).toMatch(/tous temps/);
    expect(src).toMatch(/délivrées/);
    expect(src).toMatch(/HT facturé/);
  });

  it('formats CA via Intl.NumberFormat fr-FR EUR', () => {
    expect(src).toMatch(/Intl\.NumberFormat/);
    expect(src).toMatch(/['"]fr-FR['"]/);
    expect(src).toMatch(/EUR/);
  });

  it('renders responsive grid grid-cols-2 + lg:grid-cols-4 (UI-SPEC §Responsive)', () => {
    expect(src).toMatch(/grid-cols-2/);
    expect(src).toMatch(/lg:grid-cols-4/);
  });
});

describe('ProductSessionsTab smoke (Plan 09.1-05)', () => {
  const src = readSrc('product-sessions-tab.tsx');

  it('cross-nav D-05 vers /app/sessions/{id} (drill fiche session)', () => {
    expect(src).toMatch(/\/app\/sessions\//);
    expect(src).toMatch(/from\s+['"]next\/link['"]/);
  });

  it('empty state copywriting EXACT UI-SPEC §Copywriting (sessions)', () => {
    expect(src).toMatch(/Aucune session pour ce produit/);
    expect(src).toMatch(/Créez une session de formation/);
  });

  it('CTA "+ Créer une session" pré-rempli productId param', () => {
    expect(src).toMatch(/\+ Créer une session/);
    expect(src).toMatch(/productId=/);
  });

  it('table responsive overflow-x-auto wrapper (RESP-05 pattern)', () => {
    expect(src).toMatch(/overflow-x-auto/);
  });

  it('renders status badge with FR labels (Terminée / Planifiée / etc.)', () => {
    expect(src).toMatch(/COMPLETED/);
  });
});

describe('ProductLearnersTab smoke (Plan 09.1-05)', () => {
  const src = readSrc('product-learners-tab.tsx');

  it('cross-nav D-05 vers /app/apprenants/{personId} (drill fiche apprenant)', () => {
    expect(src).toMatch(/\/app\/apprenants\//);
    expect(src).toMatch(/from\s+['"]next\/link['"]/);
  });

  it('empty state copywriting EXACT UI-SPEC §Copywriting (apprenants)', () => {
    expect(src).toMatch(/Aucun apprenant formé/);
    expect(src).toMatch(/Les apprenants apparaîtront ici après leur première session/);
  });

  it('renders sessionsCount chip ("N sessions")', () => {
    expect(src).toMatch(/sessionsCount/);
  });
});

describe('ProductProgrammeTab smoke (Plan 09.1-05)', () => {
  const src = readSrc('product-programme-tab.tsx');

  it("renders markdown if present + link to /api/documents/{pdfId} for PDF", () => {
    expect(src).toMatch(/\/api\/documents\//);
  });

  it('empty state copywriting EXACT UI-SPEC §Copywriting (programme)', () => {
    expect(src).toMatch(/Programme de formation à créer/);
  });

  it('integrates GenerateProductProgrammeButton (existing CTA)', () => {
    expect(src).toMatch(/GenerateProductProgrammeButton/);
  });
});
