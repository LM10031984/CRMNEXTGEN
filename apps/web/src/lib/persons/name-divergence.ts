/**
 * Détection des divergences d'identité entre les pièces d'un apprenant.
 *
 * Déclencheur (Laurent, 2026-09-08) : « attention à l'OCR qui a confondu
 * EL GUERTIT avec EL GUERTIJ ». Un T lu J sur une CNI, et le mauvais nom part
 * dans la convention, l'attestation d'assiduité et la raison sociale de
 * l'auto-entreprise. Le croisement SIRENE ne rattrape pas le coup : beaucoup
 * d'auto-entrepreneurs sont `[NON-DIFFUSIBLE]` (vérifié sur ce cas précis).
 *
 * Mais le nom figure sur PLUSIEURS pièces : la carte d'identité et
 * l'attestation URSSAF (CFP). Jusqu'ici l'extraction gardait la CNI en
 * priorité et jetait l'autre valeur en silence — donc une lecture douteuse
 * passait inaperçue. On compare désormais les deux et on le dit.
 *
 * Le module est PUR : il ne décide rien, il signale. C'est l'humain qui
 * tranche, pièce sous les yeux.
 */

/** Comparaison tolérante : accents, casse, ponctuation et espaces ignorés. */
function fold(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Distance de Levenshtein, plafonnée : au-delà de `max`, on s'arrête — on veut
 * juste savoir si deux chaînes sont « à une ou deux lettres près ».
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    if (Math.min(...cur) > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export interface IdentitySource {
  /** Libellé de la pièce, tel qu'affiché à l'utilisateur. */
  label: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface NameDivergence {
  field: 'nom' | 'prénom';
  /** Vrai quand les deux valeurs ne diffèrent que d'une ou deux lettres —
   *  la signature d'une confusion de lecture, pas d'une autre personne. */
  looksLikeOcrTypo: boolean;
  message: string;
}

/**
 * Compare deux pièces sur le nom et le prénom. Retourne un signalement par
 * champ divergent — jamais de correction automatique.
 */
export function detectNameDivergences(a: IdentitySource, b: IdentitySource): NameDivergence[] {
  const out: NameDivergence[] = [];
  const fields: Array<{ field: NameDivergence['field']; key: 'firstName' | 'lastName' }> = [
    { field: 'nom', key: 'lastName' },
    { field: 'prénom', key: 'firstName' },
  ];

  for (const { field, key } of fields) {
    const va = a[key];
    const vb = b[key];
    // Une valeur absente n'est pas une divergence : la pièce ne portait pas
    // l'information, ou l'OCR ne l'a pas trouvée.
    if (!va || !vb) continue;
    const fa = fold(va);
    const fb = fold(vb);
    if (!fa || !fb || fa === fb) continue;

    const d = editDistance(fa, fb);
    const looksLikeOcrTypo = d > 0 && d <= 2;
    out.push({
      field,
      looksLikeOcrTypo,
      message: looksLikeOcrTypo
        ? `Le ${field} diffère d'une lettre entre ${a.label} (« ${va} ») et ${b.label} (« ${vb} ») — probable erreur de lecture, vérifie la pièce.`
        : `Le ${field} diffère entre ${a.label} (« ${va} ») et ${b.label} (« ${vb} ») — vérifie qu'il s'agit bien de la même personne.`,
    });
  }

  return out;
}
