/**
 * Les relances du stand — J+1 (appel), J+4 et J+10 (emails).
 *
 * Module PUR (zéro prisma / auth / React), comme `priorite.ts` et `scoring.ts` :
 * c'est de la copie commerciale, elle doit être couverte par des tests et
 * relisible sans lancer l'application.
 *
 * POURQUOI CES TROIS MOMENTS (document de conversion, §5)
 *
 * Une soirée d'anniversaire un verre à la main : personne ne signe ce soir-là.
 * Le stand n'achète que le droit d'appeler. Ce qui transforme, c'est la suite :
 *   J+1  — appel des leads A, ouvert par « vous m'avez dit cette semaine » ;
 *   J+4  — un mail court qui pose UNE question fermée à deux options ;
 *   J+10 — la date limite AGEFICE, et une porte de sortie honorable.
 *
 * DEUX RÈGLES QUI TIENNENT TOUT
 *
 * 1. Ces emails doivent avoir l'air ÉCRITS À LA MAIN. Pas de HTML, pas de
 *    bandeau, pas de bouton : du texte brut, court, à la première personne. Un
 *    email de relance qui ressemble à une newsletter ne reçoit pas de réponse.
 *    C'est pourquoi ce module ne rend que du texte — il n'y a volontairement
 *    aucun gabarit HTML ici, contrairement à `mailer-templates/`.
 *
 * 2. AUCUN ENVOI AUTOMATIQUE. Ce module fabrique un brouillon ; c'est un humain
 *    qui clique. Le prospect a consenti à être rappelé, pas à recevoir une
 *    séquence. Un automatisme sur ce chemin transformerait un consentement en
 *    campagne — et une campagne, ça se déclare autrement au registre.
 *
 * Aucun prix nulle part, comme dans l'email de programme : seuls les DROITS
 * AGEFICE, qui appartiennent au prospect.
 */

import { PROBLEMATIQUES, type ProblematiqueKey } from './questions';

/** Les deux relances écrites. L'appel J+1 n'est pas un email : voir `SCRIPT_APPEL`. */
export type EtapeRelance = 'J4' | 'J10';

export const ETAPE_LIBELLE: Record<EtapeRelance, string> = {
  J4: 'J+4 — deux options de dates',
  J10: 'J+10 — date limite et porte de sortie',
};

export interface ContexteRelance {
  /** Prénom du prospect, tel qu'il l'a saisi. */
  prenom: string;
  /** Axe dominant de son diagnostic. */
  dominante: ProblematiqueKey;
  /** Prénom et nom de qui signe — un humain, jamais une marque, sur une relance. */
  signataire: string;
  /** Événement d'origine, pour rappeler où on s'est vus. */
  evenement: string;
}

export interface Relance {
  subject: string;
  text: string;
}

/**
 * J+4 — la question fermée à deux options.
 *
 * « Avant fin octobre ou plutôt en novembre ? » convertit nettement mieux qu'un
 * « n'hésitez pas à revenir vers moi » : le prospect n'a pas à décider s'il
 * veut, seulement quand. Les deux options sont volontairement larges — le but
 * est d'obtenir une réponse, pas une date.
 */
function relanceJ4(ctx: ContexteRelance): Relance {
  const axe = PROBLEMATIQUES[ctx.dominante].titre;
  return {
    subject: `Suite au ${ctx.evenement} — votre journée`,
    text: [
      `${ctx.prenom}, on s'est croisés au ${ctx.evenement}.`,
      ``,
      `Votre diagnostic pointait « ${axe} » et je vous ai envoyé le programme de la journée correspondante.`,
      ``,
      `Une seule question : vous préférez qu'on cale ça avant fin octobre, ou plutôt en novembre ?`,
      ``,
      ctx.signataire,
    ].join('\n'),
  };
}

/**
 * J+10 — la date limite, et la porte de sortie.
 *
 * Les 15 jours calendaires de dépôt AGEFICE ne sont pas un argument de vente,
 * c'est une contrainte de calendrier vérifiable : elle donne une raison de
 * décider maintenant sans rien exagérer. Et « dites-le-moi simplement, je vous
 * recontacte en janvier » augmente le taux de réponse tout en qualifiant le
 * lead pour l'année suivante au lieu de le brûler.
 */
function relanceJ10(ctx: ContexteRelance): Relance {
  return {
    subject: 'Vos droits formation 2026 (dernier message)',
    text: [
      `${ctx.prenom}, je clôture mon suivi du ${ctx.evenement}.`,
      ``,
      `Rappel utile : le dossier AGEFICE doit être déposé 15 jours avant le début de la formation.`,
      `Pour une journée en décembre, il faut donc décider d'ici mi-novembre — au 31 décembre,`,
      `ce qui n'a pas été consommé sur l'enveloppe de l'année est perdu.`,
      ``,
      `Si ce n'est pas le moment, dites-le-moi simplement : je vous recontacte en janvier,`,
      `quand l'enveloppe est repartie à zéro.`,
      ``,
      ctx.signataire,
    ].join('\n'),
  };
}

export function composerRelance(etape: EtapeRelance, ctx: ContexteRelance): Relance {
  return etape === 'J4' ? relanceJ4(ctx) : relanceJ10(ctx);
}

/**
 * Le script du coup de fil J+1, affiché sur la fiche du lead.
 *
 * Il n'est PAS envoyé : il est là pour être lu pendant que ça sonne. L'ouverture
 * compte plus que le reste — « vous m'aviez dit que je pouvais vous appeler
 * cette semaine » n'est pas du démarchage, c'est un rendez-vous tenu.
 *
 * La phrase sur les droits n'est vraie que si le prospect a déclaré n'avoir
 * suivi aucune formation cette année : `droitsIntacts` la retire sinon, plutôt
 * que de faire dire à Laurent quelque chose de faux à voix haute.
 */
export function scriptAppel(input: {
  prenom: string;
  dominante: ProblematiqueKey;
  signataire: string;
  evenement: string;
  droitsIntacts: boolean;
}): string {
  const lignes = [
    `Bonjour ${input.prenom}, ${input.signataire} de Start Academy.`,
    `On s'est vus au ${input.evenement}, vous m'aviez dit que je pouvais vous appeler cette semaine.`,
    `Vous avez bien reçu votre programme ?`,
    ``,
  ];

  if (input.droitsIntacts) {
    lignes.push(
      `Je vous appelle surtout pour une chose concrète : vos droits formation 2026.`,
      `Vous m'avez dit que vous n'aviez rien fait cette année — vous avez donc une enveloppe`,
      `qui dort et qui saute au 31 décembre.`,
      `On regarde ensemble en dix minutes ce qu'on peut caler avant la fin d'année ?`,
    );
  } else {
    lignes.push(
      `Je vous appelle pour une chose concrète : votre enveloppe formation 2026.`,
      `Elle est annuelle et ce qui n'est pas consommé au 31 décembre est perdu.`,
      `On regarde ensemble en dix minutes ce qu'il vous reste et ce qu'on peut caler ?`,
      `(Vous avez déjà suivi une formation cette année : à vérifier avant de promettre quoi que ce soit.)`,
    );
  }

  lignes.push(
    ``,
    `Son axe : ${PROBLEMATIQUES[input.dominante].titre}.`,
    `Ne pas annoncer de prix au téléphone — proposer le point financement de 15 minutes.`,
  );

  return lignes.join('\n');
}
