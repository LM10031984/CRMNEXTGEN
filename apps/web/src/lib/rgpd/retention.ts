/**
 * Durées de conservation — application du registre des traitements (art. 30).
 *
 * Le registre (Traitement 5, validé le 2026-07-07) dit : « Traces d'envoi
 * (`EmailMessage`) conservées avec le dossier de formation ». La politique est
 * donc tranchée ; ce qu'il manquait pour l'automatiser, c'est un nombre.
 *
 * ⚠ CE NOMBRE EST À CONTRESIGNER par le responsable de traitement (amendement
 * v1.5 du registre). Il est volontairement isolé ici : une seule valeur à
 * changer, à un seul endroit, sans toucher au code de purge.
 *
 * Pourquoi 5 ans et pas 3 : le cycle de certification Qualiopi est de 3 ans,
 * mais les contrôles a posteriori des financeurs (AGEFICE, OPCO, DREETS)
 * portent au-delà — c'est déjà le raisonnement retenu le 2026-07-07 pour
 * étendre la conservation des scans CNI/RIB (Traitement 2). En cas de doute on
 * garde plus longtemps : une preuve d'envoi supprimée trop tôt ne se
 * reconstitue pas, alors qu'une donnée gardée un an de trop se supprime.
 */
export const DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES = 5;

export interface EcheanceInput {
  /** Date d'envoi réel (null si la ligne n'a jamais eu de départ SMTP). */
  sentAt: Date | null;
  /** Création de la trace — repli quand `sentAt` est absent. */
  createdAt: Date;
  /**
   * Dates de fin des sessions auxquelles se rattachent les documents joints.
   * Vide = trace orpheline (documents supprimés, ou envoi sans rattachement) :
   * on retombe alors sur la date d'envoi.
   */
  finsDeSession: Date[];
}

function plusAnnees(d: Date, annees: number): Date {
  const r = new Date(d.getTime());
  r.setFullYear(r.getFullYear() + annees);
  return r;
}

/**
 * Échéance de conservation d'une trace d'envoi.
 *
 * Ancrée sur la fin de la formation LA PLUS TARDIVE parmi les documents joints
 * — un même envoi peut porter les pièces de plusieurs sessions, et la trace
 * doit vivre aussi longtemps que le dossier le plus récent qu'elle documente.
 */
export function calculerEcheanceConservation(
  input: EcheanceInput,
  annees: number = DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES,
): Date {
  const ancre =
    input.finsDeSession.length > 0
      ? new Date(Math.max(...input.finsDeSession.map((d) => d.getTime())))
      : (input.sentAt ?? input.createdAt);
  return plusAnnees(ancre, annees);
}

export function estEchu(input: EcheanceInput, now: Date, annees?: number): boolean {
  return calculerEcheanceConservation(input, annees).getTime() <= now.getTime();
}

/**
 * Compte rendu de rendez-vous de diagnostic (`Diagnostic.transcriptText`).
 *
 * 90 jours, valeur de la spec §6.4 — et la plus courte du projet, à dessein.
 * Ce texte est le verbatim d'une conversation : il contient des appréciations
 * nommées sur des salariés qui n'ont jamais été informés qu'on les
 * enregistrait. Ce qu'on garde durablement, ce sont les RÉPONSES qu'on en a
 * tirées et qu'un humain a confirmées — pas la conversation.
 *
 * ⚠ À porter au registre des traitements : le lot C crée un stockage de
 * données personnelles qui n'y figure pas encore.
 */
export const DUREE_CONSERVATION_TRANSCRIPT_JOURS = 90;

export interface EcheanceTranscriptInput {
  /** Le rendez-vous que le compte rendu relate. */
  meetingAt: Date | null;
  /** Dernière extraction — preuve que le texte servait encore. */
  prefillAt: Date | null;
  /** Repli quand aucune des deux n'est connue. */
  createdAt: Date;
}

/**
 * Échéance d'un compte rendu : 90 jours après la dernière preuve d'usage.
 *
 * On prend le PLUS RÉCENT des trois repères plutôt que la seule date de
 * rendez-vous. Sinon, un compte rendu collé trois mois après la séance — cas
 * banal quand l'enregistrement dort dans un Plaud — serait purgé la nuit
 * suivante, avant même d'avoir servi.
 */
export function calculerEcheanceTranscript(
  input: EcheanceTranscriptInput,
  jours: number = DUREE_CONSERVATION_TRANSCRIPT_JOURS,
): Date {
  const reperes = [input.meetingAt, input.prefillAt, input.createdAt].filter(
    (d): d is Date => d instanceof Date,
  );
  const ancre = new Date(Math.max(...reperes.map((d) => d.getTime())));
  const echeance = new Date(ancre.getTime());
  echeance.setDate(echeance.getDate() + jours);
  return echeance;
}

export function transcriptEchu(
  input: EcheanceTranscriptInput,
  now: Date,
  jours?: number,
): boolean {
  return calculerEcheanceTranscript(input, jours).getTime() <= now.getTime();
}
