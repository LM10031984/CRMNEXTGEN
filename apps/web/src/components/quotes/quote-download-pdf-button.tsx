'use client';

/**
 * Bouton "Télécharger PDF" : ouvre `/api/quotes/[id]/pdf` dans un nouvel onglet.
 * La génération est faite à la demande côté route handler (Gotenberg).
 */

import { Download } from 'lucide-react';

interface Props {
  quoteId: string;
  number: string;
}

export function QuoteDownloadPdfButton({ quoteId, number }: Props) {
  return (
    <a
      href={`/api/quotes/${quoteId}/pdf`}
      target="_blank"
      rel="noopener noreferrer"
      download={`${number}.pdf`}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-primary bg-white text-primary text-sm font-medium hover:bg-primary/5"
    >
      <Download className="h-4 w-4" />
      Télécharger PDF
    </a>
  );
}
