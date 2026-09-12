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
  certificatDeLaPiece,
  construireVueSignature,
  etatDeLaPiece,
  type DocumentDeLaPiece,
} from '../bloc-signature-vue';
import { planifierEnvoi, type AnomalieEnvoi, type EnvoiPlanifie } from '@/lib/signature/plan-envoi';
import type { RegleSignatureFinanceur } from '@/lib/signature/regime';
// L'ordre affiché est COMPOSÉ ailleurs — `ordre-signataires.ts`, le module du
// récapitulatif. La vue l'appelle, elle ne le réécrit pas : deux compositions
// pour la même phrase finiraient par diverger d'un écran à l'autre.
import { texteOrdreSignataires } from '../ordre-signataires';
import type { SignataireEnvoye, SignataireOfPrevu } from '@/lib/signature/envoi-contrats';

/**
 * « PAS D'ORGANISME RÉSOLU », écrit explicitement — demande n°2 de Laurent
 * (11/09/2026).
 *
 * `signataireOf` est devenu OBLIGATOIRE. `null` reste une valeur légitime — les
 * Paramètres organisme peuvent être incomplets, et la vue doit alors n'annoncer
 * que le client. C'est **l'absence** qui est devenue impossible : un futur
 * appelant ne peut plus l'oublier sans erreur `tsc`.
 *
 * Cette constante est là pour que la différence se LISE. Un `signataireOf: null`
 * nu dans quinze appels ressemble à du remplissage ; nommé, il dit que ce test
 * ne parle pas du signataire de l'organisme — et qu'il ne prétend rien en garder.
 */
const SANS_OF: SignataireOfPrevu | null = null;

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
    // Lot C.3 (D-C3-1) : les signataires RÉELS de la demande en cours. Vide par
    // défaut — un document qui n'est pas parti n'en a aucun.
    signataires: [],
    // Lot D (D-C3-5) : la clé du certificat de signature, portée par la DEMANDE.
    // Nulle par défaut — tant que rien n'est signé, aucun certificat n'existe.
    auditTrailUrl: null,
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
    concerne: 'AGENCE MARTIN',
    organisation: 'AGENCE MARTIN',
  };
  const dossierNominatif: EnvoiPlanifie = {
    cle: 'AGEFICE:part-1',
    docType: 'AGEFICE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Dossier AGEFICE — Jean DUPONT',
    concerne: 'Jean DUPONT',
    organisation: null,
  };

  it('une ligne par envoi, dans l’ordre du plan, libellé du plan repris tel quel', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe, dossierNominatif], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes.map((l) => l.cle)).toEqual(['CONVENTION:org-1', 'AGEFICE:part-1']);
    expect(vue.lignes[0]!.libelle).toBe('Convention — AGENCE MARTIN (2 participants)');
  });

  it('`participantIdUnique` se lit sur la CIBLE : nominatif pour le dossier, null pour la convention', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe, dossierNominatif], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
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
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
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
      participants: [],
      documentParCle: new Map([['CONVENTION:org-1', doc()]]),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes.map((l) => l.etat)).toEqual(['GENERE', 'ABSENT']);
    expect(vue.lignes.every((l) => l.envoyable)).toBe(true);
    expect(vue.nbEnvoyables).toBe(2);
    expect(vue.boutonVisible).toBe(true);
  });

  it('une pièce ENVOYE n’est pas envoyable — `sendForSignature` la refuserait', () => {
    const vue = construireVueSignature({
      plan: { envois: [dossierNominatif], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map([
        ['AGEFICE:part-1', doc({ status: 'sent_for_signature', signatureRequestId: 'req-9' })],
      ]),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes[0]!.etat).toBe('ENVOYE');
    expect(vue.lignes[0]!.envoyable).toBe(false);
    expect(vue.nbEnvoyables).toBe(0);
    expect(vue.boutonVisible).toBe(false);
  });

  it('une ligne ENVOYE porte l’identifiant de la demande — sans lui, l’annulation est inatteignable', () => {
    const vue = construireVueSignature({
      plan: { envois: [dossierNominatif], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map([
        ['AGEFICE:part-1', doc({ status: 'sent_for_signature', signatureRequestId: 'req-9' })],
      ]),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes[0]!.signatureRequestId).toBe('req-9');
  });

  it('une pièce SIGNE n’est pas envoyable, quelle que soit l’origine du signé', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe, dossierNominatif], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map([['AGEFICE:part-1', doc({ signedPdfUrl: 'docs/x.pdf' })]]),
      docStatusParCle: new Map([['CONVENTION:org-1', 'MANUAL_OK']]),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes.map((l) => l.etat)).toEqual(['SIGNE', 'SIGNE']);
    expect(vue.lignes.some((l) => l.envoyable)).toBe(false);
    expect(vue.boutonVisible).toBe(false);
  });

  it('`canSign` faux ⇒ aucun bouton, même quand tout est envoyable', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: false,
      signataireOf: SANS_OF,
    });
    expect(vue.nbEnvoyables).toBe(1);
    expect(vue.boutonVisible).toBe(false);
  });

  /**
   * ⚠ MIS À JOUR le 11/09/2026 (correction n°2). Les BLOCAGES traversent
   * toujours tels quels — ils nomment déjà la personne, la pièce et le geste.
   * Les AVERTISSEMENTS, eux, sont désormais REGROUPÉS par participant et
   * RÉÉCRITS : le moteur en rend un par pièce, et l'écran en affichait deux
   * pour une seule correction à faire.
   */
  it('les blocages traversent TELS QUELS, les avertissements sont regroupés', () => {
    const blocage: AnomalieEnvoi = {
      participantId: 'part-4',
      nomAffiche: 'Marie LEROY',
      docType: 'CONVENTION',
      message: 'Marie LEROY : aucune organisation bénéficiaire rattachée à cette inscription.',
    };
    const avertissement: AnomalieEnvoi = {
      participantId: 'part-3',
      nomAffiche: 'Florent HAUSSWIRTH',
      docType: 'AGEFICE',
      message: 'Florent HAUSSWIRTH : … rien n’a été envoyé pour cette pièce.',
    };
    const vue = construireVueSignature({
      plan: { envois: [], blocages: [blocage], avertissements: [avertissement] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.blocages).toEqual([blocage]);
    expect(vue.avertissements).toEqual([
      {
        participantId: 'part-3',
        nomAffiche: 'Florent HAUSSWIRTH',
        docTypes: ['AGEFICE'],
        message: composerAvertissementRegime({
          nomAffiche: 'Florent HAUSSWIRTH',
          docTypes: ['AGEFICE'],
        }),
        // Sans contexte, on ne devine pas : l'inscription, comme avant.
        correction: { cible: 'INSCRIPTION' },
      },
    ]);
    // Un avertissement ne planifie RIEN : il n'ajoute aucune ligne, donc aucun bouton.
    expect(vue.lignes).toHaveLength(0);
    expect(vue.boutonVisible).toBe(false);
  });
});

/**
 * `signataireOf` EST OBLIGATOIRE — demande n°2 de Laurent, 11/09/2026.
 *
 * CE QUE LE LOT C.2b-8 AVAIT SIGNALÉ, ET QUE CE BLOC FERME. La prop était
 * optionnelle. Un futur second appelant pouvait donc l'oublier **sans aucune
 * erreur `tsc`** : la vue se serait rabattue sur `a.signataireOf ?? null`, toutes
 * les lignes auraient perdu leur second rang (« 2. Laurent MARX (organisme de
 * formation), signe en dernier depuis le CRM »), et l'admin aurait cru chaque
 * pièce close au premier paraphe. Le seul garde-fou était un test de SOURCE
 * (`signataire-of.source.test.ts`) qui ne protège QUE l'appelant existant.
 *
 * ⚠ `null` RESTE LÉGITIME : Paramètres organisme incomplet, aucun OF résolu — la
 * vue n'annonce alors que le client, et le récapitulatif rend l'empêchement
 * `SIGNATAIRE_OF_INCOMPLET` nominatif. C'est **« absent »** qui est devenu
 * impossible, pas **« pas d'OF »**.
 *
 * ⚠ CE TEST NE ROUGIT PAS — IL NE COMPILE PLUS. Rendre la prop de nouveau
 * optionnelle ne fait pas échouer une assertion : cela rend la directive
 * `@ts-expect-error` inutile, et `tsc --noEmit` échoue sur
 * « Unused '@ts-expect-error' directive ». C'est la bonne mécanique : une
 * garantie de type se garde par le typeur, pas par un `expect`. La gate qui
 * l'attrape est `pnpm --filter @qualiof/web exec tsc --noEmit`, pas `pnpm test`.
 */
describe('construireVueSignature — la prop `signataireOf` ne peut plus être oubliée', () => {
  it('l’omettre est une erreur de TYPE (vérifié par `tsc`, pas par cette assertion)', () => {
    const appel = () =>
      construireVueSignature({
        plan: planVide(),
        participants: [],
        documentParCle: new Map(),
        docStatusParCle: new Map(),
        canSign: true,
        // @ts-expect-error — `signataireOf` est OBLIGATOIRE depuis le 11/09/2026.
        // Si cette ligne cesse d'être une erreur, `tsc` échoue sur une directive
        // inutilisée : c'est exactement le signal voulu.
        signataireOf: undefined,
      });
    // L'appel reste exécutable : on garde qu'aucune valeur manquante ne fait
    // lever la fonction — elle doit se dégrader, pas exploser.
    expect(appel().lignes).toEqual([]);
  });

  it('`null` reste accepté, et n’annonce que le client', () => {
    const vue = construireVueSignature({
      plan: { envois: [CONVENTION_POUR_TYPAGE], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireParCle: new Map([
        [CONVENTION_POUR_TYPAGE.cle, { nom: 'Paul DURAND', email: 'paul@agence.fr' }],
      ]),
      signataireOf: null,
    });
    // Valeur LITTÉRALE, jamais le retour du composeur de texte (règle n°2).
    expect(vue.lignes[0]!.ordre.map((s) => s.texte)).toEqual([
      '1. Paul DURAND — paul@agence.fr',
    ]);
  });
});

const CONVENTION_POUR_TYPAGE: EnvoiPlanifie = {
  cle: 'CONVENTION:org-typage',
  docType: 'CONVENTION',
  role: 'DIRIGEANT',
  cible: { kind: 'ORGANISATION', organizationId: 'org-typage' },
  participantIds: ['part-1'],
  libelle: 'Convention — ORG TYPAGE (1 participant)',
  concerne: 'ORG TYPAGE',
  organisation: 'ORG TYPAGE',
};

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
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
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
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes.map((l) => l.cle)).toEqual(['ASSIDUITE:part-1']);
    expect(vue.boutonVisible).toBe(true);
  });

  it('un plan strictement vide reste une vue vide, sans bouton', () => {
    const vue = construireVueSignature({
      plan: planVide(),
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.boutonVisible).toBe(false);
    expect(vue.nbEnvoyables).toBe(0);
  });
});

/**
 * Retour d'écran Laurent, 11/09/2026 — corrections n°2 et n°3.
 *
 * CE QUI CLOCHAIT À L'ÉCRAN. Camille ROUSSEL apparaissait DEUX FOIS dans le
 * bloc « Signature » : un encart pour la convention, un autre pour le dossier
 * AGEFICE. Deux encarts pour UNE anomalie — le financeur de son inscription —
 * et un texte de 45 mots (« n'ouvre pas la convention », « en porte les
 * signaux ») qui disait la mécanique du moteur au lieu de dire quoi corriger.
 *
 * LA FORME IMPOSÉE, et c'est elle que ces tests gardent : deux phrases — LE
 * PROBLÈME, puis L'ACTION — puis les pièces, puis la réassurance. Le nom de
 * l'organisation et le financeur rattaché viennent de la DONNÉE, jamais du code.
 *
 * ⚠ POURQUOI DANS LA VUE ET PAS DANS LE MOTEUR. `AnomalieEnvoi` est un contrat
 * de `plan-envoi.ts` (lot C.2a), et il porte UNE pièce : le regrouper par
 * participant y changerait le contrat que `preparerEnvoiSignature` rend aussi.
 * Le regroupement est une décision d'AFFICHAGE, elle vit donc ici — pure, et
 * testable sans écran.
 */

import {
  composerAvertissementRegime,
  correctionAvertissement,
  regrouperAvertissements,
  type ContexteAvertissement,
} from '../bloc-signature-vue';

/**
 * CAS A — le commanditaire est PLAUSIBLE, il lui manque son financeur.
 * Camille ROUSSEL, Marion MAINO en production.
 */
const CONTEXTE_ROUSSEL: ContexteAvertissement = {
  sponsorOrgId: 'org-roussel',
  sponsorOrgLabel: 'DEMO-SIG ROUSSEL Camille, EI',
  financeurSansRegime: true,
  financeursRattaches: ['AGEFICE'],
};

/**
 * CAS B — le commanditaire LUI-MÊME est incohérent avec les signaux.
 * Clothilde MANUEL en production : commanditaire Sigma / OPCO_EP, mais
 * l'apprenante est rattachée à une entreprise financée AGEFICE.
 */
const CONTEXTE_MANUEL: ContexteAvertissement = {
  sponsorOrgId: 'org-sigma',
  sponsorOrgLabel: 'Sigma',
  financeurSansRegime: false,
  financeursRattaches: ['AGEFICE'],
};

function avert(docType: 'CONVENTION' | 'AGEFICE' | 'ASSIDUITE'): AnomalieEnvoi {
  return {
    participantId: 'part-c',
    nomAffiche: 'Camille ROUSSEL',
    docType,
    message: 'message du moteur, une pièce à la fois',
  };
}

describe('composerAvertissementRegime — la forme imposée par Laurent', () => {
  it('CAS A — Camille ROUSSEL, au mot près : il manque un financeur à son commanditaire', () => {
    const message = composerAvertissementRegime({
      nomAffiche: 'Camille ROUSSEL',
      docTypes: ['CONVENTION', 'AGEFICE'],
      contexte: CONTEXTE_ROUSSEL,
    });
    expect(message).toBe(
      'Camille ROUSSEL — son organisation commanditaire (DEMO-SIG ROUSSEL Camille, EI) n’a ' +
        'aucun régime de financement, alors que son dossier est rattaché à une entreprise ' +
        'financée AGEFICE. Renseignez le financeur de cette organisation. Pièces concernées : ' +
        'convention, dossier AGEFICE. Rien n’a été envoyé.',
    );
  });

  it('CAS B — Clothilde MANUEL, au mot près : c’est le commanditaire lui-même qui cloche', () => {
    const message = composerAvertissementRegime({
      nomAffiche: 'Clothilde MANUEL',
      docTypes: ['AGEFICE'],
      contexte: CONTEXTE_MANUEL,
    });
    expect(message).toBe(
      'Clothilde MANUEL — le financeur de son organisation commanditaire (Sigma) n’ouvre pas ' +
        'ces pièces, alors que son dossier est rattaché à une entreprise financée AGEFICE. ' +
        'Corrigez l’organisation commanditaire de l’inscription. Pièce concernée : ' +
        'dossier AGEFICE. Rien n’a été envoyé.',
    );
  });

  it('PUISSANCE — les deux cas n’appellent PAS le même geste', () => {
    // C'est la moitié de la correction n°7 bis : jusqu'ici les deux disaient
    // « corrigez le financeur de l'inscription », donc l'un des deux mentait.
    const casA = composerAvertissementRegime({
      nomAffiche: 'Camille ROUSSEL',
      docTypes: ['AGEFICE'],
      contexte: CONTEXTE_ROUSSEL,
    });
    const casB = composerAvertissementRegime({
      nomAffiche: 'Clothilde MANUEL',
      docTypes: ['AGEFICE'],
      contexte: CONTEXTE_MANUEL,
    });
    expect(casA).toContain('Renseignez le financeur de cette organisation.');
    expect(casA).not.toContain('Corrigez l’organisation commanditaire');
    expect(casB).toContain('Corrigez l’organisation commanditaire de l’inscription.');
    expect(casB).not.toContain('Renseignez le financeur');
  });

  it('PUISSANCE — plus aucun texte ne dit « financeur de l’inscription » (libellé trompeur)', () => {
    for (const contexte of [CONTEXTE_ROUSSEL, CONTEXTE_MANUEL, undefined]) {
      const message = composerAvertissementRegime({
        nomAffiche: 'Camille ROUSSEL',
        docTypes: ['CONVENTION'],
        contexte,
      });
      expect(message).not.toContain('financeur de l’inscription');
      expect(message).not.toContain('financeur d’inscription');
    }
  });

  it('le nom de l’organisation vient de la DONNÉE — il n’est jamais codé en dur', () => {
    const message = composerAvertissementRegime({
      nomAffiche: 'Florent HAUSSWIRTH',
      docTypes: ['AGEFICE'],
      contexte: {
        sponsorOrgId: 'org-imagimmo',
        sponsorOrgLabel: 'IMAGIMMO',
        financeurSansRegime: false,
        financeursRattaches: ['AGEFICE'],
      },
    });
    expect(message).toContain('(IMAGIMMO)');
    expect(message).not.toContain('DEMO-SIG');
    // Financeur RENSEIGNÉ mais qui n'ouvre pas la pièce : l'autre formulation.
    expect(message).toContain('n’ouvre pas ces pièces');
  });

  it('une seule pièce se dit au singulier — « Pièce concernée »', () => {
    const message = composerAvertissementRegime({
      nomAffiche: 'Florent HAUSSWIRTH',
      docTypes: ['AGEFICE'],
      contexte: CONTEXTE_ROUSSEL,
    });
    expect(message).toContain('Pièce concernée : dossier AGEFICE.');
    expect(message).not.toContain('Pièces concernées');
  });

  it('aucun financeur rattaché connu : l’entreprise individuelle, pas un code inventé', () => {
    const message = composerAvertissementRegime({
      nomAffiche: 'Camille ROUSSEL',
      docTypes: ['AGEFICE'],
      contexte: { ...CONTEXTE_ROUSSEL, financeursRattaches: [] },
    });
    expect(message).toContain('rattaché à une entreprise individuelle');
  });

  it('le texte reste COURT et sans jargon : ni « en porte les signaux », ni « n’ouvre pas la convention »', () => {
    const message = composerAvertissementRegime({
      nomAffiche: 'Camille ROUSSEL',
      docTypes: ['CONVENTION', 'AGEFICE'],
      contexte: CONTEXTE_ROUSSEL,
    });
    expect(message).not.toContain('en porte les signaux');
    expect(message).not.toContain('n’ouvre pas la convention');
    // La réassurance est la DERNIÈRE chose lue, et elle est brève.
    expect(message.endsWith('Rien n’a été envoyé.')).toBe(true);
  });
});

describe('regrouperAvertissements — UN encart par participant, jamais un par pièce', () => {
  it('deux pièces d’un même apprenant ⇒ UNE entrée qui les liste toutes les deux', () => {
    const groupes = regrouperAvertissements(
      [avert('CONVENTION'), avert('AGEFICE')],
      new Map([['part-c', CONTEXTE_ROUSSEL]]),
    );
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.docTypes).toEqual(['CONVENTION', 'AGEFICE']);
    expect(groupes[0]!.message).toContain('convention, dossier AGEFICE');
  });

  it('deux apprenants restent DEUX encarts — on ne fusionne que ce qui est à la même personne', () => {
    const groupes = regrouperAvertissements(
      [
        avert('CONVENTION'),
        { ...avert('AGEFICE'), participantId: 'part-f', nomAffiche: 'Florent HAUSSWIRTH' },
      ],
      new Map(),
    );
    expect(groupes.map((g) => g.participantId)).toEqual(['part-c', 'part-f']);
  });

  it('l’ordre des pièces est celui du référentiel, pas celui d’arrivée', () => {
    const groupes = regrouperAvertissements(
      [avert('AGEFICE'), avert('CONVENTION')],
      new Map([['part-c', CONTEXTE_ROUSSEL]]),
    );
    expect(groupes[0]!.docTypes).toEqual(['CONVENTION', 'AGEFICE']);
  });

  it('une même pièce signalée deux fois ne se compte qu’une : pas de doublon dans la liste', () => {
    const groupes = regrouperAvertissements([avert('AGEFICE'), avert('AGEFICE')], new Map());
    expect(groupes[0]!.docTypes).toEqual(['AGEFICE']);
  });

  it('sans contexte pour ce participant, le message reste lisible — il ne s’effondre pas', () => {
    const groupes = regrouperAvertissements([avert('CONVENTION')], new Map());
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.message).toContain('Camille ROUSSEL');
    expect(groupes[0]!.message).toContain('Corrigez l’organisation commanditaire de l’inscription.');
    expect(groupes[0]!.message).toContain('Rien n’a été envoyé.');
  });

  it('chaque groupe porte SA correction — celle du cas A vise la fiche organisation', () => {
    const groupes = regrouperAvertissements(
      [avert('CONVENTION'), avert('AGEFICE')],
      new Map([['part-c', CONTEXTE_ROUSSEL]]),
    );
    expect(groupes[0]!.correction).toEqual({
      cible: 'ORGANISATION',
      organizationId: 'org-roussel',
      libelleOrganisation: 'DEMO-SIG ROUSSEL Camille, EI',
    });
  });
});

/**
 * DEUX CAS, DEUX DESTINATIONS — correction n°7 bis (Laurent, 11/09/2026).
 *
 * L'avertissement envoyait TOUJOURS vers le formulaire d'inscription. C'est
 * faux dans la moitié des cas : quand le commanditaire est le bon et qu'il lui
 * manque simplement son code financeur (Camille ROUSSEL, Marion MAINO), il n'y
 * a RIEN à corriger sur l'inscription.
 *
 * ⚠ LA DISTINCTION N'EST PAS INVENTÉE ICI. `financeurSansRegime` existe depuis
 * la correction n°3 et sépare déjà « n'a aucun régime de financement » de
 * « n'ouvre pas ces pièces ». Une seconde règle pour la même question serait
 * exactement ce que le lot C.2b-1 vient de supprimer.
 */
describe('correctionAvertissement — où mène le lien, et pourquoi', () => {
  it('CAS A — financeur absent : on va RENSEIGNER la fiche organisation', () => {
    expect(correctionAvertissement(CONTEXTE_ROUSSEL)).toEqual({
      cible: 'ORGANISATION',
      organizationId: 'org-roussel',
      libelleOrganisation: 'DEMO-SIG ROUSSEL Camille, EI',
    });
  });

  it('CAS B — financeur présent mais incohérent : on va CORRIGER l’inscription', () => {
    expect(correctionAvertissement(CONTEXTE_MANUEL)).toEqual({ cible: 'INSCRIPTION' });
  });

  it('PUISSANCE — `financeurSansRegime` est le SEUL discriminant', () => {
    // Deux contextes identiques au booléen près : ils doivent diverger.
    const a = correctionAvertissement({ ...CONTEXTE_ROUSSEL, financeurSansRegime: true });
    const b = correctionAvertissement({ ...CONTEXTE_ROUSSEL, financeurSansRegime: false });
    expect(a.cible).toBe('ORGANISATION');
    expect(b.cible).toBe('INSCRIPTION');
  });

  it('sans contexte, on ne devine pas : l’inscription, comme avant', () => {
    expect(correctionAvertissement(undefined)).toEqual({ cible: 'INSCRIPTION' });
  });

  it('PUISSANCE — sans id d’organisation, on ne fabrique pas un lien vers une fiche inconnue', () => {
    expect(correctionAvertissement({ ...CONTEXTE_ROUSSEL, sponsorOrgId: null })).toEqual({
      cible: 'INSCRIPTION',
    });
    expect(correctionAvertissement({ ...CONTEXTE_ROUSSEL, sponsorOrgId: '  ' })).toEqual({
      cible: 'INSCRIPTION',
    });
  });

  it('le libellé de l’organisation est transporté tel quel, vide compris', () => {
    expect(
      correctionAvertissement({ ...CONTEXTE_ROUSSEL, sponsorOrgLabel: null }),
    ).toEqual({ cible: 'ORGANISATION', organizationId: 'org-roussel', libelleOrganisation: '' });
  });
});

describe('construireVueSignature — les avertissements ressortent REGROUPÉS', () => {
  it('la vue ne rend plus une entrée par pièce, mais une par participant', () => {
    const vue = construireVueSignature({
      plan: { ...planVide(), avertissements: [avert('CONVENTION'), avert('AGEFICE')] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      contexteAvertissementParParticipant: new Map([['part-c', CONTEXTE_ROUSSEL]]),
      signataireOf: SANS_OF,
    });
    expect(vue.avertissements).toHaveLength(1);
    expect(vue.avertissements[0]!.docTypes).toEqual(['CONVENTION', 'AGEFICE']);
  });
});

/**
 * Retour d'écran Laurent, 11/09/2026 — correction n°4.
 *
 * « Convention — Provence Immobilier (2 participants) · signataire : Paul
 * DURAND · paul.durand@… », AVANT même de cliquer. Motif de Laurent : « c'est
 * ce qui permet de repérer une mauvaise adresse d'un coup d'œil. »
 *
 * ⚠ LA VUE NE RÉSOUT RIEN. Elle reçoit le couple déjà résolu — par
 * `signataire-de-la-piece.ts`, le module que le MOTEUR appelle aussi. Le
 * résoudre ici en ferait une seconde règle, et l'écran finirait par annoncer un
 * signataire différent de celui qui reçoit le lien.
 */
describe('LigneSignature.signataire — le couple qui se lit sur la ligne', () => {
  const SIGNATAIRE = { nom: 'Paul DURAND', email: 'paul.durand@agence-martin.fr' };
  const conventionDuGroupe: EnvoiPlanifie = {
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION',
    role: 'DIRIGEANT',
    cible: { kind: 'ORGANISATION', organizationId: 'org-1' },
    participantIds: ['part-1', 'part-2'],
    libelle: 'Convention — Provence Immobilier (2 participants)',
    concerne: 'Provence Immobilier',
    organisation: 'Provence Immobilier',
  };

  it('le couple traverse la vue jusqu’à la ligne, tel qu’il a été résolu', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireParCle: new Map([[conventionDuGroupe.cle, SIGNATAIRE]]),
      signataireOf: SANS_OF,
    });
    expect(vue.lignes[0]!.signataire).toEqual(SIGNATAIRE);
  });

  it('une pièce dont le signataire n’a PAS pu être résolu porte `null` — jamais un nom inventé', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireParCle: new Map(),
      signataireOf: SANS_OF,
    });
    expect(vue.lignes[0]!.signataire).toBeNull();
  });
});

/**
 * Demande de Laurent du 11/09/2026, après relecture d'écran — L'ORDRE COMPLET
 * SUR CHAQUE LIGNE DU BLOC.
 *
 * POURQUOI ICI, ET PAS SEULEMENT AU RÉCAPITULATIF. Le lot C.2b-7 a livré
 * « 1. client · 2. OF » au récapitulatif et à l'écran résultat — deux écrans
 * qu'on atteint APRÈS avoir décidé d'envoyer. Le bloc, lui, est celui qu'on
 * regarde AVANT de cliquer, et il n'annonçait que le signataire client : un
 * admin y lisait « signataire : Paul DURAND » et pouvait croire la pièce close
 * au premier paraphe.
 *
 * ⚠ LA VUE NE DÉCIDE TOUJOURS PAS QUI SIGNE. Elle appelle
 * `ordreSignatairesPrevu`, qui interroge `ofSigneLaPiece(docType)` —
 * c'est-à-dire `ANCRES_PAR_PIECE`, lecture des gabarits. Aucune seconde table,
 * aucun `if (docType === 'AGEFICE')` : la pièce qui ne porte pas d'ancre OF
 * n'annonce pas un second signataire qui ne viendrait jamais.
 *
 * ⚠ VALEURS LITTÉRALES, jamais le retour de la fonction testée. Une assertion
 * qui comparerait le texte au résultat d'un constructeur de texte collapserait
 * avec lui — les deux côtés bougeraient ensemble et la mutation resterait
 * verte. C'est le défaut trouvé sur `lienRenseignerFinanceur` au lot C.2b-6.
 */
describe('LigneSignature.ordre — « 1. client · 2. OF » sur la ligne du bloc', () => {
  const CLIENT = { nom: 'Paul DURAND', email: 'paul.durand@provence-immo.fr' };
  const STAGIAIRE = { nom: 'Jean DUPONT', email: 'jean@dupont.fr' };
  const OF: SignataireOfPrevu = {
    nom: 'Laurent MARX',
    email: 'laurent@start-academy.fr',
    ordre: 'AFTER',
  };

  const convention: EnvoiPlanifie = {
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION',
    role: 'DIRIGEANT',
    cible: { kind: 'ORGANISATION', organizationId: 'org-1' },
    participantIds: ['part-1', 'part-2'],
    libelle: 'Convention — AGENCE MARTIN (2 participants)',
    concerne: 'AGENCE MARTIN',
    organisation: 'AGENCE MARTIN',
  };
  const assiduite: EnvoiPlanifie = {
    cle: 'ASSIDUITE:part-1',
    docType: 'ASSIDUITE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Attestation d’assiduité — Jean DUPONT',
    concerne: 'Jean DUPONT',
    organisation: null,
  };
  const agefice: EnvoiPlanifie = {
    cle: 'AGEFICE:part-1',
    docType: 'AGEFICE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Dossier AGEFICE — Jean DUPONT',
    concerne: 'Jean DUPONT',
    organisation: null,
  };

  function vuePour(
    envois: EnvoiPlanifie[],
    a: { of?: SignataireOfPrevu | null; client?: { nom: string; email: string } | null } = {},
  ) {
    const client = a.client === undefined ? CLIENT : a.client;
    return construireVueSignature({
      plan: { envois, blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireParCle:
        client === null ? new Map() : new Map(envois.map((e) => [e.cle, client] as const)),
      signataireOf: a.of === undefined ? OF : a.of,
    });
  }

  it('la convention porte DEUX rangs, dans la forme dictée — au mot près', () => {
    const vue = vuePour([convention]);
    const ordre = vue.lignes[0]!.ordre;

    expect(ordre).toHaveLength(2);
    expect(ordre[0]!.texte).toBe('1. Paul DURAND — paul.durand@provence-immo.fr');
    expect(ordre[1]!.texte).toBe(
      '2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM',
    );
    expect(ordre[0]!.partie).toBe('CLIENT');
    expect(ordre[1]!.partie).toBe('OF');
  });

  it('l’attestation d’assiduité aussi — c’est la pièce que le lot B vient de brancher', () => {
    const ordre = vuePour([assiduite], { client: STAGIAIRE }).lignes[0]!.ordre;
    expect(ordre).toHaveLength(2);
    expect(ordre[0]!.texte).toBe('1. Jean DUPONT — jean@dupont.fr');
    expect(ordre[1]!.texte).toBe(
      '2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM',
    );
  });

  it('le dossier AGEFICE n’en porte QU’UN — son exemplaire a déjà la signature de l’OF', () => {
    const ordre = vuePour([agefice], { client: STAGIAIRE }).lignes[0]!.ordre;
    // ⚠ `toHaveLength` asserté SÉPARÉMENT du contenu : « exactement un » est la
    // promesse, pas un effet de bord d'un `toEqual` sur un tableau.
    expect(ordre).toHaveLength(1);
    expect(ordre.map((s) => s.partie)).toEqual(['CLIENT']);
    expect(ordre[0]!.texte).toBe('1. Jean DUPONT — jean@dupont.fr');
  });

  it('PUISSANCE — `BEFORE` inverse RÉELLEMENT les rangs de la ligne', () => {
    const ordre = vuePour([convention], { of: { ...OF, ordre: 'BEFORE' } }).lignes[0]!.ordre;
    expect(ordre[0]!.texte).toBe(
      '1. Laurent MARX (organisme de formation), signe en premier depuis le CRM',
    );
    expect(ordre[1]!.texte).toBe('2. Paul DURAND — paul.durand@provence-immo.fr');
  });

  it('signataire OF non résolu : la ligne garde le client seul, elle n’invente pas d’organisme', () => {
    const ordre = vuePour([convention], { of: null }).lignes[0]!.ordre;
    expect(ordre).toHaveLength(1);
    expect(ordre[0]!.partie).toBe('CLIENT');
  });

  it('signataire client non résolu : AUCUN rang — un « 1. » donné à l’OF mentirait', () => {
    const ligne = vuePour([convention], { client: null }).lignes[0]!;
    expect(ligne.ordre).toEqual([]);
    expect(ligne.signataire).toBeNull();
  });

  it('la ligne s’écrit EXACTEMENT comme au récapitulatif — séparateur compris', () => {
    const ordre = vuePour([convention]).lignes[0]!.ordre;
    expect(texteOrdreSignataires(ordre)).toBe(
      '1. Paul DURAND — paul.durand@provence-immo.fr · ' +
        '2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM',
    );
  });
});

/* ── D-C3-1 — une pièce PARTIE dit où elle en est, signataire par signataire ─ */

/**
 * LE DÉFAUT QUE CES TESTS FERMENT (recette C.3 du 11/09/2026, étape 6).
 *
 * Après la signature du client, la ligne restait « En attente de signature »,
 * sans « Paul DURAND a signé le … », **sans le lien « Signer maintenant » de
 * l'organisme**, et avec une phrase périmée annonçant l'envoi des emails « au
 * lot C.2c ». Les briques existaient (`ordreSignatairesEnvoyes`,
 * `mentionAttenteOf`) — elles ne servaient qu'au récapitulatif, c'est-à-dire à
 * l'écran qu'on ne revoit jamais. Ce qui manquait n'était pas un calcul : c'est
 * que `SignatureRequest.signers` ne remontait pas jusqu'ici.
 *
 * ⚠ `signataires` est OBLIGATOIRE sur `DocumentDeLaPiece`, pour la raison
 * mesurée au lot C.2b-8 sur `signataireOf` : une prop optionnelle se perd en
 * silence, et l'écran repart exactement comme avant sans qu'un test ne bouge.
 */
describe('LigneSignature.ordre — une pièce PARTIE lit les signataires RÉELS', () => {
  const conventionPartie: EnvoiPlanifie = {
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION',
    role: 'DIRIGEANT',
    cible: { kind: 'ORGANISATION', organizationId: 'org-1' },
    participantIds: ['part-1'],
    libelle: 'Convention — Provence Immobilier (2 participants)',
    concerne: 'Provence Immobilier',
    organisation: 'Provence Immobilier',
  };
  const PREVU = { nom: 'Paul DURAND', email: 'paul.durand@provence-immo.fr' };
  const OF: SignataireOfPrevu = {
    nom: 'Laurent MARX',
    email: 'laurent@start-academy.fr',
    ordre: 'AFTER',
  };
  const CLIENT_SIGNE: SignataireEnvoye = {
    partie: 'CLIENT',
    role: 'Client',
    nom: 'Paul DURAND',
    email: 'paul.durand@provence-immo.fr',
    signUrl: 'https://docuseal.eu/s/client',
    signedAt: '2026-09-11T16:01:00.000Z',
  };
  const OF_EN_ATTENTE: SignataireEnvoye = {
    partie: 'OF',
    role: 'Organisme de formation',
    nom: 'Laurent MARX',
    email: 'laurent@start-academy.fr',
    signUrl: 'https://docuseal.eu/s/of',
    signedAt: null,
  };

  function vuePartie(signataires: SignataireEnvoye[]) {
    return construireVueSignature({
      plan: { envois: [conventionPartie], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map([
        [
          'CONVENTION:org-1',
          doc({ status: 'sent_for_signature', signatureRequestId: 'req-9', signataires }),
        ],
      ]),
      docStatusParCle: new Map(),
      canSign: true,
      signataireParCle: new Map([['CONVENTION:org-1', PREVU]]),
      signataireOf: OF,
    });
  }

  it('le client a signé : son rang porte la DATE, et l’organisme porte son lien', () => {
    const ligne = vuePartie([CLIENT_SIGNE, OF_EN_ATTENTE]).lignes[0]!;
    expect(ligne.etat).toBe('ENVOYE');
    expect(ligne.ordre).toHaveLength(2);

    expect(ligne.ordre[0]!.aSigne).toBe(true);
    expect(ligne.ordre[0]!.signedAt).toBe('2026-09-11T16:01:00.000Z');

    // ⚠ LA PROMESSE DE D-C3-1 : le lien « Signer maintenant » de l'organisme.
    // Sans lui, l'admin dont le client vient de signer n'a AUCUN moyen, depuis
    // QualiOF, de signer à son tour — il doit retrouver son email.
    expect(ligne.ordre[1]!.signerMaintenant).toBe(true);
    expect(ligne.ordre[1]!.signUrl).toBe('https://docuseal.eu/s/of');

    // ⚠ LA PHRASE CHANGE DE MAIN, et c'est la seconde façon de voir la même
    // mutation : sur l'ordre PRÉVU, personne n'a jamais signé, donc l'écran
    // continuerait d'attendre le CLIENT alors que c'est à l'organisme de jouer.
    expect(ligne.attente).toBe(
      'Il ne manque plus que la signature de Laurent MARX pour l’organisme de formation. ' +
        'Dès qu’elle sera faite, le PDF signé et son certificat de signature reviendront ici ' +
        'automatiquement.',
    );
  });

  it('PUISSANCE — sans signataires réels, la ligne retomberait sur l’ordre PRÉVU, qui ne signe jamais', () => {
    // C'est exactement l'état d'avant la correction : `ordreSignatairesPrevu`
    // rend `aSigne: false` et `signUrl: null` pour tout le monde, quoi qu'il se
    // soit passé chez le prestataire. La mutation qui rebranche l'ordre prévu
    // sur une pièce PARTIE doit faire rougir ce test.
    const ligne = vuePartie([]).lignes[0]!;
    expect(ligne.ordre.every((s) => s.aSigne === false)).toBe(true);
    expect(ligne.ordre.every((s) => s.signUrl === null)).toBe(true);
  });

  it('une pièce PRÊTE À PARTIR garde l’ordre prévu — rien n’a encore été envoyé', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionPartie], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map([['CONVENTION:org-1', doc()]]),
      docStatusParCle: new Map(),
      canSign: true,
      signataireParCle: new Map([['CONVENTION:org-1', PREVU]]),
      signataireOf: OF,
    });
    const ligne = vue.lignes[0]!;
    expect(ligne.etat).toBe('GENERE');
    expect(ligne.ordre).toHaveLength(2);
    expect(ligne.ordre.every((s) => s.signedAt === null)).toBe(true);
  });
});

describe('LigneSignature.attente — la phrase de la ligne, qui remplace la périmée', () => {
  const assiduitePartie: EnvoiPlanifie = {
    cle: 'ASSIDUITE:part-1',
    docType: 'ASSIDUITE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Attestation d’assiduité — Jean DUPONT',
    concerne: 'Jean DUPONT',
    organisation: null,
  };
  const OF: SignataireOfPrevu = {
    nom: 'Laurent MARX',
    email: 'laurent@start-academy.fr',
    ordre: 'AFTER',
  };
  const STAGIAIRE: SignataireEnvoye = {
    partie: 'CLIENT',
    role: 'Stagiaire',
    nom: 'Jean DUPONT',
    email: 'jean@dupont.fr',
    signUrl: 'https://docuseal.eu/s/stagiaire',
    signedAt: null,
  };

  function ligneAvec(a: {
    status?: string;
    signataires?: SignataireEnvoye[];
    requestId?: string | null;
  }) {
    return construireVueSignature({
      plan: { envois: [assiduitePartie], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map([
        [
          'ASSIDUITE:part-1',
          doc({
            status: a.status ?? 'sent_for_signature',
            signatureRequestId: a.requestId === undefined ? 'req-9' : a.requestId,
            signataires: a.signataires ?? [STAGIAIRE],
          }),
        ],
      ]),
      docStatusParCle: new Map(),
      canSign: true,
      signataireParCle: new Map([['ASSIDUITE:part-1', { nom: 'Jean DUPONT', email: 'jean@dupont.fr' }]]),
      signataireOf: OF,
    }).lignes[0]!;
  }

  it('elle NOMME qui est attendu et promet le retour — au caractère près', () => {
    expect(ligneAvec({}).attente).toBe(
      'En attente de la signature de Jean DUPONT. Dès que tous les signataires auront ' +
        'signé, le PDF signé et son certificat de signature reviendront ici automatiquement.',
    );
  });

  it('aucun signataire lisible sur la demande : on le DIT, on n’invente pas un nom', () => {
    // `parseSignatureSigners` écarte SANS BRUIT ce qui ne parse pas (règle du
    // lot C.3). Une ligne partie sans signataire lisible doit donc rester
    // explicable : sinon l'écran affiche une pièce « en attente » de personne.
    expect(ligneAvec({ signataires: [] }).attente).toBe(
      'Cette pièce est partie en signature, mais la demande enregistrée ne porte aucun ' +
        'signataire lisible : suivez-la chez le prestataire, ou annulez l’envoi pour la ' +
        'renvoyer.',
    );
  });

  it('une pièce qui n’est PAS partie n’a aucune attente à afficher', () => {
    expect(ligneAvec({ status: 'generated', requestId: null }).attente).toBeNull();
  });

  it('la phrase ne parle plus d’un lot à venir — ni C.2c, ni C.3', () => {
    const attente = ligneAvec({}).attente ?? '';
    expect(attente).not.toContain('C.2c');
    expect(attente).not.toContain('C.3');
  });
});

/* ── D-C3-5 — le certificat de signature, offert QUAND il existe ──────────── */

/**
 * CE QUE LA RECETTE A TROUVÉ (mise en prod du 12/09/2026). `auditTrailUrl` est
 * renseigné depuis le lot C.3 — `signature-retour.ts` télécharge le certificat,
 * l'écrit en bucket et le joint à l'email « Votre exemplaire signé ». Mais
 * aucune ligne SIGNÉ ne l'offrait à l'écran, alors que c'est la pièce que les
 * AGEFICE réclament (règle métier n°3 de la spec).
 *
 * DEUX SIGNÉS QUI NE SE RESSEMBLENT PAS, et c'est tout l'objet de ces tests :
 * un scan déposé à la main (lot A) est signé sans qu'aucun certificat existe.
 * Offrir le lien sur toutes les lignes vertes mènerait donc à un 404 sur la
 * moitié d'entre elles — et un admin qui clique sur « Certificat » et tombe sur
 * une erreur cesse de croire l'écran.
 */
describe('certificatDeLaPiece — un lien qui n’existe que s’il mène quelque part', () => {
  it('une pièce signée par voie électronique offre son certificat', () => {
    expect(
      certificatDeLaPiece({
        etat: 'SIGNE',
        signatureRequestId: 'req-9',
        auditTrailUrl: 'sessions/t1/SES-0112/signed/convention.audit-trail.pdf',
      }),
    ).toEqual({ signatureRequestId: 'req-9' });
  });

  it('un SCAN déposé à la main n’en a aucun — le lien ne doit pas exister', () => {
    expect(
      certificatDeLaPiece({ etat: 'SIGNE', signatureRequestId: null, auditTrailUrl: null }),
    ).toBeNull();
  });

  it('une demande partie mais pas encore close n’en a pas non plus', () => {
    // Le certificat n'est produit qu'à `submission.completed` : entre les deux
    // signatures, la colonne est vide et l'offrir promettrait un fichier qui
    // n'existe pas encore.
    expect(
      certificatDeLaPiece({ etat: 'ENVOYE', signatureRequestId: 'req-9', auditTrailUrl: null }),
    ).toBeNull();
  });

  it('une demande dont le certificat est arrivé AVANT que la pièce soit signée n’offre rien', () => {
    // Garde-fou d'ordre de lecture : c'est l'ÉTAT de la pièce qui commande, pas
    // la seule présence de la colonne.
    expect(
      certificatDeLaPiece({
        etat: 'ENVOYE',
        signatureRequestId: 'req-9',
        auditTrailUrl: 'sessions/t1/x.audit-trail.pdf',
      }),
    ).toBeNull();
  });

  it('une clé BLANCHE ne vaut pas une preuve', () => {
    expect(
      certificatDeLaPiece({ etat: 'SIGNE', signatureRequestId: 'req-9', auditTrailUrl: '   ' }),
    ).toBeNull();
  });

  it('sans identifiant de demande, il n’y a rien à servir', () => {
    // La route s'adresse à la DEMANDE : `/api/signature-requests/{id}/audit-trail`.
    expect(
      certificatDeLaPiece({
        etat: 'SIGNE',
        signatureRequestId: null,
        auditTrailUrl: 'sessions/t1/x.audit-trail.pdf',
      }),
    ).toBeNull();
  });
});

describe('construireVueSignature — le certificat remonte jusqu’à la ligne', () => {
  const conventionDuGroupe: EnvoiPlanifie = {
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION',
    role: 'DIRIGEANT',
    cible: { kind: 'ORGANISATION', organizationId: 'org-1' },
    participantIds: ['part-1', 'part-2'],
    libelle: 'Convention — AGENCE MARTIN (2 participants)',
    concerne: 'AGENCE MARTIN',
    organisation: 'AGENCE MARTIN',
  };
  const dossierNominatif: EnvoiPlanifie = {
    cle: 'AGEFICE:part-1',
    docType: 'AGEFICE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Dossier AGEFICE — Jean DUPONT',
    concerne: 'Jean DUPONT',
    organisation: null,
  };

  it('la ligne signée électroniquement porte son certificat', () => {
    const vue = construireVueSignature({
      plan: { envois: [dossierNominatif], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map([
        [
          'AGEFICE:part-1',
          doc({
            status: 'signed',
            signedPdfUrl: 'docs/signe.pdf',
            signatureRequestId: 'req-9',
            auditTrailUrl: 'sessions/t1/SES-0112/signed/agefice.audit-trail.pdf',
          }),
        ],
      ]),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes[0]!.etat).toBe('SIGNE');
    expect(vue.lignes[0]!.certificat).toEqual({ signatureRequestId: 'req-9' });
  });

  it('la ligne signée par un SCAN n’en porte aucun', () => {
    const vue = construireVueSignature({
      plan: { envois: [conventionDuGroupe], blocages: [], avertissements: [] },
      participants: [],
      documentParCle: new Map(),
      docStatusParCle: new Map([['CONVENTION:org-1', 'MANUAL_OK']]),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.lignes[0]!.etat).toBe('SIGNE');
    expect(vue.lignes[0]!.certificat).toBeNull();
  });
});

/* ── D-C3-4 — le bloc MUET doit dire pourquoi ────────────────────────────── */

/**
 * CE QUE LA PRODUCTION A MONTRÉ (SES-0112, 12/09/2026). Cinq apprenants
 * « Agence », conventions individuelles : le bloc « Signature » se réduisait à
 * la zone de dépôt. `regle === null` pour tous — financeur absent sur le
 * commanditaire — donc AUCUNE pièce ; et aucun avertissement non plus, faute de
 * signal : pas de lien `EI_SELF`, pas d'autre organisation ouvrant la pièce.
 *
 * Le moteur a raison de se taire : il ne sait rien d'incohérent à signaler.
 * C'est la VUE qui doit parler, parce qu'elle seule voit la différence entre
 * « il n'y a rien à signer » et « on ne sait pas quoi signer ». Un écran vide
 * se lit comme « tout va bien » — et les cinq dossiers sont partis sans
 * convention.
 *
 * ⚠ MÊME MÉCANIQUE QUE `composerAvertissementRegime` : la correction mène à la
 * fiche organisation quand c'est le financeur qui manque, à l'inscription quand
 * c'est le commanditaire. On ne fabrique pas une troisième règle.
 */
describe('riensASigner — le participant pour qui il n’y a AUCUNE pièce', () => {
  const dossierDeJean: EnvoiPlanifie = {
    cle: 'AGEFICE:part-1',
    docType: 'AGEFICE',
    role: 'STAGIAIRE',
    cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
    participantIds: ['part-1'],
    libelle: 'Dossier AGEFICE — Jean DUPONT',
    concerne: 'Jean DUPONT',
    organisation: null,
  };
  const JEAN = { participantId: 'part-1', nomAffiche: 'Jean DUPONT' };
  const MARION = { participantId: 'part-2', nomAffiche: 'Marion MAINO' };

  const CONTEXTE_MARION: ContexteAvertissement = {
    sponsorOrgId: 'org-9',
    sponsorOrgLabel: 'AGENCE DU PORT',
    financeurSansRegime: true,
    financeursRattaches: [],
  };

  it('nomme le participant, son commanditaire, et dit qu’il n’y a rien à signer', () => {
    const vue = construireVueSignature({
      plan: { envois: [], blocages: [], avertissements: [] },
      participants: [MARION],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      contexteAvertissementParParticipant: new Map([['part-2', CONTEXTE_MARION]]),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner).toHaveLength(1);
    expect(vue.riensASigner[0]!.nomAffiche).toBe('Marion MAINO');
    expect(vue.riensASigner[0]!.message).toBe(
      'Aucun financeur renseigné pour AGENCE DU PORT : il n’y a rien à faire signer pour ' +
        'Marion MAINO. Renseignez le financeur de cette organisation pour que ses pièces ' +
        'existent.',
    );
  });

  it('le lien mène à la FICHE ORGANISATION quand c’est le financeur qui manque', () => {
    const vue = construireVueSignature({
      plan: { envois: [], blocages: [], avertissements: [] },
      participants: [MARION],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      contexteAvertissementParParticipant: new Map([['part-2', CONTEXTE_MARION]]),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner[0]!.correction).toEqual({
      cible: 'ORGANISATION',
      organizationId: 'org-9',
      libelleOrganisation: 'AGENCE DU PORT',
    });
  });

  it('sans commanditaire du tout, c’est l’INSCRIPTION qu’on ouvre', () => {
    const vue = construireVueSignature({
      plan: { envois: [], blocages: [], avertissements: [] },
      participants: [MARION],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      contexteAvertissementParParticipant: new Map([
        ['part-2', { ...CONTEXTE_MARION, sponsorOrgId: null, sponsorOrgLabel: null }],
      ]),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner[0]!.correction).toEqual({ cible: 'INSCRIPTION' });
    expect(vue.riensASigner[0]!.message).toBe(
      'Aucun commanditaire sur l’inscription de Marion MAINO : il n’y a rien à faire ' +
        'signer. Ouvrez l’inscription pour désigner qui commande cette formation.',
    );
  });

  it('un participant qui A une pièce n’est JAMAIS listé', () => {
    const vue = construireVueSignature({
      plan: { envois: [dossierDeJean], blocages: [], avertissements: [] },
      participants: [JEAN],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      contexteAvertissementParParticipant: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner).toEqual([]);
  });

  it('un participant DÉJÀ nommé par un avertissement n’est pas dit deux fois', () => {
    // Le cas Florent HAUSSWIRTH : le moteur le signale déjà, avec sa propre
    // phrase et sa propre correction. Ajouter « rien à signer » en dessous
    // ferait deux encarts pour une seule correction — exactement ce que la
    // correction n°2 de Laurent a supprimé.
    const vue = construireVueSignature({
      plan: {
        envois: [],
        blocages: [],
        avertissements: [
          {
            participantId: 'part-2',
            nomAffiche: 'Marion MAINO',
            docType: 'AGEFICE',
            message: 'peu importe',
          },
        ],
      },
      participants: [MARION],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      contexteAvertissementParParticipant: new Map([['part-2', CONTEXTE_MARION]]),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner).toEqual([]);
    expect(vue.avertissements).toHaveLength(1);
  });

  it('un participant déjà nommé par un BLOCAGE n’est pas dit deux fois non plus', () => {
    const vue = construireVueSignature({
      plan: {
        envois: [],
        blocages: [
          {
            participantId: 'part-2',
            nomAffiche: 'Marion MAINO',
            docType: 'CONVENTION',
            message: 'peu importe',
          },
        ],
        avertissements: [],
      },
      participants: [MARION],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      contexteAvertissementParParticipant: new Map([['part-2', CONTEXTE_MARION]]),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner).toEqual([]);
  });

  it('sans contexte du tout, on se tait — on ne devine pas un commanditaire', () => {
    // Un appelant qui ne calcule pas le contexte n'a pas de quoi écrire une
    // phrase juste : inventer « aucun financeur » serait affirmer une cause
    // qu'on n'a pas lue.
    const vue = construireVueSignature({
      plan: { envois: [], blocages: [], avertissements: [] },
      participants: [MARION],
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner).toEqual([]);
  });

  it('les cinq « Agence » de SES-0112 sortent tous les cinq, une ligne chacun', () => {
    const cinq = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => ({
      participantId: id,
      nomAffiche: `Apprenant ${i + 1}`,
    }));
    const vue = construireVueSignature({
      plan: { envois: [], blocages: [], avertissements: [] },
      participants: cinq,
      documentParCle: new Map(),
      docStatusParCle: new Map(),
      contexteAvertissementParParticipant: new Map(
        cinq.map((p) => [p.participantId, CONTEXTE_MARION] as const),
      ),
      canSign: true,
      signataireOf: SANS_OF,
    });
    expect(vue.riensASigner).toHaveLength(5);
  });
});
