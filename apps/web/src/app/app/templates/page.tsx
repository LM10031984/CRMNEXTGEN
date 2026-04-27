import { FileText } from 'lucide-react';
import { Placeholder } from '@/components/ui/placeholder';

export default function TemplatesPage() {
  return (
    <Placeholder
      icon={FileText}
      title="Modèles de documents"
      subtitle="Templates DOCX/PDF/MJML pour la génération automatique"
      palier="Palier 3"
      features={[
        '6 templates DOCX Qualiopi : convention, programme, convocation, émargement, attestation, certificat',
        'Mapping AGEFICE 54 champs (PDF officiel pré-rempli)',
        '4 templates email MJML (convocation, relance, fin de formation, notification)',
        'Versioning des templates avec historique',
        'Édition inline avec preview des variables',
      ]}
    />
  );
}
