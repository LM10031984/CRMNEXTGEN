import Link from 'next/link';
import { Mail, Phone, MapPin, Briefcase } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { CreateTrainerButton } from '@/components/forms/create-trainer-button';

export default async function FormateursPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  // Formateurs = Persons qui ont une ExternalIdentity entityType=Person.Trainer (depuis l'import)
  // OU au moins un LegalLink role=FORMATEUR.
  const trainers = await prisma.person.findMany({
    where: {
      tenantId: user.tenantId,
      archived: false,
      OR: [
        { legalLinks: { some: { role: 'FORMATEUR' } } },
        // ExternalIdentity Person.Trainer (créé par l'import des formateurs SmartOF)
        // On les recoupe via une requête séparée ci-dessous si besoin
      ],
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      legalLinks: {
        where: { role: 'FORMATEUR' },
        include: { organization: { select: { id: true, legalName: true, siret: true } } },
      },
    },
  });

  // Complète avec ceux marqués Person.Trainer dans ExternalIdentity (formateurs sans SIRET)
  const externalTrainers = await prisma.externalIdentity.findMany({
    where: { tenantId: user.tenantId, entityType: 'Person.Trainer' },
    select: { entityId: true },
  });
  const externalIds = new Set(externalTrainers.map((e) => e.entityId));
  const additionalIds = [...externalIds].filter((id) => !trainers.find((t) => t.id === id));

  const additional = additionalIds.length
    ? await prisma.person.findMany({
        where: { id: { in: additionalIds }, tenantId: user.tenantId, archived: false },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          legalLinks: {
            where: { role: 'FORMATEUR' },
            include: { organization: { select: { id: true, legalName: true, siret: true } } },
          },
        },
      })
    : [];

  const allTrainers = [...trainers, ...additional];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formateurs"
        subtitle={`${allTrainers.length} formateur${allTrainers.length > 1 ? 's' : ''} (interne ou sous-traitant)`}
        actions={<CreateTrainerButton variant="primary" />}
      />

      {allTrainers.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-12 text-center text-sm text-muted-foreground">
          Aucun formateur. L'import SmartOF en a importé 5 — vérifie que le seed est passé.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allTrainers.map((t) => {
            const subOrg = t.legalLinks[0]?.organization;
            const address = (t.personalAddress ?? null) as null | { city?: string; postalCode?: string };
            return (
              <Link
                key={t.id}
                href={`/app/formateurs/${t.id}`}
                className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold text-sm shrink-0">
                    {t.firstName.charAt(0)}{t.lastName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {t.firstName} {t.lastName.toUpperCase()}
                    </div>
                    <div className="text-xs text-muted-foreground">{t.civility ?? ''}</div>
                  </div>
                  {subOrg && <Badge variant="muted">Sous-trait.</Badge>}
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {t.email && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{t.email}</span>
                    </div>
                  )}
                  {t.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" /> {t.phone}
                    </div>
                  )}
                  {address?.city && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" /> {address.postalCode} {address.city}
                    </div>
                  )}
                  {subOrg && (
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-border mt-2 truncate">
                      <Briefcase className="h-3 w-3 shrink-0" />
                      <span className="truncate">{subOrg.legalName}</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
