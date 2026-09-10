import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { CalendarDays, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { calculerAvancement, deadlineAdministrative, deadlineDepassee } from '@/lib/campagne/avancement';
import { campagneLinkState } from '@/lib/campagne/lien';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { CampagneActions } from '@/components/campagne/campagne-actions';

/**
 * Fiche d'une campagne — l'écran demandé en une phrase par Laurent :
 * « comme ça, l'admin peut voir ce qui est bon ou pas bon ».
 *
 * Tout ce qui est affiché ici sort de `calculerAvancement`, la fonction pure.
 * Aucun comptage n'est refait sur place : deux comptages du même chiffre
 * finissent toujours par diverger, et c'est l'écran qu'on croit.
 */
export const dynamic = 'force-dynamic';

const ETAT_META = {
  ouverte: { label: 'Ouverte', variant: 'success' as const },
  expiree: { label: 'Expirée', variant: 'muted' as const },
  annulee: { label: 'Révoquée', variant: 'danger' as const },
  cloturee: { label: 'Clôturée', variant: 'muted' as const },
  'quota-atteint': { label: 'Quota atteint', variant: 'warning' as const },
};

const MOTIF_LABEL = {
  'formulaire-non-rendu': 'N’a pas encore rempli son dossier',
  'pieces-manquantes': 'Pièces manquantes',
  rejete: 'Dossier rejeté',
} as const;

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' });
const jourFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function Compteur({
  valeur,
  libelle,
  variant,
}: {
  valeur: number;
  libelle: string;
  variant?: 'ok' | 'warn' | 'neutre';
}) {
  const couleur =
    variant === 'ok' ? 'text-emerald-700' : variant === 'warn' ? 'text-amber-700' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${couleur}`}>{valeur}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{libelle}</div>
    </div>
  );
}

export default async function CampagneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const c = await prisma.enrollmentBatch.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      label: true,
      status: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      createdAt: true,
      product: { select: { title: true, durationHours: true } },
      diagnostic: { select: { id: true, reference: true } },
      dateOptions: {
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          label: true,
          isRetained: true,
          votes: true,
        },
      },
      preEnrollments: {
        orderBy: { createdAt: 'asc' },
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
  });
  if (!c) notFound();

  const now = new Date();
  const etat = campagneLinkState(c, now);
  const attendus = c.maxUses !== null ? Math.round(c.maxUses / 3) : null;
  const a = calculerAvancement({
    attendus,
    preEnrollments: c.preEnrollments,
    dateOptions: c.dateOptions,
  });

  const regles = await loadFundingRules(user.tenantId);
  const deadline = deadlineAdministrative({
    dateOptions: c.dateOptions,
    leadDaysMin: regles.values.AGEFICE_LEAD_DAYS_MIN,
  });
  const enRetard = deadlineDepassee(deadline, now);

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.label}
        subtitle={c.product?.title ?? 'Formation à préciser'}
        actions={<Badge variant={ETAT_META[etat].variant}>{ETAT_META[etat].label}</Badge>}
      />

      {deadline ? (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${
            enRetard
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <CalendarDays className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">
              {enRetard ? 'Deadline dépassée — ' : ''}
              Pièces réunies au plus tard le {jourFmt.format(deadline)}
            </span>
            <div className="mt-0.5 opacity-90">
              {enRetard
                ? 'Le délai de dépôt du financeur n’est plus tenable pour la date la plus proche. Il faut reporter, ou assumer un financement hors délai.'
                : `Calculé sur la date la plus proche, moins les ${regles.values.AGEFICE_LEAD_DAYS_MIN} jours exigés par le financeur.`}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Compteur valeur={a.bons} libelle="Dossiers bons" variant="ok" />
        <Compteur valeur={a.enCours} libelle="En cours de vérification" />
        <Compteur valeur={a.pasEncoreRendus} libelle="Formulaire non rendu" variant="warn" />
        <Compteur valeur={a.piecesIncompletes} libelle="Pièces manquantes" variant="warn" />
        <Compteur valeur={a.rejetes} libelle="Rejetés" variant="warn" />
      </div>

      {attendus ? (
        <p className="text-sm text-muted-foreground">
          {a.rendus} dossier{a.rendus > 1 ? 's' : ''} rendu{a.rendus > 1 ? 's' : ''} sur{' '}
          {attendus} attendu{attendus > 1 ? 's' : ''} · lien ouvert {c.usedCount} fois
          {c.maxUses ? ` sur ${c.maxUses}` : ''}.
        </p>
      ) : null}

      <CampagneActions
        batchId={c.id}
        status={c.status}
        dateOptions={c.dateOptions.map((d) => ({
          id: d.id,
          texte: dateFmt.format(d.startsAt),
          label: d.label,
          isRetained: d.isRetained,
          voix: a.votesParDate.find((v) => v.dateOptionId === d.id)?.voix ?? 0,
        }))}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ce qui bloque
        </h2>
        {a.aRelancer.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Rien ne bloque : tous les dossiers reçus sont complets.
          </div>
        ) : (
          <ul className="rounded-xl border border-border bg-white divide-y divide-border">
            {a.aRelancer.map((r) => (
              <li key={`${r.id}-${r.motif}`} className="flex items-start gap-3 px-4 py-3 text-sm">
                {r.motif === 'formulaire-non-rendu' ? (
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                )}
                <div>
                  <span className="font-medium">{r.nom}</span>
                  <span className="text-muted-foreground"> — {MOTIF_LABEL[r.motif]}</span>
                  {r.detail ? (
                    <div className="text-muted-foreground text-xs mt-0.5">{r.detail}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Les dossiers non rendus sont relancés automatiquement par le système de relance des
          pré-inscriptions — il n’y a pas de second dispositif à déclencher ici.
        </p>
      </section>

      {c.diagnostic ? (
        <p className="text-sm">
          <Link
            href={`/app/diagnostics/${c.diagnostic.id}` as Route}
            className="text-primary hover:underline"
          >
            Diagnostic {c.diagnostic.reference}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
