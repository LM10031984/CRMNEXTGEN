import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase 22 Plan 22-11 Task 1 — Garde-fou applicatif des envois emails (D-06).
 *
 * Deux couches de décision :
 *  - env (plomberie)  : MAIL_DRY_RUN / SMTP_HOST — inchangée, prioritaire.
 *  - BDD (métier)     : TenantEmailSettings — fail-closed par défaut, pilotée
 *    depuis Paramètres organisme (interrupteur général + catégories + sessions test).
 *
 * Partie A — matrice PURE `resolveEmailPolicy` (aucun mock) :
 *   env × interrupteur × catégorie × session test, 13+ cas.
 * Partie B — `sendMail` (mocks prisma/nodemailer, pattern vi.hoisted projet) :
 *   ordre des couches, suppression tracée destinataire masqué (D-17), envoi SMTP intact.
 */

// ---------------------------------------------------------------------------
// Partie B mocks (hoisted) — prisma.tenantEmailSettings + nodemailer transport.
// ---------------------------------------------------------------------------

const { settingsFindUnique, smtpSendMail, createTransport } = vi.hoisted(() => {
  const smtpSendMail = vi.fn();
  return {
    settingsFindUnique: vi.fn(),
    smtpSendMail,
    createTransport: vi.fn(() => ({ sendMail: smtpSendMail })),
  };
});

vi.mock('@qualiof/db', () => ({
  prisma: {
    tenantEmailSettings: { findUnique: settingsFindUnique },
  },
}));

vi.mock('nodemailer', () => ({
  default: { createTransport },
}));

import {
  resolveEmailPolicy,
  EMAIL_CATEGORY_FIELD,
  EMAIL_CATEGORY_LABELS,
  type EmailCategory,
  type EmailPolicySettings,
} from '../email-policy';
import { EmailSettingsSchema } from '@qualiof/shared';
import { sendMail } from '../mailer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Réglages tout OFF (état par défaut au déploiement — fail-closed). */
function makeSettings(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    emailsEnabled: false,
    invoiceRemindersEnabled: false,
    preinscriptionRemindersEnabled: false,
    opcoRemindersEnabled: false,
    opcoSubmissionsEnabled: false,
    internalNotificationsEnabled: false,
    userInvitationsEnabled: false,
    testSessionIds: [] as string[],
    ...overrides,
  } as Parameters<typeof resolveEmailPolicy>[0];
}

const ALL_CATEGORIES: Array<{ category: EmailCategory; field: string }> = [
  { category: 'invoice_reminder', field: 'invoiceRemindersEnabled' },
  { category: 'preinscription_reminder', field: 'preinscriptionRemindersEnabled' },
  { category: 'opco_reminder', field: 'opcoRemindersEnabled' },
  { category: 'opco_submission', field: 'opcoSubmissionsEnabled' },
  { category: 'internal_notification', field: 'internalNotificationsEnabled' },
  { category: 'user_invitation', field: 'userInvitationsEnabled' },
];

// ---------------------------------------------------------------------------
// Partie A — matrice pure resolveEmailPolicy
// ---------------------------------------------------------------------------

describe('resolveEmailPolicy — matrice fail-closed', () => {
  it('1. settings null (aucune ligne BDD) → suppress/no-settings (fail-closed)', () => {
    expect(resolveEmailPolicy(null, { category: 'invoice_reminder', sessionId: null })).toEqual({
      decision: 'suppress',
      reason: 'no-settings',
    });
  });

  it('2. catégorie décochée + interrupteur ON → suppress/category-off', () => {
    const settings = makeSettings({ emailsEnabled: true, invoiceRemindersEnabled: false });
    expect(resolveEmailPolicy(settings, { category: 'invoice_reminder', sessionId: null })).toEqual({
      decision: 'suppress',
      reason: 'category-off',
    });
  });

  it('3. catégorie cochée + interrupteur ON → send', () => {
    const settings = makeSettings({ emailsEnabled: true, invoiceRemindersEnabled: true });
    expect(resolveEmailPolicy(settings, { category: 'invoice_reminder', sessionId: null })).toEqual({
      decision: 'send',
    });
  });

  it('4. catégorie cochée + interrupteur OFF + sessionId absent (null) → suppress/master-off', () => {
    const settings = makeSettings({ invoiceRemindersEnabled: true, testSessionIds: ['ses-test'] });
    expect(resolveEmailPolicy(settings, { category: 'invoice_reminder', sessionId: null })).toEqual({
      decision: 'suppress',
      reason: 'master-off',
    });
  });

  it('5. catégorie cochée + interrupteur OFF + sessionId undefined → suppress/master-off', () => {
    const settings = makeSettings({ invoiceRemindersEnabled: true, testSessionIds: ['ses-test'] });
    expect(resolveEmailPolicy(settings, { category: 'invoice_reminder' })).toEqual({
      decision: 'suppress',
      reason: 'master-off',
    });
  });

  it('6. catégorie cochée + interrupteur OFF + sessionId ∈ testSessionIds → send (mode session test)', () => {
    const settings = makeSettings({ invoiceRemindersEnabled: true, testSessionIds: ['ses-test'] });
    expect(
      resolveEmailPolicy(settings, { category: 'invoice_reminder', sessionId: 'ses-test' }),
    ).toEqual({ decision: 'send' });
  });

  it('7. catégorie cochée + interrupteur OFF + sessionId ∉ testSessionIds → suppress/master-off', () => {
    const settings = makeSettings({ invoiceRemindersEnabled: true, testSessionIds: ['ses-test'] });
    expect(
      resolveEmailPolicy(settings, { category: 'invoice_reminder', sessionId: 'ses-autre' }),
    ).toEqual({ decision: 'suppress', reason: 'master-off' });
  });

  it('8. catégorie DÉCOCHÉE + interrupteur OFF + sessionId ∈ testSessionIds → suppress/category-off', () => {
    // Les catégories cochées restent nécessaires même en mode session test.
    const settings = makeSettings({ invoiceRemindersEnabled: false, testSessionIds: ['ses-test'] });
    expect(
      resolveEmailPolicy(settings, { category: 'invoice_reminder', sessionId: 'ses-test' }),
    ).toEqual({ decision: 'suppress', reason: 'category-off' });
  });

  // 9-14. Test paramétré : chaque catégorie mappe sur SON boolean.
  it.each(ALL_CATEGORIES)(
    '9-14. mapping catégorie → boolean : $category ← $field',
    ({ category, field }) => {
      // Sa case cochée + master ON → send.
      const on = makeSettings({ emailsEnabled: true, [field]: true });
      expect(resolveEmailPolicy(on, { category, sessionId: null })).toEqual({ decision: 'send' });
      // TOUTES les autres cases cochées sauf la sienne + master ON → suppress/category-off.
      const others = makeSettings({
        emailsEnabled: true,
        invoiceRemindersEnabled: true,
        preinscriptionRemindersEnabled: true,
        opcoRemindersEnabled: true,
        opcoSubmissionsEnabled: true,
        internalNotificationsEnabled: true,
        userInvitationsEnabled: true,
        [field]: false,
      });
      expect(resolveEmailPolicy(others, { category, sessionId: null })).toEqual({
        decision: 'suppress',
        reason: 'category-off',
      });
    },
  );

  it('15. état par défaut au déploiement (tout false) → suppress quelle que soit la catégorie', () => {
    const settings = makeSettings();
    for (const { category } of ALL_CATEGORIES) {
      expect(resolveEmailPolicy(settings, { category, sessionId: 'ses-test' }).decision).toBe(
        'suppress',
      );
    }
  });

  it('16. EMAIL_CATEGORY_LABELS couvre les 6 catégories (libellés FR pour l’UI)', () => {
    for (const { category } of ALL_CATEGORIES) {
      expect(typeof EMAIL_CATEGORY_LABELS[category]).toBe('string');
      expect(EMAIL_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Partie A bis — la catégorie `signature` (lot C.2c, D-9)
// ---------------------------------------------------------------------------

describe('catégorie « signature » — décochable, fail-closed', () => {
  /**
   * ⚠ LA FIXTURE ÉNUMÈRE LES 12 BOOLÉENS EN DUR, et ce n'est pas de la
   * verbosité : la construire depuis `EMAIL_CATEGORY_FIELD` rendrait le test
   * tautologique — il vérifierait que la map est cohérente avec elle-même,
   * jamais que `signature` pointe vers le BON champ.
   */
  function tousCochesSaufSignature(): EmailPolicySettings {
    return {
      emailsEnabled: true,
      invoiceRemindersEnabled: true,
      preinscriptionRemindersEnabled: true,
      opcoRemindersEnabled: true,
      opcoSubmissionsEnabled: true,
      internalNotificationsEnabled: true,
      userInvitationsEnabled: true,
      diagnosticProgramsEnabled: true,
      newLeadAlertsEnabled: true,
      preEnrollmentAlertsEnabled: true,
      // Fusion du 12/09/2026 : `main` a apporté la catégorie « envoi de la
      // proposition ». Cochée comme les autres — cette fixture dit « tout est
      // coché SAUF signature », et l'énumération doit rester exhaustive pour
      // que le test garde « `signature` pointe vers le BON champ ».
      proposalSendEnabled: true,
      signatureEmailsEnabled: false,
      testSessionIds: [] as string[],
    };
  }

  it('T1.1 — décochée alors que TOUT le reste est coché ⇒ suppress/category-off', () => {
    expect(resolveEmailPolicy(tousCochesSaufSignature(), { category: 'signature' })).toEqual({
      decision: 'suppress',
      reason: 'category-off',
    });
  });

  it('T1.1 bis — cochée + interrupteur général ON ⇒ send', () => {
    const s = { ...tousCochesSaufSignature(), signatureEmailsEnabled: true };
    expect(resolveEmailPolicy(s, { category: 'signature' })).toEqual({ decision: 'send' });
  });

  it('aucune ligne de réglages ⇒ suppress/no-settings', () => {
    expect(resolveEmailPolicy(null, { category: 'signature' })).toEqual({
      decision: 'suppress',
      reason: 'no-settings',
    });
  });

  it('interrupteur général OFF + catégorie cochée + session témoin ⇒ send', () => {
    const s: EmailPolicySettings = {
      ...tousCochesSaufSignature(),
      emailsEnabled: false,
      signatureEmailsEnabled: true,
      testSessionIds: ['ses-temoin'],
    };
    expect(resolveEmailPolicy(s, { category: 'signature', sessionId: 'ses-temoin' })).toEqual({
      decision: 'send',
    });
    expect(resolveEmailPolicy(s, { category: 'signature', sessionId: 'ses-autre' })).toEqual({
      decision: 'suppress',
      reason: 'master-off',
    });
  });

  it('T1.2 — EXHAUSTIVITÉ : la liste littérale des 11 catégories = les clés des DEUX maps', () => {
    // Écrite à la main. Le libellé manquant est le défaut le plus discret :
    // l'écran afficherait `undefined` sans que rien ne casse.
    //
    // ⚠ Fusion du 12/09/2026 : `proposal_sent` arrive de `main` (D-21, envoi de
    // la proposition au client). Ce test a fait exactement son office — il a
    // rougi à la fusion, en nommant la catégorie qui manquait à la liste.
    const attendues = [
      'invoice_reminder',
      'preinscription_reminder',
      'opco_reminder',
      'opco_submission',
      'internal_notification',
      'user_invitation',
      'diagnostic_program',
      'new_lead',
      'preenrollment_submitted',
      'proposal_sent',
      'signature',
    ];
    expect(new Set(Object.keys(EMAIL_CATEGORY_FIELD))).toEqual(new Set(attendues));
    expect(new Set(Object.keys(EMAIL_CATEGORY_LABELS))).toEqual(new Set(attendues));
  });

  it('le libellé FR dit les quatre emails de la chaîne, pas seulement « signature »', () => {
    expect(EMAIL_CATEGORY_LABELS.signature).toBe(
      'Signature électronique (demandes, relances, exemplaires signés)',
    );
  });

  it('T1.5 — le défaut Zod est FALSE : une catégorie qu’on n’a pas cochée n’envoie rien', () => {
    expect(EmailSettingsSchema.parse({}).signatureEmailsEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Partie B — sendMail : ordre des couches env → BDD, suppression tracée
// ---------------------------------------------------------------------------

describe('sendMail — chokepoint 2 couches (env plomberie → réglages tenant)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ['MAIL_DRY_RUN', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.MAIL_FROM = 'Start Academy <formation@start-academy.fr>';
    settingsFindUnique.mockReset();
    smtpSendMail.mockReset();
    smtpSendMail.mockResolvedValue({ messageId: 'mid-123' });
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
  });

  const baseInput = {
    to: 'apprenant@example.com',
    subject: 'Relance facture FAC-000001',
    html: '<p>Bonjour</p>',
    context: { tenantId: 'tenant-1', category: 'invoice_reminder' as EmailCategory, sessionId: null },
  };

  it('B1. MAIL_DRY_RUN env actif → { ok:true, dryRun:true } SANS lecture BDD', async () => {
    process.env.MAIL_DRY_RUN = 'true';
    process.env.SMTP_HOST = 'ssl0.ovh.net';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await sendMail(baseInput);

    expect(res).toEqual({ ok: true, dryRun: true });
    expect(settingsFindUnique).not.toHaveBeenCalled();
    expect(smtpSendMail).not.toHaveBeenCalled();
    // Log dry-run enrichi de la catégorie, destinataire masqué (D-17).
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('dry-run'));
    expect(line).toBeDefined();
    expect(line).toContain('category=invoice_reminder');
    expect(line).not.toContain('apprenant@example.com');
    expect(line).toContain('a***@example.com');
  });

  it('B1 bis. la chaîne SIGNATURE respecte MAIL_DRY_RUN comme les autres — rien ne part', async () => {
    // La demande est créée chez le prestataire, mais en local rien ne doit
    // sortir : c'est la couche env, PRIORITAIRE sur les réglages tenant. Un
    // envoi de signature qui la contournerait enverrait un vrai lien à un vrai
    // signataire depuis le Mac d'un développeur.
    process.env.MAIL_DRY_RUN = 'true';
    process.env.SMTP_HOST = 'ssl0.ovh.net';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await sendMail({
      to: 'responsable@agence.fr',
      subject: 'Signature demandée — Convention',
      html: '<p>Bonjour</p>',
      context: { tenantId: 'tenant-1', category: 'signature', sessionId: 'ses-1' },
    });

    expect(res).toEqual({ ok: true, dryRun: true });
    expect(settingsFindUnique).not.toHaveBeenCalled();
    expect(smtpSendMail).not.toHaveBeenCalled();
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('dry-run'));
    expect(line).toContain('category=signature');
    // D-17 : jamais l'adresse complète dans un log.
    expect(line).not.toContain('responsable@agence.fr');
  });

  it('B1 ter. SMTP_HOST vide ⇒ dry-run aussi, pour la signature comme pour le reste', async () => {
    delete process.env.MAIL_DRY_RUN;
    delete process.env.SMTP_HOST;
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await sendMail({
      to: 'responsable@agence.fr',
      subject: 'Signature demandée — Convention',
      html: '<p>Bonjour</p>',
      context: { tenantId: 'tenant-1', category: 'signature', sessionId: 'ses-1' },
    });

    expect(res).toEqual({ ok: true, dryRun: true });
    expect(smtpSendMail).not.toHaveBeenCalled();
  });

  it('B1 quater. SMTP configuré + catégorie signature DÉCOCHÉE ⇒ supprimé, tracé, jamais de throw', async () => {
    process.env.MAIL_DRY_RUN = 'false';
    process.env.SMTP_HOST = 'ssl0.ovh.net';
    settingsFindUnique.mockResolvedValue({
      emailsEnabled: true,
      invoiceRemindersEnabled: true,
      preinscriptionRemindersEnabled: true,
      opcoRemindersEnabled: true,
      opcoSubmissionsEnabled: true,
      internalNotificationsEnabled: true,
      userInvitationsEnabled: true,
      diagnosticProgramsEnabled: true,
      newLeadAlertsEnabled: true,
      preEnrollmentAlertsEnabled: true,
      proposalSendEnabled: true,
      signatureEmailsEnabled: false,
      testSessionIds: [],
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await sendMail({
      to: 'responsable@agence.fr',
      subject: 'Signature demandée — Convention',
      html: '<p>Bonjour</p>',
      context: { tenantId: 'tenant-1', category: 'signature', sessionId: 'ses-1' },
    });

    expect(res).toMatchObject({ ok: true, dryRun: true, suppressed: true });
    expect(smtpSendMail).not.toHaveBeenCalled();
    const line = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes('suppressed-by-settings'));
    expect(line).toBeDefined();
    expect(line).not.toContain('responsable@agence.fr');
  });

  it('B2. env OK mais settings null (fail-closed) → suppressed:true, jamais de throw, destinataire masqué', async () => {
    process.env.MAIL_DRY_RUN = 'false';
    process.env.SMTP_HOST = 'ssl0.ovh.net';
    settingsFindUnique.mockResolvedValue(null);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await sendMail(baseInput);

    expect(res).toEqual({ ok: true, dryRun: true, suppressed: true });
    expect(settingsFindUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(smtpSendMail).not.toHaveBeenCalled();
    const line = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes('suppressed-by-settings'));
    expect(line).toBeDefined();
    expect(line).toContain('category=invoice_reminder');
    expect(line).toContain('reason=no-settings');
    expect(line).not.toContain('apprenant@example.com');
    expect(line).toContain('a***@example.com');
  });

  it('B3. env OK + catégorie décochée → suppressed:true reason=category-off', async () => {
    process.env.MAIL_DRY_RUN = 'false';
    process.env.SMTP_HOST = 'ssl0.ovh.net';
    settingsFindUnique.mockResolvedValue(makeSettings({ emailsEnabled: true }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await sendMail(baseInput);

    expect(res).toEqual({ ok: true, dryRun: true, suppressed: true });
    const line = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes('suppressed-by-settings'));
    expect(line).toContain('reason=category-off');
    expect(smtpSendMail).not.toHaveBeenCalled();
  });

  it('B4. env OK + policy send (master ON + catégorie ON) → envoi SMTP normal', async () => {
    process.env.MAIL_DRY_RUN = 'false';
    process.env.SMTP_HOST = 'ssl0.ovh.net';
    settingsFindUnique.mockResolvedValue(
      makeSettings({ emailsEnabled: true, invoiceRemindersEnabled: true }),
    );

    const res = await sendMail(baseInput);

    expect(res.ok).toBe(true);
    expect(res.messageId).toBe('mid-123');
    expect(res.dryRun).toBeUndefined();
    expect(res.suppressed).toBeUndefined();
    expect(smtpSendMail).toHaveBeenCalledTimes(1);
    expect(smtpSendMail.mock.calls[0]![0]).toMatchObject({
      to: 'apprenant@example.com',
      subject: 'Relance facture FAC-000001',
    });
  });

  it('B5. env OK + master OFF + session test listée → envoi SMTP (mode session test)', async () => {
    process.env.MAIL_DRY_RUN = 'false';
    process.env.SMTP_HOST = 'ssl0.ovh.net';
    settingsFindUnique.mockResolvedValue(
      makeSettings({ invoiceRemindersEnabled: true, testSessionIds: ['ses-test'] }),
    );

    const res = await sendMail({
      ...baseInput,
      context: { ...baseInput.context, sessionId: 'ses-test' },
    });

    expect(res.ok).toBe(true);
    expect(res.suppressed).toBeUndefined();
    expect(smtpSendMail).toHaveBeenCalledTimes(1);
  });
});
