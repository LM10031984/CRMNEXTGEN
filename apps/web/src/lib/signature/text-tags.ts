/**
 * Ancres de signature — « text tags » DocuSeal (spec 2026-09-04 §5 lot B, D-7).
 *
 * DocuSeal construit ses champs à partir du TEXTE du PDF : une occurrence de
 * `{{Signature client;role=Client;type=signature}}` devient un champ signature
 * attribué au rôle « Client », à l'endroit exact où le texte est imprimé.
 * D'où la décision D-7 : aucune coordonnée à maintenir côté QualiOF — on pose
 * l'ancre dans le gabarit HTML, WeasyPrint la place, DocuSeal la trouve.
 *
 * Deux contraintes gouvernent le rendu :
 *  - **invisible** : blanc sur blanc. Le lecteur humain ne doit rien voir, et
 *    DocuSeal retire de toute façon les tags du PDF final (`remove_tags`).
 *  - **insécable** : un tag coupé en fin de ligne par WeasyPrint n'est plus
 *    reconnu — et l'échec est silencieux (envoi parti, rien à signer). D'où
 *    `white-space: nowrap` et un `font-size` volontairement minuscule.
 */

/**
 * Les rôles sont partagés entre les gabarits (qui les impriment) et la
 * résolution des signataires (qui les attribue). Un rôle mal orthographié
 * d'un côté = champ orphelin de l'autre : d'où la constante unique.
 */
export const SIGNATURE_ROLES = {
  /** Dirigeant de l'entreprise bénéficiaire — convention entreprise. */
  CLIENT: 'Client',
  /** Le stagiaire lui-même — dossier AGEFICE, attestation d'assiduité. */
  STAGIAIRE: 'Stagiaire',
  /** Le signataire de l'organisme de formation (D-1). */
  OF: 'Organisme de formation',
} as const;

export type SignatureRoleName = (typeof SIGNATURE_ROLES)[keyof typeof SIGNATURE_ROLES];

/** Types de champ DocuSeal utilisés par QualiOF. */
export type SignatureTagType = 'signature' | 'initials' | 'date' | 'datenow' | 'text';

export interface SignatureTagOptions {
  /** Nom du champ, affiché au signataire. */
  name: string;
  role: string;
  type: SignatureTagType;
  /** Largeur du champ — sinon DocuSeal prend celle du texte rendu. */
  width?: number;
  /** Hauteur du champ. */
  height?: number;
  /** Champ obligatoire par défaut côté DocuSeal. */
  required?: boolean;
}

/** Options de rendu de la zone qui accueille l'ancre. */
export interface SignatureAnchorOptions extends SignatureTagOptions {
  /** Côté du cadre où coller la zone. Défaut : droite. */
  align?: 'left' | 'right';
  /** Marge autour de la zone, en points. Défaut : 8. */
  margin?: number;
}

/**
 * Dimensions par défaut de la zone de signature, en points PDF.
 *
 * 180 × 60 pt ≈ 63 × 21 mm : de quoi accueillir un paraphe tracé à la souris
 * ou au doigt sans qu'il déborde, tout en tenant dans un cadre de convention.
 * Les unités `width`/`height` des text tags DocuSeal se comportent comme des
 * points PDF (mesuré sur l'envoi 1619115), d'où l'égalité entre la taille
 * déclarée au prestataire et la place réservée dans le gabarit.
 */
export const SIGNATURE_ZONE_WIDTH_PT = 180;
export const SIGNATURE_ZONE_HEIGHT_PT = 60;

/** `;` `{` `}` `=` cassent la grammaire du tag — mieux vaut échouer bruyamment. */
const CARACTERES_INTERDITS = /[;{}=]/;

function verifierSegment(valeur: string, quoi: string): string {
  const v = valeur.trim();
  if (!v) throw new Error(`Ancre de signature : ${quoi} vide`);
  if (CARACTERES_INTERDITS.test(v)) {
    throw new Error(`Ancre de signature : caractère interdit dans ${quoi} (« ; { } = ») — « ${v} »`);
  }
  return v;
}

/**
 * Construit le tag littéral. L'ordre des attributs est stable (nom, role, type,
 * puis les options) pour que les tests et les diffs restent lisibles.
 */
export function signatureTag(opts: SignatureTagOptions): string {
  const name = verifierSegment(opts.name, 'le nom du champ');
  const role = verifierSegment(opts.role, 'le rôle');

  const parts = [name, `role=${role}`, `type=${opts.type}`];
  if (opts.required === false) parts.push('required=false');
  if (opts.width !== undefined) parts.push(`width=${opts.width}`);
  if (opts.height !== undefined) parts.push(`height=${opts.height}`);

  return `{{${parts.join(';')}}}`;
}

/**
 * Rend l'ancre en HTML, prête à être injectée dans un gabarit WeasyPrint.
 *
 * Le texte est bien présent dans le PDF (donc extractible par DocuSeal), mais
 * blanc, minuscule et insécable — invisible à l'écran comme à l'impression.
 */
export function renderSignatureAnchor(opts: SignatureAnchorOptions): string {
  const width = opts.width ?? SIGNATURE_ZONE_WIDTH_PT;
  const height = opts.height ?? SIGNATURE_ZONE_HEIGHT_PT;
  const align = opts.align ?? 'right';
  const margin = opts.margin ?? 8;

  const tag = signatureTag({ ...opts, width, height });

  // Une ZONE, pas un simple texte. Le champ DocuSeal démarre à l'ancre et
  // s'étend vers le bas ET vers la droite : posée en bas à gauche du cadre,
  // l'ancre le faisait déborder deux fois (constaté sur l'envoi EU 1619115,
  // signé le 10/09/2026 — la signature du client chevauchait la bordure et le
  // libellé du bloc de l'OF). La zone occupe donc elle-même la place du champ,
  // à l'intérieur du cadre, avec une marge pour que le tracé ne touche jamais
  // la bordure.
  //
  // L'ancre est le PREMIER contenu de la zone, donc en haut à gauche : le
  // champ se déploie exactement sur la zone réservée.
  const marges =
    align === 'right'
      ? `margin-left: auto; margin-right: ${margin}pt;`
      : `margin-right: auto; margin-left: ${margin}pt;`;

  return (
    `<div aria-hidden="true" style="width: ${width}pt; height: ${height}pt;` +
    ` ${marges} margin-top: ${margin}pt; margin-bottom: ${margin}pt;` +
    ' overflow: hidden;">' +
    '<span style="color: #FFFFFF; font-size: 4pt; line-height: 1;' +
    ' white-space: nowrap; letter-spacing: 0;">' +
    tag +
    '</span>' +
    '</div>'
  );
}
