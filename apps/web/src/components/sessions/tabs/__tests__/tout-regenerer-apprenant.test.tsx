/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * « Tout regénérer » par apprenant — demande de Laurent du 11/09/2026, sur le
 * modèle du « tout télécharger » posé la veille sur la même ligne.
 *
 * Le bouton existant, « Tout générer », ne traite que les documents MANQUANTS
 * et disparaît dès qu'un apprenant est complet. Or le besoin courant est
 * l'inverse : une correction vient d'être apportée — l'adresse du lieu, le nom
 * d'un apprenant, le tarif — et il faut refaire des pièces DÉJÀ produites.
 * Il fallait alors les reprendre une par une dans la matrice.
 *
 * Deux garanties, vérifiées ici :
 *  - la régénération est demandée explicitement (`force`), sinon les
 *    générateurs sautent ce qui existe déjà et le bouton ne ferait rien ;
 *  - elle reste cantonnée à CET apprenant et à CETTE phase.
 *
 * Ce que les tests ne couvrent pas parce que le serveur s'en charge : les
 * documents engagés (signés, envoyés) ne sont jamais remplacés — le régime
 * « groupe » de `checkDocumentReplacement` les saute et les remonte.
 *
 * Test de puissance : retirer `force: true` du handler fait virer ROUGE
 * « demande explicitement la régénération ».
 */

const generateClosurePack = vi.fn(async (..._a: unknown[]) => ({ ok: true, total: 6 }));
const dispatchGenerateDoc = vi.fn(async (..._a: unknown[]) => ({ ok: true }));

vi.mock('@/server/actions/closure-pack', () => ({
  generateClosurePack: (...a: unknown[]) => generateClosurePack(...a),
}));
vi.mock('@/server/actions/dispatch-generate-doc', () => ({
  dispatchGenerateDoc: (...a: unknown[]) => dispatchGenerateDoc(...a),
  dispatchGenerateMissing: vi.fn(async () => ({ ok: true, total: 0, success: 0, failed: 0, errors: [] })),
}));
vi.mock('@/server/actions/deroule-product-generator', () => ({
  generateDerouleForProduct: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/server/actions/generate-grille-obs-session', () => ({
  generateGrilleObsSessionForSession: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/server/actions/generate-checklist-formation', () => ({
  generateChecklistForSession: vi.fn(async () => ({ ok: true })),
}));
// L'onglet embarque <SignedDocDropZone>, qui importe la server action : sans ce
// mock, la chaîne @/lib/rbac → @/lib/auth exécute `cache()` de React,
// indisponible en jsdom.
vi.mock('@/server/actions/qualiopi-matrix', () => ({
  regenerateParticipantDoc: vi.fn(async () => ({ ok: true })),
  attachSignedScan: vi.fn(async () => ({ ok: true })),
  // Fusion du 12/09/2026 : la zone de dépôt et la modale de cellule appellent
  // ces deux-là depuis le lot A de la signature. Un module remplacé ne fournit
  // que ce que sa fabrique déclare.
  uploadSignedDoc: vi.fn(async () => ({ ok: true })),
  uploadSignedScans: vi.fn(async () => ({ ok: true, saved: 0, failures: [] })),
}));
// Fusion du 12/09/2026 — le bloc « Signature » des onglets Avant / Après (lot
// C.2b-2) importe ses trois server actions. Ce test est né sur `main`, où
// l'onglet ne les traînait pas ; il est vert des deux côtés séparément, et
// c'est leur COMBINAISON qui exige ce mock : sans lui, la chaîne
// @/lib/rbac → @/lib/auth exécute `cache()` de React, indisponible en jsdom.
vi.mock('@/server/actions/signature-envoi', () => ({
  preparerEnvoiSignature: vi.fn(async () => ({
    ok: true,
    sessionId: 'ses-1',
    envois: [],
    blocages: [],
    avertissements: [],
  })),
  sendForSignature: vi.fn(async () => ({ ok: true, envoyes: [], refus: [] })),
  annulerEnvoiSignature: vi.fn(async () => ({
    ok: true,
    signatureRequestId: 'req-1',
    sessionId: 'ses-1',
    pieces: [],
  })),
}));
vi.mock('@/server/actions/generate-satisfaction-session', () => ({
  generateSatisfactionSessionForSession: vi.fn(async () => ({ ok: true })),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TabApres } from '../tab-apres';

const SESSION_ID = 'ses-1';
const PRODUCT_ID = 'prod-1';

/** Un apprenant dont TOUT est déjà produit : « Tout générer » n'a plus lieu d'être. */
const COMPLET = {
  participantId: 'part-42',
  fullName: 'Johanna FOURNEAU',
  sponsorOrgLabel: 'SOLUTION IMMO',
  readyCount: 2,
  missingCount: 0,
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
  ],
};

function renderTab(groupe = COMPLET, canWrite = true) {
  return render(
    <TabApres
      sessionId={SESSION_ID}
      productId={PRODUCT_ID}
      canWrite={canWrite}
      sessionDocs={{
        deroule: { state: 'missing' },
        grilleObs: { state: 'missing' },
        checklist: { state: 'missing' },
        satisfactionSession: { state: 'missing' },
      }}
      closureItems={[{ state: 'missing' }]}
      apresGroups={[groupe]}
    />,
  );
}

beforeEach(() => {
  generateClosurePack.mockClear();
  dispatchGenerateDoc.mockClear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('« Tout regénérer » par apprenant', () => {
  it('est proposé même quand plus rien ne manque — c’est tout son intérêt', () => {
    renderTab();
    // « Tout générer » a disparu (0 manquant), « Tout regénérer » reste.
    expect(screen.queryByRole('button', { name: /générer les documents manquants/i })).toBeNull();
    expect(
      screen.getByRole('button', { name: /regénérer les documents de Johanna FOURNEAU/i }),
    ).toBeTruthy();
  });

  it('demande explicitement la régénération, sinon les générateurs sauteraient l’existant', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /regénérer les documents de Johanna/i }));

    await waitFor(() => expect(generateClosurePack).toHaveBeenCalledTimes(1));
    const [, options] = generateClosurePack.mock.calls[0] as [string, any];
    expect(options.force).toBe(true);
  });

  it('reste cantonné à cet apprenant et à cette phase', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /regénérer les documents de Johanna/i }));

    await waitFor(() => expect(generateClosurePack).toHaveBeenCalled());
    const [sessionId, options] = generateClosurePack.mock.calls[0] as [string, any];
    expect(sessionId).toBe(SESSION_ID);
    expect(options.participantIds).toEqual(['part-42']);
    expect(options.kinds).toContain('ATTESTATION');
    expect(options.kinds).not.toContain('EMARGEMENT');
  });

  it('ne fait rien si la confirmation est refusée', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /regénérer les documents de Johanna/i }));

    await waitFor(() => expect(generateClosurePack).not.toHaveBeenCalled());
  });

  it('refait aussi l’attestation d’assiduité AGEFICE, qui n’est pas dans le pack', async () => {
    renderTab({
      ...COMPLET,
      readyCount: 3,
      items: [
        ...COMPLET.items,
        {
          docType: 'ASSIDUITE',
          label: "Attestation d'assiduité AGEFICE",
          state: 'generated' as const,
          pdfUrl: '/api/documents/d3',
          downloadUrl: '/api/documents/d3?dl=1',
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /regénérer les documents de Johanna/i }));

    await waitFor(() => expect(dispatchGenerateDoc).toHaveBeenCalled());
    const appel = dispatchGenerateDoc.mock.calls[0]![0] as any;
    expect(appel.docType).toBe('ASSIDUITE_AGEFICE');
    expect(appel.force).toBe(true);
  });

  it('n’est pas proposé à qui n’a pas le droit d’écrire', () => {
    renderTab(COMPLET, false);
    expect(screen.queryByRole('button', { name: /regénérer les documents/i })).toBeNull();
  });

  it('n’est pas proposé quand l’apprenant n’a encore aucun document', () => {
    renderTab({ ...COMPLET, readyCount: 0, missingCount: 2, items: [] });
    expect(screen.queryByRole('button', { name: /regénérer les documents/i })).toBeNull();
  });
});
