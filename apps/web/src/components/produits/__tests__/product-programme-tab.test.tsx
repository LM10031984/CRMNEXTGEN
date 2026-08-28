/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProductProgrammeTab } from '../tabs/product-programme-tab';

/**
 * « Il y a le programme, il est top, mais je ne peux pas générer le PDF du
 * programme depuis le produit » — Laurent, 28/08.
 *
 * Le bouton n'était rendu que dans DEUX cas :
 *  - programme VIDE (état initial) → « Générer le programme » ;
 *  - PDF DÉJÀ généré → « Régénérer ».
 *
 * Le cas intermédiaire — programme rédigé, PDF jamais produit — n'affichait
 * aucune action. Or c'est devenu le cas NORMAL depuis que la création de
 * programme remplit le markdown sans produire le PDF : le produit s'ouvrait
 * sur un programme lisible et une impasse.
 *
 * Test de puissance : retirer le bloc « PDF à générer » fait virer ROUGE
 * « propose de générer le PDF quand le programme est rédigé ».
 */

vi.mock('@/server/actions/programme-generator', () => ({
  generateProgrammeForProduct: vi.fn(),
}));
vi.mock('@/components/produits/ai-draft-validation-banner', () => ({
  AiDraftValidationBanner: () => <div data-testid="banner" />,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={String(href)}>{children}</a>
  ),
}));

afterEach(() => cleanup());

const PROGRAMME = '## Jour 1\n- Auditer le portefeuille de mandats\n- Structurer la relance';

describe('ProductProgrammeTab', () => {
  it('propose de générer le PDF quand le programme est rédigé mais pas encore produit', () => {
    render(<ProductProgrammeTab productId="p-1" markdown={PROGRAMME} pdfId={null} />);

    expect(screen.getByRole('button', { name: /Générer le programme/i })).toBeDefined();
    // …et le programme reste affiché : on ne remplace pas un contenu par un CTA.
    expect(screen.getByText(/Programme détaillé/i)).toBeDefined();
  });

  it('bascule sur « Régénérer » une fois le PDF disponible', () => {
    render(<ProductProgrammeTab productId="p-1" markdown={PROGRAMME} pdfId="doc-9" />);

    expect(screen.getByText(/Programme PDF disponible/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Générer le programme$/i })).toBeNull();
  });

  it('garde son état vide quand il n’y a ni programme ni PDF', () => {
    render(<ProductProgrammeTab productId="p-1" markdown={null} pdfId={null} />);

    expect(screen.getByText(/Programme de formation à créer/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Générer le programme/i })).toBeDefined();
  });
});
