'use client';
import { useState, useTransition } from 'react';
import { uploadMls } from '@/server/actions/mls-import';
type Result = Awaited<ReturnType<typeof uploadMls>>;
export function MlsImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  function run(commit = false) {
    if (!file) return;
    const data = new FormData();
    data.set('file', file);
    if (commit && result?.ok) data.set('digest', result.report.digest);
    start(async () => {
      try {
        const r = await uploadMls(data);
        setResult(r);
        if (commit && r.ok) setDone(true);
      } catch {
        setResult({
          ok: false,
          error: 'Connexion interrompue. Refaites une prévisualisation avant de reprendre.',
        });
      }
    });
  }
  return (
    <div className="space-y-5">
      <p className="text-sm">
        Les doublons certains sont regroupés. Les coordonnées partagées et les rapprochements
        ambigus sont laissés à vérifier. Les fiches existantes sont conservées. Aucun email, SMS ou
        appel n’est déclenché.
      </p>
      <label className="block space-y-2 text-sm">
        <span>Fichier MLS (XLSX, 5 Mo maximum)</span>
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
        disabled={!file || pending}
        onClick={() => run()}
        className="rounded-md border px-4 py-2 disabled:opacity-50"
      >
        {pending ? 'Traitement…' : 'Prévisualiser l’import'}
      </button>
      {result && !result.ok && (
        <p role="alert" className="text-red-700">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <section className="space-y-4 rounded-xl border p-5">
          <h2 className="font-semibold">{done ? 'Import terminé' : 'Contrôle avant import'}</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries({
              'Lignes lues': result.report.rowsRead,
              'Répétitions regroupées': result.report.duplicates,
              'Lignes invalides ou divergentes': result.report.invalidRows,
              'Lignes sans email ni téléphone': result.report.withoutChannels,
              'Fiches déjà présentes ou à vérifier': result.report.ignored.length,
              'Agences à créer': result.report.agenciesToCreate,
              [done ? 'Leads créés' : 'Leads à créer']: done
                ? result.report.created
                : result.report.leadsToCreate,
            }).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">
            Les villes sont conservées. Les adresses et les dates de premier appel restent à
            compléter.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="text-left font-medium mb-2">
                Aperçu des 10 premières fiches
              </caption>
              <thead>
                <tr>
                  <th className="text-left">Contact</th>
                  <th className="text-left">Agence</th>
                  <th className="text-left">Fonction</th>
                </tr>
              </thead>
              <tbody>
                {result.report.preview.map((r) => (
                  <tr key={r.key}>
                    <td>
                      {r.firstName} {r.lastName}
                    </td>
                    <td>{r.agency}</td>
                    <td>{r.jobTitle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">
              Lignes à vérifier et doublons existants
            </summary>
            <ul className="mt-3 max-h-72 overflow-auto text-xs space-y-1">
              {[...result.report.issues, ...result.report.ignored].map((r, i) => (
                <li key={i}>
                  {r.refs.map((r) => `${r.sheet} : ligne ${r.row}`).join(', ')} — {r.reason}
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
              a.download = 'rapport-import-mls.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Télécharger le rapport d’import
          </button>
          {!done && (
            <button
              onClick={() => run(true)}
              disabled={pending || !result.report.leadsToCreate}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              Importer les {result.report.leadsToCreate} leads validés
            </button>
          )}
        </section>
      )}
    </div>
  );
}
