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
 * mort, une file vidée, un déploiement tombé au mauvais moment. Le laisser
 * compter verrouillerait la cellule en « en cours » À VIE, sans lien ni
 * régénération possible — pire que le défaut qu'on corrige. Un pack complet
 * prend de l'ordre de deux minutes ; un quart d'heure laisse de la marge à une
 * file chargée sans jamais confisquer l'écran.
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

/** Le worker parle en `kind`, la matrice en colonnes : ATTESTATION → ATTESTATION_FIN. */
const COLONNE_PAR_KIND: ReadonlyMap<string, string> = new Map(
  Object.entries(DOC_TYPE_TO_CLOSURE_KIND).flatMap(([docType, kind]) =>
    kind === null ? [] : [[kind, docType] as const],
  ),
);

const EN_VOL: ReadonlySet<string> = new Set(['QUEUED', 'PROCESSING']);

/**
 * inscription → colonnes de la matrice dont la génération est en vol.
 *
 * Un kind sans colonne connue est ignoré : inventer un nom de colonne ferait
 * apparaître un « en cours » que rien ne viendrait jamais éteindre.
 */
export function docTypesEnCoursParParticipant(
  jobs: readonly JobDeGeneration[],
  maintenant: Date,
): Map<string, Set<string>> {
  const resultat = new Map<string, Set<string>>();
  const limite = maintenant.getTime() - DELAI_JOB_FANTOME_MS;

  for (const job of jobs) {
    if (!EN_VOL.has(job.status)) continue;
    if (job.createdAt.getTime() < limite) continue;
    const colonne = COLONNE_PAR_KIND.get(job.kind);
    if (colonne === undefined) continue;

    const colonnes = resultat.get(job.participantId) ?? new Set<string>();
    colonnes.add(colonne);
    resultat.set(job.participantId, colonnes);
  }
  return resultat;
}
