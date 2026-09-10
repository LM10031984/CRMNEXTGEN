/**
 * Page publique d'une campagne de RDV (spec §7, lot F).
 *
 * Elle DISTRIBUE des liens individuels — elle ne collecte rien d'autre que
 * l'identité minimale nécessaire pour fabriquer le lien. Le dossier lui-même
 * (pièces, OCR, validation) se remplit ensuite sur `/preinscription/[token]`,
 * dans le pipeline existant.
 *
 * Ce que le participant ne voit JAMAIS ici (§7.2) : le diagnostic, la
 * proposition, le chiffrage, et les autres participants. Il ne voit que la
 * formation pressentie, les dates proposées, et son propre formulaire.
 *
 * `no-store` explicite : un lien de campagne ne doit jamais être servi depuis
 * un cache, sinon une campagne révoquée continuerait de s'ouvrir.
 */

import { notFound } from 'next/navigation';
import { ShieldCheck, CalendarDays } from 'lucide-react';
import { prisma } from '@qualiof/db';
import {
  hashPublicToken,
  isWellFormedPublicToken,
  publicTokenMatches,
} from '@/lib/proposition/public-link';
import { campagneLinkState, CAMPAGNE_LINK_MESSAGE } from '@/lib/campagne/lien';
import { deadlineAdministrative } from '@/lib/campagne/avancement';
import { decrireCreneau, formaterHeureOf, mesurerCreneau } from '@/lib/campagne/creneaux';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { RdvForm } from '@/components/campagne/rdv-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Votre pré-inscription — Start Academy',
  description: 'Constituez votre dossier de formation en quelques minutes.',
  robots: { index: false, follow: false },
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const jourFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50/30">
      <header className="border-b border-border bg-white">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center">
            S
          </div>
          <div>
            <div className="font-semibold leading-tight">Start Academy</div>
            <div className="text-xs text-muted-foreground">Organisme de formation Qualiopi</div>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-8">{children}</main>
      <footer className="border-t border-border bg-white py-5 mt-8">
        <div className="max-w-2xl mx-auto px-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Données hébergées dans l&apos;Union européenne ·
            Qualiopi · RGPD
          </div>
          <div>© Start Academy 2026</div>
        </div>
      </footer>
    </div>
  );
}

export default async function CampagnePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isWellFormedPublicToken(token)) notFound();

  const candidat = hashPublicToken(token);
  const batch = await prisma.enrollmentBatch.findUnique({
    where: { tokenHash: candidat },
    select: {
      id: true,
      tenantId: true,
      tokenHash: true,
      label: true,
      status: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      product: { select: { title: true, durationHours: true } },
      dateOptions: {
        orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true, endsAt: true, label: true, isRetained: true },
      },
    },
  });

  // Un token inconnu et un token malformé donnent le même 404 : distinguer les
  // deux renseignerait qui teste des jetons au hasard.
  if (!batch || !publicTokenMatches(candidat, batch.tokenHash)) notFound();

  const etat = campagneLinkState(batch, new Date());
  if (etat !== 'ouverte') {
    return (
      <Cadre>
        <div className="rounded-2xl border border-border bg-white p-6 md:p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold tracking-tight">Ce lien n&apos;est plus ouvert</h1>
          <p className="text-sm text-muted-foreground mt-3">{CAMPAGNE_LINK_MESSAGE[etat]}</p>
        </div>
      </Cadre>
    );
  }

  const regles = await loadFundingRules(batch.tenantId);
  const deadline = deadlineAdministrative({
    dateOptions: batch.dateOptions,
    leadDaysMin: regles.values.AGEFICE_LEAD_DAYS_MIN,
  });

  return (
    <Cadre>
      <div className="mb-7 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 text-primary-800 text-xs font-medium mb-3">
          Pré-inscription · quelques minutes
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Constituez votre dossier de formation
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Indiquez qui vous êtes : nous préparons votre dossier personnel, et vous y déposerez vos
          pièces.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 md:p-7 shadow-sm space-y-6">
        <div className="rounded-xl bg-primary-50/60 border border-primary-100 p-4">
          <div className="text-xs uppercase tracking-wide text-primary-800 font-semibold">
            Votre formation
          </div>
          <div className="mt-1 font-semibold">{batch.product?.title ?? batch.label}</div>
          {batch.product?.durationHours ? (
            <div className="text-sm text-muted-foreground">{batch.product.durationHours} h</div>
          ) : null}
        </div>

        {deadline ? (
          <div className="flex items-start gap-2.5 text-sm rounded-xl border border-amber-200 bg-amber-50 p-4">
            <CalendarDays className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
            <div>
              <span className="font-semibold text-amber-900">
                Pièces réunies au plus tard le {jourFmt.format(deadline)}
              </span>
              <div className="text-amber-800/90 mt-0.5">
                C&apos;est le délai imposé par le financeur avant le démarrage. Passé cette date,
                votre prise en charge ne peut plus être instruite à temps.
              </div>
            </div>
          </div>
        ) : null}

        <RdvForm
          token={token}
          dateOptions={batch.dateOptions.map((d) => ({
            id: d.id,
            label: d.label,
            texte: dateFmt.format(d.startsAt),
            // Le participant ne voyait que le jour : il ne pouvait pas
            // distinguer une matinée d'une journée entière, et arrivait donc
            // sans savoir combien de temps bloquer. Il lit maintenant l'horaire
            // et le nombre de demi-journées — les mêmes que la convention.
            horaire: `${formaterHeureOf(d.startsAt)} – ${formaterHeureOf(d.endsAt)}`,
            creneau: decrireCreneau(mesurerCreneau(d, regles.values)),
            isRetained: d.isRetained,
          }))}
        />
      </div>
    </Cadre>
  );
}
