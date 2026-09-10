import Link from 'next/link';
import type { Route } from 'next';
import { Users2, Link2 } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { calculerAvancement } from '@/lib/campagne/avancement';
import { campagneLinkState } from '@/lib/campagne/lien';

/**
 * Liste des campagnes de pré-inscription par RDV (lot F, spec §7).
 *
 * Une campagne = un rendez-vous commercial = un lien diffusé à une équipe.
 * L'état affiché est celui que calcule la fonction pure, pas le champ `status`
 * brut : un lien « OUVERTE » mais expiré n'ouvre plus, et l'écran doit dire ce
 * que vit le participant, pas ce que dit la colonne.
 */
export const dynamic = 'force-dynamic';

const ETAT_META = {
  ouverte: { label: 'Ouverte', variant: 'success' as const },
  expiree: { label: 'Expirée', variant: 'muted' as const },
  annulee: { label: 'Révoquée', variant: 'danger' as const },
  cloturee: { label: 'Clôturée', variant: 'muted' as const },
  'quota-atteint': { label: 'Quota atteint', variant: 'warning' as const },
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });

export default async function CampagnesPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const campagnes = await prisma.enrollmentBatch.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      label: true,
      status: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      createdAt: true,
      product: { select: { title: true } },
      dateOptions: {
        select: { id: true, startsAt: true, label: true, isRetained: true, votes: true },
      },
      preEnrollments: {
        select: {
          id: true,
          status: true,
          firstName: true,
          lastName: true,
          submittedAt: true,
          cniKey: true,
          ribKey: true,
          cfpKey: true,
          rejectionReason: true,
        },
      },
    },
    take: 100,
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campagnes de pré-inscription"
        subtitle="Un lien par rendez-vous : l’équipe du client dépose ses dossiers, vous voyez ce qui est bon."
      />

      {campagnes.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-10 text-center">
          <Users2 className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-3 font-medium">Aucune campagne pour l’instant</p>
          <p className="text-sm text-muted-foreground mt-1">
            Une campagne se crée depuis un diagnostic ou une proposition : c’est le lien que le
            dirigeant diffuse à son équipe.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Campagne</th>
                <th className="px-4 py-3 font-medium">État</th>
                <th className="px-4 py-3 font-medium">Dossiers</th>
                <th className="px-4 py-3 font-medium">À relancer</th>
                <th className="px-4 py-3 font-medium">Expire</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campagnes.map((c) => {
                const etat = campagneLinkState(c, now);
                const meta = ETAT_META[etat];
                const attendus = c.maxUses !== null ? Math.round(c.maxUses / 3) : null;
                const a = calculerAvancement({
                  attendus,
                  preEnrollments: c.preEnrollments,
                  dateOptions: c.dateOptions.map((d) => ({
                    id: d.id,
                    startsAt: d.startsAt,
                    label: d.label,
                    isRetained: d.isRetained,
                    votes: d.votes,
                  })),
                });
                return (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/campagnes/${c.id}` as Route}
                        className="font-medium hover:underline"
                      >
                        {c.label}
                      </Link>
                      {c.product?.title ? (
                        <div className="text-xs text-muted-foreground">{c.product.title}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className="font-medium">{a.bons}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        bon{a.bons > 1 ? 's' : ''} / {a.rendus} rendu{a.rendus > 1 ? 's' : ''}
                        {attendus ? ` · ${attendus} attendus` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.aRelancer.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="warning">{a.aRelancer.length}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {dateFmt.format(c.expiresAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5" />
        Le lien d’une campagne ne s’affiche qu’une seule fois, à sa création. Perdu, il se régénère
        depuis la fiche — et l’ancien cesse alors de fonctionner.
      </p>
    </div>
  );
}
