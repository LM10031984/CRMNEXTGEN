import { LIBELLES_PIECE_DOSSIER, type KindPieceDossier } from './pieces-dossier';

export type DossierStage = 'PRISE_EN_CHARGE' | 'FIN_FORMATION';
export const FORMATION_EMAIL = 'formation@start-academy.fr';
export const PIECES_AGEFICE: Record<DossierStage, readonly KindPieceDossier[]> = {
  PRISE_EN_CHARGE: ['CNI', 'CFP_ATTESTATION', 'RIB', 'CONVENTION', 'AGEFICE_PA_FORM', 'PROGRAMME'],
  FIN_FORMATION: ['RIB', 'EMARGEMENT', 'ASSIDUITE', 'FACTURE_ACQUITTEE'],
};
export function controlePiecesAgefice(
  attachments: readonly { kind: string; key?: string; included: boolean; signe?: boolean }[],
  stage: DossierStage,
): string | null {
  const included = attachments.filter((a) => a.included && a.key?.trim());
  const missing = PIECES_AGEFICE[stage].filter((k) => !included.some((a) => a.kind === k));
  if (missing.length)
    return `Pièces manquantes : ${missing.map((k) => LIBELLES_PIECE_DOSSIER[k]).join(', ')}. Complétez le dossier puis actualisez les pièces.`;
  const signatures =
    stage === 'PRISE_EN_CHARGE' ? ['CONVENTION', 'AGEFICE_PA_FORM'] : ['EMARGEMENT', 'ASSIDUITE'];
  const unsigned = signatures.filter(
    (k) => !included.some((a) => a.kind === k && a.signe === true),
  );
  return unsigned.length
    ? `Signature manquante : ${unsigned.map((k) => LIBELLES_PIECE_DOSSIER[k as KindPieceDossier]).join(', ')}. Faites signer ou déposez le scan signé, puis actualisez les pièces.`
    : null;
}
export function validerNir(value: string | null | undefined): string | null {
  const nir = (value ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^[12]\d{4}(?:\d{2}|2[AB])\d{6}(?:\d{2})?$/.test(nir)) return null;
  if (nir.length === 15) {
    const base = nir.slice(0, 13).replace('2A', '19').replace('2B', '18');
    if (97 - Number(BigInt(base) % 97n) !== Number(nir.slice(13))) return null;
  }
  return nir;
}
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
export function messageAgefice(
  stage: DossierStage,
  firstName: string,
  lastName: string,
  nir?: string | null,
) {
  const name = `${firstName} ${lastName.toUpperCase()}`;
  const text =
    stage === 'FIN_FORMATION'
      ? `Bonjour,\n\nJ'espère que vous allez bien.\n\nVoici la fin de formation pour ${name}\nCi-joint toutes les signatures, la facture.\n\nBonne journée,\n\nBéatrice Blanc`
      : `Bonjour,\n\nJe vous prie de trouver ci-joint une nouvelle demande de prise en charge pour ${name}\nSon numéro de sécurité sociale : ${nir ?? ''}\n\nMerci\n\nBien à vous,\n\nBéatrice Blanc`;
  return {
    subject:
      stage === 'FIN_FORMATION'
        ? `FIN DE FORMATION pour ${name}`
        : `Demande de prise en charge pour ${name}`,
    text,
    html: text
      .split('\n\n')
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
      .join('\n'),
  };
}
