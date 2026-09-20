import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(), participant: vi.fn(), candidates: vi.fn(), update: vi.fn(), mail: vi.fn(), config: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ validateRequest: m.auth }));
vi.mock('@qualiof/db', () => ({ prisma: {
  sessionParticipant: { findFirst: m.participant },
  opcoSubmission: { findMany: m.candidates, update: m.update },
} }));
vi.mock('@/lib/mailer', () => ({ sendMail: m.mail }));
vi.mock('@/lib/of-config', () => ({ loadOfConfig: m.config }));
import { sendDossierReminderEmail } from '../dossier-reminder';
import { GET } from '@/app/api/cron/opco-submission-reminders/route';

function participant(regime: 'ENTREPRISE' | 'INDIVIDUEL' | null, role: string | null, participantType = 'independant') {
  return {
    id: 'participant', sessionId: 'session', sponsorOrgId: 'org', participantType,
    invoiceSent: true, opcoReimbursed: false, paymentReceived: false, priceHT: 100,
    person: { firstName: 'Test', lastName: 'Apprenant', legalLinks: role ? [
      { organizationId: 'org', role, startDate: null, endDate: null },
    ] : [] },
    sponsorOrg: { legalName: 'Entreprise test', opcoCode: 'AGEFICE', email: 'company@example.test', emailBilling: 'billing@example.test' },
    session: { id: 'session', regime, code: 'SES-TEST', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-03'), product: { title: 'Formation test' } },
  };
}
function submission(id: string, p: ReturnType<typeof participant>) {
  return {
    id, tenantId: 'tenant', participant: p, sponsorOrg: p.sponsorOrg,
    sentAt: new Date('2026-08-01'), lastReminderSentAt: null, reminderCount: 0,
    recipientEmail: `${id}@example.test`,
  };
}
const cron = () => GET(new Request('https://example.test/api/cron/opco-submission-reminders', {
  headers: { authorization: 'Bearer unit-test-only' },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
  vi.stubEnv('CRON_SECRET', 'unit-test-only');
  m.auth.mockResolvedValue({ user: { id: 'user', tenantId: 'tenant', role: 'ADMIN' } });
  m.config.mockResolvedValue({ name: 'OF test', siret: 'test', rnq: 'test' });
  m.mail.mockResolvedValue({ ok: true, messageId: 'mock-message' });
  m.update.mockResolvedValue({});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const companyCases = [
  ['régime déclaré entreprise', participant('ENTREPRISE', null)],
  ['lien salarié historique', participant(null, 'SALARIE')],
  ['statut salarié de repli', participant(null, null, 'salarié')],
] as const;

describe('relance manuelle : aucun mail pour un dossier salarié', () => {
  it.each(companyCases)('bloque %s avant SMTP', async (_label, p) => {
    m.participant.mockResolvedValue(p);
    const result = await sendDossierReminderEmail('participant');
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('portail OPCO') });
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.config).not.toHaveBeenCalled();
    expect(m.participant).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'participant', session: { tenantId: 'tenant' } },
      include: expect.objectContaining({
        session: { select: expect.objectContaining({ regime: true }) },
        person: { select: expect.objectContaining({ legalLinks: expect.any(Object) }) },
      }),
    }));
  });
  it('préserve la relance AGEFICE indépendante et sa destination existante', async () => {
    m.participant.mockResolvedValue(participant('INDIVIDUEL', 'EI_SELF'));
    expect(await sendDossierReminderEmail('participant')).toMatchObject({ ok: true, reminderType: 'attente-opco' });
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: 'billing@example.test', context: expect.objectContaining({ tenantId: 'tenant', category: 'opco_reminder' }) }));
  });
});

describe('cron legacy : entreprises exclues, AGEFICE conservé', () => {
  it('ignore toutes les variantes salariés sans consommer leur compteur et livre seulement l’indépendant', async () => {
    m.candidates.mockResolvedValue([
      ...companyCases.map(([, p], i) => submission(`company-${i}`, p)),
      submission('individual', participant(null, 'EI_SELF')),
    ]);
    const response = await cron();
    expect(await response.json()).toMatchObject({ ok: true, candidates: 4, sent: 1, skipped: 3, errors: 0 });
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: 'individual@example.test' }));
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'individual' } }));
    expect(m.candidates).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ participant: { include: expect.objectContaining({
        session: { select: expect.objectContaining({ regime: true }) },
        person: { select: expect.objectContaining({ legalLinks: expect.any(Object) }) },
      }) } }),
    }));
  });
  it('ne consomme pas le compteur AGEFICE en simulation', async () => {
    m.candidates.mockResolvedValue([submission('individual', participant('INDIVIDUEL', 'EI_SELF'))]);
    m.mail.mockResolvedValue({ ok: true, dryRun: true });
    expect(await (await cron()).json()).toMatchObject({ sent: 0, skipped: 1, dryRun: true });
    expect(m.update).not.toHaveBeenCalled();
  });
});
