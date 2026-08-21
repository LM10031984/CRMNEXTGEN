/**
 * Composition du libellé « lieu de formation » — SOURCE UNIQUE.
 *
 * Convention établie (documentée sur `Location.legalName` dans le schéma
 * Prisma) : « {raison sociale} — {nom du lieu}, {rue}, {CP} {ville} ».
 * Cas de référence : « SARL XYZ — Agence Nice Centre, 12 rue X, 06000 Nice ».
 *
 * PROBLÈME RÉSOLU (quick 260821-md8) : en intra-entreprise, la formation se
 * tient chez le client, et `legalName` et `name` portent alors la même valeur.
 * La convention EXPERTA du 21/08 sortait donc « EXPERTA — EXPERTA, 5 place de
 * l'Ile de Beauté… ». Même chose quand le nom du lieu EST son adresse.
 *
 * La composition était par ailleurs DUPLIQUÉE entre les deux chemins de
 * `convention-core.ts` (individuel et entreprise) : un correctif appliqué à un
 * seul aurait laissé l'autre cassé. D'où ce module unique.
 *
 * MODULE PUR : aucun import Prisma, aucune I/O.
 */

export interface LieuInput {
  legalName?: string | null;
  name?: string | null;
  /**
   * `Location.address` est un Json Prisma (donc `JsonValue`) : accepté en
   * `unknown` et validé ici, plutôt que forcer un cast chez chaque appelant.
   */
  address?: unknown;
}

/**
 * Forme de comparaison : minuscules, sans accents, ponctuation et espaces
 * compactés. Sert UNIQUEMENT à décider des doublons — la valeur affichée reste
 * celle saisie, casse et accents d'origine compris.
 */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Compose le libellé du lieu sans jamais répéter un segment.
 *
 * Deux règles de dédoublonnage, volontairement DIFFÉRENTES :
 *
 *  - **Égalité** entre n'importe quels segments : un segment déjà présent
 *    n'est pas réécrit (cas « nom du lieu = adresse »).
 *  - **Inclusion** UNIQUEMENT entre raison sociale et nom du lieu, où le plus
 *    complet gagne (« EXPERTA » + « EXPERTA SAS » → « EXPERTA SAS »).
 *
 * L'inclusion n'est PAS appliquée aux segments d'adresse, sans quoi la ville
 * « Nice » disparaîtrait de « SARL XYZ — Agence Nice Centre, 12 rue X,
 * 06000 Nice » — le cas légitime de référence.
 *
 * @param fallback libellé de repli (l'adresse du siège de l'OF) quand aucun
 *   segment exploitable n'est disponible.
 */
export function formatLieuFormation(
  loc: LieuInput | null | undefined,
  fallback: string,
): string {
  if (!loc) return fallback;

  const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  // ── Identité du lieu : raison sociale + nom, dédoublonnés par inclusion ──
  const identite: string[] = [];
  for (const candidat of [clean(loc.legalName), clean(loc.name)]) {
    if (!candidat) continue;
    const n = normalize(candidat);
    if (!n) continue;
    const existantIndex = identite.findIndex((s) => {
      const e = normalize(s);
      return e === n || e.includes(n) || n.includes(e);
    });
    if (existantIndex === -1) {
      identite.push(candidat);
      continue;
    }
    // Recouvrement : on garde le segment le plus complet.
    if (normalize(identite[existantIndex]!).length < n.length) {
      identite[existantIndex] = candidat;
    }
  }

  // ── Adresse : rue, puis « CP ville » (format postal français) ────────────
  const adresse: string[] = [];
  const addr = loc.address;
  if (typeof addr === 'string') {
    const v = addr.trim();
    if (v) adresse.push(v);
  } else if (addr && typeof addr === 'object') {
    const a = addr as Record<string, unknown>;
    const street = clean(a.street);
    if (street) adresse.push(street);
    const cpVille = [clean(a.postalCode), clean(a.city)].filter(Boolean).join(' ');
    if (cpVille) adresse.push(cpVille);
  }

  // ── Égalité stricte, tous segments confondus ─────────────────────────────
  const vus = new Set(identite.map(normalize));
  const adresseRetenue: string[] = [];
  for (const segment of adresse) {
    const n = normalize(segment);
    if (!n || vus.has(n)) continue;
    vus.add(n);
    adresseRetenue.push(segment);
  }

  const tete = identite.join(' — ');
  const parties = [tete, ...adresseRetenue].filter(Boolean);
  return parties.length > 0 ? parties.join(', ') : fallback;
}
