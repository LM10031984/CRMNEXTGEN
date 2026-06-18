import { describe, it, expect } from 'vitest';
import { renderDerouleHtml, type DerouleContent } from '../deroule-template';
import type { ClosureContext } from '../shared-template';

/**
 * Câblage narratif > pool du « Rapport formateur » du déroulé + test de puissance
 * anti-« prompts ». renderBilanFormateur est PRIVÉ → on teste via renderDerouleHtml.
 *
 * Contexte minimal castable : sessionTrainers: [] → loadTrainerSignatureDataUrl
 * renvoie '' sans IO disque (pas de mock nécessaire).
 */
const ctx = {
  sessionTitle: 'Lutte anti-blanchiment Tracfin',
  sessionTrainers: [],
  tenantId: 't1',
  sessionStartDate: new Date('2026-01-12'),
  sessionEndDate: new Date('2026-01-12'),
} as unknown as ClosureContext;

function seq() {
  return {
    duree: '9h00–10h30 (1h30)',
    objectifs: 'Identifier les obligations déclaratives applicables.',
    contenu: 'Cadre réglementaire et acteurs de la lutte anti-blanchiment.',
    outils: 'Diaporama, fiche technique',
    exercice: 'Étude de cas en binômes (15 min + débrief)',
    evaluation: 'Acquis évalués au QCM Kahoot final',
    isPause: false,
  };
}

const baseContent: DerouleContent = {
  jours: [{ theme: 'Jour 1 — Cadre réglementaire Tracfin', sequences: [seq(), seq(), seq(), seq(), seq()] }],
};

describe('rapport formateur — narratif LLM vs pool', () => {
  it('(a) rend les narratifs distinctifs fournis (pas le pool)', () => {
    const content: DerouleContent = {
      ...baseContent,
      rapportFormateur: {
        adaptations: 'ADAPT_DISTINCTIF_XYZ',
        remarquesGroupe: 'REMARQUE_DISTINCTIVE_XYZ',
        bilan: 'BILAN_DISTINCTIF_XYZ',
      },
    };
    const html = renderDerouleHtml(ctx, content);
    expect(html).toContain('ADAPT_DISTINCTIF_XYZ');
    expect(html).toContain('REMARQUE_DISTINCTIVE_XYZ');
    expect(html).toContain('BILAN_DISTINCTIF_XYZ');
  });

  it('(b) test de puissance — le texte « prompts » du pool est ABSENT quand un narratif est fourni', () => {
    const content: DerouleContent = {
      ...baseContent,
      rapportFormateur: {
        adaptations: 'ADAPT_DISTINCTIF_XYZ',
        remarquesGroupe: 'REMARQUE_DISTINCTIVE_XYZ',
        bilan: 'BILAN_DISTINCTIF_XYZ',
      },
    };
    const html = renderDerouleHtml(ctx, content);
    expect(html).not.toContain('prompts');
  });

  it('(c) sans narratif → fallback pool + 7 critères toujours rendus', () => {
    const html = renderDerouleHtml(ctx, baseContent);
    expect(html).toContain('Bilan de la formation');
    // Au moins un narratif de pool BILAN doit être présent (fallback déterministe).
    const poolMatch =
      html.includes('Objectifs pédagogiques atteints') ||
      html.includes('Formation menée à son terme') ||
      html.includes('Ensemble des objectifs traités');
    expect(poolMatch).toBe(true);
    // 7 critères de ratings toujours rendus (déterministes, inchangés).
    expect(html).toContain('Questionnaire de satisfaction du formateur');
  });
});
