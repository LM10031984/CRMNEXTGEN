/**
 * Lot D — LE DOSSIER DE FINANCEMENT PART SIGNÉ, ou ne part pas.
 *
 * Attente de Laurent (10/09) : « le dossier AGEFICE prêt à partir en un geste ».
 * Trois choses l'en empêchaient, et aucune n'était visible depuis l'écran :
 *
 *  1. **Les pièces partaient VIERGES.** `composeOpcoSubmission` joignait
 *     `pdfUrl` — la convention non signée — alors que `signedPdfUrl` existait à
 *     côté depuis le lot C.3. Règle métier n°2 : le PDF signé fait foi.
 *  2. **Le certificat de signature ne partait pas**, alors que c'est
 *     exactement ce que les AGEFICE réclament (règle métier n°3).
 *  3. **Le destinataire était l'ENTREPRISE du stagiaire**, alors qu'un dossier
 *     AGEFICE se dépose auprès d'un point d'accueil.
 *
 * ⚠ ET UN PIÈGE QUE CE FICHIER GARDE EXPRESSÉMENT. `sendOpcoSubmission` remonte
 * aux `Document` joints par `pdfUrl: { in: clés }` pour écrire la trace « ce
 * document a quitté la maison » (lot 0 · 0.2). Joindre désormais `signedPdfUrl`
 * fait que PLUS AUCUNE clé ne correspond : la trace se viderait en silence, et
 * personne ne saurait jamais quelle version est partie chez le financeur.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirstParticipant = vi.fn();
const findManyParticipants = vi.fn();
const findManyDocuments = vi.fn();
const createSubmission = vi.fn();
const findFirstSubmission = vi.fn();
const findOtherSubmission = vi.fn();
const updateSubmission = vi.fn();
const updateManySubmission = vi.fn();
const auditCreate = vi.fn();
const sendMailMock = vi.fn();
const downloadFileMock = vi.fn();
const validateRequestMock = vi.fn();

vi.mock('@qualiof/db', () => {
  const db = {
    sessionParticipant: {
      findFirst: (...a: unknown[]) => findFirstParticipant(...a),
      findMany: (...a: unknown[]) => findManyParticipants(...a),
    },
    document: { findMany: (...a: unknown[]) => findManyDocuments(...a) },
    opcoSubmission: {
      create: (...a: unknown[]) => createSubmission(...a),
      findFirst: (a: any) => (a.where?.id?.not ? findOtherSubmission(a) : findFirstSubmission(a)),
      update: (...a: unknown[]) => updateSubmission(...a),
      updateMany: (...a: unknown[]) => updateManySubmission(...a),
    },
    $executeRaw: vi.fn(),
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  };
  return {
    Prisma: {},
    prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) },
  };
});
vi.mock('@/lib/auth', () => ({ validateRequest: (...a: unknown[]) => validateRequestMock(...a) }));
vi.mock('@/lib/mailer', () => ({ sendMail: (...a: unknown[]) => sendMailMock(...a) }));
vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  downloadFile: (...a: unknown[]) => downloadFileMock(...a),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  composeOpcoSubmission,
  sendOpcoSubmission,
  resolveOpcoDelivery,
  updateOpcoSubmissionDraft,
} from '../opco-submission';
import type { SubmissionAttachment } from '../opco-submission';

const PA_NICE = { id: 'pa-1', name: 'CCI Nice Côte d’Azur', email: 'formation@cci-nice.fr' };

function participant(over: Record<string, unknown> = {}) {
  return {
    id: 'part-1',
    priceHT: 3000,
    sessionId: 'sess-1',
    sponsorOrgId: 'org-1',
    person: {
      firstName: 'Jean',
      lastName: 'Dupont',
      ribKey: 'docs/rib.pdf',
      legalLinks: [],
      sensitiveData: { idDocumentUrl: 'docs/cni.pdf', socialSecurityNb: '1870277243087' },
    },
    sponsorOrg: {
      id: 'org-1',
      legalName: 'DUPONT Jean',
      opcoCode: 'AGEFICE',
      emailBilling: 'jean@dupont.fr',
      email: null,
      ageficeProfile: { cfpAttestationKey: 'docs/cfp.pdf', pointAccueil: PA_NICE },
    },
    session: {
      id: 'sess-1',
      code: 'SES-0112',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-03'),
      product: { id: 'product-1', title: 'IA immobilier', durationHours: 21 },
    },
    ...over,
  };
}

/** Les trois documents générés, dans l'état où le lot C.3 les laisse. */
function documents(over: { conventionSignee?: boolean; ageficeSignee?: boolean } = {}) {
  return [
    {
      id: 'doc-conv',
      type: 'CONVENTION',
      participantId: 'part-1',
      entityType: 'participant',
      entityId: null,
      pdfUrl: 'docs/convention.pdf',
      signedPdfUrl: over.conventionSignee === false ? null : 'signed/convention.pdf',
      signatureRequest:
        over.conventionSignee === false
          ? null
          : { id: 'req-1', auditTrailUrl: 'signed/convention.audit-trail.pdf' },
    },
    {
      id: 'doc-agefice',
      type: 'AGEFICE',
      participantId: 'part-1',
      entityType: 'participant',
      entityId: null,
      pdfUrl: 'docs/agefice.pdf',
      signedPdfUrl: over.ageficeSignee === false ? null : 'signed/agefice.pdf',
      signatureRequest:
        over.ageficeSignee === false
          ? null
          : { id: 'req-2', auditTrailUrl: 'signed/agefice.audit-trail.pdf' },
    },
    {
      id: 'doc-prog',
      sessionId: 'sess-1',
      type: 'PROGRAMME',
      participantId: null,
      entityType: 'session',
      entityId: 'sess-1',
      pdfUrl: 'docs/programme.pdf',
      signedPdfUrl: null,
      signatureRequest: null,
    },
  ];
}

function piecesCreees(): SubmissionAttachment[] {
  return createSubmission.mock.calls[0]![0].data.attachments as SubmissionAttachment[];
}

beforeEach(() => {
  vi.clearAllMocks();
  findOtherSubmission.mockReset().mockResolvedValue(null);
  findFirstSubmission.mockReset().mockResolvedValue(null);
  updateManySubmission.mockReset().mockResolvedValue({ count: 1 });
  validateRequestMock.mockResolvedValue({
    user: {
      id: 'u-1',
      tenantId: 't-1',
      role: 'ADMIN',
      firstName: 'Laurent',
      lastName: 'Marx',
      email: 'laurent@start-academy.fr',
    },
  });
  findFirstParticipant.mockResolvedValue(participant());
  // Les inscrits de la session — ils ne servent qu'à la PORTÉE d'une convention
  // de groupe. Ici, Jean est seul sous son commanditaire.
  findManyParticipants.mockResolvedValue([
    { sponsorOrgId: 'org-1', person: { firstName: 'Jean', lastName: 'Dupont' } },
  ]);
  findManyDocuments.mockResolvedValue(documents());
  createSubmission.mockResolvedValue({ id: 'sub-1' });
  downloadFileMock.mockResolvedValue(Buffer.from('%PDF'));
  sendMailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
});

/* ── 1. Le PDF signé fait foi ────────────────────────────────────────────── */

describe('composeOpcoSubmission — les pièces partent dans leur version signée', () => {
  it('joint la CONVENTION signée, pas l’originale', async () => {
    await composeOpcoSubmission('part-1');
    const convention = piecesCreees().find((p) => p.kind === 'CONVENTION');
    expect(convention?.key).toBe('signed/convention.pdf');
    expect(convention?.signe).toBe(true);
  });

  it('joint le formulaire AGEFICE signé, pas l’original', async () => {
    await composeOpcoSubmission('part-1');
    const agefice = piecesCreees().find((p) => p.kind === 'AGEFICE_PA_FORM');
    expect(agefice?.key).toBe('signed/agefice.pdf');
    expect(agefice?.signe).toBe(true);
  });

  it('le PROGRAMME, qui ne se signe pas, part tel qu’il est', async () => {
    await composeOpcoSubmission('part-1');
    const programme = piecesCreees().find((p) => p.kind === 'PROGRAMME');
    expect(programme?.key).toBe('docs/programme.pdf');
    expect(programme?.signe).toBe(false);
  });

  it('retombe sur l’original tant que rien n’est signé', async () => {
    findManyDocuments.mockResolvedValue(documents({ conventionSignee: false }));
    await composeOpcoSubmission('part-1');
    const convention = piecesCreees().find((p) => p.kind === 'CONVENTION');
    expect(convention?.key).toBe('docs/convention.pdf');
    expect(convention?.signe).toBe(false);
  });
});

/* ── 2. Le certificat de signature ───────────────────────────────────────── */

describe('composeOpcoSubmission — le certificat, la pièce que les AGEFICE réclament', () => {
  it('joint UN certificat par demande de signature', async () => {
    await composeOpcoSubmission('part-1');
    const certificats = piecesCreees().filter((p) => p.kind === 'AUDIT_TRAIL');
    expect(certificats.map((c) => c.key)).toEqual([
      'signed/convention.audit-trail.pdf',
      'signed/agefice.audit-trail.pdf',
    ]);
  });

  it('chaque certificat nomme LA PIÈCE qu’il couvre — sinon les deux sont homonymes', async () => {
    // Un dossier AGEFICE porte deux demandes de signature, donc deux
    // certificats : sous le même nom, le financeur ne peut plus dire lequel
    // couvre la convention.
    await composeOpcoSubmission('part-1');
    expect(
      piecesCreees()
        .filter((p) => p.kind === 'AUDIT_TRAIL')
        .map((p) => p.filename),
    ).toEqual([
      'Certificat-de-signature-Convention-Jean-DUPONT-SES-0112.pdf',
      'Certificat-de-signature-Dossier-AGEFICE-Jean-DUPONT-SES-0112.pdf',
    ]);
  });

  it('deux pièces couvertes par la MÊME demande ne joignent qu’un certificat', async () => {
    // Une demande peut porter 1..N documents : joindre son certificat deux fois
    // ferait deux pièces jointes identiques dans le mail du financeur.
    findManyDocuments.mockResolvedValue(
      documents().map((d) =>
        d.signatureRequest
          ? { ...d, signatureRequest: { id: 'req-1', auditTrailUrl: 'signed/x.audit-trail.pdf' } }
          : d,
      ),
    );
    await composeOpcoSubmission('part-1');
    expect(piecesCreees().filter((p) => p.kind === 'AUDIT_TRAIL')).toHaveLength(1);
  });

  it('aucune signature électronique ⇒ aucun certificat, et pas de pièce fantôme', async () => {
    findManyDocuments.mockResolvedValue(
      documents({ conventionSignee: false, ageficeSignee: false }),
    );
    await composeOpcoSubmission('part-1');
    expect(piecesCreees().filter((p) => p.kind === 'AUDIT_TRAIL')).toHaveLength(0);
  });
});

/* ── 3. Le destinataire ──────────────────────────────────────────────────── */

describe('composeOpcoSubmission — le dossier AGEFICE va au POINT D’ACCUEIL', () => {
  it('pré-remplit l’adresse du point d’accueil, pas celle de l’entreprise du stagiaire', async () => {
    await composeOpcoSubmission('part-1');
    expect(createSubmission.mock.calls[0]![0].data.recipientEmail).toBe('formation@cci-nice.fr');
  });

  it('sans point d’accueil, AUCUNE adresse n’est pré-remplie — jamais celle du stagiaire', async () => {
    findFirstParticipant.mockResolvedValue(
      participant({
        sponsorOrg: {
          ...participant().sponsorOrg,
          ageficeProfile: { cfpAttestationKey: 'docs/cfp.pdf', pointAccueil: null },
        },
      }),
    );
    const r = await composeOpcoSubmission('part-1');
    expect(createSubmission.mock.calls[0]![0].data.recipientEmail).toBeNull();
    expect(r.avertissementDestinataire).toMatch(/point d’accueil AGEFICE/);
  });

  it('un financeur de branche garde l’adresse du commanditaire', async () => {
    findFirstParticipant.mockResolvedValue(
      participant({
        sponsorOrg: { ...participant().sponsorOrg, opcoCode: 'OPCO_EP', ageficeProfile: null },
      }),
    );
    await composeOpcoSubmission('part-1');
    expect(createSubmission.mock.calls[0]![0].data.recipientEmail).toBe('jean@dupont.fr');
  });
});

/* ── 4. Le refus nominatif ───────────────────────────────────────────────── */

function submission(attachments: SubmissionAttachment[], over: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'DRAFT',
    deliveryState: 'READY',
    participantId: 'part-1',
    stage: 'PRISE_EN_CHARGE',
    recipientEmail: 'formation@cci-nice.fr',
    subject: 'Dossier AGEFICE',
    bodyHtml: '<p>1870277243087</p>',
    attachments,
    participant: { sessionId: 'sess-1' },
    ...over,
  };
}

const PJ_BASE: SubmissionAttachment[] = [
  { key: 'docs/cni.pdf', filename: 'cni.pdf', kind: 'CNI', included: true, signe: false },
  { key: 'docs/rib.pdf', filename: 'rib.pdf', kind: 'RIB', included: true, signe: false },
  {
    key: 'docs/cfp.pdf',
    filename: 'cfp.pdf',
    kind: 'CFP_ATTESTATION',
    included: true,
    signe: false,
  },
  {
    key: 'docs/programme.pdf',
    filename: 'programme.pdf',
    kind: 'PROGRAMME',
    included: true,
    signe: false,
  },
];
const PJ_SIGNEES: SubmissionAttachment[] = [
  ...PJ_BASE,
  {
    key: 'signed/convention.pdf',
    filename: 'c.pdf',
    kind: 'CONVENTION',
    included: true,
    signe: true,
  },
  {
    key: 'signed/agefice.pdf',
    filename: 'a.pdf',
    kind: 'AGEFICE_PA_FORM',
    included: true,
    signe: true,
  },
];
const PJ_NON_SIGNEES: SubmissionAttachment[] = [
  ...PJ_BASE,
  {
    key: 'docs/convention.pdf',
    filename: 'c.pdf',
    kind: 'CONVENTION',
    included: true,
    signe: false,
  },
  {
    key: 'signed/agefice.pdf',
    filename: 'a.pdf',
    kind: 'AGEFICE_PA_FORM',
    included: true,
    signe: true,
  },
];

describe('sendOpcoSubmission — jamais d’envoi partiel silencieux', () => {
  it('exige chacune des cinq pièces même pour ADMIN avec force', async () => {
    for (const piece of PJ_SIGNEES.filter((p) => p.kind !== 'RIB')) {
      findFirstSubmission.mockResolvedValue(
        submission(PJ_SIGNEES.filter((p) => p.kind !== piece.kind)),
      );
      const result = await sendOpcoSubmission('sub-1', { force: true });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Pièces manquantes');
    }
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('le mode simulation conserve le brouillon et libère le verrou', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
    sendMailMock.mockResolvedValue({ ok: true, dryRun: true });
    expect(await sendOpcoSubmission('sub-1')).toEqual({ ok: true, dryRun: true });
    expect(updateManySubmission.mock.calls.some((call) => call[0].data.status === 'SENT')).toBe(
      false,
    );
    expect(updateManySubmission.mock.calls.at(-1)![0].data.deliveryState).toBe('READY');
  });

  it('une deuxième tentative concurrente ne déclenche pas SMTP', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
    updateManySubmission.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.all([sendOpcoSubmission('sub-1'), sendOpcoSubmission('sub-1')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('un compte lecture seule est refusé avant le claim', async () => {
    validateRequestMock.mockResolvedValue({ user: { id: 'u', tenantId: 't-1', role: 'READONLY' } });
    expect((await sendOpcoSubmission('sub-1')).ok).toBe(false);
    expect(updateManySubmission).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('une clé de stockage forgée ne peut jamais être téléchargée ni envoyée', async () => {
    findFirstSubmission.mockResolvedValue(
      submission(
        PJ_SIGNEES.map((p) => (p.kind === 'RIB' ? { ...p, key: 'other-tenant/secret.pdf' } : p)),
      ),
    );
    const result = await sendOpcoSubmission('sub-1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('pièces ont changé');
    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('refuse une ancienne version quand la convention a été remplacée', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
    findManyDocuments.mockResolvedValue(
      documents().map((d) =>
        d.type === 'CONVENTION' ? { ...d, signedPdfUrl: 'signed/new.pdf' } : d,
      ),
    );
    expect((await sendOpcoSubmission('sub-1')).ok).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('un résultat SMTP ambigu bloque la reprise automatique', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
    sendMailMock.mockResolvedValue({ ok: false, error: 'timeout' });
    expect((await sendOpcoSubmission('sub-1')).ok).toBe(false);
    expect(updateManySubmission.mock.calls.at(-1)![0].data.deliveryState).toBe('UNCERTAIN');
    expect(updateManySubmission.mock.calls.some((call) => call[0].data.status === 'SENT')).toBe(
      false,
    );
  });
  it('refuse d’envoyer un dossier dont une pièce exigée n’est pas signée, en la NOMMANT', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_NON_SIGNEES));
    const r = await sendOpcoSubmission('sub-1');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Signature manquante');
    expect(r.error).toContain('Convention');
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('un ADMIN ne peut pas forcer un dossier AGEFICE incomplet', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_NON_SIGNEES));
    const r = await sendOpcoSubmission('sub-1', { force: true });
    expect(r.ok).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('un COMMERCIAL ne peut pas forcer', async () => {
    validateRequestMock.mockResolvedValue({
      user: {
        id: 'u-2',
        tenantId: 't-1',
        role: 'COMMERCIAL',
        firstName: 'C',
        lastName: 'C',
        email: 'c@x.fr',
      },
    });
    findFirstSubmission.mockResolvedValue(submission(PJ_NON_SIGNEES));
    const r = await sendOpcoSubmission('sub-1', { force: true });
    expect(r.ok).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('un dossier entièrement signé part sans rien demander', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
    findManyDocuments
      .mockResolvedValueOnce(documents())
      .mockResolvedValueOnce(documents())
      .mockResolvedValueOnce([{ id: 'doc-conv' }, { id: 'doc-agefice' }]);
    const r = await sendOpcoSubmission('sub-1');
    expect(r.ok).toBe(true);
  });
});

/* ── 5. La trace, et la copie ────────────────────────────────────────────── */

describe('sendOpcoSubmission — ce que l’envoi laisse derrière lui', () => {
  beforeEach(() => {
    findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
    findManyDocuments
      .mockResolvedValueOnce(documents())
      .mockResolvedValueOnce(documents())
      .mockResolvedValueOnce([{ id: 'doc-conv' }, { id: 'doc-agefice' }]);
  });

  it('la trace « ce document est parti » retrouve les documents par leur clé SIGNÉE', async () => {
    // Le piège : la recherche d'origine ne portait que sur `pdfUrl`. Avec des
    // pièces signées, elle ne ramène plus RIEN et la trace se vide en silence.
    await sendOpcoSubmission('sub-1');
    expect(findManyDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { pdfUrl: { in: PJ_SIGNEES.map((a) => a.key) } },
            { signedPdfUrl: { in: PJ_SIGNEES.map((a) => a.key) } },
          ],
        }),
      }),
    );
  });

  it('les ids retrouvés partent bien dans le contexte de l’envoi', async () => {
    await sendOpcoSubmission('sub-1');
    expect(sendMailMock.mock.calls[0]![0].context.documentIds).toEqual(['doc-conv', 'doc-agefice']);
  });

  it('l’expéditeur reçoit le dossier EN COPIE, avec ses pièces', async () => {
    // Demande de Laurent (10/09) : « le mail arrive aussi dans sa boîte, avec
    // les pièces ». Pas un `mailto:` — il ne joint pas de fichiers de façon
    // fiable — et pas un second envoi, qui doublerait la trace.
    await sendOpcoSubmission('sub-1');
    expect(sendMailMock.mock.calls[0]![0].cc).toBe('formation@start-academy.fr');
  });

  it('la copie AGEFICE va toujours à formation même sans email utilisateur', async () => {
    validateRequestMock.mockResolvedValue({
      user: {
        id: 'u-1',
        tenantId: 't-1',
        role: 'ADMIN',
        firstName: 'L',
        lastName: 'M',
        email: null,
      },
    });
    await sendOpcoSubmission('sub-1');
    expect(sendMailMock.mock.calls[0]![0].cc).toBe('formation@start-academy.fr');
  });
});

/* ── Le nom du certificat, identique à celui que sert la route ────────────── */

/**
 * LE DÉFAUT DE LA RECETTE (12/09/2026). Le même certificat s'appelait
 * `Certificat-de-signature-Convention-DEMO-SIG-01.pdf` téléchargé depuis la
 * ligne, et `…-Convention-Julien-DEMO-SIG-BERNARD-DEMO-SIG-01.pdf` en pièce
 * jointe du dossier : impossible de dire à un financeur « c'est le même
 * document ».
 *
 * Le dossier avait un défaut symétrique, moins visible : il nommait le
 * certificat d'après l'inscrit dont on ouvrait le dossier. Pour une convention
 * de groupe, UN fichier sortait donc sous autant de noms qu'il y avait de
 * salariés.
 */
describe('le certificat porte le nom de la PORTÉE de sa pièce, pas du dossier ouvert', () => {
  it('convention de groupe à deux salariés : aucun nom de personne', async () => {
    findManyParticipants.mockResolvedValue([
      { sponsorOrgId: 'org-1', person: { firstName: 'Jean', lastName: 'Dupont' } },
      { sponsorOrgId: 'org-1', person: { firstName: 'Alice', lastName: 'Martin' } },
    ]);
    findManyDocuments.mockResolvedValue(
      documents().map((d) =>
        d.type === 'CONVENTION'
          ? { ...d, participantId: null, entityType: 'organization', entityId: 'org-1' }
          : d,
      ),
    );
    await composeOpcoSubmission('part-1');
    const certificats = piecesCreees().filter((p) => p.kind === 'AUDIT_TRAIL');
    expect(certificats[0]!.filename).toBe('Certificat-de-signature-Convention-SES-0112.pdf');
  });

  it('convention d’une EI stockée en groupe : SON inscrit, comme la route', async () => {
    findManyParticipants.mockResolvedValue([
      { sponsorOrgId: 'org-1', person: { firstName: 'Jean', lastName: 'Dupont' } },
      { sponsorOrgId: 'org-autre', person: { firstName: 'Alice', lastName: 'Martin' } },
    ]);
    findManyDocuments.mockResolvedValue(
      documents().map((d) =>
        d.type === 'CONVENTION'
          ? { ...d, participantId: null, entityType: 'organization', entityId: 'org-1' }
          : d,
      ),
    );
    await composeOpcoSubmission('part-1');
    const certificats = piecesCreees().filter((p) => p.kind === 'AUDIT_TRAIL');
    expect(certificats[0]!.filename).toBe(
      'Certificat-de-signature-Convention-Jean-DUPONT-SES-0112.pdf',
    );
  });
});

describe('reprise vérifiée et édition sûre', () => {
  it('ne réarme pas un envoi encore récent', async () => {
    findFirstSubmission.mockResolvedValue(
      submission(PJ_SIGNEES, { deliveryState: 'SENDING', sendingStartedAt: new Date() }),
    );
    expect((await resolveOpcoDelivery('sub-1', 'RETRY')).ok).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
  it('un administrateur peut réarmer après contrôle un envoi incertain ancien', async () => {
    findFirstSubmission.mockResolvedValue(
      submission(PJ_SIGNEES, {
        deliveryState: 'UNCERTAIN',
        sendingStartedAt: new Date(Date.now() - 11 * 60_000),
      }),
    );
    expect((await resolveOpcoDelivery('sub-1', 'RETRY')).ok).toBe(true);
    expect(updateManySubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryState: 'READY', sendingStartedAt: null }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'opco.delivery_reconciled' }),
      }),
    );
    expect(sendMailMock).not.toHaveBeenCalled();
  });
  it('refuse de falsifier une signature ou une clé via édition du brouillon', async () => {
    findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
    const result = await updateOpcoSubmissionDraft('sub-1', {
      attachments: PJ_SIGNEES.map((a) => ({ ...a, key: 'autre-tenant.pdf' })),
    });
    expect(result.ok).toBe(false);
    expect(updateManySubmission).not.toHaveBeenCalled();
  });
});

it('un autre ancien brouillon déjà expédié bloque le même participant et la même étape', async () => {
  findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
  findOtherSubmission.mockResolvedValue({ id: 'ancien-dossier', status: 'SENT' });
  expect((await sendOpcoSubmission('sub-1')).ok).toBe(false);
  expect(updateManySubmission).not.toHaveBeenCalled();
  expect(sendMailMock).not.toHaveBeenCalled();
});

it('dossier entreprise : redirige vers le portail session sans créer de mail', async () => {
  const p = participant();
  findFirstParticipant.mockResolvedValue({ ...p, session: { ...p.session, regime: 'ENTREPRISE' } });
  expect(await composeOpcoSubmission('part-1')).toEqual({
    ok: true,
    redirectTo: '/app/sessions/sess-1?tab=avant#depot-org-1',
  });
  expect(createSubmission).not.toHaveBeenCalled();
  expect(sendMailMock).not.toHaveBeenCalled();
});
it('un ancien brouillon salarié ne peut plus être envoyé même avec force admin', async () => {
  const p = participant();
  findFirstParticipant.mockResolvedValue({ ...p, session: { ...p.session, regime: 'ENTREPRISE' } });
  findFirstSubmission.mockResolvedValue(submission(PJ_SIGNEES));
  const result = await sendOpcoSubmission('sub-1', { force: true });
  expect(result.ok).toBe(false);
  expect(result.error).toContain('portail OPCO');
  expect(sendMailMock).not.toHaveBeenCalled();
});
it('ne renomme pas un justificatif image en PDF', async () => {
  const p = participant();
  findFirstParticipant.mockResolvedValue({ ...p, person: { ...p.person, ribKey: 'rib.png' } });
  await composeOpcoSubmission('part-1');
  expect(piecesCreees().find((p) => p.kind === 'RIB')?.filename).toMatch(/\.png$/);
});
