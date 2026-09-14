import { describe, expect, it } from 'vitest';

import {
  TITRES_TRANCHES,
  appliquerTitresTranches,
  type ProgrammeTitrable,
} from '../lib/titres-tranches.js';

/**
 * Les quatre titres tranchés par Laurent le 14/09/2026.
 *
 * Le contrat qui compte n'est pas « la table contient les bonnes valeurs » —
 * ça, c'est relire une constante. C'est que la NORMALISATION s'applique sur le
 * chemin de l'extraction, qu'elle REFUSE de s'appliquer quand la source a
 * changé, et qu'elle ne déborde jamais sur un module qui n'est pas nommé.
 *
 * Leçon du 11/09 : un titre écrit en base revient au premier import, parce que
 * le titre vient légitimement du document source.
 */

function prog(sourceRef: string, modules: { order: number; title: string }[]): ProgrammeTitrable {
  return { sourceRef, modules, warnings: [] };
}

/** Les quatre modules visés, avec leur libellé RÉEL relevé dans l'instantané. */
function corpusReel(): ProgrammeTitrable[] {
  return [
    prog('drive:008', [
      { order: 1, title: 'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur' },
    ]),
    prog('drive:037', [{ order: 2, title: 'Préparer un Excellent Dossier de Suivi Vendeur' }]),
    prog('drive:012', [
      {
        order: 2,
        title:
          'Pratiquer une découverte acheteur de qualité en questionnant et écoutant activement les besoins des acheteurs :',
      },
    ]),
    prog('drive:047', [{ order: 20, title: 'Atelier pratique : Simulation de réponse aux avis clients.' }]),
  ];
}

describe('Titres tranchés — la normalisation vit à l’extraction', () => {
  it('applique les quatre titres sur les modules nommés', () => {
    const progs = corpusReel();
    appliquerTitresTranches(progs);
    expect(progs[0]!.modules[0]!.title).toBe(
      'Mener une découverte du projet acheteur-vendeur en situation',
    );
    expect(progs[1]!.modules[0]!.title).toBe('Préparer un dossier de suivi vendeur complet');
    expect(progs[2]!.modules[0]!.title).toBe(
      'Conduire une découverte acheteur par le questionnement et l’écoute active',
    );
    expect(progs[3]!.modules[0]!.title).toBe(
      'Répondre aux avis clients en ligne, positifs comme négatifs',
    );
  });

  it('n’applique RIEN et le DIT quand la source a changé depuis l’arbitrage', () => {
    const progs = [prog('drive:037', [{ order: 2, title: 'Un titre entièrement réécrit depuis' }])];
    const journal = appliquerTitresTranches(progs);

    expect(progs[0]!.modules[0]!.title, 'un arbitrage périmé ne doit pas écraser').toBe(
      'Un titre entièrement réécrit depuis',
    );
    expect(journal.join('\n')).toContain('NON appliqué');
    expect(progs[0]!.warnings.join('\n')).toContain('À re-trancher');
  });

  it('ne touche PAS un autre module qui porte le même libellé, et le signale', () => {
    const progs = [
      ...corpusReel(),
      // drive:053#33 porte le MÊME libellé que drive:008#1 — relevé dans l'instantané.
      prog('drive:053', [
        {
          order: 33,
          title: 'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur',
        },
      ]),
    ];
    const journal = appliquerTitresTranches(progs);

    const autre = progs.find((p) => p.sourceRef === 'drive:053')!;
    expect(autre.modules[0]!.title, 'l’arbitrage nomme des modules, pas des chaînes').toBe(
      'Mettre en Pratique des Situations de Découverte du Projet Acheteur-Vendeur',
    );
    expect(journal.join('\n')).toContain('drive:053#33 porte le MÊME libellé');
  });

  it('signale un arbitrage que plus aucun module ne porte', () => {
    const journal = appliquerTitresTranches([prog('drive:999', [{ order: 1, title: 'x' }])]);
    expect(journal.join('\n')).toContain('jamais rencontré');
  });

  it('journalise chaque application, avec sa date et son motif', () => {
    const journal = appliquerTitresTranches(corpusReel());
    for (const cle of Object.keys(TITRES_TRANCHES)) {
      expect(journal.join('\n')).toContain(cle);
    }
    expect(journal.join('\n')).toContain('14/09/2026');
  });
});
