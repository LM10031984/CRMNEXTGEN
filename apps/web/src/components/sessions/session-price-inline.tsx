'use client';

/**
 * Édition inline du tarif HT par stagiaire.
 *
 * Champ DÉRIVANT — édite ce tarif change le CA prévu de l'étape Facturation
 * (step 5 timeline) calculé côté serveur (caTotalHT = price × N). Sans
 * router.refresh(), la valeur reste figée jusqu'au prochain nav. Garde-fou
 * Laurent ui-e2 : "la discipline source unique vaut aussi à l'écriture".
 */

import { useRouter } from 'next/navigation';
import { Euro } from 'lucide-react';
import { SessionPricePerLearnerSchema } from '@qualiof/shared/schemas';
import { updateSessionDetails } from '@/server/actions/sessions';
import { EditableField } from './editable-field';

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

interface Props {
  sessionId: string;
  value: number | null;
  disabled?: boolean;
}

export function SessionPriceInline({ sessionId, value, disabled }: Props) {
  const router = useRouter();

  return (
    <EditableField<number | null>
      value={value}
      schema={SessionPricePerLearnerSchema}
      parse={(raw) => {
        const trimmed = raw.trim().replace(',', '.');
        if (trimmed === '') return null;
        const n = Number(trimmed);
        if (!Number.isFinite(n)) {
          throw new Error('Tarif invalide — saisir un nombre');
        }
        return n;
      }}
      serialize={(v) => (v === null ? '' : String(v))}
      onSave={async (pricePerLearner) => {
        const r = await updateSessionDetails({ sessionId, pricePerLearner });
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      onSaved={() => router.refresh()}
      ariaLabel="Modifier le tarif HT par stagiaire"
      prefix={<Euro className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
      display={value === null ? null : `${fmtEUR.format(value)} / stagiaire`}
      emptyLabel="Tarif à saisir"
      inputType="number"
      inputClassName="w-24 text-right"
      // A3 — suffix retiré : display contient déjà "X € / stagiaire" via
      // Intl.NumberFormat currency, donc le suffix dupliquait visuellement
      // ("3 024 € / stagiaire € / stagiaire"). L'aria-label + le contexte
      // sticky-header tarif suffisent à conserver l'intention en édition.
      disabled={disabled}
    />
  );
}
