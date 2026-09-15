import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Rattacher une demande d'inscription à une session — le chaînon manquant.
 *
 * `PreEnrollment.intendedSessionId` existe depuis toujours, mais AUCUN écran ne
 * l'écrivait hors du formulaire public par session. Conséquences relevées le
 * 15/09/2026 sur la base de production : 11 dossiers sur 14 sans session (liens
 * « Nouveau formulaire » et campagnes RDV, qui n'en posent jamais), et aucun
 * moyen de corriger un dossier déposé sur le lien de la mauvaise session.
 *
 * Or sans session, `enrollFromRequest` refuse net (« Cette demande n'est
 * rattachée à aucune session ») : ces dossiers ne pouvaient JAMAIS être
 * inscrits en un clic. Il fallait tout refaire à la main.
 */

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  preEnrollmentFindFirst: vi.fn(),
  preEnrollmentUpdate: vi.fn(),
  sessionFindFirst: vi.fn(),
  participantFindUnique: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    preEnrollment: { findFirst: m.preEnrollmentFindFirst, update: m.preEnrollmentUpdate },
    trainingSession: { findFirst: m.sessionFindFirst },
    sessionParticipant: { findUnique: m.participantFindUnique },
    auditLog: { create: m.auditCreate },
  },
}));
// `@/lib/rbac` est mocké ENTIÈREMENT, sans importActual : le module réel
// remonte jusqu'à `lib/auth`, qui importe `cache` de React — indisponible hors
// rendu, d'où « cache is not a function ». Les deux classes d'erreur sont donc
// redéclarées ici ; elles ne servent qu'aux `instanceof` du code testé.
vi.mock('@/lib/rbac', () => ({
  requireRole: m.requireRole,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { rattacherDemandeASession } from '../rattacher-demande-session';

const DEMANDE = {
  id: 'pe-1',
  tenantId: 'tenant-1',
  intendedSessionId: 'ses-ancienne',
  status: 'EXTRACTED',
  firstName: 'Deborah',
  lastName: 'TRESARIEUX',
  convertedToPersonId: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.requireRole.mockResolvedValue({ id: 'u1', tenantId: 'tenant-1' });
  m.preEnrollmentFindFirst.mockResolvedValue(DEMANDE);
  m.sessionFindFirst.mockResolvedValue({ id: 'ses-cible', code: 'SES-0113' });
  m.participantFindUnique.mockResolvedValue(null);
  m.preEnrollmentUpdate.mockResolvedValue({});
});

describe('rattacherDemandeASession', () => {
  it('écrit la session cible et rend son code', async () => {
    const r = await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: 'ses-cible' });
    expect(r).toMatchObject({ ok: true, sessionCode: 'SES-0113' });
    expect(m.preEnrollmentUpdate.mock.calls[0]![0]).toMatchObject({
      where: { id: 'pe-1' },
      data: { intendedSessionId: 'ses-cible' },
    });
  });

  it('reste scopé au tenant sur les DEUX lectures', async () => {
    // Le test de puissance : un rattachement mal scopé laisserait pointer un
    // dossier vers la session d'un autre organisme.
    await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: 'ses-cible' });
    expect(m.preEnrollmentFindFirst.mock.calls[0]![0].where).toMatchObject({ tenantId: 'tenant-1' });
    expect(m.sessionFindFirst.mock.calls[0]![0].where).toMatchObject({ tenantId: 'tenant-1' });
  });

  it('journalise le déplacement', async () => {
    await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: 'ses-cible' });
    expect(m.auditCreate).toHaveBeenCalled();
    const data = m.auditCreate.mock.calls[0]![0].data;
    expect(data.entity).toBe('PreEnrollment');
    expect(data.entityId).toBe('pe-1');
  });

  it('détache quand la session est nulle', async () => {
    const r = await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: null });
    expect(r).toMatchObject({ ok: true, sessionCode: null });
    expect(m.preEnrollmentUpdate.mock.calls[0]![0].data.intendedSessionId).toBeNull();
    expect(m.sessionFindFirst).not.toHaveBeenCalled();
  });

  it('refuse une session inconnue, sans rien écrire', async () => {
    m.sessionFindFirst.mockResolvedValue(null);
    const r = await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: 'ses-fantome' });
    expect(r.ok).toBe(false);
    expect(m.preEnrollmentUpdate).not.toHaveBeenCalled();
  });

  it('refuse une demande inconnue, sans rien écrire', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue(null);
    const r = await rattacherDemandeASession({ preEnrollmentId: 'pe-x', sessionId: 'ses-cible' });
    expect(r.ok).toBe(false);
    expect(m.preEnrollmentUpdate).not.toHaveBeenCalled();
  });

  it('ne réécrit rien quand la demande est déjà sur cette session', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ ...DEMANDE, intendedSessionId: 'ses-cible' });
    const r = await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: 'ses-cible' });
    expect(r.ok).toBe(true);
    expect(m.preEnrollmentUpdate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('prévient quand la personne reste inscrite à la session quittée', async () => {
    // Déplacer le dossier ne déplace PAS l'inscription : le participant reste
    // dans l'ancienne session. Le taire laisserait un inscrit fantôme dont
    // personne ne saurait d'où il vient.
    m.preEnrollmentFindFirst.mockResolvedValue({
      ...DEMANDE,
      status: 'CONVERTED',
      convertedToPersonId: 'per-1',
    });
    m.participantFindUnique.mockResolvedValue({ id: 'part-1' });
    const r = await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: 'ses-cible' });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('inattendu');
    expect(r.avertissement).toBeTruthy();
    expect(r.avertissement!.toLowerCase()).toContain('inscri');
  });

  it('ne cherche pas d’inscription fantôme quand la demande n’est pas convertie', async () => {
    await rattacherDemandeASession({ preEnrollmentId: 'pe-1', sessionId: 'ses-cible' });
    expect(m.participantFindUnique).not.toHaveBeenCalled();
  });
});
