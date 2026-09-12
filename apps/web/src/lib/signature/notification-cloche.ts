/**
 * LA CLOCHE, pour une pièce signée par tous — lot C.3, défaut D-C3-2.
 *
 * LE DÉFAUT QU'IL CORRIGE (recette du 11/09/2026, étape 10). `prevenirAdmins`
 * écrit une ligne `Notification` de type `signature.completed` par ADMIN dès que
 * le webhook `submission.completed` a ramené le PDF signé et son certificat —
 * vérifié en base sur l'aperçu. Mais `getNotifications()` ne lisait que
 * `type: 'lead.assigned'` : la cloche restait muette. Une notification écrite
 * que personne ne lit est pire qu'une notification absente — elle donne
 * l'illusion que le circuit est complet.
 *
 * POURQUOI CE MODULE EST À PART, ET PUR. Le libellé et la destination sont deux
 * DÉCISIONS (« quelle pièce », « quel onglet »), pas de la mise en forme.
 * Écrites dans la server action, elles ne seraient vérifiables qu'en montant
 * Prisma et Lucia ; ici elles se gardent en une ligne, avec des valeurs
 * littérales.
 *
 * ⚠ RIEN N'EST DÉCIDÉ DEUX FOIS. Le nom de la pièce vient de `NOM_DE_PIECE` —
 * la table que les emails de signature utilisent déjà ; le moment de la
 * formation vient de `scopeDeLaPiece`, lecture de la table du plan d'envoi. Une
 * pièce signable de plus se branche à ces deux endroits, jamais ici.
 */

import { NOM_DE_PIECE } from '@/lib/mailer-templates/signature-email-commun';
import { estPieceSignable } from '@/lib/signature/envoi-contrats';
import { scopeDeLaPiece, type ScopeEnvoi } from '@/lib/signature/plan-envoi';
import { retourVersOnglet } from '@/lib/sessions/lien-renseigner-financeur';
import type { SessionTabId } from '@/components/sessions/tabs/session-tabs-config';

/**
 * Ce que la ligne annonce, après le nom de la pièce.
 *
 * « signée par tous les signataires » et non « signée » : la nuance est celle
 * que le lot C.3 a gravée dans le moteur — `form.completed` (un signataire) ne
 * clôt rien, seul `submission.completed` apporte la preuve. La cloche ne sonne
 * que pour le second, et la phrase doit le dire, sinon un admin croira la pièce
 * close au premier paraphe.
 */
const MENTION_COMPLETE = 'par tous les signataires';

/**
 * Le nom de la pièce, ACCORDÉ — table de données, jamais une concaténation.
 *
 * Une convention est « signée », un dossier AGEFICE est « signé ». Dériver
 * l'accord d'un `docType` en dur produirait « Dossier AGEFICE signée » au
 * premier oubli, et personne ne le verrait avant qu'un utilisateur le signale
 * (même motif que `TITRE_DEPOT_PAR_DOCTYPE`).
 */
const ACCORD_SIGNE: Record<string, string> = {
  CONVENTION: 'signée',
  AGEFICE: 'signé',
  ASSIDUITE: 'signée',
};

/** Ce qu'on écrit d'une pièce hors corpus — vrai, et jamais le code brut. */
const PIECE_INCONNUE = { titre: 'Document', accord: 'signé' } as const;

/**
 * « Convention signée par tous les signataires — SES-0048 ».
 *
 * Le code de session est FACULTATIF : une ligne écrite sans lui doit rester
 * lisible plutôt que d'afficher « — null ». Une pièce hors corpus retombe sur
 * « Document » : afficher `EMARGEMENT` dans une cloche ne se lit pas.
 */
export function libelleSignatureCompletee(a: {
  docType: string;
  sessionCode: string | null | undefined;
}): string {
  const nom = estPieceSignable(a.docType)
    ? { titre: NOM_DE_PIECE[a.docType].titre, accord: ACCORD_SIGNE[a.docType] ?? 'signé' }
    : PIECE_INCONNUE;

  const code = (a.sessionCode ?? '').trim();
  const suffixe = code.length > 0 ? ` — ${code}` : '';
  return `${nom.titre} ${nom.accord} ${MENTION_COMPLETE}${suffixe}`;
}

/** L'onglet de la fiche session où la pièce se trouve réellement. */
const ONGLET_PAR_SCOPE: Record<ScopeEnvoi, SessionTabId> = {
  BEFORE: 'avant',
  AFTER: 'apres',
};

/**
 * Où mène le clic : la fiche session, sur l'onglet QUI PORTE LA PIÈCE.
 *
 * ⚠ L'ONGLET N'EST PAS DÉCORATIF. Les panneaux d'onglet inactifs sont rendus
 * `hidden` — donc `display:none` : ouvrir « Avant » pour une attestation
 * d'assiduité ne montre pas une pièce difficile à trouver, il n'en montre
 * aucune. Une pièce hors corpus ouvre la fiche sans onglet : on ne devine pas.
 */
export function lienSignatureCompletee(a: { sessionId: string; docType: string }): string {
  if (!estPieceSignable(a.docType)) return retourVersOnglet(a.sessionId, 'session');
  return retourVersOnglet(a.sessionId, ONGLET_PAR_SCOPE[scopeDeLaPiece(a.docType)]);
}
