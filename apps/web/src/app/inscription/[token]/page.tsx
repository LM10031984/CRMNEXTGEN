/**
 * Page PUBLIQUE d'inscription à une session (spec 2026-08-28).
 *
 * Résolue par `TrainingSession.publicToken` : un lien permanent par session,
 * révocable, que Laurent diffuse par email ou WhatsApp. Sœur de
 * `/preinscription/[token]` (lien individuel), qui reste en place.
 *
 * Aucune écriture ici : la page n'affiche que le formulaire. La demande
 * n'existe en base qu'à la soumission.
 */

import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { publicLinkState, type PublicLinkState } from '@/lib/enrollment/public-link';
import { formatLieuFormation } from '@/lib/locations/format-lieu';
import { SessionEnrollmentForm } from '@/components/enrollment/session-enrollment-form';

export const dynamic = 'force-dynamic';

/** Statuts d'une demande qui occupe encore une place. */
const STATUTS_EN_COURS = ['SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'VALIDATED'] as const;

export default async function PublicSessionEnrollmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const session = await prisma.trainingSession.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      capacityMax: true,
      publicToken: true,
      publicFormClosedAt: true,
      product: { select: { title: true } },
      location: { select: { name: true, legalName: true, address: true } },
    },
  });
  if (!session) notFound();

  const [participantCount, pendingRequestCount] = await Promise.all([
    prisma.sessionParticipant.count({ where: { sessionId: session.id } }),
    prisma.preEnrollment.count({
      where: { intendedSessionId: session.id, status: { in: [...STATUTS_EN_COURS] } },
    }),
  ]);

  const etat = publicLinkState({
    publicToken: session.publicToken,
    publicFormClosedAt: session.publicFormClosedAt,
    sessionStatus: session.status,
    capacityMax: session.capacityMax,
    participantCount,
    pendingRequestCount,
  });

  // Lieu : TOUJOURS via le helper partagé — trois compositions divergentes ont
  // causé un refus AGEFICE le 28/08/2026 (feedback_source_unique_composition_lieu).
  const lieu = formatLieuFormation(session.location, '');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50/30">
      <header className="border-b border-border bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center">
            S
          </div>
          <div>
            <div className="font-semibold">Start Academy</div>
            <div className="text-xs text-muted-foreground">Organisme de formation Qualiopi</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 text-primary-800 text-xs font-medium mb-3">
            Demande d'inscription
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {session.product.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Du {formatDateFr(session.startDate)} au {formatDateFr(session.endDate)}
          </p>
          {lieu ? <p className="text-sm text-muted-foreground">{lieu}</p> : null}
        </div>

        {etat === 'ouvert' ? (
          <SessionEnrollmentForm publicToken={token} />
        ) : (
          <ClosedState etat={etat} />
        )}
      </main>

      <footer className="border-t border-border bg-white py-5 mt-10">
        <div className="max-w-3xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Données hébergées dans l'Union européenne · Qualiopi · RGPD
          </div>
          <div>© Start Academy 2026</div>
        </div>
      </footer>
    </div>
  );
}

function formatDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ClosedState({ etat }: { etat: PublicLinkState }) {
  const complet = etat === 'complet';
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-12 text-center space-y-4">
      <h2 className="text-xl font-bold text-amber-900">
        {complet ? 'Session complète' : 'Inscriptions closes'}
      </h2>
      <p className="text-sm text-amber-800 max-w-md mx-auto">
        {complet
          ? 'Cette session affiche complet. Contacte-nous pour connaître les prochaines dates.'
          : 'Les inscriptions pour cette session sont closes. Contacte-nous pour connaître les prochaines dates.'}
      </p>
      <a
        href="mailto:contact@start-academy.fr"
        className="inline-block text-sm font-medium text-primary underline"
      >
        contact@start-academy.fr
      </a>
    </div>
  );
}
