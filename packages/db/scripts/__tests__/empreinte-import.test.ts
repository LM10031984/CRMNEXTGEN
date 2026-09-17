/**
 * La garde d'écrasement — « l'import ne réécrit que ce qu'il a lui-même écrit ».
 *
 * Ce que ces tests protègent : **un déroulé réécrit à la main survit au
 * ré-import**, y compris quand le document Drive porte son propre texte. C'est
 * le cas que l'ancienne garde laissait passer, parce qu'elle ne protégeait que
 * du vide.
 *
 * Et le pendant, aussi important : la garde ne doit pas TOUT bloquer. Un import
 * qui refuse d'écrire partout serait un import mort, et il finirait débranché.
 */
import { describe, expect, it } from 'vitest';

import { ciblesSansEmpreinte, empreinte, sortDuContenu } from '../lib/empreinte-import.js';

const DRIVE = 'Le déroulé tel que le Drive le porte.';
const HUMAIN = 'Le déroulé réécrit à la main par Laurent, plus précis, 1500 car.';

/** L'état nominal : la base porte ce que l'import y a écrit au passage précédent. */
const nominal = {
  enBase: DRIVE,
  entrant: DRIVE,
  empreinteConnue: empreinte(DRIVE),
  protegeParLeVide: false,
};

describe('sortDuContenu — trois issues, jamais une devinette', () => {
  it('REFUSE quand un humain a écrit après l’import', () => {
    // Le cas qui a motivé la colonne. Avant, `doitProtegerLeContenu` rendait
    // false (l'entrant n'est pas vide) et le texte de Laurent disparaissait.
    expect(
      sortDuContenu({
        enBase: HUMAIN,
        entrant: 'Le Drive, corrigé depuis.',
        empreinteConnue: empreinte(DRIVE),
        protegeParLeVide: false,
      }),
    ).toEqual({ action: 'refuser' });
  });

  it('refuse ENCORE au passage suivant — la protection ne s’use pas', () => {
    // L'empreinte n'est pas remise à jour quand on refuse : sinon le second
    // passage croirait que la base est de nouveau « la sienne » et écraserait.
    const etat = {
      enBase: HUMAIN,
      entrant: 'Le Drive, corrigé depuis.',
      empreinteConnue: empreinte(DRIVE),
      protegeParLeVide: false,
    };
    expect(sortDuContenu(etat)).toEqual({ action: 'refuser' });
    expect(sortDuContenu(etat)).toEqual({ action: 'refuser' });
  });

  it('ÉCRIT quand la base porte encore ce que l’import y a mis', () => {
    // Le cas nominal : le Drive reste la source, et une vraie mise à jour passe.
    expect(sortDuContenu(nominal)).toEqual({ action: 'écrire' });
    expect(sortDuContenu({ ...nominal, entrant: 'Le Drive, corrigé.' })).toEqual({
      action: 'écrire',
    });
  });

  it('ÉCRIT au tout premier passage — aucune empreinte connue', () => {
    // Les 486 modules de production sont dans ce cas après la migration.
    expect(
      sortDuContenu({ enBase: '', entrant: DRIVE, empreinteConnue: null, protegeParLeVide: false }),
    ).toEqual({ action: 'écrire' });
  });

  it('ÉCRIT sur un module écrit avant la colonne, sans rien casser', () => {
    // NULL ne veut pas dire « protégé » : il veut dire « je n'ai rien à
    // protéger ici ». Le confondre aurait gelé tout le catalogue existant.
    expect(
      sortDuContenu({
        enBase: DRIVE,
        entrant: 'Le Drive, corrigé.',
        empreinteConnue: undefined,
        protegeParLeVide: false,
      }),
    ).toEqual({ action: 'écrire' });
  });

  it('laisse la garde du VIDE passer devant, pour garder le bon motif', () => {
    expect(sortDuContenu({ ...nominal, entrant: '', protegeParLeVide: true })).toEqual({
      action: 'protéger',
    });
  });

  it('ne prend pas une espace de fin pour une retouche humaine', () => {
    expect(empreinte(`${DRIVE}\n`)).toBe(empreinte(DRIVE));
    expect(sortDuContenu({ ...nominal, enBase: `  ${DRIVE}  ` })).toEqual({ action: 'écrire' });
  });

  it('voit une vraie retouche, même d’un seul caractère', () => {
    expect(empreinte(`${DRIVE}.`)).not.toBe(empreinte(DRIVE));
  });

  it('range une empreinte, jamais le texte', () => {
    const e = empreinte(HUMAIN);
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(e).not.toContain('Laurent');
  });
});

describe("ciblesSansEmpreinte — l'ordre du versement, tenu par une garde", () => {
  it('refuse une cible gérée par l’import qui ne porte AUCUNE empreinte', () => {
    // Le piège : `NULL` veut dire « rien à protéger ici ». Poser du contenu
    // humain maintenant le rendrait écrasable au premier import, qui
    // l'annoncerait en « mis à jour ».
    const refusees = ciblesSansEmpreinte([
      { sourceRef: 'drive:047#20', titre: 'Répondre aux avis clients', empreinte: null },
    ]);
    expect(refusees).toHaveLength(1);
    expect(refusees[0]!.sourceRef).toBe('drive:047#20');
  });

  it('laisse passer une cible que l’import a déjà stampée', () => {
    expect(
      ciblesSansEmpreinte([
        {
          sourceRef: 'drive:047#20',
          titre: 'Répondre aux avis clients',
          empreinte: empreinte('x'),
        },
      ]),
    ).toEqual([]);
  });

  it('ne vise PAS un module né hors import — il n’a pas de sourceRef', () => {
    // Les modules que le versement CRÉE sont dans ce cas. L'import ne les
    // connaît pas, ne les écrira jamais, et n'a rien à écraser. Les refuser
    // ferait échouer un versement légitime — et une garde qui refuse le cas
    // normal finit débranchée.
    expect(
      ciblesSansEmpreinte([
        { sourceRef: null, titre: 'Installer un rythme de suivi vendeur', empreinte: null },
      ]),
    ).toEqual([]);
  });

  it('rend TOUTES les cibles fautives, pas seulement la première', () => {
    // Un refus qui n'en nomme qu'une ferait relancer autant de fois qu'il y a
    // de cibles, en découvrant la suivante à chaque fois.
    expect(
      ciblesSansEmpreinte([
        { sourceRef: 'drive:001#1', titre: 'A', empreinte: null },
        { sourceRef: 'drive:002#1', titre: 'B', empreinte: empreinte('vu') },
        { sourceRef: 'drive:003#1', titre: 'C', empreinte: undefined },
      ]).map((c) => c.sourceRef),
    ).toEqual(['drive:001#1', 'drive:003#1']);
  });
});
