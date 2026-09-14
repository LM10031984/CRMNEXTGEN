/**
 * Lot D — LE SOUS-DOSSIER `signes/` DU PACK AUDIT.
 *
 * Spec §5 lot D : « Pack closure / ZIP audit : inclut les signés + audit trails
 * dans un sous-dossier `signes/`. »
 *
 * POURQUOI UN SOUS-DOSSIER, ET PAS LES SIGNÉS À LA PLACE DES ORIGINAUX. Le ZIP
 * est rangé par APPRENANT (`Stephane-ROUSSEAU/…`) et sert à prouver le
 * déroulement de la formation ; les pièces signées, elles, prouvent
 * l'ENGAGEMENT — et un auditeur les demande ensemble mais les lit séparément.
 * Substituer les signés aux originaux ferait aussi disparaître la convention
 * vierge, qui reste la pièce à re-signer quand un refus arrive.
 *
 * ⚠ MODULE PUR : il compose des entrées, il ne télécharge rien. C'est ce qui
 * rend les collisions de noms testables en une ligne — et il y en avait une.
 */

import { describe, it, expect } from 'vitest';
import { DOSSIER_SIGNES, entreesSignees } from '../entrees-signees';

const JEAN = { firstName: 'Jean', lastName: 'Dupont' };

describe('entreesSignees — les pièces signées', () => {
  it('range chaque PDF signé sous `signes/`, avec un nom parlant', () => {
    expect(
      entreesSignees({
        sessionCode: 'SES-0112',
        documents: [
          {
            type: 'CONVENTION',
            signedPdfUrl: 'sessions/t1/SES-0112/signed/convention.pdf',
            person: JEAN,
            signatureRequest: null,
          },
        ],
      }),
    ).toEqual([
      {
        key: 'sessions/t1/SES-0112/signed/convention.pdf',
        name: 'signes/Convention-de-formation-Jean-DUPONT-SES-0112-signe.pdf',
      },
    ]);
  });

  it('ignore les documents NON signés — le ZIP les porte déjà en clair', () => {
    expect(
      entreesSignees({
        sessionCode: 'SES-0112',
        documents: [
          { type: 'CONVENTION', signedPdfUrl: null, person: JEAN, signatureRequest: null },
          { type: 'AGEFICE', signedPdfUrl: '   ', person: JEAN, signatureRequest: null },
        ],
      }),
    ).toEqual([]);
  });

  it('le dossier s’appelle `signes`, et ce nom est figé à un endroit', () => {
    expect(DOSSIER_SIGNES).toBe('signes');
  });
});

describe('entreesSignees — les certificats', () => {
  it('joint le certificat de la demande, nommé d’après la pièce qu’il couvre', () => {
    const entrees = entreesSignees({
      sessionCode: 'SES-0112',
      documents: [
        {
          type: 'CONVENTION',
          signedPdfUrl: 'signed/convention.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-1', auditTrailUrl: 'signed/convention.audit-trail.pdf' },
        },
      ],
    });
    expect(entrees).toContainEqual({
      key: 'signed/convention.audit-trail.pdf',
      name: 'signes/Certificat-de-signature-Convention-Jean-DUPONT-SES-0112.pdf',
    });
  });

  it('UNE demande, UN certificat — même quand elle couvre deux pièces', () => {
    const entrees = entreesSignees({
      sessionCode: 'SES-0112',
      documents: [
        {
          type: 'CONVENTION',
          signedPdfUrl: 'signed/a.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-1', auditTrailUrl: 'signed/x.audit-trail.pdf' },
        },
        {
          type: 'ASSIDUITE',
          signedPdfUrl: 'signed/b.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-1', auditTrailUrl: 'signed/x.audit-trail.pdf' },
        },
      ],
    });
    expect(entrees.filter((e) => e.key.includes('audit-trail'))).toHaveLength(1);
  });

  it('deux demandes pour la même personne : DEUX certificats, DEUX noms', () => {
    // La collision qui a fait corriger `nomFichierCertificat` : sans le segment
    // de pièce, les deux entrées écrasaient l'une l'autre dans le ZIP.
    const entrees = entreesSignees({
      sessionCode: 'SES-0112',
      documents: [
        {
          type: 'CONVENTION',
          signedPdfUrl: 'signed/c.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-1', auditTrailUrl: 'signed/c.audit-trail.pdf' },
        },
        {
          type: 'AGEFICE',
          signedPdfUrl: 'signed/a.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-2', auditTrailUrl: 'signed/a.audit-trail.pdf' },
        },
      ],
    });
    const noms = entrees.filter((e) => e.key.includes('audit-trail')).map((e) => e.name);
    expect(noms).toEqual([
      'signes/Certificat-de-signature-Convention-Jean-DUPONT-SES-0112.pdf',
      'signes/Certificat-de-signature-Dossier-AGEFICE-Jean-DUPONT-SES-0112.pdf',
    ]);
  });

  it('c’est bien la DEMANDE qui dédoublonne, pas la clé du certificat', () => {
    // ⚠ TEST RENFORCÉ après une mutation restée verte. Dédoublonner par clé
    // donnait le même résultat sur les cas nominaux — les deux pièces d'une
    // même demande portent la même clé. La différence apparaît quand la clé a
    // CHANGÉ entre deux lectures : le webhook re-télécharge le certificat après
    // un échec, et l'écrit sous un chemin neuf. Dédoublonner par clé mettrait
    // alors DEUX certificats de la même demande dans l'archive, dont un périmé.
    const entrees = entreesSignees({
      sessionCode: 'SES-0112',
      documents: [
        {
          type: 'CONVENTION',
          signedPdfUrl: 'signed/a.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-1', auditTrailUrl: 'signed/x.audit-trail.pdf' },
        },
        {
          type: 'ASSIDUITE',
          signedPdfUrl: 'signed/b.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-1', auditTrailUrl: 'signed/x-bis.audit-trail.pdf' },
        },
      ],
    });
    const certificats = entrees.filter((e) => e.key.includes('audit-trail'));
    expect(certificats).toHaveLength(1);
    // Et c'est la PREMIÈRE lue qui gagne — l'ordre de la requête est
    // `createdAt: 'asc'`, donc la pièce la plus ancienne de la demande.
    expect(certificats[0]!.key).toBe('signed/x.audit-trail.pdf');
  });

  it('une demande SANS certificat n’ajoute rien', () => {
    const entrees = entreesSignees({
      sessionCode: 'SES-0112',
      documents: [
        {
          type: 'CONVENTION',
          signedPdfUrl: 'signed/c.pdf',
          person: JEAN,
          signatureRequest: { id: 'req-1', auditTrailUrl: null },
        },
      ],
    });
    expect(entrees).toHaveLength(1);
  });
});

describe('entreesSignees — pas deux fois la même clé', () => {
  it('un scan déposé sur une convention de GROUPE ne sort qu’une fois', () => {
    // Une convention de groupe n'a pas de participant : deux documents de même
    // type peuvent pointer la même clé signée (formes de stockage historiques).
    const entrees = entreesSignees({
      sessionCode: 'SES-0106',
      documents: [
        { type: 'CONVENTION', signedPdfUrl: 'signed/g.pdf', person: null, signatureRequest: null },
        { type: 'CONVENTION', signedPdfUrl: 'signed/g.pdf', person: null, signatureRequest: null },
      ],
    });
    expect(entrees).toEqual([
      { key: 'signed/g.pdf', name: 'signes/Convention-de-formation-SES-0106-signe.pdf' },
    ]);
  });
});
