import { describe, it, expect } from 'vitest';

/**
 * Lot C.2b-1 — le régime de financement câblé à l'écran.
 *
 * CE QUE CES TESTS RATTRAPENT. Jusqu'ici la fiche session décidait « ce
 * participant relève-t-il d'AGEFICE ? » avec la dérivation élargie BUG-11
 * (sponsor AGEFICE OU lien EI_SELF OU autre organisation rattachée en AGEFICE),
 * pendant que le moteur d'envoi (C.2a) lisait les trois colonnes d'OpcoCatalog.
 * Deux règles pour une question : l'écran promettait des envois que
 * `planifierEnvoi` ne planifiait pas.
 *
 * Le mapper vit donc dans UN module, consommé par les DEUX appelants — c'est ce
 * que C.2a avait déjà fait pour `representant.ts` (« le signataire ne peut pas
 * diverger du nom que le PDF imprime »).
 *
 * LES DEUX TESTS DE PUISSANCE de ce fichier gardent la contrepartie du
 * changement : rien ne DISPARAÎT de l'écran. Un dossier AGEFICE déjà généré, ou
 * un apprenant porteur d'un avertissement « régime incohérent », gardent leur
 * colonne — un dossier qui disparaît de l'écran ne se corrige jamais.
 */

import {
  codesFinanceursDe,
  colonneAgeficeVisible,
  docTypesSansObjet,
  participantPourEnvoi,
  regleDuFinanceur,
  type ParticipantLu,
} from '../participants-regime';
import { docTypesEnRegime, docTypesHorsRegime, type RegleSignatureFinanceur } from '../regime';
import { planifierEnvoi } from '../plan-envoi';

/** Les trois colonnes réellement seedées pour AGEFICE (packages/db/prisma/seed.ts). */
const REGLE_AGEFICE: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: 'STAGIAIRE',
  assiduiteSigner: 'STAGIAIRE',
};
/** Un OPCO classique : il n'ouvre QUE la convention. */
const REGLE_OPCO: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: null,
  assiduiteSigner: null,
};

const REGLES = new Map<string, RegleSignatureFinanceur>([
  ['AGEFICE', REGLE_AGEFICE],
  ['OPCO_EP', REGLE_OPCO],
]);

/**
 * Florent HAUSSWIRTH — le cas qui a fait naître BUG-11 puis le garde-fou C.1.
 * Inscrit sous l'enseigne qui l'emploie (OPCO_EP), auto-entrepreneur AGEFICE en
 * parallèle : son EI est une organisation RATTACHÉE, pas le commanditaire.
 */
function florent(): ParticipantLu {
  return {
    participantId: 'part-florent',
    nomAffiche: 'Florent HAUSSWIRTH',
    sponsorOrgId: 'org-imagimmo',
    sponsorOrgLabel: 'Imagimmo',
    sponsorOpcoCode: 'OPCO_EP',
    liens: [
      { role: 'SALARIE', organizationId: 'org-imagimmo', organization: { opcoCode: 'OPCO_EP' } },
      { role: 'EI_SELF', organizationId: 'org-ei-florent', organization: { opcoCode: 'AGEFICE' } },
    ],
  };
}

/** Un TNS « propre » : son commanditaire EST son entreprise individuelle. */
function tns(): ParticipantLu {
  return {
    participantId: 'part-tns',
    nomAffiche: 'Sophie BERNARD',
    sponsorOrgId: 'org-ei-sophie',
    sponsorOrgLabel: 'EI BERNARD',
    sponsorOpcoCode: 'AGEFICE',
    liens: [
      { role: 'EI_SELF', organizationId: 'org-ei-sophie', organization: { opcoCode: 'AGEFICE' } },
    ],
  };
}

/** Une salariée sans aucune casquette indépendante. */
function salariee(): ParticipantLu {
  return {
    participantId: 'part-marie',
    nomAffiche: 'Marie DUPONT',
    sponsorOrgId: 'org-agence',
    sponsorOrgLabel: 'Martin Immobilier',
    sponsorOpcoCode: 'OPCO_EP',
    liens: [
      { role: 'SALARIE', organizationId: 'org-agence', organization: { opcoCode: 'OPCO_EP' } },
    ],
  };
}

/** Le cas « fonds propres » : commanditaire connu, financeur absent. */
function autofinance(): ParticipantLu {
  return {
    participantId: 'part-auto',
    nomAffiche: 'Jean PETIT',
    sponsorOrgId: 'org-jean',
    sponsorOrgLabel: 'EI PETIT',
    sponsorOpcoCode: null,
    liens: [{ role: 'EI_SELF', organizationId: 'org-jean', organization: { opcoCode: null } }],
  };
}

describe('codesFinanceursDe — un seul aller-retour vers OpcoCatalog', () => {
  it('remonte le code du commanditaire ET ceux des organisations rattachées', () => {
    expect(new Set(codesFinanceursDe([florent()]))).toEqual(new Set(['OPCO_EP', 'AGEFICE']));
  });

  it('dédoublonne entre participants — deux salariés d’une même agence, un seul code', () => {
    expect(codesFinanceursDe([salariee(), salariee()])).toEqual(['OPCO_EP']);
  });

  it('ignore les codes vides, nuls et remplis d’espaces', () => {
    const bruite: ParticipantLu = {
      ...autofinance(),
      sponsorOpcoCode: '   ',
      liens: [
        { role: 'EI_SELF', organizationId: 'org-x', organization: { opcoCode: '' } },
        { role: 'SALARIE', organizationId: 'org-y', organization: null },
      ],
    };
    expect(codesFinanceursDe([bruite])).toEqual([]);
  });
});

describe('regleDuFinanceur — l’inconnu ne vaut pas trois signatures par défaut', () => {
  it('trime le code avant de chercher', () => {
    expect(regleDuFinanceur('  AGEFICE  ', REGLES)).toEqual(REGLE_AGEFICE);
  });

  it('rend null pour null, undefined, une chaîne d’espaces et un code absent du catalogue', () => {
    expect(regleDuFinanceur(null, REGLES)).toBeNull();
    expect(regleDuFinanceur(undefined, REGLES)).toBeNull();
    expect(regleDuFinanceur('  ', REGLES)).toBeNull();
    expect(regleDuFinanceur('FINANCEUR-QUI-NEXISTE-PAS', REGLES)).toBeNull();
  });
});

describe('participantPourEnvoi — le mapper que la page et le moteur partagent', () => {
  it('un commanditaire AGEFICE porte les trois colonnes du catalogue', () => {
    const p = participantPourEnvoi(tns(), REGLES);
    expect(p.regle).toEqual(REGLE_AGEFICE);
    expect(docTypesEnRegime(p.regle)).toEqual(new Set(['CONVENTION', 'AGEFICE', 'ASSIDUITE']));
  });

  it('un commanditaire sans code financeur ne met AUCUNE pièce en régime', () => {
    const p = participantPourEnvoi(autofinance(), REGLES);
    expect(p.regle).toBeNull();
    expect(docTypesEnRegime(p.regle)).toEqual(new Set());
  });

  it('recopie l’identité d’affichage sans la reformuler', () => {
    const p = participantPourEnvoi(florent(), REGLES);
    expect(p.participantId).toBe('part-florent');
    expect(p.nomAffiche).toBe('Florent HAUSSWIRTH');
    expect(p.sponsorOrgId).toBe('org-imagimmo');
    expect(p.sponsorOrgLabel).toBe('Imagimmo');
  });

  it('`aLienEiSelfHorsSponsor` est vrai SEULEMENT si l’EI n’est pas le commanditaire', () => {
    expect(participantPourEnvoi(florent(), REGLES).signauxDossierPropre).toEqual({
      aLienEiSelfHorsSponsor: true,
      reglesAutresOrgs: [REGLE_AGEFICE],
    });
    // Le TNS « propre » : son EI EST le commanditaire, donc aucun signal.
    expect(participantPourEnvoi(tns(), REGLES).signauxDossierPropre).toEqual({
      aLienEiSelfHorsSponsor: false,
      reglesAutresOrgs: [],
    });
  });

  it('`reglesAutresOrgs` n’embarque que les règles CONNUES des autres organisations', () => {
    const avecOrgInconnue: ParticipantLu = {
      ...florent(),
      liens: [
        ...florent().liens,
        { role: 'SALARIE', organizationId: 'org-mystere', organization: { opcoCode: 'ZZZ' } },
      ],
    };
    expect(participantPourEnvoi(avecOrgInconnue, REGLES).signauxDossierPropre).toEqual({
      aLienEiSelfHorsSponsor: true,
      reglesAutresOrgs: [REGLE_AGEFICE],
    });
  });
});

describe('Florent HAUSSWIRTH — le régime remplace la dérivation élargie BUG-11', () => {
  it('n’est PAS AGEFICE : son financeur d’inscription ne l’ouvre pas', () => {
    const p = participantPourEnvoi(florent(), REGLES);
    expect(docTypesEnRegime(p.regle).has('AGEFICE')).toBe(false);
  });

  it('a AGEFICE **et** ASSIDUITE hors régime, la convention restant en régime', () => {
    const p = participantPourEnvoi(florent(), REGLES);
    expect(docTypesHorsRegime(p.regle)).toEqual(new Set(['AGEFICE', 'ASSIDUITE']));
    expect(docTypesEnRegime(p.regle)).toEqual(new Set(['CONVENTION']));
  });

  it('porte un avertissement NOMMÉ, qui ne planifie aucun envoi AGEFICE', () => {
    const plan = planifierEnvoi({
      scope: 'BEFORE',
      participants: [participantPourEnvoi(florent(), REGLES)],
    });

    expect(plan.avertissements).toHaveLength(1);
    expect(plan.avertissements[0]?.docType).toBe('AGEFICE');
    expect(plan.avertissements[0]?.participantId).toBe('part-florent');
    expect(plan.avertissements[0]?.message).toContain('Florent HAUSSWIRTH');
    expect(plan.avertissements[0]?.message).toContain("rien n'a été envoyé");
    // L'avertissement ne DÉCLENCHE rien : seule la convention est planifiée.
    expect(plan.envois.map((e) => e.docType)).toEqual(['CONVENTION']);
    expect(plan.blocages).toEqual([]);
  });
});

/**
 * LE GARDE-FOU DE LA CONVENTION (écart n°1, constaté au contact du code le 10/09).
 *
 * `docTypesHorsRegime(null)` rend les TROIS pièces. C'est juste pour l'ENVOI —
 * « l'inconnu ne vaut pas trois signatures par défaut » — et faux pour
 * l'AFFICHAGE : un commanditaire sans code financeur (fonds propres, entreprise
 * qui paye directement — `FinancingMode.AUTOFINANCEMENT` / `ENTREPRISE`) doit
 * toujours sa convention. Un `NA` la ferait disparaître de la matrice sans
 * qu'aucun avertissement ne la rattrape : le `NA` silencieux que la spec
 * interdit, sur une pièce dont l'absence est une faute légale.
 *
 * D'où deux lectures : `docTypesHorsRegime` pour l'envoi, `docTypesSansObjet`
 * pour l'écran. La seconde connaît les pièces qui existent QUEL QUE SOIT le
 * financeur — une TABLE DE DONNÉES d'une ligne aujourd'hui, pas un `if`.
 */
describe('docTypesSansObjet — un régime inconnu n’efface pas la convention', () => {
  it('régime connu : c’est exactement le complément des pièces en régime', () => {
    expect(docTypesSansObjet(REGLE_OPCO)).toEqual(new Set(['AGEFICE', 'ASSIDUITE']));
    expect(docTypesSansObjet(REGLE_AGEFICE)).toEqual(new Set());
  });

  it('PUISSANCE — régime INCONNU : les pièces de financeur sont sans objet, la convention reste réclamée', () => {
    expect(docTypesSansObjet(null)).toEqual(new Set(['AGEFICE', 'ASSIDUITE']));
    expect(docTypesSansObjet(null).has('CONVENTION')).toBe(false);
    // La lecture « envoi », elle, reste prudente à l'inverse : elle n'envoie rien.
    expect(docTypesHorsRegime(null).has('CONVENTION')).toBe(true);
  });
});

describe('colonneAgeficeVisible — aucun dossier ne disparaît de l’écran', () => {
  it('vrai dès qu’un participant a la pièce en régime', () => {
    expect(
      colonneAgeficeVisible({
        participants: [
          { participantId: 'part-tns', enRegime: docTypesEnRegime(REGLE_AGEFICE) },
          { participantId: 'part-marie', enRegime: docTypesEnRegime(REGLE_OPCO) },
        ],
        participantsAvecDocumentAgefice: new Set(),
        participantsAvertisAgefice: new Set(),
      }),
    ).toBe(true);
  });

  it('faux quand rien ne l’appelle : ni régime, ni document, ni avertissement', () => {
    expect(
      colonneAgeficeVisible({
        participants: [{ participantId: 'part-marie', enRegime: docTypesEnRegime(REGLE_OPCO) }],
        participantsAvecDocumentAgefice: new Set(),
        participantsAvertisAgefice: new Set(),
      }),
    ).toBe(false);
  });

  it('PUISSANCE — un dossier AGEFICE DÉJÀ GÉNÉRÉ garde sa colonne, même hors régime', () => {
    expect(
      colonneAgeficeVisible({
        participants: [{ participantId: 'part-florent', enRegime: docTypesEnRegime(REGLE_OPCO) }],
        participantsAvecDocumentAgefice: new Set(['part-florent']),
        participantsAvertisAgefice: new Set(),
      }),
    ).toBe(true);
  });

  it('PUISSANCE — un avertissement « régime incohérent » garde la colonne, il ne devient pas un NA muet', () => {
    expect(
      colonneAgeficeVisible({
        participants: [{ participantId: 'part-florent', enRegime: docTypesEnRegime(REGLE_OPCO) }],
        participantsAvecDocumentAgefice: new Set(),
        participantsAvertisAgefice: new Set(['part-florent']),
      }),
    ).toBe(true);
  });
});
