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
  };
}) {
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
        });
      }}
    />
  );
}
