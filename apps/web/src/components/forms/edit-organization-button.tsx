'use client';

import { EditModal } from './edit-modal';
import { updateOrganization } from '@/server/actions/crud-edits';

// Auto-entrepreneur = EI au régime micro (depuis 2016), une seule option
// "Auto-entrepreneur" qui couvre les 2. En base on stocke AUTO_ENTREPRENEUR
// pour cohérence avec la majorité des Org existantes (EI 216 + AE 27 → 243).
const LEGAL_FORM_OPTIONS = [
  { value: 'AUTO_ENTREPRENEUR', label: 'Auto-entrepreneur (EI / Micro-entreprise)' },
  { value: 'EIRL', label: 'EIRL' },
  { value: 'SARL', label: 'SARL' },
  { value: 'SAS', label: 'SAS' },
  { value: 'SASU', label: 'SASU' },
  { value: 'EURL', label: 'EURL' },
  { value: 'SA', label: 'SA' },
  { value: 'ASSOCIATION', label: 'Association' },
  { value: 'AUTRE', label: 'Autre' },
];

const OPCO_OPTIONS = [
  { value: 'AGEFICE', label: 'AGEFICE' },
  { value: 'OPCO_EP', label: 'OPCO_EP' },
  { value: 'ATLAS', label: 'ATLAS' },
  { value: 'CPF', label: 'CPF' },
  { value: 'FI-FPL', label: 'FI-FPL' },
  { value: 'OPCOMMERCE', label: 'OPCOMMERCE' },
];

export function EditOrganizationButton({
  organizationId,
  current,
}: {
  organizationId: string;
  current: {
    legalName: string;
    legalForm: string;
    siren?: string | null;
    siret?: string | null;
    naf?: string | null;
    vatNumber?: string | null;
    email?: string | null;
    phone?: string | null;
    opcoCode?: string | null;
    network?: string | null;
    activityDescription?: string | null;
  };
}) {
  return (
    <EditModal
      buttonLabel="Éditer la fiche"
      title="Éditer l'organisation"
      fields={[
        { name: 'legalName', label: 'Raison sociale', defaultValue: current.legalName, required: true },
        {
          name: 'legalForm',
          label: 'Forme juridique',
          type: 'select',
          options: LEGAL_FORM_OPTIONS,
          defaultValue: current.legalForm,
        },
        { name: 'siret', label: 'SIRET', defaultValue: current.siret, placeholder: '14 chiffres' },
        { name: 'siren', label: 'SIREN', defaultValue: current.siren, placeholder: '9 chiffres' },
        { name: 'naf', label: 'Code NAF / APE', defaultValue: current.naf, placeholder: 'ex: 4619 B' },
        { name: 'vatNumber', label: 'N° TVA intracom', defaultValue: current.vatNumber },
        { name: 'email', label: 'Email', defaultValue: current.email },
        { name: 'phone', label: 'Téléphone', defaultValue: current.phone },
        {
          name: 'opcoCode',
          label: 'OPCO de rattachement',
          type: 'select',
          options: OPCO_OPTIONS,
          defaultValue: current.opcoCode,
        },
        { name: 'network', label: 'Enseigne / réseau', defaultValue: current.network, placeholder: 'Century 21, Orpi, Magrey…' },
        {
          name: 'activityDescription',
          label: 'Activité',
          type: 'textarea',
          rows: 2,
          defaultValue: current.activityDescription,
        },
      ]}
      onSubmit={async (values) => {
        return updateOrganization({
          organizationId,
          legalName: values.legalName as string,
          legalForm: values.legalForm as string,
          siren: values.siren as string | null,
          siret: values.siret as string | null,
          naf: values.naf as string | null,
          vatNumber: values.vatNumber as string | null,
          email: values.email as string | null,
          phone: values.phone as string | null,
          opcoCode: values.opcoCode as string | null,
          network: values.network as string | null,
          activityDescription: values.activityDescription as string | null,
        });
      }}
    />
  );
}
