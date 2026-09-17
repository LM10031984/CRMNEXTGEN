/**
 * « Dissous » ne doit pas vouloir dire « disparu ».
 *
 * La doctrine du 17/09 supprime le module garde-fous et met l'IA dans le geste
 * métier. Le bloc « Règle qui traverse le module » est ce qui remplace le
 * module supprimé — trois phrases, dans chaque module qui porte un geste IA.
 *
 * Ce que ces tests protègent : **un module ne peut pas mettre un outil d'IA
 * dans les mains d'un stagiaire sans les précautions qui vont avec.** Sans
 * cette garde, retirer le module garde-fous revient à retirer les garde-fous.
 *
 * Et le pendant, aussi important : la garde ne doit rien exiger d'un module qui
 * ne cite aucun outil. Coller la règle partout la viderait de son sens — un
 * texte qu'on lit partout ne se lit plus nulle part (§4 quaterdecies).
 */
import { describe, expect, it } from 'vitest';

import {
  ENTETE_REGLE,
  citeUnOutilIA,
  porteLaRegle,
  sortDuGesteIA,
} from '../lib/regle-ia-metier.js';

const REGLE = `${ENTETE_REGLE} L'IA prépare, le conseiller décide. Rien ne part au client sans relecture. Aucune donnée confidentielle dans un outil.`;

describe('citeUnOutilIA — une liste, pas une intuition', () => {
  it('voit les outils nommés', () => {
    expect(citeUnOutilIA('Chacun monte son projet ChatGPT par mandat.')).toBe(true);
    expect(citeUnOutilIA('Le dossier rassemblé dans un carnet NotebookLM.')).toBe(true);
  });

  it('voit les tournures génériques — un geste IA n’a pas besoin d’une marque', () => {
    expect(citeUnOutilIA("demandez à l'IA de préparer le compte rendu")).toBe(true);
    expect(citeUnOutilIA('intelligence artificielle au service du conseiller')).toBe(true);
    expect(citeUnOutilIA('Coller le prompt préparé en séance.')).toBe(true);
  });

  it('ne prend pas « ia » dans un autre mot pour un geste IA', () => {
    // Le faux positif qui aurait rendu la garde absurde : « médias »,
    // « spécialiser », « initiale », « diagnostic » contiennent tous « ia ».
    expect(citeUnOutilIA('Diffuser sur les médias sociaux, initialement.')).toBe(false);
    expect(citeUnOutilIA('Se spécialiser sur son secteur.')).toBe(false);
  });

  it('ne voit rien dans un module métier sans outil', () => {
    expect(citeUnOutilIA('Poser les bonnes questions au vendeur, écouter, reformuler.')).toBe(
      false,
    );
  });
});

describe('sortDuGesteIA — un geste IA porte sa règle, ou il est refusé', () => {
  it('REFUSE un geste IA sans la règle', () => {
    // Le cas réel : `drive:047#20` fait « s'aider de ChatGPT » pour écrire une
    // demande d'avis, sans porter le bloc.
    const sort = sortDuGesteIA("Chacun écrit sa demande, s'aide de ChatGPT, puis corrige.");
    expect(sort.conforme).toBe(false);
    expect(sort.conforme === false && sort.motif).toContain('garde-fous');
  });

  it('accepte le même geste dès que la règle est là', () => {
    expect(
      sortDuGesteIA(`${REGLE}\n\nChacun écrit sa demande, s'aide de ChatGPT, puis corrige.`)
        .conforme,
    ).toBe(true);
  });

  it("n'exige RIEN d'un module métier sans geste IA", () => {
    // La moitié qui empêche la garde de devenir un tampon. Dix des treize
    // modules composés au 17/09 sont dans ce cas.
    expect(sortDuGesteIA('Identifier les objections courantes et y répondre.').conforme).toBe(true);
  });

  it('exige le bloc EXACT, pas une paraphrase', () => {
    // Un contrat de forme : le bloc est repérable par un lecteur et par le
    // composeur. « On fera attention aux données » n'est pas la règle.
    expect(
      sortDuGesteIA('Avec ChatGPT. On fera attention aux données confidentielles.').conforme,
    ).toBe(false);
    expect(porteLaRegle(REGLE)).toBe(true);
  });
});
