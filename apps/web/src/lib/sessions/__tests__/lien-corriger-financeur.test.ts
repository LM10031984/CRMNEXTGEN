import { describe, it, expect } from 'vitest';

/**
 * La FORME D'URL du lien « Corriger le financeur de l'inscription → ».
 *
 * CE FICHIER EST LE CONTRAT ENTRE DEUX LOTS. Le formulaire cible est livré ici ;
 * le lien qui le pointe sera câblé séparément, dans le bloc Signature de
 * l'onglet « Avant », par quelqu'un d'autre. Entre les deux, il n'y a que cette
 * URL. Si sa forme bouge sans que ce fichier rougisse, le lien mènera à une page
 * qui n'ouvre rien — et ce genre de panne est muet : l'utilisateur clique, la
 * page se recharge, rien ne se passe, personne ne sait pourquoi.
 *
 * ⚠ LE TEST DE PUISSANCE est `tab=session` dans l'URL produite. Les panneaux
 * d'onglet inactifs sont rendus `hidden`, donc `display:none`, ce qui masque
 * jusqu'aux enfants `position:fixed`. Ouvrir la modale depuis `?tab=avant`
 * produirait une modale RÉELLEMENT OUVERTE et TOTALEMENT INVISIBLE.
 */

import {
  CHAMP_FINANCEUR,
  LIBELLE_LIEN_CORRIGER_FINANCEUR,
  ONGLET_PORTEUR,
  lienCorrigerFinanceur,
  ongletDeRetour,
  queryApresEdition,
} from '../lien-corriger-financeur';

const SESSION_ID = 'ses-0048';
const PARTICIPANT_ID = 'part-marion';

describe('lienCorrigerFinanceur — la forme d’URL publiée', () => {
  it('produit exactement l’URL attendue, retour compris', () => {
    expect(
      lienCorrigerFinanceur({
        sessionId: SESSION_ID,
        participantId: PARTICIPANT_ID,
        retour: 'avant',
      }),
    ).toBe('/app/sessions/ses-0048?tab=session&inscription=part-marion&champ=financeur&retour=avant');
  });

  it('PUISSANCE — l’URL pose TOUJOURS tab=session : ailleurs, la modale serait invisible', () => {
    const url = lienCorrigerFinanceur({
      sessionId: SESSION_ID,
      participantId: PARTICIPANT_ID,
      retour: 'apres',
    });
    expect(new URLSearchParams(url.split('?')[1]).get('tab')).toBe(ONGLET_PORTEUR);
    expect(ONGLET_PORTEUR).toBe('session');
  });

  it('sans `retour` : pas de paramètre retour du tout', () => {
    const url = lienCorrigerFinanceur({ sessionId: SESSION_ID, participantId: PARTICIPANT_ID });
    expect(url).not.toContain('retour=');
    expect(new URLSearchParams(url.split('?')[1]).get('champ')).toBe(CHAMP_FINANCEUR);
  });

  it('le libellé du lien est figé et lisible', () => {
    expect(LIBELLE_LIEN_CORRIGER_FINANCEUR).toBe("Corriger le financeur de l'inscription →");
  });
});

describe('ongletDeRetour — une valeur venue de la barre d’adresse n’est jamais crue', () => {
  it('un onglet connu passe', () => {
    expect(ongletDeRetour('avant')).toBe('avant');
    expect(ongletDeRetour('apres')).toBe('apres');
  });

  it('absent ou vide → null (il n’y a nulle part où revenir)', () => {
    expect(ongletDeRetour(null)).toBeNull();
    expect(ongletDeRetour(undefined)).toBeNull();
    expect(ongletDeRetour('   ')).toBeNull();
  });

  it('PUISSANCE — une valeur inventée retombe sur « session », elle n’est pas propagée', () => {
    expect(ongletDeRetour('../../admin')).toBe('session');
    expect(ongletDeRetour('avantX')).toBe('session');
  });
});

describe('queryApresEdition — refermer le formulaire et revenir', () => {
  it('revient sur l’onglet demandé et efface les trois paramètres du formulaire', () => {
    const q = queryApresEdition(
      new URLSearchParams('tab=session&inscription=part-marion&champ=financeur&retour=avant'),
    );
    expect(q).toBe('tab=avant');
  });

  it('PUISSANCE — `inscription` disparaît TOUJOURS : sinon le formulaire se rouvrirait en boucle', () => {
    const q = new URLSearchParams(
      queryApresEdition(
        new URLSearchParams('tab=session&inscription=part-marion&champ=financeur'),
      ),
    );
    expect(q.get('inscription')).toBeNull();
    expect(q.get('champ')).toBeNull();
  });

  it('retour=session → l’URL redevient propre (pas de ?tab=session résiduel)', () => {
    const q = queryApresEdition(
      new URLSearchParams('tab=session&inscription=p1&champ=financeur&retour=session'),
    );
    expect(q).toBe('');
  });

  it('les paramètres étrangers au formulaire sont PRÉSERVÉS (fil d’Ariane `from=`)', () => {
    const q = new URLSearchParams(
      queryApresEdition(
        new URLSearchParams(
          'from=%2Fapp%2Fapprenants&tab=session&inscription=p1&champ=financeur&retour=avant',
        ),
      ),
    );
    expect(q.get('from')).toBe('/app/apprenants');
    expect(q.get('tab')).toBe('avant');
  });

  it('sans `retour`, l’onglet courant n’est pas touché', () => {
    const q = new URLSearchParams(
      queryApresEdition(new URLSearchParams('tab=apres&inscription=p1&champ=financeur')),
    );
    expect(q.get('tab')).toBe('apres');
    expect(q.get('inscription')).toBeNull();
  });
});
