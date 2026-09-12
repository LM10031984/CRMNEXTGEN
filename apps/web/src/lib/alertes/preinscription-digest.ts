/**
 * Alerte A-3 — « un dossier vient d'être déposé » (spec §11.1) — fonction pure.
 *
 * La règle qui compte tient en une phrase de la spec : « plusieurs soumissions
 * d'une même campagne dans l'heure → regroupées en un digest ». Elle existe
 * pour une raison très concrète : quand un dirigeant diffuse le lien de sa
 * campagne à son équipe, les huit participants remplissent leur dossier dans le
 * même quart d'heure. Sans regroupement, l'admin reçoit huit emails en quinze
 * minutes, et le neuvième — celui d'une autre campagne, isolé, qui méritait un
 * regard — se perd dans le tas.
 *
 * Aucun import prisma/next : on décide sur une liste déjà chargée. C'est ce qui
 * permet de tester la fenêtre d'une heure sans attendre une heure.
 */

/** Fenêtre de regroupement, en minutes (spec §11.1 : « dans l'heure »). */
export const DIGEST_WINDOW_MINUTES = 60;

export interface SubmissionSnapshot {
  id: string;
  /** null = lien individuel hors campagne : jamais regroupé, il est seul. */
  batchId: string | null;
  batchLabel: string | null;
  firstName: string | null;
  lastName: string | null;
  submittedAt: Date;
}

export type AlerteSubmission =
  | {
      kind: 'unitaire';
      preEnrollmentIds: [string];
      nom: string;
      batchId: string | null;
      batchLabel: string | null;
    }
  | {
      kind: 'digest';
      preEnrollmentIds: string[];
      noms: string[];
      batchId: string;
      batchLabel: string | null;
    };

function nomAffiche(s: SubmissionSnapshot): string {
  const n = `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim();
  return n || 'Participant sans nom saisi';
}

/**
 * Regroupe les dossiers déposés en alertes à envoyer.
 *
 * Deux dossiers ne sont regroupés que s'ils partagent une campagne ET tombent
 * dans la même fenêtre d'une heure. Un dossier hors campagne (`batchId` null)
 * reste toujours seul : il vient d'un envoi nominatif, donc quelqu'un l'attend
 * personnellement, et le noyer dans un digest lui ferait perdre son urgence.
 *
 * La fenêtre est glissante et ancrée sur le PREMIER dossier du groupe : trois
 * dépôts à 10 h 00, 10 h 50 et 11 h 30 donnent deux alertes (les deux premiers,
 * puis le troisième) et non une seule qui s'étirerait indéfiniment tant que les
 * dépôts s'enchaînent.
 */
export function grouperAlertesSubmission(
  submissions: readonly SubmissionSnapshot[],
  windowMinutes: number = DIGEST_WINDOW_MINUTES,
): AlerteSubmission[] {
  const fenetre = windowMinutes * 60_000;
  const alertes: AlerteSubmission[] = [];

  const horsCampagne = submissions.filter((s) => s.batchId === null);
  for (const s of horsCampagne) {
    alertes.push({
      kind: 'unitaire',
      preEnrollmentIds: [s.id],
      nom: nomAffiche(s),
      batchId: null,
      batchLabel: null,
    });
  }

  const parCampagne = new Map<string, SubmissionSnapshot[]>();
  for (const s of submissions) {
    if (s.batchId === null) continue;
    const liste = parCampagne.get(s.batchId);
    if (liste) liste.push(s);
    else parCampagne.set(s.batchId, [s]);
  }

  for (const [batchId, liste] of parCampagne) {
    const tries = [...liste].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    let groupe: SubmissionSnapshot[] = [];
    let ancre = 0;

    const vider = () => {
      if (groupe.length === 0) return;
      const premier = groupe[0]!;
      if (groupe.length === 1) {
        alertes.push({
          kind: 'unitaire',
          preEnrollmentIds: [premier.id],
          nom: nomAffiche(premier),
          batchId,
          batchLabel: premier.batchLabel,
        });
      } else {
        alertes.push({
          kind: 'digest',
          preEnrollmentIds: groupe.map((g) => g.id),
          noms: groupe.map(nomAffiche),
          batchId,
          batchLabel: premier.batchLabel,
        });
      }
      groupe = [];
    };

    for (const s of tries) {
      if (groupe.length === 0) {
        groupe = [s];
        ancre = s.submittedAt.getTime();
        continue;
      }
      if (s.submittedAt.getTime() - ancre <= fenetre) {
        groupe.push(s);
      } else {
        vider();
        groupe = [s];
        ancre = s.submittedAt.getTime();
      }
    }
    vider();
  }

  return alertes;
}

/** Objet de l'email, dérivé de la forme de l'alerte. */
export function sujetAlerteSubmission(a: AlerteSubmission): string {
  if (a.kind === 'digest') {
    const ou = a.batchLabel ? ` — ${a.batchLabel}` : '';
    return `${a.preEnrollmentIds.length} dossiers de pré-inscription déposés${ou}`;
  }
  const ou = a.batchLabel ? ` — ${a.batchLabel}` : '';
  return `Dossier de pré-inscription déposé : ${a.nom}${ou}`;
}
