/**
 * Types partagés pour le dispatch de génération de docs Qualiopi
 * pré-formation (server action + client DocDock).
 *
 * Fichier dédié car les fichiers `'use server'` ne peuvent exporter
 * que des async functions — pas de types/interfaces.
 */

export type DispatchableDocType =
  | 'PROGRAMME'
  | 'DEROULE'
  | 'CHECKLIST'
  | 'CONVENTION'
  | 'CONVOCATION'
  | 'AGEFICE'
  | 'ANALYSE_BESOIN'
  | 'ASSIDUITE_AGEFICE';

export interface DispatchGenerateDocInput {
  sessionId: string;
  docType: DispatchableDocType;
  participantId?: string;
  force?: boolean;
}

export interface DispatchResult {
  ok: boolean;
  error?: string;
  docId?: string;
  resourceKind?: 'asset' | 'document';
  enqueued?: boolean;
}
