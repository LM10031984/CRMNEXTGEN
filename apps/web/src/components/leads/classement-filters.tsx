import Link from 'next/link';
import type { ClassementParams } from '@/lib/leads/classement';

type Option = { value: string; label: string };

export function ClassementFilters({
  params,
  options,
  statuses,
}: {
  params: ClassementParams;
  options: {
    agences: Option[];
    responsables: Option[];
    pointsDeVente: Option[];
    commercials: Option[];
    sources: Option[];
  };
  statuses: Record<string, string>;
}) {
  return (
    <form
      key={JSON.stringify(params)}
      action="/app/leads"
      method="get"
      className="rounded-xl border border-border bg-white p-4 space-y-3"
      aria-label="Filtrer les leads"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Select
          name="agence"
          label="Agence"
          all="Toutes les agences"
          value={params.agence}
          options={options.agences}
        />
        <Select
          name="responsable"
          label="Responsable d’agence"
          all="Tous les responsables"
          value={params.responsable}
          options={options.responsables}
        />
        <Select
          name="pointDeVente"
          label="Point de vente"
          all="Tous les points de vente"
          value={params.pointDeVente}
          options={options.pointsDeVente}
        />
        <Select
          name="commercial"
          label="Commercial chargé du suivi"
          all="Tous les commerciaux"
          value={params.commercial}
          options={options.commercials}
        />
        <label className="space-y-1 text-xs font-medium" htmlFor="leads-q">
          <span className="block">Contact, ville ou adresse</span>
          <input
            id="leads-q"
            type="search"
            name="q"
            defaultValue={params.q}
            className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
            placeholder="Rechercher…"
          />
        </label>
        <Select
          name="source"
          label="Source"
          all="Toutes les sources"
          value={params.source}
          options={options.sources}
        />
        <Select
          name="statut"
          label="Statut"
          all="Tous les statuts"
          value={params.statut}
          options={Object.entries(statuses).map(([value, label]) => ({ value, label }))}
        />
        <Select
          name="travail"
          label="Travail du jour"
          all="Tous les leads"
          value={params.travail}
          options={[
            { value: 'jour', label: 'Appels et relances dus (retards inclus)' },
            { value: 'retard', label: 'Relances en retard' },
            { value: 'planifier', label: 'Prochaine action à planifier' },
          ]}
        />
        <Select
          name="tri"
          label="Trier par"
          value={params.tri ?? 'recent'}
          options={[
            { value: 'agence', label: 'Agence, point de vente, responsable' },
            { value: 'responsable', label: 'Responsable d’agence' },
            { value: 'pointDeVente', label: 'Adresse du point de vente' },
            { value: 'commercial', label: 'Commercial chargé du suivi' },
            { value: 'recent', label: 'Plus récents' },
            { value: 'relance', label: 'Relances les plus anciennes' },
          ]}
        />
      </div>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Appliquer
        </button>
        <Link href="/app/leads" className="text-sm text-muted-foreground hover:underline">
          Réinitialiser
        </Link>
      </div>
    </form>
  );
}

function Select({
  name,
  label,
  all,
  value,
  options,
}: {
  name: string;
  label: string;
  all?: string;
  value?: string;
  options: Option[];
}) {
  return (
    <label className="space-y-1 text-xs font-medium" htmlFor={`leads-${name}`}>
      <span className="block">{label}</span>
      <select
        id={`leads-${name}`}
        name={name}
        defaultValue={value ?? ''}
        className="h-9 w-full min-w-0 rounded-md border border-border bg-white px-2 text-sm"
      >
        {all && <option value="">{all}</option>}
        {value && !options.some((o) => o.value === value) && (
          <option value={value}>Valeur indisponible</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
