import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Mail, Phone, Building2, User } from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { prisma } from '@qualiof/db';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { ReassignLeadButton } from '@/components/leads/reassign-lead-button';
import { LeadActivityForm } from '@/components/leads/fiche-forms';
import { libelleStatut, MOTIFS_PERTE } from '@/lib/leads/suivi';
import { LeadDiagnosticSection } from '@/components/diagnostic/lead-diagnostic-section';
import { SuiviStandPanel, type BrouillonRelance } from '@/components/diagnostic/suivi-stand-panel';
import {
  composerRelance,
  scriptAppel,
  ETAPE_LIBELLE,
  type EtapeRelance,
} from '@/lib/diagnostic/relances';
import { PROBLEMATIQUES, SOURCE_STAND, type ProblematiqueKey } from '@/lib/diagnostic/questions';
import { loadOfConfig } from '@/lib/of-config';
import { signataire } from '@/lib/mailer-templates/diagnostic-programme';

/**
 * Fiche détail Lead (Phase 9 Plan 09-03 — LEAD-01).
 *
 * Server Component, lecture pour tout user authentifié (scope tenantId obligatoire).
 *  - Header : prospectName + breadcrumb + bouton "Réassigner" (Task 1 / Plan 09-02 action).
 *  - Section commercial assigné (badge ou "Non assigné") + select statut inline.
 *  - Section détails : source, priorité, email, téléphone, organisation (avec lien),
 *    formation d'intérêt, notes.
 *
 * Pattern Phase 5 réutilisé : Breadcrumb + grid responsive sm:grid-cols-2.
 * Si lead introuvable dans le tenant → notFound() (404).
 */
export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      person: { select: { id: true, firstName: true, lastName: true } },
      organization: { select: { id: true, legalName: true, brandName: true } },
      interestedProduct: { select: { id: true, title: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
      // Diagnostic du stand : ce que le prospect a réellement reçu, et si
      // l'envoi est parti. C'est ce qui manque quand on décroche pour rappeler.
      // Relances déjà parties : on ne remontre pas « Envoyer » comme si de rien
      // n'était sur un prospect déjà relancé deux fois.
      actions: {
        where: { type: 'email' },
        orderBy: { occurredAt: 'desc' },
        select: { subject: true },
        take: 20,
      },
      diagnosticSubmissions: {
        orderBy: { createdAt: 'desc' },
        select: {
          reponses: true,
          id: true,
          createdAt: true,
          dominante: true,
          secondaire: true,
          scores: true,
          programmeStatus: true,
          programmeSentAt: true,
          lastError: true,
          attempts: true,
          personnalisation: true,
        },
      },
    },
  });
  if (!lead) notFound();

  const canEdit = ['ADMIN', 'MANAGER', 'COMMERCIAL'].includes(user.role);
  const history = await prisma.leadAction.findMany({
    where: { leadId: lead.id },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });

  // Résolution prospectName : Person canonique (CRM) prioritaire, puis fallback saisie libre, puis "Prospect".
  const prospectName =
    (lead.person ? `${lead.person.firstName} ${lead.person.lastName}`.trim() : '') ||
    `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() ||
    'Prospect';
  const ownerName = lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}`.trim() : null;

  // ── Suivi du stand ────────────────────────────────────────────────────────
  // Les brouillons sont composés ICI, au rendu serveur : la copie commerciale
  // reste dans un module pur (`lib/diagnostic/relances.ts`), et le composant
  // client n'a qu'à l'afficher et à déclencher l'envoi.
  const derniereSoumission = lead.diagnosticSubmissions[0];
  const estDuStand = lead.source === SOURCE_STAND && derniereSoumission !== undefined;
  const dominante =
    derniereSoumission && derniereSoumission.dominante in PROBLEMATIQUES
      ? (derniereSoumission.dominante as ProblematiqueKey)
      : null;

  let suiviStand: {
    script: string;
    brouillons: BrouillonRelance[];
  } | null = null;

  if (estDuStand && dominante) {
    const of = await loadOfConfig(user.tenantId);
    const signature = signataire(of);
    const prenom = lead.firstName ?? prospectName.split(' ')[0] ?? 'Bonjour';
    const evenement = SOURCE_STAND.replace(/^Salon — /, '');
    const reponses = (derniereSoumission.reponses ?? {}) as Record<string, string>;

    const objetsEnvoyes = new Set(lead.actions.map((a) => a.subject));
    const brouillons = (['J4', 'J10'] as EtapeRelance[]).map((etape) => {
      const { subject, text } = composerRelance(etape, {
        prenom,
        dominante,
        signataire: signature.nom,
        evenement,
      });
      return {
        etape,
        libelle: ETAPE_LIBELLE[etape],
        subject,
        text,
        dejaEnvoyee: objetsEnvoyes.has(subject),
      };
    });

    suiviStand = {
      script: scriptAppel({
        prenom,
        dominante,
        signataire: signature.nom,
        evenement,
        // La phrase « vous n'avez rien fait cette année » ne se dit à voix haute
        // que si le prospect l'a effectivement déclaré.
        droitsIntacts: reponses.formation_annee === 'NON',
      }),
      brouillons,
    };
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Leads', href: '/app/leads' }, { label: prospectName }]} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{prospectName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Créé le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(lead.createdAt)}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/app/leads/${lead.id}/edit` as any}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Modifier la fiche
            </Link>
            <ReassignLeadButton leadId={lead.id} />
          </div>
        )}
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Commercial assigné
          </div>
          <div className="text-base font-medium">
            {ownerName ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-50 text-primary-700">
                <User className="h-3.5 w-3.5" />
                {ownerName}
              </span>
            ) : (
              <span className="text-muted-foreground italic">Non assigné</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Statut
          </div>
          <div className="font-medium">{libelleStatut(lead.status, lead.callCount)}</div>
          {lead.wonAt && (
            <div className="text-xs text-emerald-700 mt-1">
              Gagné le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(lead.wonAt)}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-border pt-6">
        <DetailRow label="Source" value={lead.source ?? '—'} />
        <DetailRow label="Priorité" value={lead.priority} />
        <DetailRow label="Fonction" value={lead.jobTitle || '—'} />
        <DetailRow label="Ville / secteur" value={lead.city || '—'} />
        <DetailRow label="Segments MLS" value={lead.segments.join(', ') || '—'} />
        <DetailRow label="Prochaine action" value={lead.nextAction || 'À planifier'} />
        <DetailRow
          label="Échéance"
          value={
            lead.nextActionAt
              ? new Intl.DateTimeFormat('fr-FR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Paris',
                }).format(lead.nextActionAt) + ' (Paris)'
              : 'À planifier'
          }
        />
        {lead.lossReason && (
          <DetailRow
            label="Motif de perte"
            value={MOTIFS_PERTE[lead.lossReason as keyof typeof MOTIFS_PERTE] || lead.lossReason}
          />
        )}
        <DetailRow
          label="Email"
          value={
            lead.email ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                  {lead.email}
                </a>
              </span>
            ) : (
              '—'
            )
          }
        />
        <DetailRow
          label="Téléphone"
          value={
            lead.phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <a
                  href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
                  className="text-primary hover:underline"
                >
                  {lead.phone}
                </a>
              </span>
            ) : (
              '—'
            )
          }
        />
        {lead.organization && (
          <DetailRow
            label="Organisation"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <Link
                  href={`/app/organisations/${lead.organization.id}` as any}
                  className="text-primary hover:underline"
                >
                  {lead.organization.brandName ?? lead.organization.legalName}
                </Link>
              </span>
            }
          />
        )}
        {lead.interestedProduct && (
          <DetailRow label="Formation d'intérêt" value={lead.interestedProduct.title} />
        )}
      </section>

      {canEdit && (
        <section id="activite" className="rounded-xl border border-border bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Ajouter un appel ou une activité</h2>
          <LeadActivityForm
            lead={{
              id: lead.id,
              updatedAt: lead.updatedAt.toISOString(),
              status: lead.status,
              callCount: lead.callCount,
              nextAction: lead.nextAction,
              nextActionAt: lead.nextActionAt?.toISOString() ?? null,
              lossReason: lead.lossReason,
            }}
          />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Historique des activités</h2>
        {history.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune activité enregistrée.</p>
        )}
        {history.map((a) => (
          <article key={a.id} className="rounded-lg border border-border p-4 space-y-2">
            <div className="font-medium text-sm">{a.subject}</div>
            <p className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Europe/Paris',
              }).format(a.occurredAt)}{' '}
              (Paris) · {a.authorName || 'Activité historique / système'}
              {a.durationSeconds !== null && ` · ${a.durationSeconds} s`}
            </p>
            {a.body && <p className="whitespace-pre-wrap text-sm">{a.body}</p>}
            {a.nextAction && (
              <p className="text-xs">
                Suite : {a.nextAction}
                {a.nextActionAt &&
                  ` · ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(a.nextActionAt)} (Paris)`}
              </p>
            )}
          </article>
        ))}
        {history.length === 100 && (
          <p className="text-xs text-muted-foreground">
            Les 100 dernières activités sont affichées.
          </p>
        )}
      </section>

      <LeadDiagnosticSection soumissions={lead.diagnosticSubmissions} />

      {suiviStand && (
        <SuiviStandPanel
          leadId={lead.id}
          script={suiviStand.script}
          brouillons={suiviStand.brouillons}
          email={lead.email}
        />
      )}

      {lead.notes && (
        <section className="border-t border-border pt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Notes
          </div>
          <div className="text-sm whitespace-pre-wrap">{lead.notes}</div>
        </section>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
