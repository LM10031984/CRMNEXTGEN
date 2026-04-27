import { Receipt } from 'lucide-react';
import { Placeholder } from '@/components/ui/placeholder';

export default function FacturesPage() {
  return (
    <Placeholder
      icon={Receipt}
      title="Factures"
      subtitle="Numérotation continue et suivi des encaissements"
      palier="Lot 2 (post-MVP)"
      features={[
        'Numérotation continue conforme code de commerce français (FAC-NNNNNN)',
        'Génération PDF + envoi automatique par mail',
        'Avoirs (CreditNote)',
        'Multi-modes de paiement (virement, prélèvement, CB, chèque)',
        'Export FEC pour comptable',
        'Vue impayés et relances automatiques',
      ]}
    />
  );
}
