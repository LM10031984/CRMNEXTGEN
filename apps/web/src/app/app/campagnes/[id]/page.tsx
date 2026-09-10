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
import { decrireCreneau, decrireDureeProduit, mesurerCreneau } from '@/lib/campagne/creneaux';
import { jourLongAvecAnnee } from '@/lib/dates-fr';
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

const jourFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' });

function Compteur({
  valeur,
  libelle,
  variant,
  detail,
}: {
  valeur: number;
  libelle: string;
  variant?: 'ok' | 'warn' | 'neutre';
  /** Nuance qui ne mérite pas sa propre tuile — « dont 2 pas encore tranchés ». */
  detail?: string | null;
}) {
  const couleur =
    variant === 'ok' ? 'text-emerald-700' : variant === 'warn' ? 'text-amber-700' : 'text-foreground';
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${couleur}`}>{valeur}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{libelle}</div>
      {detail ? <div className="text-[11px] text-muted-foreground mt-0.5">{detail}</div> : null}
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
      organization: { select: { id: true, legalName: true, brandName: true } },
      lead: { select: { id: true, firstName: true, lastName: true } },
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
  const dateRetenue = c.dateOptions.find((d) => d.isRetained) ?? null;
  const dureeProduit = decrireDureeProduit(c.product?.durationHours, regles.values);

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.organization.legalName}
        subtitle={c.label}
        actions={<Badge variant={ETAT_META[etat].variant}>{ETAT_META[etat].label}</Badge>}
      />

      {/*
        D-22 — les trois faits qui gouvernent la campagne, ensemble et en tête :
        pour qui, quoi, et jusqu'à quand. Auparavant l'écran n'affichait que le
        libellé libre, et il fallait descendre pour trouver le reste.
      */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <div className="text-xs text-muted-foreground">Agence</div>
          <Link
            href={`/app/organisations/${c.organization.id}` as Route}
            className="mt-0.5 block font-medium hover:underline"
          >
            {c.organization.legalName}
          </Link>
          {c.organization.brandName && c.organization.brandName !== c.organization.legalName ? (
            <div className="text-xs text-muted-foreground">{c.organization.brandName}</div>
          ) : null}
        </div>
        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <div className="text-xs text-muted-foreground">Formation</div>
          <div className="mt-0.5 font-medium">{c.product?.title ?? 'À préciser'}</div>
          {dureeProduit ? (
            <div className="text-xs text-muted-foreground tabular-nums">{dureeProduit}</div>
          ) : null}
          {dateRetenue ? (
            <div className="text-xs text-muted-foreground">
              Date retenue : {jourFmt.format(dateRetenue.startsAt)} ·{' '}
              {decrireCreneau(mesurerCreneau(dateRetenue, regles.values))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Aucune date retenue pour l’instant</div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <div className="text-xs text-muted-foreground">Pièces réunies avant le</div>
          <div className={`mt-0.5 font-medium ${enRetard ? 'text-red-700' : ''}`}>
            {deadline ? jourFmt.format(deadline) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">
            {deadline
              ? `${regles.values.AGEFICE_LEAD_DAYS_MIN} j avant la date la plus proche`
              : 'Ajoutez une date pour connaître le délai'}
          </div>
        </div>
      </div>

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

      {/*
        Quatre tuiles, dans l'ordre du parcours, et exclusives : chaque dossier
        n'en occupe qu'une, si bien que leur somme vaut l'effectif attendu
        (arbitrage du 10/09/2026). « En cours de vérification » n'est plus une
        tuile — c'est « rendu, pas encore tranché », qui ne bloque personne et
        se dit en sous-libellé de « Dossiers bons ».
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Compteur valeur={a.pasEncoreRendus} libelle="Formulaire non rendu" variant="warn" />
        <Compteur valeur={a.piecesIncompletes} libelle="Pièces manquantes" variant="warn" />
        <Compteur valeur={a.rejetes} libelle="Rejetés" variant="warn" />
        <Compteur
          valeur={a.bons}
          libelle="Dossiers bons"
          variant="ok"
          detail={
            a.rendusNonTranches > 0
              ? `dont ${a.rendusNonTranches} pas encore tranché${a.rendusNonTranches > 1 ? 's' : ''}`
              : null
          }
        />
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
          texte: jourLongAvecAnnee(d.startsAt),
          creneau: decrireCreneau(mesurerCreneau(d, regles.values)),
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

      {c.diagnostic || c.lead ? (
        <p className="text-sm text-muted-foreground">
          Contexte :{' '}
          {c.diagnostic ? (
            <Link
              href={`/app/diagnostics/${c.diagnostic.id}` as Route}
              className="text-primary hover:underline"
            >
              diagnostic {c.diagnostic.reference}
            </Link>
          ) : null}
          {c.diagnostic && c.lead ? ' · ' : null}
          {c.lead ? (
            <Link href={`/app/leads/${c.lead.id}` as Route} className="text-primary hover:underline">
              lead {`${c.lead.firstName ?? ''} ${c.lead.lastName ?? ''}`.trim() || c.lead.id}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
