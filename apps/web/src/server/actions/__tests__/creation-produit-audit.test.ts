import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `createProduct` TRACE la création — et la pose d'un seul geste.
 *
 * ## Le constat qui a rendu ce test nécessaire (prod, 12/09/2026)
 *
 * Aucun chemin du dépôt ne journalisait la naissance d'un produit. Pas même
 * l'écran : `PROD-0674`, créé depuis l'appli le 12/08, ne porte que deux
 * `products.validate_ai_draft` — la VALIDATION du brouillon IA, jamais la
 * création. Le produit apparaît dans le catalogue sans que rien ne dise qui
 * l'a créé, ni quand, ni depuis quel écran.
 *
 * ⚠ **Pourquoi ce test EN PLUS du garde de source.**
 * `creation-produit-tracee.test.ts` balaie les fichiers et exige un
 * `auditLog.create` portant `entity: 'TrainingProduct'`. Pour `crud-edits.ts`,
 * ce garde était **VERT avant tout correctif** : le fichier contenait déjà un
 * tel bloc, celui de `products.validate_ai_draft`, cinq cents lignes plus bas.
 * Un garde de présence ne distingue pas l'AuditLog d'une AUTRE opération. Seul
 * un test qui APPELLE l'action le peut — c'est §4 ter appliqué à la lettre.
 */

vi.mock('@qualiof/db', () => ({
  prisma: {
    trainingProduct: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {
    Decimal: class {
      private v: number;
      constructor(v: number | string) {
        this.v = typeof v === 'string' ? parseFloat(v) : v;
      }
      toNumber() {
        return this.v;
      }
      valueOf() {
        return this.v;
      }
    },
    JsonNull: null,
  },
}));

vi.mock('@/lib/auth', () => ({ lucia: {}, validateRequest: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { createProduct } from '../crud-edits';

const findMany = prisma.trainingProduct.findMany as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.trainingProduct.findFirst as unknown as ReturnType<typeof vi.fn>;
const createNu = prisma.trainingProduct.create as unknown as ReturnType<typeof vi.fn>;
const auditNu = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const $transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const validateRequestMock = validateRequest as unknown as ReturnType<typeof vi.fn>;

const PRODUIT_ID = '55555555-5555-5555-5555-555555555555';

/** Le client de transaction : c'est LUI qui doit recevoir les deux écritures. */
let tx: { trainingProduct: { create: ReturnType<typeof vi.fn> }; auditLog: { create: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue({
    user: { id: 'user-1', tenantId: 'tenant-1', email: 'laurent@start-academy.fr', role: 'ADMIN' },
    session: { id: 'sess-1' },
  });
  // Catalogue existant : le séquenceur doit rendre PROD-0676.
  findMany.mockResolvedValue([{ code: 'PROD-0675' }, { code: 'PROD-00661' }]);
  findFirst.mockResolvedValue(null);

  tx = {
    trainingProduct: { create: vi.fn().mockResolvedValue({ id: PRODUIT_ID }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  $transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (c: typeof tx) => Promise<unknown>)(tx) : Promise.all(arg as unknown[]),
  );
  createNu.mockResolvedValue({ id: PRODUIT_ID });
  auditNu.mockResolvedValue({ id: 'audit-1' });
});

const ENTREE = {
  title: 'Piloter son agence avec l’IA',
  durationHours: 8,
  modality: 'PRESENTIEL' as const,
  priceHT: 336,
  autoFillWithAI: false, // on teste la création, pas le remplissage Ollama
};

describe('createProduct — la naissance d’un produit laisse une trace', () => {
  it('pose un AuditLog de CRÉATION, pas seulement de validation IA', async () => {
    const r = await createProduct(ENTREE);

    expect(r.ok).toBe(true);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);

    const data = tx.auditLog.create.mock.calls[0]![0].data;
    expect(data.entity).toBe('TrainingProduct');
    expect(data.entityId).toBe(PRODUIT_ID);
    expect(data.tenantId).toBe('tenant-1');
    expect(data.userId).toBe('user-1');
    // Le discriminant : l'action nomme la CRÉATION. `validate_ai_draft`
    // existait déjà et ne dit rien de la naissance du produit.
    expect(data.action).toMatch(/create/i);
  });

  it('le diff porte le CODE et le TITRE — sinon la trace est illisible', async () => {
    // Un AuditLog qui ne porte que l'`entityId` oblige à retrouver le produit
    // pour comprendre la ligne. Or c'est précisément quand le produit a été
    // supprimé, ou renommé, qu'on relit l'audit.
    await createProduct(ENTREE);

    const diff = JSON.stringify(tx.auditLog.create.mock.calls[0]![0].data.diff);
    expect(diff).toContain('PROD-0676');
    expect(diff).toContain('Piloter son agence');
  });

  it('produit et trace passent par la MÊME transaction', async () => {
    await createProduct(ENTREE);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(tx.trainingProduct.create).toHaveBeenCalledTimes(1);
    // PUISSANCE : le client NU ne doit plus voir passer la création. Un test
    // qui vérifierait seulement que `$transaction` a été appelée resterait vert
    // si la création se faisait à côté.
    expect(createNu).not.toHaveBeenCalled();
    expect(auditNu).not.toHaveBeenCalled();
  });

  it('N’écrit RIEN quand l’entrée est refusée — pas d’AuditLog orphelin', async () => {
    const r = await createProduct({ ...ENTREE, title: '   ' });

    expect(r.ok).toBe(false);
    expect($transaction).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
