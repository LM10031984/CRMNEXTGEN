/**
 * Phase 13 Plan 13-05 — 12 sources RSS seed (3 par thème).
 *
 * D-05 (CONTEXT.md) : sources extraites de RESEARCH §4.1 et confirmées par
 * Laurent. Liste à valider runtime via `scripts/probe-veille-sources.ts`
 * (HEAD probe sur les 12 URLs). Si une source meurt, désactiver `active: false`
 * et documenter en deferred-items.md.
 *
 * Worker safety : aucun import ici (config statique uniquement).
 */

export interface RssSourceConfig {
  /** Nom court humain pour les logs et le PDF audit. */
  name: string;
  /** URL du flux RSS (Atom / RSS 2.0 / RDF — `rss-parser` normalise tous les formats). */
  url: string;
  /** Thème Qualiopi correspondant. La duplication URL→thème est autorisée par D-11. */
  theme: 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';
  /** Désactivable sans suppression — pratique pour quarantaine. */
  active: boolean;
}

export const RSS_SOURCES: RssSourceConfig[] = [
  // INDIC_23 — Veille évolutions secteur formation pro
  { name: 'Ministère du Travail', url: 'https://travail-emploi.gouv.fr/feed/rss', theme: 'INDIC_23', active: true },
  { name: 'Centre Inffo', url: 'https://www.centre-inffo.fr/feed', theme: 'INDIC_23', active: true },
  { name: 'Culture RH', url: 'https://culture-rh.com/feed/', theme: 'INDIC_23', active: true },

  // INDIC_24 — Veille secteur d'activité (immobilier pour Start Academy)
  { name: 'Immobilier 2.0', url: 'https://immo2.pro/feed/', theme: 'INDIC_24', active: true },
  { name: 'Actu Juridique', url: 'https://actu-juridique.fr/feed/', theme: 'INDIC_24', active: true },
  { name: 'Service Public Particuliers', url: 'https://www.service-public.gouv.fr/particuliers/actualites.rss', theme: 'INDIC_24', active: true },

  // INDIC_25 — Innovations pédagogiques et technologiques
  { name: 'Digiformag', url: 'https://www.digiformag.com/feed/', theme: 'INDIC_25', active: true },
  { name: 'Innovation Pédagogique', url: 'https://www.innovation-pedagogique.fr/spip.php?page=backend', theme: 'INDIC_25', active: true },
  { name: 'Thot Cursus', url: 'https://cursus.edu/feed', theme: 'INDIC_25', active: true },

  // INDIC_26 — Handicap + DREETS régionale
  { name: 'Agefiph', url: 'https://www.agefiph.fr/rss.xml', theme: 'INDIC_26', active: true },
  { name: 'Handirect', url: 'https://www.handirect.fr/feed/', theme: 'INDIC_26', active: true },
  { name: 'Faire-Face', url: 'https://www.faire-face.fr/feed/', theme: 'INDIC_26', active: true },
];
