import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, afterEach } from 'vitest';

/**
 * GARDE — le référent handicap a UNE identité, et trois surfaces la lisent.
 *
 * ## Ce que la correction du 12/09 n'avait pas refermé
 *
 * `ACCESSIBILITE_PSH` nomme enfin Jean-Guy Ourmières. Mais la page publique
 * portait TROIS noms, pas deux, et le troisième n'a pas bougé : l'en-tête et
 * le bas de page affichent `of.handicapReferent`, qui valait « Laurent MARX »
 * par un repli codé en dur —
 *
 *     handicapReferent: pick(null, 'OF_HANDICAP_REFERENT', 'Laurent MARX')
 *
 * Trois défauts dans une ligne : le premier argument `null` empêche de lire le
 * `Tenant` (contrairement à tous les autres champs), la variable
 * `OF_HANDICAP_REFERENT` est absente du `.env`, donc le repli gagne TOUJOURS —
 * et ce repli nomme une personne qui n'est pas le référent.
 *
 * **Une variable d'environnement absente avec un nom de personne en repli est
 * exactement le mécanisme qui a produit ce défaut.** La variable disparaît.
 *
 * ## Ce que ce fichier garde, en plus du garde de #67
 *
 * `referent-handicap-unique.test.ts` vérifie que les CONSTANTES s'accordent.
 * Celui-ci vérifie le **chemin de résolution** : ce que `resolveOfConfig`
 * REND, y compris quand une variable d'environnement essaie d'imposer autre
 * chose. Un garde sur la constante ne voit pas un repli qui se substitue —
 * c'est la leçon §4 ter du même jour, appliquée une surface plus loin.
 *
 * ## La contrainte de sûreté, et elle est non négociable
 *
 * Le rendu du catalogue ne doit pas bouger d'un caractère. Le texte attendu
 * est figé ci-dessous en toutes lettres : si l'unification le déplace, ne
 * serait-ce que d'une espace, ce test rougit. On refactorise la SOURCE de
 * l'identité, jamais le texte.
 */

import { REFERENT_HANDICAP, ligneContact } from '../contacts-organisme';
import { ACCESSIBILITE_PSH } from '../catalogue-constants';
import { resolveOfConfig } from '../of-config';

/**
 * Le texte du catalogue, figé AU CARACTÈRE tel qu'il est en production après
 * la #67. Ce n'est pas une duplication : c'est le filet qui interdit à une
 * refonte de modifier une page publique à trois semaines d'un audit.
 */
const TEXTE_CATALOGUE_ATTENDU =
  'Formation accessible aux personnes en situation de handicap. Référent handicap : ' +
  'Jean-Guy Ourmières — jean-guy@start-academy.fr — Adaptations sur demande ' +
  '(matériel, rythme, supports). Réseau partenaires : Agefiph, Cap emploi 06, MDPH 06.';

afterEach(() => {
  delete process.env.OF_HANDICAP_REFERENT;
});

describe('Référent handicap — une identité, trois surfaces', () => {
  it('la source unique porte le triplet complet', () => {
    expect(REFERENT_HANDICAP.nom).toBe('Jean-Guy Ourmières');
    expect(REFERENT_HANDICAP.email).toBe('jean-guy@start-academy.fr');
    expect(REFERENT_HANDICAP.telephone).toBe('06 10 23 00 60');
    expect(ligneContact(REFERENT_HANDICAP)).toBe(
      'Jean-Guy Ourmières — jean-guy@start-academy.fr — 06 10 23 00 60',
    );
  });

  it('SÛRETÉ — le texte du catalogue est identique AU CARACTÈRE', () => {
    // Le garde qui autorise la refonte. Il ne vérifie pas « le bon nom » : il
    // vérifie que RIEN n'a bougé.
    expect(ACCESSIBILITE_PSH).toBe(TEXTE_CATALOGUE_ATTENDU);
  });

  it('le texte du catalogue est CONSTRUIT depuis la source, pas recopié', () => {
    // ⚠ Première version de ce test : `expect(ACCESSIBILITE_PSH).toContain(nom)`.
    // Elle passait AVANT tout correctif — le texte contenait déjà le bon nom,
    // en dur. Elle mesurait une chaîne de caractères en croyant mesurer une
    // dépendance. C'est le piège §4 ter, rencontré une troisième fois.
    //
    // Le seul discriminant possible est dans le FICHIER : la constante doit
    // référencer le module, pas répéter son contenu. C'est cette référence qui
    // fera bouger les trois surfaces ensemble le jour où le référent change —
    // et une chaîne identique ne bougerait pas.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'catalogue-constants.ts'),
      'utf8',
    );
    expect(src).toMatch(/from '\.\/contacts-organisme'/);
    expect(src).toMatch(/REFERENT_HANDICAP\b/);
    expect(
      /Jean-Guy Ourmières/.test(src),
      'catalogue-constants.ts répète le nom au lieu de le référencer',
    ).toBe(false);
  });

  it('`of.handicapReferent` rend le référent, pas le dirigeant', () => {
    expect(resolveOfConfig(null).handicapReferent).toBe(REFERENT_HANDICAP.nom);
  });

  it("PUISSANCE — aucune variable d'environnement ne peut imposer un autre nom", () => {
    // Le cœur du correctif. Avant, `OF_HANDICAP_REFERENT` pouvait poser
    // n'importe quel nom sur la page publique — et son ABSENCE en posait un
    // faux. Après, la variable n'existe plus : la poser ne change rien.
    process.env.OF_HANDICAP_REFERENT = 'Quelqu’un d’autre';

    expect(resolveOfConfig(null).handicapReferent).toBe(REFERENT_HANDICAP.nom);
  });

  it('les trois surfaces nomment la MÊME personne', () => {
    // L'invariant qui compte pour l'auditeur : il compare la fiche du
    // catalogue, l'en-tête de la page, et la check-list de formation.
    const surfaces = [
      ACCESSIBILITE_PSH,
      resolveOfConfig(null).handicapReferent,
      ligneContact(REFERENT_HANDICAP),
    ];
    for (const s of surfaces) expect(s).toContain(REFERENT_HANDICAP.nom);
  });
});
