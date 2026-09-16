/**
 * Ce qui autorise à passer d'une étape à l'autre dans le wizard de création
 * de session — SOURCE UNIQUE, et module pur pour être vérifiable.
 *
 * La règle vivait inline dans le composant, donc intestable, et elle avait
 * dérivé : l'étape 3 exigeait « au moins un participant ». Or on crée une
 * session AVANT d'avoir des inscrits — c'est même le cas normal : on planifie
 * une date au catalogue, puis les inscriptions arrivent, par le lien public,
 * par SmartOF ou à la main.
 *
 * Le garde-fou était donc déplacé : il transformait « incomplet » en
 * « invalide ». Laurent s'est retrouvé à s'inscrire LUI-MÊME comme apprenant
 * pour franchir l'étape, puis à créer son propre organisme comme employeur
 * pour satisfaire le rattachement — deux fiches parasites nées d'une
 * validation trop zélée (11/09/2026). La fiche session signale déjà l'absence
 * d'inscrits, et le pack de fin de formation refuse de s'exécuter sans eux :
 * c'est là que la contrainte a du sens, pas à la création.
 *
 * Reste bloquant ce sans quoi la session n'existe pas : un produit et des dates
 * cohérentes.
 *
 * ── Le formateur déjà pris N'EST PLUS BLOQUANT (16/09/2026) ───────────────
 *
 * Il l'était : « indisponible sur toutes les dates » refusait l'étape. Cette
 * règle supposait qu'un formateur pris sur des dates ne peut pas être repris
 * sur les mêmes — vrai pour deux formations différentes, FAUX pour le cas
 * qu'on veut désormais servir.
 *
 * Une session mixte salariés / auto-entrepreneurs se scinde en DEUX sessions,
 * parce que les deux populations n'ont pas le même tarif et que chaque pièce
 * (programme, convention, dossier financeur) doit annoncer le sien. Ces deux
 * sessions partagent délibérément les mêmes dates, la même salle et le même
 * formateur : c'est la même journée de formation, découpée par régime de
 * paiement, pas deux formations concurrentes.
 *
 * L'ancienne règle rendait donc la seconde session impossible à créer — le
 * formateur étant « pris » par la première, sur exactement les mêmes dates.
 *
 * Le chevauchement reste une information qui vaut d'être vue : il devient un
 * AVERTISSEMENT (`avertissementsEtapeWizard`), affiché et non opposable. Un
 * conflit réel — deux formations distinctes le même jour — se voit toujours,
 * mais c'est l'humain qui tranche, pas le wizard.
 */

export interface DisponibiliteFormateur {
  totalDates: number;
  availableDates: number;
}

export interface EtatWizard {
  produitChoisi: boolean;
  dateDebut: string;
  dateFin: string;
  formateurIds: string[];
  /** Disponibilité calculée par formateur, indexée par `Person.id`. */
  disponibilites: Record<string, DisponibiliteFormateur | undefined>;
  formateurs: { id: string; firstName?: string | null; lastName?: string | null }[];
  nbParticipants: number;
}

/**
 * Renvoie le motif de blocage de l'étape, ou `null` si elle peut être
 * franchie.
 */
export function valideEtapeWizard(etape: number, etat: EtatWizard): string | null {
  if (etape === 1 && !etat.produitChoisi) return 'Sélectionne un produit';

  if (etape === 2) {
    if (!etat.dateDebut || !etat.dateFin) return 'Dates obligatoires';
    if (new Date(etat.dateFin) < new Date(etat.dateDebut)) {
      return 'Date fin doit être ≥ date début';
    }
    if (etat.formateurIds.length === 0) return 'Au moins un formateur est requis';

    // Le formateur déjà pris ne bloque plus — cf. en-tête. Le chevauchement
    // remonte par `avertissementsEtapeWizard`.
  }

  // Étape 3 — AUCUNE exigence d'inscrit : voir l'en-tête de ce module.
  return null;
}

/** Nom affichable d'un formateur, ou son id si la fiche ne dit rien. */
function nomFormateur(etat: EtatWizard, id: string): string {
  const t = etat.formateurs.find((tr) => tr.id === id);
  const nom = `${t?.firstName ?? ''} ${t?.lastName ?? ''}`.trim();
  return nom.length > 0 ? nom : id;
}

/**
 * Ce que l'étape SIGNALE sans l'interdire.
 *
 * Séparé de `valideEtapeWizard` à dessein : un appelant qui confond les deux
 * retransformerait l'avertissement en refus, et on aurait refait le blocage
 * qu'on vient d'enlever. Le type le dit — une liste, jamais un motif unique.
 */
export function avertissementsEtapeWizard(etape: number, etat: EtatWizard): string[] {
  if (etape !== 2) return [];

  const avertissements: string[] = [];
  for (const id of etat.formateurIds) {
    const a = etat.disponibilites[id];
    if (!a || a.totalDates === 0) continue;
    if (a.availableDates === 0) {
      avertissements.push(
        `${nomFormateur(etat, id)} est déjà rattaché à une autre session sur toutes ces dates. ` +
          `Normal si vous dédoublez une session par régime de paiement ; à vérifier sinon.`,
      );
    } else if (a.availableDates < a.totalDates) {
      const pris = a.totalDates - a.availableDates;
      avertissements.push(
        `${nomFormateur(etat, id)} est déjà pris sur ${pris} date${pris > 1 ? 's' : ''} sur ${a.totalDates}.`,
      );
    }
  }
  return avertissements;
}
