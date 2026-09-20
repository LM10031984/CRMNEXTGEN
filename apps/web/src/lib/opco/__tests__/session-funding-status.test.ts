import { describe, expect, it } from 'vitest';
import {
  aggregateFundingTone,
  companyDepositState,
  isSuccessfulInitialSubmission,
} from '../session-funding-status';

describe('suivi financement de session', () => {
  it.each(['SENT', 'ACK_RECEIVED', 'APPROVED', 'REIMBURSED'])(
    'considère %s comme déposé uniquement avec une remise initiale réelle',
    (status) => {
      expect(
        isSuccessfulInitialSubmission({ stage: 'PRISE_EN_CHARGE', status, deliveryState: 'READY', sentAt: new Date() }),
      ).toBe(true);
      expect(
        isSuccessfulInitialSubmission({ stage: 'PRISE_EN_CHARGE', status, deliveryState: 'READY', sentAt: null }),
      ).toBe(false);
      expect(
        isSuccessfulInitialSubmission({ stage: 'FIN_FORMATION', status, deliveryState: 'READY', sentAt: new Date() }),
      ).toBe(false);
    },
  );

  it.each(['DRAFT', 'REJECTED', 'CANCELED'])('ne met jamais un envoi %s au vert', (status) => {
    expect(
      isSuccessfulInitialSubmission({ stage: 'PRISE_EN_CHARGE', status, deliveryState: 'READY', sentAt: new Date() }),
    ).toBe(false);
  });

  it.each(['SENDING', 'UNCERTAIN'])('ne met jamais une remise %s au vert', (deliveryState) => {
    expect(isSuccessfulInitialSubmission({
      stage: 'PRISE_EN_CHARGE', status: 'SENT', deliveryState, sentAt: new Date(),
    })).toBe(false);
  });

  it('rend le dépôt entreprise partiel dès qu’un membre actif est sans déclaration', () => {
    expect(companyDepositState([{ opcoDepositedAt: new Date() }, { opcoDepositedAt: null }])).toBe(
      'warning',
    );
    expect(
      companyDepositState([{ opcoDepositedAt: new Date() }, { opcoDepositedAt: new Date() }]),
    ).toBe('success');
    expect(companyDepositState([{ opcoDepositedAt: null }])).toBe('neutral');
  });

  it('agrège sans masquer un dossier incomplet', () => {
    expect(aggregateFundingTone(['success', 'warning'])).toBe('warning');
    expect(aggregateFundingTone(['success', 'success'])).toBe('success');
    expect(aggregateFundingTone(['neutral', 'neutral'])).toBe('neutral');
  });
});
