import { describe, it, expect } from 'vitest';
import {
  HORAIRE_MATIN_PROG,
  HORAIRE_APREM_PROG,
  buildHoraireScaffold,
  renderHoraireScaffoldMd,
  significantTokens,
  extractSectionTitles,
  enforceProgrammeFidelity,
} from '../programme-normalize';
import { assembleDeroule } from '../closure/ollama-generators';
import type { DerouleContent, DerouleJour } from '../closure/deroule-template';

// Fabrique un jour minimal taggé par son thème (pour vérifier l'ordre).
function jour(theme: string): DerouleJour {
  return { theme, sequences: [] };
}

describe('assembleDeroule — réassemblage pur des déroulés partiels', () => {
  it('3 partiels [J1][J2][J3] → 1 DerouleContent {jours:[J1,J2,J3]}, ordre préservé', () => {
    const partiels: DerouleContent[] = [
      { jours: [jour('Jour 1')] },
      { jours: [jour('Jour 2')] },
      { jours: [jour('Jour 3')] },
    ];
    const out = assembleDeroule(partiels);
    expect(out.jours).toHaveLength(3);
    expect(out.jours.map((j) => j.theme)).toEqual(['Jour 1', 'Jour 2', 'Jour 3']);
  });

  it('1 partiel → identité (jours inchangés)', () => {
    const partiels: DerouleContent[] = [{ jours: [jour('Unique')] }];
    expect(assembleDeroule(partiels).jours.map((j) => j.theme)).toEqual(['Unique']);
  });

  it('0 partiel → { jours: [] }', () => {
    expect(assembleDeroule([])).toEqual({ jours: [] });
  });

  it('partiel à plusieurs jours (cas dégénéré LLM) → tous aplatis dans l’ordre', () => {
    const partiels: DerouleContent[] = [
      { jours: [jour('A'), jour('B')] },
      { jours: [jour('C')] },
    ];
    expect(assembleDeroule(partiels).jours.map((j) => j.theme)).toEqual(['A', 'B', 'C']);
  });

  it('// test de puissance ordre réassemblage — 3 partiels ABC → ABC (un reverse/unshift virerait rouge)', () => {
    const partiels: DerouleContent[] = [
      { jours: [jour('A')] },
      { jours: [jour('B')] },
      { jours: [jour('C')] },
    ];
    expect(assembleDeroule(partiels).jours.map((j) => j.theme)).toEqual(['A', 'B', 'C']);
  });
});

describe('buildHoraireScaffold — grille horaire déterministe multi-jours', () => {
  it('8h → 1 jour plein (NON-RÉGRESSION) : matin 9h00–13h00 (4h) + déjeuner + après-midi 14h00–18h00 (4h)', () => {
    const s = buildHoraireScaffold(8);
    expect(s.nbJours).toBe(1);
    expect(s.jours).toHaveLength(1);
    const j = s.jours[0]!;
    expect(j.matin.label).toBe('9h00–13h00');
    expect(j.matin.label).toBe(HORAIRE_MATIN_PROG);
    expect(j.matin.travailMin).toBe(240);
    expect(j.dejeuner.start).toBe('13h00');
    expect(j.dejeuner.end).toBe('14h00');
    expect(j.dejeuner.durationMin).toBe(60);
    expect(j.apresMidi.label).toBe('14h00–18h00');
    expect(j.apresMidi.label).toBe(HORAIRE_APREM_PROG);
    expect(j.apresMidi.travailMin).toBe(240);
    expect(j.travailTotalMin).toBe(480);
  });

  it('somme TRAVAIL d’un jour plein = 8h pile (480 min, hors pauses)', () => {
    const j = buildHoraireScaffold(8).jours[0]!;
    expect(j.matin.travailMin + j.apresMidi.travailMin).toBe(480);
    expect(j.travailTotalMin).toBe(480);
  });

  it('pauses café internes (~10h45 et ~15h45, 15 min) sont DANS les blocs — la journée ne dépasse pas 18h00', () => {
    const j = buildHoraireScaffold(8).jours[0]!;
    expect(j.matin.pauseCafe).toEqual({ at: '10h45', durationMin: 15 });
    expect(j.apresMidi.pauseCafe).toEqual({ at: '15h45', durationMin: 15 });
    // L'après-midi se termine à 18h00 (label figé) malgré la pause café incluse.
    expect(j.apresMidi.label.endsWith('18h00')).toBe(true);
  });

  it('nbJours = ceil(N/8) ; pour N≤8 reste 1 jour sans multiDayDeferred', () => {
    expect(buildHoraireScaffold(4).nbJours).toBe(1);
    expect(buildHoraireScaffold(8).nbJours).toBe(1);
    expect(buildHoraireScaffold(8).multiDayDeferred).toBe(false);
  });

  it('40h → 5 jours TOUS pleins (travailTotalMin 480 chacun, aucun partiel)', () => {
    const s = buildHoraireScaffold(40);
    expect(s.nbJours).toBe(5);
    expect(s.jours).toHaveLength(5);
    expect(s.multiDayDeferred).toBe(false);
    for (const j of s.jours) {
      expect(j.travailTotalMin).toBe(480);
      expect(j.matin.travailMin).toBe(240);
      expect(j.apresMidi.travailMin).toBe(240);
    }
  });

  it('72h → 9 jours tous pleins (PROD-0042)', () => {
    const s = buildHoraireScaffold(72);
    expect(s.nbJours).toBe(9);
    expect(s.jours).toHaveLength(9);
    for (const j of s.jours) {
      expect(j.travailTotalMin).toBe(480);
    }
  });

  it('16h → 2 jours PLEINS (multiple de 8, reliquat=8 → dernier jour plein, PAS partiel)', () => {
    const s = buildHoraireScaffold(16);
    expect(s.nbJours).toBe(2);
    expect(s.jours).toHaveLength(2);
    expect(s.multiDayDeferred).toBe(false);
    const last = s.jours[1]!;
    expect(last.travailTotalMin).toBe(480);
    expect(last.apresMidi.travailMin).toBe(240);
  });

  it('105h → 14 jours : 13 pleins + dernier reliquat 1h (matin 9h00→10h00, pas d’après-midi)', () => {
    const s = buildHoraireScaffold(105);
    expect(s.nbJours).toBe(14);
    expect(s.jours).toHaveLength(14);
    // 13 premiers pleins
    for (let i = 0; i < 13; i++) {
      expect(s.jours[i]!.travailTotalMin).toBe(480);
    }
    // dernier jour : reliquat = 105 - 8*13 = 1h
    const last = s.jours[13]!;
    expect(last.matin.label).toBe('9h00–10h00');
    expect(last.matin.travailMin).toBe(60);
    expect(last.apresMidi.travailMin).toBe(0); // pas d'après-midi
    expect(last.travailTotalMin).toBe(60);
  });

  it('reliquat >4h : 21h → 3 jours, dernier reliquat=5h → matin complet + après-midi partiel 14h00→15h00', () => {
    const s = buildHoraireScaffold(21);
    expect(s.nbJours).toBe(3);
    expect(s.jours).toHaveLength(3);
    expect(s.jours[0]!.travailTotalMin).toBe(480);
    expect(s.jours[1]!.travailTotalMin).toBe(480);
    const last = s.jours[2]!;
    expect(last.matin.label).toBe('9h00–13h00');
    expect(last.matin.travailMin).toBe(240);
    expect(last.apresMidi.label).toBe('14h00–15h00');
    expect(last.apresMidi.travailMin).toBe(60);
    expect(last.travailTotalMin).toBe(300); // 5h
  });

  it('reliquat ≤4h : 12h → 2 jours, dernier reliquat=4h → matin seul 9h00→13h00, pas d’après-midi', () => {
    const s = buildHoraireScaffold(12);
    expect(s.nbJours).toBe(2);
    expect(s.jours).toHaveLength(2);
    expect(s.jours[0]!.travailTotalMin).toBe(480);
    const last = s.jours[1]!;
    expect(last.matin.label).toBe('9h00–13h00');
    expect(last.matin.travailMin).toBe(240);
    expect(last.apresMidi.travailMin).toBe(0);
    expect(last.travailTotalMin).toBe(240); // 4h
  });

  it('// test de puissance reliquat — travailMin matin du dernier jour de 105h === 60 (formule reliquat=h−8·(nbJours−1))', () => {
    // Si la formule reliquat est cassée (ex 8*(nbJours-1) → 8*nbJours, soit reliquat 105-112=-7
    // → tout plein, dernier jour 480), ce test DOIT virer rouge.
    const s = buildHoraireScaffold(105);
    expect(s.jours[13]!.matin.travailMin).toBe(60);
    expect(s.jours[13]!.travailTotalMin).toBe(60);
  });

  it('multiDayDeferred toujours false (multi-jours désormais implémenté)', () => {
    expect(buildHoraireScaffold(72).multiDayDeferred).toBe(false);
    expect(buildHoraireScaffold(105).multiDayDeferred).toBe(false);
  });

  it('déterminisme strict : 2 appels mêmes args → résultat identique (8h, 72h, 105h)', () => {
    expect(buildHoraireScaffold(8)).toEqual(buildHoraireScaffold(8));
    expect(buildHoraireScaffold(72)).toEqual(buildHoraireScaffold(72));
    expect(buildHoraireScaffold(105)).toEqual(buildHoraireScaffold(105));
    expect(renderHoraireScaffoldMd(buildHoraireScaffold(72))).toBe(
      renderHoraireScaffoldMd(buildHoraireScaffold(72)),
    );
  });

  it('renderHoraireScaffoldMd liste chaque Jour K et garde horaires figés + consigne de recopie', () => {
    const md = renderHoraireScaffoldMd(buildHoraireScaffold(72));
    expect(md).toContain('### Jour 1');
    expect(md).toContain('### Jour 9');
    expect(md).toContain('9h00–13h00');
    expect(md).toContain('14h00–18h00');
    expect(md).toContain('recopier');
  });

  it('renderHoraireScaffoldMd cas 1 jour : un seul ### Jour 1 et les horaires figés', () => {
    const md = renderHoraireScaffoldMd(buildHoraireScaffold(8));
    expect(md).toContain('### Jour 1');
    expect(md).not.toContain('### Jour 2');
    expect(md).toContain('9h00–13h00');
    expect(md).toContain('14h00–18h00');
    expect(md).toContain('recopier');
  });
});

describe('significantTokens — tokenisation ≥4 lettres + stop-words FR', () => {
  it('retire les mots < 4 lettres et les stop-words FR (casse/accents insensibles)', () => {
    const toks = significantTokens('Les techniques de prospection avec IA');
    expect(toks.has('techniques')).toBe(true);
    expect(toks.has('prospection')).toBe(true);
    expect(toks.has('les')).toBe(false); // stop-word
    expect(toks.has('avec')).toBe(false); // stop-word
    expect(toks.has('ia')).toBe(false); // < 4 lettres
  });

  it('normalise accents : "Évaluation" et "evaluation" produisent le même token', () => {
    expect(significantTokens('Évaluation').has('evaluation')).toBe(true);
    expect(significantTokens('evaluation').has('evaluation')).toBe(true);
  });
});

describe('extractSectionTitles', () => {
  it('extrait les titres de heading markdown et les items de liste en gras', () => {
    const md = [
      '## Identifier les obligations Tracfin',
      'corps de texte',
      '- **Appliquer la vigilance client** : contrôle KYC',
    ].join('\n');
    const titles = extractSectionTitles(md);
    expect(titles).toContain('Identifier les obligations Tracfin');
    expect(titles).toContain('Appliquer la vigilance client');
  });
});

describe('enforceProgrammeFidelity — fidélité de contenu (test de puissance)', () => {
  const sourceModules = [
    'Cadre réglementaire Tracfin et obligations déclaratives',
    'Vigilance client et identification des risques',
    'Déclaration de soupçon et procédures internes',
  ];

  it('GREEN : un programme normalisé dérivé UNIQUEMENT des modules source passe (ok:true)', () => {
    const normalized = [
      '## Identifier le cadre réglementaire Tracfin',
      '- **Appliquer la vigilance client** : identification des risques',
      '## Élaborer une déclaration de soupçon',
    ].join('\n');
    const res = enforceProgrammeFidelity(normalized, sourceModules);
    expect(res.ok).toBe(true);
    expect(res.extraneous).toEqual([]);
  });

  it('RED (puissance) : un thème étranger sans token commun ("architecture transformer") est détecté', () => {
    const normalized = [
      '## Identifier le cadre réglementaire Tracfin',
      '## Comprendre architecture transformer', // ← étranger : aucun token commun avec la source
    ].join('\n');
    const res = enforceProgrammeFidelity(normalized, sourceModules);
    expect(res.ok).toBe(false);
    expect(res.extraneous).toContain('Comprendre architecture transformer');
    // Garde la section légitime hors de la liste des orphelines.
    expect(res.extraneous).not.toContain('Identifier le cadre réglementaire Tracfin');
  });

  it('TEST DE PUISSANCE : la détection garde réellement qqch — si la heuristique laissait tout passer, ce cas serait raté', () => {
    // Un programme 100% étranger : aucune section ne recoupe la source.
    const totallyForeign = [
      '## Optimiser un pipeline machine learning',
      '## Déployer un modèle neuronal profond',
    ].join('\n');
    const res = enforceProgrammeFidelity(totallyForeign, sourceModules);
    expect(res.ok).toBe(false);
    expect(res.extraneous).toHaveLength(2);
  });
});
