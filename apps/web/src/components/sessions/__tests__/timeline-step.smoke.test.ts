import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke A4 2026-06-09 — TimelineStep default expanded = false.
 *
 * Invariant : seule l'étape `active` de sessionStage() s'ouvre par défaut.
 * Si un consumer oublie de passer `expanded`, on tombe sur "replié" — pas
 * sur un opening en cascade qui repolluerait la timeline. La dérivation
 * "1 seule étape active" est elle-même testée dans
 * src/lib/sessions/__tests__/session-stage.test.ts (test "stagesState").
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const src = stripComments(
  readFileSync(
    path.join(__dirname, '..', 'timeline-step.tsx'),
    'utf8',
  ),
);

describe('TimelineStep — A4 default collapsed', () => {
  it('default `expanded = false` (replié par défaut)', () => {
    expect(src).toMatch(/expanded\s*=\s*false/);
    expect(src).not.toMatch(/expanded\s*=\s*true/);
  });

  it('useState initialisé depuis la prop expanded', () => {
    // Anti-régression : ne pas hardcoder useState(true). Le default doit
    // venir du paramètre destructuré.
    expect(src).toMatch(/useState\(expanded\)/);
  });

  it('useEffect resync sur changement de prop (refresh server)', () => {
    // Si la page re-render avec une nouvelle stagesState (post-mutation),
    // le step doit suivre — sinon l'utilisateur reste sur l'ancien état.
    expect(src).toMatch(/setIsOpen\(expanded\)/);
    expect(src).toMatch(/\[expanded\]/);
  });
});


describe('StepDocRow — A8 row cliquable quand done + pdfHref', () => {
  it('expose la prop pdfHref?: string', () => {
    expect(src).toMatch(/pdfHref\?:\s*string/);
  });

  it("rend un <a target=_blank> quand allDone && pdfHref", () => {
    // Garde-fou : si le wrapping passe en <button> ou <div onClick>, on perd
    // l'ouvrir-dans-un-nouvel-onglet attendu par les utilisateurs.
    expect(src).toMatch(/allDone\s*&&\s*pdfHref/);
    expect(src).toMatch(/target="_blank"/);
    expect(src).toMatch(/rel="noopener noreferrer"/);
  });

  it("garde le row non-interactive si !allDone (affordance honnête)", () => {
    // Pas de fallback href trompeur sur un row missing/partial. Le hub
    // per-stagiaire reste le DocDockDrawer.
    expect(src).toMatch(/return\s*\(\s*<li className="flex items-center gap-2 text-sm">/);
  });
});
