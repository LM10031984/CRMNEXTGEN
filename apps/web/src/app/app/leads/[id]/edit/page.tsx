import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { EditLeadForm } from '@/components/leads/fiche-forms';

export const dynamic = 'force-dynamic';
export default async function EditLeadPage({ params }: { params: { id: string } }) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (!['ADMIN', 'MANAGER', 'COMMERCIAL'].includes(user.role)) notFound();
  const [lead, organizations, owners] = await Promise.all([
    prisma.lead.findFirst({ where: { id: params.id, tenantId: user.tenantId } }),
    prisma.organization.findMany({
      where: { tenantId: user.tenantId, archived: false },
      select: { id: true, legalName: true, address: true },
      orderBy: { legalName: 'asc' },
    }),
    prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        disabledAt: null,
        role: { in: ['ADMIN', 'MANAGER', 'COMMERCIAL'] },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    }),
  ]);
  if (!lead) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link className="text-sm text-primary underline" href={`/app/leads/${lead.id}` as any}>
        Retour à la fiche
      </Link>
      <h1 className="text-2xl font-semibold">Modifier la fiche</h1>
      <EditLeadForm
        lead={{
          id: lead.id,
          updatedAt: lead.updatedAt.toISOString(),
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          jobTitle: lead.jobTitle,
          city: lead.city,
          organizationId: lead.organizationId,
          ownerUserId: lead.ownerUserId,
          priority: lead.priority,
          notes: lead.notes,
          personId: lead.personId,
          status: lead.status,
          nextAction: lead.nextAction,
          nextActionAt: lead.nextActionAt?.toISOString() ?? null,
          lossReason: lead.lossReason,
        }}
        organizations={organizations.map((o) => ({
          id: o.id,
          label: [
            o.legalName,
            ...['street', 'postalCode', 'city'].map(
              (k) => (o.address as Record<string, string> | null)?.[k],
            ),
          ]
            .filter(Boolean)
            .join(' · '),
        }))}
        owners={owners.map((o) => ({ id: o.id, label: `${o.firstName} ${o.lastName}` }))}
      />
    </div>
  );
}
