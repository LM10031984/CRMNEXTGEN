'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { MlsDuplicatePreview } from '@/lib/leads/mls-duplicates';
import { confirmMlsMerge } from '@/server/actions/mls-duplicates';
export function MlsDuplicateCard({ preview }: { preview: MlsDuplicatePreview }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  async function merge() {
    if (!confirmed || running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    try {
      const r = await confirmMlsMerge({
        keepId: preview.keep.id,
        removeId: preview.remove.id,
        digest: preview.digest,
        confirmed,
      });
      if (r.ok) setDone(true);
      else setError(r.error);
    } catch {
      setError('Connexion interrompue. Rechargez la liste pour vérifier le résultat.');
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return (
    <section className="rounded-xl border p-5 space-y-4">
      <h2 className="font-semibold">{preview.keep.name}</h2>
      {done ? (
        <p role="status">
          Fusion terminée.{' '}
          <Link className="underline" href={`/app/leads/${preview.keep.id}` as any}>
            Ouvrir la fiche conservée
          </Link>
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ['Fiche conservée', preview.keep],
                ['Fiche en double supprimée après confirmation', preview.remove],
              ] as const
            ).map(([title, lead]) => (
              <article className="rounded border p-3 text-sm space-y-1" key={lead.id}>
                <h3 className="font-medium">{title}</h3>
                <p>
                  <Link className="underline" href={`/app/leads/${lead.id}` as any}>
                    {lead.name}
                  </Link>
                </p>
                <p>
                  {lead.agency} · {lead.city || 'Ville non renseignée'}
                </p>
                <p>
                  {lead.email || 'Email non renseigné'} · {lead.phone}
                </p>
                <p>Fonction : {lead.jobTitle || 'Non renseignée'}</p>
                <p>Segments : {lead.segments.join(', ') || 'Aucun'}</p>
                <p>Notes : {lead.notes || 'Aucune'}</p>
                <p>Prochaine action : {lead.nextAction || 'À planifier'}</p>
              </article>
            ))}
          </div>
          <p className="text-sm">
            Même prénom, nom et mobile après restitution du zéro perdu par Excel. Ces deux fiches
            MLS sont nouvelles, sans appel, activité, document, tâche, affectation commerciale ni
            inscription. L’agence précise est conservée. Les notes, segments et références d’import
            sont réunis ; les valeurs d’origine et l’auteur de la fusion sont conservés dans le
            journal d’audit.
          </p>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Je confirme la fusion et la suppression définitive de la fiche en double.
          </label>
          <button
            type="button"
            disabled={!confirmed || pending}
            onClick={merge}
            className="rounded bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50"
          >
            {pending ? 'Fusion en cours…' : 'Fusionner ces deux fiches'}
          </button>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
