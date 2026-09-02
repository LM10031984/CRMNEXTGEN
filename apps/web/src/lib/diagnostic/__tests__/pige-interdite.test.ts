/**
 * Le mot « pige » est INTERDIT dans tout ce qui part vers un prospect
 * (règle métier Laurent du 11/08/2026).
 *
 * `programme-sur-mesure.ts` a déjà deux garde-fous : une consigne dans le prompt
 * et un filtre qui jette tout point contenant le terme. Mais ces deux-là
 * s'appliquent APRÈS coup, sur ce que le modèle a produit. Si le mot est dans le
 * `programMd` d'un produit routé par le diagnostic, on compte alors sur un
 * filtre pour rattraper une bombe qu'on a soi-même amorcée — et le filtre
 * dégrade l'ancrage en jetant des points, ce qui peut faire basculer tout
 * l'email sur le repli catalogue.
 *
 * Ce test coupe à la racine : AUCUN produit atteignable par le diagnostic ne
 * contient le terme, ni dans son titre, ni dans ses objectifs, ni dans son
 * déroulé. Il lit la BASE, pas le code : c'est le contenu réellement envoyé qui
 * compte, et il se modifie depuis l'interface Produits sans passer par git.
 *
 * Test d'intégration : `pnpm --filter @qualiof/web test` charge `.env` (voir
 * package.json). Sans base joignable, il se déclare ignoré plutôt que vert —
 * un test qui passe sans rien vérifier est pire que pas de test.
 */

import { describe, it, expect } from 'vitest';
import { prisma } from '@qualiof/db';
import { JOURNEES, HORS_DIAGNOSTIC } from '../catalogue-map';

/** Le terme et ses dérivés, comme dans `programme-sur-mesure.ts`. */
const PIGE = /\bpige\w*\b/i;

/** Tous les codes qu'un prospect peut recevoir, replis compris. */
const CODES_ATTEIGNABLES = [...new Set(Object.values(JOURNEES).flat().map((j) => j.code))].sort();

const baseJoignable = Boolean(process.env.DATABASE_URL);

describe('« pige » n’atteint jamais un prospect', () => {
  it('le mapping ne référence aucun produit exclu du diagnostic', () => {
    for (const code of CODES_ATTEIGNABLES) {
      expect(HORS_DIAGNOSTIC[code], `${code} est proposé alors qu'il est exclu`).toBeUndefined();
    }
  });

  it.runIf(baseJoignable)(
    'aucun produit atteignable ne contient « pige » (titre, objectifs, déroulé)',
    async () => {
      const produits = await prisma.trainingProduct.findMany({
        where: { code: { in: CODES_ATTEIGNABLES } },
        select: { code: true, title: true, objectives: true, programMd: true, isActive: true },
      });

      // Une liste vide passerait le test sans rien prouver.
      expect(produits.length, 'aucun produit du mapping trouvé en base').toBeGreaterThan(0);

      const fautifs: string[] = [];
      for (const p of produits) {
        const objectifs = Array.isArray(p.objectives)
          ? (p.objectives as unknown[]).filter((o): o is string => typeof o === 'string')
          : [];
        for (const [champ, valeur] of [
          ['titre', p.title],
          ['objectifs', objectifs.join('\n')],
          ['programMd', p.programMd],
        ] as const) {
          const ligne = valeur.split('\n').find((l) => PIGE.test(l));
          if (ligne) fautifs.push(`${p.code} · ${champ} : « ${ligne.trim().slice(0, 120)} »`);
        }
      }

      expect(fautifs, `\n${fautifs.join('\n')}\n`).toEqual([]);
    },
    20_000,
  );

  it.runIf(baseJoignable)(
    'chaque journée en PREMIER choix existe et est active en base',
    async () => {
      // Le repli existe pour les accidents, pas pour masquer un seed oublié :
      // si la journée Faros de l'axe manque, on veut le savoir ici et pas le 9
      // au soir dans les logs.
      const premiers = Object.values(JOURNEES).map((liste) => liste[0]!.code);
      const actifs = await prisma.trainingProduct.findMany({
        where: { code: { in: premiers }, isActive: true },
        select: { code: true },
      });
      const trouves = new Set(actifs.map((p) => p.code));
      const manquants = premiers.filter((c) => !trouves.has(c));
      expect(manquants, `journées absentes ou inactives : ${manquants.join(', ')}`).toEqual([]);
    },
    20_000,
  );
});
