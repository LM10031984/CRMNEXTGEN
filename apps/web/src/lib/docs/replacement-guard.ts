/**
 * Lot 0 · 0.2 — LE point de contrôle du remplacement d'un document.
 *
 * Pourquoi il existe, et pourquoi il est seul : la garde vivait chez deux
 * appelants (la matrice) pendant que TROIS autres chemins écrivaient sans la
 * consulter — régénération groupée, bouton « régénérer les documents
 * génériques », et le worker qui remplace attestations et certificats. Une
 * attestation déjà envoyée à l'apprenant pouvait donc être remplacée en
 * silence. C'est exactement la leçon du quick 260820-j8w (« 4 implémentations
 * divergentes de : ce participant a-t-il une convention ? ») : une règle qui
 * vit chez les appelants finit toujours par en oublier un.
 *
 * Les cinq chemins passent désormais par `checkDocumentReplacement`, et il n'y
 * a rien à décider ailleurs.
 *
 * ── Deux régimes, décidés par Laurent le 02/09 ────────────────────────────
 *
 * `groupe` (régénération groupée, retry de batch, pack de fin de formation,
 *   worker) — STRICT. Un document engagé est SAUTÉ et remonté dans le rapport,
 *   jamais remplacé. Aucune échappatoire : personne ne lit un avertissement au
 *   milieu d'un traitement de masse.
 *
 * `unitaire` (une cellule de la matrice, une action, un humain devant l'écran)
 *   — ÉCHAPPATOIRE. Le serveur refuse d'abord, nomme le motif d'engagement, et
 *   n'accepte qu'un second appel portant la confirmation. Pour un engagement
 *   PROUVÉ, un motif écrit est en plus exigé et part dans l'AuditLog : si
 *   quelqu'un remplace une convention déjà signée, on doit pouvoir lire
 *   pourquoi six mois plus tard.
 *
 * ── Le doute n'est pas l'engagement ───────────────────────────────────────
 *
 * `MAYBE_SENT` (document antérieur au suivi des envois) ne bloque PAS le
 * régime groupé, et n'exige pas de motif en unitaire : tout le parc antérieur
 * au 02/09/2026 est dans ce cas — 1416 documents au dernier comptage. En faire
 * un blocage rendrait toute campagne de régénération impossible, donc la
 * décrue des « non vérifiables » aussi. Le doute mérite un avertissement, pas
 * une porte fermée.
 */

import {
  getParticipantDocEngagement,
  engagementWarning,
  type DocumentEngagement,
} from './document-engagement';

export type ReplacementMode = 'unitaire' | 'groupe';

/** Longueur minimale d'un motif — assez pour dire quelque chose. */
export const MOTIF_MIN_LENGTH = 10;

export interface ReplacementRequest {
  tenantId: string;
  participantId: string;
  docType: string;
  mode: ReplacementMode;
  /** Ce que l'appelant s'apprête à faire — change la formulation, pas la règle. */
  action?: 'regenerate' | 'delete';
  /** Chemin unitaire : l'humain a lu l'avertissement et confirme. */
  confirmEngaged?: boolean;
  /** Chemin unitaire, engagement prouvé : pourquoi on remplace quand même. */
  motif?: string | null;
}

export type ReplacementRefusal =
  /** Chemin unitaire, premier appel : il faut confirmer. */
  | 'confirmation_requise'
  /** Chemin unitaire, engagement prouvé : il faut écrire pourquoi. */
  | 'motif_requis'
  /** Chemin groupé : on ne remplace pas un document engagé, point. */
  | 'engage_chemin_groupe';

export type ReplacementVerdict =
  | {
      allowed: true;
      engagement: DocumentEngagement | null;
      /** Id du document existant, quand il y en a un. */
      documentId: string | null;
      /** Motif retenu (chemin unitaire sur engagement prouvé). */
      motif: string | null;
    }
  | {
      allowed: false;
      refusal: ReplacementRefusal;
      /** Phrase prête à afficher — le serveur seul connaît le motif. */
      warning: string;
      engagement: DocumentEngagement;
      documentId: string;
    };

/**
 * Autorise ou refuse le remplacement d'un document. UN SEUL appel à faire
 * avant toute écriture qui écrase un `Document` existant.
 */
export async function checkDocumentReplacement(
  req: ReplacementRequest,
): Promise<ReplacementVerdict> {
  const action = req.action ?? 'regenerate';

  const found = await getParticipantDocEngagement(req.tenantId, req.participantId, req.docType);

  // Aucun document à protéger : il n'y a rien à remplacer.
  if (!found) {
    return { allowed: true, engagement: null, documentId: null, motif: null };
  }

  const { engagement, documentId } = found;

  if (engagement.level === 'FREE') {
    return { allowed: true, engagement, documentId, motif: null };
  }

  // ── Régime groupé : strict, et seulement sur l'engagement PROUVÉ ────────
  if (req.mode === 'groupe') {
    if (engagement.level === 'ENGAGED') {
      return {
        allowed: false,
        refusal: 'engage_chemin_groupe',
        warning: `Document engagé (${engagement.reasons.join(' · ')}) — conservé, non remplacé. Un avenant ou un nouveau dossier est nécessaire.`,
        engagement,
        documentId,
      };
    }
    // MAYBE_SENT : doute, pas engagement. Le traitement de masse continue.
    return { allowed: true, engagement, documentId, motif: null };
  }

  // ── Régime unitaire : échappatoire tracée ──────────────────────────────
  if (!req.confirmEngaged) {
    return {
      allowed: false,
      refusal: 'confirmation_requise',
      warning: engagementWarning(engagement, action) ?? '',
      engagement,
      documentId,
    };
  }

  const motif = (req.motif ?? '').trim();
  if (engagement.level === 'ENGAGED' && motif.length < MOTIF_MIN_LENGTH) {
    return {
      allowed: false,
      refusal: 'motif_requis',
      warning: `Ce document est engagé : ${engagement.reasons.join(' · ')}. Écrivez pourquoi vous le remplacez malgré tout (au moins ${MOTIF_MIN_LENGTH} caractères) — la raison est conservée dans le journal d'audit.`,
      engagement,
      documentId,
    };
  }

  return {
    allowed: true,
    engagement,
    documentId,
    motif: motif.length > 0 ? motif : null,
  };
}

/** Ce qu'on écrit dans l'AuditLog quand l'échappatoire a été empruntée. */
export function auditTrailFor(verdict: ReplacementVerdict): Record<string, unknown> {
  if (!verdict.allowed || !verdict.engagement) return {};
  if (verdict.engagement.level === 'FREE') return {};
  return {
    confirmedOverEngagement: true,
    engagementLevel: verdict.engagement.level,
    engagementReasons: verdict.engagement.reasons,
    ...(verdict.motif ? { motif: verdict.motif } : {}),
  };
}
