import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 14 Plan 14-06 Task 1 — server action wrapper `syncSessionCalendarAction`.
 *
 * Stratégie de mock (pattern repo, cf sync-state.test.ts via vi.hoisted) :
 *  - `@/lib/rbac`          → requireRole mocké (auth-gate, renvoie le user).
 *  - `@/lib/calendar/load-session-ctx` → loadSessionEventCtx mocké (ctx | null).
 *  - `@/lib/calendar/sync-session`     → syncSessionCalendar mocké (le cœur).
 *  - `@qualiof/db`         → prisma.auditLog.create mocké.
 *  - `next/cache`          → revalidatePath no-op.
 *
 * Aucun appel réel à Google Calendar (cœur entièrement mocké).
 *
 * Coverage (acceptance) :
 *  (a) requireRole appelé avec ['ADMIN','MANAGER'].
 *  (b) ctx null → { ok:false } SANS appel cœur ET SANS auditLog.create.
 *  (b') missingTrainerEmail → { ok:false } SANS appel cœur ET SANS auditLog.
 *  (c) succès → cœur appelé avec syncMode 'auto' et notifyLearners propagé.
 *  (d) tenantId du user propagé au cœur (scope multi-tenant).
 *  (e) succès → auditLog.create avec action 'sessions.calendarSynced' + entityId.
 */

const { requireRole, loadSessionEventCtx, syncSessionCalendar, auditCreate } = vi.hoisted(
  () => ({
    requireRole: vi.fn(),
    loadSessionEventCtx: vi.fn(),
    syncSessionCalendar: vi.fn(),
    auditCreate: vi.fn(),
  }),
);

vi.mock('@/lib/rbac', () => ({
  requireRole,
  // Erreurs réelles : on garde des classes pour le instanceof du try/catch action.
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock('@/lib/calendar/load-session-ctx', () => ({ loadSessionEventCtx }));
vi.mock('@/lib/calendar/sync-session', () => ({ syncSessionCalendar }));

vi.mock('@qualiof/db', () => ({
  Prisma: {},
  prisma: { auditLog: { create: auditCreate } },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { syncSessionCalendarAction } from '../calendar-sync';

const USER = { id: 'user-1', tenantId: 'tenant-1', role: 'ADMIN' };

function ctxWithEmail() {
  return {
    ctx: {
      code: 'SES-0097',
      trainerEmail: 'formateur@start-academy.fr',
      learnerEmails: ['a@x.fr'],
      startDate: new Date('2099-01-10'),
      endDate: new Date('2099-01-11'),
    },
    missingTrainerEmail: false,
  };
}

beforeEach(() => {
  requireRole.mockReset();
  loadSessionEventCtx.mockReset();
  syncSessionCalendar.mockReset();
  auditCreate.mockReset();

  requireRole.mockResolvedValue(USER);
  loadSessionEventCtx.mockResolvedValue(ctxWithEmail());
  syncSessionCalendar.mockResolvedValue({
    inserted: 19,
    updated: 0,
    skipped: 0,
    total: 19,
    errors: [],
  });
  auditCreate.mockResolvedValue(undefined);
});

describe('syncSessionCalendarAction', () => {
  it("(a) auth-gate avec requireRole(['ADMIN','MANAGER'])", async () => {
    await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: false });
    expect(requireRole).toHaveBeenCalledTimes(1);
    expect(requireRole.mock.calls[0]![0]).toEqual(['ADMIN', 'MANAGER']);
  });

  it('(b) ctx null → { ok:false } sans appeler le cœur ni écrire d\'AuditLog', async () => {
    loadSessionEventCtx.mockResolvedValue(null);
    const r = await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: true });
    expect(r.ok).toBe(false);
    expect(syncSessionCalendar).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("(b') formateur sans e-mail → { ok:false } sans cœur ni AuditLog", async () => {
    loadSessionEventCtx.mockResolvedValue({
      ctx: { ...ctxWithEmail().ctx, trainerEmail: '' },
      missingTrainerEmail: true,
    });
    const r = await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: true });
    expect(r.ok).toBe(false);
    expect(syncSessionCalendar).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("(c) succès → cœur appelé avec syncMode 'auto' et notifyLearners propagé", async () => {
    const r = await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: true });
    expect(r.ok).toBe(true);
    expect(syncSessionCalendar).toHaveBeenCalledTimes(1);
    const arg = syncSessionCalendar.mock.calls[0]![0];
    expect(arg.syncMode).toBe('auto');
    expect(arg.notifyLearners).toBe(true);
  });

  it('(c2) notifyLearners=false propagé au cœur (toggle OFF)', async () => {
    await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: false });
    expect(syncSessionCalendar.mock.calls[0]![0].notifyLearners).toBe(false);
  });

  it('(d) tenantId du user propagé au cœur (scope multi-tenant)', async () => {
    await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: false });
    const arg = syncSessionCalendar.mock.calls[0]![0];
    expect(arg.tenantId).toBe('tenant-1');
    expect(loadSessionEventCtx).toHaveBeenCalledWith('tenant-1', 's1');
  });

  it("(e) succès → auditLog.create action 'sessions.calendarSynced' + entityId", async () => {
    await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: true });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0]![0].data;
    expect(data.action).toBe('sessions.calendarSynced');
    expect(data.entity).toBe('TrainingSession');
    expect(data.entityId).toBe('s1');
    expect(data.tenantId).toBe('tenant-1');
    expect(data.userId).toBe('user-1');
  });

  it('(f) erreur du cœur → { ok:false, error } sans crash', async () => {
    syncSessionCalendar.mockRejectedValue(new Error('quota google'));
    const r = await syncSessionCalendarAction({ sessionId: 's1', notifyLearners: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('quota');
    // Le cœur a échoué → pas d'AuditLog (rien de réussi à tracer).
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
