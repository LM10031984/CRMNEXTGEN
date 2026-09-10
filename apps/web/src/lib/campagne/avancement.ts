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

/**
 * Les quatre compteurs de l'écran — EXCLUSIFS et TOTALISANTS
 * (arbitrage de Laurent du 10/09/2026).
 *
 * L'aperçu affichait cinq tuiles dont la somme faisait 5 pour 4 dossiers :
 * « en cours de vérification » disait un STATUT, « pièces manquantes » disait
 * une COMPLÉTUDE, et un même dossier tombait dans les deux. Un tableau de bord
 * dont les cases se recouvrent ne se lit pas — on ne sait plus si 5 signifie
 * cinq personnes ou cinq mentions.
 *
 * Désormais chaque dossier occupe une case et une seule, dans l'ordre du
 * parcours : non rendu → pièces manquantes → rejeté → bon. Les arbitrages qui
 * en découlent :
 *
 *  • **En vérification ET incomplet → « pièces manquantes ».** C'est la seule
 *    des deux informations sur laquelle quelqu'un peut agir.
 *  • **Rendu, complet, pas encore validé → « bon ».** Rien ne bloque ; que
 *    l'admin n'ait pas encore cliqué ne concerne pas le participant et ne se
 *    relance pas. Le compte reste disponible en `rendusNonTranches`, à mettre
 *    en sous-libellé — pas en tuile.
 *  • **Une validation admin l'emporte sur le contrôle automatique des pièces.**
 *    Rouvrir la question ferait clignoter en rouge un dossier que quelqu'un a
 *    déjà accepté en connaissance de cause.
 *  • **Les attendus qui n'ont pas ouvert le lien comptent comme non rendus.**
 *    Sans cela, une campagne où personne n'a cliqué afficherait quatre zéros
 *    pour quatre personnes attendues, et la somme ne vaudrait plus l'effectif.
 */
export interface AvancementCampagne {
  attendus: number | null;
  /**
   * Formulaires non rendus — y compris les personnes attendues qui n'ont pas
   * même ouvert le lien.
   */
  pasEncoreRendus: number;
  /** Rendus mais que l'admin n'a pas encore tranchés. Sous-libellé, pas tuile. */
  rendusNonTranches: number;
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
  let dossiersNonRendus = 0;
  let rendusNonTranches = 0;
  let bons = 0;
  let rejetes = 0;
  let piecesCompletes = 0;
  let piecesIncompletes = 0;
  const aRelancer: AvancementCampagne['aRelancer'] = [];

  for (const p of args.preEnrollments) {
    // ── 1. Non rendu ────────────────────────────────────────────────────────
    if (STATUT_PAS_ENCORE_RENDU.has(p.status)) {
      dossiersNonRendus += 1;
      aRelancer.push({
        id: p.id,
        nom: nomAffiche(p),
        motif: 'formulaire-non-rendu',
        detail: null,
      });
      continue;
    }

    // ── 2. Rejeté ───────────────────────────────────────────────────────────
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

    // ── 3. Pièces manquantes, SAUF si l'admin a déjà tranché ────────────────
    const valideParAdmin = STATUT_BON.has(p.status);
    const manque = valideParAdmin ? [] : piecesManquantes(p);
    if (manque.length > 0) {
      piecesIncompletes += 1;
      aRelancer.push({
        id: p.id,
        nom: nomAffiche(p),
        motif: 'pieces-manquantes',
        detail: manque.join(', '),
      });
      continue;
    }

    // ── 4. Bon ──────────────────────────────────────────────────────────────
    bons += 1;
    piecesCompletes += 1;
    if (!valideParAdmin) rendusNonTranches += 1;
  }

  // Les personnes attendues qui n'ont pas même ouvert le lien : sans elles, la
  // somme des quatre tuiles ne vaudrait que le nombre de dossiers ouverts.
  // Jamais négatif — plus de dossiers que d'attendus se dit tel quel.
  const jamaisVenus = Math.max(0, (args.attendus ?? 0) - args.preEnrollments.length);
  const pasEncoreRendus = dossiersNonRendus + jamaisVenus;

  return {
    attendus: args.attendus,
    pasEncoreRendus,
    rendusNonTranches,
    bons,
    rejetes,
    rendus: args.preEnrollments.length - dossiersNonRendus,
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
