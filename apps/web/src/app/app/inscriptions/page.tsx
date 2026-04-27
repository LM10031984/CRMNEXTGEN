import { ListChecks } from 'lucide-react';
import { Placeholder } from '@/components/ui/placeholder';

export default function InscriptionsPage() {
  return (
    <Placeholder
      icon={ListChecks}
      title="Inscriptions"
      subtitle="Suivi pédagogique et OPCO par inscription"
      palier="Palier 3"
      features={[
        'Vue tableau des 250 inscriptions avec checklist Qualiopi (14 statuts par inscription)',
        'Workflow OPCO : pré-accord → validé → remboursement reçu',
        'Workflow facturation : facture envoyée → paiement reçu',
        'Filtres par statut OPCO, statut paiement, dossiers à relancer',
        'Génération en 1 clic du pack docs fin-de-formation par apprenant',
      ]}
    />
  );
}
