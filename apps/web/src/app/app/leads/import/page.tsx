import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { validateRequest } from '@/lib/auth';
import { MlsImportForm } from '@/components/leads/mls-import-form';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export default async function MlsImportPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') notFound();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/app/leads" className="text-sm text-primary underline">
        Retour aux leads
      </Link>
      <h1 className="text-2xl font-semibold">Importer les contacts MLS Côte d’Azur</h1>
      <MlsImportForm />
    </div>
  );
}
