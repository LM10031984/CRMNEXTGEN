/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StepCreation } from '../step-creation';

/**
 * « Quand je suis sur une session je ne peux plus modifier le lieu, le
 * formateur, le prix » — Laurent, 28/08.
 *
 * Rien n'était cassé : lieu et formateur vivent dans le drawer ⚙ Paramètres
 * depuis la refonte (« 1 surface = 1 endroit »), et l'étape 1 n'affichait que
 * des constats morts (« Aucun formateur principal défini »). Le drawer sait
 * déjà s'ouvrir sur un hash (`#section-lieu`, `#section-formateurs`) — l'étape
 * 1 ne s'en servait pas.
 *
 * Test de puissance : retirer les <a> de `StepCreation` fait virer ROUGE.
 */

afterEach(() => cleanup());

const base = {
  state: 'active' as const,
  productId: 'prod-1',
  productLabel: 'IA immobilier',
  productCode: 'PROD-0042',
  productAiDraftedAt: null,
  productProgrammePdfId: null,
  durationHours: 72,
  startDate: new Date('2026-09-14T08:00:00Z'),
  endDate: new Date('2026-09-25T17:00:00Z'),
  locationLabel: null,
  primaryTrainerName: null,
  coTrainerCount: 0,
  participantsCount: 0,
  pricePerLearner: null,
  expanded: true,
};

describe('StepCreation — raccourcis vers les paramètres', () => {
  it('propose de définir le lieu quand il manque, vers la section du drawer', () => {
    render(<StepCreation {...base} />);
    const lien = screen.getByRole('link', { name: /définir le lieu/i });
    expect(lien.getAttribute('href')).toBe('#section-lieu');
  });

  it('propose de définir le formateur quand il manque', () => {
    render(<StepCreation {...base} />);
    const lien = screen.getByRole('link', { name: /définir le formateur/i });
    expect(lien.getAttribute('href')).toBe('#section-formateurs');
  });

  it('laisse changer un lieu et un formateur déjà renseignés', () => {
    render(
      <StepCreation
        {...base}
        locationLabel="ASSALIT SYNDIC, 15 rue Masséna, 06000 Nice"
        primaryTrainerName="Laurent MARX"
      />,
    );
    expect(screen.getByRole('link', { name: /changer le lieu/i }).getAttribute('href')).toBe(
      '#section-lieu',
    );
    expect(screen.getByRole('link', { name: /changer le formateur/i }).getAttribute('href')).toBe(
      '#section-formateurs',
    );
  });
});
