/**
 * Les contacts de l'organisme — **une entrée par RÔLE, source unique**.
 *
 * ## Pourquoi ce fichier
 *
 * En deux jours, **quatre** noms de personne physique ont été trouvés dans du
 * texte destiné au client ou au financeur, dont **deux de personnes parties** —
 * chacun découvert par accident, jamais par un garde. Un OF certifié dont les
 * documents nomment des personnes parties est un constat d'auditeur, pas un
 * détail de code.
 *
 * > **Un contact n'est pas du contenu.** Tout nom de personne physique dans un
 * > texte client ou financeur vient de ce module, jamais d'un littéral.
 *
 * ## Une entrée par RÔLE, pas par personne
 *
 * Les rôles ne se fondent pas entre eux : le référent handicap (indicateur 26)
 * et le contact d'accès à la formation **peuvent être deux personnes**, et
 * aujourd'hui ce sont deux personnes. Un module par personne se serait défait
 * au premier départ ; un module par rôle survit aux départs.
 *
 * ## Condition de migration
 *
 * Ces valeurs passent en colonnes `Tenant` le jour où un **SECOND** organisme
 * utilise QualiOF, pas avant (spec §5.5). Les `Tenant.qualiopi*` posées le
 * 11/09 valent `NULL` en production et aucun écran ne permet de les remplir :
 * on ajouterait une indirection qui retombe ici.
 */

/** Un contact joignable. `telephone: null` = aucun numéro vérifié à ce jour. */
export interface ContactOrganisme {
  readonly role: string;
  readonly nom: string | null;
  readonly email: string;
  readonly telephone: string | null;
}

/**
 * Référent handicap — Qualiopi indicateur 26.
 *
 * Source d'origine : `checklist-formation-template.ts`, qui le déclarait
 * « référent handicap unique de l'OF, identique sur tous les docs » depuis le
 * 17/06/2026 — pendant que le catalogue en nommait un autre.
 */
export const REFERENT_HANDICAP: ContactOrganisme = {
  role: 'Référent handicap',
  nom: 'Jean-Guy Ourmières',
  email: 'jean-guy@start-academy.fr',
  telephone: '06 10 23 00 60',
};

/**
 * Contact d'accès à la formation — inscription, conventions, délais.
 *
 * Le contact nommé dans les anciens programmes était « Angélique LAFITTE »,
 * qui a quitté l'organisme. C'est **Béatrice Blanc** depuis — valeurs données
 * par Laurent le 14/09/2026, **pas déduites**.
 *
 * ⚠ **L'adresse est générique, et c'est VOULU.** `formation@start-academy.fr`
 * est l'adresse confirmée de ce rôle, pas un repli paresseux qu'on aurait posé
 * faute de mieux. Ne pas la « corriger » en `beatrice@…` : personne n'a jamais
 * dit que cette adresse-là existe.
 *
 * ⚠ **À ne pas confondre avec le référent handicap** : deux rôles, deux
 * personnes. Jean-Guy Ourmières reste le référent handicap (ind. 26).
 */
export const CONTACT_ACCES_FORMATION: ContactOrganisme = {
  role: "Contact d'accès à la formation",
  nom: 'Béatrice Blanc',
  email: 'formation@start-academy.fr',
  telephone: '06 10 90 12 00',
};

/**
 * Contact porté par les invitations et rappels d'agenda.
 *
 * ⚠ **Le téléphone a été RETIRÉ le 14/09/2026.** Ces textes envoyaient
 * `07 80 91 95 31` aux apprenants — le numéro de Julien Lafitte, parti. Le
 * dépôt le savait : `programme-template.ts` le remplaçait déjà par
 * `06 31 05 63 90` dans les programmes (`replaceDepartedContact`). Le programme
 * corrigeait, l'agenda diffusait.
 *
 * On ne reprend PAS `06 31 05 63 90` : ce numéro n'est attribué à personne dans
 * le dépôt, et remplacer un numéro périmé par un numéro anonyme n'est pas une
 * correction. Le rôle tient avec l'adresse générique jusqu'à ce que Laurent
 * nomme le numéro.
 */
export const CONTACT_AGENDA: ContactOrganisme = {
  role: 'Contact agenda',
  nom: null,
  email: 'formation@start-academy.fr',
  telephone: null,
};

/**
 * La ligne « Nom — adresse — téléphone », dans l'ordre, sans les parties
 * absentes. Un contact sans nom rend « adresse », pas « — adresse ».
 */
export function ligneContact(c: ContactOrganisme): string {
  return [c.nom, c.email, c.telephone].filter((x): x is string => !!x).join(' — ');
}

/** La forme courte « Nom — adresse » : une page publique n'affiche pas un direct. */
export function ligneContactCourte(c: ContactOrganisme): string {
  return [c.nom, c.email].filter((x): x is string => !!x).join(' — ');
}
