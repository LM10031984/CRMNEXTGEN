/**
 * Construit les données de <ParticipantDocsCards> côté server à partir
 * des maps déjà fetchées par la page session. Aucun I/O — helper pur.
 *
 * Mapping process Laurent (cf message 2026-06-04) :
 *   Pré-formation (7 docs):
 *     - Convention (par payeur — toujours visible côté apprenant)
 *     - Convocation
 *     - Analyse besoin (IA Ollama)
 *     - Demande prise en charge AGEFICE (TNS only)
 *   Pack fin (7 docs/stagiaire) :
 *     - Attestation de fin
 *     - Certificat de réalisation
 *     - QCM final
 *     - Évaluation acquis (positionnement)
 *     - Satisfaction à chaud
 *     - Satisfaction à froid
 *     - Émargement
 *     - Attestation d'assiduité AGEFICE (TNS only)
 */

import type { ParticipantCardData } from '@/components/sessions/participant-docs-cards';

interface Participant {
  id: string;
  personId: string;
  fullName: string;
  sponsorOrgLabel: string;
  sponsorOrgOpcoCode?: string | null;
  financingMode?: string | null;
  isAgefice: boolean;
}

interface BuildInput {
  participants: Participant[];
  docsByParticipant: Map<string, Map<string, string>>;
  assetsByParticipant: Map<string, Map<string, string>>;
  analyseBesoinInflight: number;
}

export function buildParticipantCards(input: BuildInput): ParticipantCardData[] {
  return input.participants.map((p) => {
    const docs = input.docsByParticipant.get(p.id);
    const assets = input.assetsByParticipant.get(p.id);

    const funderCode = (p.financingMode ?? p.sponsorOrgOpcoCode ?? null) as string | null;

    return {
      participantId: p.id,
      personId: p.personId,
      fullName: p.fullName,
      sponsorOrgLabel: p.sponsorOrgLabel,
      funderCode,
      isAgefice: p.isAgefice,
      preDocs: [
        {
          key: 'convention',
          label: 'Convention',
          indic: 'Ind 6·8',
          pdfId: docs?.get('CONVENTION'),
          resourceKind: 'document',
          dispatchType: 'CONVENTION',
        },
        {
          key: 'convocation',
          label: 'Convocation',
          indic: 'Ind 9',
          pdfId: docs?.get('CONVOCATION'),
          resourceKind: 'document',
          dispatchType: 'CONVOCATION',
        },
        {
          key: 'analyse-besoin',
          label: 'Analyse besoin',
          indic: 'Ind 11',
          pdfId: assets?.get('ANALYSE_BESOIN'),
          resourceKind: 'asset',
          dispatchType: 'ANALYSE_BESOIN',
          pending: !assets?.get('ANALYSE_BESOIN') && input.analyseBesoinInflight > 0,
        },
        {
          key: 'agefice',
          label: 'Demande AGEFICE',
          indic: 'Ind 27',
          pdfId: docs?.get('AGEFICE'),
          resourceKind: 'document',
          dispatchType: 'AGEFICE',
          notApplicable: !p.isAgefice,
        },
      ],
      postDocs: [
        {
          key: 'attestation',
          label: 'Attestation fin',
          indic: 'Ind 27',
          pdfId: docs?.get('ATTESTATION_FIN'),
          resourceKind: 'document',
        },
        {
          key: 'certificat',
          label: 'Certificat',
          indic: 'Ind 27',
          pdfId: docs?.get('CERTIFICAT_REALISATION'),
          resourceKind: 'document',
        },
        {
          key: 'qcm',
          label: 'QCM final',
          indic: 'Ind 11',
          pdfId: assets?.get('QCM'),
          resourceKind: 'asset',
        },
        {
          key: 'positionnement',
          label: 'Évaluation acquis',
          indic: 'Ind 11',
          pdfId: assets?.get('POSITIONNEMENT'),
          resourceKind: 'asset',
        },
        {
          key: 'sat-chaud',
          label: 'Satisfaction chaud',
          indic: 'Ind 30',
          pdfId: assets?.get('SATISFACTION_CHAUD'),
          resourceKind: 'asset',
        },
        {
          key: 'sat-froid',
          label: 'Satisfaction froid',
          indic: 'Ind 30',
          pdfId: assets?.get('SATISFACTION_FROID'),
          resourceKind: 'asset',
        },
        {
          key: 'emargement',
          label: 'Émargement',
          indic: 'Ind 12',
          pdfId: assets?.get('EMARGEMENT'),
          resourceKind: 'asset',
        },
        {
          key: 'assiduite',
          label: 'Assiduité AGEFICE',
          indic: 'AGEFICE',
          pdfId: docs?.get('ASSIDUITE'),
          resourceKind: 'document',
          dispatchType: 'ASSIDUITE_AGEFICE',
          notApplicable: !p.isAgefice,
        },
      ],
    };
  });
}
