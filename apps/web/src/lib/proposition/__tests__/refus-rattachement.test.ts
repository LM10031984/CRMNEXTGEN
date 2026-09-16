/**
 * GARDE — un refus porte sur une PAIRE (douleur × module), jamais sur la
 * douleur seule.
 *
 * ## Ce qui a rendu ce test nécessaire (16/09/2026)
 *
 * Les quatre barrages du 11/09 étaient enregistrés sur le `ruleId` de la
 * douleur. Or aucun des quatre ne refusait la douleur : chacun refusait UN
 * MODULE mal rapproché — « le mot “collecte” menait à une collecte d'e-mails,
 * pas d'avis ». Le tri faisait pourtant `continue` sans regarder les candidats.
 *
 * Conséquence mesurée : un mauvais candidat stérilisait un besoin
 * DÉFINITIVEMENT, et le bon module — écrit depuis — ne pouvait plus l'atteindre.
 *
 * C'est le patron déjà posé le 16/09 pour `drive:034#2` dans
 * `arbitrages-rattachement.ts` : la clé est le `sourceRef`, l'identité stable
 * qui survit à un ré-import et à un renommage. Le registre du 11/09 était resté
 * en arrière.
 *
 * ## Pourquoi le titre ne peut pas servir de clé
 *
 * Quatre titres ont été réécrits entre le 14 et le 16/09. Le générateur, qui
 * apparie les rattachements RETENUS par leur titre, en a perdu quatre du même
 * coup (« n'est plus une unité animable du catalogue »). Un refus apparié de la
 * même façon aurait disparu en silence — ce qui est pire, puisque rien ne le
 * signale.
 */
import { describe, expect, it } from 'vitest';

import { REFUS_RATTACHEMENT, candidatsSurvivants } from '../refus-rattachement';

const c = (sourceRef: string | null, titre: string) => ({ sourceRef, titre });

describe('candidatsSurvivants', () => {
  it('retire le module nommé, et lui seul', () => {
    const candidats = [
      c('drive:066#3', "Collecte d'emails + QR Codes + formulaires (7h)"),
      c('drive:047#20', 'Répondre aux avis clients en ligne'),
    ];
    const refus = [{ moduleSourceRef: 'drive:066#3', moduleTitre: '…', motif: '…', date: '2026-09-11' }];
    expect(candidatsSurvivants(candidats, refus).map((x) => x.sourceRef)).toEqual(['drive:047#20']);
  });

  it('ne retire rien quand le refus ne désigne aucun candidat présent', () => {
    const candidats = [c('drive:047#20', 'Répondre aux avis clients en ligne')];
    const refus = [{ moduleSourceRef: 'drive:066#3', moduleTitre: '…', motif: '…', date: '2026-09-11' }];
    expect(candidatsSurvivants(candidats, refus)).toHaveLength(1);
  });

  it('rend une liste VIDE quand tous les candidats sont refusés — la douleur retombe sans réponse, elle ne disparaît pas', () => {
    const candidats = [c('drive:066#3', 'x'), c('drive:010#2', 'y')];
    const refus = [
      { moduleSourceRef: 'drive:066#3', moduleTitre: 'x', motif: '…', date: '2026-09-11' },
      { moduleSourceRef: 'drive:010#2', moduleTitre: 'y', motif: '…', date: '2026-09-11' },
    ];
    expect(candidatsSurvivants(candidats, refus)).toEqual([]);
  });

  it("ne retire jamais une unité sans sourceRef — un produit vendu n'est pas visé par un refus de module", () => {
    const candidats = [c(null, 'Coaching Indiv (produit vendu)')];
    const refus = [{ moduleSourceRef: 'drive:066#3', moduleTitre: '…', motif: '…', date: '2026-09-11' }];
    expect(candidatsSurvivants(candidats, refus)).toHaveLength(1);
  });
});

describe('REFUS_RATTACHEMENT — le registre du 11/09, ré-exprimé en paires', () => {
  it('porte les quatre barrages du 11/09', () => {
    expect(Object.keys(REFUS_RATTACHEMENT).sort()).toEqual([
      'collecte-avis',
      'contacts-vers-rdv',
      'indicateurs',
      'visites-par-vente',
    ]);
  });

  it('chaque refus nomme un MODULE par son sourceRef — jamais la douleur seule', () => {
    for (const [ruleId, refus] of Object.entries(REFUS_RATTACHEMENT)) {
      expect(refus.length, `« ${ruleId} » ne refuse aucun module`).toBeGreaterThan(0);
      for (const r of refus) {
        expect(r.moduleSourceRef, `« ${ruleId} »`).toMatch(/^drive:\d+#\d+$/);
        expect(r.moduleTitre.length, `« ${ruleId} »`).toBeGreaterThan(0);
        expect(r.motif.length, `« ${ruleId} »`).toBeGreaterThan(10);
        expect(r.date, `« ${ruleId} »`).toBe('2026-09-11');
      }
    }
  });

  it('aucun refus ne prétend que la douleur sort de l’exercice — ça, c’est D-28', () => {
    // Un refus de paire dit « pas CE module ». « Pas de formation pour ce
    // besoin » est un autre mécanisme (`answerableByTraining: false`), porté par
    // le barème et non par ce registre. Les confondre stérilise un besoin.
    for (const refus of Object.values(REFUS_RATTACHEMENT)) {
      for (const r of refus) {
        expect(r.motif).not.toMatch(/n'est pas un besoin de formation|hors champ|ne se forme pas/i);
      }
    }
  });
});
