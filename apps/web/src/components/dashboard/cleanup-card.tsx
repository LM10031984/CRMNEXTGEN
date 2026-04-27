import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export function CleanupCard({ nbPersons, nbOrgs }: { nbPersons: number; nbOrgs: number }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
      <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 inline-flex items-center justify-center shrink-0">
        <AlertTriangle className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-amber-900">Données à corriger après import SmartOF</h3>
        <p className="text-sm text-amber-800 mt-1">
          {nbPersons} apprenants sans email et {nbOrgs} organisations avec un SIRET malformé ont été
          importés. Pour générer des conventions valides, ces fiches doivent être complétées.
        </p>
        <div className="flex gap-3 mt-3">
          {nbPersons > 0 && (
            <Link
              href="/app/apprenants?filter=cleanup"
              className="text-sm font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
            >
              Corriger les apprenants →
            </Link>
          )}
          {nbOrgs > 0 && (
            <Link
              href="/app/organisations?filter=cleanup"
              className="text-sm font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
            >
              Corriger les organisations →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
