'use client';

import { EditModal } from './edit-modal';
import { updatePerson } from '@/server/actions/crud-edits';

const BPF_OPTIONS = [
  { value: "F.1.a - Salariés d'employeurs privés hors apprentis", label: 'F.1.a Salariés privés' },
  { value: "F.1.b - Salariés d'employeurs publics", label: 'F.1.b Salariés publics' },
  { value: 'F.2 - Personnes en recherche d’emploi', label: 'F.2 Recherche d’emploi' },
  { value: 'F.3 - Particuliers à leurs propres frais', label: 'F.3 Particuliers' },
  {
    value: 'F.4 - Travailleurs indépendants, professions libérales, professions non salariées et autres',
    label: 'F.4 Travailleurs indépendants',
  },
];

const CIVILITY_OPTIONS = [
  { value: 'Monsieur', label: 'Monsieur' },
  { value: 'Madame', label: 'Madame' },
];

export function EditPersonButton({
  personId,
  current,
}: {
  personId: string;
  current: {
    civility?: string | null;
    firstName: string;
    lastName: string;
    birthName?: string | null;
    birthDate?: Date | null;
    email?: string | null;
    phone?: string | null;
    educationLevel?: string | null;
    diplomas?: string | null;
    professionalExperience?: string | null;
    professionalStatus?: string | null;
    bpfDefaultStatus?: string | null;
  };
}) {
  return (
    <EditModal
      buttonLabel="Éditer la fiche"
      title="Éditer l'apprenant"
      fields={[
        { name: 'civility', label: 'Civilité', type: 'select', options: CIVILITY_OPTIONS, defaultValue: current.civility },
        { name: 'firstName', label: 'Prénom', defaultValue: current.firstName, required: true },
        { name: 'lastName', label: 'Nom', defaultValue: current.lastName, required: true },
        { name: 'birthName', label: 'Nom de naissance', defaultValue: current.birthName },
        {
          name: 'birthDate',
          label: 'Date de naissance',
          type: 'date',
          defaultValue: current.birthDate ? new Date(current.birthDate).toISOString().slice(0, 10) : null,
        },
        { name: 'email', label: 'Email', defaultValue: current.email },
        { name: 'phone', label: 'Téléphone', defaultValue: current.phone },
        { name: 'professionalStatus', label: 'Statut professionnel', defaultValue: current.professionalStatus, placeholder: 'Agent commercial, Auto-entrepreneur, Salarié…' },
        { name: 'professionalExperience', label: 'Expérience pro', defaultValue: current.professionalExperience, placeholder: 'Entre 4 et 10 ans' },
        { name: 'educationLevel', label: 'Niveau d\'étude', defaultValue: current.educationLevel },
        { name: 'diplomas', label: 'Diplômes (texte libre)', defaultValue: current.diplomas },
        {
          name: 'bpfDefaultStatus',
          label: 'Statut BPF (Bilan Pédagogique)',
          type: 'select',
          options: BPF_OPTIONS,
          defaultValue: current.bpfDefaultStatus,
        },
      ]}
      onSubmit={async (values) => {
        return updatePerson({
          personId,
          civility: values.civility as string | null,
          firstName: (values.firstName as string) || current.firstName,
          lastName: (values.lastName as string) || current.lastName,
          birthName: values.birthName as string | null,
          birthDate: values.birthDate as string | null,
          email: values.email as string | null,
          phone: values.phone as string | null,
          educationLevel: values.educationLevel as string | null,
          diplomas: values.diplomas as string | null,
          professionalExperience: values.professionalExperience as string | null,
          professionalStatus: values.professionalStatus as string | null,
          bpfDefaultStatus: values.bpfDefaultStatus as string | null,
        });
      }}
    />
  );
}
