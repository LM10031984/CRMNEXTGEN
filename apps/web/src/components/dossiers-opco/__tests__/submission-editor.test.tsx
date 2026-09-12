/* @vitest-environment jsdom */

/**
 * Lot D — l'écran « Dossier prêt », à l'écran.
 *
 * TROIS PROMESSES, et ce fichier est ce qui les tient :
 *
 *  (a) **L'état de SIGNATURE de chaque pièce se lit sans cliquer.** Avant, la
 *      liste ne disait rien : un admin envoyait une convention vierge sans
 *      qu'aucun écran ne l'en avertisse, et le financeur le lui apprenait des
 *      semaines plus tard.
 *  (b) **Le blocage est NOMINATIF et présent AVANT le clic.** Le refus existait
 *      côté serveur depuis ce lot, mais le découvrir au clic fait refaire le
 *      chemin pour rien.
 *  (c) **Le forçage EXISTE ou n'existe pas** — jamais grisé. Ici ce n'est pas
 *      un réglage qui manque, c'est un rôle : un bouton grisé ferait chercher
 *      une case à cocher.
 *
 * ⚠ `beforeEach(cleanup)` : sans lui le DOM du test précédent survit et rend
 * tous les `queryBy*` menteurs (constaté en C.2b-1).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const sendOpcoSubmission = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const updateOpcoSubmissionDraft = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const markOpcoSubmissionStatus = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));

vi.mock('@/server/actions/opco-submission', () => ({
  sendOpcoSubmission: (...a: unknown[]) => sendOpcoSubmission(...a),
  updateOpcoSubmissionDraft: (...a: unknown[]) => updateOpcoSubmissionDraft(...a),
  markOpcoSubmissionStatus: (...a: unknown[]) => markOpcoSubmissionStatus(...a),
}));
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { SubmissionEditor } from '../submission-editor';
import type { SubmissionAttachment } from '@/server/actions/opco-submission';

const PJ_SIGNEES: SubmissionAttachment[] = [
  { key: 'signed/c.pdf', filename: 'Convention.pdf', kind: 'CONVENTION', included: true, signe: true },
  { key: 'signed/a.pdf', filename: 'Agefice.pdf', kind: 'AGEFICE_PA_FORM', included: true, signe: true },
  { key: 'signed/c.audit-trail.pdf', filename: 'Certificat.pdf', kind: 'AUDIT_TRAIL', included: true, signe: false },
];
const PJ_NON_SIGNEES: SubmissionAttachment[] = [
  { key: 'docs/c.pdf', filename: 'Convention.pdf', kind: 'CONVENTION', included: true, signe: false },
  { key: 'signed/a.pdf', filename: 'Agefice.pdf', kind: 'AGEFICE_PA_FORM', included: true, signe: true },
];

function editeur(over: { attachments?: SubmissionAttachment[]; role?: string; recipientEmail?: string | null } = {}) {
  return (
    <SubmissionEditor
      id="sub-1"
      role={over.role ?? 'ADMIN'}
      initial={{
        recipientEmail: over.recipientEmail === undefined ? 'formation@cci-nice.fr' : over.recipientEmail,
        subject: 'Dossier AGEFICE',
        bodyHtml: '<p>x</p>',
        attachments: over.attachments ?? PJ_SIGNEES,
        apprenantName: 'Jean DUPONT',
        sponsorName: 'DUPONT Jean (AGEFICE)',
        sessionLabel: 'IA immobilier · 01 oct. 2026',
      }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('(a) l’état de signature se lit sur chaque pièce', () => {
  it('une pièce signée le dit', () => {
    render(editeur());
    expect(screen.getAllByText('Signée').length).toBe(2);
  });

  it('une pièce exigée non signée le dit aussi, et pas en silence', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES }));
    expect(screen.getByText('Non signée')).not.toBeNull();
  });

  it('le certificat de signature n’est ni « signé » ni « non signé » — il EST la preuve', () => {
    render(editeur());
    // 3 pièces, 2 mentions : le certificat n'en porte aucune.
    expect(screen.queryAllByText('Non signée')).toHaveLength(0);
    expect(screen.getAllByText('Signée')).toHaveLength(2);
  });
});

describe('(b) le blocage, nominatif et AVANT le clic', () => {
  it('annonce « Dossier prêt » quand tout est signé', () => {
    render(editeur());
    expect(screen.getByText(/Dossier prêt/)).not.toBeNull();
  });

  it('nomme la pièce qui retient le dossier', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES }));
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toContain('Convention de formation non signée');
  });

  it('le bouton d’envoi ordinaire n’envoie pas un dossier incomplet', async () => {
    render(editeur({ attachments: PJ_NON_SIGNEES }));
    const bouton = screen.getByRole('button', { name: /Envoyer maintenant/ });
    expect(bouton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(bouton);
    await waitFor(() => expect(sendOpcoSubmission).not.toHaveBeenCalled());
  });

  it('sans destinataire, c’est l’adresse qui est nommée, pas les signatures', () => {
    render(editeur({ recipientEmail: null }));
    expect(screen.getByRole('alert').textContent).toContain('Aucune adresse destinataire');
  });
});

describe('(c) le forçage — il existe, ou il n’existe pas', () => {
  it('offert à un ADMIN devant un dossier incomplet', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES, role: 'ADMIN' }));
    expect(screen.getByRole('button', { name: /Envoyer quand même/ })).not.toBeNull();
  });

  it('ABSENT du DOM pour un MANAGER — pas grisé, absent', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES, role: 'MANAGER' }));
    expect(screen.queryByRole('button', { name: /Envoyer quand même/ })).toBeNull();
  });

  it('absent quand le dossier est complet : il n’y a rien à forcer', () => {
    render(editeur({ role: 'ADMIN' }));
    expect(screen.queryByRole('button', { name: /Envoyer quand même/ })).toBeNull();
  });

  it('forcer appelle bien l’envoi AVEC `force`, jamais l’envoi ordinaire', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(editeur({ attachments: PJ_NON_SIGNEES, role: 'ADMIN' }));
    fireEvent.click(screen.getByRole('button', { name: /Envoyer quand même/ }));
    await waitFor(() =>
      expect(sendOpcoSubmission).toHaveBeenCalledWith('sub-1', { force: true }),
    );
  });

  it('un envoi ordinaire ne passe JAMAIS `force`', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(editeur());
    fireEvent.click(screen.getByRole('button', { name: /Envoyer maintenant/ }));
    await waitFor(() => expect(sendOpcoSubmission).toHaveBeenCalledWith('sub-1'));
  });
});
