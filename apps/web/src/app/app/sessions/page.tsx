import { Calendar } from 'lucide-react';
import { Placeholder } from '@/components/ui/placeholder';

export default function SessionsPage() {
  return (
    <Placeholder
      icon={Calendar}
      title="Sessions de formation"
      subtitle="Planning et inscriptions"
      palier="Palier 2.3"
      features={[
        'Création de session via wizard 4 étapes (produit → dates/lieu → apprenants → récap)',
        'Inscription apprenants avec PersonOrOrgPicker (cas EI Pascal BIANCO)',
        'Génération automatique des SessionSlot selon les dates et la durée',
        'Filtres par statut, dates, formateur',
        'Calcul du CA prévisionnel et du taux de remplissage',
      ]}
    />
  );
}
