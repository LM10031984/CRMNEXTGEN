'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { uploadMlsEnrichment } from '@/server/actions/mls-import';
type Result = Awaited<ReturnType<typeof uploadMlsEnrichment>>;
const labels: Record<string, string> = {
  jobTitle: 'Fonction',
  city: 'Ville / secteur',
  segments: 'Segments MLS',
  brandName: 'Enseigne',
  crmManagers: 'Responsables d’agence',
};
const display = (v: unknown) =>
  Array.isArray(v) ? v.join(', ') || 'Non renseigné' : String(v || 'Non renseigné');
export function MlsEnrichmentForm() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const running = useRef(false);
  async function run(commit = false) {
    if (!file || running.current) return;
    running.current = true;
    setPending(true);
    const form = new FormData();
    form.set('file', file);
    if (commit && result?.ok) form.set('digest', result.report.digest);
    try {
      const r = await uploadMlsEnrichment(form);
      setResult(r);
      if (commit && r.ok) setDone(true);
    } catch {
      setResult({
        ok: false,
        error: 'Connexion interrompue. Relancez la prévisualisation avant de reprendre.',
      });
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm">
        Rattachez les fiches existantes par e-mail ou mobile, après vérification du prénom et du
        nom. Les changements proposés complètent l’agence, la fonction, le secteur, les segments et
        les responsables d’agence. Les noms, coordonnées, notes, statuts et appels sont conservés.
      </p>
      <label className="block space-y-2 text-sm">
        <span>Fichier MLS à rapprocher (XLSX, 5 Mo maximum)</span>
        <input
          type="file"
          accept=".xlsx"
          disabled={pending}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setDone(false);
          }}
          className="block"
        />
      </label>
      <button
        type="button"
        disabled={pending || !file}
        onClick={() => run()}
        className="rounded border px-4 py-2 disabled:opacity-50"
      >
        {pending ? 'Traitement…' : 'Prévisualiser le rapprochement'}
      </button>
      {result && !result.ok && (
        <p role="alert" className="text-red-700">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <section className="space-y-4 rounded-xl border p-4">
          <h2 className="font-semibold">
            {done ? 'Rapprochement terminé' : 'Modifications proposées'}
          </h2>
          <p role="status">
            {result.report.matched} correspondances certaines ·{' '}
            {done ? result.report.updated : result.report.leadsToUpdate} fiches{' '}
            {done ? 'complétées' : 'à compléter'} · {result.report.agenciesToUpdate} agences{' '}
            {done ? 'enrichies' : 'à enrichir'} · {result.report.agenciesToCreate} agences{' '}
            {done ? 'créées' : 'à créer'}
          </p>
          {!result.report.leadsToUpdate && !result.report.agenciesToUpdate && (
            <p>Aucune modification nécessaire parmi les correspondances certaines.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Une ville seule ne constitue pas une adresse de point de vente. Aucun nouveau contact ni
            aucun courriel n’est créé par ce rapprochement.
          </p>
          <div className="max-h-[32rem] overflow-auto space-y-3">
            {result.report.updates.map((change) => (
              <article key={change.id} className="border-b pb-3 text-sm">
                <Link
                  className="font-medium text-primary underline"
                  href={`/app/leads/${change.id}` as any}
                >
                  {change.name}
                </Link>
                {(change.newAgencyKey || change.after.organizationId) && (
                  <p>Agence à rattacher → {change.agency}</p>
                )}
                {Object.entries(change.after)
                  .filter(([key]) => key !== 'organizationId')
                  .map(([key, value]) => (
                    <p key={key}>
                      {labels[key]} : {display(change.before[key as keyof typeof change.before])} →{' '}
                      {display(value)}
                    </p>
                  ))}
              </article>
            ))}
            {result.report.newAgencies.map((agency) => (
              <article key={agency.key} className="border-b pb-3 text-sm">
                <p className="font-medium">Nouvelle agence : {agency.legalName}</p>
                <p>
                  Secteur : {agency.city || 'Non renseigné'} · Responsables :{' '}
                  {display(agency.crmManagers)}
                </p>
              </article>
            ))}
            {result.report.organizations.map((change) => (
              <article key={change.id} className="border-b pb-3 text-sm">
                <p className="font-medium">{change.name}</p>
                {Object.entries(change.after).map(([key, value]) => (
                  <p key={key}>
                    {labels[key]} : {display(change.before[key as keyof typeof change.before])} →{' '}
                    {display(value)}
                  </p>
                ))}
              </article>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer">
              {result.report.ignored.length} fiches à vérifier
            </summary>
            <ul className="mt-2 max-h-64 overflow-auto text-sm space-y-2">
              {result.report.ignored.map((row) => (
                <li key={row.id}>
                  {row.name} — {row.reason}
                </li>
              ))}
            </ul>
          </details>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'rapport-rapprochement-mls.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Télécharger le rapport avant / après
          </button>
          {!done && result.report.leadsToUpdate + result.report.agenciesToUpdate > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(true)}
              className="ml-4 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              Appliquer les modifications prévisualisées
            </button>
          )}
          {done && (
            <p>
              <Link className="text-primary underline" href="/app/leads">
                Voir les fiches dans le CRM
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
