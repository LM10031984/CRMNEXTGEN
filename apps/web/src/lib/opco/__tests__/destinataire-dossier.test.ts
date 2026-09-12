/**
 * Lot D — À QUI PART LE DOSSIER DE FINANCEMENT.
 *
 * CE QUE FAISAIT L'APPLICATION, ET POURQUOI C'ÉTAIT FAUX POUR L'AGEFICE.
 * `composeOpcoSubmission` pré-remplissait `sponsorOrg.emailBilling ?? email` —
 * l'adresse de l'entreprise COMMANDITAIRE. Pour un OPCO de branche, c'est
 * discutable ; pour l'AGEFICE, c'est franchement faux : le dossier se dépose
 * auprès d'un POINT D'ACCUEIL, choisi d'après le département du stagiaire.
 * Pré-remplir l'adresse de l'entreprise du stagiaire, c'est proposer d'envoyer
 * le dossier à l'intéressé lui-même.
 *
 * ⚠ ON NE SE RABAT PAS SUR L'ENTREPRISE quand le point d'accueil n'a pas
 * d'adresse. Un repli silencieux enverrait le dossier au mauvais destinataire —
 * et un envoi parti au mauvais endroit ne se rattrape pas. On rend `null` avec
 * son motif, et l'éditeur laisse l'admin saisir l'adresse en connaissance de
 * cause.
 */

import { describe, it, expect } from 'vitest';
import { aideDestinataireDossier, resoudreDestinataireDossier } from '../destinataire-dossier';

const PA_NICE = { name: 'CCI Nice Côte d’Azur', email: 'formation@cci-nice.fr' };

describe('resoudreDestinataireDossier — AGEFICE : le point d’accueil, pas l’entreprise', () => {
  it('prend l’adresse du point d’accueil résolu', () => {
    expect(
      resoudreDestinataireDossier({
        opcoCode: 'AGEFICE',
        pointAccueil: PA_NICE,
        emailBilling: 'compta@agence-martin.fr',
        email: 'contact@agence-martin.fr',
      }),
    ).toEqual({
      email: 'formation@cci-nice.fr',
      source: 'POINT_ACCUEIL_AGEFICE',
      libelle: 'CCI Nice Côte d’Azur',
      motif: null,
    });
  });

  it('sans point d’accueil résolu : AUCUN destinataire, et le motif le dit', () => {
    expect(
      resoudreDestinataireDossier({
        opcoCode: 'AGEFICE',
        pointAccueil: null,
        emailBilling: 'compta@agence-martin.fr',
        email: null,
      }),
    ).toEqual({
      email: null,
      source: 'AUCUN',
      libelle: null,
      motif:
        'Aucun point d’accueil AGEFICE rattaché : le dossier se dépose auprès du point ' +
        'd’accueil du département du stagiaire, jamais auprès de son entreprise. ' +
        'Rattachez-le sur la fiche organisation, ou saisissez l’adresse ci-dessous.',
    });
  });

  it('un point d’accueil SANS adresse ne se remplace pas par l’entreprise', () => {
    const r = resoudreDestinataireDossier({
      opcoCode: 'AGEFICE',
      pointAccueil: { name: 'CCI de l’Ardèche', email: null },
      emailBilling: 'compta@agence-martin.fr',
      email: null,
    });
    expect(r.email).toBeNull();
    expect(r.source).toBe('AUCUN');
    expect(r.motif).toBe(
      'Aucune adresse email pour le point d’accueil « CCI de l’Ardèche » : renseignez-la ' +
        'dans le référentiel, ou saisissez l’adresse ci-dessous.',
    );
  });
});

describe('resoudreDestinataireDossier — les autres financeurs : comportement inchangé', () => {
  it('prend l’adresse de facturation du commanditaire en priorité', () => {
    expect(
      resoudreDestinataireDossier({
        opcoCode: 'OPCO_EP',
        pointAccueil: null,
        emailBilling: 'compta@agence-martin.fr',
        email: 'contact@agence-martin.fr',
      }),
    ).toEqual({
      email: 'compta@agence-martin.fr',
      source: 'ORGANISATION',
      libelle: null,
      motif: null,
    });
  });

  it('retombe sur l’adresse générale quand la facturation n’en a pas', () => {
    expect(
      resoudreDestinataireDossier({
        opcoCode: 'OPCO_EP',
        pointAccueil: null,
        emailBilling: null,
        email: 'contact@agence-martin.fr',
      }).email,
    ).toBe('contact@agence-martin.fr');
  });

  it('sans financeur connu, le commanditaire reste le destinataire par défaut', () => {
    expect(
      resoudreDestinataireDossier({
        opcoCode: null,
        pointAccueil: null,
        emailBilling: null,
        email: 'contact@agence-martin.fr',
      }).source,
    ).toBe('ORGANISATION');
  });

  it('aucune adresse du tout : AUCUN, avec son motif', () => {
    const r = resoudreDestinataireDossier({
      opcoCode: 'OPCO_EP',
      pointAccueil: null,
      emailBilling: null,
      email: null,
    });
    expect(r.email).toBeNull();
    expect(r.source).toBe('AUCUN');
    expect(r.motif).toBe(
      'Aucune adresse email sur le commanditaire : renseignez-la sur sa fiche ' +
        'organisation (facturation ou contact), ou saisissez l’adresse ci-dessous.',
    );
  });

  it('les adresses BLANCHES ne comptent pas', () => {
    expect(
      resoudreDestinataireDossier({
        opcoCode: 'OPCO_EP',
        pointAccueil: null,
        emailBilling: '   ',
        email: 'contact@agence-martin.fr',
      }).email,
    ).toBe('contact@agence-martin.fr');
  });
});

/* ── D-D-1 — l'aide sous un champ destinataire vide ──────────────────────── */

describe('aideDestinataireDossier — ce qu’on lit sous un champ vide', () => {
  it('AGEFICE : le point d’accueil, nommé avec l’organisation', () => {
    expect(
      aideDestinataireDossier({ opcoCode: 'AGEFICE', organisation: 'DUPONT Jean' }),
    ).toBe(
      'Point d’accueil AGEFICE non rattaché à DUPONT Jean — renseignez son département / ' +
        'point d’accueil sur la fiche organisation.',
    );
  });

  it('OPCO de branche : l’adresse de facturation, EN FRANÇAIS', () => {
    // L'ancienne phrase nommait la colonne `emailBilling` : elle supposait que
    // le lecteur sache où la trouver, alors que l'écran l'appelle « Email de
    // facturation ».
    expect(
      aideDestinataireDossier({ opcoCode: 'OPCO_EP', organisation: 'AGENCE MARTIN' }),
    ).toBe(
      'Aucune adresse de facturation pour AGENCE MARTIN — renseignez-la sur sa fiche organisation.',
    );
  });

  it('aucune phrase ne nomme une colonne de base', () => {
    for (const code of ['AGEFICE', 'OPCO_EP', null]) {
      const aide = aideDestinataireDossier({ opcoCode: code, organisation: 'X' });
      expect(aide).not.toMatch(/emailBilling|opcoCode|sponsor/i);
    }
  });

  it('sans nom d’organisation, la phrase reste lisible', () => {
    expect(aideDestinataireDossier({ opcoCode: 'AGEFICE', organisation: null })).toContain(
      'non rattaché à cette organisation',
    );
  });
});
