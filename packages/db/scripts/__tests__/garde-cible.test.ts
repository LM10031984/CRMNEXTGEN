/**
 * La garde de cible — la base d'écriture est-elle bien celle du relevé ?
 *
 * Un import identifie sa base au début du run, sur une chaîne de connexion, et
 * écrit sur une autre (`DIRECT_URL`, seule capable de tenir une transaction
 * interactive). Entre les deux, rien ne prouvait que c'était la même base.
 *
 * Ce que ces tests protègent tient en une phrase : **le corps de l'écriture ne
 * tourne pas si les marqueurs ne concordent pas.** Pas « une erreur est
 * signalée » — pas écrit du tout. C'est la différence entre une garde et un
 * avertissement.
 *
 * Aucun I/O : la garde reçoit un faux client et une fausse relecture.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  CibleInattendueError,
  ecartsDeCible,
  transactionGardee,
  type MarqueursCible,
} from '../lib/garde-cible.js';

const PROD: MarqueursCible = {
  tenantId: 'db191440-a144-48d1-93c1-767e6f647f2c',
  tenantNom: 'Start Academy',
  produits: 51,
  modules: 86,
};

/** Un client dont `$transaction` exécute simplement le corps qu'on lui donne. */
function clientFactice() {
  return {
    $transaction: <R>(fn: (tx: symbol) => Promise<R>): Promise<R> => fn(Symbol('tx')),
  };
}

describe('ecartsDeCible — ce qui diffère, nommé', () => {
  it('ne trouve aucun écart quand les quatre marqueurs concordent', () => {
    expect(ecartsDeCible(PROD, { ...PROD })).toEqual([]);
  });

  it('nomme le tenant introuvable plutôt que de rendre une liste vide', () => {
    // Une liste vide voudrait dire « tout va bien ». Un tenant absent est le
    // signal le plus fort qu'on n'est pas sur la bonne base.
    const ecarts = ecartsDeCible(PROD, null);
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]).toContain('INTROUVABLE');
  });

  it('rend les DEUX valeurs, attendue et lue — pas un simple « faux »', () => {
    // « La base est fausse » ne dit pas quoi regarder. « 51 attendus, 123 lus »
    // le dit, et distingue tout de suite un import déjà passé d'une autre base.
    const ecarts = ecartsDeCible(PROD, { ...PROD, produits: 123 });
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]).toContain('51');
    expect(ecarts[0]).toContain('123');
  });

  it("voit une base d'aperçu : même tenant, même schéma, d'autres chiffres", () => {
    // Le cas qui a motivé la garde (§4 sexies). Un `SELECT` n'y lèverait
    // aucune erreur — il rendrait des chiffres faux en silence.
    expect(ecartsDeCible(PROD, { ...PROD, produits: 12, modules: 4 })).toHaveLength(2);
  });

  it('voit un nom de tenant qui diffère à tenant id égal', () => {
    expect(ecartsDeCible(PROD, { ...PROD, tenantNom: 'Start Academy (aperçu)' })).toHaveLength(1);
  });
});

describe("transactionGardee — le corps ne tourne pas si la cible n'est pas la bonne", () => {
  it('exécute le corps quand les marqueurs concordent', async () => {
    const corps = vi.fn(async () => 'écrit');
    const res = await transactionGardee(clientFactice(), PROD, async () => ({ ...PROD }), corps);
    expect(res).toBe('écrit');
    expect(corps).toHaveBeenCalledOnce();
  });

  it("N'APPELLE PAS le corps quand un marqueur diffère", async () => {
    const corps = vi.fn(async () => 'écrit');
    await expect(
      transactionGardee(clientFactice(), PROD, async () => ({ ...PROD, modules: 999 }), corps),
    ).rejects.toBeInstanceOf(CibleInattendueError);
    // Le cœur du fichier : zéro appel. Une garde qui laisse écrire puis
    // signale n'est pas une garde.
    expect(corps).not.toHaveBeenCalled();
  });

  it("n'appelle pas le corps quand le tenant est introuvable", async () => {
    const corps = vi.fn(async () => 'écrit');
    await expect(
      transactionGardee(clientFactice(), PROD, async () => null, corps),
    ).rejects.toBeInstanceOf(CibleInattendueError);
    expect(corps).not.toHaveBeenCalled();
  });

  it('relit AVANT le corps, jamais après', async () => {
    // L'ordre est la garde. S'il s'inverse, tout le reste est décoratif.
    const ordre: string[] = [];
    await transactionGardee(
      clientFactice(),
      PROD,
      async () => {
        ordre.push('relecture');
        return { ...PROD };
      },
      async () => {
        ordre.push('corps');
      },
    );
    expect(ordre).toEqual(['relecture', 'corps']);
  });
});
