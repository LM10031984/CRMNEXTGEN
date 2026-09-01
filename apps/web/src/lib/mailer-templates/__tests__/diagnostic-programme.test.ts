/**
 * Le template part chez des PROSPECTS. Trois choses doivent tenir :
 * l'échappement (un nom avec une apostrophe ne casse pas le HTML), l'absence
 * de prix (le tarif dépend du payeur — on ne s'engage pas à l'aveugle), et la
 * couverture des 4 problématiques (aucune ne doit tomber sur une trame vide).
 */

import { describe, it, expect } from 'vitest';
import { renderDiagnosticProgrammeEmail } from '../diagnostic-programme';
import { PROBLEMATIQUES, type ProblematiqueKey } from '@/lib/diagnostic/questions';
import { TRAMES, formatDuree } from '@/lib/diagnostic/programmes';
import type { OfConfig } from '@/lib/of-config';

const OF = {
  name: 'Start Academy',
  addressFull: '12 avenue des Camélias, 06800 Cagnes-sur-Mer',
  siret: '95131909400011',
  rnq: '93061048106',
} as unknown as OfConfig;

const CLES = Object.keys(PROBLEMATIQUES) as ProblematiqueKey[];

describe('renderDiagnosticProgrammeEmail', () => {
  it('couvre les 4 problématiques avec une trame non vide', () => {
    for (const cle of CLES) {
      const trame = TRAMES[cle];
      expect(trame, `${cle} n'a pas de trame`).toBeDefined();
      expect(trame.objectifs.length, `${cle} sans objectif`).toBeGreaterThan(0);
      expect(trame.sequences.length, `${cle} sans déroulé`).toBeGreaterThan(0);
    }
  });

  it("n'annonce jamais de prix", () => {
    for (const cle of CLES) {
      const { html, text, subject } = renderDiagnosticProgrammeEmail(
        { firstName: 'Camille', dominante: cle, secondaire: null },
        OF,
      );
      for (const [nom, contenu] of [['html', html], ['text', text], ['subject', subject]] as const) {
        expect(contenu, `${cle}/${nom} contient un montant`).not.toMatch(/\d\s?(€|EUR)/i);
      }
    }
  });

  it('échappe les valeurs interpolées', () => {
    const { html } = renderDiagnosticProgrammeEmail(
      { firstName: '<script>alert(1)</script>', dominante: 'IA_PRODUCTIVITE', secondaire: null },
      OF,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('mentionne la durée en heures ET en jours', () => {
    const { html } = renderDiagnosticProgrammeEmail(
      { firstName: 'Camille', dominante: 'MANAGEMENT_EQUIPE', secondaire: null },
      OF,
    );
    expect(html).toContain('8 h / 1 jour');
  });

  it('mentionne la problématique secondaire quand elle existe, et se tait sinon', () => {
    const avec = renderDiagnosticProgrammeEmail(
      { firstName: 'Camille', dominante: 'IA_PRODUCTIVITE', secondaire: 'PROSPECTION_MANDATS' },
      OF,
    );
    expect(avec.html).toContain('En prolongement');

    const sans = renderDiagnosticProgrammeEmail(
      { firstName: 'Camille', dominante: 'IA_PRODUCTIVITE', secondaire: null },
      OF,
    );
    expect(sans.html).not.toContain('En prolongement');
  });

  it('porte les mentions de l\'organisme (SIRET, NDA) en pied', () => {
    const { html } = renderDiagnosticProgrammeEmail(
      { firstName: 'Camille', dominante: 'IA_PRODUCTIVITE', secondaire: null },
      OF,
    );
    expect(html).toContain('95131909400011');
    expect(html).toContain('93061048106');
  });
});

describe('formatDuree', () => {
  it('applique la convention 8 h = 1 jour', () => {
    expect(formatDuree(8)).toBe('8 h / 1 jour');
    expect(formatDuree(16)).toBe('16 h / 2 jours');
    expect(formatDuree(72)).toBe('72 h / 9 jours');
  });
});
