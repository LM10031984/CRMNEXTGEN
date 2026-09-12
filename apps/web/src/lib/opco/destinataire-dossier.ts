/**
 * À QUI PART LE DOSSIER DE FINANCEMENT.
 *
 * CE QUE FAISAIT L'APPLICATION, ET POURQUOI C'ÉTAIT FAUX POUR L'AGEFICE.
 * `composeOpcoSubmission` pré-remplissait `sponsorOrg.emailBilling ?? email` —
 * l'adresse de l'entreprise COMMANDITAIRE. Pour un OPCO de branche, c'est le
 * bon interlocuteur. Pour l'AGEFICE, non : le dossier se dépose auprès d'un
 * POINT D'ACCUEIL, choisi d'après le département du stagiaire (référentiel
 * officiel, `AgeficePointAccueil.departmentsServed`, quick 260908-m1v). Or le
 * commanditaire d'un dossier AGEFICE est justement l'entreprise individuelle du
 * stagiaire : l'application proposait donc d'envoyer le dossier à l'intéressé.
 *
 * ⚠ AUCUN REPLI SILENCIEUX. Quand le point d'accueil manque, ou n'a pas
 * d'adresse, on ne se rabat PAS sur l'entreprise : un dossier parti au mauvais
 * destinataire ne se rattrape pas, et le financeur ne le réclamera pas. On rend
 * `null` avec son motif, et l'éditeur laisse l'admin saisir l'adresse en
 * connaissance de cause — la même discipline que le refus nominatif du moteur
 * de signature.
 *
 * PUR : ni Prisma, ni réseau. Le point d'accueil est RÉSOLU AILLEURS (la
 * cascade officielle vit dans `lib/agefice/select-point-accueil.ts`, et le
 * rattachement est persisté sur `AgeficeProfile.pointAccueilId`) ; ce module ne
 * fait que choisir entre deux adresses déjà connues.
 */

/** Le financeur qui impose un point d'accueil plutôt qu'un interlocuteur direct. */
const FINANCEUR_A_POINT_ACCUEIL = 'AGEFICE';

export type SourceDestinataire = 'POINT_ACCUEIL_AGEFICE' | 'ORGANISATION' | 'AUCUN';

export interface DestinataireDossier {
  email: string | null;
  source: SourceDestinataire;
  /** Le nom du point d'accueil, quand c'est lui — pour que l'écran le montre. */
  libelle: string | null;
  /** Non nul EXACTEMENT quand aucune adresse n'a pu être pré-remplie. */
  motif: string | null;
}

function texteNonVide(valeur: string | null | undefined): string | null {
  const v = (valeur ?? '').trim();
  return v.length > 0 ? v : null;
}

export function resoudreDestinataireDossier(a: {
  opcoCode: string | null;
  pointAccueil: { name: string; email: string | null } | null;
  emailBilling: string | null;
  email: string | null;
}): DestinataireDossier {
  if (a.opcoCode === FINANCEUR_A_POINT_ACCUEIL) {
    if (a.pointAccueil === null) {
      return {
        email: null,
        source: 'AUCUN',
        libelle: null,
        motif:
          'Aucun point d’accueil AGEFICE rattaché : le dossier se dépose auprès du point ' +
          'd’accueil du département du stagiaire, jamais auprès de son entreprise. ' +
          'Rattachez-le sur la fiche organisation, ou saisissez l’adresse ci-dessous.',
      };
    }
    const adresse = texteNonVide(a.pointAccueil.email);
    if (adresse === null) {
      return {
        email: null,
        source: 'AUCUN',
        libelle: null,
        motif:
          `Aucune adresse email pour le point d’accueil « ${a.pointAccueil.name} » : ` +
          'renseignez-la dans le référentiel, ou saisissez l’adresse ci-dessous.',
      };
    }
    return {
      email: adresse,
      source: 'POINT_ACCUEIL_AGEFICE',
      libelle: a.pointAccueil.name,
      motif: null,
    };
  }

  // Chemin historique, inchangé : facturation d'abord, contact général ensuite.
  const adresse = texteNonVide(a.emailBilling) ?? texteNonVide(a.email);
  if (adresse === null) {
    return {
      email: null,
      source: 'AUCUN',
      libelle: null,
      motif:
        'Aucune adresse email sur le commanditaire : renseignez-la sur sa fiche ' +
        'organisation (facturation ou contact), ou saisissez l’adresse ci-dessous.',
    };
  }
  return { email: adresse, source: 'ORGANISATION', libelle: null, motif: null };
}

/* ── L'AIDE SOUS UN CHAMP DESTINATAIRE VIDE (D-D-1) ──────────────────────── */

/**
 * CE QUE L'ÉCRAN DISAIT ENCORE (recette du 12/09/2026) : « À renseigner —
 * vérifie l'organisation sponsor (champ emailBilling). »
 *
 * Deux défauts en une phrase. D'abord elle est PÉRIMÉE : depuis le lot D, un
 * dossier AGEFICE ne part pas au commanditaire mais à un point d'accueil, et
 * `emailBilling` n'a donc rien à voir avec ce champ. Ensuite elle nomme une
 * COLONNE DE BASE — ce qui suppose que le lecteur sache où la trouver, alors
 * que l'écran qui la porte s'appelle « Email de facturation ».
 *
 * ⚠ CETTE FONCTION RÉPOND À UNE AUTRE QUESTION QUE `resoudreDestinataireDossier`,
 * et c'est pourquoi elles coexistent : celle-ci dit « ce champ est vide, que
 * faire ? » — vrai même quand l'admin vient d'effacer une adresse correctement
 * pré-remplie. L'autre dit « pourquoi rien n'a été pré-rempli », au moment de
 * la composition. Les fusionner ferait répondre à la seconde question dans un
 * cas où elle ne se pose pas.
 */
export function aideDestinataireDossier(a: {
  opcoCode: string | null;
  /** Raison sociale ou nom commercial du commanditaire. */
  organisation: string | null;
}): string {
  const organisation = (a.organisation ?? '').trim() || 'cette organisation';
  if (a.opcoCode === FINANCEUR_A_POINT_ACCUEIL) {
    return (
      `Point d’accueil AGEFICE non rattaché à ${organisation} — renseignez son ` +
      `département / point d’accueil sur la fiche organisation.`
    );
  }
  return `Aucune adresse de facturation pour ${organisation} — renseignez-la sur sa fiche organisation.`;
}
