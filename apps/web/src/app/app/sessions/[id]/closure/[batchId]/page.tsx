import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { ClosureBatchProgress } from '@/components/sessions/closure-batch-progress';

export default async function ClosureBatchPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id: sessionId, batchId } = await params;

  const batch = await prisma.closureBatch.findFirst({
    where: { id: batchId, tenantId: user.tenantId, sessionId },
  });
  if (!batch) notFound();

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: { id: true, code: true, name: true, product: { select: { title: true } } },
  });
  if (!session) notFound();

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href={`/app/sessions/${sessionId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour à la session {session.code}
      </Link>

      <PageHeader
        title="Pack fin de formation"
        subtitle={
          <span className="text-sm text-muted-foreground">
            {session.product?.title ?? session.name ?? '(formation)'} — batch{' '}
            <code className="font-mono text-xs">{batchId.slice(0, 8)}</code>
          </span>
        }
      />

      <ClosureBatchProgress batchId={batchId} sessionId={sessionId} />
    </div>
  );
}
