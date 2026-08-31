/**
 * Retour contextuel entre fiches (`?from=`).
 *
 * Problème résolu : ouvrir un apprenant depuis une fiche session puis cliquer
 * « Retour » ramenait sur la liste de TOUS les apprenants (remonté par Laurent
 * le 31/08). `BackToListLink` s'appuyait sur `document.referrer`, qui n'est pas
 * mis à jour par les navigations client de l'App Router — il reste celui du
 * dernier chargement complet du document.
 *
 * Ici, la page d'origine s'annonce explicitement dans l'URL : fiable au
 * rafraîchissement, en navigation client et en ouverture dans un nouvel onglet.
 *
 * Module NEUTRE (pas de `'use client'`) : importable depuis un composant
 * serveur comme client, et testable sans DOM.
 */

/** Préfixes connus → libellé du bouton retour. Le plus spécifique d'abord. */
const LABELS: ReadonlyArray<readonly [string, string]> = [
  ['/app/sessions/', 'Retour à la session'],
  ['/app/organisations/', "Retour à l'organisation"],
  ['/app/factures/', 'Retour à la facture'],
  ['/app/produits/', 'Retour au produit'],
  ['/app/inscriptions/', 'Retour à la pré-inscription'],
  ['/app/preinscriptions/', 'Retour à la pré-inscription'],
  ['/app/dossiers-opco/', 'Retour au dossier OPCO'],
  ['/app/budget-agefice', 'Retour au budget AGEFICE'],
  ['/app/formateurs/', 'Retour au formateur'],
  ['/app/devis/', 'Retour au devis'],
];

/** Caractères de contrôle (dont saut de ligne) — refusés dans une URL de retour. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Valide une valeur `?from=` reçue d'une URL.
 *
 * N'accepte qu'un chemin interne de l'app : commence par `/app/`, pas de
 * schéma (`http:`, `javascript:`), pas de `//host` ni de `\host` (contournements
 * classiques d'open redirect), pas de caractère de contrôle.
 */
export function parseFrom(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/app/')) return null;
  if (value.startsWith('//') || value.includes('\\')) return null;
  if (CONTROL_CHARS.test(value)) return null;
  return value;
}

/** Libellé du bouton retour pour une origine validée. */
export function labelForFrom(from: string, fallbackLabel: string): string {
  const hit = LABELS.find(([prefix]) => from.startsWith(prefix));
  return hit ? hit[1] : fallbackLabel;
}

/**
 * Ajoute `?from=<origine>` à un lien sortant, en préservant les query params
 * déjà présents (ex. `/app/apprenants/x?tab=activity`) et le fragment.
 * Renvoie `href` inchangé si l'origine est absente ou invalide.
 */
export function withFrom(href: string, from: string | null | undefined): string {
  const safe = parseFrom(from);
  if (!safe) return href;
  const [beforeHash, ...hashParts] = href.split('#');
  const base = beforeHash ?? '';
  const hash = hashParts.length > 0 ? `#${hashParts.join('#')}` : '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}from=${encodeURIComponent(safe)}${hash}`;
}
