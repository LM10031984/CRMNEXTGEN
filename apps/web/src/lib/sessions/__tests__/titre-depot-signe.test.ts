/**
 * Le titre de la zone de dépôt — retour d'écran Laurent, 11/09/2026 (n°5).
 *
 * CE QUI CLOCHAIT. L'en-tête se fabriquait par concaténation :
 * `Déposer les {libellé du type} signés`, avec le libellé de l'option
 * `<select>` passé en minuscules. Sur le type CONVENTION, cela produisait
 * « Déposer les convention signés » — pluriel absent, accord masculin sur un
 * nom féminin. La faute n'était pas un oubli ponctuel : une concaténation qui
 * porte un accord en dur en produira toujours une, au prochain type ajouté.
 *
 * LA RÈGLE POSÉE : une TABLE de libellés par `DocType`. Le pluriel et l'accord
 * sont écrits dans la donnée, une fois, à côté du type qu'ils qualifient.
 *
 * Ces tests gardent les cinq types que les deux onglets proposent réellement
 * (Avant : convention, AGEFICE, convocation ; Après : émargement, assiduité) et
 * le fait que le titre SUIVE le type choisi.
 */

import { describe, it, expect } from 'vitest';
import { titreDepotSigne, TITRE_DEPOT_PAR_DOCTYPE } from '../titre-depot-signe';

describe('titreDepotSigne — l’accord vient de la table, jamais d’une concaténation', () => {
  it('CONVENTION : le cas signalé à l’écran, féminin pluriel', () => {
    expect(titreDepotSigne('CONVENTION')).toBe('Déposer les conventions signées');
  });

  it('AGEFICE : masculin pluriel, et le sigle garde ses capitales', () => {
    expect(titreDepotSigne('AGEFICE')).toBe('Déposer les dossiers AGEFICE signés');
  });

  it('ASSIDUITE : féminin pluriel, avec l’apostrophe typographique', () => {
    expect(titreDepotSigne('ASSIDUITE')).toBe('Déposer les attestations d’assiduité signées');
  });

  it('EMARGEMENT : « feuilles d’émargement », féminin pluriel', () => {
    expect(titreDepotSigne('EMARGEMENT')).toBe('Déposer les feuilles d’émargement signées');
  });

  it('CONVOCATION : féminin pluriel', () => {
    expect(titreDepotSigne('CONVOCATION')).toBe('Déposer les convocations signées');
  });

  it('un type inconnu ne produit JAMAIS une faute — il produit un titre neutre', () => {
    // Un type non branché doit dégrader proprement : mieux vaut un titre
    // générique qu'un accord deviné sur un libellé quelconque.
    expect(titreDepotSigne('CUSTOM')).toBe('Déposer les documents signés');
    expect(titreDepotSigne('')).toBe('Déposer les documents signés');
  });

  it('aucun titre de la table ne porte l’accord fautif constaté à l’écran', () => {
    for (const titre of Object.values(TITRE_DEPOT_PAR_DOCTYPE)) {
      expect(titre.startsWith('Déposer les ')).toBe(true);
      // « … signés » ou « … signées », jamais « signé » au singulier.
      expect(/ sign(é|ée)s$/.test(titre)).toBe(true);
    }
  });

  it('les cinq types réellement proposés par les deux onglets sont couverts', () => {
    for (const docType of ['CONVENTION', 'AGEFICE', 'CONVOCATION', 'EMARGEMENT', 'ASSIDUITE']) {
      expect(Object.keys(TITRE_DEPOT_PAR_DOCTYPE)).toContain(docType);
    }
  });
});

/**
 * Demande n°4 de Laurent (11/09/2026) — UNE SEULE ZONE, UNE SEULE RÈGLE.
 *
 * La zone de dépôt vivait à part, dans les onglets Avant et Après. Elle
 * rejoint le bloc « Signature électronique », en section repliée sous les
 * lignes : les deux chemins vers la même preuve — faire signer à distance,
 * rentrer le papier signé — se lisent au même endroit.
 *
 * Les trois chaînes sont ici, et testées LITTÉRALEMENT : elles sont importées
 * par le composant, donc une assertion qui comparerait le DOM à la constante
 * collapserait avec elle. C'est ce fichier qui tient la valeur.
 */
describe('Les mots de la zone repliée — demande n°4', () => {
  it('le titre est une QUESTION : c’est ce qui dit à qui la section s’adresse', async () => {
    const { TITRE_DEPOT_MANUEL } = await import('../titre-depot-signe');
    expect(TITRE_DEPOT_MANUEL).toBe('Exemplaire signé à la main ?');
  });

  it('l’aide est celle dictée, AU MOT PRÈS', async () => {
    const { AIDE_DEPOT_MANUEL } = await import('../titre-depot-signe');
    expect(AIDE_DEPOT_MANUEL).toBe(
      'Glissez le PDF : il sera rattaché au participant dont le nom figure dans le nom du ' +
        'fichier, sinon vous choisissez dans la liste. Vous pouvez aussi le déposer ' +
        'directement sur la cellule du participant dans la matrice.',
    );
  });

  it('la mention explique POURQUOI cette zone ne sert qu’au papier', async () => {
    const { MENTION_RETOUR_AUTOMATIQUE } = await import('../titre-depot-signe');
    // Sans elle, un admin se demande s'il doit aussi déposer ici les pièces
    // qu'il vient d'envoyer en signature — et finit par le faire, ce qui
    // annulerait l'envoi (règle fail-closed de C.2b-3).
    expect(MENTION_RETOUR_AUTOMATIQUE).toContain('reviendront automatiquement');
    expect(MENTION_RETOUR_AUTOMATIQUE).toContain('C.3');
    expect(MENTION_RETOUR_AUTOMATIQUE).toContain('papier');
  });
});
