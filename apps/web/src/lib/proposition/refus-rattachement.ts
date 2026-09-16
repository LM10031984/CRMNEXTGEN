/**
 * Les refus de RATTACHEMENT douleur → module, keyés sur la PAIRE.
 *
 * ## Pourquoi ce fichier existe (16/09/2026)
 *
 * Les quatre barrages posés par Laurent le 11/09 vivaient dans
 * `propose-rattachement.ts`, enregistrés sur le `ruleId` de la douleur. Le tri
 * faisait alors `continue` sans regarder les candidats.
 *
 * Or **aucun des quatre ne refusait la douleur.** Chacun refusait UN MODULE mal
 * rapproché, et le motif le dit mot pour mot : « le mot “collecte” menait à une
 * collecte d'e-mails, pas d'avis ». Le refus visait le candidat ; il a été
 * enregistré sur le besoin. Conséquence : **un mauvais candidat stérilisait un
 * besoin définitivement**, et le bon module — écrit depuis — ne pouvait plus
 * l'atteindre.
 *
 * ## La clé est le `sourceRef`
 *
 * Même patron que `arbitrages-rattachement.ts`, posé le 16/09 pour
 * `drive:034#2` : l'identité stable d'un module dans sa source survit à un
 * ré-import ET à un renommage. Ce second point n'est pas théorique — quatre
 * titres ont été réécrits entre le 14 et le 16/09, et le générateur, qui
 * apparie les rattachements RETENUS par leur titre, en a perdu quatre du même
 * coup. Un refus apparié par le titre aurait disparu en silence, ce qui est
 * pire : rien ne l'aurait signalé.
 *
 * ## Ce que ce registre n'est PAS
 *
 * Il ne dit jamais « cette douleur n'est pas un besoin de formation ». Ça,
 * c'est D-28 (`answerableByTraining: false` dans le barème), un autre
 * mécanisme, qui porte quatre règles de contexte et de financement. Les
 * confondre revient à sortir un besoin de l'exercice parce qu'une proposition
 * était mauvaise.
 */

export interface RefusDeCouple {
  /** L'identité STABLE du module refusé — `drive:NNN#i`. Jamais le titre. */
  moduleSourceRef: string;
  /** Le titre au moment du refus — pour relire, jamais pour identifier. */
  moduleTitre: string;
  /** Le motif, dans les mots de celui qui a tranché. */
  motif: string;
  date: string;
}

/**
 * Le tri de Laurent du 11/09/2026, ré-exprimé en paires.
 *
 * Les modules refusés ont été retrouvés dans la première version du relevé
 * (`git show df71fa23:.planning/260911-rattachement-douleur-module.md`), qui
 * portait encore la colonne « proposition » avant que Laurent ne barre.
 */
export const REFUS_RATTACHEMENT: Readonly<Record<string, readonly RefusDeCouple[]>> = {
  'contacts-vers-rdv': [
    {
      moduleSourceRef: 'drive:036#7',
      moduleTitre: 'Gestion des contacts.',
      motif: 'le mot « contacts » menait à une formation aux newsletters',
      date: '2026-09-11',
    },
  ],
  indicateurs: [
    {
      moduleSourceRef: 'drive:010#2',
      moduleTitre:
        "Apprendre à réévaluer régulièrement le plan d'action en fonction des " +
        'résultats obtenus et des changements de situation.',
      motif: 'accroché au seul mot « régulièrement » — un plan d’action n’est pas un indicateur suivi',
      date: '2026-09-11',
    },
  ],
  'visites-par-vente': [
    {
      moduleSourceRef: 'drive:061#5',
      moduleTitre:
        'Synthèse de la journée Retour sur les enseignements clés Préparation des ' +
        'éléments nécessaires pour le travail de contenu et de tournage du Jour 2',
      motif: 'le mot « nécessaires » menait à une synthèse de journée de tournage',
      date: '2026-09-11',
    },
  ],
  'collecte-avis': [
    {
      moduleSourceRef: 'drive:066#3',
      moduleTitre: 'Collecte d’emails + QR Codes + formulaires (7h)',
      motif: 'le mot « collecte » menait à une collecte d’e-mails, pas d’avis',
      date: '2026-09-11',
    },
  ],
};

/**
 * Les candidats qui survivent aux refus d'une douleur.
 *
 * Un refus retire le module qu'il nomme, et lui seul. Si tous les candidats
 * sont refusés, la liste est vide — la douleur retombe alors « sans réponse »,
 * ce qui est vrai et se compte, au lieu de sortir de l'exercice sans bruit.
 */
export function candidatsSurvivants<T extends { sourceRef: string | null }>(
  candidats: readonly T[],
  refus: readonly RefusDeCouple[],
): T[] {
  const refuses = new Set(refus.map((r) => r.moduleSourceRef));
  // Un candidat sans `sourceRef` est un produit vendu pris comme un tout : un
  // refus de MODULE ne le vise pas.
  return candidats.filter((c) => c.sourceRef === null || !refuses.has(c.sourceRef));
}

/**
 * Les refus qui ne retrouvent plus leur module.
 *
 * Seconde moitié de la règle, et elle n'est pas décorative : un registre qui ne
 * sait pas dire ce qu'il a perdu n'est pas un registre. C'est le signalement
 * des orphelines qui a rendu visible, le 16/09, le décrochage de quatre
 * décisions vieux de quatre jours.
 *
 * Un refus orphelin n'est pas grave en soi — le module refusé a pu quitter le
 * catalogue, et le refus devient alors sans objet. Ce qui serait grave, c'est
 * de ne pas le savoir : un `sourceRef` mal saisi ne refuse rien, en silence.
 */
export function refusOrphelins(
  refsConnues: ReadonlySet<string>,
  registre: Readonly<Record<string, readonly RefusDeCouple[]>> = REFUS_RATTACHEMENT,
): { ruleId: string; refus: RefusDeCouple }[] {
  const orphelins: { ruleId: string; refus: RefusDeCouple }[] = [];
  for (const [ruleId, liste] of Object.entries(registre)) {
    for (const r of liste) {
      if (!refsConnues.has(r.moduleSourceRef)) orphelins.push({ ruleId, refus: r });
    }
  }
  return orphelins;
}
