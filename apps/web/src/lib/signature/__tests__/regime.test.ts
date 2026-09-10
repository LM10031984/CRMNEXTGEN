import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DOC_TYPES_SIGNABLES,
  docTypesEnRegime,
  docTypesHorsRegime,
  resolveRegimeSignature,
  signataireDe,
} from '../regime';
import type { RegleSignatureFinanceur } from '../regime';

/**
 * Moteur de régime de signature — lot C.1 (spec §3 bis, décision D-10).
 *
 * Les règles sont écrites EN DUR ici, en objets littéraux, et NON importées du
 * seed : ce sont deux gardes indépendantes. `seed-signataires.test.ts` garde les
 * 6 lignes du catalogue ; ce fichier-ci garde le MOTEUR qui les lit. Si les deux
 * partageaient une constante, ils s'accorderaient toujours — y compris sur une
 * erreur.
 */

/** AGEFICE — le seul régime où les trois pièces sont en jeu. */
const REGLE_AGEFICE: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: 'STAGIAIRE',
  assiduiteSigner: 'STAGIAIRE',
};

/** OPCO_EP — salarié : le dirigeant signe la convention, et rien d'autre n'existe. */
const REGLE_OPCO_EP: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: null,
  assiduiteSigner: null,
};

/** CPF — l'apprenant paie et signe lui-même. */
const REGLE_CPF: RegleSignatureFinanceur = {
  conventionSigner: 'STAGIAIRE',
  ageficeSigner: null,
  assiduiteSigner: null,
};

describe('resolveRegimeSignature — quelles pièces, quel rôle, quelle cible', () => {
  it('Test 1 — régime AGEFICE : 3 pièces, convention au dirigeant, le reste au stagiaire', () => {
    const { pieces, blocages } = resolveRegimeSignature({
      regle: REGLE_AGEFICE,
      participantId: 'part-1',
      sponsorOrgId: 'org-1',
    });

    expect(pieces).toEqual([
      {
        docType: 'CONVENTION',
        role: 'DIRIGEANT',
        cible: { kind: 'ORGANISATION', organizationId: 'org-1' },
      },
      {
        docType: 'AGEFICE',
        role: 'STAGIAIRE',
        cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
      },
      {
        docType: 'ASSIDUITE',
        role: 'STAGIAIRE',
        cible: { kind: 'PARTICIPANT', participantId: 'part-1' },
      },
    ]);
    expect(blocages).toEqual([]);
    expect(docTypesHorsRegime(REGLE_AGEFICE).size).toBe(0);
  });

  it('Test 2 — régime OPCO_EP : la convention seule, AGEFICE et ASSIDUITE hors régime', () => {
    // C'est le cas « session 100 % salariés OPCO » : rien à envoyer côté APRÈS,
    // donc pas de bouton d'envoi en C.2 (spec §3 bis).
    const { pieces, blocages } = resolveRegimeSignature({
      regle: REGLE_OPCO_EP,
      participantId: 'part-1',
      sponsorOrgId: 'org-1',
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.docType).toBe('CONVENTION');
    expect(blocages).toEqual([]);
    expect([...docTypesHorsRegime(REGLE_OPCO_EP)].sort()).toEqual(['AGEFICE', 'ASSIDUITE']);
    expect([...docTypesEnRegime(REGLE_OPCO_EP)]).toEqual(['CONVENTION']);
  });

  it('Test 3 — régime CPF : la convention vise le PARTICIPANT, pas son organisation', () => {
    // La ligne qui casse si quelqu'un « simplifie » en supposant qu'une
    // convention se signe toujours côté entreprise. L'organisation payeuse est
    // pourtant renseignée ici : c'est le RÔLE qui décide de la cible, pas la
    // présence d'une organisation.
    const { pieces, blocages } = resolveRegimeSignature({
      regle: REGLE_CPF,
      participantId: 'part-1',
      sponsorOrgId: 'org-1',
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.docType).toBe('CONVENTION');
    expect(pieces[0]?.role).toBe('STAGIAIRE');
    expect(pieces[0]?.cible).toEqual({ kind: 'PARTICIPANT', participantId: 'part-1' });
    expect(blocages).toEqual([]);
  });

  it('Test 4 — financeur inconnu : zéro pièce, les 3 docTypes hors régime', () => {
    // L'inconnu ne vaut pas trois signatures par défaut. Un financeur absent du
    // catalogue, ou une organisation sans `opcoCatalog`, n'ouvre aucune porte.
    const { pieces, blocages } = resolveRegimeSignature({
      regle: null,
      participantId: 'part-1',
      sponsorOrgId: 'org-1',
    });

    expect(pieces).toEqual([]);
    expect(blocages).toEqual([]);
    expect([...docTypesHorsRegime(null)].sort()).toEqual([...DOC_TYPES_SIGNABLES].sort());
    expect(docTypesEnRegime(null).size).toBe(0);
  });

  it('Test 5 — DIRIGEANT sans organisation payeuse : blocage nommé, jamais de pièce muette', () => {
    // Règle métier n°4 de `/signature` : les signataires se résolvent, ils ne se
    // devinent pas. Un envoi qui manque doit être bruyant.
    const { pieces, blocages } = resolveRegimeSignature({
      regle: REGLE_OPCO_EP,
      participantId: 'part-1',
      sponsorOrgId: null,
    });

    expect(pieces).toEqual([]);
    expect(blocages).toEqual([{ docType: 'CONVENTION', raison: 'ORG_PAYEUSE_ABSENTE' }]);
  });

  it('Test 6 — test de puissance : la même règle mutée change la sortie', () => {
    // Si la sortie ne bougeait pas, c'est que le module porterait une table en
    // dur quelque part et lirait la règle pour la forme.
    const opcoEpMute: RegleSignatureFinanceur = {
      ...REGLE_OPCO_EP,
      assiduiteSigner: 'STAGIAIRE',
    };

    const { pieces } = resolveRegimeSignature({
      regle: opcoEpMute,
      participantId: 'part-1',
      sponsorOrgId: 'org-1',
    });

    expect(pieces.map((p) => p.docType)).toEqual(['CONVENTION', 'ASSIDUITE']);
    expect(pieces[1]?.role).toBe('STAGIAIRE');
    expect(pieces[1]?.cible).toEqual({ kind: 'PARTICIPANT', participantId: 'part-1' });
    expect([...docTypesHorsRegime(opcoEpMute)]).toEqual(['AGEFICE']);

    // …et la règle NON mutée n'a pas bougé pour autant (pas d'état partagé).
    expect([...docTypesHorsRegime(REGLE_OPCO_EP)].sort()).toEqual(['AGEFICE', 'ASSIDUITE']);
  });

  it('signataireDe lit la colonne du docType, et rend null hors régime', () => {
    expect(signataireDe('CONVENTION', REGLE_AGEFICE)).toBe('DIRIGEANT');
    expect(signataireDe('AGEFICE', REGLE_AGEFICE)).toBe('STAGIAIRE');
    expect(signataireDe('ASSIDUITE', REGLE_OPCO_EP)).toBeNull();
    expect(signataireDe('CONVENTION', null)).toBeNull();
  });

  it('chaque pièce lit SA colonne — un câblage croisé de COLONNE_PAR_DOCTYPE se voit', () => {
    // Ajouté après le test de puissance du 10/09/2026. Câbler ASSIDUITE sur
    // `ageficeSigner` ne faisait tomber QU'UN test : dans les 6 régimes réels,
    // `ageficeSigner` et `assiduiteSigner` portent toujours la MÊME valeur
    // (STAGIAIRE/STAGIAIRE chez AGEFICE, null/null partout ailleurs) — la
    // permutation était donc invisible. Une règle aux trois colonnes DEUX À DEUX
    // DISTINCTES rend visible n'importe laquelle des six permutations possibles.
    const troisValeursDistinctes: RegleSignatureFinanceur = {
      conventionSigner: 'DIRIGEANT',
      ageficeSigner: 'STAGIAIRE',
      assiduiteSigner: null,
    };

    expect(signataireDe('CONVENTION', troisValeursDistinctes)).toBe('DIRIGEANT');
    expect(signataireDe('AGEFICE', troisValeursDistinctes)).toBe('STAGIAIRE');
    expect(signataireDe('ASSIDUITE', troisValeursDistinctes)).toBeNull();
    expect([...docTypesEnRegime(troisValeursDistinctes)]).toEqual(['CONVENTION', 'AGEFICE']);
    expect([...docTypesHorsRegime(troisValeursDistinctes)]).toEqual(['ASSIDUITE']);
  });
});

/**
 * Garde-fou « régime incohérent » — décision de Laurent du 10/09/2026
 * (spec §5 lot C, amendement n°4).
 *
 * LE CAS RÉEL : Florent HAUSSWIRTH. Inscrit avec pour organisation bénéficiaire
 * l'agence qui l'emploie (financeur salarié), alors que son dossier est celui
 * d'un TNS — il a une entreprise individuelle rattachée, et c'est elle qui porte
 * le financement. Le régime du sponsor ne connaît ni dossier de financement
 * individuel ni attestation d'assiduité : sans garde-fou, ces pièces sortent en
 * `NA` et son dossier DISPARAÎT de l'écran. Un dossier qui disparaît ne se
 * corrige jamais.
 *
 * L'avertissement ne déclenche AUCUN envoi : il rend l'anomalie bruyante et
 * invite à corriger la donnée (le financeur de l'inscription).
 */
describe('resolveRegimeSignature — avertissement « régime incohérent »', () => {
  it('cas Florent HAUSSWIRTH : sponsor salarié + EI rattachée qui ouvre les pièces TNS', () => {
    const { pieces, blocages, avertissements } = resolveRegimeSignature({
      regle: REGLE_OPCO_EP,
      participantId: 'part-florent',
      sponsorOrgId: 'org-agence',
      signauxDossierPropre: {
        aLienEiSelfHorsSponsor: true,
        reglesAutresOrgs: [REGLE_AGEFICE],
      },
    });

    // L'avertissement ne fabrique RIEN : la seule pièce reste celle du régime
    // du sponsor. Un avertissement qui produirait un envoi enverrait signer une
    // pièce que le financeur ne demande pas.
    expect(pieces).toEqual([
      {
        docType: 'CONVENTION',
        role: 'DIRIGEANT',
        cible: { kind: 'ORGANISATION', organizationId: 'org-agence' },
      },
    ]);
    expect(blocages).toEqual([]);

    // Les DEUX pièces que le régime de son EI ouvrirait sont signalées, dans
    // l'ordre de `DOC_TYPES_SIGNABLES`. Assertion sur le CONTENU exact : un
    // `.length > 0` laisserait passer un avertissement sur la mauvaise pièce.
    expect(avertissements).toEqual([
      { docType: 'AGEFICE', raison: 'REGIME_INCOHERENT' },
      { docType: 'ASSIDUITE', raison: 'REGIME_INCOHERENT' },
    ]);

    // …et l'avertissement ne remet PAS les pièces en régime : la matrice
    // continue d'afficher `NA`, avec le signal à côté.
    expect([...docTypesHorsRegime(REGLE_OPCO_EP)].sort()).toEqual(['AGEFICE', 'ASSIDUITE']);
  });

  it('aucun signal : pas un mot — le salarié ordinaire ne doit pas faire de bruit', () => {
    // La grande majorité des inscriptions. Si ce test rougissait, l'admin
    // recevrait un avertissement par salarié et cesserait de les lire.
    const { avertissements } = resolveRegimeSignature({
      regle: REGLE_OPCO_EP,
      participantId: 'part-1',
      sponsorOrgId: 'org-agence',
      signauxDossierPropre: { aLienEiSelfHorsSponsor: false, reglesAutresOrgs: [] },
    });

    expect(avertissements).toEqual([]);
  });

  it('champ absent (appelants du lot C.1) : aucun avertissement, aucune régression', () => {
    const { pieces, avertissements } = resolveRegimeSignature({
      regle: REGLE_OPCO_EP,
      participantId: 'part-1',
      sponsorOrgId: 'org-agence',
    });

    expect(avertissements).toEqual([]);
    expect(pieces).toHaveLength(1);
  });

  it('signal présent MAIS sponsor qui ouvre déjà la pièce : rien d’incohérent', () => {
    // Le TNS inscrit AVEC son EI comme organisation bénéficiaire : dossier
    // propre, aucun avertissement — même si les signaux sont là.
    const { pieces, avertissements } = resolveRegimeSignature({
      regle: REGLE_AGEFICE,
      participantId: 'part-1',
      sponsorOrgId: 'org-ei',
      signauxDossierPropre: {
        aLienEiSelfHorsSponsor: true,
        reglesAutresOrgs: [REGLE_AGEFICE],
      },
    });

    expect(avertissements).toEqual([]);
    expect(pieces).toHaveLength(3);
  });

  it('EI rattachée SANS catalogue : le lien seul suffit à signaler le dossier de financement', () => {
    // Une entreprise individuelle rattachée mais dont le financeur n'est pas
    // renseigné est elle-même une donnée à corriger. Le signal porte sur la
    // pièce du dossier de financement uniquement : le lien ne dit rien de
    // l'attestation d'assiduité.
    const { avertissements } = resolveRegimeSignature({
      regle: REGLE_OPCO_EP,
      participantId: 'part-1',
      sponsorOrgId: 'org-agence',
      signauxDossierPropre: { aLienEiSelfHorsSponsor: true, reglesAutresOrgs: [] },
    });

    expect(avertissements).toEqual([{ docType: 'AGEFICE', raison: 'REGIME_INCOHERENT' }]);
  });

  it('une autre organisation qui n’ouvre QUE le dossier de financement ne signale que lui', () => {
    const regleQuiNOuvreQueLeDossier: RegleSignatureFinanceur = {
      conventionSigner: null,
      ageficeSigner: 'STAGIAIRE',
      assiduiteSigner: null,
    };

    const { avertissements } = resolveRegimeSignature({
      regle: REGLE_OPCO_EP,
      participantId: 'part-1',
      sponsorOrgId: 'org-agence',
      signauxDossierPropre: {
        aLienEiSelfHorsSponsor: false,
        reglesAutresOrgs: [regleQuiNOuvreQueLeDossier],
      },
    });

    expect(avertissements).toEqual([{ docType: 'AGEFICE', raison: 'REGIME_INCOHERENT' }]);
  });

  it('PUISSANCE — retomber sur un `NA` silencieux doit ROUGIR', () => {
    // Ce test est la raison d'être du garde-fou. Il compare la MÊME entrée avec
    // et sans signaux : si neutraliser le garde-fou (avertissements toujours
    // vides) laissait le test vert, c'est que l'assertion décrirait le code au
    // lieu de décrire la règle. Le `toEqual` porte donc sur le contenu exact des
    // deux tableaux, et la sortie DOIT différer entre les deux appels.
    const base = {
      regle: REGLE_OPCO_EP,
      participantId: 'part-florent',
      sponsorOrgId: 'org-agence',
    };

    const sansSignal = resolveRegimeSignature(base);
    const avecSignal = resolveRegimeSignature({
      ...base,
      signauxDossierPropre: { aLienEiSelfHorsSponsor: true, reglesAutresOrgs: [] },
    });

    expect(sansSignal.avertissements).toEqual([]);
    expect(avecSignal.avertissements).toEqual([
      { docType: 'AGEFICE', raison: 'REGIME_INCOHERENT' },
    ]);
    expect(avecSignal.avertissements).not.toEqual(sansSignal.avertissements);
    // Et les pièces, elles, sont IDENTIQUES : l'avertissement ne déclenche rien.
    expect(avecSignal.pieces).toEqual(sansSignal.pieces);
  });
});

/**
 * Test 7 — garde anti-`if` financeur, ÉTENDUE AUX TROIS MODULES PURS (lot C.2a).
 *
 * Le moteur doit lire la règle dans la donnée, jamais reconnaître un code
 * financeur. Chaque `if (code === 'X')` est la dette qui se paiera au financeur
 * suivant (règle de la commande `/financeur`).
 *
 * La boucle est FACTORISÉE sur une liste de fichiers plutôt que triplée : un
 * quatrième module pur du régime s'ajoutera par une ligne, et il sera gardé le
 * jour même. Trois `describe` copiés auraient divergé au premier correctif.
 *
 * On ne cherche PAS `'AGEFICE'` : c'est un `DocType` légitime du corpus
 * documentaire, présent dans `DOC_TYPES_SIGNABLES`. Un test qui l'interdirait
 * serait rouge dès la première ligne écrite — et se ferait désactiver.
 */
describe('les modules purs du régime — la règle vient de la donnée, pas d’un code financeur', () => {
  const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  /** Les modules purs du régime de signature. En ajouter un = une ligne ici. */
  const MODULES = [
    'regime.ts',
    'plan-envoi.ts',
    'representant.ts',
    'envoi-contrats.ts',
  ] as const;

  /** Retire commentaires de bloc, commentaires de ligne et littéraux de message. */
  function codeSeul(source: string): string[] {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l));
  }

  function fautifs(fichier: string, motif: RegExp): string[] {
    const lignes = codeSeul(readFileSync(path.join(RACINE, fichier), 'utf-8'));
    return lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => motif.test(l))
      .map(({ l, i }) => `${fichier}:${i + 1} → ${l.trim()}`);
  }

  for (const fichier of MODULES) {
    it(`${fichier} — aucun code financeur en position de code`, () => {
      expect(fautifs(fichier, /OPCO_EP|OPCOMMERCE|FI-FPL|ATLAS|CPF\b/)).toEqual([]);
    });

    it(`${fichier} — aucune comparaison sur un \`code\``, () => {
      expect(fautifs(fichier, /\bcode\s*===/)).toEqual([]);
    });

    it(`${fichier} — module pur : ni Prisma, ni réseau, ni async`, () => {
      expect(
        fautifs(fichier, /\bprisma\b|@qualiof\/db|@prisma\/client|fetch\(|\basync\b|\bawait\b/),
      ).toEqual([]);
    });
  }
});
