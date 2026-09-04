/**
 * Horaires d'une session — SOURCE UNIQUE.
 *
 * Jusqu'ici chaque document réinventait les horaires, en dur :
 *   - `closure/emargement-template.ts` : « 9h00–13h00 » / « 14h00–18h00 » ;
 *   - `actions/convocation-generator.ts` : « 9h00 – 17h00 » ;
 *   - `components/sessions/step-pendant-formation.tsx` : idem émargement.
 * La norme maison (journée de 8 h) le permettait. Elle ne tient plus dès qu'une
 * session sort du moule — SES-0111 « Du surfeur au pilote — Étape 2 » (11 h sur
 * 1,5 jour) : J1 11h00-13h00 / 14h30-17h30, J2 9h00-12h30 / 13h30-16h00. Les
 * documents sortaient alors avec des horaires FAUX, signés par le formateur et
 * envoyés au financeur — même famille de risque que le refus AGEFICE du
 * 28/08/2026 sur la raison sociale du lieu.
 *
 * La vérité, c'est `SessionSlot` : un créneau par demi-journée réellement
 * planifiée. Ce module le traduit, et lui seul. Quand la session n'a pas de
 * créneau (majorité de l'historique), on retombe explicitement sur la norme
 * maison — le comportement d'avant, à l'identique.
 *
 * Module neutre (aucun import, aucun 'use client') : consommable depuis un
 * template PDF, une server action ou un composant client.
 */

/** Norme maison, journée de 8 h (Laurent 2026-06-03). */
export const HORAIRE_MATIN_DEFAUT = '9h00–13h00' as const;
export const HORAIRE_APREM_DEFAUT = '14h00–18h00' as const;

/** Forme minimale d'un `SessionSlot` — évite de dépendre du client Prisma. */
export interface SessionSlotLike {
  date: Date;
  startTime: string;
  endTime: string;
  halfDay: string; // 'morning' | 'afternoon' | 'full'
}

export interface JourneeHoraires {
  /** Jour calendaire français, « YYYY-MM-DD ». Clé de regroupement stable. */
  iso: string;
  /** ex « 11h00–13h00 ». `null` = aucun créneau ce demi-jour. */
  matin: string | null;
  /** ex « 14h30–17h30 ». `null` = aucun créneau ce demi-jour. */
  apresMidi: string | null;
  /** Créneau `halfDay='full'` — une journée d'un seul tenant, sans coupure. */
  journeeComplete: string | null;
}

export interface HorairesSession {
  jours: JourneeHoraires[];
  /**
   * `true` quand tous les jours partagent exactement les mêmes horaires. C'est
   * le cas courant : les documents peuvent alors afficher l'horaire une fois,
   * en en-tête de colonne, au lieu de le répéter sur chaque ligne.
   */
  uniformes: boolean;
  /** Horaire matin commun quand `uniformes`, sinon `null`. */
  matinCommun: string | null;
  /** Horaire après-midi commun quand `uniformes`, sinon `null`. */
  apresMidiCommun: string | null;
}

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/**
 * Normalise une heure de créneau vers le format maison « 9h00 ».
 *
 * La base porte deux conventions : « 9h00 » (écrit par `proposeSchedule`, la
 * référence) et « 09:00 » (scripts de création ad hoc — dette SES-0110). Les
 * comparer telles quelles ferait passer deux sessions identiques pour
 * différentes, et sortirait « 09:00 » dans un PDF français.
 */
export function normaliserHeure(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})\s*[h:]\s*(\d{0,2})$/);
  if (!m) return raw.trim(); // format inconnu : on n'invente rien, on laisse tel quel
  const heures = parseInt(m[1]!, 10);
  const minutes = m[2] ? m[2].padEnd(2, '0') : '00';
  return `${heures}h${minutes}`;
}

/** « 11h00–13h00 » à partir des deux bornes d'un créneau. */
export function plageHoraire(startTime: string, endTime: string): string {
  return `${normaliserHeure(startTime)}–${normaliserHeure(endTime)}`;
}

/**
 * Jour calendaire FRANÇAIS d'une date de créneau, en « YYYY-MM-DD ».
 *
 * Les dates de créneaux sont stockées selon deux conventions historiques :
 * minuit UTC (`2026-09-28T00:00:00Z`) et minuit Paris (`2026-09-27T22:00:00Z`).
 * Regrouper sur `toISOString()` décalerait la seconde d'un jour ; regrouper sur
 * le fuseau du serveur donnerait un résultat différent en local (Paris) et sur
 * Vercel (UTC). On ancre donc explicitement sur Europe/Paris.
 */
export function jourFrISO(date: Date): string {
  // 'fr-CA' produit nativement « YYYY-MM-DD ».
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** « 28 septembre 2026 » à partir d'un ISO « YYYY-MM-DD ». Sans dépendance au fuseau. */
export function formatJourFr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const mois = MOIS_FR[parseInt(m[2]!, 10) - 1] ?? m[2]!;
  return `${m[3]} ${mois} ${m[1]}`;
}

/** « lun. 28/09 » — format court pour la ligne « Horaires » de la convocation. */
export function formatJourCourtFr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  // Midi UTC : à l'abri de tout décalage de fuseau au moment de lire le jour.
  const d = new Date(`${iso}T12:00:00Z`);
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' });
  return `${jour} ${m[3]}/${m[2]}`;
}

/**
 * Traduit les créneaux d'une session en horaires par jour.
 * Retourne `null` quand la session n'a aucun créneau : l'appelant retombe alors
 * sur la norme maison, exactement comme avant l'introduction de ce module.
 */
export function horairesSession(
  slots: SessionSlotLike[] | null | undefined,
): HorairesSession | null {
  if (!slots || slots.length === 0) return null;

  const parJour = new Map<string, JourneeHoraires>();
  for (const slot of slots) {
    const iso = jourFrISO(slot.date);
    const jour = parJour.get(iso) ?? {
      iso,
      matin: null,
      apresMidi: null,
      journeeComplete: null,
    };
    const plage = plageHoraire(slot.startTime, slot.endTime);
    if (slot.halfDay === 'afternoon') jour.apresMidi = plage;
    else if (slot.halfDay === 'full') jour.journeeComplete = plage;
    else jour.matin = plage; // 'morning' et tout libellé inattendu
    parJour.set(iso, jour);
  }

  const jours = Array.from(parJour.values()).sort((a, b) => a.iso.localeCompare(b.iso));
  const premier = jours[0]!;
  const uniformes = jours.every(
    (j) =>
      j.matin === premier.matin &&
      j.apresMidi === premier.apresMidi &&
      j.journeeComplete === premier.journeeComplete,
  );

  return {
    jours,
    uniformes,
    matinCommun: uniformes ? premier.matin : null,
    apresMidiCommun: uniformes ? premier.apresMidi : null,
  };
}

/** « 11h00 – 13h00 et 14h30 – 17h30 » — les demi-journées d'un jour, en toutes lettres. */
export function libelleDemiJournees(jour: JourneeHoraires): string {
  if (jour.journeeComplete) return jour.journeeComplete.replace('–', ' – ');
  return [jour.matin, jour.apresMidi]
    .filter((p): p is string => p !== null)
    .map((p) => p.replace('–', ' – '))
    .join(' et ');
}

/**
 * Ligne « Horaires » de la convocation.
 *
 * Retourne `null` sans créneau — l'appelant garde alors sa mention générique.
 * Sinon : « 9h00 – 13h00 et 14h00 – 18h00 » quand tous les jours se
 * ressemblent, sinon le détail jour par jour.
 */
export function resumeHorairesSession(
  slots: SessionSlotLike[] | null | undefined,
): string | null {
  const h = horairesSession(slots);
  if (!h) return null;
  if (h.uniformes) {
    const libelle = libelleDemiJournees(h.jours[0]!);
    return libelle.length > 0 ? libelle : null;
  }
  return h.jours.map((j) => `${formatJourCourtFr(j.iso)} : ${libelleDemiJournees(j)}`).join(' · ');
}

/**
 * Vue sérialisable des horaires pour un composant client (fiche session).
 * `null` sans créneau : l'écran affiche alors la norme maison, comme avant.
 */
export interface HorairesAffichage {
  uniformes: boolean;
  /** Renseignés seulement si `uniformes`. */
  matin: string | null;
  apresMidi: string | null;
  /** Renseigné seulement si les jours diffèrent. */
  parJour: Array<{ label: string; plages: string }>;
}

export function horairesAffichage(
  slots: SessionSlotLike[] | null | undefined,
): HorairesAffichage | null {
  const h = horairesSession(slots);
  if (!h) return null;
  return {
    uniformes: h.uniformes,
    matin: h.matinCommun,
    apresMidi: h.apresMidiCommun,
    parJour: h.uniformes
      ? []
      : h.jours.map((j) => ({ label: formatJourCourtFr(j.iso), plages: libelleDemiJournees(j) })),
  };
}
