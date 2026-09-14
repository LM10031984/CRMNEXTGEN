/**
 * GARDE — l'OF n'a qu'UN référent handicap, et tout le dépôt le nomme pareil.
 *
 * ## Ce qui a rendu ce test nécessaire (12/09/2026)
 *
 * La page publique `/catalogue` nommait **trois personnes différentes** comme
 * référent handicap, sur la même page :
 *
 *   • « Julien Lafitte — julien@start-academy.fr » — 58 fois, via la constante
 *     `ACCESSIBILITE_PSH`, sur les 29 fiches qui n'ont pas d'override ;
 *   • « Jean-Guy Ourmières — jean-guy@start-academy.fr » — 2 fois, via
 *     l'`accessibility` propre de `PROD-cdd22466` ;
 *   • « Laurent MARX » — 2 fois, en en-tête et en bas de page, via
 *     `of.handicapReferent`.
 *
 * Le bon est **Jean-Guy Ourmières** (confirmé par Laurent le 12/09/2026), et
 * le dépôt le savait déjà : `checklist-formation-template.ts` le déclare
 * « référent handicap **unique de l'OF** (ind. 26) — identique sur tous les
 * docs ». Le catalogue était la seule surface à dire autre chose.
 *
 * Julien Lafitte a par ailleurs QUITTÉ l'organisme — `programme-template.ts`
 * porte depuis un nettoyage explicite (« retire un contact nominatif parti »).
 * Un contact de conformité périmé sur la vitrine publique, c'est l'indicateur
 * 26 pris en défaut par un auditeur qui compare deux documents.
 *
 * ## Ce que ce test garde
 *
 * Il ne fige pas un texte : il fige le **nom** et l'**adresse** du référent
 * partout où le dépôt en nomme un en dur. Le jour où le référent change, ce
 * test rougit sur TOUTES les surfaces d'un coup — c'est précisément ce qui a
 * manqué.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACCESSIBILITE_PSH } from '../catalogue-constants';
import { REFERENT_HANDICAP_LIGNE } from '../referent-handicap';

const RACINE = path.resolve(__dirname, '../../..', '..', '..');

/**
 * Le référent, tel que `checklist-formation-template.ts` le déclare depuis le
 * 17/06/2026 — « unique de l'OF, identique sur tous les docs ».
 */
const REFERENT_NOM = 'Jean-Guy Ourmières';
const REFERENT_EMAIL = 'jean-guy@start-academy.fr';

/** L'ancien référent, parti de l'organisme. */
const ANCIEN_NOM = /Julien\s+Lafitte/i;
const ANCIEN_EMAIL = /julien@start-academy\.fr/i;

describe('Référent handicap — un seul nom dans tout le dépôt', () => {
  it('ACCESSIBILITE_PSH nomme Jean-Guy Ourmières, avec son adresse', () => {
    expect(ACCESSIBILITE_PSH).toContain(REFERENT_NOM);
    expect(ACCESSIBILITE_PSH).toContain(REFERENT_EMAIL);
  });

  it("ACCESSIBILITE_PSH ne nomme plus l'ancien référent", () => {
    // Le discriminant : sans cette assertion, ajouter le nouveau nom SANS
    // retirer l'ancien passerait — et la page publique citerait deux référents
    // dans la même phrase.
    expect(ACCESSIBILITE_PSH).not.toMatch(ANCIEN_NOM);
    expect(ACCESSIBILITE_PSH).not.toMatch(ANCIEN_EMAIL);
  });

  it("aucun fichier du dépôt ne nomme l'ancien référent comme référent handicap", () => {
    const fichiers = execFileSync('git', ['ls-files', 'apps/*/src/**/*.ts', 'apps/*/src/**/*.tsx'], {
      cwd: RACINE,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 32,
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.includes('__tests__'));

    // On ne cherche PAS toute mention de la personne : elle reste légitimement
    // formatrice dans des fixtures et des scripts d'affectation. On cherche la
    // mention qui la présente comme le RÉFÉRENT HANDICAP, c'est-à-dire son nom
    // ou son adresse à portée d'un libellé « référent handicap ».
    // Les COMMENTAIRES sont hors sujet, et ce n'est pas une commodité : ce
    // fichier-ci, comme `referent-handicap.ts`, raconte le défaut en nommant
    // l'ancien référent. Une prose qui explique pourquoi un nom est parti n'est
    // pas un nom publié. On balaie le code.
    const estCommentaire = (l: string): boolean => {
      const t = l.trim();
      return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
    };

    const coupables: string[] = [];
    for (const f of fichiers) {
      const lignes = fs.readFileSync(path.join(RACINE, f), 'utf8').split('\n');
      lignes.forEach((l, i) => {
        if (estCommentaire(l)) return;
        if (!ANCIEN_NOM.test(l) && !ANCIEN_EMAIL.test(l)) return;
        const fenetre = lignes.slice(Math.max(0, i - 2), i + 3).join(' ');
        if (/référent\s+handicap/i.test(fenetre)) coupables.push(`${f}:${i + 1}`);
      });
    }

    expect(
      coupables,
      `Un contact de conformité périmé sur une surface publique est une ` +
        `non-conformité d'indicateur 26, pas une coquille.`,
    ).toEqual([]);
  });

  it('la check-list de clôture LIT la source unique, elle ne la recopie pas', () => {
    // Ce test surveillait l'écart entre DEUX littéraux, dans deux fichiers.
    // Depuis l'unification (spec §5.5), l'écart ne peut plus exister : les deux
    // surfaces lisent `lib/referent-handicap.ts`. Ce qu'on garde désormais,
    // c'est que la check-list n'ait pas RE-recopié la valeur — c'est-à-dire la
    // dépendance elle-même, qui est ce qui les fera bouger ensemble.
    const src = fs.readFileSync(
      path.join(RACINE, 'apps/web/src/lib/closure/checklist-formation-template.ts'),
      'utf8',
    );
    expect(src).toMatch(/from '\.\.\/referent-handicap'/);
    expect(src).toMatch(/HANDICAP_REFERENT_LINE\s*=\s*REFERENT_HANDICAP_LIGNE/);

    // Et la réciproque, sur les valeurs rendues : les deux surfaces nomment la
    // même personne.
    expect(REFERENT_HANDICAP_LIGNE).toContain(REFERENT_NOM);
    expect(ACCESSIBILITE_PSH).toContain(REFERENT_NOM);
  });
});
