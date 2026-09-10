import { describe, it, expect } from 'vitest';
import {
  apprenantKeyPrefix,
  filterOwnApprenantKeys,
  isOwnApprenantKey,
} from '../apprenant-keys';

/**
 * Quick 260908-lrj. Les clés arrivent du navigateur après un upload direct :
 * elles doivent être traitées comme une entrée utilisateur, pas comme une
 * valeur de confiance.
 */

const TENANT = 'db191440-a144-48d1-93c1-767e6f647f2c';
const OTHER = '00000000-0000-0000-0000-000000000000';

describe('isOwnApprenantKey', () => {
  it('accepte une clé produite par createApprenantUploadUrl pour ce tenant', () => {
    expect(isOwnApprenantKey(`apprenants/${TENANT}/9f13-uuid/cni.pdf`, TENANT)).toBe(true);
  });

  it("refuse la clé d'un autre tenant", () => {
    expect(isOwnApprenantKey(`apprenants/${OTHER}/9f13-uuid/cni.pdf`, TENANT)).toBe(false);
  });

  it('refuse une clé hors du dossier des pièces apprenant', () => {
    expect(isOwnApprenantKey('closure/x/SES-0110/certificat.pdf', TENANT)).toBe(false);
    expect(isOwnApprenantKey('factures/FAC-000030.pdf', TENANT)).toBe(false);
  });

  it('refuse une remontée d’arborescence ou un chemin absolu', () => {
    expect(isOwnApprenantKey(`apprenants/${TENANT}/../${OTHER}/cni.pdf`, TENANT)).toBe(false);
    expect(isOwnApprenantKey(`/apprenants/${TENANT}/x/cni.pdf`, TENANT)).toBe(false);
  });

  it('refuse le vide et les entrées manquantes', () => {
    expect(isOwnApprenantKey(null, TENANT)).toBe(false);
    expect(isOwnApprenantKey('', TENANT)).toBe(false);
    expect(isOwnApprenantKey(`apprenants/${TENANT}/x/cni.pdf`, '')).toBe(false);
  });

  it("ne se laisse pas berner par un tenant qui n'est qu'un préfixe d'un autre", () => {
    // « apprenants/abc-1/… » ne doit pas passer pour le tenant « abc ».
    expect(isOwnApprenantKey('apprenants/abc-1/x/cni.pdf', 'abc')).toBe(false);
    expect(apprenantKeyPrefix('abc')).toBe('apprenants/abc/');
  });
});

describe('filterOwnApprenantKeys', () => {
  it('sépare les clés légitimes des clés étrangères', () => {
    const r = filterOwnApprenantKeys(
      {
        CNI: `apprenants/${TENANT}/a/cni.pdf`,
        RIB: `apprenants/${OTHER}/b/rib.pdf`,
        CFP: undefined,
      },
      TENANT,
    );
    expect(r.accepted).toEqual({ CNI: `apprenants/${TENANT}/a/cni.pdf` });
    expect(r.rejected).toEqual(['RIB']);
  });

  it('objet vide → rien accepté, rien rejeté', () => {
    expect(filterOwnApprenantKeys({}, TENANT)).toEqual({ accepted: {}, rejected: [] });
  });
});
