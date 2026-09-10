/**
 * L'avancement d'une campagne de RDV (spec §7.1 point 4, §7.2) — module PUR.
 *
 * C'est l'écran que Laurent a demandé en une phrase : « comme ça, l'admin peut
 * voir ce qui est bon ou pas bon ». Tout ce qui suit répond à cette phrase, et
 * rien d'autre.
 *
 * Aucun import prisma/next : on raisonne sur une liste de pré-inscriptions déjà
 * chargée. C'est ce qui permet de tester l'agrégation sur des cas tordus — zéro
 * inscrit, un rejeté, deux votes sur la même date — sans base.
 */

/** Statuts `PreEnrollmentStatus` regroupés par ce qu'ils veulent dire à l'admin. */
const STATUT_PAS_ENCORE_RENDU = new Set(['PENDING_FORM']);
const STATUT_EN_COURS = new Set(['SUBMITTED', 'EXTRACTING', 'EXTRACTED']);
const STATUT_BON = new Set(['VALIDATED', 'CONVERTED']);
const STATUT_REJETE = new Set(['REJECTED']);

export interface PreEnrollmentSnapshot {
  id: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  submittedAt: Date | null;
  /** Clés de stockage des pièces — leur PRÉSENCE suffit, jamais leur contenu. */
  cniKey: string | null;
  ribKey: string | null;
  cfpKey: string | null;
  rejectionReason: string | null;
}

export interface DateOptionSnapshot {
  id: string;
  startsAt: Date;
  label: string | null;
  isRetained: boolean;
  /** `{ [preEnrollmentId]: true }` — tel que stocké en base. */
  votes: unknown;
}

export interface AvancementCampagne {
  attendus: number | null;
  /** Liens ouverts qui n'ont pas encore rendu leur formulaire. */
  pasEncoreRendus: number;
  enCours: number;
  bons: number;
  rejetes: number;
  /** A rendu son formulaire, quel que soit l'aboutissement. */
  rendus: number;
  /** Pièces attendues et déposées, tous participants confondus. */
  piecesCompletes: number;
  piecesIncompletes: number;
  votesParDate: { dateOptionId: string; startsAt: Date; label: string | null; voix: number; isRetained: boolean }[];
  /** Qui bloque, nommément — c'est la colonne « pas bon ». */
  aRelancer: { id: string; nom: string; motif: 'formulaire-non-rendu' | 'pieces-manquantes' | 'rejete'; detail: string | null }[];
}

/**
 * Les pièces attendues de TOUS : CNI et RIB. L'attestation CFP ne concerne que
 * les TNS — l'exiger de tout le monde ferait clignoter en rouge des dossiers
 * parfaitement complets, et l'admin cesserait de regarder l'indicateur.
 */
function piecesManquantes(p: PreEnrollmentSnapshot): string[] {
  const manque: string[] = [];
  if (!p.cniKey) manque.push('pièce d’identité');
  if (!p.ribKey) manque.push('RIB');
  return manque;
}

function nomAffiche(p: PreEnrollmentSnapshot): string {
  const n = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  return n || 'Participant sans nom saisi';
}

/** Compte les voix d'une option de date, quelle que soit la forme stockée. */
export function compterVoix(votes: unknown): number {
  if (!votes || typeof votes !== 'object' || Array.isArray(votes)) return 0;
  return Object.values(votes as Record<string, unknown>).filter(Boolean).length;
}

export function calculerAvancement(args: {
  attendus: number | null;
  preEnrollments: readonly PreEnrollmentSnapshot[];
  dateOptions: readonly DateOptionSnapshot[];
}): AvancementCampagne {
  let pasEncoreRendus = 0;
  let enCours = 0;
  let bons = 0;
  let rejetes = 0;
  let piecesCompletes = 0;
  let piecesIncompletes = 0;
  const aRelancer: AvancementCampagne['aRelancer'] = [];

  for (const p of args.preEnrollments) {
    if (STATUT_PAS_ENCORE_RENDU.has(p.status)) {
      pasEncoreRendus += 1;
      aRelancer.push({
        id: p.id,
        nom: nomAffiche(p),
        motif: 'formulaire-non-rendu',
        detail: null,
      });
      // Un formulaire non rendu n'a pas de pièces à compter : le décompter
      // « incomplet » ferait doublon avec la ligne de relance ci-dessus.
      continue;
    }

    if (STATUT_REJETE.has(p.status)) {
      rejetes += 1;
      aRelancer.push({
        id: p.id,
        nom: nomAffiche(p),
        motif: 'rejete',
        detail: p.rejectionReason,
      });
      continue;
    }

    if (STATUT_BON.has(p.status)) bons += 1;
    else if (STATUT_EN_COURS.has(p.status)) enCours += 1;

    const manque = piecesManquantes(p);
    if (manque.length === 0) {
      piecesCompletes += 1;
    } else {
      piecesIncompletes += 1;
      aRelancer.push({
        id: p.id,
        nom: nomAffiche(p),
        motif: 'pieces-manquantes',
        detail: manque.join(', '),
      });
    }
  }

  return {
    attendus: args.attendus,
    pasEncoreRendus,
    enCours,
    bons,
    rejetes,
    rendus: enCours + bons + rejetes,
    piecesCompletes,
    piecesIncompletes,
    votesParDate: args.dateOptions
      .map((d) => ({
        dateOptionId: d.id,
        startsAt: d.startsAt,
        label: d.label,
        voix: compterVoix(d.votes),
        isRetained: d.isRetained,
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    aRelancer,
  };
}

/**
 * La deadline administrative (§7.2) : « pièces réunies au plus tard le … ».
 *
 * C'est la date de session la PLUS PROCHE moins le délai de dépôt AGEFICE, et
 * c'est déjà l'argument de la proposition OPTIMO réelle. La plus proche, et non
 * la retenue : tant que l'arbitrage n'est pas fait, c'est la première date qui
 * contraint — annoncer la deadline de la date la plus lointaine ferait rater la
 * première si c'est elle qu'on retient.
 *
 * Retourne null s'il n'y a aucune date : une deadline inventée serait pire que
 * pas de deadline.
 */
export function deadlineAdministrative(args: {
  dateOptions: readonly { startsAt: Date; isRetained: boolean }[];
  leadDaysMin: number;
}): Date | null {
  const retenue = args.dateOptions.filter((d) => d.isRetained);
  const source = retenue.length > 0 ? retenue : args.dateOptions;
  if (source.length === 0) return null;

  const plusProche = source.reduce((min, d) => (d.startsAt < min.startsAt ? d : min));
  const deadline = new Date(plusProche.startsAt);
  deadline.setDate(deadline.getDate() - args.leadDaysMin);
  return deadline;
}

/**
 * Une deadline déjà passée doit se DIRE, pas se masquer : le dossier ne peut
 * plus tenir le délai AGEFICE, et c'est une information commerciale — on
 * reporte, ou on assume un financement hors délai.
 */
export function deadlineDepassee(deadline: Date | null, now: Date): boolean {
  return deadline !== null && deadline.getTime() < now.getTime();
}
