/**
 * GARDE — une décision s'attache à une IDENTITÉ, jamais à un LIBELLÉ.
 *
 * ## Ce qui a rendu ce test nécessaire (16/09/2026)
 *
 * `RATTACHEMENTS_VALIDES` désignait ses modules par `{ programme, module }` —
 * un code de rayon et un TITRE. Le 14/09, quatre titres ont été réécrits, sur
 * arbitrage de Laurent et par le bon chemin (`TITRES_TRANCHES`, keyé lui sur
 * `sourceRef#order`).
 *
 * **Quatre de ses neuf décisions ont alors cessé de s'appliquer.** Pas
 * d'erreur, pas de test rouge : les rattachements ne retrouvaient simplement
 * plus leur module. Ses arbitrages ont été détachés en appliquant ses
 * arbitrages, et c'est resté muet quatre jours.
 *
 * Un libellé s'améliore — c'est son destin. Le jour où quelqu'un l'améliore, un
 * registre keyé dessus se vide en silence.
 *
 * ## Les deux moitiés de la règle
 *
 * ① la clé est l'identité stable (`drive:NNN#i`) ; le titre reste, mais pour
 *    RELIRE, jamais pour identifier ;
 * ② le registre SAIT DIRE ce qu'il a perdu. C'est le signalement des orphelines
 *    qui a rendu ce défaut visible — sans lui, il courait encore.
 */
import { describe, expect, it } from 'vitest';

import {
  RATTACHEMENTS_VALIDES,
  resoudreCibles,
} from '../rattachements-valides';

/** Un catalogue minimal, façon `{ sourceRef, programme, titre }`. */
const cat = (rows: [string, string, string][]) =>
  rows.map(([sourceRef, programme, titre]) => ({ sourceRef, programme, titre }));

describe('RATTACHEMENTS_VALIDES — chaque cible porte une identité stable', () => {
  it('les neuf décisions sont là', () => {
    expect(RATTACHEMENTS_VALIDES).toHaveLength(9);
  });

  it('toute cible est désignée par un sourceRef `drive:NNN#i`', () => {
    for (const r of RATTACHEMENTS_VALIDES) {
      expect(r.cibles.length, `« ${r.douleur} » ne vise aucun module`).toBeGreaterThan(0);
      for (const c of r.cibles) {
        expect(c.sourceRef, `« ${r.douleur} » → ${c.titreAuMomentDeLaDecision}`).toMatch(
          /^drive:\d+#\d+$/,
        );
        expect(c.titreAuMomentDeLaDecision.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('resoudreCibles', () => {
  it('RETROUVE un module dont le TITRE a été réécrit — le cas du 14/09', () => {
    const catalogue = cat([
      // Le titre a changé ; le sourceRef, non. C'est exactement ce qu'a fait
      // TITRES_TRANCHES le 14/09 sur ces quatre modules.
      ['drive:037#2', 'BIB-D037', 'Préparer un dossier de suivi vendeur complet'],
    ]);
    const { trouvees, orphelines } = resoudreCibles(
      [
        {
          ruleId: 'suivi-vendeur',
          douleur: 'Rythme de suivi vendeur',
          signal: 's',
          cibles: [
            {
              sourceRef: 'drive:037#2',
              programme: 'BIB-D037',
              titreAuMomentDeLaDecision: 'Préparer un Excellent Dossier de Suivi Vendeur',
            },
          ],
        },
      ],
      catalogue,
    );
    expect(orphelines).toEqual([]);
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]!.titreActuel).toBe('Préparer un dossier de suivi vendeur complet');
  });

  it('SIGNALE une décision dont le module a disparu, en la nommant', () => {
    const { trouvees, orphelines } = resoudreCibles(
      [
        {
          ruleId: 'trame',
          douleur: "Trame d'appel commune",
          signal: 's',
          cibles: [
            { sourceRef: 'drive:999#9', programme: 'BIB-D999', titreAuMomentDeLaDecision: 'Parti' },
          ],
        },
      ],
      cat([['drive:006#1', 'BIB-D006', 'Autre chose']]),
    );
    expect(trouvees).toEqual([]);
    expect(orphelines).toHaveLength(1);
    expect(orphelines[0]!.pour).toBe("Trame d'appel commune");
    expect(orphelines[0]!.sourceRef).toBe('drive:999#9');
    expect(orphelines[0]!.libelle).toBe('Parti');
  });

  it('le TITRE ne sert jamais à apparier : un homonyme sous un autre sourceRef n’est pas retenu', () => {
    const { trouvees, orphelines } = resoudreCibles(
      [
        {
          ruleId: 'trame',
          douleur: "Trame d'appel commune",
          signal: 's',
          cibles: [
            { sourceRef: 'drive:006#1', programme: 'BIB-D006', titreAuMomentDeLaDecision: 'Vendre un RDV' },
          ],
        },
      ],
      // Même titre, autre module. Un appariement par le libellé l'aurait pris.
      cat([['drive:055#4', 'BIB-D055', 'Vendre un RDV']]),
    );
    expect(trouvees).toEqual([]);
    expect(orphelines).toHaveLength(1);
  });
});
