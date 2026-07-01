/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StepCreation } from '../step-creation';

/**
 * Phase 15 Plan 15-04 Task 3 — La validation programme IA quitte la session.
 *
 * La validation « Valider le programme IA » existe DÉJÀ au niveau produit
 * (AiDraftValidationBanner sur /app/produits/{id}?tab=programme). Sur la fiche
 * session, on ne veut PLUS de bouton/action de validation : programme en
 * LECTURE SEULE + lien vers la fiche produit.
 *
 * Ce test rend <StepCreation> avec un brouillon IA (productAiDraftedAt non null)
 * et vérifie :
 *   - AUCUN élément « Valider le programme » (action de validation retirée) ;
 *   - un LIEN vers /app/produits/{id}?tab=programme (édition sur le produit) EST présent.
 */

const baseProps = {
  state: 'done' as const,
  productId: 'prod-123',
  productLabel: 'Formation IA immobilier',
  productCode: 'PROD-0062',
  productProgrammePdfId: 'doc-999',
  durationHours: 16,
  startDate: new Date('2026-07-10T00:00:00Z'),
  endDate: new Date('2026-07-11T00:00:00Z'),
  locationLabel: 'Vence',
  primaryTrainerName: 'Jean Dupont',
  coTrainerCount: 0,
  participantsCount: 4,
  pricePerLearner: 3024,
};

describe('StepCreation — validation IA absente de la session (lecture seule + lien produit)', () => {
  it("avec un brouillon IA, AUCUNE action « Valider le programme » n'est rendue", () => {
    const { container } = render(
      <StepCreation {...baseProps} productAiDraftedAt={new Date('2026-06-20T00:00:00Z')} />,
    );
    // Aucune action/texte de validation du programme sur la session.
    expect(container.textContent ?? '').not.toMatch(/Valider le programme/i);
  });

  it('un lien vers la fiche produit (?tab=programme) EST présent', () => {
    const { container } = render(
      <StepCreation {...baseProps} productAiDraftedAt={new Date('2026-06-20T00:00:00Z')} />,
    );
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/app/produits/prod-123?tab=programme');
  });

  it('sans brouillon IA, toujours aucune validation et le lien produit reste', () => {
    const { container } = render(<StepCreation {...baseProps} productAiDraftedAt={null} />);
    expect(container.textContent ?? '').not.toMatch(/Valider le programme/i);
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/app/produits/prod-123?tab=programme');
  });
});
