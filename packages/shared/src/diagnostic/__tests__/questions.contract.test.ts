import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CHAPTERS } from '../chapters';
import { DIAGNOSTIC_QUESTIONS, REFERENTIAL_VERSION } from '../questions';
import { ANSWER_CATEGORIES } from '../types';

/**
 * Contrat anti-dérive du référentiel — porté du repo diag et étendu aux
 * chapitres 1 & 2 créés pour QualiOF.
 *
 * Ce qu'il protège : `DiagnosticAnswer.questionId` est une clé métier, pas un
 * détail d'implémentation. Renommer un ID orpheline silencieusement toutes les
 * réponses déjà saisies, casse le moteur ratios, et fait mentir un audit déjà
 * remis à un client. Ajouter ou retirer une question est légitime — mais ça se
 * fait en bumpant cette baseline ET `REFERENTIAL_VERSION`, consciemment.
 */

// Chapitres 1 & 2 — créés pour QualiOF (déclaratifs de contexte et financement).
const BASELINE_QUALIOF: ReadonlyArray<readonly [string, number, string]> = [
  ['identity-network', 1, 'text'],
  ['identity-agencies-count', 1, 'int'],
  ['identity-geo-areas', 1, 'text'],
  ['identity-activities', 1, 'multichoice'],
  ['identity-transaction-ancien-percent', 1, 'percent'],
  ['identity-property-types', 1, 'multichoice'],
  ['identity-sales-n1', 1, 'int'],
  ['identity-revenue-n1', 1, 'money'],
  ['identity-revenue-goal', 1, 'money'],
  ['identity-ambition-3y', 1, 'text'],
  ['team-total-count', 2, 'int'],
  ['team-employees-count', 2, 'int'],
  ['team-independents-count', 2, 'int'],
  ['team-assistants-count', 2, 'int'],
  ['team-managers-count', 2, 'int'],
  ['team-directors-count', 2, 'int'],
  ['funding-trainings-24m', 2, 'yesno'],
  ['funding-trainings-24m-detail', 2, 'text'],
  ['funding-agefice-used', 2, 'choice'],
  ['funding-opco-used', 2, 'choice'],
  ['funding-rights-known', 2, 'yesno'],
  ['funding-past-refusals', 2, 'yesno'],
  ['funding-past-refusals-reason', 2, 'text'],
  ['funding-internal-budget', 2, 'yesno'],
  ['funding-internal-budget-amount', 2, 'money'],
];

// Chapitres 3 → 11 — baseline du repo diag, reprise à l'identique.
// 69 questions (passage 71 → 69 par retrait des doublons Ch.3/Ch.4 : les outils
// pige & estimation ne vivent plus qu'en Ch.10).
const BASELINE_PORTED: ReadonlyArray<readonly [string, number, string]> = [
  // Ch.3 — Prospection & entrées vendeurs (8)
  ['prospecting-methods', 3, 'multichoice'],
  ['prospecting-who', 3, 'choice'],
  ['perf-contacts-week', 3, 'int'],
  ['prospecting-contacts-per-month', 3, 'int'],
  ['prospecting-hours-per-week', 3, 'int'],
  ['perf-rate-rdv', 3, 'percent'],
  ['prospecting-script', 3, 'yesno'],
  ['skill-prospection', 3, 'yesno'],
  // Ch.4 — RDV vendeur (9)
  ['seller-meetings-per-month', 4, 'int'],
  ['perf-rate-estimation', 4, 'percent'],
  ['seller-meeting-format', 4, 'choice'],
  ['seller-discovery-formalized', 4, 'yesno'],
  ['estimation-delivery-delay', 4, 'choice'],
  ['seller-written-valuation', 4, 'yesno'],
  ['skill-qualification', 4, 'yesno'],
  ['skill-estimation', 4, 'yesno'],
  ['skill-objections', 4, 'yesno'],
  // Ch.5 — Mandats & exclusivité (8)
  ['mandates-active-stock', 5, 'int'],
  ['mandates-per-month', 5, 'int'],
  ['perf-rate-mandat', 5, 'percent'],
  ['perf-rate-exclusivity', 5, 'percent'],
  ['mandates-exclusivity-percent', 5, 'percent'],
  ['mandates-price-above-market', 5, 'choice'],
  ['skill-price-defense', 5, 'yesno'],
  ['mandates-average-duration-months', 5, 'int'],
  // Ch.6 — Commercialisation & suivi vendeur (3)
  ['commercial-followup-frequency', 6, 'choice'],
  ['commercial-price-drop-per-month-percent', 6, 'percent'],
  ['commercial-requalification-process', 6, 'yesno'],
  // Ch.7 — Acquéreurs (4)
  ['buyers-sources-repartition', 7, 'text'],
  ['buyers-contacts-per-month', 7, 'int'],
  ['buyers-discovery-formalized', 7, 'yesno'],
  ['buyers-financing-verified', 7, 'yesno'],
  // Ch.8 — Visites, offres & transformation (5)
  ['visits-per-month', 8, 'int'],
  ['offers-per-month', 8, 'int'],
  ['compromis-per-month', 8, 'int'],
  ['actes-per-month', 8, 'int'],
  ['chute-compromis-acte-percent', 8, 'percent'],
  // Ch.9 — Base de données & e-réputation (7)
  ['db-volume', 9, 'int'],
  ['db-crm-uptodate', 9, 'choice'],
  ['perf-crm-usage', 9, 'percent'],
  ['db-exploitation', 9, 'multichoice'],
  ['google-reviews-count', 9, 'int'],
  ['google-reviews-score', 9, 'percent'],
  ['reviews-collection-process', 9, 'yesno'],
  // Ch.10 — Outils & IA (16)
  ['tools-metier', 10, 'text'],
  ['tools-estimation', 10, 'text'],
  ['tools-pige', 10, 'text'],
  ['tools-portals', 10, 'multichoice'],
  ['tools-esignature', 10, 'yesno'],
  ['tools-ai-usage', 10, 'multichoice'],
  ['tool-chatgpt-usage', 10, 'text'],
  ['tool-claude-gemini', 10, 'yesno'],
  ['tool-team-access', 10, 'yesno'],
  ['tool-chatgpt-setup', 10, 'yesno'],
  ['tool-chatgpt-instructions', 10, 'yesno'],
  ['tool-prompts-standard', 10, 'yesno'],
  ['tool-anti-hallucination', 10, 'yesno'],
  ['tool-notebooklm', 10, 'yesno'],
  ['tool-notebook-created', 10, 'yesno'],
  ['tool-gamma', 10, 'yesno'],
  // Ch.11 — Management, pilotage & vision (9)
  ['mgmt-team-meeting-frequency', 11, 'choice'],
  ['exec-manager-reporting', 11, 'yesno'],
  ['mgmt-coaching-individual', 11, 'yesno'],
  ['exec-week-structure', 11, 'yesno'],
  ['exec-autonomy', 11, 'yesno'],
  ['mgmt-indicators-followed', 11, 'multichoice'],
  ['mgmt-recruitment', 11, 'yesno'],
  ['mgmt-top3-difficulties', 11, 'text'],
  ['mgmt-top3-priorities', 11, 'text'],
];

const BASELINE = [...BASELINE_QUALIOF, ...BASELINE_PORTED];

describe('Contrat anti-dérive du référentiel de questions', () => {
  it('les 69 questions portées du repo diag sont toutes présentes, ID et type intacts', () => {
    const byId = new Map(DIAGNOSTIC_QUESTIONS.map((q) => [q.id, q]));
    expect(BASELINE_PORTED).toHaveLength(69);
    for (const [id, chapter, type] of BASELINE_PORTED) {
      const found = byId.get(id);
      expect(found, `Question portée ${id} absente du référentiel`).toBeDefined();
      expect(found!.chapter, `Chapitre différent pour ${id}`).toBe(chapter);
      expect(found!.type, `Type de réponse différent pour ${id}`).toBe(type);
    }
  });

  it('les 25 questions Ch.1/Ch.2 créées pour QualiOF sont présentes, ID et type intacts', () => {
    const byId = new Map(DIAGNOSTIC_QUESTIONS.map((q) => [q.id, q]));
    expect(BASELINE_QUALIOF).toHaveLength(25);
    for (const [id, chapter, type] of BASELINE_QUALIOF) {
      const found = byId.get(id);
      expect(found, `Question ${id} absente du référentiel`).toBeDefined();
      expect(found!.chapter, `Chapitre différent pour ${id}`).toBe(chapter);
      expect(found!.type, `Type de réponse différent pour ${id}`).toBe(type);
    }
  });

  it('le référentiel compte exactement 94 questions (25 QualiOF + 69 portées)', () => {
    expect(DIAGNOSTIC_QUESTIONS).toHaveLength(94);
    expect(DIAGNOSTIC_QUESTIONS).toHaveLength(BASELINE.length);
  });

  it("l'ensemble des IDs est strictement égal à la baseline (aucun ajout, retrait ou renommage)", () => {
    const actual = DIAGNOSTIC_QUESTIONS.map((q) => q.id).sort();
    const expected = BASELINE.map(([id]) => id).sort();
    expect(actual).toEqual(expected);
  });

  it('aucun ID en double', () => {
    const ids = DIAGNOSTIC_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la version du référentiel est datée au format AAAA-MM', () => {
    expect(REFERENTIAL_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('Contrat structurel — cohérence interne de chaque question', () => {
  it('chaque question porte une catégorie déclarée dans ANSWER_CATEGORIES', () => {
    const allowed = new Set<string>(ANSWER_CATEGORIES);
    const violations = DIAGNOSTIC_QUESTIONS.filter((q) => !allowed.has(q.category)).map(
      (q) => `${q.id} : catégorie « ${q.category} » inconnue`,
    );
    expect(violations).toEqual([]);
  });

  it('chaque question appartient à un chapitre déclaré dans DIAGNOSTIC_CHAPTERS', () => {
    const known = new Set(DIAGNOSTIC_CHAPTERS.map((c) => c.chapter));
    const violations = DIAGNOSTIC_QUESTIONS.filter((q) => !known.has(q.chapter)).map(
      (q) => `${q.id} : chapitre ${q.chapter} sans métadonnées`,
    );
    expect(violations).toEqual([]);
  });

  it('les 11 chapitres portent au moins une question (aucun écran vide en COMPLET)', () => {
    const withQuestions = new Set(DIAGNOSTIC_QUESTIONS.map((q) => q.chapter));
    const empty = DIAGNOSTIC_CHAPTERS.filter((c) => !withQuestions.has(c.chapter)).map(
      (c) => `Chapitre ${c.chapter} (${c.title}) sans question`,
    );
    expect(empty).toEqual([]);
  });

  it("les questions sont rangées par chapitre croissant (ordre d'affichage = ordre du tableau)", () => {
    const chapters = DIAGNOSTIC_QUESTIONS.map((q) => q.chapter);
    expect(chapters).toEqual([...chapters].sort((a, b) => a - b));
  });

  it('toute question choice/multichoice déclare au moins deux choix', () => {
    const violations = DIAGNOSTIC_QUESTIONS.filter(
      (q) => (q.type === 'choice' || q.type === 'multichoice') && (q.choices?.length ?? 0) < 2,
    ).map((q) => `${q.id} : type ${q.type} sans choix exploitables`);
    expect(violations).toEqual([]);
  });

  it('aucune question non-choice ne déclare de choix (contrat de réponse cohérent)', () => {
    const violations = DIAGNOSTIC_QUESTIONS.filter(
      (q) => q.choices && q.type !== 'choice' && q.type !== 'multichoice',
    ).map((q) => `${q.id} : choices défini sur un type ${q.type}`);
    expect(violations).toEqual([]);
  });

  it('chaque optionLabels couvre 100 % des choix déclarés (aucune valeur orpheline)', () => {
    const violations: string[] = [];
    for (const q of DIAGNOSTIC_QUESTIONS) {
      if (!q.optionLabels) continue;
      const declared = q.choices ?? [];
      if (declared.length === 0) {
        violations.push(`${q.id} : optionLabels défini mais aucun choix déclaré`);
        continue;
      }
      for (const c of declared) {
        if (!(c in q.optionLabels)) {
          violations.push(`${q.id} : valeur « ${c} » sans libellé dans optionLabels`);
        }
      }
      for (const key of Object.keys(q.optionLabels)) {
        if (!declared.includes(key)) {
          violations.push(
            `${q.id} : clé optionLabels « ${key} » absente des choix [${declared.join(', ')}]`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("optionLabels n'est autorisé que sur choice / multichoice", () => {
    const violations = DIAGNOSTIC_QUESTIONS.filter(
      (q) => q.optionLabels && q.type !== 'choice' && q.type !== 'multichoice',
    ).map((q) => `${q.id} : optionLabels sur un type ${q.type}`);
    expect(violations).toEqual([]);
  });

  it("answerLabels n'est autorisé que sur yesno, et expose deux libellés non vides", () => {
    const violations: string[] = [];
    for (const q of DIAGNOSTIC_QUESTIONS) {
      if (!q.answerLabels) continue;
      if (q.type !== 'yesno') {
        violations.push(`${q.id} : answerLabels sur un type ${q.type}`);
        continue;
      }
      if (!q.answerLabels.yes?.trim()) violations.push(`${q.id} : answerLabels.yes vide`);
      if (!q.answerLabels.no?.trim()) violations.push(`${q.id} : answerLabels.no vide`);
    }
    expect(violations).toEqual([]);
  });

  it('showIf et prefillFrom pointent vers une question qui existe', () => {
    const ids = new Set(DIAGNOSTIC_QUESTIONS.map((q) => q.id));
    const violations: string[] = [];
    for (const q of DIAGNOSTIC_QUESTIONS) {
      if (q.showIf && !ids.has(q.showIf.questionId)) {
        violations.push(`${q.id} : showIf vers « ${q.showIf.questionId} » qui n'existe pas`);
      }
      if (q.prefillFrom && !ids.has(q.prefillFrom.questionId)) {
        violations.push(
          `${q.id} : prefillFrom vers « ${q.prefillFrom.questionId} » qui n'existe pas`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("une question conditionnelle ne dépend jamais d'une question posée APRÈS elle", () => {
    // Sinon l'écran du chapitre N attend une réponse du chapitre N+1 : la
    // question ne s'afficherait jamais en saisie linéaire.
    const position = new Map(DIAGNOSTIC_QUESTIONS.map((q, i) => [q.id, i]));
    const violations: string[] = [];
    for (const [i, q] of DIAGNOSTIC_QUESTIONS.entries()) {
      for (const dep of [q.showIf?.questionId, q.prefillFrom?.questionId]) {
        if (!dep) continue;
        const at = position.get(dep);
        if (at !== undefined && at > i) {
          violations.push(`${q.id} dépend de ${dep}, qui est posée après elle`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('chaque question porte un libellé et un hint commercial exploitables', () => {
    const violations: string[] = [];
    for (const q of DIAGNOSTIC_QUESTIONS) {
      if (!q.question?.trim()) violations.push(`${q.id} : libellé vide`);
      // Le hint est le script oral du commercial : sans lui, la question n'est
      // pas posable en rendez-vous.
      if (!q.hint?.trim()) violations.push(`${q.id} : hint commercial manquant`);
    }
    expect(violations).toEqual([]);
  });
});

describe("Contrat — libellés écrits pour le rapport d'audit", () => {
  it('chaque question a un intitulé écrit, distinct de la question orale', async () => {
    const { AUDIT_LABELS } = await import('../audit-labels');
    const missing = DIAGNOSTIC_QUESTIONS.filter((q) => !AUDIT_LABELS[q.id]).map((q) => q.id);
    expect(
      missing,
      `Sans libellé écrit, ces questions apparaîtraient dans l'audit sous leur formulation orale : ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it("n'expose aucun libellé orphelin", async () => {
    const { AUDIT_LABELS } = await import('../audit-labels');
    const ids = new Set(DIAGNOSTIC_QUESTIONS.map((q) => q.id));
    const orphans = Object.keys(AUDIT_LABELS).filter((id) => !ids.has(id));
    expect(orphans).toEqual([]);
  });

  it('les intitulés écrits restent courts — ils tiennent dans une colonne de tableau', async () => {
    const { AUDIT_LABELS } = await import('../audit-labels');
    const tooLong = Object.entries(AUDIT_LABELS)
      .filter(([, label]) => label.length > 60)
      .map(([id]) => id);
    expect(tooLong).toEqual([]);
  });
});
