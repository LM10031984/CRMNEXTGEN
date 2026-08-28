/**
 * Quels programmes du catalogue montrer à l'IA en référence — SOURCE UNIQUE.
 *
 * Demande de Laurent (28/08) : « je veux qu'elle se base sur nos programmes
 * déjà présents dans QualiOF car ils sont conformes Qualiopi ». Jusqu'ici le
 * few-shot était figé dans `ai-fill-product.ts` : trois DOCX de mars, recopiés
 * dans le code, qui ne voyaient rien du catalogue réel.
 *
 * Deux exigences opposées à tenir :
 *  - montrer ce qui RESSEMBLE le plus à la formation visée (même thème, durée
 *    voisine), pour que le style transposé soit pertinent ;
 *  - ne JAMAIS montrer un brouillon IA non relu — l'IA reproduirait un défaut
 *    que personne n'a validé, et le défaut se propagerait de programme en
 *    programme sans que rien ne le signale.
 *
 * ⚠ Ces programmes servent de référence de STYLE et de STRUCTURE, jamais de
 * CONTENU : c'est au prompt de le dire, et à `enforceProgrammeFidelity` de le
 * vérifier après coup. Un modèle recopie volontiers un module de l'exemple —
 * ce serait une non-conformité en audit.
 *
 * MODULE NEUTRE et PUR : il reçoit le catalogue, il n'interroge rien.
 */

export interface ProgrammeCandidat {
  id: string;
  code: string;
  title: string;
  theme: string | null;
  durationHours: number;
  programMd: string | null;
  /** Non nul = brouillon IA jamais relu par un humain. */
  aiDraftedAt: Date | null;
  isActive: boolean;
}

export interface CibleProgramme {
  title: string;
  theme?: string | null;
  durationHours: number;
  /** Produit en cours de modification : il ne se sert pas d'exemple à lui-même. */
  excludeProductId?: string;
}

/**
 * Un programme plus court que ça n'apprend rien à l'IA sur la structure
 * attendue (titre de jour seul, coquille laissée en plan).
 */
const LONGUEUR_MINIMALE = 200;

/** Plafond par défaut : le contexte envoyé à l'IA se paie à chaque génération. */
const MAX_PAR_DEFAUT = 2;

function normaliser(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function selectionnerProgrammesReference(
  candidats: ReadonlyArray<ProgrammeCandidat>,
  cible: CibleProgramme,
  max: number = MAX_PAR_DEFAUT,
): ProgrammeCandidat[] {
  const themeCible = normaliser(cible.theme);

  const eligibles = candidats.filter(
    (p) =>
      p.id !== cible.excludeProductId &&
      p.isActive &&
      p.aiDraftedAt === null &&
      (p.programMd ?? '').trim().length >= LONGUEUR_MINIMALE,
  );

  const scores = eligibles.map((p) => {
    const memeTheme = themeCible.length > 0 && normaliser(p.theme) === themeCible;
    // Écart de durée RELATIF : 7h vs 21h et 88h vs 264h sont aussi éloignés.
    const ecart =
      Math.abs(p.durationHours - cible.durationHours) / Math.max(cible.durationHours, 1);
    return { p, memeTheme, ecart };
  });

  scores.sort(
    (a, b) =>
      Number(b.memeTheme) - Number(a.memeTheme) ||
      a.ecart - b.ecart ||
      // Tri final par code : à score égal, la sélection reste la même d'une
      // génération à l'autre (reproductible, débogable).
      a.p.code.localeCompare(b.p.code),
  );

  return scores.slice(0, Math.max(0, max)).map((s) => s.p);
}

/**
 * Rend les programmes retenus sous la forme injectée dans le prompt.
 *
 * Le cadre est explicite à chaque exemple : ce qui est montré est la FORME.
 * Répéter la consigne AVEC l'exemple, et pas seulement en tête du prompt, est
 * ce qui tient le mieux quand le modèle a plusieurs milliers de caractères
 * d'exemple sous les yeux.
 */
export function renderProgrammesReference(programmes: ReadonlyArray<ProgrammeCandidat>): string {
  if (programmes.length === 0) return '';
  const blocs = programmes.map(
    (p, i) => `═══ RÉFÉRENCE ${i + 1} — « ${p.title} » (${p.durationHours} h${
      p.theme ? `, ${p.theme}` : ''
    }) ═══
${(p.programMd ?? '').trim()}`,
  );
  return `PROGRAMMES DE RÉFÉRENCE DE L'ORGANISME (conformes, déjà audités) :

Ils te montrent la FORME attendue : découpage des journées, granularité des contenus, formulation des intitulés en verbes d'action, ton.

⚠ INTERDIT d'en reprendre le CONTENU. Aucun module, thème, outil ou exemple de ces références ne doit apparaître dans le programme que tu produis s'il n'est pas dans la demande. Ils sont là pour la forme, pas pour le fond.

${blocs.join('\n\n')}`;
}
