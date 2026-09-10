/**
 * Lot C.2b-2, tâche 2 — la VUE du bloc « Signature », testée sans écran.
 *
 * Ce que ces tests gardent, et pourquoi chacun compte :
 *
 *  - **Le bouton n'existe pas quand il n'y a rien à envoyer** (décision Laurent
 *    n°3). Ici c'est `boutonVisible === false` ; le composant en tire l'absence
 *    du DOM. Un bouton grisé laisse croire qu'il manque un réglage.
 *  - **Une pièce signée sort du jeu, quelle qu'en soit l'origine** (décision
 *    n°4) : scan manuel du lot A (`docStatus.MANUAL_OK`), `signedPdfUrl` posé
 *    par le webhook du lot C.3, ou `Document.status = 'signed'`. Les TROIS
 *    origines, parce que la décision dit « quelle qu'en soit l'origine » — n'en
 *    lire qu'une reproposerait l'envoi d'une pièce déjà signée à la main.
 *  - **Une pièce partie n'est pas renvoyable** : `sendForSignature` la refuse
 *    (`ENVOI_EN_COURS`, que `force` ne lève pas). Proposer l'envoi serait
 *    promettre un refus.
 *  - **`participantIdUnique` distingue le nominatif du collectif** : c'est lui
 *    qui porte la coexistence « Déposer le scan » / « Envoyer pour signature ».
 *    Il se lit sur la CIBLE du plan, pas sur le nombre d'inscrits couverts — une
 *    convention de groupe d'un seul salarié reste une convention d'organisation.
 */

import { describe, it, expect } from 'vitest';
import {
  construireVueSignature,
  etatDeLaPiece,
  type DocumentDeLaPiece,
} from '../bloc-signature-vue';
import { planifierEnvoi, type AnomalieEnvoi, type EnvoiPlanifie } from '@/lib/signature/plan-envoi';
import type { RegleSignatureFinanceur } from '@/lib/signature/regime';

const AGEFICE: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: 'STAGIAIRE',
  assiduiteSigner: 'STAGIAIRE',
};
const OPCO_EP: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: null,
  assiduiteSigner: null,
};

function doc(over: Partial<DocumentDeLaPiece> = {}): DocumentDeLaPiece {
  return {
    id: 'doc-1',
    status: 'generated',
    signedPdfUrl: null,
    signatureRequestId: null,
    ...over,
  };
}

function planVide(): { envois: EnvoiPlanifie[]; blocages: AnomalieEnvoi[]; avertissements: AnomalieEnvoi[] } {
  return { envois: [], blocages: [], avertissements: [] };
}

describe('etatDeLaPiece — les trois origines d’un « signé »', () => {
  it('ABSENT quand aucun document n’existe encore', () => {
    expect(etatDeLaPiece({ docStatusEtat: null, document: null })).toBe('ABSENT');
  });

  it('GENERE quand le document existe et n’est ni parti ni signé', () => {
    expect(etatDeLaPiece({ docStatusEtat: null, document: doc() })).toBe('GENERE');
  });

  it('ENVOYE quand `Document.status` vaut `sent_for_signature`', () => {
    expect(etatDeLaPiece({ document: doc({ status: 'sent_for_signature' }) })).toBe('ENVOYE');
  });

  it('SIGNE — origine 1 : le scan manuel du lot A (docStatus MANUAL_OK)', () => {
    expect(etatDeLaPiece({ docStatusEtat: 'MANUAL_OK', document: doc() })).toBe('SIGNE');
  });

  it('SIGNE — origine 2 : `signedPdfUrl` posé (webhook C.3, ou dépôt qui écrit le PDF)', () => {
    expect(etatDeLaPiece({ document: doc({ signedPdfUrl: 'docs/signe.pdf' }) })).toBe('SIGNE');
  });

  it('SIGNE — origine 3 : `Document.status` vaut `signed`', () => {
    expect(etatDeLaPiece({ document: doc({ status: 'signed' }) })).toBe('SIGNE');
  });

  it('PUISSANCE — un scan manuel prime sur un envoi en cours : la preuve existe déjà', () => {
    expect(
      etatDeLaPiece({ docStatusEtat: 'MANUAL_OK', document: doc({ status: 'sent_for_signature' }) }),
    ).toBe('SIGNE');
  });

  it('une chaîne `signedPdfUrl` VIDE ne vaut pas une signature', () => {
    expect(etatDeLaPiece({ document: doc({ signedPdfUrl: '' }) })).toBe('GENERE');
  });
});

describe('construireVueSignature — le bouton et les lignes', () => {
  const conventionDuGroupe: EnvoiPlanifie = {
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION',
    role: 'DIRIGEANT',
    cible: { kind: 'ORGANISATION', organizationId: 'org-1' },
    participantIds: ['part-1', 'part-2'],
    libelle: 'Convention — AGENCE MARTIN (2 participants)',
  };
  const dossierNominatif: EnvoiPlanifie = {
    cle: 'AGEFICE:part-1',
    docType: 'AGEFICE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Dossier AGEFICE — Jean DUPONT',
  };

  it('une ligne par envoi, dans l’ordre du plan, libellé du plan repris tel quel', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe, dossierNominatif], blocages: [], avertissements: [] },
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.lignes.map((l) => l.cle)).toEqual(['CONVENTION:org-1', 'AGEFICE:part-1']);
    expect(vue.lignes[0]!.libelle).toBe('Convention — AGENCE MARTIN (2 participants)');
  });

  it('`participantIdUnique` se lit sur la CIBLE : nominatif pour le dossier, null pour la convention', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe, dossierNominatif], blocages: [], avertissements: [] },
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.lignes[0]!.participantIdUnique).toBeNull();
    expect(vue.lignes[1]!.participantIdUnique).toBe('part-1');
  });

  it('PUISSANCE — une convention de groupe d’UN SEUL inscrit reste collective', () => {
    const vue = construireVueSignature({
      plan: {
        envois: [{ ...conventionDuGroupe, participantIds: ['part-1'] }],
        blocages: [],
        avertissements: [],
      },
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
    });
    // Le nombre d'inscrits ne dit rien du signataire : c'est le dirigeant de
    // l'organisation qui signe, pas le stagiaire. Déduire « nominatif » d'un
    // `participantIds.length === 1` proposerait un dépôt de scan par apprenant
    // sur une pièce qui n'en a pas.
    expect(vue.lignes[0]!.participantIdUnique).toBeNull();
  });

  it('une pièce GENERE ou ABSENT est envoyable — l’ouverture du récapitulatif génère l’absente', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe, dossierNominatif], blocages: [], avertissements: [] },
      documentParCle: new Map([['CONVENTION:org-1', doc()]]),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.lignes.map((l) => l.etat)).toEqual(['GENERE', 'ABSENT']);
    expect(vue.lignes.every((l) => l.envoyable)).toBe(true);
    expect(vue.nbEnvoyables).toBe(2);
    expect(vue.boutonVisible).toBe(true);
  });

  it('une pièce ENVOYE n’est pas envoyable — `sendForSignature` la refuserait', () => {
    const vue = construireVueSignature({
      plan: { envois: [dossierNominatif], blocages: [], avertissements: [] },
      documentParCle: new Map([
        ['AGEFICE:part-1', doc({ status: 'sent_for_signature', signatureRequestId: 'req-9' })],
      ]),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.lignes[0]!.etat).toBe('ENVOYE');
    expect(vue.lignes[0]!.envoyable).toBe(false);
    expect(vue.nbEnvoyables).toBe(0);
    expect(vue.boutonVisible).toBe(false);
  });

  it('une ligne ENVOYE porte l’identifiant de la demande — sans lui, l’annulation est inatteignable', () => {
    const vue = construireVueSignature({
      plan: { envois: [dossierNominatif], blocages: [], avertissements: [] },
      documentParCle: new Map([
        ['AGEFICE:part-1', doc({ status: 'sent_for_signature', signatureRequestId: 'req-9' })],
      ]),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.lignes[0]!.signatureRequestId).toBe('req-9');
  });

  it('une pièce SIGNE n’est pas envoyable, quelle que soit l’origine du signé', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe, dossierNominatif], blocages: [], avertissements: [] },
      documentParCle: new Map([['AGEFICE:part-1', doc({ signedPdfUrl: 'docs/x.pdf' })]]),
      docStatusParCle: new Map([['CONVENTION:org-1', 'MANUAL_OK']]),
      canSign: true,
    });
    expect(vue.lignes.map((l) => l.etat)).toEqual(['SIGNE', 'SIGNE']);
    expect(vue.lignes.some((l) => l.envoyable)).toBe(false);
    expect(vue.boutonVisible).toBe(false);
  });

  it('`canSign` faux ⇒ aucun bouton, même quand tout est envoyable', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe], blocages: [], avertissements: [] },
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: false,
    });
    expect(vue.nbEnvoyables).toBe(1);
    expect(vue.boutonVisible).toBe(false);
  });

  it('blocages et avertissements traversent la vue TELS QUELS — ils sont déjà nominatifs', () => {
    const avertissement: AnomalieEnvoi = {
      participantId: 'part-3',
      nomAffiche: 'Florent HAUSSWIRTH',
      docType: 'AGEFICE',
      message: 'Florent HAUSSWIRTH : … rien n’a été envoyé pour cette pièce.',
    };
    const vue = construireVueSignature({
      plan: { envois: [], blocages: [], avertissements: [avertissement] },
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.avertissements).toEqual([avertissement]);
    // Un avertissement ne planifie RIEN : il n'ajoute aucune ligne, donc aucun bouton.
    expect(vue.lignes).toHaveLength(0);
    expect(vue.boutonVisible).toBe(false);
  });
});

describe('PUISSANCE (a) — une session 100 % OPCO n’a rien à envoyer côté APRÈS', () => {
  it('scope AFTER, financeur sans `assiduiteSigner` : plan vide ⇒ bouton invisible', () => {
    const plan = planifierEnvoi({
      scope: 'AFTER',
      participants: [
        {
          participantId: 'part-1',
          nomAffiche: 'Jean DUPONT',
          sponsorOrgId: 'org-1',
          sponsorOrgLabel: 'AGENCE MARTIN',
          regle: OPCO_EP,
        },
      ],
    });
    expect(plan.envois).toHaveLength(0);

    const vue = construireVueSignature({
      plan,
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.lignes).toHaveLength(0);
    expect(vue.nbEnvoyables).toBe(0);
    expect(vue.boutonVisible).toBe(false);
  });

  it('le même participant en AGEFICE, lui, a bien son attestation à envoyer', () => {
    const plan = planifierEnvoi({
      scope: 'AFTER',
      participants: [
        {
          participantId: 'part-1',
          nomAffiche: 'Jean DUPONT',
          sponsorOrgId: 'org-1',
          sponsorOrgLabel: 'JEAN DUPONT EI',
          regle: AGEFICE,
        },
      ],
    });
    const vue = construireVueSignature({
      plan,
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.lignes.map((l) => l.cle)).toEqual(['ASSIDUITE:part-1']);
    expect(vue.boutonVisible).toBe(true);
  });

  it('un plan strictement vide reste une vue vide, sans bouton', () => {
    const vue = construireVueSignature({
      plan: planVide(),
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
    });
    expect(vue.boutonVisible).toBe(false);
    expect(vue.nbEnvoyables).toBe(0);
  });
});
