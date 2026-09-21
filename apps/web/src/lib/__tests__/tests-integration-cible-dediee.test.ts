import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Aucun test d'intégration ne passe par le client PARTAGÉ.
 *
 * POURQUOI CE TEST EXISTE (audit du 21/09)
 *
 * `import { prisma } from '@qualiof/db'` suit `DATABASE_URL` — l'URL MÉTIER. Sur
 * un poste de développement, le `.env` racine la fait pointer sur la production
 * Supabase. `vitest.integration.config.ts` vérifie bien `TEST_DATABASE_URL`,
 * mais vérifier une variable ne protège pas d'un test qui en lit une autre :
 * `agefice-external-deposit.integration.test.ts` ouvrait son `beforeAll` par un
 * `prisma.tenant.create(…)` sans la moindre vérification, et trois tests MLS
 * faisaient de même. `mls-duplicates` vérifiait, lui, le NOM de
 * `TEST_DATABASE_URL`… puis interrogeait l'autre base.
 *
 * Le motif attendu est celui de `session-regime.integration.test.ts` : un
 * `vi.mock('@qualiof/db')` qui remplace `prisma` par
 * `createPrismaClientForUrl(process.env.TEST_DATABASE_URL)`. Sa vertu est de
 * couvrir aussi le CODE TESTÉ — une server action qui importe `prisma` écrit
 * alors dans la base de test, pas dans celle que désigne l'environnement.
 *
 * Test de lecture-source, dans la suite unitaire : il garde la porte fermée
 * pour les tests d'intégration qui restent à écrire.
 */

const RACINE = path.resolve(__dirname, '../..');

function fichiersIntegration(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === 'node_modules' ? [] : fichiersIntegration(chemin);
    return nom.endsWith('.integration.test.ts') ? [chemin] : [];
  });
}

const FICHIERS = fichiersIntegration(RACINE);
const relatif = (f: string) => path.relative(RACINE, f);

/** `import { prisma }`, `import { prisma as db, type User }`… — la VALEUR partagée. */
const IMPORTE_PRISMA = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*'@qualiof\/db'/;
const CLIENT_DE_TEST =
  /vi\.mock\(\s*'@qualiof\/db'[\s\S]*?createPrismaClientForUrl\(\s*process\.env\.TEST_DATABASE_URL/;

describe('tests d’intégration — cible dédiée', () => {
  it('la recherche trouve bien des fichiers (sinon ce test ne prouverait rien)', () => {
    expect(FICHIERS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(FICHIERS.map((f) => [relatif(f), f] as const))(
    '%s — ne passe jamais par le client partagé',
    (_nom, fichier) => {
      const source = readFileSync(fichier, 'utf8');
      if (!IMPORTE_PRISMA.test(source)) return;
      expect(
        CLIENT_DE_TEST.test(source),
        'importe `prisma` de @qualiof/db sans le remplacer par createPrismaClientForUrl(process.env.TEST_DATABASE_URL)',
      ).toBe(true);
    },
  );

  it.each(FICHIERS.map((f) => [relatif(f), f] as const))(
    '%s — ne lit jamais l’URL métier',
    (_nom, fichier) => {
      expect(readFileSync(fichier, 'utf8')).not.toMatch(/process\.env\.DATABASE_URL\b/);
    },
  );

  it.each(FICHIERS.map((f) => [relatif(f), f] as const))(
    '%s — vérifie sa cible avant d’écrire',
    (_nom, fichier) => {
      const source = readFileSync(fichier, 'utf8');
      const verifie =
        /assertTestDatabaseContent\(/.test(source) ||
        /assertTestTarget\(/.test(source) ||
        // Client explicitement ouvert sur TEST_DATABASE_URL, avec son propre
        // contrôle du suffixe `_test` (faros-library).
        (/TEST_DATABASE_URL/.test(source) && /_test/.test(source));
      expect(verifie, 'aucune vérification de la base ciblée').toBe(true);
    },
  );
});
