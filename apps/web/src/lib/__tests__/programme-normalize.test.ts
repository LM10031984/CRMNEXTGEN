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

describe('buildHoraireScaffold — grille horaire déterministe (cas 1 jour)', () => {
  it('8h → 1 jour, matin 9h00–13h00 (4h) + déjeuner + après-midi 14h00–18h00 (4h)', () => {
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
  });

  it('somme TRAVAIL = 8h pile (480 min, hors pauses)', () => {
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

  it('nbJours = ceil(N/8) calculable ; pour N≤8 reste 1 jour sans multiDayDeferred', () => {
    expect(buildHoraireScaffold(4).nbJours).toBe(1);
    expect(buildHoraireScaffold(8).nbJours).toBe(1);
    expect(buildHoraireScaffold(8).multiDayDeferred).toBe(false);
  });

  it('multi-jours DIFFÉRÉ : N>8 calcule nbJours>1 mais ne rend qu’UNE journée + multiDayDeferred=true', () => {
    const s = buildHoraireScaffold(16);
    expect(s.nbJours).toBe(2);
    expect(s.jours).toHaveLength(1); // périmètre : non implémenté
    expect(s.multiDayDeferred).toBe(true);
  });

  it('déterminisme strict : 2 appels mêmes args → résultat identique', () => {
    expect(buildHoraireScaffold(8)).toEqual(buildHoraireScaffold(8));
    expect(renderHoraireScaffoldMd(buildHoraireScaffold(8))).toBe(
      renderHoraireScaffoldMd(buildHoraireScaffold(8)),
    );
  });

  it('renderHoraireScaffoldMd contient les horaires figés et la consigne de recopie', () => {
    const md = renderHoraireScaffoldMd(buildHoraireScaffold(8));
    expect(md).toContain('9h00–13h00');
    expect(md).toContain('14h00–18h00');
    expect(md).toContain('8h00 pile');
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
