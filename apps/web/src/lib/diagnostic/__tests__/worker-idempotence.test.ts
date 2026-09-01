import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le traitement d'une soumission est déclenché par TROIS chemins (navigateur du
 * prospect, cron de rattrapage, bouton du CRM). La garantie qui les rend
 * compatibles : personne ne reçoit deux fois le même programme.
 *
 * Le prospect peut rafraîchir l'écran de remerciement, revenir en arrière, ou
 * son navigateur rejouer la requête `keepalive` — aucune de ces situations ne
 * doit produire un second email.
 */

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    diagnosticSubmission: {
      findUnique: m.findUnique,
      findMany: vi.fn(),
      updateMany: m.updateMany,
      update: m.update,
      count: m.count,
    },
    trainingProduct: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/mailer', () => ({ sendMail: m.sendMail }));
vi.mock('@/lib/of-config', () => ({ loadOfConfig: vi.fn() }));

import { processDiagnosticSubmission } from '../worker';

const BASE = {
  id: 'sub-1',
  tenantId: 'tenant-1',
  attempts: 0,
  reponses: {},
  dominante: 'IA_PRODUCTIVITE',
  secondaire: null,
  lead: { firstName: 'Camille', email: 'camille@example.com' },
};

beforeEach(() => vi.clearAllMocks());

describe('processDiagnosticSubmission — idempotence', () => {
  it('ne renvoie RIEN sur une soumission déjà envoyée', async () => {
    m.findUnique.mockResolvedValue({ ...BASE, programmeStatus: 'SENT' });
    const r = await processDiagnosticSubmission('sub-1');
    expect(r).toEqual({ ok: true, statut: 'DEJA_TRAITE' });
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('ne relance pas une soumission neutralisée par les réglages (SKIPPED)', async () => {
    m.findUnique.mockResolvedValue({ ...BASE, programmeStatus: 'SKIPPED' });
    expect(await processDiagnosticSubmission('sub-1')).toEqual({ ok: true, statut: 'DEJA_TRAITE' });
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it('n’insiste pas sur une soumission abandonnée (FAILED)', async () => {
    m.findUnique.mockResolvedValue({ ...BASE, programmeStatus: 'FAILED', attempts: 3 });
    expect(await processDiagnosticSubmission('sub-1')).toEqual({ ok: true, statut: 'DEJA_TRAITE' });
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it('distingue un id inconnu — le navigateur ne doit pas pouvoir sonder la base', async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await processDiagnosticSubmission('inconnu')).toEqual({
      ok: false,
      statut: 'INTROUVABLE',
    });
  });

  it('laisse passer celui qui perd la course au verrou, sans doubler l’email', async () => {
    m.findUnique.mockResolvedValue({ ...BASE, programmeStatus: 'PENDING' });
    // Un autre déclencheur a pris la soumission entre le SELECT et l'UPDATE.
    m.updateMany.mockResolvedValue({ count: 0 });
    const r = await processDiagnosticSubmission('sub-1');
    expect(r).toEqual({ ok: true, statut: 'DEJA_PRISE' });
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it('s’arrête au plafond de tentatives sans repartir en boucle', async () => {
    m.findUnique.mockResolvedValue({ ...BASE, programmeStatus: 'PENDING', attempts: 3 });
    expect(await processDiagnosticSubmission('sub-1')).toEqual({ ok: true, statut: 'DEJA_PRISE' });
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
