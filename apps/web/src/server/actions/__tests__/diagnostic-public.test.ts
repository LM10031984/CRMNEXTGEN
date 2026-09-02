import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le formulaire du stand est PUBLIC : le navigateur peut mentir. Trois garanties
 * testées ici, dans l'ordre de ce qu'elles coûtent si elles sautent :
 *  1. un prospect qui demande un rappel « cette semaine » SANS numéro est
 *     refusé côté serveur, même si le client a laissé passer — un lead chaud
 *     sans téléphone est un lead mort ;
 *  2. la priorité calculée atterrit en TÊTE de `lastAction` et de `notes` :
 *     c'est le seul endroit où Laurent la lit le lendemain matin ;
 *  3. l'action rend le `submissionId`, sans quoi le navigateur ne peut pas
 *     déclencher l'envoi du programme (et personne ne reçoit rien).
 */

const m = vi.hoisted(() => ({
  tenantFindFirst: vi.fn(),
  leadCreate: vi.fn(),
  submissionCreate: vi.fn(),
  transaction: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    tenant: { findFirst: m.tenantFindFirst },
    $transaction: m.transaction,
  },
}));
vi.mock('next/headers', () => ({ headers: m.headers }));

import { soumettreDiagnostic } from '../diagnostic-public';
import { _resetRateLimit } from '@/lib/enrollment/rate-limit';

/** Agent commercial seul, mandats en baisse, aucune formation cette année. */
const REPONSES_CHAUD = {
  role: 'AGENT_CO',
  equipe: 'SEUL',
  temps_perdu: 'PROSPECTION',
  mandats: 'BAISSE',
  usage_ia: 'JAMAIS',
  origine_affaires: 'TERRAIN',
  priorite: 'MANDATS',
  formation_annee: 'NON',
};

const CONTACT = {
  firstName: 'Camille',
  lastName: 'Roy',
  email: 'Camille.ROY@example.com',
  phone: '',
  rgpdAccepted: true as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimit();
  m.headers.mockResolvedValue(new Headers({ 'x-forwarded-for': '198.51.100.7' }));
  m.tenantFindFirst.mockResolvedValue({ id: 'tenant-1' });
  m.leadCreate.mockResolvedValue({ id: 'lead-1' });
  m.submissionCreate.mockResolvedValue({ id: 'sub-1' });
  m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ lead: { create: m.leadCreate }, diagnosticSubmission: { create: m.submissionCreate } }),
  );
});

describe('soumettreDiagnostic — le téléphone du lead chaud', () => {
  it('refuse « cette semaine » sans numéro, même si le client a laissé passer', async () => {
    const r = await soumettreDiagnostic({
      reponses: REPONSES_CHAUD,
      contact: CONTACT,
      rappel: 'CETTE_SEMAINE',
    });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ error: expect.stringMatching(/numéro/i) });
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('accepte « cette semaine » avec un numéro', async () => {
    const r = await soumettreDiagnostic({
      reponses: REPONSES_CHAUD,
      contact: { ...CONTACT, phone: '06 12 34 56 78' },
      rappel: 'CETTE_SEMAINE',
    });
    expect(r.ok).toBe(true);
  });

  it('laisse le téléphone facultatif sur les autres créneaux', async () => {
    const r = await soumettreDiagnostic({
      reponses: REPONSES_CHAUD,
      contact: CONTACT,
      rappel: 'PLUS_TARD',
    });
    expect(r.ok).toBe(true);
  });

  it('exige un créneau de rappel : sans lui, le tri des leads n’existe pas', async () => {
    const r = await soumettreDiagnostic({
      reponses: REPONSES_CHAUD,
      contact: CONTACT,
      rappel: undefined,
    });
    expect(r.ok).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});

describe('soumettreDiagnostic — ce qui atterrit dans le CRM', () => {
  it('écrit la priorité en tête de lastAction ET de notes', async () => {
    await soumettreDiagnostic({
      reponses: REPONSES_CHAUD,
      contact: { ...CONTACT, phone: '06 12 34 56 78' },
      rappel: 'CETTE_SEMAINE',
    });

    const data = m.leadCreate.mock.calls[0]![0].data;
    expect(data.lastAction).toBe(
      '[A] Diagnostic — Rentrer plus de mandats, sans y passer ses journées — rappel cette semaine',
    );
    expect(data.notes.startsWith(data.lastAction)).toBe(true);
    expect(data.notes).toContain('Motifs :');
    expect(data.lastActionAt).toBeInstanceOf(Date);
  });

  it('classe en C un profil sans aucun signal, sans le refuser pour autant', async () => {
    await soumettreDiagnostic({
      reponses: { ...REPONSES_CHAUD, mandats: 'STABLE', formation_annee: 'OUI' },
      contact: CONTACT,
      rappel: 'PLUS_TARD',
    });
    expect(m.leadCreate.mock.calls[0]![0].data.lastAction).toMatch(/^\[C\] /);
  });

  it('rend le submissionId — sans lui, aucun programme ne part', async () => {
    const r = await soumettreDiagnostic({
      reponses: REPONSES_CHAUD,
      contact: CONTACT,
      rappel: 'PLUS_TARD',
    });
    expect(r).toEqual({ ok: true, leadId: 'lead-1', submissionId: 'sub-1' });
  });

  it('ne garde que les réponses qui existent vraiment dans le questionnaire', async () => {
    await soumettreDiagnostic({
      reponses: { ...REPONSES_CHAUD, role: 'PRESIDENT_DU_MONDE', inventee: 'OUI' },
      contact: CONTACT,
      rappel: 'PLUS_TARD',
    });
    const reponses = m.submissionCreate.mock.calls[0]![0].data.reponses;
    expect(reponses).not.toHaveProperty('inventee');
    expect(reponses).not.toHaveProperty('role');
    expect(reponses.mandats).toBe('BAISSE');
  });

  it('normalise l’email en minuscules (dédoublonnage à froid après le salon)', async () => {
    await soumettreDiagnostic({ reponses: REPONSES_CHAUD, contact: CONTACT, rappel: 'PLUS_TARD' });
    expect(m.leadCreate.mock.calls[0]![0].data.email).toBe('camille.roy@example.com');
  });
});
