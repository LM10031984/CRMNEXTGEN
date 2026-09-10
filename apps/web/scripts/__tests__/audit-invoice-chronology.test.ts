/**
 * Test unitaire pur (aucune BDD) du détecteur de ruptures de chronologie —
 * lot A de la spec `2026-09-10-datation-numerotation-factures.md`.
 *
 * Ce qui est prouvé ici, c'est que l'INSTRUMENT DE MESURE dit vrai. Pas que la
 * numérotation soit correcte : le générateur de numéros n'est pas touché par
 * ce lot (c'est le lot B). Un inventaire qui invente des ruptures ou qui en
 * cache est pire que pas d'inventaire du tout — le rapport part chez
 * l'expert-comptable.
 *
 * L'invariante mesurée (spec §4, mot pour mot) :
 *
 *   Pour un tenant et un préfixe donnés, l'ordre des numéros suit l'ordre des
 *   `issueDate` : number(n) > number(n-1) ⟹ issueDate(n) >= issueDate(n-1).
 */
import { describe, expect, it } from 'vitest';
import {
  auditSequence,
  diffInDays,
  parseSequenceNumber,
  rupturesNouvelles,
  RUPTURES_DOCUMENTEES,
  type ChronologyBreak,
  type ChronologyRow,
} from '../audit-invoice-chronology';

/** Une ligne minimale : seuls `number`, `issueDate` et `createdAt` comptent. */
function ligne(
  number: string,
  issueDate: string | null,
  createdAt = '2026-09-10T09:00:00Z',
): ChronologyRow {
  return {
    number,
    issueDate: issueDate === null ? null : new Date(issueDate),
    createdAt: new Date(createdAt),
    status: 'SENT',
  };
}

describe('parseSequenceNumber', () => {
  it('sépare le préfixe de la partie numérique sur le DERNIER tiret', () => {
    expect(parseSequenceNumber('FAC-000021')).toEqual({ prefix: 'FAC', seq: 21 });
    expect(parseSequenceNumber('F-202601-214')).toEqual({ prefix: 'F-202601', seq: 214 });
  });

  it('ne mélange jamais la séquence des avoirs et celle des factures', () => {
    // CGI art. 289 : deux séquences, deux chaînes. Si les deux préfixes
    // tombaient dans le même seau, AVO-000001 (janvier) « précéderait »
    // FAC-000009 (août) et l'inventaire produirait une rupture imaginaire.
    expect(parseSequenceNumber('AVO-000001')?.prefix).toBe('AVO');
    expect(parseSequenceNumber('FAC-000009')?.prefix).toBe('FAC');
    expect(parseSequenceNumber('AVO-000001')?.prefix).not.toBe(
      parseSequenceNumber('FAC-000009')?.prefix,
    );
  });

  it('refuse ce qu’il ne sait pas ordonner', () => {
    expect(parseSequenceNumber('FACTURE-JUIN')).toBeNull();
    expect(parseSequenceNumber('SANSTIRET')).toBeNull();
    expect(parseSequenceNumber('FAC-')).toBeNull();
    expect(parseSequenceNumber('-000012')).toBeNull();
  });
});

describe('diffInDays', () => {
  it('compte des jours calendaires, pas des heures', () => {
    // 23h30 le 12 puis 00h10 le 13 : un seul jour d'écart, pas 0,03.
    expect(diffInDays(new Date('2026-06-13T00:10:00Z'), new Date('2026-06-12T23:30:00Z'))).toBe(1);
  });

  it('vaut 0 le même jour et devient négatif à l’envers', () => {
    expect(diffInDays(new Date('2026-06-12T23:59:00Z'), new Date('2026-06-12T00:01:00Z'))).toBe(0);
    expect(diffInDays(new Date('2026-06-12T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(-3);
  });
});

describe('auditSequence', () => {
  it('ne signale rien quand les dates suivent les numéros', () => {
    const rapport = auditSequence('FAC', 'factures', [
      ligne('FAC-000001', '2026-06-03T00:00:00Z'),
      ligne('FAC-000002', '2026-06-12T00:00:00Z'),
    ]);

    expect(rapport.breaks).toEqual([]);
    expect(rapport.counted).toBe(2);
    expect(rapport.withoutIssueDate).toEqual([]);
    expect(rapport.malformed).toEqual([]);
  });

  it('trouve le cas décrit dans la spec : une facture de juin émise en septembre', () => {
    // §1 : « facturer en septembre une session de juin produit FAC-000021 daté
    // du 12 juin juste après FAC-000020 daté du 3 septembre ».
    const rapport = auditSequence('FAC', 'factures', [
      ligne('FAC-000020', '2026-09-03T00:00:00Z', '2026-09-03T10:00:00Z'),
      ligne('FAC-000021', '2026-06-12T00:00:00Z', '2026-09-10T14:00:00Z'),
    ]);

    expect(rapport.breaks).toHaveLength(1);
    const rupture = rapport.breaks[0]!;
    expect(rupture.number).toBe('FAC-000021');
    expect(rupture.previousNumber).toBe('FAC-000020');
    expect(rupture.backwardDays).toBe(83); // 12/06 → 03/09
    expect(rupture.antidatedDays).toBe(90); // 12/06 → 10/09 (établissement réel)
    expect(rupture.previousIssueDate.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(rapport.counted).toBe(2);
  });

  it('tient deux chaînes distinctes pour les avoirs et les factures', () => {
    const avoirs = auditSequence('AVO', 'avoirs', [ligne('AVO-000001', '2026-01-05T00:00:00Z')]);
    const factures = auditSequence('FAC', 'factures', [ligne('FAC-000009', '2026-08-01T00:00:00Z')]);

    expect(avoirs.breaks).toEqual([]);
    expect(factures.breaks).toEqual([]);
    expect(avoirs.counted).toBe(1);
    expect(factures.counted).toBe(1);
  });

  it('compte à part les pièces sans date d’émission et enjambe la comparaison', () => {
    // Une pièce sans issueDate ne peut ni valider ni violer l'invariante.
    const rapport = auditSequence('FAC', 'factures', [
      ligne('FAC-000001', '2026-06-03T00:00:00Z'),
      ligne('FAC-000002', null),
      ligne('FAC-000003', '2026-06-12T00:00:00Z'),
    ]);

    expect(rapport.withoutIssueDate).toEqual(['FAC-000002']);
    expect(rapport.breaks).toEqual([]);
    expect(rapport.counted).toBe(2); // FAC-000003 se compare à FAC-000001
  });

  it('trie sur la valeur numérique, pas sur la chaîne', () => {
    // Un tri lexicographique placerait FAC-000010 avant FAC-9 et inventerait
    // une rupture là où la chronologie est parfaite.
    const rapport = auditSequence('FAC', 'factures', [
      ligne('FAC-000010', '2026-08-02T00:00:00Z'),
      ligne('FAC-9', '2026-08-01T00:00:00Z'),
    ]);

    expect(rapport.breaks).toEqual([]);
    expect(rapport.counted).toBe(2);
  });

  it('met de côté un numéro hors format sans rien casser', () => {
    const rapport = auditSequence('FAC', 'factures', [
      ligne('FAC-000001', '2026-06-03T00:00:00Z'),
      ligne('FACTURE-JUIN', '2026-01-01T00:00:00Z'),
      ligne('FAC-000002', '2026-06-12T00:00:00Z'),
    ]);

    expect(rapport.malformed).toEqual(['FACTURE-JUIN']);
    expect(rapport.breaks).toEqual([]);
    expect(rapport.counted).toBe(2);
  });

  it('ne signale pas deux pièces du même jour émises à des heures différentes', () => {
    // Sinon le rapport se remplirait de fausses ruptures le jour d'une
    // facturation en série.
    const rapport = auditSequence('FAC', 'factures', [
      ligne('FAC-000001', '2026-09-10T16:00:00Z'),
      ligne('FAC-000002', '2026-09-10T09:00:00Z'),
    ]);

    expect(rapport.breaks).toEqual([]);
  });
});

describe('rupturesNouvelles — la veille se tait sur ce que la note documente déjà', () => {
  /**
   * Les 5 ruptures du parc sont FIGÉES et documentées :
   * `docs/comptabilite/note-chronologie-factures-2026.md`, périmètre arrêté au
   * 10/09/2026, dernière pièce sous l'ancienne règle FAC-000031. Le lot C étant
   * fermé, elles ne disparaîtront JAMAIS.
   *
   * Une veille qui les répète chaque matin garantit qu'on ne la lira plus — et
   * le jour où une VRAIE rupture apparaîtra, elle sera noyée dans les cinq
   * autres. C'est le seul motif de ce filtre : il ne cache rien, il rend
   * l'alerte lisible.
   *
   * ⚠ L'INVENTAIRE, lui, ne filtre rien : `pnpm invoices:audit-chronology`
   * continue de tout montrer. C'est lui qui a produit la note, et une pièce
   * opposable ne se construit pas sur une vue filtrée.
   */
  function rupture(number: string, previousNumber = 'FAC-000000'): ChronologyBreak {
    return {
      number,
      issueDate: new Date('2026-04-23T00:00:00Z'),
      createdAt: new Date('2026-09-04T10:00:00Z'),
      status: 'PAID',
      antidatedDays: 134,
      previousNumber,
      previousIssueDate: new Date('2026-08-12T00:00:00Z'),
      backwardDays: 111,
    };
  }

  it('connaît exactement les 5 ruptures de la note, pas une de plus', () => {
    expect([...RUPTURES_DOCUMENTEES].sort()).toEqual([
      'FAC-000021',
      'FAC-000024',
      'FAC-000025',
      'FAC-000027',
      'FAC-000030',
    ]);
  });

  it('se tait quand toutes les ruptures sont celles du périmètre figé', () => {
    const connues = [...RUPTURES_DOCUMENTEES].map((n) => rupture(n));
    expect(rupturesNouvelles(connues)).toEqual([]);
  });

  it('parle dès qu’une pièce NOUVELLE rompt la chronologie', () => {
    const melange = [rupture('FAC-000021'), rupture('FAC-000034'), rupture('FAC-000030')];
    const nouvelles = rupturesNouvelles(melange);

    expect(nouvelles).toHaveLength(1);
    expect(nouvelles[0]!.number).toBe('FAC-000034');
  });

  it('parle aussi quand la NOUVELLE pièce recule derrière une rupture documentée', () => {
    // Le prédécesseur est dans le périmètre figé, la fautive non : c'est la
    // fautive qui compte, sinon une rupture neuve se cacherait derrière une vieille.
    const nouvelles = rupturesNouvelles([rupture('FAC-000032', 'FAC-000030')]);
    expect(nouvelles).toHaveLength(1);
    expect(nouvelles[0]!.number).toBe('FAC-000032');
  });

  it('ne filtre rien sur une séquence qui n’a aucune rupture documentée', () => {
    const avoirs = [rupture('AVO-000004')];
    expect(rupturesNouvelles(avoirs)).toHaveLength(1);
  });
});
