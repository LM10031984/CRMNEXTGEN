/**
 * Lot D (défaut D-C3-5) — le NOM du certificat de signature téléchargé.
 *
 * CE QUE CE FICHIER GARDE. Le certificat (`SignatureRequest.auditTrailUrl`)
 * était produit, stocké et envoyé en pièce jointe depuis le lot C.3 — mais
 * aucun écran ne l'offrait, et le dossier AGEFICE, qui le réclame, ne pouvait
 * donc pas l'emporter. En le servant, on hérite du même piège que les routes de
 * téléchargement du 08/09 : en production, la route REDIRIGE (302) vers une
 * signed URL Supabase, donc le `Content-Disposition` ne s'applique pas et le
 * navigateur retombe sur le nom technique de l'objet — `…audit-trail.pdf`
 * préfixé d'un hash. Le nom doit être calculé, et passé à la signature.
 *
 * ⚠ VALEURS LITTÉRALES (règle n°2 du chantier). On ne compare jamais le retour
 * à `buildDownloadFilename(...)` : les deux côtés bougeraient ensemble et
 * l'assertion ne garderait plus rien.
 */

import { describe, it, expect } from 'vitest';
import {
  nomFichierCertificat,
  personneDuCertificat,
  personnesCouvertesParLaPiece,
} from '../certificat-signature';

describe('nomFichierCertificat — un nom qu’un admin range sans l’ouvrir', () => {
  it('nomme la personne et la session, en ASCII strict', () => {
    expect(
      nomFichierCertificat({
        firstName: 'Stéphane',
        lastName: 'Rousseau',
        sessionCode: 'SES-0112',
      }),
    ).toBe('Certificat-de-signature-Stephane-ROUSSEAU-SES-0112.pdf');
  });

  it('se contente de la session quand la pièce est collective (convention de groupe)', () => {
    // Une convention d'entreprise n'a pas de participant : lui coller un nom
    // ferait croire que le certificat ne couvre qu'une personne.
    expect(nomFichierCertificat({ sessionCode: 'SES-0106' })).toBe(
      'Certificat-de-signature-SES-0106.pdf',
    );
  });

  it('reste un nom valide quand on ne sait rien — jamais une chaîne vide', () => {
    // `?download=` vide ferait réapparaître le nom technique de l'objet : le
    // repli n'est pas un confort, c'est ce qui empêche la régression de 09/08.
    expect(nomFichierCertificat({})).toBe('Certificat-de-signature.pdf');
  });

  it('l’apostrophe et les accents ne partent jamais dans une query string', () => {
    expect(
      nomFichierCertificat({ firstName: "Maël", lastName: "D'Anglade", sessionCode: 'SES-0099' }),
    ).toBe('Certificat-de-signature-Mael-D-ANGLADE-SES-0099.pdf');
  });
});

/* ── LA COLLISION, trouvée en montant le ZIP du pack audit ───────────────── */

/**
 * DEUX CERTIFICATS, UN SEUL NOM. Un dossier AGEFICE porte DEUX demandes de
 * signature — la convention et le formulaire — donc DEUX certificats. Nommés
 * seulement d'après la personne et la session, ils sortaient sous le même nom :
 * deux pièces jointes identiques en apparence dans le mail du financeur, et
 * deux entrées en collision dans le ZIP du pack audit. Un instructeur ne peut
 * alors plus dire quel certificat couvre quelle pièce.
 */
describe('nomFichierCertificat — le certificat porte la PIÈCE qu’il couvre', () => {
  it('nomme la convention', () => {
    expect(
      nomFichierCertificat({
        docType: 'CONVENTION',
        firstName: 'Jean',
        lastName: 'Dupont',
        sessionCode: 'SES-0112',
      }),
    ).toBe('Certificat-de-signature-Convention-Jean-DUPONT-SES-0112.pdf');
  });

  it('nomme le dossier AGEFICE', () => {
    expect(
      nomFichierCertificat({
        docType: 'AGEFICE',
        firstName: 'Jean',
        lastName: 'Dupont',
        sessionCode: 'SES-0112',
      }),
    ).toBe('Certificat-de-signature-Dossier-AGEFICE-Jean-DUPONT-SES-0112.pdf');
  });

  it('nomme l’attestation d’assiduité', () => {
    expect(nomFichierCertificat({ docType: 'ASSIDUITE', sessionCode: 'SES-0112' })).toBe(
      'Certificat-de-signature-Attestation-assiduite-SES-0112.pdf',
    );
  });

  it('les deux certificats d’un même dossier ne portent JAMAIS le même nom', () => {
    const personne = { firstName: 'Jean', lastName: 'Dupont', sessionCode: 'SES-0112' };
    expect(nomFichierCertificat({ ...personne, docType: 'CONVENTION' })).not.toBe(
      nomFichierCertificat({ ...personne, docType: 'AGEFICE' }),
    );
  });

  it('un type inconnu ne fabrique pas un segment bancal — il n’en met aucun', () => {
    // Mieux vaut un nom générique qu'un `Certificat-de-signature-UNKNOWN-…`
    // qui ferait chercher un type de document inexistant.
    expect(nomFichierCertificat({ docType: 'PROGRAMME', sessionCode: 'SES-0112' })).toBe(
      'Certificat-de-signature-SES-0112.pdf',
    );
  });
});

/* ── UN SEUL NOMMAGE, PARTAGÉ PAR LA ROUTE ET LE DOSSIER ─────────────────── */

/**
 * CE QUE LA RECETTE A VU (12/09/2026). Le même certificat s'appelait
 * `Certificat-de-signature-Convention-DEMO-SIG-01.pdf` téléchargé depuis la
 * ligne, et
 * `Certificat-de-signature-Convention-Julien-DEMO-SIG-BERNARD-DEMO-SIG-01.pdf`
 * en pièce jointe du dossier. Deux noms pour un fichier : impossible de dire à
 * un financeur « c'est le même document ».
 *
 * POURQUOI LES DEUX DIVERGEAIENT. La route lisait le participant sur le
 * `Document` (nul pour une convention de GROUPE, qui ne porte que son
 * organisation) ; le dossier, lui, le lisait sur l'inscription qu'il compose.
 * Le dossier avait donc TOUJOURS un nom — au prix d'un défaut symétrique : le
 * certificat d'une convention de groupe prenait le nom de l'inscrit dont on
 * ouvrait le dossier, soit autant de noms que de salariés pour un seul fichier.
 *
 * LA RÈGLE PARTAGÉE : un certificat porte un nom de personne quand la demande
 * ne couvre QU'ELLE. Sinon, il n'en porte aucun — un fichier unique ne peut pas
 * s'appeler du nom de l'un des trois qu'il couvre.
 */
describe('personneDuCertificat — nommer quelqu’un seulement si la demande ne couvre que lui', () => {
  const JULIEN = { firstName: 'Julien', lastName: 'DEMO-SIG BERNARD' };
  const ALICE = { firstName: 'Alice', lastName: 'MARTIN' };

  it('un seul couvert : c’est lui', () => {
    expect(personneDuCertificat([JULIEN])).toEqual(JULIEN);
  });

  it('deux couverts (convention de groupe) : personne', () => {
    expect(personneDuCertificat([JULIEN, ALICE])).toBeNull();
  });

  it('aucun couvert : personne', () => {
    expect(personneDuCertificat([])).toBeNull();
  });

  it('le même inscrit cité deux fois ne compte QUE pour un', () => {
    // Une demande peut porter deux pièces du même apprenant (convention
    // individuelle + dossier AGEFICE) : ce n'est pas un groupe.
    expect(personneDuCertificat([JULIEN, { ...JULIEN }])).toEqual(JULIEN);
  });

  it('deux homonymes stricts restent une seule personne', () => {
    // Cas dégénéré assumé : on ne dispose pas des ids ici, et deux noms
    // identiques produiraient de toute façon le même nom de fichier.
    expect(personneDuCertificat([ALICE, { ...ALICE }])).toEqual(ALICE);
  });
});

describe('les deux appelants produisent LE MÊME nom pour le MÊME certificat', () => {
  it('convention individuelle (EI) : le participant, des deux côtés', () => {
    const couverts = [{ firstName: 'Julien', lastName: 'DEMO-SIG BERNARD' }];
    const personne = personneDuCertificat(couverts);
    expect(
      nomFichierCertificat({
        docType: 'CONVENTION',
        firstName: personne?.firstName,
        lastName: personne?.lastName,
        sessionCode: 'DEMO-SIG-01',
      }),
    ).toBe('Certificat-de-signature-Convention-Julien-DEMO-SIG-BERNARD-DEMO-SIG-01.pdf');
  });

  it('convention de groupe : aucun nom, des deux côtés', () => {
    const personne = personneDuCertificat([
      { firstName: 'Alice', lastName: 'MARTIN' },
      { firstName: 'Bob', lastName: 'DURAND' },
    ]);
    expect(
      nomFichierCertificat({
        docType: 'CONVENTION',
        firstName: personne?.firstName,
        lastName: personne?.lastName,
        sessionCode: 'SES-0106',
      }),
    ).toBe('Certificat-de-signature-Convention-SES-0106.pdf');
  });
});

/* ── QUI une pièce couvre — la seule lecture de la portée ─────────────────── */

describe('personnesCouvertesParLaPiece — les deux formes de stockage', () => {
  const ALICE = { firstName: 'Alice', lastName: 'MARTIN' };
  const BOB = { firstName: 'Bob', lastName: 'DURAND' };
  const JULIEN = { firstName: 'Julien', lastName: 'DEMO-SIG BERNARD' };

  const INSCRITS = [
    { sponsorOrgId: 'org-provence', person: ALICE },
    { sponsorOrgId: 'org-provence', person: BOB },
    { sponsorOrgId: 'org-julien-ei', person: JULIEN },
  ];

  it('pièce NOMINATIVE : son participant, et lui seul', () => {
    expect(
      personnesCouvertesParLaPiece({
        piece: { entityType: 'participant', entityId: null, participant: JULIEN },
        participantsSession: INSCRITS,
      }),
    ).toEqual([JULIEN]);
  });

  it('convention de GROUPE : les inscrits de CE commanditaire', () => {
    // Une session peut réunir deux entreprises : prendre tout le monde ferait
    // dire à la convention de Provence qu'elle couvre aussi Julien.
    expect(
      personnesCouvertesParLaPiece({
        piece: { entityType: 'organization', entityId: 'org-provence', participant: null },
        participantsSession: INSCRITS,
      }),
    ).toEqual([ALICE, BOB]);
  });

  it('convention d’une ENTREPRISE INDIVIDUELLE stockée en groupe : une seule personne', () => {
    // Le cas DEMO-SIG-01 : la route ne nommait personne, le dossier nommait
    // Julien. C'est CE chemin qui manquait.
    expect(
      personnesCouvertesParLaPiece({
        piece: { entityType: 'organization', entityId: 'org-julien-ei', participant: null },
        participantsSession: INSCRITS,
      }),
    ).toEqual([JULIEN]);
  });

  it('forme « session » (produite par les scripts) : toute la session', () => {
    expect(
      personnesCouvertesParLaPiece({
        piece: { entityType: 'session', entityId: 'sess-1', participant: null },
        participantsSession: INSCRITS,
      }),
    ).toEqual([ALICE, BOB, JULIEN]);
  });

  it('forme inconnue : personne — on ne devine pas une portée', () => {
    expect(
      personnesCouvertesParLaPiece({
        piece: { entityType: 'chose', entityId: 'x', participant: null },
        participantsSession: INSCRITS,
      }),
    ).toEqual([]);
  });
});
