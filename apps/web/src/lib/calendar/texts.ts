/**
 * Textes EXACTS Start Academy figés en constantes (source de vérité :
 * pilote SES-0097 validé par Laurent, cf 14-PILOTE-TEXTS.md).
 *
 * La conformité Qualiopi impose la formulation MOT POUR MOT. Tout le contenu
 * (rappel quotidien, satisfaction à froid, bloc siège Vence) est centralisé ici
 * pour éviter la dérive. Les variables sont interpolées via `CalendarTextCtx`.
 *
 * Module pur, worker-safe : aucun import de couche serveur, d'authentification
 * ni de React. Seule dépendance interne = `countdownLabel` (module pur).
 *
 * Horaires FIGÉS en constantes (convention métier — jamais recalculés depuis
 * la durée de la session, cf memory "anti smart-calc sur conventions métier").
 */

/**
 * Horaires standard Start Academy, FIGÉS. NE JAMAIS recalculer depuis la durée.
 * Matin 9h-13h, après-midi 14h-18h.
 */
export const HORAIRES = {
  matin: '9h-13h',
  apresMidi: '14h-18h',
} as const;

/**
 * Ids Google Drive des pièces jointes documentaires (statiques, partagés par
 * toutes les sessions). Le programme de session est propre à chaque session et
 * n'est donc PAS ici (fourni par l'orchestrateur, Plan 14-04).
 */
export const DRIVE_DOCS = {
  cgv: '11mfi7rl8BQFhETty4vGat3GmoGclBuFx',
  ri: '1o44Zg9dXdbyJpQ-U5Tpfbx8lZjcm-Qyf',
  chartePsh: '1HxT_uy6UNIZBYGSl9gchT0sS9_DaidNM',
  questionnaireFroid: '1uNEa7QemfEYKyYf5ywGIdvyshWTjhYjd',
} as const;

/** URL de visualisation Drive pour un id de fichier. */
export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** Adresse du siège Start Academy à Vence. */
export const SIEGE_ADDRESS = '618 Bd Jean Maurel inférieur, 06140 Vence';

/**
 * Détecte si l'adresse fournie correspond au siège Start Academy (Vence).
 * Robuste aux variantes (Bd/Boulevard, casse, espaces multiples). Le siège est
 * identifié par la conjonction "618" + "Jean Maurel" + ("06140" OU "Vence").
 */
export function isSiegeVence(addressText: string): boolean {
  if (!addressText) return false;
  const norm = addressText.toLowerCase().replace(/\s+/g, ' ').trim();
  const has618 = norm.includes('618');
  const hasJeanMaurel = norm.includes('jean maurel');
  const hasVence = norm.includes('06140') || norm.includes('vence');
  return has618 && hasJeanMaurel && hasVence;
}

/**
 * Bloc accès/logistique du SIÈGE Vence (obligation Qualiopi). S'AJOUTE au corps
 * standard quand la session a lieu au siège. Texte exact issu du pilote validé.
 */
export const SIEGE_BLOCK = `🛣️ Accès par les transports :
  • Depuis Cannes : https://maps.app.goo.gl/s5KgRixyx2JLNut76
  • Depuis Menton : https://maps.app.goo.gl/FwbStuapPLrejoKJ9
🚌 Accès par la route :
  • Depuis Cannes : https://maps.app.goo.gl/HQfYZeSWCJZrCk4h6
  • Depuis Menton : https://maps.app.goo.gl/bpU7iYeoCHqFT7Fn7
🍽️ Restauration :
  • le NEOSUD — 6 place du Grand Jardin, Vence
  • Le VIETNAM-&-Sushi-Là — 14 av. Henri Isnard, Vence
  • Les Petits Tabliers — 7 av. Marcellin Maurel, Vence
🛏️ Hébergement : https://www.booking.com/city/fr/vence.fr.html`;

/**
 * Contexte d'interpolation des textes calendrier.
 * - `formation` : titre du produit
 * - `dates` : libellé de date de début (jj/mm/aaaa) — alimente {DATE_DEBUT}
 * - `heureDebut` : heure de début (ex. "9h00") — alimente {HEURE_DEBUT}
 * - `lieu` : adresse de la session
 * - `dureeJours` / `dureeH` : durée en journées / en heures
 * - `formateur` : nom du formateur (préfixé M./Mme par l'appelant)
 * - `countdown` : phrase déjà calculée par countdownLabel (rappels quotidiens)
 * - `salutationPrenoms` : prénoms des apprenants (textes froid)
 * - `isSiege` : true si la session a lieu au siège Vence
 * - `programmeUrl` : URL Drive du programme de la session (optionnel). Quand
 *   fournie, une ligne « Programme de la formation » cliquable s'ajoute au bloc
 *   documents du rappel. Absent (programme en MinIO, pas d'id Drive) → aucune
 *   ligne programme.
 */
export type CalendarTextCtx = {
  formation: string;
  dates: string;
  heureDebut: string;
  lieu: string;
  dureeJours: string;
  dureeH: string;
  formateur: string;
  countdown: string;
  salutationPrenoms: string;
  isSiege: boolean;
  programmeUrl?: string;
};

/**
 * Corps standard commun à l'événement formation et aux rappels quotidiens
 * (avant ajout éventuel du bloc siège et de la ligne countdown).
 * Texte EXACT du pilote SES-0097 (HTML, <br> implicite via sauts de ligne).
 */
function rappelBody(ctx: CalendarTextCtx): string {
  // Les 3 documents obligatoires deviennent des liens Drive cliquables (Qualiopi).
  const charteLink = `<a href="${driveViewUrl(DRIVE_DOCS.chartePsh)}">Charte accueil handicap</a>`;
  const riLink = `<a href="${driveViewUrl(DRIVE_DOCS.ri)}">Règlement intérieur</a>`;
  const cgvLink = `<a href="${driveViewUrl(DRIVE_DOCS.cgv)}">Conditions générales de vente</a>`;
  // Ligne programme optionnelle, insérée AU-DESSUS de la ligne Charte quand l'URL
  // du programme de session est disponible (sinon rien : programme en MinIO).
  const programmeLine = ctx.programmeUrl
    ? `<a href="${ctx.programmeUrl}">Programme de la formation</a>\n`
    : '';

  return `Rappel – Votre formation ${ctx.formation} commence bientôt !

Bonjour,

Nous vous rappelons que votre formation <b>${ctx.formation}</b> débutera le <b>${ctx.dates} à ${ctx.heureDebut}</b>.

📍 Lieu : ${ctx.lieu}
⏳ Durée : ${ctx.dureeJours} journées (${ctx.dureeH}h)
👨‍🏫 Formateur : ${ctx.formateur}

Pour un bon déroulement de la formation, nous vous invitons à :
✔️ Vérifier que vous avez bien reçu tous les documents nécessaires
✔️ Préparer votre matériel (ordinateur, cahier, stylo, etc.)
✔️ Anticiper votre trajet ou vérifier votre connexion si la formation est en ligne

Merci de bien vouloir consulter et lire les documents suivants :
${programmeLine}${charteLink}
${riLink}
${cgvLink}

Si vous avez la moindre question, n'hésitez pas à nous contacter à formation@start-academy.fr ou au 07 80 91 95 31.

Nous avons hâte de vous retrouver et vous souhaitons une excellente formation !

À très bientôt à l'Académie de Start !

Emma de Start Academy`;
}

/**
 * Rend le texte du rappel (événement formation all-day ET rappels quotidiens).
 *
 * - La ligne countdown ("📅 Votre formation commence ${ctx.countdown} !") est
 *   injectée juste après le titre d'accroche, UNIQUEMENT si `ctx.countdown` est
 *   non vide (l'événement formation all-day n'a pas de countdown ; les rappels
 *   quotidiens oui).
 * - Le bloc siège Vence est ajouté au corps quand `ctx.isSiege` est vrai
 *   (obligation Qualiopi : accès/transports/restauration/hébergement).
 */
export function renderRappelText(ctx: CalendarTextCtx): string {
  let body = rappelBody(ctx);

  if (ctx.countdown) {
    const accroche = `Rappel – Votre formation ${ctx.formation} commence bientôt !`;
    const countdownLine = `📅 Votre formation commence ${ctx.countdown} !`;
    body = body.replace(accroche, `${accroche}\n${countdownLine}`);
  }

  if (ctx.isSiege) {
    body = `${body}\n\n${SIEGE_BLOCK}`;
  }

  return body;
}

/** Type de relance pour la satisfaction à froid (1 mois / 1 mois 15j / 2 mois). */
export type FroidRelance = 1 | 2 | 3;

/** Paragraphe commun d'introduction des 3 relances froid (texte exact pilote). */
const FROID_INTRO = `On sait que vous êtes très occupés à chasser le prochain bien d'exception et à décrocher des mandats comme des pros ! Mais nous avons besoin de votre coup de main pour un petit (mais très utile) questionnaire de satisfaction.`;

const FROID_RECUL_LONG = `Il s'agit d'une évaluation « à froid » : on aimerait connaître votre ressenti sur la formation, maintenant que vous avez un peu de recul. Votre avis nous permettra de continuer à améliorer nos services et nos formations, pour vous aider à être encore plus performants sur le terrain.`;

const FROID_RECUL_COURT = `Il s'agit d'une évaluation « à froid » : on aimerait connaître votre ressenti sur la formation, maintenant que vous avez un peu de recul. Votre avis nous permettra de continuer à améliorer nos services et nos formations.`;

const FROID_CTA = `Ça ne vous prendra que quelques minutes, promis ! Ouvrez la pièce jointe ou suivez le lien (selon les instructions) pour compléter le questionnaire.`;

/**
 * Rend le texte de la satisfaction à froid pour la relance donnée.
 * Textes EXACTS du pilote SES-0097. La salutation est personnalisée avec les
 * prénoms des apprenants (`ctx.salutationPrenoms`). Le lien du questionnaire
 * (C7.i30) est inclus en clair (popup → pas d'attachment).
 */
export function renderFroidText(ctx: CalendarTextCtx, relance: FroidRelance = 1): string {
  const lien = driveViewUrl(DRIVE_DOCS.questionnaireFroid);

  if (relance === 1) {
    return `Bonjour ${ctx.salutationPrenoms},

${FROID_INTRO}

${FROID_RECUL_LONG}

${FROID_CTA}

<b>Pourquoi c'est important ?</b>
Parce que vos retours concrets sont la meilleure boussole pour ajuster nos programmes et répondre au mieux à vos besoins. Vos succès sont aussi les nôtres, alors on compte vraiment sur vous.

Merci mille fois pour votre participation !
Excellente journée, et à bientôt sur le terrain de l'immobilier !

Bien cordialement,
L'équipe Start Academy

(PS : Aucun questionnaire n'a été maltraité lors de la rédaction de cet e-mail… On vous l'assure !)

Questionnaire de satisfaction à froid : ${lien}`;
  }

  if (relance === 2) {
    return `<b>RELANCE 2 (1 mois et 15 jours après la fin) — si pas encore répondu au questionnaire à froid.</b>

Bonjour ${ctx.salutationPrenoms},

${FROID_INTRO}

${FROID_RECUL_LONG}

${FROID_CTA}

Merci mille fois pour votre participation !
Bien cordialement,
L'équipe Start Academy

Questionnaire de satisfaction à froid : ${lien}`;
  }

  return `<b>RELANCE 3 (2 mois après la fin) — dernière relance si pas de réponse au questionnaire à froid.</b>

Bonjour ${ctx.salutationPrenoms},

${FROID_INTRO}

${FROID_RECUL_COURT}

${FROID_CTA}

Merci mille fois pour votre participation !
Bien cordialement,
L'équipe Start Academy

Questionnaire de satisfaction à froid : ${lien}`;
}
