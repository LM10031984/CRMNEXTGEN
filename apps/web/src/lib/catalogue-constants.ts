/**
 * Textes standards Start Academy pour la page publique /catalogue (Ind 1 RNQ V9).
 * Centralisés ici pour pouvoir être édités sans toucher au render.
 */

export const DELAI_ACCES =
  "À partir de 11 jours ouvrés après contractualisation (délai légal de rétractation et préparation pédagogique).";

/**
 * ⚠ Le référent nommé ici est le référent handicap UNIQUE de l'organisme
 * (Qualiopi ind. 26). Sa source fait autorité ailleurs :
 * `lib/closure/checklist-formation-template.ts` → `HANDICAP_REFERENT_LINE`,
 * « identique sur tous les docs ». Le changer ici SEUL ferait dire deux noms
 * différents au catalogue et à la check-list de formation — exactement ce qui
 * s'est produit jusqu'au 12/09/2026, où la page publique en nommait trois.
 * `src/lib/__tests__/referent-handicap-unique.test.ts` tient les deux ensemble.
 */
export const ACCESSIBILITE_PSH =
  "Formation accessible aux personnes en situation de handicap. Référent handicap : Jean-Guy Ourmières — jean-guy@start-academy.fr — Adaptations sur demande (matériel, rythme, supports). Réseau partenaires : Agefiph, Cap emploi 06, MDPH 06.";
