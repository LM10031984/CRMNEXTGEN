import { describe, it, expect } from 'vitest';
import {
  TEMPLATES_CATALOG,
  getTemplatesByCategory,
  getTemplateById,
  type TemplateCategory,
} from '../templates-catalog';

/**
 * Tests Wave 0 — Plan 12-02 (D-06..D-11 CONTEXT.md).
 *
 * Catalogue centralisé des templates QualiOF. Source unique D-10
 * (consommée par /app/templates et potentiellement Phase 10 Audit Qualiopi blanc).
 */
describe('TEMPLATES_CATALOG — Phase 12 D-06..D-10', () => {
  it('contient au moins 15 entrées (D-07 inventory)', () => {
    expect(TEMPLATES_CATALOG.length).toBeGreaterThanOrEqual(15);
  });

  it('couvre les 3 catégories qualiopi/agefice/email', () => {
    const cats = new Set<TemplateCategory>(TEMPLATES_CATALOG.map((t) => t.category));
    expect(cats.has('qualiopi')).toBe(true);
    expect(cats.has('agefice')).toBe(true);
    expect(cats.has('email')).toBe(true);
  });

  it('contient au moins 10 templates Qualiopi (D-07)', () => {
    expect(getTemplatesByCategory('qualiopi').length).toBeGreaterThanOrEqual(10);
  });

  it('chaque entrée a id/label/category/sourcePath/variables valides (D-08)', () => {
    for (const t of TEMPLATES_CATALOG) {
      expect(t.id).toBeTruthy();
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
      expect(['qualiopi', 'agefice', 'email']).toContain(t.category);
      expect(t.sourcePath).toMatch(/^apps\/web\/src\//);
      expect(Array.isArray(t.variables)).toBe(true);
      expect(t.variables.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('ids uniques (clé stable D-10)', () => {
    const ids = TEMPLATES_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getTemplateById retourne soit une entrée soit undefined', () => {
    expect(typeof getTemplateById).toBe('function');
    const sample = TEMPLATES_CATALOG[0]!;
    expect(getTemplateById(sample.id)).toEqual(sample);
    expect(getTemplateById('___nope___')).toBeUndefined();
  });
});
