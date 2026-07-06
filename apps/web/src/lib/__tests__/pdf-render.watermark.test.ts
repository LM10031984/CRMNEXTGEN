/**
 * Filigrane STAGING au chokepoint pdf-render.ts (Phase 21 APP-01, D-02).
 *
 * withStagingWatermark(html, appEnv) : injection PUREMENT ADDITIVE d'un
 * <style> background SVG répété (jamais position:fixed — Chromium ne le
 * répète pas multi-pages) quand appEnv === 'staging'. Tout autre env
 * retourne l'entrée STRICTEMENT inchangée.
 *
 * Le paramètre explicite `appEnv` rend les tests hermétiques (pas de
 * mutation de process.env / sharedEnv).
 */
import { describe, expect, it } from 'vitest';

import { withStagingWatermark } from '../pdf-render';

const HTML_WITH_HEAD =
  '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Doc</title></head><body><p>Contenu</p></body></html>';

const HTML_WITHOUT_HEAD = '<div><p>Fragment sans head</p></div>';

// Footer in-body Gotenberg (anti-pattern CLAUDE.md : footer DANS le body,
// jamais le footer natif Gotenberg) + running footer WeasyPrint.
const HTML_WITH_INBODY_FOOTER = `<!DOCTYPE html><html><head><style>
  footer.weasy { position: running(footer); }
</style></head><body>
  <p>Contenu principal</p>
  <footer style="position:fixed;bottom:0">START ACADEMY — SIRET 95131909400011 — NDA 93 06 10481 06</footer>
  <footer class="weasy">Footer WeasyPrint running</footer>
</body></html>`;

describe('withStagingWatermark', () => {
  it("injecte le style STAGING avant </head> quand appEnv=staging (HTML avec <head>)", () => {
    const out = withStagingWatermark(HTML_WITH_HEAD, 'staging');
    expect(out).not.toBe(HTML_WITH_HEAD);
    expect(out).toContain('STAGING');
    // Le style est injecté AVANT la fermeture du head
    const styleIdx = out.indexOf('STAGING');
    const headCloseIdx = out.indexOf('</head>');
    expect(headCloseIdx).toBeGreaterThan(-1);
    expect(styleIdx).toBeLessThan(headCloseIdx);
    // Filigrane = background répété, jamais position:fixed
    expect(out).toContain('background-image');
    expect(out).toContain('background-repeat: repeat');
  });

  it("retourne l'entrée STRICTEMENT identique (===) en production", () => {
    const out = withStagingWatermark(HTML_WITH_HEAD, 'production');
    expect(out).toBe(HTML_WITH_HEAD);
  });

  it("retourne l'entrée identique en development", () => {
    const out = withStagingWatermark(HTML_WITH_HEAD, 'development');
    expect(out).toBe(HTML_WITH_HEAD);
  });

  it("préfixe le style en tête du HTML quand il n'y a pas de </head> (staging)", () => {
    const out = withStagingWatermark(HTML_WITHOUT_HEAD, 'staging');
    expect(out.startsWith('<style>')).toBe(true);
    expect(out).toContain('STAGING');
    // Le HTML d'origine est intact à la suite du style préfixé
    expect(out.endsWith(HTML_WITHOUT_HEAD)).toBe(true);
  });

  it('ne régresse pas le footer in-body : le filigrane est purement additif (staging)', () => {
    const out = withStagingWatermark(HTML_WITH_INBODY_FOOTER, 'staging');
    // Les deux mécanismes footer (in-body fixed Gotenberg + running WeasyPrint)
    // sont toujours présents À L'IDENTIQUE dans la sortie.
    expect(out).toContain(
      '<footer style="position:fixed;bottom:0">START ACADEMY — SIRET 95131909400011 — NDA 93 06 10481 06</footer>',
    );
    expect(out).toContain('footer.weasy { position: running(footer); }');
    expect(out).toContain('<footer class="weasy">Footer WeasyPrint running</footer>');
    // Additif : la sortie contient l'intégralité du body d'origine
    const bodyStart = HTML_WITH_INBODY_FOOTER.indexOf('<body>');
    expect(out).toContain(HTML_WITH_INBODY_FOOTER.slice(bodyStart));
  });
});
