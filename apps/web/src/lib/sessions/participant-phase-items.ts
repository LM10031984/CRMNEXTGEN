/**
 * Les documents d'une phase, apprenant par apprenant — la donnée que rend
 * l'onglet « Après la formation » sous forme de blocs nominatifs.
 *
 * Pourquoi ce helper existe : l'onglet « Avant » groupait déjà ses lignes par
 * apprenant (via `buildDocDockItems`), mais l'onglet « Après » n'affichait que
 * les 4 documents de niveau session et le bloc pack — AUCUN bloc nominatif.
 * Laurent (2026-09-10) veut son bouton « là où il y a le nom des apprenants,
 * dans la phase avant la formation, après etc. » : il fallait donc d'abord
 * qu'il y ait un nom d'apprenant dans « après ».
 *
 * Fonction PURE, calculée côté serveur : elle sort des objets simples
 * (sérialisables), parce que le consommateur est un composant client.
 *
 * Source unique : chaque état vient de `deriveCellState`, la MÊME fonction que
 * chaque cellule de la matrice. Pas de recompte local, donc pas de « la matrice
 * dit prêt, l'onglet dit manquant ».
 */

import { deriveCellState } from '@/lib/derive-cell-state';
import { DOC_TYPE_LABELS } from '@/lib/doc-scope';
import { PARTICIPANT_DOC_TYPES_BY_PHASE, type DocPhase } from '@/lib/docs/doc-phase';

export interface PhaseDocLine {
  docType: string;
  label: string;
  state: 'generated' | 'missing';
  /** URL d'ouverture du PDF quand il existe. */
  pdfUrl?: string;
  /** URL de téléchargement (nom parlant) quand il existe. */
  downloadUrl?: string;
}

export interface PhaseParticipantGroup {
  /** `SessionParticipant.id` — c'est lui que prend la route ZIP. */
  participantId: string;
  fullName: string;
  sponsorOrgLabel?: string;
  items: PhaseDocLine[];
  readyCount: number;
  missingCount: number;
}

export interface PhaseParticipantInput {
  id: string;
  fullName: string;
  sponsorOrgLabel?: string;
  isAgefice: boolean;
  docStatus: Record<string, unknown> | null;
  participantDocs: Map<string, { id: string }>;
  pedagogicalAssets: Map<string, { id: string }>;
}

/**
 * Les documents réservés aux affiliés AGEFICE. Pour les autres inscrits ce
 * n'est pas « manquant », c'est « sans objet » — les afficher en rouge ferait
 * un compteur de manquants qui ne descend jamais.
 */
const AGEFICE_ONLY = new Set(['AGEFICE', 'ASSIDUITE']);

export function buildParticipantPhaseGroups(input: {
  phase: DocPhase;
  participants: readonly PhaseParticipantInput[];
  productDocs: Map<string, { id: string }>;
  sessionDocs: Map<string, { id: string }>;
}): PhaseParticipantGroup[] {
  const docTypes = PARTICIPANT_DOC_TYPES_BY_PHASE[input.phase];

  return input.participants.map((p) => {
    const items: PhaseDocLine[] = [];
    for (const docType of docTypes) {
      if (AGEFICE_ONLY.has(docType) && !p.isAgefice) continue;
      const cell = deriveCellState(
        docType,
        { docStatus: p.docStatus as never },
        p.participantDocs,
        input.productDocs,
        input.sessionDocs,
        p.pedagogicalAssets,
      );
      const pdfRef = 'pdfRef' in cell ? cell.pdfRef : undefined;
      const href = pdfRef
        ? pdfRef.kind === 'asset'
          ? `/api/pedagogical-assets/${pdfRef.id}`
          : `/api/documents/${pdfRef.id}`
        : undefined;
      items.push({
        docType,
        label: DOC_TYPE_LABELS[docType]?.long ?? docType,
        state: href ? 'generated' : 'missing',
        pdfUrl: href,
        // `?dl=1` : le téléchargement porte un nom parlant, la consultation
        // reste une consultation (cf. api/documents/[id]/route.ts).
        downloadUrl: href ? `${href}?dl=1` : undefined,
      });
    }
    const readyCount = items.filter((i) => i.state === 'generated').length;
    return {
      participantId: p.id,
      fullName: p.fullName,
      sponsorOrgLabel: p.sponsorOrgLabel,
      items,
      readyCount,
      missingCount: items.length - readyCount,
    };
  });
}
