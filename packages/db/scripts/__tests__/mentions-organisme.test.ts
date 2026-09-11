/**
 * Lot 1 du nettoyage de l'extraction Drive — les MENTIONS D'ORGANISME sortent
 * des déroulés de modules (tâche 260911-kwf).
 *
 * Le gabarit Qualiopi de Start Academy se termine par deux lignes administratives
 * — « QCM évaluation des acquis », « Questionnaire de satisfaction et clôture de
 * la formation » — et parfois par les états de service des formateurs. L'extraction
 * les a avalées comme des puces du déroulé. Elles ont déjà leur place légitime
 * ailleurs : la section « Modalités d'évaluation » du programme composé, portée par
 * l'organisme. Dans un déroulé remis à un financeur, c'est du doublon.
 *
 * Ce que ces tests protègent, et c'est tout l'enjeu du lot : un motif trop large
 * (une recherche de sous-chaîne sur « QCM » ou sur « satisfaction ») détruirait de
 * vraies étapes pédagogiques. D'où la famille 2, aussi importante que la famille 1 :
 * elle nomme, une par une, les lignes qui doivent SURVIVRE.
 *
 * Aucun I/O réel : on lit l'instantané JSON commité (`data/drive-programmes-catalog.json`),
 * jamais la base, jamais le réseau, jamais le Drive.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
  normaliserLigne,
  estMentionOrganisme,
  retirerMentionsOrganisme,
  nEstQueDesMentions,
  doitProtegerLeContenu,
} from '../lib/mentions-organisme.js';

// ─────────────────────────────────────────────────────────────────────────────
// L'instantané commité — la source de vérité de ce lot
// ─────────────────────────────────────────────────────────────────────────────

type ModuleInstantane = {
  sourceRef: string;
  order: number;
  title: string;
  contentMd: string;
  durationMin: number | null;
};
type ProgrammeInstantane = {
  sourceRef: string;
  title: string;
  modules: ModuleInstantane[];
  warnings: string[];
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHEMIN_INSTANTANE = path.resolve(HERE, '../data/drive-programmes-catalog.json');

const instantane = JSON.parse(readFileSync(CHEMIN_INSTANTANE, 'utf8')) as {
  extractedAt: string;
  programmes: ProgrammeInstantane[];
};

const TOUS_LES_MODULES: ModuleInstantane[] = instantane.programmes.flatMap((p) => p.modules);

function moduleDe(sourceRef: string): ModuleInstantane {
  const m = TOUS_LES_MODULES.find((x) => x.sourceRef === sourceRef);
  if (!m) throw new Error(`Module ${sourceRef} absent de l'instantané — la fixture a bougé.`);
  return m;
}

function programmeDe(sourceRef: string): ProgrammeInstantane {
  const p = instantane.programmes.find((x) => x.sourceRef === sourceRef);
  if (!p) throw new Error(`Programme ${sourceRef} absent de l'instantané — la fixture a bougé.`);
  return p;
}

/** Les 4 modules FANTÔMES : leur déroulé n'est QUE le pied de page. */
const FANTOMES = ['drive:010#2', 'drive:014#4', 'drive:027#2', 'drive:038#3'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Famille 1 — les formes à retirer
// ─────────────────────────────────────────────────────────────────────────────
//
// Les 13 formes relevées sur les données réelles le 11/09/2026, avec leur compte,
// plus les variantes que le filtre doit tolérer : les DEUX apostrophes (droite
// U+0027 et courbe U+2019), la présence ou l'absence de « d' », la ponctuation
// finale (`.` `;` `:` ou rien), les espaces surnuméraires, la puce Markdown.

const FORMES_A_RETIRER: { forme: string; releve: string }[] = [
  // ── Les 13 formes exactes de l'instantané, dans l'ordre de leur compte ──
  { forme: 'Questionnaire de satisfaction et clôture de la formation.', releve: '26 occurrences' },
  { forme: 'QCM évaluation des acquis ;', releve: '22 occurrences' },
  { forme: 'Questionnaire de satisfaction et clôture de la formation', releve: '19 occurrences' },
  { forme: "QCM d'évaluation des acquis", releve: "18 occurrences, apostrophe DROITE U+0027" },
  { forme: 'QCM évaluation des acquis', releve: '5 occurrences' },
  {
    forme:
      "Tous les formateurs de l’équipe Start-Academy ont minimum 8 années d'expérience dans l'immobilier, notamment dans le domaine de la vente de biens, de formation d'agents et de coaching individuel.",
    releve: '3 occurrences — drive:016#3, drive:034#3, drive:039#3 (le cas « Gérer les objections »)',
  },
  { forme: 'QCM d’évaluation des acquis :', releve: '2 occurrences, apostrophe COURBE U+2019' },
  { forme: 'QCM d’évaluation des acquis.', releve: '1 occurrence' },
  { forme: 'QCM d’évaluation des acquis', releve: '1 occurrence, apostrophe COURBE' },
  {
    forme: 'QCM d’évaluation des acquis et questionnaire de satisfaction.',
    releve: '1 occurrence — les deux familles soudées, zéro pédagogie',
  },
  { forme: 'Questionnaire de satisfaction et clôture de la formation :', releve: '1 occurrence' },
  { forme: 'Questionnaire de satisfaction', releve: '1 occurrence, forme NUE — drive:062#2' },
  { forme: 'QCM final', releve: '1 occurrence — bloc de clôture de drive:062#2' },

  // ── Les variantes que le filtre doit tolérer ──
  { forme: '- QCM évaluation des acquis ;', releve: 'variante : puce Markdown de tête' },
  { forme: '* Questionnaire de satisfaction et clôture de la formation.', releve: 'variante : puce astérisque' },
  { forme: '  QCM   évaluation des acquis ;  ', releve: 'variante : espaces surnuméraires' },
  { forme: "QCM d'évaluation des acquis ;", releve: 'variante : apostrophe droite + point-virgule' },
  { forme: "QCM d'évaluation des acquis.", releve: 'variante : apostrophe droite + point' },
  { forme: "QCM d'évaluation des acquis :", releve: 'variante : apostrophe droite + deux-points' },
  { forme: 'QCM évaluation des acquis.', releve: 'variante : sans « d’ » + point' },
  { forme: 'QCM évaluation des acquis :', releve: 'variante : sans « d’ » + deux-points' },
  { forme: 'QCM final.', releve: 'variante : ponctuation finale' },
  { forme: 'Questionnaire de satisfaction.', releve: 'variante : forme nue + point' },
  { forme: 'Questionnaire de satisfaction ;', releve: 'variante : forme nue + point-virgule' },
  {
    forme: 'Questionnaire de satisfaction et clôture de la formation ;',
    releve: 'variante : point-virgule',
  },
  {
    forme: "QCM d'évaluation des acquis et questionnaire de satisfaction",
    releve: 'variante : apostrophe droite, sans ponctuation',
  },
];

describe("Famille 1 — les mentions d'organisme sont reconnues", () => {
  it.each(FORMES_A_RETIRER)('« $forme » → mention ($releve)', ({ forme }) => {
    expect(estMentionOrganisme(forme)).toBe(true);
  });

  it('normaliserLigne retire la puce, unifie les apostrophes, coupe la ponctuation et les accents', () => {
    expect(normaliserLigne("- QCM d’évaluation des acquis ;")).toBe("qcm d'evaluation des acquis");
    expect(normaliserLigne('  Questionnaire   de satisfaction  et clôture de la formation.  ')).toBe(
      'questionnaire de satisfaction et cloture de la formation',
    );
  });

  it('une ligne vide ou blanche n’est pas une mention', () => {
    expect(estMentionOrganisme('')).toBe(false);
    expect(estMentionOrganisme('   ')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Famille 2 — la pédagogie voisine survit intacte
// ─────────────────────────────────────────────────────────────────────────────

const LIGNES_A_PRESERVER: { ligne: string; pourquoi: string }[] = [
  {
    ligne:
      'Évaluation de fin de session : Mini-questionnaire ou QCM rapide pour valider la compréhension des concepts.',
    pourquoi: 'étape pédagogique — un filtre sur « QCM » la détruirait',
  },
  {
    ligne:
      'Évaluation de fin de session : QCM ou mini-évaluation pour valider la compréhension des points abordés.',
    pourquoi: 'étape pédagogique',
  },
  {
    ligne:
      'Évaluation de fin de session : Mini-QCM ou auto-évaluation pour valider la compréhension des procédures de déclaration et des obligations TRACFIN.',
    pourquoi: 'étape pédagogique',
  },
  { ligne: 'Évaluation intermédiaire : QCM ou auto-évaluation', pourquoi: 'étape pédagogique' },
  { ligne: 'Évaluation intermédiaire : mini QCM ou étude de cas', pourquoi: 'étape pédagogique' },
  { ligne: 'Évaluation intermédiaire : simulation + mini QCM', pourquoi: 'étape pédagogique' },
  {
    ligne: 'Quiz final interactif pour valider les acquis.',
    pourquoi: 'quiz pédagogique — ne pas confondre avec « QCM final », qui est du gabarit',
  },
  {
    ligne: 'Activité pratique : Quiz final interactif pour valider les acquis.',
    pourquoi: 'forme réelle dans l’instantané',
  },
  { ligne: 'Quiz express : « Quel est ton profil de prospecteur ? »', pourquoi: 'quiz pédagogique' },
  { ligne: 'Quiz interactif.', pourquoi: 'quiz pédagogique' },
  { ligne: 'Quiz final.', pourquoi: 'quiz pédagogique — voisin immédiat de « QCM final »' },
  { ligne: 'Quiz de validation des connaissances', pourquoi: 'quiz pédagogique' },
  { ligne: 'QUIZZ Final : (0h30)', pourquoi: 'titre de bloc pédagogique — drive:058#6' },
  { ligne: 'Feedback personnalisé du formateur', pourquoi: 'étape pédagogique' },
  { ligne: 'Partage des productions + coaching du formateur', pourquoi: 'étape pédagogique' },
  {
    ligne:
      'Les formateurs proposeront des mises en situation professionnelles sur les techniques de prospection, les discours et la posture ainsi que des échanges sur les pratiques actuelles.',
    pourquoi: 'MOYEN PÉDAGOGIQUE de drive:058#6 — hors des 3 familles de ce lot',
  },
  {
    ligne:
      'Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.',
    pourquoi: 'MOYEN PÉDAGOGIQUE de drive:058#6 — hors des 3 familles de ce lot',
  },
  {
    ligne: 'Remise des attestations',
    pourquoi: 'mention probable mais HORS des 3 familles nommées par Laurent — laissée et signalée',
  },
  {
    ligne: 'Remise des attestations de formation',
    pourquoi: 'idem — laissée et signalée',
  },
  { ligne: 'Remise de l’attestation.', pourquoi: 'idem — laissée et signalée' },
  {
    ligne: 'Clôture de la formation (30 min)',
    pourquoi: 'titre de bloc horodaté de drive:062#2 — porte une durée, donc de la pédagogie',
  },
  {
    ligne:
      'Traces de chaque exercice, contrôles 7C, PTP et VRAI, quiz décisionnel, dossier final et engagement à 24 heures.',
    pourquoi: 'contenu métier qui nomme un quiz',
  },
];

describe('Famille 2 — la pédagogie voisine survit', () => {
  it.each(LIGNES_A_PRESERVER)('« $ligne » reste ($pourquoi)', ({ ligne }) => {
    expect(estMentionOrganisme(ligne)).toBe(false);
  });
});

// Les 3 lignes MIXTES — la mention y est SOUDÉE à de la pédagogie dans la même
// phrase. Les retirer en entier détruirait du contenu ; les réécrire serait un
// arbitrage que Laurent n'a pas donné (il a dit : suppression pure, aucun
// arbitrage nécessaire). Elles restent, et elles sont SIGNALÉES dans le compte
// rendu. Le jour où ce test tombera, la raison doit se lire ici.
const LIGNES_MIXTES: { ligne: string; ou: string }[] = [
  {
    ligne: 'Clôture et questionnaire de satisfaction. Feedback et Questions/Réponses',
    ou: 'drive:024#11',
  },
  {
    ligne: 'Clôture et questionnaire de satisfaction. Feedback et Questions/Réponses',
    ou: 'drive:028#6',
  },
  {
    ligne:
      'Clôture de la formation : Résumé des points clés, remise des certificats de formation et évaluation de la satisfaction des participants.',
    ou: 'drive:055#10',
  },
];

describe('Famille 2 bis — les 3 lignes mixtes sont laissées et signalées', () => {
  it.each(LIGNES_MIXTES)('$ou : la mention soudée à de la pédagogie reste', ({ ligne }) => {
    expect(estMentionOrganisme(ligne)).toBe(false);
  });

  it('aucun des 3 modules mixtes ne perd de ligne', () => {
    for (const ref of ['drive:024#11', 'drive:028#6', 'drive:055#10']) {
      const m = moduleDe(ref);
      const { contentMd, retirees } = retirerMentionsOrganisme(m.contentMd);
      expect(retirees, `${ref} ne doit rien perdre`).toEqual([]);
      expect(contentMd).toBe(m.contentMd);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Famille 3 — faros:SA-ADM-M001#1 « LIVRABLE 001 » sort INTACT
// ─────────────────────────────────────────────────────────────────────────────
//
// Ce module ENSEIGNE le montage du dossier AGEFICE/CFP. Il parle donc
// légitimement d'attestation, d'émargement et du « nom du formateur ». Un filtre
// sur ces mots y détruirait 855 lignes de contenu réel.

describe('Famille 3 — faros:SA-ADM-M001#1 sort intact', () => {
  const faros = moduleDe('faros:SA-ADM-M001#1');

  it('aucune ligne retirée, contentMd identique au départ', () => {
    const { contentMd, retirees } = retirerMentionsOrganisme(faros.contentMd);
    expect(retirees).toEqual([]);
    expect(contentMd).toBe(faros.contentMd);
  });

  it('le déroulé garde ses lignes légitimes sur attestation, émargement et nom du formateur', () => {
    const { contentMd } = retirerMentionsOrganisme(faros.contentMd);
    expect(contentMd).toContain('attestation');
    expect(contentMd).toContain('émargement');
    expect(contentMd).toContain('nom du formateur');
    expect(contentMd.split('\n').length).toBe(faros.contentMd.split('\n').length);
  });

  it('nEstQueDesMentions est faux sur un vrai déroulé', () => {
    expect(nEstQueDesMentions(faros.contentMd)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Famille 4 — les modules entièrement faits de mentions, et le non-retour
// ─────────────────────────────────────────────────────────────────────────────

const PIED_DE_PAGE_SEUL = ['- QCM évaluation des acquis ;', '- Questionnaire de satisfaction et clôture de la formation.'].join('\n');

describe('Famille 4 — modules entièrement faits de mentions', () => {
  it('sur fixture : contentMd vide, 2 lignes retirées, nEstQueDesMentions vrai', () => {
    const { contentMd, retirees } = retirerMentionsOrganisme(PIED_DE_PAGE_SEUL);
    expect(contentMd).toBe('');
    expect(retirees).toHaveLength(2);
    expect(nEstQueDesMentions(PIED_DE_PAGE_SEUL)).toBe(true);
  });

  it('nEstQueDesMentions est faux sur un contenu vide au départ — il n’y avait rien à vider', () => {
    expect(nEstQueDesMentions('')).toBe(false);
    expect(nEstQueDesMentions(null)).toBe(false);
    expect(nEstQueDesMentions(undefined)).toBe(false);
  });

  // LE test de non-retour : l'instantané commité ne porte plus AUCUNE mention.
  it("l'instantané commité ne porte plus aucune mention d'organisme dans un déroulé", () => {
    const coupables: string[] = [];
    for (const m of TOUS_LES_MODULES) {
      for (const ligne of (m.contentMd ?? '').split('\n')) {
        if (estMentionOrganisme(ligne)) coupables.push(`${m.sourceRef} : ${ligne}`);
      }
    }
    expect(coupables).toEqual([]);
  });

  it.each(FANTOMES)('%s sort avec un déroulé VIDE (module fantôme né du pied de page)', (ref) => {
    expect(moduleDe(ref).contentMd.trim()).toBe('');
  });

  it.each(FANTOMES)('le programme de %s porte un warning qui NOMME le module vidé', (ref) => {
    const progRef = ref.split('#')[0]!;
    const warnings = programmeDe(progRef).warnings;
    expect(warnings.some((w) => w.includes(ref))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Famille 5 — la garde d'import protège la PÉDAGOGIE, pas le boilerplate
// ─────────────────────────────────────────────────────────────────────────────
//
// Non-régression obligatoire : drive:047#20 « Atelier pratique : Simulation de
// réponse aux avis clients » est un déroulé écrit à la main par Laurent (1540
// caractères en base, contentMd vide dans l'instantané). Il doit rester protégé.

const DEROULE_ECRIT_PAR_LAURENT = [
  "**Objectif.** À l'issue, le stagiaire est capable de formuler une demande d'avis adaptée à chaque moment de satisfaction rencontré dans son activité, et de rédiger puis publier une réponse à un avis — positif ou négatif — conforme au cadre légal et fidèle à sa voix.",
  '',
  "- **Rappel du cadre (10 min).** Ce qu'on ne fait jamais, et ce qu'on vérifie avant de publier : aucune donnée confidentielle, aucun ton défensif, jamais deux réponses identiques.",
  "- **Série 1 — demander (25 min).** Trois situations tirées de leur semaine réelle : un client qui vient de dire « vous avez fait un travail sérieux » en fin d'estimation, un acquéreur accompagné qui n'a rien acheté chez eux, un propriétaire en gestion depuis des années. Chacun écrit sa demande pour les trois, s'aide de ChatGPT, puis corrige pour que ça sonne comme lui.",
  "- **Série 2 — les avis positifs (25 min).** Trois avis réels de son agence. Réponse courte, personnalisée. Lecture croisée en binôme : on repère les tournures qui se répètent d'une réponse à l'autre.",
  "- **Série 3 — les avis négatifs (40 min).** Trois cas : le reproche fondé, le reproche injuste, et l'avis qui ne concerne pas le conseiller. Écriture, lecture à voix haute, correction collective. On travaille le passage en privé sans se justifier en public.",
].join('\n');

describe("Famille 5 — doitProtegerLeContenu", () => {
  it('un vrai déroulé en base (drive:047#20) face à un entrant vide → PROTÉGÉ', () => {
    expect(DEROULE_ECRIT_PAR_LAURENT.length).toBeGreaterThanOrEqual(1000);
    expect(doitProtegerLeContenu(DEROULE_ECRIT_PAR_LAURENT, '')).toBe(true);
    expect(doitProtegerLeContenu(DEROULE_ECRIT_PAR_LAURENT, null)).toBe(true);
    expect(doitProtegerLeContenu(DEROULE_ECRIT_PAR_LAURENT, '   \n  ')).toBe(true);
  });

  it('une base qui ne porte que le boilerplate face à un entrant vide → rien à protéger', () => {
    expect(doitProtegerLeContenu(PIED_DE_PAGE_SEUL, '')).toBe(false);
  });

  it('base non vide + entrant non vide → pas de protection, un remplacement reste permis', () => {
    expect(doitProtegerLeContenu(DEROULE_ECRIT_PAR_LAURENT, '- Nouveau déroulé du Drive.')).toBe(
      false,
    );
  });

  it('base vide + entrant vide → pas de protection', () => {
    expect(doitProtegerLeContenu('', '')).toBe(false);
    expect(doitProtegerLeContenu(null, null)).toBe(false);
    expect(doitProtegerLeContenu(undefined, undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Famille 6 — idempotence
// ─────────────────────────────────────────────────────────────────────────────

describe('Famille 6 — idempotence', () => {
  it('repasser un contentMd déjà filtré ne change rien (fixture)', () => {
    const brut = [
      '- Accueil des participants et tour de table.',
      '- QCM évaluation des acquis ;',
      '- Atelier pratique en binôme.',
      '- Questionnaire de satisfaction et clôture de la formation.',
    ].join('\n');
    const premier = retirerMentionsOrganisme(brut);
    expect(premier.retirees).toHaveLength(2);

    const second = retirerMentionsOrganisme(premier.contentMd);
    expect(second.contentMd).toBe(premier.contentMd);
    expect(second.retirees).toEqual([]);
  });

  it('repasser tous les modules de l’instantané ne retire plus rien', () => {
    for (const m of TOUS_LES_MODULES) {
      const { contentMd, retirees } = retirerMentionsOrganisme(m.contentMd);
      expect(retirees, `${m.sourceRef} devrait déjà être filtré`).toEqual([]);
      expect(contentMd).toBe(m.contentMd);
    }
  });
});
