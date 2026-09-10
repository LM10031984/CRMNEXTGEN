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

import { deriveCellState, type CellPdfRef } from '@/lib/derive-cell-state';
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

/** Une pièce d'une phase, résolue : son type, son intitulé, où la lire. */
export interface ResolvedPhaseDoc {
  docType: string;
  label: string;
  /** Absent = la pièce n'existe pas encore. */
  pdfRef?: CellPdfRef;
}

export interface ResolvePhaseDocsInput {
  phase: DocPhase;
  /** Réservé aux affiliés : voir `AGEFICE_ONLY`. */
  isAgefice: boolean;
  docStatus: Record<string, unknown> | null;
  participantDocs: Map<string, { id: string }>;
  productDocs: Map<string, { id: string }>;
  sessionDocs: Map<string, { id: string }>;
  pedagogicalAssets: Map<string, { id: string }>;
}

/**
 * SOURCE UNIQUE — « quelles pièces, pour cet inscrit, sur cette phase ».
 *
 * Deux consommateurs, et c'est tout l'enjeu : l'écran (compteur du bouton
 * « Télécharger (N) », lignes des blocs nominatifs) et la route ZIP
 * (`buildSessionLearnerZip`). Ils lisaient chacun leur liste jusqu'au
 * 2026-09-10 — l'onglet « Avant » comptait l'attestation d'assiduité que
 * l'archive ne pouvait pas contenir, et l'archive embarquait le programme que
 * l'onglet ne comptait pas. Les deux affichaient 5. Une seule pièce manquait,
 * en silence, dans un dossier OPCO.
 *
 * Tant que les deux passent par ici, le nombre annoncé EST le nombre livré.
 */
export function resolveParticipantPhaseDocs(input: ResolvePhaseDocsInput): ResolvedPhaseDoc[] {
  const out: ResolvedPhaseDoc[] = [];
  for (const docType of PARTICIPANT_DOC_TYPES_BY_PHASE[input.phase]) {
    const cell = deriveCellState(
      docType,
      { docStatus: input.docStatus as never },
      input.participantDocs,
      input.productDocs,
      input.sessionDocs,
      input.pedagogicalAssets,
    );
    const pdfRef = 'pdfRef' in cell ? cell.pdfRef : undefined;
    // « Sans objet » ne vaut que pour un document ABSENT : une pièce AGEFICE
    // qui existe pour un inscrit non affilié (double casquette EI + enseigne)
    // part quand même dans son archive, donc elle doit rester comptée ici —
    // sinon le bouton annonce une pièce de moins qu'il n'en livre.
    if (AGEFICE_ONLY.has(docType) && !input.isAgefice && !pdfRef) continue;
    out.push({
      docType,
      label: DOC_TYPE_LABELS[docType]?.long ?? docType,
      ...(pdfRef ? { pdfRef } : {}),
    });
  }
  return out;
}

export function buildParticipantPhaseGroups(input: {
  phase: DocPhase;
  participants: readonly PhaseParticipantInput[];
  productDocs: Map<string, { id: string }>;
  sessionDocs: Map<string, { id: string }>;
}): PhaseParticipantGroup[] {
  return input.participants.map((p) => {
    const items: PhaseDocLine[] = resolveParticipantPhaseDocs({
      phase: input.phase,
      isAgefice: p.isAgefice,
      docStatus: p.docStatus,
      participantDocs: p.participantDocs,
      productDocs: input.productDocs,
      sessionDocs: input.sessionDocs,
      pedagogicalAssets: p.pedagogicalAssets,
    }).map((d) => {
      const href = d.pdfRef
        ? d.pdfRef.kind === 'asset'
          ? `/api/pedagogical-assets/${d.pdfRef.id}`
          : `/api/documents/${d.pdfRef.id}`
        : undefined;
      return {
        docType: d.docType,
        label: d.label,
        state: (href ? 'generated' : 'missing') as PhaseDocLine['state'],
        pdfUrl: href,
        // `?dl=1` : le téléchargement porte un nom parlant, la consultation
        // reste une consultation (cf. api/documents/[id]/route.ts).
        downloadUrl: href ? `${href}?dl=1` : undefined,
      };
    });
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
