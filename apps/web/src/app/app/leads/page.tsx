import { Megaphone } from 'lucide-react';
import { Placeholder } from '@/components/ui/placeholder';

export default function LeadsPage() {
  return (
    <Placeholder
      icon={Megaphone}
      title="Leads"
      subtitle="Pipeline commercial Kanban"
      palier="Palier 4 / Lot 2"
      features={[
        'Pipeline Kanban (Nouveau → Contacté → Qualifié → Proposition → Négo → Gagné/Perdu)',
        'Sources : formulaire, salon, recommandation, LinkedIn',
        'Affectation à un commercial + relances programmées',
        'Conversion lead → SessionParticipant en 1 clic',
        'Statistiques de conversion par source',
      ]}
    />
  );
}
