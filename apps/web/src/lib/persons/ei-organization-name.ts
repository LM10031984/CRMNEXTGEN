/**
 * Alignement du nom d'un apprenant et de la raison sociale de SON auto-entreprise.
 *
 * Problème (Laurent 2026-09-08, cas EL GUERTIT) : à la création d'un apprenant
 * avec un SIRET, l'application fige `Organization.legalName = "Prénom Nom"`
 * (`crud-edits.ts`). Corriger ensuite la fiche apprenant ne touchait jamais
 * cette raison sociale — la convention affichait donc le nom corrigé pour la
 * personne ET l'ancien pour le payeur, d'où la « correction à moitié ».
 *
 * PRUDENCE, et elle n'est pas théorique. Sur les 238 liens `EI_SELF` en
 * production, 31 ont une raison sociale qui diverge du nom du titulaire, dont :
 *  - de vraies sociétés (« EVIMERIA » SAS, « Habitat Concept Immo » SARL) ;
 *  - des noms de naissance légitimes (« LOUCHART JEAN-DOAT Sylvie ») ;
 *  - des liens manifestement erronés (« Marion Maino » ↔ « Wilfried GILBERT »).
 *
 * Une raison sociale est une donnée LÉGALE qui part sur les conventions et les
 * pièces OPCO. On ne renomme donc QUE ce que l'application avait elle-même
 * dérivé du nom : quand la raison sociale actuelle est exactement l'ancien nom
 * de la personne. Tout le reste est signalé à l'utilisateur, jamais réécrit.
 */

/** Mots normalisés (sans accent, sans casse, sans ponctuation), triés. */
function nameTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort();
}

/**
 * Clé de comparaison insensible à l'ordre : « GUERTIT Houssain » et
 * « Houssain GUERTIT » donnent la même clé, car les deux écritures circulent
 * (l'OCR rend tantôt l'une, tantôt l'autre).
 */
export function legalNameKey(raw: string | null | undefined): string {
  return nameTokens(raw).join(' ');
}

export function personNameKey(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return legalNameKey(`${firstName ?? ''} ${lastName ?? ''}`);
}

/** Raison sociale dérivée d'un nom — même format qu'à la création. */
export function buildEiLegalName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return `${(firstName ?? '').trim()} ${(lastName ?? '').trim()}`.trim();
}

export type EiRenameVerdict =
  /** La raison sociale EST l'ancien nom → on la corrige avec le nouveau. */
  | 'rename'
  /** Elle contient l'ancien nom sans lui être égale → on alerte, on n'écrit pas. */
  | 'warn'
  /** Sans rapport (vraie société) → silence. */
  | 'ignore';

export interface ClassifyEiRenameInput {
  /** Raison sociale actuelle de l'organisation liée en EI_SELF. */
  legalName: string | null | undefined;
  oldFirstName: string | null | undefined;
  oldLastName: string | null | undefined;
}

export function classifyEiRename({
  legalName,
  oldFirstName,
  oldLastName,
}: ClassifyEiRenameInput): EiRenameVerdict {
  const orgKey = legalNameKey(legalName);
  if (!orgKey) return 'ignore';

  const personKey = personNameKey(oldFirstName, oldLastName);
  if (personKey && orgKey === personKey) return 'rename';

  // Sinon : la raison sociale contient-elle encore un morceau de l'ancien nom ?
  // On teste sur les mots du NOM DE FAMILLE seulement — un prénom courant
  // (« Sophie », « Julien ») ferait sonner l'alerte sur des sociétés sans rapport.
  const orgWords = new Set(nameTokens(legalName));
  const lastWords = nameTokens(oldLastName).filter((w) => w.length >= 3);
  if (lastWords.length > 0 && lastWords.every((w) => orgWords.has(w))) return 'warn';

  return 'ignore';
}
