/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * Phase 15 Lot 2 (15-02) Task 1 — TDD RED.
 *
 * Les 4 docs « niveau session » réembarqués dans `<TabApres>` (repris de
 * `SessionOnlyDocsBlock`, à supprimer) ont chacun un bouton câblé sur la BONNE
 * server action :
 *  - Déroulé                 → generateDerouleForProduct(productId, {force})
 *  - Grille obs session      → generateGrilleObsSessionForSession(sessionId, {force})
 *  - Checklist               → generateChecklistForSession(sessionId, {force})
 *  - Bilan satisfaction sess → generateSatisfactionSessionForSession(sessionId)
 *
 * Assertion sur l'action EXACTE appelée par bouton (branche cassable au gate).
 */

// --- mocks des 4 actions niveau session ------------------------------------
const generateDerouleForProduct = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const generateGrilleObsSessionForSession = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const generateChecklistForSession = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const generateSatisfactionSessionForSession = vi.fn(async (..._a: unknown[]) => ({ ok: true }));

vi.mock('@/server/actions/qualiopi-matrix', () => ({
  // Lot A signature — l'onglet embarque `<SignedDocDropZone>`, qui importe la
  // server action. Sans ce mock, la chaîne @/lib/rbac → @/lib/auth exécute
  // `cache()` de React, indisponible en jsdom.
  uploadSignedScans: vi.fn().mockResolvedValue({ ok: true, saved: 0, failures: [] }),
}));

vi.mock('@/server/actions/deroule-product-generator', () => ({
  generateDerouleForProduct: (...a: unknown[]) => generateDerouleForProduct(...a),
}));
vi.mock('@/server/actions/generate-grille-obs-session', () => ({
  generateGrilleObsSessionForSession: (...a: unknown[]) => generateGrilleObsSessionForSession(...a),
}));
vi.mock('@/server/actions/generate-checklist-formation', () => ({
  generateChecklistForSession: (...a: unknown[]) => generateChecklistForSession(...a),
}));
vi.mock('@/server/actions/generate-satisfaction-session', () => ({
  generateSatisfactionSessionForSession: (...a: unknown[]) => generateSatisfactionSessionForSession(...a),
}));

// Blocs par apprenant (Laurent 2026-09-10) : deux moteurs de plus. Sans ces
// mocks, l'import de `closure-pack` traîne `@/lib/auth` et son `React.cache`,
// qui n'existe pas hors runtime Next — le fichier de test ne se collectait même
// plus (« cache is not a function »).
const generateClosurePack = vi.fn(async (..._a: unknown[]) => ({ ok: true, total: 6 }));
const dispatchGenerateDoc = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock('@/server/actions/closure-pack', () => ({
  generateClosurePack: (...a: unknown[]) => generateClosurePack(...a),
}));
vi.mock('@/server/actions/dispatch-generate-doc', () => ({
  dispatchGenerateDoc: (...a: unknown[]) => dispatchGenerateDoc(...a),
  dispatchGenerateMissing: vi.fn(),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { TabApres } from '../tab-apres';

const SESSION_ID = 'sess-1';
const PRODUCT_ID = 'prod-1';

function renderTab() {
  return render(
    <TabApres
      sessionId={SESSION_ID}
      productId={PRODUCT_ID}
      canWrite
      sessionDocs={{
        deroule: { state: 'missing' },
        grilleObs: { state: 'missing' },
        checklist: { state: 'missing' },
        satisfactionSession: { state: 'missing' },
      }}
      closureItems={[{ state: 'missing' }, { state: 'generated' }]}
    />,
  );
}

beforeEach(() => {
  cleanup();
  generateDerouleForProduct.mockClear();
  generateGrilleObsSessionForSession.mockClear();
  generateChecklistForSession.mockClear();
  generateSatisfactionSessionForSession.mockClear();
  generateClosurePack.mockClear();
  dispatchGenerateDoc.mockClear();
  refresh.mockClear();
});

describe('TabApres — 4 docs niveau session câblés sur la bonne action', () => {
  it('Déroulé → generateDerouleForProduct', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /déroulé/i }));
    await waitFor(() => expect(generateDerouleForProduct).toHaveBeenCalledTimes(1));
    expect(generateDerouleForProduct.mock.calls[0]![0]).toBe(PRODUCT_ID);
    // les 3 autres ne bougent pas
    expect(generateGrilleObsSessionForSession).not.toHaveBeenCalled();
    expect(generateChecklistForSession).not.toHaveBeenCalled();
    expect(generateSatisfactionSessionForSession).not.toHaveBeenCalled();
  });

  it('Grille obs session → generateGrilleObsSessionForSession', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /grille/i }));
    await waitFor(() => expect(generateGrilleObsSessionForSession).toHaveBeenCalledTimes(1));
    expect(generateGrilleObsSessionForSession.mock.calls[0]![0]).toBe(SESSION_ID);
    expect(generateDerouleForProduct).not.toHaveBeenCalled();
  });

  it('Checklist → generateChecklistForSession', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /checklist/i }));
    await waitFor(() => expect(generateChecklistForSession).toHaveBeenCalledTimes(1));
    expect(generateChecklistForSession.mock.calls[0]![0]).toBe(SESSION_ID);
    expect(generateSatisfactionSessionForSession).not.toHaveBeenCalled();
  });

  it('Bilan satisfaction session → generateSatisfactionSessionForSession', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /bilan satisfaction/i }));
    await waitFor(() => expect(generateSatisfactionSessionForSession).toHaveBeenCalledTimes(1));
    expect(generateSatisfactionSessionForSession.mock.calls[0]![0]).toBe(SESSION_ID);
    expect(generateChecklistForSession).not.toHaveBeenCalled();
  });
});

/**
 * Laurent 2026-09-10 : « à côté de chaque apprenant, un bouton pour télécharger
 * les docs par apprenant par rapport à chaque phase […] tu m'as dit l'avoir
 * fait mais ce n'est pas le cas ».
 *
 * L'onglet Après n'avait AUCUN bloc nominatif : ces tests verrouillent le fait
 * qu'il y en a un par apprenant, et que ses deux boutons pointent bien sur LUI.
 */
describe('TabApres — actions par apprenant sur la ligne du nom', () => {
  const GROUPE = {
    participantId: 'part-42',
    fullName: 'Johanna FOURNEAU',
    sponsorOrgLabel: 'SOLUTION IMMO',
    readyCount: 2,
    missingCount: 1,
    items: [
      {
        docType: 'ATTESTATION_FIN',
        label: 'Attestation de fin',
        state: 'generated' as const,
        pdfUrl: '/api/documents/d1',
        downloadUrl: '/api/documents/d1?dl=1',
      },
      {
        docType: 'CERTIFICAT_REALISATION',
        label: 'Certificat de réalisation',
        state: 'generated' as const,
        pdfUrl: '/api/documents/d2',
        downloadUrl: '/api/documents/d2?dl=1',
      },
      { docType: 'EVALUATION_ACQUIS', label: 'QCM', state: 'missing' as const },
    ],
  };

  function renderAvecApprenant() {
    return render(
      <TabApres
        sessionId={SESSION_ID}
        productId={PRODUCT_ID}
        canWrite
        sessionDocs={{
          deroule: { state: 'missing' },
          grilleObs: { state: 'missing' },
          checklist: { state: 'missing' },
          satisfactionSession: { state: 'missing' },
        }}
        closureItems={[{ state: 'missing' }]}
        apresGroups={[GROUPE]}
      />,
    );
  }

  it("pose un lien de téléchargement d'archive ciblé sur CET apprenant et CETTE phase", () => {
    renderAvecApprenant();
    const lien = screen.getByRole('link', {
      name: /télécharger les documents de Johanna FOURNEAU/i,
    });
    expect(lien.getAttribute('href')).toBe(
      `/api/sessions/${SESSION_ID}/apprenants/part-42/zip?phase=apres`,
    );
  });

  it('annonce le nombre de documents réellement téléchargeables', () => {
    renderAvecApprenant();
    expect(
      screen.getByRole('link', { name: /télécharger les documents de Johanna/i }).textContent,
    ).toContain('(2)');
  });

  it('« Tout générer » ne lance le pack QUE pour cet apprenant', async () => {
    renderAvecApprenant();
    fireEvent.click(
      screen.getByRole('button', { name: /générer les documents manquants de Johanna/i }),
    );
    await waitFor(() => expect(generateClosurePack).toHaveBeenCalledTimes(1));
    const [sessionId, options] = generateClosurePack.mock.calls[0] as [string, any];
    expect(sessionId).toBe(SESSION_ID);
    expect(options.participantIds).toEqual(['part-42']);
    // Les kinds demandés sont ceux de la phase, jamais tout le pack.
    expect(options.kinds).toContain('ATTESTATION');
    expect(options.kinds).not.toContain('EMARGEMENT');
  });

  it("n'appelle pas le générateur d'assiduité quand l'apprenant n'est pas AGEFICE", async () => {
    renderAvecApprenant();
    fireEvent.click(
      screen.getByRole('button', { name: /générer les documents manquants de Johanna/i }),
    );
    await waitFor(() => expect(generateClosurePack).toHaveBeenCalled());
    expect(dispatchGenerateDoc).not.toHaveBeenCalled();
  });

  it("lance le générateur dédié quand l'assiduité AGEFICE manque (hors pack)", async () => {
    render(
      <TabApres
        sessionId={SESSION_ID}
        productId={PRODUCT_ID}
        canWrite
        sessionDocs={{
          deroule: { state: 'missing' },
          grilleObs: { state: 'missing' },
          checklist: { state: 'missing' },
          satisfactionSession: { state: 'missing' },
        }}
        closureItems={[{ state: 'missing' }]}
        apresGroups={[
          {
            ...GROUPE,
            items: [
              ...GROUPE.items,
              { docType: 'ASSIDUITE', label: 'Assiduité AGEFICE', state: 'missing' as const },
            ],
            missingCount: 2,
          },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /générer les documents manquants de Johanna/i }),
    );
    await waitFor(() => expect(dispatchGenerateDoc).toHaveBeenCalledTimes(1));
    expect((dispatchGenerateDoc.mock.calls[0] as [any])[0]).toMatchObject({
      docType: 'ASSIDUITE_AGEFICE',
      participantId: 'part-42',
    });
  });

  it('propose « Télécharger » à côté d’« Ouvrir » — seul le premier porte ?dl=1', () => {
    renderAvecApprenant();
    const dl = screen.getByRole('link', { name: /télécharger Attestation de fin/i });
    expect(dl.getAttribute('href')).toBe('/api/documents/d1?dl=1');
  });

  /**
   * L'attestation d'assiduité AGEFICE a quitté l'onglet « Avant » le
   * 2026-09-10 (elle y faussait le compteur de l'archive). Son bouton de ligne
   * l'a suivie ici : sans lui, on ne pourrait plus la RÉgénérer, le pack de fin
   * de formation ne la produisant pas.
   */
  function renderAvecAssiduite(state: 'generated' | 'missing') {
    return render(
      <TabApres
        sessionId={SESSION_ID}
        productId={PRODUCT_ID}
        canWrite
        sessionDocs={{
          deroule: { state: 'missing' },
          grilleObs: { state: 'missing' },
          checklist: { state: 'missing' },
          satisfactionSession: { state: 'missing' },
        }}
        closureItems={[{ state: 'missing' }]}
        apresGroups={[
          {
            ...GROUPE,
            items: [
              ...GROUPE.items,
              {
                docType: 'ASSIDUITE',
                label: "Attestation d'assiduité",
                state,
                ...(state === 'generated'
                  ? { pdfUrl: '/api/documents/d9', downloadUrl: '/api/documents/d9?dl=1' }
                  : {}),
              },
            ],
          },
        ]}
      />,
    );
  }

  it("porte le bouton « Générer » de l'attestation d'assiduité sur sa ligne", async () => {
    renderAvecAssiduite('missing');
    fireEvent.click(
      screen.getByRole('button', { name: /générer l'attestation d'assiduité de Johanna/i }),
    );
    await waitFor(() => expect(dispatchGenerateDoc).toHaveBeenCalledTimes(1));
    expect((dispatchGenerateDoc.mock.calls[0] as [any])[0]).toMatchObject({
      docType: 'ASSIDUITE_AGEFICE',
      participantId: 'part-42',
      force: false,
    });
  });

  it("propose « Régénérer » quand l'attestation existe déjà, et force la reprise", async () => {
    renderAvecAssiduite('generated');
    fireEvent.click(
      screen.getByRole('button', { name: /régénérer l'attestation d'assiduité de Johanna/i }),
    );
    await waitFor(() => expect(dispatchGenerateDoc).toHaveBeenCalledTimes(1));
    expect((dispatchGenerateDoc.mock.calls[0] as [any])[0]).toMatchObject({
      docType: 'ASSIDUITE_AGEFICE',
      force: true,
    });
  });

  it('ne montre aucun bloc nominatif quand la session n’a pas d’inscrit', () => {
    renderTab();
    expect(screen.queryByText(/par apprenant/i)).toBeNull();
  });
});
