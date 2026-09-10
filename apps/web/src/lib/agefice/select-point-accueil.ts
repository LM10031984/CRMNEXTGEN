/**
 * Choix du Point d'Accueil AGEFICE d'un apprenant.
 *
 * Ce que faisait l'application avant (quick 260908-m1v) : `findFirst({ where:
 * { department }, orderBy: { city: 'asc' } })` — le premier point d'accueil du
 * département **par ordre alphabétique de ville**. Pour les Bouches-du-Rhône,
 * elle proposait donc Arles plutôt que Marseille ; et pour les 24 départements
 * sans point implanté (69, 38, 92, 93, 94, 2A, 2B…), elle ne trouvait rien.
 *
 * L'annuaire officiel publie pour chaque point la liste des départements qu'il
 * couvre. On s'en sert, avec un ordre de préférence explicite :
 *
 *   1. il doit couvrir le département de l'apprenant — sinon il est écarté ;
 *   2. un point implanté DANS le département passe avant un point voisin ;
 *   3. à égalité, celui de la même ville, puis le plus proche par code postal ;
 *   4. la plateforme nationale dématérialisée passe en DERNIER — c'est le
 *      recours quand il n'y a personne en local, pas le choix par défaut.
 *
 * Module PUR : il classe une liste déjà chargée, il ne lit pas la base.
 */

export interface PointAccueilCandidate {
  id: string;
  name: string;
  postalCode: string;
  city: string;
  /** Département d'implantation, dérivé du code postal. */
  department: string;
  /** Départements couverts (source officielle). Vide = référentiel ancien. */
  departmentsServed?: string[];
}

export interface LearnerLocation {
  /** Département de l'apprenant, ex. '06' ou '974'. */
  department: string;
  /** Ville de l'apprenant, pour départager deux points du même département. */
  city?: string | null;
  /** Code postal de l'apprenant, pour départager à la ville près. */
  postalCode?: string | null;
}

/**
 * Département d'un code postal français, dans la forme utilisée par l'annuaire
 * AGEFICE : '97400' → '974', '06800' → '06', et la CORSE en '2A'/'2B'.
 *
 * La Corse est le piège : les codes postaux commencent tous par 20, mais
 * l'annuaire ne connaît que 2A et 2B. Sans cette conversion, un apprenant
 * d'Ajaccio ne trouvait aucun point officiel (on cherchait un département
 * « 20 » qui n'existe pas chez eux).
 */
export function departmentOfPostalCode(cp: string | null | undefined): string | null {
  const raw = (cp ?? '').replace(/\s/g, '');
  if (!/^\d{4,5}$/.test(raw)) return null;
  const padded = raw.padStart(5, '0');
  if (padded.startsWith('97') || padded.startsWith('98')) return padded.slice(0, 3);
  if (padded.startsWith('20')) {
    // Corse-du-Sud jusqu'à 20190 inclus, Haute-Corse au-delà.
    return Number(padded) <= 20190 ? '2A' : '2B';
  }
  return padded.slice(0, 2);
}

function foldCity(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/cedex.*$/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Un point à couverture très large est une plateforme de repli, pas un
 * interlocuteur local. Seuil volontairement haut : le vrai cas (la plateforme
 * nationale dématérialisée) couvre les 101 départements.
 */
function isNationalFallback(pa: PointAccueilCandidate): boolean {
  return (pa.departmentsServed?.length ?? 0) > 50;
}

/** Vrai si ce point d'accueil peut prendre en charge ce département. */
export function servesDepartment(pa: PointAccueilCandidate, department: string): boolean {
  const served = pa.departmentsServed ?? [];
  // Repli sur le référentiel ancien (couverture non renseignée) : on retombe
  // sur l'implantation, l'ancien comportement, plutôt que d'écarter le point.
  if (served.length === 0) return pa.department === department;
  return served.includes(department);
}

/**
 * Classe les points d'accueil du meilleur au moins bon pour cet apprenant.
 * Ceux qui ne couvrent pas son département sont retirés.
 */
export function rankPointsAccueil(
  candidates: PointAccueilCandidate[],
  learner: LearnerLocation,
): PointAccueilCandidate[] {
  const learnerCity = foldCity(learner.city);
  const learnerCp = (learner.postalCode ?? '').replace(/\s/g, '');

  return candidates
    .filter((pa) => servesDepartment(pa, learner.department))
    .map((pa) => {
      const local = pa.department === learner.department;
      const sameCity = !!learnerCity && foldCity(pa.city) === learnerCity;
      // Proximité grossière mais utile : plus les codes postaux partagent de
      // chiffres de tête, plus les communes sont proches.
      let cpAffinity = 0;
      if (learnerCp && pa.postalCode) {
        while (
          cpAffinity < Math.min(learnerCp.length, pa.postalCode.length) &&
          learnerCp[cpAffinity] === pa.postalCode[cpAffinity]
        ) {
          cpAffinity++;
        }
      }
      // À défaut d'implantation locale, un point qui couvre peu de départements
      // est plus « de proximité » qu'un point qui en couvre trente.
      const breadth = pa.departmentsServed?.length ?? 999;
      return { pa, national: isNationalFallback(pa), local, sameCity, cpAffinity, breadth };
    })
    .sort((a, b) => {
      if (a.national !== b.national) return a.national ? 1 : -1;
      if (a.local !== b.local) return a.local ? -1 : 1;
      if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
      if (a.cpAffinity !== b.cpAffinity) return b.cpAffinity - a.cpAffinity;
      if (a.breadth !== b.breadth) return a.breadth - b.breadth;
      return a.pa.name.localeCompare(b.pa.name);
    })
    .map((x) => x.pa);
}

/** Le meilleur point d'accueil, ou `null` si aucun ne couvre le département. */
export function pickPointAccueil(
  candidates: PointAccueilCandidate[],
  learner: LearnerLocation,
): PointAccueilCandidate | null {
  return rankPointsAccueil(candidates, learner)[0] ?? null;
}
