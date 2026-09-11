import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot C.2b-3 — « Une pièce, un seul chemin ouvert » (Laurent, 11/09/2026).
 *
 * CE QUE CE LOT FERME. Depuis C.2b-2, une ligne partie en signature
 * (`Document.status = 'sent_for_signature'`) mais pas encore signée proposait
 * ENCORE « Déposer le scan » à côté d'« Annuler l'envoi » : deux chemins
 * ouverts sur la même pièce. Un scan pouvait donc arriver pendant qu'une
 * signature électronique aboutissait chez le prestataire — deux preuves
 * concurrentes sur une pièce contractuelle destinée à un financeur, et rien
 * dans le journal pour dire laquelle fait foi.
 *
 * LA RÈGLE : déposer un scan sur une pièce en attente de signature ANNULE
 * l'envoi chez le prestataire. Pas « ignore », pas « refuse en silence » :
 * annule, et le dit.
 *
 * TROIS PROMESSES, ET CE FICHIER EST CE QUI LES TIENT :
 *
 *  (a) **`provider.cancel` est réellement appelé, AVANT toute écriture.**
 *      L'ordre n'est pas décoratif : écrire le scan d'abord laisserait, en cas
 *      d'échec de l'annulation, une pièce portant un scan ET une demande
 *      ouverte. Et la régénération sans ancres que fait l'annulation commence
 *      par un `deleteMany` : elle effacerait le `signedPdfUrl` tout juste posé.
 *      ⚠ Ce fichier ne mocke PAS `../signature-envoi` : la vraie
 *      `annulerEnvoiSignature` s'exécute, et c'est `provider.cancel` qui est
 *      observé. Un mock de l'action rendrait ce test aveugle à la mutation qui
 *      compte.
 *
 *  (b) **Rien n'est annulé sans confirmation explicite de l'utilisateur.**
 *      Le dépôt ne doit pas annuler une demande de signature en silence. Sans
 *      le drapeau de confirmation, le serveur REFUSE et n'appelle pas le
 *      prestataire : fail-closed des deux côtés.
 *
 *  (c) **Le motif `scan_deposited` est DANS la trace.** Une annulation
 *      volontaire et une annulation provoquée par un dépôt ne se distinguent
 *      autrement par rien — or c'est exactement la question qu'un auditeur
 *      pose devant deux preuves d'une même pièce.
 */

const {
  participantFindFirst,
  documentFindFirst,
  documentUpdateMany,
  signatureRequestFindFirst,
  auditLogFindFirst,
  auditLogCreate,
  executeRaw,
  transactionMock,
  requireRoleMock,
  logDocumentEventMock,
  uploadFileMock,
  downloadFileMock,
  cancelMock,
  getProviderMock,
  revalidatePathMock,
  conventionCoreMock,
  conventionEntrepriseMock,
  ageficeMock,
  assiduiteMock,
} = vi.hoisted(() => ({
  participantFindFirst: vi.fn(),
  documentFindFirst: vi.fn(),
  documentUpdateMany: vi.fn(),
  signatureRequestFindFirst: vi.fn(),
  auditLogFindFirst: vi.fn(),
  auditLogCreate: vi.fn(),
  executeRaw: vi.fn(),
  transactionMock: vi.fn(),
  requireRoleMock: vi.fn(),
  logDocumentEventMock: vi.fn(),
  uploadFileMock: vi.fn(),
  downloadFileMock: vi.fn(),
  cancelMock: vi.fn(),
  getProviderMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  conventionCoreMock: vi.fn(),
  conventionEntrepriseMock: vi.fn(),
  ageficeMock: vi.fn(),
  assiduiteMock: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    sessionParticipant: { findFirst: participantFindFirst, findMany: vi.fn() },
    trainingSession: { findFirst: vi.fn(), findUnique: vi.fn() },
    document: {
      findFirst: documentFindFirst,
      updateMany: documentUpdateMany,
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    signatureRequest: { findFirst: signatureRequestFindFirst, update: vi.fn(), create: vi.fn() },
    tenant: { findUnique: vi.fn() },
    opcoCatalog: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findFirst: auditLogFindFirst, create: auditLogCreate },
    $executeRaw: executeRaw,
    $transaction: transactionMock,
  },
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      __isPrismaSql: true,
    }),
  },
  UserRole: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    FORMATEUR: 'FORMATEUR',
    COMMERCIAL: 'COMMERCIAL',
    COMPTABLE: 'COMPTABLE',
    LECTEUR: 'LECTEUR',
  },
  LegalForm: { SAS: 'SAS', EI: 'EI', AUTRE: 'AUTRE' },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));

vi.mock('@/lib/rbac', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rbac')>('@/lib/rbac');
  return { ...actual, requireRole: requireRoleMock };
});

vi.mock('@/lib/document-audit', () => ({ logDocumentEvent: logDocumentEventMock }));

vi.mock('@/lib/storage', () => ({
  DOCS_BUCKET: 'qualiof-docs',
  uploadFile: uploadFileMock,
  downloadFile: downloadFileMock,
}));

vi.mock('@/lib/of-config', () => ({
  loadOfConfig: vi.fn().mockResolvedValue({
    name: 'Start Academy',
    resp: { prenom: 'Laurent', nom: 'MARX', titre: 'Gérant', email: 'laurent@start-academy.fr' },
  }),
}));

/** Remplacé ENTIÈREMENT, sans `importActual` : `provider.ts` lit `@qualiof/shared/env`. */
vi.mock('@/lib/signature/provider', () => {
  class SignatureNotConfiguredError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SignatureNotConfiguredError';
    }
  }
  return { getSignatureProvider: getProviderMock, SignatureNotConfiguredError };
});

vi.mock('@/lib/closure/convention-core', () => ({
  generateConventionCore: conventionCoreMock,
  generateConventionEntrepriseCore: conventionEntrepriseMock,
}));
vi.mock('../agefice-generator', () => ({ generateAgeficeForParticipant: ageficeMock }));
vi.mock('../agefice-attendance-generator', () => ({
  generateAgeficeAttendanceForParticipant: assiduiteMock,
}));

// Hermétisme : ces modules exécutent `createEnv` au chargement.
vi.mock('@/lib/pdf-render', () => ({ renderHtmlToPdf: vi.fn(), renderHtmlToPdfWeasy: vi.fn() }));
vi.mock('@/lib/pdf-split', () => ({ splitPdfPages: vi.fn(), countPdfPages: vi.fn() }));
vi.mock('../closure-pack', () => ({ generateClosurePack: vi.fn() }));
vi.mock('../convention-generator', () => ({ generateConventionForParticipant: vi.fn() }));
vi.mock('../programme-generator', () => ({
  generateProgrammeForParticipant: vi.fn(),
  generateProgrammeForProduct: vi.fn(),
}));
vi.mock('../convocation-generator', () => ({ generateConvocationForParticipant: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { uploadSignedDoc } from '../qualiopi-matrix';
import {
  MOTIF_ANNULATION_SCAN_DEPOSE,
  messageDepotAnnuleraitEnvoi,
} from '@/lib/signature/envoi-contrats';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';
const REQ_ID = '66666666-6666-4666-8666-666666666666';

/** Les écritures réellement passées par le `tx` de la transaction d'annulation. */
const ecrituresTx = {
  signatureRequestUpdate: vi.fn(),
  documentUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
};

function pdfFile(name = 'assiduite-dupont.pdf') {
  return new File([new Uint8Array(2048)], name, { type: 'application/pdf' });
}

function formDataDepot(opts: { confirme?: boolean; docType?: string } = {}) {
  const fd = new FormData();
  fd.append('file', pdfFile());
  fd.append('participantId', PARTICIPANT_ID);
  fd.append('docType', opts.docType ?? 'ASSIDUITE');
  if (opts.confirme) fd.append('annulerEnvoiEnCours', '1');
  return fd;
}

/** Le `Document` de la pièce, tel que le garde-fou du dépôt le cherche. */
function documentEnAttente(over: Record<string, unknown> = {}) {
  return {
    id: 'doc-assiduite',
    status: 'sent_for_signature',
    signatureRequestId: REQ_ID,
    ...over,
  };
}

function demandeEnvoyee() {
  return {
    id: REQ_ID,
    providerId: 'sub-1',
    status: 'SENT',
    sessionId: SESSION_ID,
    documents: [
      {
        id: 'doc-assiduite',
        type: 'ASSIDUITE',
        entityType: 'participant',
        entityId: PARTICIPANT_ID,
        sessionId: SESSION_ID,
        participantId: PARTICIPANT_ID,
        status: 'sent_for_signature',
        signedPdfUrl: null,
      },
    ],
  };
}

/**
 * `prisma.document.findFirst` sert DEUX appelants dans cette chaîne : le
 * garde-fou du dépôt (qui filtre sur `status`) et `trouverDocument` de
 * l'annulation (qui relit la pièce régénérée). On les distingue par leur
 * `where`, sans quoi le test mentirait sur l'un ou sur l'autre.
 */
function brancherDocumentFindFirst(enAttente: Record<string, unknown> | null) {
  documentFindFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    if ('status' in where) return enAttente;
    return { id: 'doc-assiduite-regenere', pdfUrl: 'k.pdf', hashSha256: 'h', status: 'generated' };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ecrituresTx.signatureRequestUpdate.mockReset();
  ecrituresTx.documentUpdate.mockReset();
  ecrituresTx.auditLogCreate.mockReset();

  requireRoleMock.mockResolvedValue({ id: USER_ID, tenantId: TENANT_ID, role: 'ADMIN' });
  participantFindFirst.mockResolvedValue({
    id: PARTICIPANT_ID,
    sessionId: SESSION_ID,
    session: { code: 'SES-0010' },
    docStatus: null,
  });
  documentUpdateMany.mockResolvedValue({ count: 1 });
  executeRaw.mockResolvedValue(1);
  uploadFileMock.mockResolvedValue({ key: 'k', bucket: 'qualiof-docs', size: 1 });
  downloadFileMock.mockResolvedValue(Buffer.from('%PDF'));
  logDocumentEventMock.mockResolvedValue(undefined);
  auditLogFindFirst.mockResolvedValue(null);
  auditLogCreate.mockResolvedValue({});
  signatureRequestFindFirst.mockResolvedValue(demandeEnvoyee());
  cancelMock.mockResolvedValue(undefined);
  getProviderMock.mockReturnValue({ name: 'dry-run', cancel: cancelMock });
  conventionCoreMock.mockResolvedValue({ ok: true });
  conventionEntrepriseMock.mockResolvedValue({ ok: true });
  ageficeMock.mockResolvedValue({ ok: true });
  assiduiteMock.mockResolvedValue({ ok: true });

  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      signatureRequest: { update: ecrituresTx.signatureRequestUpdate, create: vi.fn() },
      document: { update: ecrituresTx.documentUpdate },
      auditLog: { create: ecrituresTx.auditLogCreate },
    }),
  );

  brancherDocumentFindFirst(documentEnAttente());
});

describe('(b) Rien n’est annulé sans confirmation explicite', () => {
  it('PUISSANCE — sans le drapeau de confirmation, le dépôt est REFUSÉ et le prestataire n’est pas appelé', async () => {
    const r = await uploadSignedDoc(formDataDepot({ confirme: false }));

    expect(r.ok).toBe(false);
    // Le prestataire n'a rien vu : aucune demande n'a été annulée en douce.
    expect(cancelMock).not.toHaveBeenCalled();
    // Et RIEN n'a été écrit : ni le PDF au bucket, ni le docStatus, ni le Document.
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(documentUpdateMany).not.toHaveBeenCalled();
  });

  it('le refus emploie le message du moteur — pas un résumé recopié à côté', async () => {
    const r = await uploadSignedDoc(formDataDepot({ confirme: false }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Comparé à la sortie de la fonction IMPORTÉE : les apostrophes du moteur
    // sont droites (U+0027), celles des composants typographiques. Recopier la
    // chaîne ferait passer un test qui ne garde rien.
    expect(r.error).toBe(messageDepotAnnuleraitEnvoi());
  });
});

describe('(a) Le dépôt confirmé ANNULE l’envoi chez le prestataire', () => {
  it('PUISSANCE — `provider.cancel` est appelé avec l’identifiant de la submission', async () => {
    const r = await uploadSignedDoc(formDataDepot({ confirme: true }));

    expect(r.ok).toBe(true);
    expect(cancelMock).toHaveBeenCalledWith('sub-1');
  });

  it('PUISSANCE — l’annulation précède l’écriture du scan, jamais l’inverse', async () => {
    await uploadSignedDoc(formDataDepot({ confirme: true }));

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    // Écrire le scan d'abord, c'est (1) le perdre — la régénération sans ancres
    // de l'annulation commence par un `deleteMany` — et (2) laisser une pièce
    // scannée avec une demande ouverte si l'annulation échouait ensuite.
    expect(cancelMock.mock.invocationCallOrder[0]!).toBeLessThan(
      uploadFileMock.mock.invocationCallOrder[0]!,
    );
  });

  it('PUISSANCE — annulation refusée par le prestataire : RIEN n’est déposé', async () => {
    cancelMock.mockRejectedValue(new Error('submission déjà complétée'));

    const r = await uploadSignedDoc(formDataDepot({ confirme: true }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Le refus nomme la cause, et dit que rien n'a bougé.
    expect(r.error).toContain('submission déjà complétée');
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(documentUpdateMany).not.toHaveBeenCalled();
  });

  it('la demande passe en CANCELED et le document sort du gel', async () => {
    await uploadSignedDoc(formDataDepot({ confirme: true }));

    expect(ecrituresTx.signatureRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQ_ID },
        data: expect.objectContaining({ status: 'CANCELED' }),
      }),
    );
    expect(ecrituresTx.documentUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-assiduite' },
      data: { status: 'generated', signatureRequestId: null },
    });
  });
});

describe('(c) Le motif `scan_deposited` est dans la trace', () => {
  it('PUISSANCE — l’AuditLog `signature.canceled` porte le motif du dépôt, pas celui d’une annulation volontaire', async () => {
    await uploadSignedDoc(formDataDepot({ confirme: true }));

    const traces = ecrituresTx.auditLogCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; diff?: unknown } }).data)
      .filter((d) => d.action === 'signature.canceled');

    expect(traces).toHaveLength(1);
    expect((traces[0]!.diff as { motif?: unknown }).motif).toBe(MOTIF_ANNULATION_SCAN_DEPOSE);
  });

  it('le code du motif est bien celui nommé par Laurent — pas un synonyme', () => {
    expect(MOTIF_ANNULATION_SCAN_DEPOSE).toBe('scan_deposited');
  });

  it('PUISSANCE — le dépôt se journalise EN NOMMANT l’envoi annulé', async () => {
    await uploadSignedDoc(formDataDepot({ confirme: true }));

    expect(logDocumentEventMock).toHaveBeenCalledTimes(1);
    const arg = logDocumentEventMock.mock.calls[0]![0] as {
      action: string;
      diff: Record<string, unknown>;
    };
    expect(arg.action).toBe('documents.upload_signed');
    // Sans cette mention, le journal du dépôt et celui de l'annulation ne se
    // recoupent que par l'horodatage.
    expect(arg.diff.envoiAnnule).toBe(REQ_ID);
  });
});

describe('Le chemin normal du lot A n’est pas touché', () => {
  it('pièce SANS envoi en cours : aucun appel au prestataire, le scan est déposé', async () => {
    brancherDocumentFindFirst(null);

    const r = await uploadSignedDoc(formDataDepot({ confirme: false }));

    expect(r.ok).toBe(true);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    expect(documentUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('PUISSANCE — une pièce gelée SANS demande rattachée n’appelle pas le prestataire dans le vide', async () => {
    // Dérive de donnée : `status = sent_for_signature` mais aucune demande.
    // Annuler « quelque chose » serait impossible ; refuser le dépôt gèlerait
    // la pièce pour de bon. On dépose, sans prétendre avoir annulé.
    brancherDocumentFindFirst(documentEnAttente({ signatureRequestId: null }));

    const r = await uploadSignedDoc(formDataDepot({ confirme: false }));

    expect(r.ok).toBe(true);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(uploadFileMock).toHaveBeenCalledTimes(1);
  });

  it('EMARGEMENT — pièce jamais signable électroniquement : le garde-fou ne s’en mêle pas', async () => {
    brancherDocumentFindFirst(null);

    const r = await uploadSignedDoc(formDataDepot({ confirme: false, docType: 'EMARGEMENT' }));

    expect(r.ok).toBe(true);
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
