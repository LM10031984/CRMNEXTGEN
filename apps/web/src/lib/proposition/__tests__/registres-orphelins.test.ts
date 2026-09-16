/**
 * GARDE — tout registre de décisions sait dire ce qu'il a PERDU.
 *
 * ## La règle, et ce qu'elle a coûté de ne pas l'avoir (16/09/2026)
 *
 * Une décision s'attache à une IDENTITÉ, jamais à un LIBELLÉ. Un libellé
 * s'améliore — c'est son destin, et nous l'avons amélioré nous-mêmes le 14/09,
 * sur arbitrage de Laurent. Quatre de ses sept décisions ont alors cessé de
 * s'appliquer : pas d'erreur, pas de test rouge, juste des décisions qui ne
 * retrouvaient plus leur module. Quatre jours de silence.
 *
 * La règle a donc deux moitiés, et la seconde n'est pas décorative :
 *
 *  ① la clé est l'identité stable (`drive:NNN#i`) ;
 *  ② le registre SIGNALE ses décisions orphelines au lancement.
 *
 * Sans ②, ① ne se vérifie jamais : un `sourceRef` mal saisi ne désigne rien, en
 * silence, exactement comme un titre périmé.
 *
 * ## POPULATION de ce test
 *
 * Les trois registres de `apps/web/src/lib/proposition` qui attachent une
 * décision humaine à un module du catalogue. Les deux autres registres du dépôt
 * vivent dans `packages/db/scripts/` et sortent de la portée d'un test
 * `apps/web` : `RAYONS_TRANCHES` (keyé `drive:NNN`) et `TITRES_TRANCHES` (keyé
 * `sourceRef#order`, et porteur de sa propre garde sur le texte source). Les
 * deux sont déjà keyés sur une identité — vérifié à la lecture le 16/09, pas
 * par ce test.
 */
import { describe, expect, it } from 'vitest';

import { ARBITRAGES_RATTACHEMENT, arbitragesOrphelins } from '../arbitrages-rattachement';
import { REFUS_RATTACHEMENT, refusOrphelins } from '../refus-rattachement';
import { RATTACHEMENTS_VALIDES, resoudreCibles } from '../rattachements-valides';

/** L'identité stable d'un module dans sa source. */
const IDENTITE = /^drive:\d+#\d+$/;

/** Tous les `sourceRef` que les trois registres désignent. */
function refsDesignees(): string[] {
  return [
    ...RATTACHEMENTS_VALIDES.flatMap((r) => r.cibles.map((c) => c.sourceRef)),
    ...Object.values(REFUS_RATTACHEMENT).flatMap((l) => l.map((r) => r.moduleSourceRef)),
    ...ARBITRAGES_RATTACHEMENT.map((a) => a.moduleSourceRef),
  ];
}

describe('① la clé est une identité, jamais un libellé', () => {
  it('la population désignée n’est pas vide', () => {
    expect(refsDesignees().length).toBeGreaterThan(10);
  });

  it('chaque décision des trois registres désigne un `drive:NNN#i`', () => {
    for (const ref of refsDesignees()) expect(ref).toMatch(IDENTITE);
  });
});

describe('② chaque registre signale ses orphelines', () => {
  /** Un catalogue où RIEN n'est connu : tout doit être signalé. */
  const vide = new Set<string>();

  it('les rattachements retenus', () => {
    const { trouvees, orphelines } = resoudreCibles(RATTACHEMENTS_VALIDES, []);
    expect(trouvees).toEqual([]);
    expect(orphelines.length).toBe(
      RATTACHEMENTS_VALIDES.reduce((n, r) => n + r.cibles.length, 0),
    );
    // Une orpheline se LIT : elle nomme la douleur et le module.
    expect(orphelines[0]!.pour.length).toBeGreaterThan(0);
    expect(orphelines[0]!.libelle.length).toBeGreaterThan(0);
  });

  it('les refus de paire', () => {
    const tous = Object.values(REFUS_RATTACHEMENT).flat();
    expect(refusOrphelins(vide)).toHaveLength(tous.length);
    expect(refusOrphelins(new Set(tous.map((r) => r.moduleSourceRef)))).toEqual([]);
  });

  it('les arbitrages du composeur', () => {
    expect(arbitragesOrphelins(vide)).toHaveLength(ARBITRAGES_RATTACHEMENT.length);
    expect(
      arbitragesOrphelins(new Set(ARBITRAGES_RATTACHEMENT.map((a) => a.moduleSourceRef))),
    ).toEqual([]);
  });

  it('un catalogue complet ne produit AUCUNE orpheline — le garde sait aussi se taire', () => {
    const toutes = new Set(refsDesignees());
    expect(refusOrphelins(toutes)).toEqual([]);
    expect(arbitragesOrphelins(toutes)).toEqual([]);
    const catalogue = [...toutes].map((sourceRef) => ({ sourceRef, programme: '—', titre: '—' }));
    expect(resoudreCibles(RATTACHEMENTS_VALIDES, catalogue).orphelines).toEqual([]);
  });
});
