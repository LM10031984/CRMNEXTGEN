/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Garde-fous AVANT génération — « avoir des garde-fous qui me le disent avant
 * la génération pour que je les saisisse » (Laurent, 28/08).
 *
 * Avant : on cliquait, on attendait, et le cœur répondait « aucun représentant
 * déterminable ». Pour l'analyse des besoins, l'appel IA était déjà payé.
 *
 * Test de puissance : retirer `disabled={... blocConvention.length > 0}` fait
 * virer ROUGE « n'autorise pas la génération tant qu'il manque quelque chose ».
 */

vi.mock('@/server/actions/convention-generator', () => ({ generateConventionEntreprise: vi.fn() }));
vi.mock('@/server/actions/analyse-besoin-entreprise', () => ({
  generateAnalyseBesoinEntreprise: vi.fn(),
}));
vi.mock('@/server/actions/crud-edits', () => ({ updateOrganization: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => cleanup());

const GROUPE_OK = {
  sponsorOrgId: 'org-assalit',
  sponsorName: 'ASSALIT SYNDIC',
  participantCount: 8,
  hasConvention: false,
  conventionDocId: null,
  analyseAssetId: null,
  representant: 'Gilles Blanchon',
  blocages: [],
};

const MANQUE_REPRESENTANT = {
  key: 'representant_manquant' as const,
  label: 'Aucun représentant légal pour « ASSALIT SYNDIC »',
  hint: 'Renseignez le représentant sur la fiche entreprise.',
  href: '/app/organisations/org-assalit',
  documents: ['convention', 'analyse'] as ('convention' | 'analyse')[],
};

const MANQUE_PRIX = {
  key: 'prix_manquants' as const,
  label: 'Tarif non renseigné : Alice MARTIN',
  hint: 'Le montant de la convention est la somme des tarifs.',
  href: '#section-participants',
  documents: ['convention'] as ('convention' | 'analyse')[],
};

async function rendre(groupe: typeof GROUPE_OK) {
  const { ConventionEntreprisePanel } = await import('../convention-entreprise-panel');
  return render(<ConventionEntreprisePanel sessionId="ses-1" groupes={[groupe]} />);
}

describe('Documents d’entreprise — garde-fous avant génération', () => {
  it('n’autorise pas la génération tant qu’il manque quelque chose', async () => {
    await rendre({ ...GROUPE_OK, representant: null, blocages: [MANQUE_REPRESENTANT] });

    expect(screen.getByRole('button', { name: /Générer la convention/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: /Générer l’analyse/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByText(/À compléter avant de générer/i)).toBeDefined();
    expect(screen.getByText(/Aucun représentant légal/i)).toBeDefined();
  });

  it('permet de saisir le représentant sur place', async () => {
    await rendre({ ...GROUPE_OK, representant: null, blocages: [MANQUE_REPRESENTANT] });
    expect(screen.getByText(/Saisir le représentant ici/i)).toBeDefined();
  });

  /**
   * Un manque de tarif n'empêche QUE la convention : l'analyse des besoins ne
   * parle pas d'argent, la bloquer serait un faux barrage.
   */
  it('ne bloque que le document réellement concerné', async () => {
    await rendre({ ...GROUPE_OK, blocages: [MANQUE_PRIX] });

    expect(screen.getByRole('button', { name: /Générer la convention/i })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: /Générer l’analyse/i })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('laisse générer quand rien ne manque', async () => {
    await rendre(GROUPE_OK);

    expect(screen.queryByText(/À compléter avant de générer/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Générer la convention/i })).toHaveProperty(
      'disabled',
      false,
    );
  });
});
