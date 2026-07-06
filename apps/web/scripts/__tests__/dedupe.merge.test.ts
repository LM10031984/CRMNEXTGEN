/**
 * PRÉREQUIS DUR (RECONCILE-RULES §3.2) — Phase 09.2.
 *
 * Première intégration BDD réelle du repo : prouve par une fusion RÉELLE en
 * transaction que les ExternalIdentity du perdant repointent vers le survivant
 * (Person ET Organization) et que le perdant est supprimé. Les tests existants
 * mockent tous Prisma ; ici on exécute le vrai repointage FK contre Postgres.
 *
 * SÉCURITÉ (garde-fou d'environnement, NON négociable) : ce test tourne sur une
 * base DÉDIÉE `qualiof_test` via TEST_DATABASE_URL, JAMAIS sur la prod-locale
 * `qualiof`. Il instancie SON PROPRE PrismaClient (pas le singleton @qualiof/db
 * lié à DATABASE_URL). Garde dure : si TEST_DATABASE_URL absent OU si le nom de
 * base ne finit pas par `_test` → throw AVANT toute opération.
 *
 * Tests A/B : transaction rollback-only (rien ne persiste).
 * Test C : garde-fou anti-fusion email-seul (cas Nestenn) — données committées
 *          sur qualiof_test puis nettoyées en afterAll.
 */
import { afterAll, describe, expect, it } from 'vitest';
// PrismaClient re-exporté par @qualiof/db (apps/web ne dépend pas directement de
// @prisma/client). On instancie NOTRE PROPRE client (pas le singleton) → qualiof_test.
import { PrismaClient } from '@qualiof/db';
import { mergeOrgsTx, mergePersonsTx, detectPersonsByName } from '../dedupe';

// ── Garde d'environnement (première ligne de défense) ──────────────
const TEST_URL = process.env.TEST_DATABASE_URL;
function dbName(u: string): string {
  return new URL(u).pathname.replace(/^\//, '');
}
if (!TEST_URL || !/_test$/.test(dbName(TEST_URL))) {
  throw new Error(
    'REFUS: dedupe.merge.test exige TEST_DATABASE_URL pointant une base *_test dédiée (jamais la prod-locale qualiof)',
  );
}

const db = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

afterAll(async () => {
  // Filet : purge tout résidu de test sur qualiof_test (jamais qualiof).
  await db.externalIdentity.deleteMany({ where: { source: 'test-09.2' } });
  await db.person.deleteMany({ where: { lastName: 'TESTA' } });
  await db.organization.deleteMany({ where: { legalName: { startsWith: 'TESTORG-09.2' } } });
  await db.person.deleteMany({ where: { firstName: 'NESTENN-09.2' } });
  await db.tenant.deleteMany({ where: { name: { startsWith: 'TEST-TENANT-09.2' } } });
  await db.$disconnect();
});

// Helper : exécute fn dans une transaction puis ROLLBACK (rien ne persiste).
async function inRollback(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>) {
  await expect(
    db.$transaction(async (tx) => {
      await fn(tx);
      throw new Error('ROLLBACK');
    }),
  ).rejects.toThrow('ROLLBACK');
}

describe('dedupe — fusion réelle (intégration BDD qualiof_test)', () => {
  it('Test A — Person : ExternalIdentity repointe perdant→survivant, perdant supprimé', async () => {
    await inRollback(async (tx) => {
      const t = await tx.tenant.create({ data: { name: 'TEST-TENANT-09.2-A' } });
      const a = await tx.person.create({
        data: { tenantId: t.id, lastName: 'TESTA', firstName: 'Surv' },
      });
      const b = await tx.person.create({
        data: { tenantId: t.id, lastName: 'TESTA', firstName: 'Perd' },
      });
      const ei = await tx.externalIdentity.create({
        data: {
          tenantId: t.id,
          entityType: 'Person',
          entityId: b.id,
          source: 'test-09.2',
          externalId: 'ei-person-' + b.id,
        },
      });

      await mergePersonsTx(tx, a.id, b.id);

      const eiAfter = await tx.externalIdentity.findUnique({ where: { id: ei.id } });
      expect(eiAfter?.entityId).toBe(a.id); // repointé vers le survivant
      expect(await tx.person.findUnique({ where: { id: b.id } })).toBeNull(); // perdant supprimé
      expect(await tx.person.findUnique({ where: { id: a.id } })).not.toBeNull(); // survivant intact
    });
  });

  it('Test B — Organization : ExternalIdentity repointe perdant→survivant, perdant supprimé', async () => {
    await inRollback(async (tx) => {
      const t = await tx.tenant.create({ data: { name: 'TEST-TENANT-09.2-B' } });
      const a = await tx.organization.create({
        data: { tenantId: t.id, legalName: 'TESTORG-09.2-Surv', legalForm: 'EI' },
      });
      const b = await tx.organization.create({
        data: { tenantId: t.id, legalName: 'TESTORG-09.2-Perd', legalForm: 'EI' },
      });
      const ei = await tx.externalIdentity.create({
        data: {
          tenantId: t.id,
          entityType: 'Organization',
          entityId: b.id,
          source: 'test-09.2',
          externalId: 'ei-org-' + b.id,
        },
      });

      await mergeOrgsTx(tx, a.id, b.id);

      const eiAfter = await tx.externalIdentity.findUnique({ where: { id: ei.id } });
      expect(eiAfter?.entityId).toBe(a.id); // repointé vers le survivant
      expect(await tx.organization.findUnique({ where: { id: b.id } })).toBeNull(); // perdant supprimé
      expect(await tx.organization.findUnique({ where: { id: a.id } })).not.toBeNull();
    });
  });

  it('Test C — garde-fou email (Nestenn) : 2 personnes même nom + emails différents NON fusionnées', async () => {
    // detectPersonsByName lit la base (findMany), pas mockable en rollback :
    // on commit sur qualiof_test puis on nettoie (afterAll + finally).
    const t = await db.tenant.create({ data: { name: 'TEST-TENANT-09.2-C' } });
    try {
      const p1 = await db.person.create({
        data: {
          tenantId: t.id,
          firstName: 'NESTENN-09.2',
          lastName: 'DUPOND',
          email: 'agent1@nestenn.com',
        },
      });
      const p2 = await db.person.create({
        data: {
          tenantId: t.id,
          firstName: 'NESTENN-09.2',
          lastName: 'DUPOND',
          email: 'agent2@nestenn.com',
        },
      });

      const groups = await detectPersonsByName(t.id, db);

      // Aucun groupe ne doit contenir les 2 ids (emails distincts non-null → 2 vraies personnes).
      const grouped = groups.find((g) => g.ids.includes(p1.id) && g.ids.includes(p2.id));
      expect(grouped).toBeUndefined();
    } finally {
      await db.person.deleteMany({ where: { tenantId: t.id } });
      await db.tenant.delete({ where: { id: t.id } });
    }
  });
});
