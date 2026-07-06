/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineStep } from '../timeline-step';

/**
 * A10 behavioral test 2026-06-09 — vraie vérification render-side de
 * l'invariant « pas de <button> dans <button> ».
 *
 * Le smoke source-grep précédent avait 3 défauts (feedback Laurent
 * 2026-06-09) : (a) ne testait que le slot `action`, (b) cassait au
 * premier refacto de className, (c) testait l'intention du code, pas
 * le résultat rendu. Ici on render réellement et on interroge le DOM —
 * 3 lignes utiles qui survivent à n'importe quel refacto tant que
 * l'invariant tient.
 */

describe('TimelineStep — invariant no <button> in <button> (behavioral)', () => {
  it("avec un <button> en slot action, le DOM ne contient AUCUN nested button", () => {
    const { container } = render(
      <TimelineStep number={2} title="Préparation" state="active" action={<button type="button">Lancer la préparation</button>}>
        body content
      </TimelineStep>,
    );
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it("avec un <button> en slot badge, le DOM ne contient AUCUN nested button", () => {
    // Cas couvert par le test précédent côté action. Ici on stress le
    // slot badge (qui RESTE à l'intérieur du <button> header). Si on
    // décide un jour de rendre un pill statut cliquable comme badge,
    // ce test bipera tout de suite.
    const { container } = render(
      <TimelineStep number={1} title="Création" state="done" badge={<button type="button">badge</button>}>
        body content
      </TimelineStep>,
    );
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it("avec un <button> en caption, le DOM ne contient AUCUN nested button", () => {
    // caption est typé string mais ReactNode passe — on sécurise.
    const { container } = render(
      <TimelineStep number={1} title="Création" state="done" caption={<button type="button">caption</button> as unknown as string}>
        body content
      </TimelineStep>,
    );
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it('expanded=false par défaut : body NON rendu (A4)', () => {
    const { queryByText } = render(
      <TimelineStep number={1} title="Création" state="done">
        unique-body-marker
      </TimelineStep>,
    );
    expect(queryByText('unique-body-marker')).toBeNull();
  });

  it('expanded=true : body rendu', () => {
    const { queryByText } = render(
      <TimelineStep number={1} title="Création" state="active" expanded>
        unique-body-marker
      </TimelineStep>,
    );
    expect(queryByText('unique-body-marker')).not.toBeNull();
  });
});
