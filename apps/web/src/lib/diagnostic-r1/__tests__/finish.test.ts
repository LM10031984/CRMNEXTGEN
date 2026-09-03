import { describe, expect, it } from 'vitest';

import { describeMissingRequired, recapHref, resolveFinishAction } from '../finish';
import { computeProgress } from '../progress';

const ID = 'd8956337-02cd-4f5e-8f29-9ac876e56493';

/**
 * Régression du 03/09/2026 — la boucle du bouton « Terminer ».
 *
 * Constatée au clic : depuis le chapitre 11, « Terminer » ramenait au
 * chapitre 2 et le diagnostic restait EN_COURS. Deux défauts cumulés — le
 * bouton ne terminait pas, et la fiche qui aurait pu le dire redirigeait vers
 * le premier chapitre incomplet.
 */
describe('« Terminer » ne renvoie jamais saisir en silence', () => {
  it('vise toujours le récapitulatif, jamais un chapitre', () => {
    const vide = computeProgress('LEGER', []);
    const complet = computeProgress('LEGER', [], 4);
    for (const p of [vide, complet]) {
      const action = resolveFinishAction(ID, p);
      expect(action.href).toBe(`/app/diagnostics/${ID}?vue=recap`);
      expect(action.href).not.toContain('/chapitre/');
    }
  });

  it('porte le paramètre vue=recap, sans lequel la fiche redirige vers la saisie', () => {
    // C'est LE détail qui fabriquait la boucle : la fiche d'un diagnostic
    // EN_COURS renvoie au premier chapitre incomplet tant qu'on ne lui dit pas
    // qu'on vient de terminer.
    expect(recapHref(ID)).toContain('vue=recap');
  });
});

describe('Quand il manque des réponses obligatoires', () => {
  const progress = computeProgress('LEGER', [], 0);

  it('demande une revue plutôt que de clore en silence', () => {
    const action = resolveFinishAction(ID, progress);
    expect(action.kind).toBe('review-missing');
  });

  it('dit combien il en manque et dans quels chapitres', () => {
    const action = resolveFinishAction(ID, progress);
    if (action.kind !== 'review-missing') throw new Error('cas inattendu');
    expect(action.missingCount).toBeGreaterThan(0);
    expect(action.chapters.length).toBeGreaterThan(0);
    expect(action.chapters).toEqual([...action.chapters].sort((a, b) => a - b));
  });

  it('ne BLOQUE pas pour autant — la revue est une information, pas un barrage', () => {
    // La règle transverse de la spec : une donnée obligatoire manquante ne
    // bloque jamais. L'action rend une destination, jamais un refus.
    const action = resolveFinishAction(ID, progress);
    expect(action.href).toBeTruthy();
  });
});

describe('Quand tout est renseigné', () => {
  it('clôt directement', () => {
    // Toutes les obligatoires du set léger renseignées + une grille équipe.
    const answers = [
      ['identity-activities', ['transaction_ancien']],
      ['identity-transaction-ancien-percent', 85],
      ['identity-sales-n1', 72],
      ['identity-revenue-n1', 720000],
      ['team-total-count', 6],
      ['team-employees-count', 2],
      ['team-independents-count', 4],
      ['team-directors-count', 1],
      ['funding-agefice-used', 'non'],
      ['funding-opco-used', 'non'],
      ['funding-past-refusals', 'no'],
      ['prospecting-methods', ['pige']],
      ['prospecting-who', 'certains'],
      ['prospecting-contacts-per-month', 100],
      ['seller-meetings-per-month', 20],
      ['seller-discovery-formalized', 'no'],
      ['mandates-per-month', 8],
      ['mandates-active-stock', 45],
      ['mandates-exclusivity-percent', 25],
      ['mandates-price-above-market', 'parfois'],
      ['commercial-followup-frequency', 'mensuel'],
      ['commercial-price-drop-per-month-percent', 2],
      ['buyers-contacts-per-month', 80],
      ['buyers-financing-verified', 'no'],
      ['visits-per-month', 60],
      ['offers-per-month', 9],
      ['compromis-per-month', 7],
      ['actes-per-month', 6],
      ['db-volume', 3400],
      ['google-reviews-count', 12],
      ['google-reviews-score', 92],
      ['tools-metier', 'Apimo'],
      ['tools-ai-usage', ['redaction_annonces']],
      ['mgmt-indicators-followed', ['ca']],
      ['mgmt-top3-difficulties', 'Recrutement'],
      ['mgmt-top3-priorities', 'Exclusivités'],
    ].map(([questionId, value]) => ({ questionId: questionId as string, value, isSkipped: false }));

    const action = resolveFinishAction(ID, computeProgress('LEGER', answers, 4));
    expect(action.kind).toBe('complete');
  });

  it('accepte une obligatoire explicitement passée — « ne sait pas » est une réponse', () => {
    const passees = computeProgress(
      'LEGER',
      [{ questionId: 'identity-sales-n1', value: null, isSkipped: true }],
      4,
    );
    const ch1 = passees.chapters.find((c) => c.chapter === 1)!;
    expect(ch1.missingRequired).not.toContain('identity-sales-n1');
  });
});

describe('Le message de revue', () => {
  it('se lit en français au singulier comme au pluriel', () => {
    expect(describeMissingRequired(1, [2])).toBe('Il manque 1 réponse obligatoire, au chapitre 2.');
    expect(describeMissingRequired(3, [2, 5])).toBe(
      'Il manque 3 réponses obligatoires, aux chapitres 2 et 5.',
    );
    expect(describeMissingRequired(4, [1, 2, 5])).toBe(
      'Il manque 4 réponses obligatoires, aux chapitres 1, 2 et 5.',
    );
  });

  it('sait dire que tout est en ordre', () => {
    expect(describeMissingRequired(0, [])).toContain('Toutes les réponses');
  });
});
