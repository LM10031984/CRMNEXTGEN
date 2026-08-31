import { describe, it, expect } from 'vitest';
import { resolveConventionDateIso, resolveConventionDate } from '../convention-date';

/**
 * « Sur EXPERTA la date de signature sort au 16/09, explique pourquoi » —
 * Laurent, 31/08.
 *
 * Le calcul était juste : session du 7 octobre, 15 jours ouvrés avant = 16
 * septembre. Le défaut était ailleurs — cette date est dans le FUTUR au moment
 * où l'on génère. On ne fait pas signer un document daté de trois semaines plus
 * tard, et en audit une convention signée avant sa propre date se voit.
 *
 * Test de puissance : retirer le plafond `regle > todayIso` fait virer ROUGE
 * « ne date jamais une convention dans le futur ».
 */

describe('resolveConventionDateIso', () => {
  it('ne date jamais une convention dans le futur', () => {
    // Session du 7 octobre, générée le 31 août : la règle donnerait le 16/09.
    expect(resolveConventionDateIso('2026-10-07', '2026-08-31')).toBe('2026-08-31');
  });

  it('garde J-15 ouvrés quand cette date est déjà passée (régularisation)', () => {
    // Même session, générée le 25 septembre : le 16/09 est derrière nous.
    expect(resolveConventionDateIso('2026-10-07', '2026-09-25')).toBe('2026-09-16');
  });

  it('vérifie le calcul d’origine : 7 octobre − 15 jours ouvrés = 16 septembre', () => {
    expect(resolveConventionDateIso('2026-10-07', '2027-01-01')).toBe('2026-09-16');
  });

  it('laisse la date saisie l’emporter — elle seule connaît la négociation', () => {
    expect(resolveConventionDateIso('2026-10-07', '2026-08-31', '2026-09-02')).toBe('2026-09-02');
  });

  it('ignore une saisie malformée plutôt que de la propager', () => {
    for (const saisie of ['02/09/2026', 'bientôt', '2026-9-2', '']) {
      expect(resolveConventionDateIso('2026-10-07', '2026-08-31', saisie)).toBe('2026-08-31');
    }
  });

  it('rend une Date UTC pour les gabarits', () => {
    const d = resolveConventionDate(new Date('2026-10-07T08:00:00Z'), new Date('2026-08-31T15:00:00Z'));
    expect(d.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });
});
