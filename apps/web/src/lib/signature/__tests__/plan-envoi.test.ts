import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { planifierEnvoi } from '../plan-envoi';
import type { ParticipantPourEnvoi } from '../plan-envoi';
import type { RegleSignatureFinanceur } from '../regime';

/**
 * Plan d'envoi d'une session — lot C.2a, tâche 2.
 *
 * Le plan est PUR : il se calcule sans base, sans réseau, sans mock. C'est ce
 * qui rend les cas tordus testables — et notamment celui de Florent HAUSSWIRTH,
 * inscrit sous le financeur de son agence alors que son dossier est celui d'un
 * TNS.
 *
 * Les règles sont écrites EN DUR ici, en objets littéraux, jamais importées du
 * seed : ce fichier garde le PLAN, `seed-signataires.test.ts` garde les lignes
 * du catalogue. Deux gardes qui partageraient une constante s'accorderaient
 * toujours, y compris sur une erreur.
 */

/** Financeur « salarié » : le dirigeant signe la convention, rien d'autre n'existe. */
const REGLE_SALARIE: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: null,
  assiduiteSigner: null,
};

/** Financeur TNS : les trois pièces, la convention au dirigeant, le reste au stagiaire. */
const REGLE_TNS: RegleSignatureFinanceur = {
  conventionSigner: 'DIRIGEANT',
  ageficeSigner: 'STAGIAIRE',
  assiduiteSigner: 'STAGIAIRE',
};

/** Financeur où l'apprenant paie et signe lui-même sa convention. */
const REGLE_APPRENANT_PAYEUR: RegleSignatureFinanceur = {
  conventionSigner: 'STAGIAIRE',
  ageficeSigner: null,
  assiduiteSigner: null,
};

function participant(patch: Partial<ParticipantPourEnvoi> = {}): ParticipantPourEnvoi {
  return {
    participantId: 'part-1',
    nomAffiche: 'Alice MARTIN',
    sponsorOrgId: 'org-agence',
    sponsorOrgLabel: 'AGENCE MARTIN',
    regle: REGLE_SALARIE,
    ...patch,
  };
}

describe('planifierEnvoi — les 4 scénarios exigés', () => {
  it('Scénario 1 — salarié d’une agence : UNE convention côté entreprise, rien côté APRÈS', () => {
    const participants = [participant()];

    const avant = planifierEnvoi({ scope: 'BEFORE', participants });
    expect(avant.envois).toEqual([
      {
        cle: 'CONVENTION:org-agence',
        docType: 'CONVENTION',
        role: 'DIRIGEANT',
        cible: { kind: 'ORGANISATION', organizationId: 'org-agence' },
        participantIds: ['part-1'],
        libelle: 'Convention — AGENCE MARTIN (1 participant)',
      },
    ]);
    expect(avant.blocages).toEqual([]);
    expect(avant.avertissements).toEqual([]);

    // Le salarié n'est la CIBLE d'aucun envoi : il ne signe rien de sa main.
    expect(avant.envois.filter((e) => e.cible.kind === 'PARTICIPANT')).toEqual([]);

    // Session 100 % salariés : l'onglet APRÈS n'a rien à envoyer. Un bouton qui
    // proposerait un envoi ici enverrait une pièce que le financeur ne demande pas.
    const apres = planifierEnvoi({ scope: 'AFTER', participants });
    expect(apres.envois).toEqual([]);
    expect(apres.blocages).toEqual([]);
    expect(apres.avertissements).toEqual([]);
  });

  it('Scénario 2 — TNS via son EI : TROIS envois distincts, jamais un seul groupé', () => {
    const participants = [
      participant({
        participantId: 'part-tns',
        nomAffiche: 'Florent HAUSSWIRTH',
        sponsorOrgId: 'org-ei-1',
        sponsorOrgLabel: 'HAUSSWIRTH FLORENT EI',
        regle: REGLE_TNS,
      }),
    ];

    const avant = planifierEnvoi({ scope: 'BEFORE', participants });
    // D-4 AMENDÉ : un envoi porte UN document. La convention part côté
    // organisation, le dossier de financement côté participant.
    expect(avant.envois.map((e) => e.cle)).toEqual([
      'CONVENTION:org-ei-1',
      'AGEFICE:part-tns',
    ]);
    expect(avant.envois[0]?.cible).toEqual({ kind: 'ORGANISATION', organizationId: 'org-ei-1' });
    expect(avant.envois[1]).toEqual({
      cle: 'AGEFICE:part-tns',
      docType: 'AGEFICE',
      role: 'STAGIAIRE',
      cible: { kind: 'PARTICIPANT', participantId: 'part-tns' },
      participantIds: ['part-tns'],
      libelle: 'Dossier AGEFICE — Florent HAUSSWIRTH',
    });

    const apres = planifierEnvoi({ scope: 'AFTER', participants });
    expect(apres.envois.map((e) => e.cle)).toEqual(['ASSIDUITE:part-tns']);
    expect(apres.envois[0]?.role).toBe('STAGIAIRE');
  });

  it('Scénario 3 — `payerOrg` n’a AUCUN effet : deux payeurs, un seul envoi de convention', () => {
    // Test de CONTRAT. `ParticipantPourEnvoi` ne porte pas de `payerOrgId` — le
    // plan ne peut donc pas s'en servir, même par accident. Deux inscrits de la
    // même organisation bénéficiaire, facturés à des payeurs différents,
    // tombent dans LE MÊME envoi.
    const avecPayeur = (p: ParticipantPourEnvoi, payerOrgId: string): ParticipantPourEnvoi =>
      ({ ...p, payerOrgId }) as ParticipantPourEnvoi;

    const { envois } = planifierEnvoi({
      scope: 'BEFORE',
      participants: [
        avecPayeur(participant({ participantId: 'part-2', nomAffiche: 'Bob DUPONT' }), 'org-opco'),
        avecPayeur(participant({ participantId: 'part-1' }), 'org-agence'),
      ],
    });

    expect(envois).toEqual([
      {
        cle: 'CONVENTION:org-agence',
        docType: 'CONVENTION',
        role: 'DIRIGEANT',
        cible: { kind: 'ORGANISATION', organizationId: 'org-agence' },
        // Triés : l'ordre d'entrée ne doit pas transparaître dans le plan.
        participantIds: ['part-1', 'part-2'],
        libelle: 'Convention — AGENCE MARTIN (2 participants)',
      },
    ]);

    // Aucune clé « payer… » ne ressort du plan produit.
    const clefs = envois.flatMap((e) => Object.keys(e));
    expect(clefs.filter((k) => /payer/i.test(k))).toEqual([]);
  });

  it('Scénario 4 — sans organisation bénéficiaire : blocage NOMINATIF, aucun envoi', () => {
    const { envois, blocages, avertissements } = planifierEnvoi({
      scope: 'BEFORE',
      participants: [
        participant({
          participantId: 'part-orphelin',
          nomAffiche: 'Chloé BERNARD',
          sponsorOrgId: null,
          sponsorOrgLabel: null,
        }),
      ],
    });

    expect(envois).toEqual([]);
    expect(avertissements).toEqual([]);
    // Assertion sur le MESSAGE COMPLET : un blocage qui ne dit pas quoi faire
    // laisse l'admin devant un écran rouge sans issue.
    expect(blocages).toEqual([
      {
        participantId: 'part-orphelin',
        nomAffiche: 'Chloé BERNARD',
        docType: 'CONVENTION',
        message:
          'Chloé BERNARD : aucune organisation bénéficiaire rattachée à cette inscription. ' +
          "Impossible de savoir qui signe la convention : rattachez l'organisation sur la " +
          "fiche session avant l'envoi.",
      },
    ]);
  });
});

describe('planifierEnvoi — groupement D-4 AMENDÉ (1 envoi = 1 document)', () => {
  it('PUISSANCE — fusionner le dossier de financement dans la convention doit ROUGIR', () => {
    // L'assertion porte sur la LISTE EXACTE des clés, jamais sur un `length` :
    // un `length` de 2 resterait vert si les deux envois portaient la même
    // pièce, et fusionner AGEFICE dans la convention le ferait passer à 1.
    //
    // Motif de l'amendement (Laurent, 10/09/2026) : un dossier de financement
    // n'a QU'UN signataire ; le grouper avec la convention ferait dépendre sa
    // complétion de celle du dirigeant.
    const { envois } = planifierEnvoi({
      scope: 'BEFORE',
      participants: [
        participant({ participantId: 'part-a', sponsorOrgId: 'org-ei-a', regle: REGLE_TNS }),
        participant({ participantId: 'part-b', sponsorOrgId: 'org-ei-b', regle: REGLE_TNS }),
      ],
    });

    expect(envois.map((e) => e.cle)).toEqual([
      'CONVENTION:org-ei-a',
      'CONVENTION:org-ei-b',
      'AGEFICE:part-a',
      'AGEFICE:part-b',
    ]);
    // Chaque envoi porte UN document, et un dossier de financement ne concerne
    // jamais qu'un participant.
    expect(envois.map((e) => e.participantIds)).toEqual([
      ['part-a'],
      ['part-b'],
      ['part-a'],
      ['part-b'],
    ]);
  });

  it('convention signée par le stagiaire : un envoi PAR PARTICIPANT, jamais un groupe', () => {
    const { envois } = planifierEnvoi({
      scope: 'BEFORE',
      participants: [
        participant({ participantId: 'part-1', regle: REGLE_APPRENANT_PAYEUR }),
        participant({
          participantId: 'part-2',
          nomAffiche: 'Bob DUPONT',
          regle: REGLE_APPRENANT_PAYEUR,
        }),
      ],
    });

    expect(envois.map((e) => e.cle)).toEqual(['CONVENTION:part-1', 'CONVENTION:part-2']);
    expect(envois[0]?.libelle).toBe('Convention — Alice MARTIN');
    expect(envois.map((e) => e.cible)).toEqual([
      { kind: 'PARTICIPANT', participantId: 'part-1' },
      { kind: 'PARTICIPANT', participantId: 'part-2' },
    ]);
  });

  it('l’ordre de sortie est DÉTERMINISTE — l’ordre d’entrée ne transparaît pas', () => {
    // Un plan qui change d'ordre d'un appel à l'autre rend illisible tout diff,
    // et fait clignoter le récapitulatif de C.2b sans raison.
    const a = participant({ participantId: 'part-a', sponsorOrgId: 'org-ei-a', regle: REGLE_TNS });
    const b = participant({ participantId: 'part-b', sponsorOrgId: 'org-ei-b', regle: REGLE_TNS });

    const premier = planifierEnvoi({ scope: 'BEFORE', participants: [a, b] });
    const second = planifierEnvoi({ scope: 'BEFORE', participants: [b, a] });

    expect(second.envois).toEqual(premier.envois);
    expect(planifierEnvoi({ scope: 'BEFORE', participants: [a, b] }).envois).toEqual(premier.envois);
  });
});

describe('planifierEnvoi — avertissement « régime incohérent » (cas Florent HAUSSWIRTH)', () => {
  const FLORENT = participant({
    participantId: 'part-florent',
    nomAffiche: 'Florent HAUSSWIRTH',
    sponsorOrgLabel: 'AGENCE MARTIN',
    regle: REGLE_SALARIE,
    signauxDossierPropre: { aLienEiSelfHorsSponsor: true, reglesAutresOrgs: [] },
  });

  it('AVANT : la convention part, le dossier de financement est SIGNALÉ, pas envoyé', () => {
    const { envois, avertissements } = planifierEnvoi({
      scope: 'BEFORE',
      participants: [FLORENT],
    });

    expect(envois.map((e) => e.cle)).toEqual(['CONVENTION:org-agence']);
    expect(avertissements).toEqual([
      {
        participantId: 'part-florent',
        nomAffiche: 'Florent HAUSSWIRTH',
        docType: 'AGEFICE',
        message:
          "Florent HAUSSWIRTH : le financeur rattaché à « AGENCE MARTIN » n'ouvre pas le " +
          'dossier AGEFICE, alors que le dossier de cet apprenant en porte les signaux ' +
          "(entreprise individuelle rattachée, ou autre organisation dont le financeur " +
          "l'ouvre). Corrigez l'organisation commanditaire de l'inscription : rien n'a " +
          "été envoyé pour cette pièce.",
      },
    ]);
  });

  it('un avertissement ne déclenche AUCUN envoi', () => {
    const avecSignal = planifierEnvoi({ scope: 'BEFORE', participants: [FLORENT] });
    const sansSignal = planifierEnvoi({
      scope: 'BEFORE',
      participants: [participant({ participantId: 'part-florent', nomAffiche: 'Florent HAUSSWIRTH' })],
    });

    expect(avecSignal.envois).toEqual(sansSignal.envois);
    expect(avecSignal.avertissements).not.toEqual(sansSignal.avertissements);
  });

  it('les avertissements suivent le SCOPE : l’assiduité se signale côté APRÈS', () => {
    const florentTns = participant({
      participantId: 'part-florent',
      nomAffiche: 'Florent HAUSSWIRTH',
      regle: REGLE_SALARIE,
      signauxDossierPropre: { aLienEiSelfHorsSponsor: false, reglesAutresOrgs: [REGLE_TNS] },
    });

    const avant = planifierEnvoi({ scope: 'BEFORE', participants: [florentTns] });
    expect(avant.avertissements.map((a) => a.docType)).toEqual(['AGEFICE']);

    const apres = planifierEnvoi({ scope: 'AFTER', participants: [florentTns] });
    expect(apres.envois).toEqual([]);
    expect(apres.avertissements.map((a) => a.docType)).toEqual(['ASSIDUITE']);
  });
});

/**
 * Garde de CONTRAT : le plan ignore la facturation.
 *
 * `payerOrg` ne sert qu'à facturer ; la convention reste rattachée à
 * l'organisation bénéficiaire (`sponsorOrg`). Le jour où quelqu'un croira bien
 * faire en résolvant le signataire sur le payeur, ce test le dira — avant que
 * la convention ne parte au comptable d'un tiers.
 */
describe('plan-envoi.ts — la facturation n’entre pas dans le plan', () => {
  const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../plan-envoi.ts');

  it('aucune mention de payeur en position de code', () => {
    const lignes = readFileSync(SOURCE, 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l));

    const fautifs = lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /payer|payeur/i.test(l))
      .map(({ l, i }) => `plan-envoi.ts:${i + 1} → ${l.trim()}`);

    expect(fautifs).toEqual([]);
  });
});
