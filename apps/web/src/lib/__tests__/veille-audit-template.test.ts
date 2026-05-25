/**
 * Phase 13 Plan 04 Task 0 (Wave 0) — Tests RED template HTML PDF audit veille.
 *
 * Contrat (cf. 13-04-PLAN.md must_haves.truths + VEILLE-03) :
 *  - renderVeilleAuditHtml retourne un HTML > 1000 chars pour data avec 5 watches
 *  - HTML contient toutes les watches (vérif des titres)
 *  - HTML contient le themeLabel dans le H1
 */

import { describe, it, expect } from 'vitest';
import { renderVeilleAuditHtml, type VeilleAuditData } from '../veille-audit-template';

const TENANT_SNAPSHOT = {
  siret: '12345678900012',
  nda: '93131234500',
  address: '12 rue Test, 13000 Marseille',
};

function makeData(n = 5): VeilleAuditData {
  return {
    theme: 'INDIC_23',
    themeLabel: "Indicateur 23 — Veille évolutions du secteur de la formation professionnelle",
    watches: Array.from({ length: n }, (_, i) => ({
      title: `Source test #${i + 1}`,
      url: `https://example.com/source-${i + 1}`,
      source: 'Newsletter',
      responsable: 'Laurent',
      frequency: 'Mensuelle',
      exploitation: `Action prise #${i + 1}`,
      dateLastReviewed: new Date(`2026-03-${String(i + 10).padStart(2, '0')}`),
      dateAdded: new Date(`2026-01-${String(i + 10).padStart(2, '0')}`),
    })),
    generatedAt: new Date('2026-05-25T10:00:00Z'),
    tenantName: 'Start Academy',
  };
}

describe('renderVeilleAuditHtml — Phase 13 Plan 04 (VEILLE-03)', () => {
  it('Test 1 — retourne un HTML > 1000 chars pour data avec 5 watches', () => {
    const html = renderVeilleAuditHtml(makeData(5), TENANT_SNAPSHOT);
    expect(html.length).toBeGreaterThan(1000);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('Test 2 — HTML contient tous les titres des watches', () => {
    const data = makeData(5);
    const html = renderVeilleAuditHtml(data, TENANT_SNAPSHOT);
    for (const w of data.watches) {
      expect(html).toContain(w.title);
    }
  });

  it('Test 3 — HTML contient le themeLabel dans un H1', () => {
    const data = makeData(3);
    const html = renderVeilleAuditHtml(data, TENANT_SNAPSHOT);
    // themeLabel doit apparaître dans le HTML, idéalement à proximité d'un <h1>
    expect(html).toContain(data.themeLabel);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1Match).not.toBeNull();
    // Le texte du H1 doit contenir le themeLabel (HTML-escaped possible)
    expect(h1Match![1]).toMatch(/Indicateur 23/);
  });
});
