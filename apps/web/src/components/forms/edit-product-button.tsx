'use client';

import { EditModal } from './edit-modal';
import { updateTrainingProduct } from '@/server/actions/crud-edits';

export function EditProductButton({
  productId,
  current,
}: {
  productId: string;
  current: {
    title: string;
    theme?: string | null;
    durationHours: number;
    priceHT: number;
    prerequisites?: string | null;
    targetAudience?: string | null;
    pedagogicalMethods?: string | null;
    pedagogicalSupport?: string | null;
    evaluationMethods?: string | null;
    trainerProfile?: string | null;
    accessibility?: string | null;
    accessConditions?: string | null;
    // Conformité Cerfa AGEFICE — null = utilise le défaut générateur
    ageficeFormationType?: string | null;
    ageficeNiveau?: string | null;
    ageficeCertif?: string | null;
    ageficeAttestation?: string | null;
    ageficeEvaluations?: string[] | null;
    ageficeObligatoire?: boolean | null;
    ageficeReconversion?: boolean | null;
    ageficeEnEntreprise?: boolean | null;
    ageficeMandat?: boolean | null;
  };
}) {
  const boolToTri = (v: boolean | null | undefined): string =>
    v === true ? 'OUI' : v === false ? 'NON' : '';
  const evaluationsCsv = (current.ageficeEvaluations ?? []).join(', ');
  const triOpts = [
    { value: 'OUI', label: 'Oui' },
    { value: 'NON', label: 'Non' },
  ];
  return (
    <EditModal
      buttonLabel="Éditer le produit"
      title="Éditer le produit de formation"
      fields={[
        { name: 'title', label: 'Intitulé', defaultValue: current.title, required: true },
        { name: 'theme', label: 'Thème', defaultValue: current.theme, placeholder: 'IA, Immobilier, Management…' },
        { name: 'durationHours', label: 'Durée (heures)', type: 'number', defaultValue: current.durationHours, required: true },
        { name: 'priceHT', label: 'Prix HT par stagiaire (€)', type: 'number', defaultValue: current.priceHT },
        {
          name: 'targetAudience',
          label: 'Public visé',
          type: 'textarea',
          rows: 2,
          defaultValue: current.targetAudience,
        },
        { name: 'prerequisites', label: 'Prérequis', defaultValue: current.prerequisites },
        {
          name: 'pedagogicalMethods',
          label: 'Méthodes pédagogiques',
          type: 'textarea',
          rows: 3,
          defaultValue: current.pedagogicalMethods,
        },
        {
          name: 'pedagogicalSupport',
          label: 'Supports pédagogiques (livret, Canva…)',
          type: 'textarea',
          rows: 3,
          defaultValue: current.pedagogicalSupport,
        },
        {
          name: 'evaluationMethods',
          label: "Modalités d'évaluation",
          type: 'textarea',
          rows: 2,
          defaultValue: current.evaluationMethods,
        },
        { name: 'trainerProfile', label: 'Profil du formateur', defaultValue: current.trainerProfile },
        {
          name: 'accessibility',
          label: 'Accessibilité PMR',
          type: 'textarea',
          rows: 2,
          defaultValue: current.accessibility,
        },
        { name: "accessConditions", label: "Conditions d'accès et délais", defaultValue: current.accessConditions },
        // ── Conformité Cerfa AGEFICE (Section C/D) ────────────────────────
        {
          name: 'ageficeFormationType',
          label: 'AGEFICE · Type de formation',
          type: 'select',
          defaultValue: current.ageficeFormationType,
          options: [
            { value: 'ACTION', label: 'Action de formation' },
            { value: 'BILAN', label: 'Bilan de compétences' },
            { value: 'VAE', label: 'VAE' },
          ],
        },
        {
          name: 'ageficeNiveau',
          label: 'AGEFICE · Niveau',
          type: 'select',
          defaultValue: current.ageficeNiveau,
          options: [
            { value: 'INITIATION', label: 'Initiation' },
            { value: 'MISE_A_JOUR', label: 'Mise à jour' },
            { value: 'PERFECTIONNEMENT', label: 'Perfectionnement' },
          ],
        },
        {
          name: 'ageficeCertif',
          label: 'AGEFICE · Qualification visée',
          type: 'select',
          defaultValue: current.ageficeCertif,
          options: [
            { value: 'TITRE_HOMOLOGUE', label: 'Titre homologué' },
            { value: 'QUALIF_BRANCHE', label: 'Qualification de branche' },
            { value: 'CQP', label: 'CQP' },
            { value: 'SANS_QUALIFICATION', label: 'Sans qualification' },
          ],
        },
        {
          name: 'ageficeAttestation',
          label: 'AGEFICE · Attestation délivrée',
          type: 'select',
          defaultValue: current.ageficeAttestation,
          options: [
            { value: 'RNCP', label: 'RNCP' },
            { value: 'AUTRE_DIPLOME', label: 'Autre diplôme' },
            { value: 'DIPLOME_ETAT', label: "Diplôme d'État" },
            { value: 'ATTESTATION_STAGE', label: 'Attestation de stage' },
          ],
        },
        {
          name: 'ageficeEvaluations',
          label: 'AGEFICE · Modalités évaluation (CSV)',
          type: 'text',
          defaultValue: evaluationsCsv,
          placeholder: 'QUIZ, FEUILLES_PRESENCE, CONTROLE_CONTINU, RELEVES, AUTRE',
        },
        {
          name: 'ageficeObligatoire',
          label: 'AGEFICE · Formation obligatoire ?',
          type: 'select',
          defaultValue: boolToTri(current.ageficeObligatoire),
          options: triOpts,
        },
        {
          name: 'ageficeReconversion',
          label: 'AGEFICE · Reconversion ?',
          type: 'select',
          defaultValue: boolToTri(current.ageficeReconversion),
          options: triOpts,
        },
        {
          name: 'ageficeEnEntreprise',
          label: 'AGEFICE · Formation en entreprise ?',
          type: 'select',
          defaultValue: boolToTri(current.ageficeEnEntreprise),
          options: triOpts,
        },
        {
          name: 'ageficeMandat',
          label: 'AGEFICE · Mandat de gestion ?',
          type: 'select',
          defaultValue: boolToTri(current.ageficeMandat),
          options: triOpts,
        },
      ]}
      onSubmit={async (values) => {
        return updateTrainingProduct({
          productId,
          title: values.title as string,
          theme: values.theme as string | null,
          durationHours: values.durationHours as number,
          priceHT: values.priceHT as number,
          prerequisites: values.prerequisites as string | null,
          targetAudience: values.targetAudience as string | null,
          pedagogicalMethods: values.pedagogicalMethods as string | null,
          pedagogicalSupport: values.pedagogicalSupport as string | null,
          evaluationMethods: values.evaluationMethods as string | null,
          trainerProfile: values.trainerProfile as string | null,
          accessibility: values.accessibility as string | null,
          accessConditions: values.accessConditions as string | null,
          ageficeFormationType: values.ageficeFormationType as string | null,
          ageficeNiveau: values.ageficeNiveau as string | null,
          ageficeCertif: values.ageficeCertif as string | null,
          ageficeAttestation: values.ageficeAttestation as string | null,
          ageficeEvaluations: values.ageficeEvaluations as string | null,
          ageficeObligatoire: values.ageficeObligatoire as string | null,
          ageficeReconversion: values.ageficeReconversion as string | null,
          ageficeEnEntreprise: values.ageficeEnEntreprise as string | null,
          ageficeMandat: values.ageficeMandat as string | null,
        });
      }}
    />
  );
}
