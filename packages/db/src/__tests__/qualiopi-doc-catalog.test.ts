import { describe, it, expect } from 'vitest';

/**
 * Phase 9.3 (plan 09.3-02) — test de mapping du référentiel QualiopiDocCatalog.
 *
 * Verrouille le triage des 5 DocType fantômes et les corrections
 * d'indicateurs actées par le plan directeur (Partie 1, Bloc A) contre
 * la grille BCI / le guide de lecture V9 / QUALIOPI-PLAN-COMPLET §1.
 *
 * NOTE passation : les trois sources d'opposabilité vivent sur le poste
 * de Laurent (.planning/audit/, non poussées). Ce test verrouille les
 * décisions EXPLICITES du plan directeur ; le recoupement « 0 drift »
 * complet reste à rejouer contre la grille BCI réelle.
 */

import {
  QUALIOPI_DOC_CATALOG,
  RETIRED_DOC_CATALOG_TYPES,
} from '../qualiopi-doc-catalog';

const byType = new Map(QUALIOPI_DOC_CATALOG.map((d) => [d.type, d]));

describe('QualiopiDocCatalog — triage des 5 fantômes', () => {
  it('SATISFACTION est fusionné en SATISFACTION_CHAUD + SATISFACTION_FROID (ind. 30)', () => {
    expect(byType.has('SATISFACTION')).toBe(false);
    expect(byType.get('SATISFACTION_CHAUD')?.qualiopiIndicator).toBe('Indicateur 30');
    expect(byType.get('SATISFACTION_FROID')?.qualiopiIndicator).toBe('Indicateur 30');
  });

  it('PRE_ACCORD_OPCO et VALIDATION_OPCO sortent du catalogue (jalons OpcoSubmission)', () => {
    expect(byType.has('PRE_ACCORD_OPCO')).toBe(false);
    expect(byType.has('VALIDATION_OPCO')).toBe(false);
    expect(RETIRED_DOC_CATALOG_TYPES).toContain('PRE_ACCORD_OPCO');
    expect(RETIRED_DOC_CATALOG_TYPES).toContain('VALIDATION_OPCO');
    expect(RETIRED_DOC_CATALOG_TYPES).toContain('SATISFACTION');
  });

  it('SUPPORT_PEDAGOGIQUE est conservé sous l’indicateur 19, upload manuel', () => {
    const support = byType.get('SUPPORT_PEDAGOGIQUE');
    expect(support?.qualiopiIndicator).toBe('Indicateur 19');
    expect(support?.description).toMatch(/upload manuel/i);
  });

  it('CUSTOM est conservé en upload libre (sans indicateur, non obligatoire)', () => {
    const custom = byType.get('CUSTOM');
    expect(custom).toBeDefined();
    expect(custom?.qualiopiIndicator).toBeNull();
    expect(custom?.isMandatory).toBe(false);
  });
});

describe('QualiopiDocCatalog — corrections d’indicateurs actées', () => {
  it('CONVENTION : tag primaire Indicateur 9 (grille BCI — doc + transmission contrôlés sous ind. 9)', () => {
    expect(byType.get('CONVENTION')?.qualiopiIndicator).toBe('Indicateur 9');
  });

  it('mapping stable des indicateurs restants (anti-drift)', () => {
    expect(byType.get('PROGRAMME')?.qualiopiIndicator).toBe('Indicateur 9');
    expect(byType.get('EMARGEMENT')?.qualiopiIndicator).toBe('Indicateur 12');
    expect(byType.get('ASSIDUITE')?.qualiopiIndicator).toBe('Indicateur 12');
    expect(byType.get('EVALUATION_ACQUIS')?.qualiopiIndicator).toBe('Indicateur 11');
    expect(byType.get('ATTESTATION_FIN')?.qualiopiIndicator).toBe('Indicateur 11');
    expect(byType.get('CERTIFICAT_REALISATION')?.qualiopiIndicator).toBe('Légal Art. L6353-1');
    expect(byType.get('AGEFICE')?.qualiopiIndicator).toBe('Indicateur 7');
  });
});

describe('QualiopiDocCatalog — invariants structurels', () => {
  it('aucun doublon de type', () => {
    expect(byType.size).toBe(QUALIOPI_DOC_CATALOG.length);
  });

  it('aucun type retiré ne figure dans le catalogue actif', () => {
    for (const retired of RETIRED_DOC_CATALOG_TYPES) {
      expect(byType.has(retired)).toBe(false);
    }
  });

  it('chaque entrée a un nom et une phase valides', () => {
    for (const entry of QUALIOPI_DOC_CATALOG) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(['Pré-formation', 'Formation', 'Post-formation', 'Administratif']).toContain(
        entry.phase,
      );
    }
  });
});
