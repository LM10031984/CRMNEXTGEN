import Link from 'next/link';
import { Landmark, Building2, Users, Clock, Wallet, FileCheck, ArrowRight } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { formatFunderCode } from '@/lib/funder-codes';

export const dynamic = 'force-dynamic';

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const fmtNb = new Intl.NumberFormat('fr-FR');

export default async function FinanceursPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const opcos = await prisma.opcoCatalog.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { code: 'asc' },
  });

  const stats = await Promise.all(
    opcos.map(async (opco) => {
      const orgFilter = {
        tenantId: user.tenantId,
        archived: false,
        opcoCode: opco.code,
      };

      const [orgsCount, ageficeProfilesCount, partAgg, sessionsCount, invoicedAgg, paidAgg] =
        await Promise.all([
          prisma.organization.count({ where: orgFilter }),
          opco.code === 'AGEFICE'
            ? prisma.ageficeProfile.count({
                where: { organization: orgFilter },
              })
            : Promise.resolve(0),
          prisma.sessionParticipant.aggregate({
            where: {
              session: { tenantId: user.tenantId },
              sponsorOrg: { opcoCode: opco.code },
            },
            _count: { id: true },
            _sum: { priceHT: true, amountCollected: true },
          }),
          prisma.sessionParticipant.findMany({
            where: {
              session: { tenantId: user.tenantId },
              sponsorOrg: { opcoCode: opco.code },
            },
            select: { sessionId: true },
            distinct: ['sessionId'],
          }),
          prisma.invoice.aggregate({
            where: {
              tenantId: user.tenantId,
              participant: { sponsorOrg: { opcoCode: opco.code } },
            },
            _sum: { amountTTC: true },
          }),
          prisma.invoice.aggregate({
            where: {
              tenantId: user.tenantId,
              participant: { sponsorOrg: { opcoCode: opco.code } },
            },
            _sum: { amountPaid: true },
          }),
        ]);

      return {
        opco,
        orgsCount,
        ageficeProfilesCount,
        participantsCount: partAgg._count.id,
        priceHT: Number(partAgg._sum.priceHT ?? 0),
        amountCollected: Number(partAgg._sum.amountCollected ?? 0),
        invoicedTTC: Number(invoicedAgg._sum.amountTTC ?? 0),
        paid: Number(paidAgg._sum.amountPaid ?? 0),
        sessionsCount: sessionsCount.length,
      };
    }),
  );

  const totals = stats.reduce(
    (acc, s) => ({
      orgs: acc.orgs + s.orgsCount,
      participants: acc.participants + s.participantsCount,
      invoicedTTC: acc.invoicedTTC + s.invoicedTTC,
      priceHT: acc.priceHT + s.priceHT,
    }),
    { orgs: 0, participants: 0, invoicedTTC: 0, priceHT: 0 },
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Financeurs"
        subtitle={`${opcos.length} organismes financeurs actifs · ${fmtNb.format(totals.orgs)} entreprises affiliées · ${fmtNb.format(totals.participants)} inscriptions cumulées`}
      />

      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.map(({ opco, orgsCount, ageficeProfilesCount, participantsCount, priceHT, amountCollected, invoicedTTC, paid, sessionsCount }) => (
            <Link
              key={opco.id}
              href={`/app/financeurs/${opco.code}`}
              className="group rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6 hover:border-primary-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary-50 text-primary-700 inline-flex items-center justify-center shrink-0">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base">{formatFunderCode(opco.code)}</h3>
                      <Badge variant="muted" className="text-[10px]">{opco.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{opco.name}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>

              {/* grid-cols-2 OK même mobile : 2 KpiBlock compacts (chiffre + label court) */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <KpiBlock
                  icon={Building2}
                  label="Organisations"
                  value={fmtNb.format(orgsCount)}
                  sub={
                    opco.code === 'AGEFICE'
                      ? `${ageficeProfilesCount} profils prêts`
                      : `${sessionsCount} session${sessionsCount > 1 ? 's' : ''}`
                  }
                />
                <KpiBlock
                  icon={Users}
                  label="Inscriptions"
                  value={fmtNb.format(participantsCount)}
                  sub={`${sessionsCount} session${sessionsCount > 1 ? 's' : ''} couverte${sessionsCount > 1 ? 's' : ''}`}
                />
                <KpiBlock
                  icon={Wallet}
                  label="CA prévisionnel"
                  value={fmtEUR.format(priceHT)}
                  sub="HT (prix inscriptions)"
                />
                <KpiBlock
                  icon={FileCheck}
                  label="Encaissé"
                  value={fmtEUR.format(amountCollected || paid)}
                  sub={invoicedTTC > 0 ? `${fmtEUR.format(invoicedTTC)} facturé TTC` : 'aucune facture'}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 border-t border-border text-xs text-muted-foreground">
                {opco.averageDelayDays != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Délai moy. <strong className="text-foreground">{opco.averageDelayDays} j</strong>
                  </span>
                )}
                {opco.maxAmountPerTraining != null && (
                  <span>
                    Plafond formation <strong className="text-foreground">{fmtEUR.format(Number(opco.maxAmountPerTraining))}</strong>
                  </span>
                )}
                {opco.yearlyCapPerPerson != null && (
                  <span>
                    Plafond annuel <strong className="text-foreground">{fmtEUR.format(Number(opco.yearlyCapPerPerson))}</strong>
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6">
        <h2 className="font-semibold mb-2">À propos des financeurs</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Les financeurs (OPCO et FAF) sont des <strong>attributs des organisations</strong>, jamais directement des apprenants.
          Pour qu'un apprenant bénéficie d'un financement AGEFICE, il doit être lié (via <code className="font-mono text-xs">LegalLink</code>)
          à une organisation dont l'OPCO est AGEFICE et dont le profil AGEFICE est rempli.
          Cette page agrège les données de toutes les organisations affiliées à chaque financeur.
        </p>
      </section>
    </div>
  );
}

function KpiBlock({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="font-semibold tabular-nums text-base">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
