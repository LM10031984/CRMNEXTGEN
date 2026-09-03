import { describe, it, expect } from 'vitest';
import {
  calculerEcheanceConservation,
  estEchu,
  DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES,
} from '../retention';

/**
 * Registre art. 30, Traitement 5 : les traces d'envoi (`EmailMessage`) sont
 * « conservées avec le dossier de formation ».
 *
 * Ce que ces tests verrouillent, c'est l'ANCRAGE : l'échéance se compte depuis
 * la fin de la FORMATION, pas depuis la date d'envoi du mail. Une convocation
 * envoyée six mois avant une session ne doit pas être purgée six mois avant le
 * dossier qu'elle documente.
 */

const ENVOI = new Date('2026-03-01T09:00:00.000Z');
const CREATION = new Date('2026-03-01T09:00:00.000Z');

describe('ancrage de l’échéance', () => {
  it('se compte depuis la fin de session, pas depuis l’envoi', () => {
    const e = calculerEcheanceConservation({
      sentAt: ENVOI,
      createdAt: CREATION,
      finsDeSession: [new Date('2026-10-14T16:00:00.000Z')],
    });
    expect(e.toISOString().slice(0, 10)).toBe(
      `${2026 + DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES}-10-14`,
    );
  });

  it('retient la session la PLUS TARDIVE quand l’envoi en portait plusieurs', () => {
    const e = calculerEcheanceConservation({
      sentAt: ENVOI,
      createdAt: CREATION,
      finsDeSession: [new Date('2026-05-10T00:00:00.000Z'), new Date('2027-01-20T00:00:00.000Z')],
    });
    expect(e.getFullYear()).toBe(2027 + DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES);
    expect(e.toISOString().slice(5, 10)).toBe('01-20');
  });

  it('trace orpheline (documents supprimés) : repli sur la date d’envoi', () => {
    const e = calculerEcheanceConservation({ sentAt: ENVOI, createdAt: CREATION, finsDeSession: [] });
    expect(e.getFullYear()).toBe(2026 + DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES);
    expect(e.toISOString().slice(5, 10)).toBe('03-01');
  });

  it('sans date d’envoi : repli sur la création de la trace', () => {
    const e = calculerEcheanceConservation({
      sentAt: null,
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      finsDeSession: [],
    });
    expect(e.toISOString().slice(0, 10)).toBe(
      `${2026 + DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES}-04-02`,
    );
  });
});

describe('échéance atteinte ou non', () => {
  const trace = {
    sentAt: ENVOI,
    createdAt: CREATION,
    finsDeSession: [new Date('2026-10-14T16:00:00.000Z')],
  };

  it('la veille de l’échéance, on garde', () => {
    const veille = new Date(`${2026 + DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES}-10-13T00:00:00.000Z`);
    expect(estEchu(trace, veille)).toBe(false);
  });

  it('le jour de l’échéance, on purge', () => {
    const jour = new Date(`${2026 + DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES}-10-14T16:00:00.000Z`);
    expect(estEchu(trace, jour)).toBe(true);
  });

  it('une formation qui vient de se terminer n’est jamais purgée', () => {
    expect(estEchu(trace, new Date('2026-10-15T00:00:00.000Z'))).toBe(false);
  });

  it('la durée est un paramètre : la changer dans le registre suffit', () => {
    const dans4ans = new Date('2030-10-15T00:00:00.000Z');
    expect(estEchu(trace, dans4ans, 3)).toBe(true);
    expect(estEchu(trace, dans4ans, 10)).toBe(false);
  });
});
