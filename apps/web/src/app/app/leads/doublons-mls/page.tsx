import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { listMlsDuplicates } from '@/lib/leads/mls-duplicates-service';
import { MlsDuplicateCard } from '@/components/leads/mls-duplicates-form';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export default async function MlsDuplicatesPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') notFound();
  const previews = await listMlsDuplicates(user.tenantId);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link className="text-sm underline" href="/app/leads">
        Retour aux leads
      </Link>
      <h1 className="text-2xl font-semibold">Vérifier les doublons MLS</h1>
      <p>
        Ce contrôle traite les mobiles français dont Excel a supprimé le zéro initial. Il propose
        uniquement les paires sans suivi commercial, avec identité concordante, un réseau générique
        et une agence précise. Chaque fusion exige une confirmation individuelle.
      </p>
      <p role="status">{previews.length} paire(s) à vérifier</p>
      {previews.map((p) => (
        <MlsDuplicateCard key={p.remove.id} preview={p} />
      ))}
      {!previews.length && (
        <p>
          Aucun doublon ne remplit ces critères. Les fiches avec activité ou informations
          divergentes restent à examiner séparément.
        </p>
      )}
    </div>
  );
}
