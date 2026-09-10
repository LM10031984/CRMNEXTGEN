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
});

/**
 * Test 7 — garde anti-`if` financeur.
 *
 * Le moteur doit lire la règle dans la donnée, jamais reconnaître un code
 * financeur. Chaque `if (code === 'X')` est la dette qui se paiera au financeur
 * suivant (règle de la commande `/financeur`).
 *
 * On ne cherche PAS `'AGEFICE'` : c'est un `DocType` légitime du corpus
 * documentaire, présent dans `DOC_TYPES_SIGNABLES`. Un test qui l'interdirait
 * serait rouge dès la première ligne écrite — et se ferait désactiver.
 */
describe('regime.ts — la règle vient de la donnée, pas d’un code financeur', () => {
  const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../regime.ts');

  /** Retire commentaires de bloc, commentaires de ligne et littéraux de message. */
  function codeSeul(source: string): string[] {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l));
  }

  const lignes = codeSeul(readFileSync(SOURCE, 'utf-8'));

  it('aucun code financeur en position de code', () => {
    const fautifs = lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /OPCO_EP|OPCOMMERCE|FI-FPL|ATLAS|CPF\b/.test(l))
      .map(({ l, i }) => `regime.ts:${i + 1} → ${l.trim()}`);
    expect(fautifs).toEqual([]);
  });

  it('aucune comparaison sur un `code`', () => {
    const fautifs = lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /\bcode\s*===/.test(l))
      .map(({ l, i }) => `regime.ts:${i + 1} → ${l.trim()}`);
    expect(fautifs).toEqual([]);
  });

  it('le module est pur : ni Prisma, ni réseau, ni async', () => {
    const fautifs = lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) =>
        /\bprisma\b|@qualiof\/db|@prisma\/client|fetch\(|\basync\b|\bawait\b/.test(l),
      )
      .map(({ l, i }) => `regime.ts:${i + 1} → ${l.trim()}`);
    expect(fautifs).toEqual([]);
  });
});
