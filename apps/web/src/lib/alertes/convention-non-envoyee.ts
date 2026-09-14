/**
 * Alerte J-15 — « Convention non envoyée pour signature » (spec §5 lot D).
 *
 * LE RISQUE QU'ELLE COUVRE. Une session démarre dans quinze jours et sa
 * convention n'est pas partie : le stagiaire arrivera sans engagement signé, le
 * financeur refusera le dossier, et personne ne s'en aperçoit avant la veille.
 * C'est le seul point du chantier signature où la machine est mieux placée que
 * l'humain — la question ne se pose qu'en regardant le calendrier.
 *
 * MODULE PUR : la décision se raisonne sur une date, un statut et trois
 * booléens. Une alerte qu'on ne peut pas tester finit par mitrailler ou par se
 * taire ; les deux reviennent au même, on cesse de la lire.
 */

/** Le seuil, en jours. Spec §5 lot D : « alerte J-15 ». */
export const JOURS_AVANT_ALERTE_CONVENTION = 15;

/**
 * LE PLANCHER DE MISE EN SERVICE — aucune session antérieure n'est alertée.
 *
 * POURQUOI IL EXISTE. Le cron naît le 12/09/2026, alors que des sessions sont
 * DÉJÀ dans sa fenêtre de quinze jours. Sans plancher, sa première exécution
 * alerterait d'un coup sur toutes celles dont la convention n'est pas partie —
 * une salve sur des dossiers que Laurent traite à la main. Une alerte qui
 * commence par une salve est une alerte qu'on filtre, et elle ne servira plus
 * jamais.
 *
 * POURQUOI CETTE DATE. 12/09 + 15 jours = 27/09. À partir de là, toute session
 * entrant dans la fenêtre y sera entrée APRÈS la mise en service : le cron
 * l'aura vue naître, et son silence antérieur ne cache rien. Les sessions
 * d'avant restent traitées à la main, une fois.
 *
 * ⚠ MINUIT À PARIS, pas en UTC. Une session du 26/09 à 23 h n'a pas à être
 * alertée sous prétexte qu'elle tombe le 27 en temps universel — les sessions
 * se lisent dans le fuseau où elles se tiennent.
 *
 * ⚠ CETTE CONSTANTE NE SE PÉRIME PAS TOUTE SEULE, et c'est voulu : elle dit
 * « ce cron n'a rien vu avant cette date », ce qui reste vrai pour toujours.
 * La retirer un jour ne changerait rien (toutes les sessions lui sont
 * postérieures) — mais la déplacer ferait ré-alerter du passé.
 */
export const ALERTE_J15_DEPUIS = new Date('2026-09-27T00:00:00+02:00');

/**
 * LE TITRE DE LA TÂCHE — et, par la même occasion, LE MARQUEUR D'IDEMPOTENCE.
 *
 * POURQUOI PAS UNE COLONNE, comme `Lead.staleAlertedAt`. Elle serait plus
 * propre, et c'est une migration ; la spec demande de toute façon une `Task`, et
 * une tâche existante répond exactement à la question posée — « a-t-on déjà
 * prévenu pour cette session ? ». Le couple `(sessionId, title)` sert donc de
 * clé.
 *
 * ⚠ NE PAS LE MODIFIER SANS Y PENSER : la recherche d'idempotence ne
 * retrouverait plus les tâches déjà posées, et TOUTES les sessions en attente
 * ré-alerteraient au passage suivant du cron.
 */
export const TITRE_TACHE_CONVENTION_NON_ENVOYEE = 'Convention non envoyée pour signature';

/**
 * Les statuts où une convention a encore un sens.
 *
 * `OPEN` en fait partie — c'est même le cas le plus fréquent à J-15 : une
 * session ouverte aux inscriptions, avec des inscrits, et dont la convention
 * n'est pas partie. L'omettre aurait rendu l'alerte muette là où on l'attend.
 * `DRAFT` et `CANCELLED` sont dehors (rien à signer), `COMPLETED` aussi (une
 * session terminée n'est jamais à J-15 dans le futur).
 */
const STATUTS_ALERTABLES = new Set(['PLANNED', 'OPEN', 'VALIDATED', 'IN_PROGRESS']);

export interface SessionSansConvention {
  startDate: Date;
  status: string;
  nbParticipants: number;
  /** Une `SignatureRequest` existe sur la session. */
  aUneDemandeDeSignature: boolean;
  /**
   * Une convention porte déjà une preuve signée.
   *
   * ⚠ INDISPENSABLE, et ce n'est pas une précaution. Le dépôt de scan du lot A
   * est un chemin COMPLET et légitime : il ne crée aucune `SignatureRequest`.
   * Ne lire que la demande ferait réclamer un envoi pour une pièce déjà signée
   * — et une alerte qui se trompe une fois n'est plus lue la fois suivante.
   */
  aUneConventionSignee: boolean;
  /** Une tâche porte déjà ce titre pour cette session. */
  dejaAlertee: boolean;
}

export type DecisionAlerteConvention =
  | { alerter: true; joursRestants: number }
  | {
      alerter: false;
      motif:
        | 'avant_mise_en_service'
        | 'trop_tot'
        | 'deja_commencee'
        | 'hors_statut'
        | 'sans_inscrit'
        | 'deja_envoyee'
        | 'deja_signee'
        | 'deja_alertee';
    };

export function decideAlerteConventionNonEnvoyee(
  session: SessionSansConvention,
  now: Date,
  seuilJours: number = JOURS_AVANT_ALERTE_CONVENTION,
): DecisionAlerteConvention {
  // ⚠ LE PLANCHER EN PREMIER. Une session d'avant la mise en service est hors
  // périmètre, point : l'annoncer « sans inscrit » ou « déjà envoyée » ferait
  // croire à qui lit les compteurs du cron qu'elle a été examinée sur le fond.
  if (session.startDate.getTime() < ALERTE_J15_DEPUIS.getTime()) {
    return { alerter: false, motif: 'avant_mise_en_service' };
  }
  if (!STATUTS_ALERTABLES.has(session.status)) return { alerter: false, motif: 'hors_statut' };

  const millisecondesRestantes = session.startDate.getTime() - now.getTime();
  // Une session commencée n'a plus rien à anticiper : l'alerte n'aiderait pas,
  // elle accuserait. Le manque se voit alors sur la fiche session elle-même.
  if (millisecondesRestantes < 0) return { alerter: false, motif: 'deja_commencee' };
  const joursRestants = Math.floor(millisecondesRestantes / 86_400_000);
  if (joursRestants > seuilJours) return { alerter: false, motif: 'trop_tot' };

  if (session.nbParticipants === 0) return { alerter: false, motif: 'sans_inscrit' };
  if (session.aUneConventionSignee) return { alerter: false, motif: 'deja_signee' };
  if (session.aUneDemandeDeSignature) return { alerter: false, motif: 'deja_envoyee' };
  if (session.dejaAlertee) return { alerter: false, motif: 'deja_alertee' };

  return { alerter: true, joursRestants };
}
