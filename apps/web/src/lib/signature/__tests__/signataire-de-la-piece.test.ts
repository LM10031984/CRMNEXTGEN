/**
 * « Qui signe, et à quelle adresse » — extraction du moteur, correction n°4 du
 * retour d'écran Laurent (11/09/2026).
 *
 * POURQUOI CE MODULE EXISTE. Laurent veut lire le signataire et son adresse
 * SUR LA LIGNE du bloc « Signature », avant même d'ouvrir le récapitulatif :
 * « c'est ce qui permet de repérer une mauvaise adresse d'un coup d'œil. »
 * L'information existait, mais uniquement dans `signature-envoi.ts`, derrière
 * deux fonctions privées — et un fichier `'use server'` ne peut exporter que
 * des server actions.
 *
 * DEUX OPTIONS, ET UNE SEULE TENABLE. Recopier la cascade dans `page.tsx`
 * aurait créé une DEUXIÈME règle « qui signe cette pièce » : exactement la
 * divergence que le lot C.2a a supprimée pour `representant.ts` (« le
 * signataire ne peut pas diverger du nom que le PDF imprime ») et que le lot
 * C.2b-1 a supprimée pour le régime. On EXTRAIT donc, à comportement constant :
 * le moteur appelle ce module, la page aussi, et les deux ne peuvent plus se
 * contredire.
 *
 * CE QUE CES TESTS GARDENT — les quatre chemins de la cascade, et surtout le
 * fait que le choix se lise sur la FORME du document (groupe / individuel) et
 * sur le RÔLE du régime, jamais sur le nombre d'inscrits couverts.
 */

import { describe, it, expect } from 'vitest';
import {
  formeDuDocument,
  resoudreSignataireClient,
  type ParticipantPourSignataire,
} from '../signataire-de-la-piece';
import type { EnvoiPlanifie } from '../plan-envoi';

const ORG = {
  id: 'org-1',
  legalName: 'AGENCE MARTIN',
  representative: 'Paul DURAND',
  contacts: [
    { firstName: 'Paul', lastName: 'DURAND', email: 'paul.durand@agence-martin.fr', isPrimary: true },
    { firstName: 'Sophie', lastName: 'BERNARD', email: 'sophie@agence-martin.fr', isPrimary: false },
  ],
};

function salarie(over: Partial<ParticipantPourSignataire> = {}): ParticipantPourSignataire {
  return {
    id: 'part-1',
    nom: 'Jean DUPONT',
    apprenant: { firstName: 'Jean', lastName: 'DUPONT', email: 'jean.dupont@exemple.fr' },
    org: ORG,
    estEiSelfChezSponsor: false,
    relevantDeLaConvention: true,
    ...over,
  };
}

function conventionDeGroupe(): EnvoiPlanifie {
  return {
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION',
    role: 'DIRIGEANT',
    cible: { kind: 'ORGANISATION', organizationId: 'org-1' },
    participantIds: ['part-1', 'part-2'],
    libelle: 'Convention — AGENCE MARTIN (2 participants)',
  };
}

function dossierAgefice(): EnvoiPlanifie {
  return {
    cle: 'AGEFICE:part-1',
    docType: 'AGEFICE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Dossier AGEFICE — Jean DUPONT',
  };
}

describe('formeDuDocument — la forme se LIT, elle ne se devine pas', () => {
  it('une cible PARTICIPANT est toujours individuelle', () => {
    const res = formeDuDocument(dossierAgefice(), [salarie()]);
    expect(res).toEqual({ ok: true, forme: { forme: 'INDIVIDUEL', participantId: 'part-1' } });
  });

  it('au moins un salarié relevant de la convention ⇒ forme GROUPE', () => {
    const res = formeDuDocument(conventionDeGroupe(), [
      salarie(),
      salarie({ id: 'part-2', relevantDeLaConvention: false }),
    ]);
    expect(res).toEqual({ ok: true, forme: { forme: 'GROUPE', organizationId: 'org-1' } });
  });

  it('aucun salarié, un seul inscrit ⇒ contrat individuel — le sien', () => {
    const res = formeDuDocument(conventionDeGroupe(), [salarie({ relevantDeLaConvention: false })]);
    expect(res).toEqual({ ok: true, forme: { forme: 'INDIVIDUEL', participantId: 'part-1' } });
  });

  it('aucun salarié, PLUSIEURS inscrits : refus nominatif, pas un envoi au hasard', () => {
    const res = formeDuDocument(conventionDeGroupe(), [
      salarie({ relevantDeLaConvention: false }),
      salarie({ id: 'part-2', nom: 'Marie LEROY', relevantDeLaConvention: false }),
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('Jean DUPONT, Marie LEROY');
      expect(res.error).toContain('Envoyez-les séparément.');
    }
  });
});

describe('resoudreSignataireClient — le couple nom + adresse, avec sa provenance', () => {
  it('convention de GROUPE : le représentant de l’entreprise, à l’adresse du contact qui porte son nom', () => {
    const res = resoudreSignataireClient({
      docType: 'CONVENTION',
      forme: { forme: 'GROUPE', organizationId: 'org-1' },
      envoi: conventionDeGroupe(),
      couverts: [salarie()],
    });
    expect(res).toEqual({
      ok: true,
      signataire: {
        nom: 'Paul DURAND',
        email: 'paul.durand@agence-martin.fr',
        sourceNom: 'ORG_REPRESENTATIVE',
        sourceEmail: 'CONTACT_NOMME',
      },
    });
  });

  it('dossier de financement : le STAGIAIRE lui-même, à l’adresse de sa fiche', () => {
    const res = resoudreSignataireClient({
      docType: 'AGEFICE',
      forme: { forme: 'INDIVIDUEL', participantId: 'part-1' },
      envoi: dossierAgefice(),
      couverts: [salarie()],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.signataire.nom).toBe('Jean DUPONT');
      expect(res.signataire.email).toBe('jean.dupont@exemple.fr');
      expect(res.signataire.sourceNom).toBe('APPRENANT_STAGIAIRE');
      expect(res.signataire.sourceEmail).toBe('PERSON');
    }
  });

  it('AUCUN REPLI sur un autre contact : sans adresse du représentant, c’est un refus nommé', () => {
    const res = resoudreSignataireClient({
      docType: 'CONVENTION',
      forme: { forme: 'GROUPE', organizationId: 'org-1' },
      envoi: conventionDeGroupe(),
      couverts: [
        salarie({
          org: {
            ...ORG,
            contacts: [
              // Sophie est joignable, et ce n'est PAS elle qui signe.
              { firstName: 'Sophie', lastName: 'BERNARD', email: 'sophie@a.fr', isPrimary: true },
            ],
          },
        }),
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('Paul DURAND');
      expect(res.error).toContain('certificat de signature');
    }
  });

  it('une adresse SAISIE par l’admin l’emporte, et le dit dans sa provenance', () => {
    const res = resoudreSignataireClient({
      docType: 'AGEFICE',
      forme: { forme: 'INDIVIDUEL', participantId: 'part-1' },
      envoi: dossierAgefice(),
      couverts: [salarie()],
      emailSaisi: 'autre.adresse@exemple.fr',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.signataire.email).toBe('autre.adresse@exemple.fr');
      expect(res.signataire.sourceEmail).toBe('SAISI_PAR_ADMIN');
    }
  });

  it('aucun inscrit couvert : un refus qui nomme la pièce, jamais une exception', () => {
    const res = resoudreSignataireClient({
      docType: 'CONVENTION',
      forme: { forme: 'GROUPE', organizationId: 'org-1' },
      envoi: conventionDeGroupe(),
      couverts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Convention — AGENCE MARTIN (2 participants)');
  });
});
