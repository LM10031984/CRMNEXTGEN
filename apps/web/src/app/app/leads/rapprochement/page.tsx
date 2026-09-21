import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { validateRequest } from '@/lib/auth';
import { MlsEnrichmentForm } from '@/components/leads/mls-enrichment-form';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export default async function MlsEnrichmentPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') notFound();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/app/leads" className="text-sm text-primary underline">
        Retour aux leads
      </Link>
      <h1 className="text-2xl font-semibold">
        Rapprocher les fiches existantes avec le fichier MLS
      </h1>
      <MlsEnrichmentForm />
      <Link
        className="block text-sm text-primary underline"
        href={'/app/leads/doublons-mls' as any}
      >
        Vérifier les doublons liés aux mobiles Excel
      </Link>
    </div>
  );
}
