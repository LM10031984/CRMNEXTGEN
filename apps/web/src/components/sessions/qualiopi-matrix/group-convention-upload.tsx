'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { uploadGroupConvention } from '@/server/actions/upload-group-convention';

export type ConventionCompany = { id: string; name: string; learners: string[] };
export function GroupConventionUpload({
  sessionId,
  companies,
}: {
  sessionId: string;
  companies: ConventionCompany[];
}) {
  const [companyId, setCompanyId] = useState(companies.length === 1 ? companies[0]!.id : '');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const company = companies.find((c) => c.id === companyId);
  return (
    <div className="rounded-md border p-4 space-y-3">
      <p className="font-medium text-sm">Une convention signée commune à l’entreprise</p>
      <p className="text-sm text-muted-foreground">
        Déposez un seul PDF. Il sera rattaché à l’entreprise et couvrira ses salariés dans cette
        session.
      </p>
      <label className="block text-sm">
        Entreprise concernée
        <select
          aria-label="Entreprise concernée"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          disabled={pending}
          className="block rounded border p-2 mt-1 w-full"
        >
          <option value="">Choisir l’entreprise…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.learners.length} salarié(s)
            </option>
          ))}
        </select>
      </label>
      {company && <p className="text-sm">Salariés couverts : {company.learners.join(', ')}.</p>}
      {!companies.length && (
        <p className="text-sm text-amber-700">
          Aucun groupe salarié identifié. Vérifiez le commanditaire et les rattachements des
          apprenants.
        </p>
      )}
      <label className="block text-sm">
        Convention entreprise signée (PDF, 3 Mo maximum)
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          disabled={pending}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block mt-2"
        />
      </label>
      <button
        type="button"
        disabled={!companyId || !file || pending}
        className="rounded bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
        onClick={async () => {
          if (!file) return;
          if (file.size > 3 * 1024 * 1024) {
            toast.error('PDF trop volumineux : 3 Mo maximum.');
            return;
          }
          setPending(true);
          try {
            const data = new FormData();
            data.set('sessionId', sessionId);
            data.set('sponsorOrgId', companyId);
            data.set('file', file);
            const result = await uploadGroupConvention(data);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(`Convention commune enregistrée pour ${result.covered} salarié(s)`);
            setFile(null);
            if (inputRef.current) inputRef.current.value = '';
            router.refresh();
          } catch {
            toast.error('Dépôt interrompu. Rechargez la session pour vérifier les pièces.');
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Enregistrement…' : 'Enregistrer la convention commune'}
      </button>
    </div>
  );
}
