/**
 * Lot D — L'ÉCRAN « DOSSIER PRÊT », décidé hors du JSX.
 *
 * Attente de Laurent (10/09) : « l'admin ouvre le dossier du participant et
 * trouve un écran Dossier prêt … et UN SEUL bouton Envoyer. Si une pièce
 * manque ou n'est pas signée : bloquant nominatif, jamais d'envoi partiel
 * silencieux. »
 *
 * L'écran d'avant ne disait RIEN de la signature : il listait des pièces
 * jointes avec une case à cocher, et l'admin découvrait le refus au clic — ou
 * pire, le financeur découvrait la convention vierge trois semaines plus tard.
 *
 * ⚠ LA MÊME DISCIPLINE QUE LE BLOC « SIGNATURE » : le bouton de forçage EXISTE
 * ou n'existe pas, jamais grisé. Un bouton grisé laisse croire qu'il manque un
 * réglage, alors qu'ici il manque un RÔLE.
 */

import { describe, it, expect } from 'vitest';
import { vueDossierPret } from '../etat-dossier';
import type { KindPieceDossier } from '../pieces-dossier';

function piece(
  kind: KindPieceDossier,
  over: { included?: boolean; signe?: boolean } = {},
): { kind: KindPieceDossier; included: boolean; signe?: boolean } {
  return { kind, included: over.included ?? true, signe: over.signe };
}

const TOUT_SIGNE = [
  piece('CONVENTION', { signe: true }),
  piece('AGEFICE_PA_FORM', { signe: true }),
  piece('AUDIT_TRAIL', { signe: false }),
  piece('CNI', { signe: false }),
];

describe('vueDossierPret — prêt', () => {
  it('tout signé, un destinataire : le dossier est PRÊT', () => {
    const vue = vueDossierPret({
      attachments: TOUT_SIGNE,
      destinataire: 'formation@cci-nice.fr',
      role: 'ADMIN',
    });
    expect(vue.etat).toBe('PRET');
    expect(vue.blocage).toBeNull();
    expect(vue.envoiPossible).toBe(true);
    expect(vue.forcagePossible).toBe(false);
  });

  it('le certificat et la CNI ne se signent pas — ils ne retiennent rien', () => {
    expect(vueDossierPret({ attachments: TOUT_SIGNE, destinataire: 'x@y.fr', role: 'ADMIN' }).nonSignees).toEqual([]);
  });
});

describe('vueDossierPret — incomplet', () => {
  const INCOMPLET = [
    piece('CONVENTION', { signe: false }),
    piece('AGEFICE_PA_FORM', { signe: true }),
  ];

  it('nomme la pièce non signée, et refuse l’envoi ordinaire', () => {
    const vue = vueDossierPret({ attachments: INCOMPLET, destinataire: 'x@y.fr', role: 'ADMIN' });
    expect(vue.etat).toBe('INCOMPLET');
    expect(vue.nonSignees).toEqual(['CONVENTION']);
    expect(vue.blocage).toContain('Convention de formation non signée');
    expect(vue.envoiPossible).toBe(false);
  });

  it('un ADMIN se voit offrir le forçage — c’est sa décision', () => {
    expect(
      vueDossierPret({ attachments: INCOMPLET, destinataire: 'x@y.fr', role: 'ADMIN' }).forcagePossible,
    ).toBe(true);
  });

  it('un MANAGER ne se le voit pas offrir', () => {
    expect(
      vueDossierPret({ attachments: INCOMPLET, destinataire: 'x@y.fr', role: 'MANAGER' }).forcagePossible,
    ).toBe(false);
  });

  it('une pièce DÉCOCHÉE ne retient plus rien — elle ne part pas', () => {
    // L'admin qui décoche la convention monte un dossier partiel assumé : lui
    // opposer « convention non signée » serait parler d'une pièce absente.
    const vue = vueDossierPret({
      attachments: [piece('CONVENTION', { included: false, signe: false }), piece('AGEFICE_PA_FORM', { signe: true })],
      destinataire: 'x@y.fr',
      role: 'ADMIN',
    });
    expect(vue.etat).toBe('PRET');
  });

  it('un brouillon d’AVANT le lot D (aucun `signe` connu) ne se bloque pas rétroactivement', () => {
    const vue = vueDossierPret({
      attachments: [piece('CONVENTION'), piece('AGEFICE_PA_FORM')],
      destinataire: 'x@y.fr',
      role: 'ADMIN',
    });
    expect(vue.etat).toBe('PRET');
    expect(vue.nonSignees).toEqual([]);
  });
});

describe('vueDossierPret — sans destinataire', () => {
  it('aucune adresse : le blocage porte sur l’adresse, pas sur les signatures', () => {
    const vue = vueDossierPret({ attachments: TOUT_SIGNE, destinataire: '  ', role: 'ADMIN' });
    expect(vue.etat).toBe('SANS_DESTINATAIRE');
    expect(vue.envoiPossible).toBe(false);
    // Forcer ne créerait pas d'adresse : l'option n'a pas de sens ici.
    expect(vue.forcagePossible).toBe(false);
    expect(vue.blocage).toBe(
      'Aucune adresse destinataire : renseignez-la ci-dessus avant d’envoyer le dossier.',
    );
  });

  it('l’adresse manquante PASSE AVANT les signatures — c’est elle qu’on corrige d’abord', () => {
    const vue = vueDossierPret({
      attachments: [piece('CONVENTION', { signe: false })],
      destinataire: '',
      role: 'ADMIN',
    });
    expect(vue.etat).toBe('SANS_DESTINATAIRE');
  });
});

describe('vueDossierPret — rien à envoyer', () => {
  it('aucune pièce cochée : pas d’envoi, et la phrase le dit', () => {
    const vue = vueDossierPret({
      attachments: [piece('CONVENTION', { included: false, signe: true })],
      destinataire: 'x@y.fr',
      role: 'ADMIN',
    });
    expect(vue.etat).toBe('SANS_PIECE');
    expect(vue.envoiPossible).toBe(false);
    expect(vue.blocage).toBe('Aucune pièce jointe sélectionnée : le dossier serait vide.');
  });
});
