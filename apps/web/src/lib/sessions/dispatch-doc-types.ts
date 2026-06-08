/**
 * Types partagés pour le dispatch de génération de docs Qualiopi
 * pré-formation (server action + client DocDockDrawer + helpers UI).
 *
 * Fichier dédié car les fichiers `'use server'` ne peuvent exporter
 * que des async functions — pas de types/interfaces.
 *
 * `DocDockItem` migré ici depuis doc-dock.tsx au commit ui-e3 #5 (le
 * composant `<DocDock>` floating ayant été remplacé par
 * `<DocDockDrawer>` en ui-d).
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

/** Item exposé par <DocDockDrawer> et construit par `buildDocDockItems`. */
export interface DocDockItem {
  /** Clé unique stable (ex: 'programme' ou 'convention-{participantId}') */
  key: string;
  docType: DispatchableDocType;
  label: string;
  /** Pour les docs par stagiaire — affiché sous le label */
  participantName?: string;
  participantId?: string;
  /** Indicateur Qualiopi à afficher en chip discret */
  indic?: string;
  state: 'generated' | 'missing' | 'pending';
  /** URL complète pour ouvrir le PDF (target=_blank). Présent si state='generated'. */
  pdfUrl?: string;
  /** Section UX (Partagés / Par stagiaire / IA) */
  section: 'shared' | 'participant' | 'ai';
}
