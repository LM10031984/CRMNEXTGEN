/**
 * Le mot « pige » est INTERDIT dans tout ce qui part vers un prospect
 * (règle métier Laurent du 11/08/2026).
 *
 * `programme-sur-mesure.ts` a déjà deux garde-fous : une consigne dans le prompt
 * et un filtre qui jette tout point contenant le terme. Mais ces deux-là
 * s'appliquent APRÈS coup, sur ce que le modèle a produit. Si le mot est dans le
 * programme d'un produit routé par le diagnostic, on compte alors sur un filtre
 * pour rattraper une bombe qu'on a soi-même amorcée — et le filtre dégrade
 * l'ancrage en jetant des points, ce qui peut faire basculer tout l'email sur le
 * repli catalogue.
 *
 * DEUX NIVEAUX, ET C'EST LA CI QUI L'A IMPOSÉ (02/09/2026)
 *
 * La première version interrogeait la base et se croyait capable de décider
 * toute seule si elle pouvait tourner, en regardant `DATABASE_URL`. Elle passait
 * en local (base cloud, catalogue présent) et échouait en intégration continue
 * (base éphémère, catalogue vide) — en accusant le code alors que seule la
 * DONNÉE manquait. Deux questions différentes étaient mélangées :
 *
 *  1. « le contenu qu'on écrit est-il propre ? » — c'est du CODE, ça se vérifie
 *     partout, sans base. C'est l'essentiel de ce fichier.
 *  2. « le déploiement est-il en état ? » — c'est de la DONNÉE, ça ne se vérifie
 *     que contre une vraie base, et jamais en CI. Explicitement demandé par
 *     `VERIF_CATALOGUE=1`, sinon ignoré. À jouer avant le salon.
 */

import { describe, it, expect } from 'vitest';
import { prisma } from '@qualiof/db';
import { JOURNEES, HORS_DIAGNOSTIC } from '../catalogue-map';
import { JOURNEES_FAROS, CODES_FAROS, composerProgramme } from '../journees-faros';

/** Le terme et ses dérivés, comme dans `programme-sur-mesure.ts`. */
const PIGE = /\bpige\w*\b/i;

/** Tous les codes qu'un prospect peut recevoir, replis compris. */
const CODES_ATTEIGNABLES = [...new Set(Object.values(JOURNEES).flat().map((j) => j.code))].sort();

// ─── 1. Le contenu qu'on écrit — vérifiable partout, y compris en CI ─────────

describe('les journées Faros, telles qu’on les écrit', () => {
  it('n’emploie jamais le mot interdit, nulle part', () => {
    for (const j of JOURNEES_FAROS) {
      const tout = [j.title, j.targetAudience, j.prerequisites, ...j.objectives, composerProgramme(j.blocs)].join('\n');
      const ligne = tout.split('\n').find((l) => PIGE.test(l));
      expect(ligne, `${j.code} : « ${ligne?.trim().slice(0, 120)} »`).toBeUndefined();
    }
  });

  it('ne laisse fuiter aucune référence de capsule vers le prospect', () => {
    // Les `[M1-A1]` servent à la traçabilité interne. Dans un email, ils font
    // « document de travail envoyé par erreur ».
    for (const j of JOURNEES_FAROS) {
      expect(composerProgramme(j.blocs), j.code).not.toMatch(/\[[A-Z]\d?-?[A-Z]?\d?\]/);
    }
  });

  it('couvre exactement les 4 codes autorisés — ni un de plus, ni un de moins', () => {
    // Le tarif de 336 € HT est figé sur ces quatre-là et rien d'autre
    // (décision Laurent du 02/09/2026).
    const codes = JOURNEES_FAROS.map((j) => j.code).sort();
    expect(codes).toEqual([...CODES_FAROS].sort());
  });

  it('donne à chaque journée de quoi faire un email : objectifs et déroulé', () => {
    for (const j of JOURNEES_FAROS) {
      expect(j.objectives.length, `${j.code} : pas assez d'objectifs`).toBeGreaterThanOrEqual(3);
      const lignes = composerProgramme(j.blocs).split('\n').filter((l) => l.startsWith('- '));
      // Le sur-mesure exige au moins 3 séquences ancrées : sous une quinzaine de
      // lignes, le modèle n'a pas de quoi les construire et tout bascule sur le
      // repli catalogue.
      expect(lignes.length, `${j.code} : déroulé trop maigre`).toBeGreaterThanOrEqual(15);
    }
  });

  it('est la journée de TÊTE de chacun des 4 axes du diagnostic', () => {
    const tetes = Object.values(JOURNEES).map((liste) => liste[0]!.code).sort();
    expect(tetes).toEqual([...CODES_FAROS].sort());
  });

  it('ne référence aucun produit explicitement exclu du diagnostic', () => {
    for (const code of CODES_ATTEIGNABLES) {
      expect(HORS_DIAGNOSTIC[code], `${code} est proposé alors qu'il est exclu`).toBeUndefined();
    }
  });
});

// ─── 2. L'état du déploiement — sur demande, jamais en CI ────────────────────

const verifBase = process.env.VERIF_CATALOGUE === '1';

describe('l’état réel du catalogue en base (VERIF_CATALOGUE=1)', () => {
  it.runIf(verifBase)(
    'aucun produit atteignable ne contient « pige » (titre, objectifs, déroulé)',
    async () => {
      const produits = await prisma.trainingProduct.findMany({
        where: { code: { in: CODES_ATTEIGNABLES } },
        select: { code: true, title: true, objectives: true, programMd: true },
      });

      // Une liste vide passerait le test sans rien prouver : c'est exactement ce
      // qui a rendu la première version trompeuse.
      expect(produits.length, 'aucun produit du mapping trouvé — mauvaise base ?').toBeGreaterThan(0);

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

  it.runIf(verifBase)(
    'chaque journée de tête existe et est active — le seed a bien été joué',
    async () => {
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
