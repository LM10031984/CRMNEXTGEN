import { describe, it, expect } from 'vitest';
import { processSheetRows, SHEET_THEME_MAP } from '../import-veille-from-xlsx';

/**
 * Phase 13 Plan 13-01 Task 0 (Wave 0) — tests RED pour le mapping xlsx → Prisma.
 *
 * Couvre VEILLE-01 : "Import xlsx mappe 5 sheets vers les 4 thèmes correctement".
 *
 * Stratégie : fixtures inline (matrices `string|null[][]`) imitant la sortie
 * de `XLSX.utils.sheet_to_json(sheet, { header: 1 })`. On passe à
 * `processSheetRows(rows, theme, headerRow, hasDualExploitation)` et on vérifie
 * la structure des entrées normalisées.
 *
 * Sheets ciblés (cf. RESEARCH §5.2) :
 *  - "23-Veille Formation pro"        : INDIC_23, header row 2, single exploitation
 *  - "26 - Veille Handicap"           : INDIC_26, header row 0, dual exploitation
 *  - "24- secteur dactivité"          : INDIC_24, header row 2, single exploitation
 *  - "25- Innovations péda et techno" : INDIC_25, header row 2 (or dual via dateLastReviewed)
 *  - "26-Veille DREETS PACA"          : INDIC_26 (2e batch), header row 0, dual exploitation
 */

describe('processSheetRows — mapping xlsx → Prisma (Plan 13-01)', () => {
  it('Test 1 — sheet INDIC_23 (header row 2, single exploitation) extrait titre + responsable normalisé', () => {
    const rows: (string | null)[][] = [
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, 'Titre de la source', 'Lien', 'Mode de suivi', 'Type de source', 'Information suivi par', 'Fréquence', 'Exploitations'],
      [null, 'Ministère du travail', 'https://travail-emploi.gouv.fr/', 'consultation régulière', 'Site web institutionnel', 'LAURENT', 'Régulière', 'Exploitation 1'],
      [null, 'Centre Inffo', 'https://www.centre-inffo.fr/', 'Newsletter', 'Site institutionnel', 'Julien', 'Mensuelle', null],
    ];

    const out = processSheetRows(rows, 'INDIC_23', 2, false);
    expect(out).toHaveLength(2);
    expect(out[0]?.title).toBe('Ministère du travail');
    expect(out[0]?.url).toBe('https://travail-emploi.gouv.fr/');
    expect(out[0]?.responsable).toBe('Laurent'); // normalisation "LAURENT" → "Laurent"
    expect(out[0]?.frequency).toBe('Régulière');
    expect(out[0]?.exploitation).toBe('Exploitation 1');
    expect(out[0]?.rawSnippet).toBeNull(); // single layout
    expect(out[1]?.title).toBe('Centre Inffo');
    expect(out[1]?.exploitation).toBeNull();
  });

  it('Test 2 — sheet INDIC_26 (header row 0, dual exploitation) sépare rawSnippet (col 6) et exploitation (col 8)', () => {
    const rows: (string | null)[][] = [
      ['Titre de la source', 'Lien', 'Mode de suivi', 'Type de source', 'Information suivi par', 'Fréquence', 'Exploitations', 'date de la mise en place', 'Exploitation'],
      [
        'Chiffres clés DREETS PACA',
        'https://paca.dreets.gouv.fr/',
        'Newsletter, Flux RSS',
        'Site institutionnel',
        'Laurent',
        'Annuelle',
        'Description brute panorama régional',
        '29/11/2024',
        'Utilisation des données pour notre rapport',
      ],
    ];

    const out = processSheetRows(rows, 'INDIC_26', 0, true);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Chiffres clés DREETS PACA');
    expect(out[0]?.rawSnippet).toBe('Description brute panorama régional');
    expect(out[0]?.exploitation).toBe('Utilisation des données pour notre rapport');
    expect(out[0]?.dateLastReviewed).not.toBeNull();
    expect(out[0]?.dateLastReviewed?.getFullYear()).toBe(2024);
    expect(out[0]?.dateLastReviewed?.getMonth()).toBe(10); // novembre (0-indexed)
    expect(out[0]?.dateLastReviewed?.getDate()).toBe(29);
  });

  it('Test 3 — sheet INDIC_24 (header row 2, single exploitation) mappe correctement', () => {
    const rows: (string | null)[][] = [
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      [null, 'Titre de la source', 'Lien', 'Mode de suivi', 'mode de diffusion', 'Information suivi par', 'Fréquence', 'Exploitations', null],
      [null, 'Immobilier 2.0', 'https://immo2.pro/', 'Newsletter', null, 'LAURENT', 'Réguliere', null, null],
    ];

    const out = processSheetRows(rows, 'INDIC_24', 2, false);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Immobilier 2.0');
    expect(out[0]?.responsable).toBe('Laurent');
    expect(out[0]?.frequency).toBe('Réguliere');
  });

  it('Test 4 — sheet INDIC_25 (dual exploitation présent : "date de la mise en place" en col 8) → parse Mmm-YY', () => {
    const rows: (string | null)[][] = [
      ['TABLEAU DES VEILLES', null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, 'Titre de la source', 'Lien', 'Mode de suivi', 'Type de souce', 'Information suivi par', 'Fréquence', 'impact sur la formation', 'date de la mise en place', 'Exploitation'],
      [null, 'Digiformag', 'https://www.digiformag.com', 'Abonnement newsletter', 'Magazine en ligne', 'JULIEN', 'Mensuelle', 'projets', 'Jun-23', 'Exploitation rédigée'],
    ];

    const out = processSheetRows(rows, 'INDIC_25', 2, true);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Digiformag');
    expect(out[0]?.responsable).toBe('Julien');
    expect(out[0]?.rawSnippet).toBe('projets'); // col 7 = exploitation brute (impact)
    expect(out[0]?.exploitation).toBe('Exploitation rédigée'); // col 9
    expect(out[0]?.dateLastReviewed?.getFullYear()).toBe(2023);
    expect(out[0]?.dateLastReviewed?.getMonth()).toBe(5); // juin
  });

  it('Test 5 — sheet INDIC_26 (2e batch DREETS PACA) reste theme=INDIC_26 même structure dual', () => {
    const rows: (string | null)[][] = [
      ['Titre de la source', 'Lien', 'Mode de suivi', 'Type de source', 'Information suivi par', 'Fréquence', 'Exploitations', 'date de la mise en place', 'Exploitation'],
      [
        'Note de conjoncture 3e trimestre 2024',
        'https://paca.dreets.gouv.fr/Actualites,4046',
        'Newsletter',
        'Site institutionnel',
        'Julien',
        'Trimestrielle',
        'Analyse régionale',
        null,
        'Référencé dans notre note interne',
      ],
    ];

    const out = processSheetRows(rows, 'INDIC_26', 0, true);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toContain('Note de conjoncture');
    expect(out[0]?.rawSnippet).toBe('Analyse régionale');
    expect(out[0]?.exploitation).toBe('Référencé dans notre note interne');
    expect(out[0]?.dateLastReviewed).toBeNull(); // pas de date renseignée
  });

  it('Test 6 — SHEET_THEME_MAP référence les 5 feuilles attendues', () => {
    const names = SHEET_THEME_MAP.map((s) => s.name);
    expect(names).toContain('23-Veille Formation pro');
    expect(names).toContain('26 - Veille Handicap');
    expect(names).toContain('26-Veille DREETS PACA');
    expect(names).toContain('24- secteur dactivité');
    expect(names).toContain('25- Innovations péda et techno');
    expect(SHEET_THEME_MAP).toHaveLength(5);
  });

  it('Test 7 — lignes vides (title null) sont skip', () => {
    const rows: (string | null)[][] = [
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, 'Titre de la source', 'Lien', 'Mode', 'Type', 'Resp', 'Fréq', 'Exploit'],
      [null, null, null, null, null, null, null, null], // ligne vide
      [null, 'Source X', null, null, null, null, null, null],
    ];

    const out = processSheetRows(rows, 'INDIC_23', 2, false);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Source X');
  });
});
