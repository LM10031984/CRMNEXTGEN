import { describe, expect, it } from 'vitest';
import { verificationApprenant } from '../verification-apprenant';
import type { SignataireResolu } from '../envoi-contrats';

const signataire: SignataireResolu = {
  nom: 'Marie TEST', email: 'marie@example.test', sourceNom: 'APPRENANT_STAGIAIRE', sourceEmail: 'PERSON',
};

describe('SMS uniquement pour le signataire apprenant', () => {
  it.each(['APPRENANT_STAGIAIRE', 'APPRENANT_EI_SELF', 'APPRENANT_REPLI'] as const)('%s utilise le mobile de sa fiche', (sourceNom) => {
    expect(verificationApprenant({ ...signataire, sourceNom }, '06 31 05 63 90')).toEqual({
      ok: true, configuration: { verification: 'sms', phone: '+33631056390' },
    });
  });
  it.each(['ORG_REPRESENTATIVE', 'CONTACT_PRINCIPAL'] as const)('%s ne reçoit jamais le SMS destiné à un apprenant', (sourceNom) => {
    expect(verificationApprenant({ ...signataire, sourceNom }, '0631056390')).toEqual({ ok: true, configuration: {} });
    expect(verificationApprenant({ ...signataire, sourceNom }, null)).toEqual({ ok: true, configuration: {} });
  });
  it('une adresse email dérogatoire ne supprime pas la vérification SMS de l’apprenant', () => {
    expect(verificationApprenant({ ...signataire, sourceEmail: 'SAISI_PAR_ADMIN' }, '0631056390'))
      .toMatchObject({ ok: true, configuration: { verification: 'sms' } });
  });
  it.each([null, undefined, '', '0131056390', '0631'])('refuse le mobile %s sans repli email', (mobile) => {
    expect(verificationApprenant(signataire, mobile)).toEqual({ ok: false, error: expect.stringContaining('Marie TEST') });
  });
});
