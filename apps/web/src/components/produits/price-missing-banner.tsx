'use client';

import { AlertTriangle } from 'lucide-react';
import { EditProductButton } from '@/components/forms/edit-product-button';

/**
 * Banner d'alerte affiché sur la fiche produit quand priceHT === 0.
 * Le bouton "Éditer le produit" réutilise EditProductButton (modal Radix
 * existante) → pas de duplication de logique d'édition.
 *
 * Cas d'usage : 25/30 produits importés SmartOF arrivent à priceHT=0
 * car l'API SmartOF n'expose pas le prix. Sans ce banner, l'opérateur
 * ne s'en rend compte qu'en voyant un PDF programme/convention à 0€
 * (juridiquement invalide et bloquant pour les paiements OPCO/AGEFICE).
 */
export function PriceMissingBanner({
  productId,
  current,
}: {
  productId: string;
  current: React.ComponentProps<typeof EditProductButton>['current'];
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-300 bg-red-50 p-4 flex items-start gap-3"
    >
      <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-900">Prix HT manquant</p>
        <p className="text-sm text-red-800 mt-1">
          Ce produit n'a pas de prix renseigné. La génération de programmes
          et conventions Qualiopi est bloquée tant que le prix HT par
          stagiaire n'est pas défini.
        </p>
      </div>
      <div className="flex-shrink-0">
        <EditProductButton productId={productId} current={current} />
      </div>
    </div>
  );
}
