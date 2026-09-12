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
import { nomFichierCertificat } from '../certificat-signature';

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
