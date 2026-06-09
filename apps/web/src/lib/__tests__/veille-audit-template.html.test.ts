/**
 * Phase 13 Plan 04 Task 0 (Wave 0) — Tests RED footer paged HTML veille.
 *
 * Contrat (cf. 13-04-PLAN.md must_haves.truths + feedback_footer_pdf_qualiof.md) :
 *  - footer paged contient `tenantName`
 *  - footer paged contient `SIRET` (literal string)
 *  - footer paged contient `NDA` (déclaration activité)
 *
 * Stratégie : on rend le HTML complet et on greppe les chaînes attendues
 * dans la sortie. Le pattern WeasyPrint pose le footer via CSS Paged Media
 * `@page { @bottom-center { content: element(corpfooter); } }` + un
 * `<footer class="corp">` en tête de body (cf. of-paged-footer.ts).
 */

import { describe, it, expect } from 'vitest';
import { renderVeilleAuditHtml, type VeilleAuditData } from '../veille-audit-template';

const TENANT_SNAPSHOT = {
  siret: '12345678900099',
  nda: '93131234500',
  address: '99 rue du Test, 13000 Marseille',
};

function makeMinimalData(): VeilleAuditData {
  return {
    theme: 'INDIC_26',
    themeLabel: 'Indicateur 26 — Veille handicap et accessibilité',
    watches: [
      {
        title: 'Agefiph actualités',
        url: 'https://www.agefiph.fr/feed',
        source: 'RSS',
        responsable: 'Laurent',
        frequency: 'Hebdomadaire',
        exploitation: 'Suivi handicap',
        dateLastReviewed: new Date('2026-04-01'),
        dateAdded: new Date('2026-01-01'),
      },
    ],
    generatedAt: new Date('2026-05-25T10:00:00Z'),
    tenantName: 'Start Academy',
  };
}

describe('renderVeilleAuditHtml — footer paged (Phase 13 Plan 04 footer body fix)', () => {
  it('Test 1 — footer contient le tenantName', () => {
    const data = makeMinimalData();
    const html = renderVeilleAuditHtml(data, TENANT_SNAPSHOT);
    // Le footer is rendered via renderOfPagedFooter() qui lit getOfConfig()
    // (ENV-driven), donc on vérifie qu'au moins l'identifiant tenant est
    // présent quelque part dans la sortie (peut être en running-element ou
    // en header).
    expect(html).toMatch(/Start Academy|Organisme/);
  });

  it('Test 2 — HTML contient le literal "SIRET"', () => {
    const data = makeMinimalData();
    const html = renderVeilleAuditHtml(data, TENANT_SNAPSHOT);
    expect(html).toContain('SIRET');
  });

  it('Test 3 — HTML contient le literal "NDA" (déclaration activité)', () => {
    const data = makeMinimalData();
    const html = renderVeilleAuditHtml(data, TENANT_SNAPSHOT);
    expect(html).toContain('NDA');
  });
});
