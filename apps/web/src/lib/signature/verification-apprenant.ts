import type { SignataireResolu } from './envoi-contrats';
import type { SignatureSignerInput } from './port';
import { signaturePhone } from './phone';

/** Le signataire résolu fait foi : ne jamais utiliser le mobile d'un salarié
 * pour vérifier la signature de son représentant d'entreprise. */
export function verificationApprenant(
  signataire: SignataireResolu,
  mobile: string | null | undefined,
): { ok: true; configuration: Pick<SignatureSignerInput, 'verification' | 'phone'> }
  | { ok: false; error: string } {
  if (!['APPRENANT_STAGIAIRE', 'APPRENANT_EI_SELF', 'APPRENANT_REPLI'].includes(signataire.sourceNom)) {
    return { ok: true, configuration: {} };
  }
  try {
    return { ok: true, configuration: { verification: 'sms', phone: signaturePhone(mobile ?? undefined) } };
  } catch {
    return { ok: false, error: `Mobile absent ou invalide pour « ${signataire.nom} » : renseignez un numéro mobile sur sa fiche apprenant (06/07 français ou indicatif international). Le code SMS est obligatoire avant la signature.` };
  }
}
