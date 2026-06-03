/**
 * Formules de statut Tréso AGEFICE — portage des 2 formules Airtable.
 *
 * Source : table `Inscriptions` dans Airtable "BDD Start Academy Refonte"
 * (cartographiée 2026-06-03). Reproduit fidèlement :
 *   - Statut_Opco           : 4 états sur 9 cases Qualiopi cochées
 *   - Statut_encaissement   : 9 états sur le workflow Pré-accord → Validé →
 *                              Facture → Remb. OPCO → Paiement client
 *
 * Permet à la page Audit Tréso de répliquer la vue Excel Tréso AGEFICE
 * de Laurent en s'appuyant sur les booléens existants côté SessionParticipant.
 */

export interface TresoParticipantFlags {
  // Date de fin de formation (pour distinguer "en cours" vs "à faire")
  endDate: Date;

  // Côté Qualiopi (9 cases — formule Statut_Opco)
  conventionSigned: boolean;
  programmeDelivered: boolean;
  certificateDelivered: boolean;
  pedagogicalSupportsGiven: boolean;
  attendanceSheetCollected: boolean;
  assiduitySheetCollected: boolean;
  evaluationCollected: boolean;
  satisfactionCollected: boolean;
  closingDocsSent: boolean;

  // Côté workflow OPCO (5 cases — formule Statut_encaissement)
  opcoPreApproved: boolean;
  opcoApproved: boolean;
  factureEnvoyee: boolean;
  opcoReimbursed: boolean;
  paymentReceived: boolean;
}

export type StatutOpco =
  | 'EN_COURS'
  | 'DOSSIER_COMPLET'
  | 'PRE_FORMATION_MANQUANT'
  | 'POST_FORMATION_INCOMPLET'
  | 'RETARD_30_JOURS';

export type StatutEncaissement =
  | 'SESSION_EN_COURS'
  | 'ENCAISSEMENT_COMPLET'
  | 'SANS_PREACCORD'
  | 'BLOQUE_DOCS_OPCO'
  | 'ATTENTE_VALIDATION_OPCO'
  | 'VALIDATION_OK_A_FACTURER'
  | 'FACTURE_ATTENTE_OPCO'
  | 'OPCO_RECU_ATTENTE_CLIENT'
  | 'A_COMPLETER';

const STATUT_OPCO_LABELS: Record<StatutOpco, string> = {
  EN_COURS: '⏳ Formation en cours',
  DOSSIER_COMPLET: '✅ Dossier OPCO complet',
  PRE_FORMATION_MANQUANT: '🚨 Documents pré-formation manquants',
  POST_FORMATION_INCOMPLET: '📝 Documents post-formation à compléter',
  RETARD_30_JOURS: '⚠️ URGENT — Retard > 30 jours',
};

const STATUT_ENCAISSEMENT_LABELS: Record<StatutEncaissement, string> = {
  SESSION_EN_COURS: '⏳ Session en cours',
  ENCAISSEMENT_COMPLET: '✅ Encaissement complet',
  SANS_PREACCORD: '⚠️ Sans pré-accord OPCO — Paiement client uniquement',
  BLOQUE_DOCS_OPCO: '🚨 Bloqué — Documents OPCO manquants',
  ATTENTE_VALIDATION_OPCO: '⏳ En attente validation OPCO',
  VALIDATION_OK_A_FACTURER: '📄 Validation OK — Facturer',
  FACTURE_ATTENTE_OPCO: '💳 Facture envoyée — En attente paiement OPCO',
  OPCO_RECU_ATTENTE_CLIENT: '👤 OPCO reçu — En attente paiement client',
  A_COMPLETER: '📝 Dossier à compléter',
};

/** Réplique Airtable formula Statut_Opco. */
export function computeStatutOpco(p: TresoParticipantFlags, today = new Date()): StatutOpco {
  if (p.endDate > today) return 'EN_COURS';

  const allQualiopi =
    p.conventionSigned &&
    p.programmeDelivered &&
    p.certificateDelivered &&
    p.pedagogicalSupportsGiven &&
    p.attendanceSheetCollected &&
    p.assiduitySheetCollected &&
    p.evaluationCollected &&
    p.satisfactionCollected &&
    p.closingDocsSent &&
    p.opcoApproved;

  if (allQualiopi) return 'DOSSIER_COMPLET';

  if (!p.conventionSigned || !p.programmeDelivered) return 'PRE_FORMATION_MANQUANT';

  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (p.endDate < thirtyDaysAgo) return 'RETARD_30_JOURS';

  return 'POST_FORMATION_INCOMPLET';
}

/** Réplique Airtable formula Statut_encaissement. */
export function computeStatutEncaissement(
  p: TresoParticipantFlags,
  today = new Date(),
): StatutEncaissement {
  if (p.endDate > today) return 'SESSION_EN_COURS';

  if (p.opcoReimbursed && p.paymentReceived) return 'ENCAISSEMENT_COMPLET';

  if (!p.opcoPreApproved) return 'SANS_PREACCORD';

  const hasMissingDocs =
    !p.certificateDelivered ||
    !p.attendanceSheetCollected ||
    !p.assiduitySheetCollected ||
    !p.evaluationCollected ||
    !p.satisfactionCollected;

  if (!p.opcoApproved && hasMissingDocs) return 'BLOQUE_DOCS_OPCO';

  if (!p.opcoApproved && p.closingDocsSent) return 'ATTENTE_VALIDATION_OPCO';

  if (p.opcoApproved && !p.factureEnvoyee) return 'VALIDATION_OK_A_FACTURER';

  if (p.factureEnvoyee && !p.opcoReimbursed) return 'FACTURE_ATTENTE_OPCO';

  if (p.opcoReimbursed && !p.paymentReceived) return 'OPCO_RECU_ATTENTE_CLIENT';

  return 'A_COMPLETER';
}

export function statutOpcoLabel(s: StatutOpco): string {
  return STATUT_OPCO_LABELS[s];
}
export function statutEncaissementLabel(s: StatutEncaissement): string {
  return STATUT_ENCAISSEMENT_LABELS[s];
}

/** Liste des docs manquants — réplique formule `Documents_manquants` Airtable. */
export function listMissingDocs(p: TresoParticipantFlags): string[] {
  const missing: string[] = [];
  if (!p.conventionSigned) missing.push('Convention');
  if (!p.programmeDelivered) missing.push('Programme');
  if (!p.certificateDelivered) missing.push('Certificat');
  if (!p.pedagogicalSupportsGiven) missing.push('Supports');
  if (!p.attendanceSheetCollected) missing.push('Émargement');
  if (!p.assiduitySheetCollected) missing.push('Assiduité');
  if (!p.evaluationCollected) missing.push('Évaluation');
  if (!p.satisfactionCollected) missing.push('Satisfaction');
  if (!p.closingDocsSent) missing.push('Docs fin');
  if (!p.opcoApproved) missing.push('Validation OPCO');
  if (!p.factureEnvoyee) missing.push('Facture');
  return missing;
}
