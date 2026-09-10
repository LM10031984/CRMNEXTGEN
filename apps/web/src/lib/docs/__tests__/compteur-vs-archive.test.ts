/**
 * L'INVARIANT qui manquait le 2026-09-10 : le nombre écrit sur le bouton
 * « Télécharger (N) » est le nombre de fichiers que l'archive contient.
 *
 * Bug d'origine (remonté par l'assistante administrative) : sur l'onglet
 * « Avant la formation », le bouton annonçait 5 pièces et l'archive en livrait
 * 5 aussi — mais pas les mêmes. Le compteur venait de la liste AFFICHÉE
 * (`buildDocDockItems`, qui portait l'attestation d'assiduité AGEFICE) et
 * l'archive de la table des phases (`doc-phase.ts`, qui classe l'assiduité en
 * « après » et ajoute le programme de formation). Les deux totaux tombaient
 * sur 5 par coïncidence : l'archive avait remplacé l'attestation par le
 * programme. Une pièce d'un dossier OPCO manquait, en silence.
 *
 * Ce test verrouille la correction : les deux consommateurs passent par
 * `resolveParticipantPhaseDocs`, donc ils ne peuvent plus diverger.
 *
 * Test de puissance : reclasser `ASSIDUITE` en `avant` dans `doc-phase.ts`, ou
 * réintroduire une liste locale dans l'un des deux consommateurs, doit faire
 * rougir « le compteur annonce exactement ce que l'archive contient ».
 */

import { describe, it, expect } from 'vitest';
import {
  buildParticipantPhaseGroups,
  resolveParticipantPhaseDocs,
} from '@/lib/sessions/participant-phase-items';
import {
  buildSessionLearnerZipEntries,
  type LearnerDocRef,
} from '../session-learner-zip-entries';
import { DOC_PHASES, type DocPhase } from '../doc-phase';

/** Un inscrit AGEFICE dont tout le dossier « avant » est produit. */
const PARTICIPANT_DOCS = new Map<string, { id: string }>([
  ['CONVENTION', { id: 'doc-convention' }],
  ['CONVOCATION', { id: 'doc-convocation' }],
  ['AGEFICE', { id: 'doc-agefice' }],
  // Classée « après » : c'est elle qui manquait à l'archive « avant ».
  ['ASSIDUITE', { id: 'doc-assiduite' }],
  ['ATTESTATION_FIN', { id: 'doc-attestation' }],
]);
const ASSETS = new Map<string, { id: string }>([
  ['ANALYSE_BESOIN', { id: 'asset-analyse' }],
  ['EMARGEMENT', { id: 'asset-emargement' }],
]);
/** Le programme est un document PRODUIT, partagé — l'archive l'embarque. */
const PRODUCT_DOCS = new Map<string, { id: string }>([['PROGRAMME', { id: 'doc-programme' }]]);
const SESSION_DOCS = new Map<string, { id: string }>();

const INSCRIT = {
  id: 'part-1',
  fullName: 'Jean-Baptiste BOUTRY',
  isAgefice: true,
  docStatus: null,
  participantDocs: PARTICIPANT_DOCS,
  pedagogicalAssets: ASSETS,
};

/** Ce que la route ZIP empaquette réellement, pour une phase donnée. */
function archive(phase: DocPhase | null): string[] {
  const phases = phase ? [phase] : DOC_PHASES.map((p) => p.id);
  const refs: LearnerDocRef[] = phases.flatMap((ph) =>
    resolveParticipantPhaseDocs({
      phase: ph,
      isAgefice: true,
      docStatus: null,
      participantDocs: PARTICIPANT_DOCS,
      productDocs: PRODUCT_DOCS,
      sessionDocs: SESSION_DOCS,
      pedagogicalAssets: ASSETS,
    })
      .filter((d) => d.pdfRef)
      .map((d) => ({
        docType: d.docType,
        kind: (d.pdfRef!.kind === 'asset' ? 'asset' : 'document') as LearnerDocRef['kind'],
        id: d.pdfRef!.id,
      })),
  );
  return buildSessionLearnerZipEntries({
    refs,
    phase,
    firstName: 'Jean-Baptiste',
    lastName: 'Boutry',
    sessionCode: 'SES-0111',
  }).map((e) => e.docType);
}

/** Ce que le bouton annonce, pour une phase donnée. */
function compteur(phase: DocPhase): number {
  const [groupe] = buildParticipantPhaseGroups({
    phase,
    participants: [INSCRIT],
    productDocs: PRODUCT_DOCS,
    sessionDocs: SESSION_DOCS,
  });
  return groupe!.readyCount;
}

describe('le compteur du bouton et le contenu de l’archive', () => {
  for (const { id, label } of DOC_PHASES) {
    it(`annoncent le même nombre de pièces — ${label}`, () => {
      expect(compteur(id)).toBe(archive(id).length);
    });
  }

  it('embarque le programme de formation dans le dossier « avant » de CHAQUE apprenant', () => {
    // L'OPCO le veut annexé à la convention : il est affiché une seule fois en
    // haut de l'onglet, mais il part dans le dossier de chacun.
    expect(archive('avant')).toContain('PROGRAMME');
  });

  it("range l'attestation d'assiduité AGEFICE dans l'archive « après », jamais « avant »", () => {
    expect(archive('avant')).not.toContain('ASSIDUITE');
    expect(archive('apres')).toContain('ASSIDUITE');
  });

  it('ne perd aucune pièce dans le dossier complet', () => {
    const complet = archive(null);
    expect(complet).toEqual(
      expect.arrayContaining([...archive('avant'), ...archive('pendant'), ...archive('apres')]),
    );
  });

  it('compte une pièce AGEFICE qui existe même pour un inscrit non affilié', () => {
    // Double casquette EI + enseigne : le document a été produit, il part dans
    // l'archive — donc il doit être compté, sinon le bouton sous-annonce.
    const [groupe] = buildParticipantPhaseGroups({
      phase: 'apres',
      participants: [{ ...INSCRIT, isAgefice: false }],
      productDocs: PRODUCT_DOCS,
      sessionDocs: SESSION_DOCS,
    });
    expect(groupe!.items.map((i) => i.docType)).toContain('ASSIDUITE');
    expect(groupe!.readyCount).toBe(archive('apres').length);
  });

  it("ne réclame pas une pièce AGEFICE absente à un inscrit non affilié", () => {
    const [groupe] = buildParticipantPhaseGroups({
      phase: 'avant',
      participants: [
        {
          ...INSCRIT,
          isAgefice: false,
          participantDocs: new Map([['CONVENTION', { id: 'doc-convention' }]]),
        },
      ],
      productDocs: PRODUCT_DOCS,
      sessionDocs: SESSION_DOCS,
    });
    expect(groupe!.items.map((i) => i.docType)).not.toContain('AGEFICE');
  });
});
