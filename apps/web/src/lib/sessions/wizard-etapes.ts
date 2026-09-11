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
 * Reste bloquant ce sans quoi la session n'existe pas : un produit, des dates
 * cohérentes, un formateur qui peut venir.
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

    // Indisponible sur TOUTES les dates : le refus est net. Partiellement
    // disponible, en revanche, reste un arbitrage humain — le wizard informe,
    // il ne décide pas.
    const bloquant = etat.formateurIds.find((id) => {
      const a = etat.disponibilites[id];
      return a && a.totalDates > 0 && a.availableDates === 0;
    });
    if (bloquant) {
      const t = etat.formateurs.find((tr) => tr.id === bloquant);
      const nom = `${t?.firstName ?? ''} ${t?.lastName ?? ''}`.trim();
      return `Formateur ${nom} indisponible sur toutes les dates — change de formateur ou de dates`;
    }
  }

  // Étape 3 — AUCUNE exigence d'inscrit : voir l'en-tête de ce module.
  return null;
}
