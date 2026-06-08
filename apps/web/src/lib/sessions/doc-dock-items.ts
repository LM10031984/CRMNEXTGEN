/**
 * Construit la liste des items DocDock à partir des données déjà fetchées
 * par la page session. Server-side helper pur (pas d'I/O).
 *
 * Cible : exposer dans le DocDock l'état + le lien PDF + l'action de
 * génération pour chaque doc pré-formation Qualiopi.
 */

import type { DocDockItem } from './dispatch-doc-types';

interface BuildInput {
  // Partagés produit/session
  programmeProductDocId?: string;
  derouleProductDocId?: string;
  checklistDocId?: string;
  // Participants + état AGEFICE éligibilité
  participants: Array<{
    id: string;
    fullName: string;
    isAgefice: boolean;
  }>;
  // Map participantId → Map<docType, {id}>
  docsByParticipant: Map<string, Map<string, string>>;
  // Map participantId → Map<kind, {id}>
  assetsByParticipant: Map<string, Map<string, string>>;
  // États BullMQ analyse besoin
  analyseBesoinInProgress: number;
  analyseBesoinPending: number;
}

export function buildDocDockItems(input: BuildInput): DocDockItem[] {
  const items: DocDockItem[] = [];

  // ─── Partagés ─────────────────────────────────────────────────────────
  items.push({
    key: 'programme',
    docType: 'PROGRAMME',
    label: 'Programme de formation',
    indic: 'Ind 1·6',
    section: 'shared',
    state: input.programmeProductDocId ? 'generated' : 'missing',
    pdfUrl: input.programmeProductDocId
      ? `/api/documents/${input.programmeProductDocId}`
      : undefined,
  });
  items.push({
    key: 'deroule',
    docType: 'DEROULE',
    label: 'Déroulé pédagogique',
    indic: 'Ind 10',
    section: 'shared',
    state: input.derouleProductDocId ? 'generated' : 'missing',
    pdfUrl: input.derouleProductDocId
      ? `/api/documents/${input.derouleProductDocId}`
      : undefined,
  });
  items.push({
    key: 'checklist',
    docType: 'CHECKLIST',
    label: 'Check-list formation',
    indic: 'Ind 17',
    section: 'shared',
    state: input.checklistDocId ? 'generated' : 'missing',
    pdfUrl: input.checklistDocId ? `/api/documents/${input.checklistDocId}` : undefined,
  });

  // ─── Par stagiaire ────────────────────────────────────────────────────
  for (const p of input.participants) {
    const docs = input.docsByParticipant.get(p.id);
    const assets = input.assetsByParticipant.get(p.id);

    const conventionId = docs?.get('CONVENTION');
    items.push({
      key: `convention-${p.id}`,
      docType: 'CONVENTION',
      label: `Convention — ${p.fullName}`,
      participantName: p.fullName,
      participantId: p.id,
      indic: 'Ind 6·8',
      section: 'participant',
      state: conventionId ? 'generated' : 'missing',
      pdfUrl: conventionId ? `/api/documents/${conventionId}` : undefined,
    });

    const convocationId = docs?.get('CONVOCATION');
    items.push({
      key: `convocation-${p.id}`,
      docType: 'CONVOCATION',
      label: `Convocation — ${p.fullName}`,
      participantName: p.fullName,
      participantId: p.id,
      indic: 'Ind 9',
      section: 'participant',
      state: convocationId ? 'generated' : 'missing',
      pdfUrl: convocationId ? `/api/documents/${convocationId}` : undefined,
    });

    if (p.isAgefice) {
      const ageficeId = docs?.get('AGEFICE');
      items.push({
        key: `agefice-${p.id}`,
        docType: 'AGEFICE',
        label: `Demande AGEFICE — ${p.fullName}`,
        participantName: p.fullName,
        participantId: p.id,
        indic: 'Ind 27',
        section: 'participant',
        state: ageficeId ? 'generated' : 'missing',
        pdfUrl: ageficeId ? `/api/documents/${ageficeId}` : undefined,
      });
    }

    // Analyse besoin = IA Ollama, gérée comme un kind PedagogicalAsset
    const analyseId = assets?.get('ANALYSE_BESOIN');
    const isPending = !analyseId && (input.analyseBesoinInProgress > 0 || input.analyseBesoinPending > 0);
    items.push({
      key: `analyse-${p.id}`,
      docType: 'ANALYSE_BESOIN',
      label: `Analyse besoin — ${p.fullName}`,
      participantName: p.fullName,
      participantId: p.id,
      indic: 'Ind 11',
      section: 'ai',
      state: analyseId ? 'generated' : isPending ? 'pending' : 'missing',
      pdfUrl: analyseId ? `/api/pedagogical-assets/${analyseId}` : undefined,
    });
  }

  return items;
}
