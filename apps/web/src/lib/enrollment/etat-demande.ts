/**
 * L'état AFFICHÉ d'une demande d'inscription sur la fiche session — module NEUTRE.
 *
 * ⚠ LE BUG QU'IL EXISTE POUR TUER. L'affichage ne lisait que
 * `PreEnrollment.status`. Or convertir un dossier depuis /app/inscriptions le
 * passe à CONVERTED sans créer le moindre `SessionParticipant` : la fiche
 * session annonçait « Inscrite » pour trois personnes sur une session qui
 * comptait ZÉRO inscrit (SES-0114, 15/09/2026). Pire, ce badge masquait aussi
 * le bouton d'action — le dossier devenait intraitable, et l'écran affirmait
 * que tout allait bien.
 *
 * LA RÈGLE : la vérité d'une inscription n'est pas dans le statut du dossier,
 * elle est dans l'existence du participant. `estInscrit` tranche, le statut ne
 * fait que nuancer. Un dossier converti mais pas inscrit doit le DIRE et rester
 * actionnable ; un dossier dont la personne a été inscrite à la main doit se
 * taire, même si son statut n'a jamais bougé.
 *
 * Fonction PURE : l'appelant lit la base (le participant existe-t-il ?) et
 * passe un booléen.
 */

export interface EtatDemandeInput {
  /** `PreEnrollmentStatus` du dossier. */
  status: string;
  /** Un `SessionParticipant` existe-t-il pour cette personne sur cette session ? */
  estInscrit: boolean;
}

export interface EtatDemande {
  libelle: string;
  /** `neutre` | `attente` | `alerte` | `refus` — le ton, pas la classe CSS. */
  ton: 'neutre' | 'attente' | 'alerte' | 'refus';
  /** Peut-on encore proposer « inscrire à la session » sur cette ligne ? */
  actionPossible: boolean;
}

/** Statuts qui attendent une décision de l'admin. */
const EN_COURS: Record<string, { libelle: string; ton: EtatDemande['ton'] }> = {
  SUBMITTED: { libelle: 'Reçue', ton: 'attente' },
  EXTRACTING: { libelle: 'Lecture en cours', ton: 'attente' },
  EXTRACTED: { libelle: 'À valider', ton: 'attente' },
  VALIDATED: { libelle: 'Validée', ton: 'attente' },
};

/** Statuts terminaux : plus rien à inscrire. */
const CLOS: Record<string, { libelle: string; ton: EtatDemande['ton'] }> = {
  REJECTED: { libelle: 'Rejetée', ton: 'refus' },
  EXPIRED: { libelle: 'Expirée', ton: 'neutre' },
  PENDING_FORM: { libelle: 'Formulaire non rempli', ton: 'neutre' },
};

export function etatDemande(input: EtatDemandeInput): EtatDemande {
  // Le participant l'emporte sur tout : s'il existe, la personne EST dans la
  // session, quel que soit ce que raconte le statut du dossier. Proposer de
  // l'inscrire fabriquerait un doublon que la server action refuserait.
  if (input.estInscrit) {
    return { libelle: 'Inscrite', ton: 'neutre', actionPossible: false };
  }

  // Converti mais pas inscrit : l'apprenant existe, la session ne le connaît
  // pas. C'est exactement l'état qu'on affichait « Inscrite ».
  if (input.status === 'CONVERTED') {
    return { libelle: 'Converti, pas inscrit', ton: 'alerte', actionPossible: true };
  }

  const clos = CLOS[input.status];
  if (clos) return { ...clos, actionPossible: false };

  const enCours = EN_COURS[input.status];
  if (enCours) return { ...enCours, actionPossible: true };

  // Statut inconnu : on l'affiche tel quel plutôt que de le faire disparaître
  // derrière un libellé rassurant. Pas d'action proposée sur ce qu'on ne
  // comprend pas.
  return { libelle: input.status, ton: 'neutre', actionPossible: false };
}
