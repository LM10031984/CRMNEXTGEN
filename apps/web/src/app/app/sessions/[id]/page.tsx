import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Euro, Users, Briefcase, ClipboardCheck, Check, Minus, Package, ChevronRight } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { DeleteEntityButton } from '@/components/forms/delete-entity-button';
import { Badge } from '@/components/ui/badge';
import { ParticipantActionsMenu } from '@/components/sessions/participant-actions-menu';
import { GenerateClosurePackButton } from '@/components/sessions/generate-closure-pack-button';
import { CreateSponsorInvoiceButton } from '@/components/invoices/create-sponsor-invoice-button';
import { AddParticipantDialog } from '@/components/sessions/add-participant-dialog';
import { EditParticipantButton } from '@/components/sessions/edit-participant-button';
import { DeleteSessionButton } from '@/components/sessions/delete-session-button';
import { DuplicateSessionButton } from '@/components/sessions/duplicate-session-button';
import { BackToListLink } from '@/components/ui/back-to-list-link';
import { RecordRecentVisit } from '@/components/command-palette/record-recent-visit';

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'info' | 'warning' | 'muted' | 'danger' | 'primary' }> = {
  DRAFT: { label: 'Brouillon', variant: 'muted' },
  PLANNED: { label: 'Planifiée', variant: 'info' },
  OPEN: { label: 'Ouverte', variant: 'info' },
  VALIDATED: { label: 'Validée', variant: 'success' },
  IN_PROGRESS: { label: 'En cours', variant: 'primary' },
  COMPLETED: { label: 'Terminée', variant: 'success' },
  CANCELLED: { label: 'Annulée', variant: 'danger' },
};

const SOLO_FORMS = ['EI', 'EIRL', 'AUTO_ENTREPRENEUR'];

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { id } = await params;

  const session = await prisma.trainingSession.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      product: true,
      participants: {
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
        include: {
          person: { select: { id: true, firstName: true, lastName: true } },
          sponsorOrg: { select: { id: true, legalName: true, legalForm: true, opcoCode: true } },
        },
      },
    },
  });
  if (!session) notFound();

  // Documents Qualiopi déjà générés pour cette session, indexés par participant + type
  const sessionParticipantIds = session.participants.map((p) => p.id);
  const [sessionDocs, sessionAssets, sessionInvoices] = sessionParticipantIds.length
    ? await Promise.all([
        prisma.document.findMany({
          where: { tenantId: user.tenantId, sessionId: session.id, participantId: { in: sessionParticipantIds } },
          select: { id: true, type: true, participantId: true },
        }),
        prisma.pedagogicalAsset.findMany({
          where: { tenantId: user.tenantId, sessionId: session.id, participantId: { in: sessionParticipantIds }, pdfUrl: { not: null } },
          select: { id: true, kind: true, participantId: true },
        }),
        prisma.invoice.findMany({
          where: {
            tenantId: user.tenantId,
            OR: [
              { participantId: { in: sessionParticipantIds } },
              { sessionId: session.id },
            ],
          },
          select: { id: true, number: true, participantId: true, participantIds: true },
        }),
      ])
    : [[], [], []];

  // Indexe par participant pour lookup en O(1) côté rendu
  const docsByParticipant = new Map<string, Map<string, string>>(); // partId → Map(type → docId)
  const assetsByParticipant = new Map<string, Map<string, string>>(); // partId → Map(kind → assetId)
  for (const d of sessionDocs) {
    if (!d.participantId) continue;
    const m = docsByParticipant.get(d.participantId) ?? new Map();
    m.set(d.type, d.id);
    docsByParticipant.set(d.participantId, m);
  }
  for (const a of sessionAssets) {
    if (!a.participantId) continue;
    const m = assetsByParticipant.get(a.participantId) ?? new Map();
    m.set(a.kind, a.id);
    assetsByParticipant.set(a.participantId, m);
  }

  // Indexe les factures par participant. Une facture peut couvrir plusieurs
  // inscrits (groupage sponsor via Invoice.participantIds Json[]) ou un seul
  // (via Invoice.participantId).
  const invoiceByParticipant = new Map<string, { id: string; number: string }>();
  for (const inv of sessionInvoices) {
    const ids: string[] = [];
    if (inv.participantId) ids.push(inv.participantId);
    if (Array.isArray(inv.participantIds)) {
      for (const x of inv.participantIds) {
        if (typeof x === 'string') ids.push(x);
      }
    }
    for (const pid of ids) {
      if (!invoiceByParticipant.has(pid)) {
        invoiceByParticipant.set(pid, { id: inv.id, number: inv.number });
      }
    }
  }

  // Derniers batches pack fin de formation pour cette session (audit trail)
  const closureBatches = await prisma.closureBatch.findMany({
    where: { tenantId: user.tenantId, sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      totalDocs: true,
      doneDocs: true,
      errorDocs: true,
      createdAt: true,
      completedAt: true,
    },
  });

  const statusInfo = STATUS_LABELS[session.status] ?? { label: session.status, variant: 'muted' as const };
  const eiCount = session.participants.filter((p) => SOLO_FORMS.includes(p.sponsorOrg.legalForm)).length;
  const start = new Date(session.startDate);
  const end = new Date(session.endDate);

  return (
    <div className="space-y-6 max-w-5xl">
      <RecordRecentVisit
        kind="session"
        id={session.id}
        title={session.name ?? session.code}
        subtitle={`${session.code} · ${start.toLocaleDateString('fr-FR')}`}
        href={`/app/sessions/${session.id}`}
      />
      <div className="flex items-center justify-between">
        <BackToListLink fallbackHref="/app/sessions" label="Retour aux sessions" />
        <div className="flex items-center gap-2">
          <GenerateClosurePackButton
            sessionId={session.id}
            participantCount={session.participants.length}
          />
          <DuplicateSessionButton
            sessionId={session.id}
            sessionCode={session.code}
            sourceStartDate={session.startDate}
          />
          <DeleteSessionButton
            sessionId={session.id}
            sessionCode={session.code}
            participantCount={session.participants.length}
          />
        </div>
      </div>

      <PageHeader
        title={session.name ?? '(session sans nom)'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="muted" className="font-mono">{session.code}</Badge>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {start.toLocaleDateString('fr-FR')} → {end.toLocaleDateString('fr-FR')}
            </span>
            {session.product?.durationHours ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {session.product.durationHours}h
              </span>
            ) : null}
            {Number(session.pricePerLearner ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Euro className="h-3.5 w-3.5" /> {Number(session.pricePerLearner).toFixed(0)} € / apprenant
              </span>
            )}
          </span>
        }
      />

      <div className="flex justify-end">
        <DeleteEntityButton
          entity="session"
          entityId={session.id}
          entityName={session.name ?? session.code}
          redirectTo="/app/sessions"
          variant="button"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-border bg-white overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border gap-3">
              <h2 className="font-semibold inline-flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Inscrits ({session.participants.length})
              </h2>
              <div className="flex items-center gap-2">
                {eiCount > 0 && (
                  <Badge variant="primary">
                    {eiCount} auto-entrepreneur{eiCount > 1 ? 's' : ''}
                  </Badge>
                )}
                <AddParticipantDialog
                  sessionId={session.id}
                  defaultPrice={Number(session.pricePerLearner ?? 0)}
                  excludePersonIds={session.participants.map((p) => p.personId)}
                />
              </div>
            </div>
            {session.participants.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun apprenant inscrit. Probablement non matché à l'import (homonymie ou nom tronqué dans l'export Excel).
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(() => {
                  // Groupement par sponsorOrg : 1 facture = 1 sponsor (EI = 1 ligne, SARL = N salariés)
                  const groups = new Map<string, { sponsor: typeof session.participants[number]['sponsorOrg']; participants: typeof session.participants }>();
                  for (const p of session.participants) {
                    const k = p.sponsorOrg.id;
                    if (!groups.has(k)) groups.set(k, { sponsor: p.sponsorOrg, participants: [] });
                    groups.get(k)!.participants.push(p);
                  }
                  return Array.from(groups.values()).map((g) => {
                    const isEi = SOLO_FORMS.includes(g.sponsor.legalForm);
                    const totalHT = g.participants.reduce((s, p) => s + Number(p.priceHT), 0);
                    const allInvoiced = g.participants.every((p) => p.invoiceSent);
                    return (
                      <div key={g.sponsor.id} className="p-4 hover:bg-muted/30 transition-colors">
                        {/* Header sponsor */}
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                          <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
                            <Briefcase className="h-3 w-3" />
                            <span>Sponsor :</span>
                            <Link
                              href={`/app/organisations/${g.sponsor.id}`}
                              className="text-foreground font-medium hover:text-primary"
                            >
                              {g.sponsor.legalName}
                            </Link>
                            <Badge variant={isEi ? 'primary' : 'muted'}>
                              {isEi ? 'Auto-entrepreneur' : g.sponsor.legalForm}
                            </Badge>
                            {g.sponsor.opcoCode && <Badge variant="info">OPCO {g.sponsor.opcoCode}</Badge>}
                            {g.participants.length > 1 && (
                              <Badge variant="warning">{g.participants.length} salariés groupés</Badge>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-3">
                            <span className="text-sm font-medium tabular-nums">{totalHT.toFixed(2)} € HT</span>
                            <CreateSponsorInvoiceButton
                              sessionId={session.id}
                              sponsorOrgId={g.sponsor.id}
                              sponsorName={g.sponsor.legalName}
                              participantCount={g.participants.length}
                              totalHT={totalHT}
                              allInvoiced={allInvoiced}
                            />
                          </div>
                        </div>

                        {/* Lignes participants du groupe */}
                        <ul className="space-y-2">
                          {g.participants.map((p) => (
                            <li key={p.id} className="flex items-start gap-3 ml-2">
                              <div className="h-7 w-7 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center font-semibold text-[10px] shrink-0">
                                {p.person.firstName.charAt(0)}
                                {p.person.lastName.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <Link
                                  href={`/app/apprenants/${p.person.id}`}
                                  className="text-sm font-medium hover:text-primary transition-colors"
                                >
                                  {p.person.firstName} {p.person.lastName.toUpperCase()}
                                </Link>
                                <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-2 flex-wrap">
                                  <span className="tabular-nums">{Number(p.priceHT).toFixed(2)} €</span>
                                  <span>·</span>
                                  <span>{p.enrollmentStatus}</span>
                                  {invoiceByParticipant.get(p.id) ? (
                                    <Link
                                      href={`/app/factures/${invoiceByParticipant.get(p.id)!.id}` as Route}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-medium hover:bg-emerald-100"
                                      title="Ouvrir la facture"
                                    >
                                      Facture {invoiceByParticipant.get(p.id)!.number}
                                    </Link>
                                  ) : p.invoiceSent ? (
                                    <Badge variant="success">Facturé</Badge>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <ParticipantActionsMenu
                                  participantId={p.id}
                                  participantName={`${p.person.firstName} ${p.person.lastName}`}
                                  showAgefice={isEi || g.sponsor.opcoCode === 'AGEFICE'}
                                  initialDocs={{
                                    CONVENTION: docsByParticipant.get(p.id)?.get('CONVENTION') ?? null,
                                    PROGRAMME: docsByParticipant.get(p.id)?.get('PROGRAMME') ?? null,
                                    AGEFICE: docsByParticipant.get(p.id)?.get('AGEFICE') ?? null,
                                  }}
                                />
                                <EditParticipantButton
                                  participantId={p.id}
                                  currentPriceHT={Number(p.priceHT)}
                                  currentStatus={p.enrollmentStatus}
                                  currentFinancingRequestDate={p.financingRequestDate}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </section>

          {/* Conformité Qualiopi : matrice apprenant × document */}
          {session.participants.length > 0 && (
            <section className="rounded-2xl border border-border bg-white overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h2 className="font-semibold inline-flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" /> Conformité Qualiopi
                </h2>
                <span className="text-xs text-muted-foreground">Clic sur ✓ pour ouvrir le PDF</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Apprenant</th>
                      <th className="px-2 py-2 font-semibold text-center">Convention</th>
                      <th className="px-2 py-2 font-semibold text-center">Programme</th>
                      <th className="px-2 py-2 font-semibold text-center">AGEFICE</th>
                      <th className="px-2 py-2 font-semibold text-center">Analyse besoin</th>
                      <th className="px-2 py-2 font-semibold text-center">QCM</th>
                      <th className="px-2 py-2 font-semibold text-center">Grille obs.</th>
                      <th className="px-2 py-2 font-semibold text-center">Attestation</th>
                      <th className="px-2 py-2 font-semibold text-center">Certificat</th>
                      <th className="px-2 py-2 font-semibold text-center">Facture</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {session.participants.map((p) => {
                      const docs = docsByParticipant.get(p.id);
                      const assets = assetsByParticipant.get(p.id);
                      const invoice = invoiceByParticipant.get(p.id);
                      const cells: { label: string; href?: string }[] = [
                        { label: 'Convention', href: docs?.get('CONVENTION') ? `/api/documents/${docs.get('CONVENTION')}` : undefined },
                        { label: 'Programme', href: docs?.get('PROGRAMME') ? `/api/documents/${docs.get('PROGRAMME')}` : undefined },
                        { label: 'AGEFICE', href: docs?.get('AGEFICE') ? `/api/documents/${docs.get('AGEFICE')}` : undefined },
                        { label: 'Analyse besoin', href: assets?.get('ANALYSE_BESOIN') ? `/api/pedagogical-assets/${assets.get('ANALYSE_BESOIN')}` : undefined },
                        { label: 'QCM', href: assets?.get('QCM') ? `/api/pedagogical-assets/${assets.get('QCM')}` : undefined },
                        { label: 'Grille observation', href: assets?.get('GRILLE_OBS') ? `/api/pedagogical-assets/${assets.get('GRILLE_OBS')}` : undefined },
                        { label: 'Attestation', href: docs?.get('ATTESTATION_FIN') ? `/api/documents/${docs.get('ATTESTATION_FIN')}` : undefined },
                        { label: 'Certificat', href: docs?.get('CERTIFICAT_REALISATION') ? `/api/documents/${docs.get('CERTIFICAT_REALISATION')}` : undefined },
                        { label: invoice?.number ?? 'Facture', href: invoice ? `/app/factures/${invoice.id}` : undefined },
                      ];
                      return (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2">
                            <Link
                              href={`/app/apprenants/${p.person.id}?tab=documents`}
                              className="text-sm hover:text-primary"
                            >
                              {p.person.firstName} {p.person.lastName.toUpperCase()}
                            </Link>
                          </td>
                          {cells.map((c, i) => (
                            <td key={i} className="px-2 py-2 text-center">
                              {c.href ? (
                                <a
                                  href={c.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`${c.label} — clic pour ouvrir`}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span
                                  title={`${c.label} — non généré`}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Historique des packs fin de formation lancés sur cette session */}
          {closureBatches.length > 0 && (
            <section className="rounded-2xl border border-border bg-white overflow-hidden">
              <div className="p-5 border-b border-border">
                <h2 className="font-semibold inline-flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" /> Packs fin de formation
                </h2>
              </div>
              <ul className="divide-y divide-border">
                {closureBatches.map((b) => {
                  const variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' =
                    b.status === 'COMPLETED'
                      ? 'success'
                      : b.status === 'PARTIAL'
                        ? 'warning'
                        : b.status === 'FAILED'
                          ? 'danger'
                          : b.status === 'RUNNING'
                            ? 'info'
                            : 'muted';
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/app/sessions/${session.id}/closure/${b.id}` as Route}
                        className="flex items-center gap-3 p-4 hover:bg-muted/20 transition-colors"
                      >
                        <Badge variant={variant}>{b.status}</Badge>
                        <span className="text-sm flex-1">
                          {b.doneDocs} / {b.totalDocs} docs
                          {b.errorDocs > 0 && <span className="text-red-600"> · {b.errorDocs} erreur(s)</span>}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(b.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Produit de formation
            </h2>
            {session.product ? (
              <Link
                href={`/app/produits/${session.product.id}`}
                className="block p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="font-medium">{session.product.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <Badge variant="muted" className="font-mono mr-2">{session.product.code}</Badge>
                  {session.product.durationHours}h · {session.product.modality}
                </div>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground italic">—</p>
            )}
          </section>

          {session.internalNotes && (
            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
                Notes internes
              </h2>
              <p className="text-xs text-muted-foreground whitespace-pre-line">
                {session.internalNotes}
              </p>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
