import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * La production ne se charge plus PAR DÉFAUT (point 3 du plan du 21/09).
 *
 * AVANT : le `.env` racine portait l'URL Supabase de production. Tout ce qui
 * charge `.env` sans y penser — un `dotenv -e ../../.env`, le CLI Prisma qui
 * lit le `.env` de son dossier, un script lancé à la main — parlait à la
 * production. C'est ainsi que `pnpm db:reset` a pu la détruire (cf.
 * `assert-db-target.ts`), et qu'un test d'intégration a pu y écrire.
 *
 * APRÈS : trois fichiers, et un seul sens chacun.
 *   `.env`        la configuration partagée — AUCUNE URL de base ;
 *   `.env.local`  la base de développement ;
 *   `.env.prod`   la base de production, et rien d'autre.
 *
 * Un script qui vise la production le DIT dans son texte :
 * `dotenv -e ../../.env.prod -e ../../.env`. dotenv-cli n'écrase pas une
 * variable déjà posée : le PREMIER fichier gagne — c'est le miroir exact du
 * motif `:local` (`-e ../../.env.local -e ../../.env`).
 */

const RACINE = path.resolve(__dirname, '../../../..');
const scriptsDe = (paquet: string): Record<string, string> =>
  JSON.parse(readFileSync(path.join(RACINE, paquet, 'package.json'), 'utf8')).scripts ?? {};

const TOUS: Array<[string, string, string]> = ['.', 'apps/web', 'packages/db'].flatMap((paquet) =>
  Object.entries(scriptsDe(paquet)).map(([nom, commande]) => [paquet, nom, commande] as [string, string, string]),
);
const visePROD = (commande: string) => commande.includes('.env.prod');

describe('scripts — la production se demande, elle ne se charge pas par défaut', () => {
  it('les familles nommées par Laurent visent explicitement .env.prod', () => {
    const attendus = TOUS.filter(([, nom]) => {
      if (nom.endsWith(':local')) return false;
      if (nom === 'worker:closure:pg') return false; // local d'abord, par construction
      return (
        nom.startsWith('ecrire:') ||
        nom.startsWith('worker:') ||
        nom === 'import:veille' ||
        nom.includes('backfill')
      );
    });
    expect(attendus.length).toBeGreaterThanOrEqual(9);
    for (const [paquet, nom, commande] of attendus) {
      expect(visePROD(commande), `${paquet} › ${nom}`).toBe(true);
    }
  });

  it('tout script nommé « :prod » vise .env.prod — un nom qui promet la prod doit la désigner', () => {
    const prod = TOUS.filter(([, nom]) => nom.endsWith(':prod'));
    expect(prod.length).toBeGreaterThanOrEqual(5);
    for (const [paquet, nom, commande] of prod) {
      // Une pure délégation (`pnpm --filter … run db:deploy:prod`) ne charge
      // rien elle-même : c'est le script délégué qui est jugé. Mais elle ne
      // peut déléguer QU'À un script « :prod ».
      const delegue = /\brun \S+:prod\b/.test(commande) && !commande.includes('dotenv ');
      expect(visePROD(commande) || delegue, `${paquet} › ${nom}`).toBe(true);
    }
  });

  it('.env.prod passe TOUJOURS en premier, suivi de .env — sinon il ne gagne pas', () => {
    for (const [paquet, nom, commande] of TOUS.filter(([, , c]) => visePROD(c))) {
      const racine = paquet === '.' ? '' : '../../';
      // `guard:prod && dotenv …` : chaque appel à dotenv de la commande est jugé.
      for (const appel of commande.split('&&').filter((morceau) => morceau.includes('dotenv '))) {
        expect(appel, `${paquet} › ${nom}`).toContain(`-e ${racine}.env.prod -e ${racine}.env --`);
      }
    }
  });

  it('aucun script ne mélange .env.local et .env.prod', () => {
    for (const [paquet, nom, commande] of TOUS) {
      expect(commande.includes('.env.local') && visePROD(commande), `${paquet} › ${nom}`).toBe(false);
    }
  });

  it('aucun script « :local » ne peut atteindre la production', () => {
    for (const [paquet, nom, commande] of TOUS.filter(([, n]) => n.endsWith(':local'))) {
      expect(visePROD(commande), `${paquet} › ${nom}`).toBe(false);
    }
  });

  it('ni test, ni e2e, ni lint ne désignent jamais .env.prod', () => {
    const interdits = TOUS.filter(([, nom]) => /^(test|e2e|lint|smoke|bench)(:|$)/.test(nom));
    expect(interdits.length).toBeGreaterThanOrEqual(5);
    for (const [paquet, nom, commande] of interdits) {
      expect(visePROD(commande), `${paquet} › ${nom}`).toBe(false);
    }
  });
});

describe('.env.example — le modèle dit la règle', () => {
  const exemple = readFileSync(path.join(RACINE, '.env.example'), 'utf8');

  it('n’affecte aucune URL de base distante — les exemples en commentaire restent permis', () => {
    const affectations = exemple
      .split('\n')
      .filter((ligne) => /^\s*(DATABASE_URL|DIRECT_URL)\s*=/.test(ligne));
    expect(affectations.length).toBeGreaterThanOrEqual(2);
    for (const ligne of affectations) {
      expect(ligne, ligne).toMatch(/@(localhost|127\.0\.0\.1)[:/]/);
    }
  });

  it('explique où vit la production', () => {
    expect(exemple).toContain('.env.prod');
  });
});
