/**
 * Lot D — ALERTE J-15 : « Convention non envoyée pour signature » (spec §5).
 *
 * LE RISQUE QU'ELLE COUVRE. Une session démarre dans quinze jours et sa
 * convention n'est pas partie : le stagiaire arrive sans engagement signé, le
 * financeur refusera le dossier, et personne ne s'en aperçoit avant la veille.
 * L'application ne dit rien aujourd'hui — c'est le seul point du chantier
 * signature où la machine est mieux placée que l'humain, parce que la question
 * ne se pose qu'en regardant le calendrier.
 *
 * DEUX PIÈGES QUE CES TESTS GARDENT, et les deux transformeraient l'alerte en
 * bruit — donc en alerte ignorée :
 *
 *  1. **Une convention signée À LA MAIN n'a aucune demande de signature.** Le
 *     dépôt de scan du lot A est un chemin complet et légitime. Alerter dessus
 *     reviendrait à réclamer un envoi pour une pièce déjà signée.
 *  2. **Une session sans inscrit n'a rien à faire signer.** Le gabarit de
 *     session créé à l'avance déclencherait une alerte chaque heure.
 *
 * ⚠ PURE : la décision se raisonne sur une date, un statut et trois booléens.
 * C'est ce qui permet de la tester sans cron ni base — et une alerte qu'on ne
 * peut pas tester finit par mitrailler ou par se taire.
 */

import { describe, it, expect } from 'vitest';
import {
  ALERTE_J15_DEPUIS,
  JOURS_AVANT_ALERTE_CONVENTION,
  TITRE_TACHE_CONVENTION_NON_ENVOYEE,
  decideAlerteConventionNonEnvoyee,
} from '../convention-non-envoyee';

const MAINTENANT = new Date('2026-10-01T09:00:00.000Z');
/** J-10 : dans la fenêtre. */
const DANS_10_JOURS = new Date('2026-10-11T09:00:00.000Z');

function session(over: Record<string, unknown> = {}) {
  return {
    startDate: DANS_10_JOURS,
    status: 'VALIDATED',
    nbParticipants: 3,
    aUneDemandeDeSignature: false,
    aUneConventionSignee: false,
    dejaAlertee: false,
    ...over,
  };
}

describe('decideAlerteConventionNonEnvoyee — quand elle part', () => {
  it('session à J-10, des inscrits, rien d’envoyé : on alerte', () => {
    const d = decideAlerteConventionNonEnvoyee(session(), MAINTENANT);
    expect(d.alerter).toBe(true);
    expect(d.alerter && d.joursRestants).toBe(10);
  });

  it('le seuil est quinze jours, et il est nommé', () => {
    expect(JOURS_AVANT_ALERTE_CONVENTION).toBe(15);
  });

  it('une session OUVERTE aux inscriptions alerte aussi — c’est le cas le plus fréquent', () => {
    expect(decideAlerteConventionNonEnvoyee(session({ status: 'OPEN' }), MAINTENANT).alerter).toBe(
      true,
    );
    expect(
      decideAlerteConventionNonEnvoyee(session({ status: 'PLANNED' }), MAINTENANT).alerter,
    ).toBe(true);
    expect(
      decideAlerteConventionNonEnvoyee(session({ status: 'IN_PROGRESS' }), MAINTENANT).alerter,
    ).toBe(true);
  });

  it('le jour du seuil EXACT est dans la fenêtre — on n’alerte pas un jour trop tard', () => {
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-10-16T09:00:00.000Z') }),
      MAINTENANT,
    );
    expect(d.alerter).toBe(true);
  });
});

describe('decideAlerteConventionNonEnvoyee — quand elle se tait', () => {
  it('session encore lointaine : trop tôt', () => {
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-11-30T09:00:00.000Z') }),
      MAINTENANT,
    );
    expect(d).toEqual({ alerter: false, motif: 'trop_tot' });
  });

  it('session DÉJÀ COMMENCÉE : l’alerte n’aide plus, elle accuse', () => {
    // ⚠ Date choisie APRÈS le plancher de mise en service (27/09) : avant lui,
    // c'est le plancher qui répondrait, et ce test ne garderait plus rien.
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-09-28T09:00:00+02:00') }),
      MAINTENANT,
    );
    expect(d).toEqual({ alerter: false, motif: 'deja_commencee' });
  });

  it('brouillon ou session annulée : rien à signer', () => {
    expect(decideAlerteConventionNonEnvoyee(session({ status: 'DRAFT' }), MAINTENANT)).toEqual({
      alerter: false,
      motif: 'hors_statut',
    });
    expect(decideAlerteConventionNonEnvoyee(session({ status: 'CANCELLED' }), MAINTENANT)).toEqual({
      alerter: false,
      motif: 'hors_statut',
    });
  });

  it('aucun inscrit : il n’y a personne pour qui signer', () => {
    const d = decideAlerteConventionNonEnvoyee(session({ nbParticipants: 0 }), MAINTENANT);
    expect(d).toEqual({ alerter: false, motif: 'sans_inscrit' });
  });

  it('une demande de signature EXISTE : c’est parti, on se tait', () => {
    const d = decideAlerteConventionNonEnvoyee(
      session({ aUneDemandeDeSignature: true }),
      MAINTENANT,
    );
    expect(d).toEqual({ alerter: false, motif: 'deja_envoyee' });
  });

  it('convention signée À LA MAIN (scan du lot A) : rien à réclamer', () => {
    // Piège n°1 : le dépôt manuel ne crée AUCUNE `SignatureRequest`. Ne lire
    // que la demande ferait réclamer un envoi pour une pièce déjà signée.
    const d = decideAlerteConventionNonEnvoyee(
      session({ aUneConventionSignee: true }),
      MAINTENANT,
    );
    expect(d).toEqual({ alerter: false, motif: 'deja_signee' });
  });

  it('déjà alertée : un cron horaire ne produit pas une alerte horaire', () => {
    const d = decideAlerteConventionNonEnvoyee(session({ dejaAlertee: true }), MAINTENANT);
    expect(d).toEqual({ alerter: false, motif: 'deja_alertee' });
  });
});

describe('le titre de la tâche — c’est lui le marqueur d’idempotence', () => {
  it('est figé, parce qu’une tâche le porte en base', () => {
    // ⚠ Le changer ferait ré-alerter TOUTES les sessions déjà alertées : la
    // recherche d'idempotence ne retrouverait plus les tâches existantes.
    expect(TITRE_TACHE_CONVENTION_NON_ENVOYEE).toBe('Convention non envoyée pour signature');
  });
});

/* ── LE PLANCHER DE MISE EN SERVICE ──────────────────────────────────────── */

/**
 * POURQUOI UN PLANCHER, ET POURQUOI CETTE DATE.
 *
 * Le cron naît le 12/09/2026, alors que des sessions sont DÉJÀ dans sa fenêtre
 * de quinze jours. Sans plancher, sa première exécution alerterait d'un coup
 * sur toutes celles dont la convention n'est pas partie — une salve sur des
 * dossiers que Laurent traite à la main, et une alerte qui commence par une
 * salve est une alerte qu'on filtre.
 *
 * 12/09 + 15 jours = 27/09 : à partir de cette date, toute session entrant dans
 * la fenêtre y sera entrée APRÈS la mise en service, donc le cron l'aura vue
 * naître. Les sessions antérieures restent traitées à la main, une fois.
 */
describe('le plancher de mise en service — aucune salve au démarrage', () => {
  const AU_DEMARRAGE = new Date('2026-09-12T09:00:00.000Z');

  it('la date est nommée, et c’est le 27/09/2026 à Paris', () => {
    // ⚠ Minuit à PARIS, pas en UTC : une session du 26/09 à 23 h n'a pas à
    // être alertée sous prétexte qu'elle tombe le 27 en temps universel.
    expect(ALERTE_J15_DEPUIS.toISOString()).toBe('2026-09-26T22:00:00.000Z');
  });

  it('une session qui démarre le 26/09 n’est PAS alertée', () => {
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-09-26T09:00:00+02:00') }),
      AU_DEMARRAGE,
    );
    expect(d).toEqual({ alerter: false, motif: 'avant_mise_en_service' });
  });

  it('une session qui démarre le 27/09 EST alertée', () => {
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-09-27T09:00:00+02:00') }),
      AU_DEMARRAGE,
    );
    expect(d.alerter).toBe(true);
  });

  it('le bord exact — minuit pile le 27/09 à Paris — passe', () => {
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-09-27T00:00:00+02:00') }),
      AU_DEMARRAGE,
    );
    expect(d.alerter).toBe(true);
  });

  it('la veille à 23 h 59 ne passe pas', () => {
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-09-26T23:59:00+02:00') }),
      AU_DEMARRAGE,
    );
    expect(d.alerter).toBe(false);
  });

  it('le plancher passe AVANT toute autre raison de se taire', () => {
    // Une session d'avant le plancher ne doit pas être annoncée « déjà
    // envoyée » ou « sans inscrit » : elle est simplement hors périmètre, et
    // c'est ce que le motif doit dire à qui lit les compteurs du cron.
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-09-20T09:00:00+02:00'), nbParticipants: 0 }),
      AU_DEMARRAGE,
    );
    expect(d).toEqual({ alerter: false, motif: 'avant_mise_en_service' });
  });

  it('PUISSANCE — une fois le plancher passé, il ne retient plus rien', () => {
    // En novembre, toutes les sessions sont postérieures au plancher : celui-ci
    // ne doit plus jamais être la raison d'un silence.
    const enNovembre = new Date('2026-11-01T09:00:00.000Z');
    const d = decideAlerteConventionNonEnvoyee(
      session({ startDate: new Date('2026-11-08T09:00:00+01:00') }),
      enNovembre,
    );
    expect(d.alerter).toBe(true);
  });
});
