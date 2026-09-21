/**
 * Quelles cellules de la matrice ont une génération EN VOL ?
 *
 * POURQUOI CE MODULE EXISTE (production, 21/09)
 *
 * Une régénération par la file rend la main tout de suite : c'est le worker qui
 * écrit le document, plus tard. Or pour un `Document`, il écrit par
 * `deleteMany + create` — le document régénéré reçoit un NOUVEL identifiant. La
 * matrice redessinée entre-temps offrait encore un lien vers l'ancien ; dès le
 * worker terminé, ce lien tombait sur un 404, « jusqu'à ce qu'on recharge une
 * fois ou deux ». Le défaut n'était pas dans la route, qui répondait juste : il
 * était dans une promesse faite trop tôt.
 *
 * Module pur : il reçoit les jobs, il ne va pas les chercher. La règle du
 * fantôme ci-dessous est une garantie de disponibilité de l'écran, elle doit
 * pouvoir se vérifier sans base ni horloge réelle.
 */

import { DOC_TYPE_TO_CLOSURE_KIND } from '@/lib/doc-scope';

/**
 * Au-delà, un job encore « en file » n'est plus une promesse : c'est un worker
 * arrêté, un déploiement tombé au mauvais moment. Deux écueils, et il faut
 * éviter les deux :
 *
 *   - le laisser compter « en cours » verrouillerait la cellule À VIE ;
 *   - l'ignorer ferait REVENIR le lien de l'ancien document — or le conseiller
 *     a demandé une régénération, et lui resservir l'ancien PDF comme si de
 *     rien n'était, c'est lui faire croire qu'il tient la nouvelle version
 *     (décision Laurent, 21/09).
 *
 * Il devient donc un ÉCHEC, affiché comme tel, avec « Relancer ». Le seuil est
 * celui de la file elle-même (`STALL_RECLAIM_AFTER_MIN` de `queue-postgres.ts`) :
 * un pack complet prend de l'ordre de deux minutes.
 */
export const DELAI_JOB_FANTOME_MS = 15 * 60 * 1000;

export interface JobDeGeneration {
  participantId: string;
  /** `ClosureDocKind` — le nom côté worker : ATTESTATION, QCM, SATISFACTION_CHAUD… */
  kind: string;
  /** `ClosureJobStatus`. */
  status: string;
  createdAt: Date;
}

/** Ce que la génération impose aux cellules d'une inscription. */
export interface EtatGeneration {
  /** Colonnes dont un job FRAIS est en file ou en cours. */
  enCours: Set<string>;
  /** Colonnes dont le dernier job est en vol depuis trop longtemps. */
  enEchec: Set<string>;
}

/** Le worker parle en `kind`, la matrice en colonnes : ATTESTATION → ATTESTATION_FIN. */
const COLONNE_PAR_KIND: ReadonlyMap<string, string> = new Map(
  Object.entries(DOC_TYPE_TO_CLOSURE_KIND).flatMap(([docType, kind]) =>
    kind === null ? [] : [[kind, docType] as const],
  ),
);

const EN_VOL: ReadonlySet<string> = new Set(['QUEUED', 'PROCESSING']);

/**
 * inscription → colonnes « en cours » et colonnes « en échec ».
 *
 * SEUL LE DERNIER JOB D'UNE CELLULE DÉCIDE. « Relancer » ne touche pas au job
 * fantôme : il en crée un autre, dans un autre batch. Sans cette règle, le
 * fantôme d'hier continuerait d'afficher « échec » sur le document régénéré
 * aujourd'hui. L'ordre est celui de `createdAt`, pas celui d'arrivée des lignes.
 *
 * Un dernier job DONE ou ERROR ne marque rien ici : ce module ne juge que les
 * jobs EN VOL. (Un ERROR laisse aujourd'hui la cellule revenir à l'ancien
 * document — question ouverte, hors de cette décision.)
 *
 * Un kind sans colonne connue est ignoré : inventer un nom de colonne ferait
 * apparaître un état que rien ne viendrait jamais éteindre.
 */
export function etatGenerationParParticipant(
  jobs: readonly JobDeGeneration[],
  maintenant: Date,
): Map<string, EtatGeneration> {
  const dernier = new Map<string, JobDeGeneration & { colonne: string }>();
  for (const job of jobs) {
    const colonne = COLONNE_PAR_KIND.get(job.kind);
    if (colonne === undefined) continue;
    const cle = `${job.participantId}\u0000${colonne}`;
    const connu = dernier.get(cle);
    if (connu === undefined || job.createdAt.getTime() > connu.createdAt.getTime()) {
      dernier.set(cle, { ...job, colonne });
    }
  }

  const resultat = new Map<string, EtatGeneration>();
  const limite = maintenant.getTime() - DELAI_JOB_FANTOME_MS;

  for (const job of dernier.values()) {
    if (!EN_VOL.has(job.status)) continue;
    const etat = resultat.get(job.participantId) ?? { enCours: new Set<string>(), enEchec: new Set<string>() };
    (job.createdAt.getTime() < limite ? etat.enEchec : etat.enCours).add(job.colonne);
    resultat.set(job.participantId, etat);
  }
  return resultat;
}
