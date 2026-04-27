import { Settings, Building2, Users, Sparkles } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';

export default async function ParametresPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  const usersCount = await prisma.user.count({ where: { tenantId: user.tenantId } });
  const opcos = await prisma.opcoCatalog.findMany({ orderBy: { name: 'asc' } });
  const docCatalog = await prisma.qualiopiDocCatalog.findMany({ orderBy: { phase: 'asc' } });

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Paramètres"
        subtitle="Configuration de votre organisme de formation"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Organisme
          </h2>
          <dl className="space-y-3 text-sm">
            <Field label="Nom" value={tenant?.name ?? '—'} />
            <Field label="SIRET" value={tenant?.siret ?? <span className="text-muted-foreground italic">à renseigner</span>} />
            <Field label="N° Déclaration d'activité" value={tenant?.numDA ?? <span className="text-muted-foreground italic">à renseigner</span>} />
            <Field label="RCS" value={tenant?.rcs ?? <span className="text-muted-foreground italic">à renseigner</span>} />
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            💡 Édition de ces champs disponible au palier 2.2.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Utilisateurs ({usersCount})
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Gestion des accès et des rôles (ADMIN, MANAGER, FORMATEUR, COMMERCIAL, COMPTABLE, LECTEUR).
          </p>
          <Badge variant="muted">Disponible palier 2.2</Badge>
        </section>

        <section className="rounded-2xl border border-border bg-white p-6 lg:col-span-2">
          <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> OPCO référencés ({opcos.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {opcos.map((o) => (
              <div
                key={o.id}
                className="rounded-lg border border-border p-3 text-sm flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {o.type} {o.averageDelayDays ? `· délai ${o.averageDelayDays}j` : ''}
                    {o.yearlyCapPerPerson ? ` · plafond ${Number(o.yearlyCapPerPerson).toFixed(0)}€/an` : ''}
                  </div>
                </div>
                <Badge variant="success">{o.status}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-6 lg:col-span-2">
          <h2 className="font-semibold mb-4 inline-flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" /> Référentiel documents Qualiopi ({docCatalog.length})
          </h2>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-2 py-2">Document</th>
                  <th className="px-2 py-2">Phase</th>
                  <th className="px-2 py-2">Indicateur</th>
                  <th className="px-2 py-2">Obligatoire</th>
                  <th className="px-2 py-2">Délai</th>
                </tr>
              </thead>
              <tbody>
                {docCatalog.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 font-medium">{d.name}</td>
                    <td className="px-2 py-2 text-xs">
                      <Badge variant="muted">{d.phase}</Badge>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {d.qualiopiIndicator ?? '—'}
                    </td>
                    <td className="px-2 py-2">
                      {d.isMandatory ? (
                        <Badge variant="primary">Oui</Badge>
                      ) : (
                        <Badge variant="muted">Non</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {d.recommendedDelay ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
