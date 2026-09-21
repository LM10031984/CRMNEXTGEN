import { describe, it, expect, afterEach } from 'vitest';

import { createPrismaClientForUrl, refuserBaseDistanteEnTest } from '../index';

/**
 * Le garde qui empêche une suite de tests d'ouvrir une connexion sur une base
 * DISTANTE.
 *
 * POURQUOI AU POINT DE CONNEXION, ET PAS DANS UN SCRIPT
 *
 * Le `.env` racine porte l'URL Supabase de production. Les scripts `test` ont
 * déjà été assainis (`scripts/unit-test-env.ts` ferme le port dans chaque
 * worker), mais cette protection vit dans une CONFIG : elle saute dès qu'une
 * config d'intégration remet `setupFiles: []`, dès qu'un script appelle
 * `vitest` autrement, dès que quelqu'un écrit un nouveau chemin d'appel. Un
 * garde par config en laisse toujours un ouvert — c'est le raisonnement déjà
 * écrit dans `assert-db-target.ts`, appliqué à la connexion elle-même.
 *
 * Ce garde est le dernier rempart : il ne dit pas d'où vient l'URL, il refuse
 * simplement de composer un numéro distant pendant que les tests tournent.
 */

const VITEST_ORIGINE = process.env.VITEST;
const NODE_ENV_ORIGINE = process.env.NODE_ENV;

afterEach(() => {
  if (VITEST_ORIGINE === undefined) delete process.env.VITEST;
  else process.env.VITEST = VITEST_ORIGINE;
  if (NODE_ENV_ORIGINE === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = NODE_ENV_ORIGINE;
});

const PROD = 'postgresql://postgres.abcdef:motdepasse@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';

describe('refuserBaseDistanteEnTest', () => {
  it('refuse la production Supabase, et NOMME ce qui ne va pas', () => {
    expect(() => refuserBaseDistanteEnTest(PROD, 'pool')).toThrowError(/REFUS/);
    expect(() => refuserBaseDistanteEnTest(PROD, 'pool')).toThrowError(/distante interdite/i);
    expect(() => refuserBaseDistanteEnTest(PROD, 'pool')).toThrowError(/pooler\.supabase\.com/);
  });

  it('ne divulgue jamais les identifiants dans son message', () => {
    let message = '';
    try {
      refuserBaseDistanteEnTest(PROD, 'pool');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('motdepasse');
    expect(message).not.toContain('postgres.abcdef');
  });

  it('refuse aussi un hôte distant qui n’est pas Supabase', () => {
    expect(() => refuserBaseDistanteEnTest('postgresql://u:p@db.interne.exemple.fr:5432/qualiof_test', 'pool')).toThrowError(
      /REFUS/,
    );
  });

  it('laisse passer les trois formes de boucle locale', () => {
    for (const hote of ['localhost', '127.0.0.1', '[::1]']) {
      expect(() => refuserBaseDistanteEnTest(`postgresql://u:p@${hote}:5432/qualiof_test`, 'pool')).not.toThrow();
    }
  });

  it('se tait quand il n’y a pas d’URL : rien à refuser, Prisma échouera seul', () => {
    expect(() => refuserBaseDistanteEnTest(undefined, 'pool')).not.toThrow();
    expect(() => refuserBaseDistanteEnTest('', 'pool')).not.toThrow();
  });

  it('ne s’applique QUE pendant les tests — la production doit pouvoir se connecter', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    expect(() => refuserBaseDistanteEnTest(PROD, 'pool')).not.toThrow();
  });

  it('s’applique sur NODE_ENV=test même hors Vitest', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'test';
    expect(() => refuserBaseDistanteEnTest(PROD, 'pool')).toThrowError(/REFUS/);
  });
});

describe('createPrismaClientForUrl', () => {
  it('refuse d’être créé sur une base distante pendant les tests', () => {
    expect(() => createPrismaClientForUrl(PROD)).toThrowError(/REFUS/);
  });

  it('accepte une base locale dédiée', () => {
    expect(() => createPrismaClientForUrl('postgresql://u:p@127.0.0.1:5432/qualiof_test')).not.toThrow();
  });
});
