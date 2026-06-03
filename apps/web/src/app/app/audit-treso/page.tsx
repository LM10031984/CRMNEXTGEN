import { Wallet, AlertTriangle, Check, Clock, Euro } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import {
  computeStatutOpco,
  computeStatutEncaissement,
  statutOpcoLabel,
  statutEncaissementLabel,
  listMissingDocs,
  type StatutOpco,
  type StatutEncaissement,
} from '@/lib/treso-formulas';

/**
 * Page Audit Trésorerie — vue globale réplique du fichier Excel
 * Tréso AGEFICE (Start Academy) avec les 2 formules statut Airtable
 * portées en TypeScript (cf lib/treso-formulas.ts).
 *
 * 1 ligne = 1 SessionParticipant (= 1 stagiaire × 1 session)
 * Colonnes alignées sur l'export Excel Tréso AGEFICE.
 */
export default async function AuditTresoPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; statut?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { annee, statut } = await searchParams;
  const yearFilter = annee ? parseInt(annee, 10) : null;
  const today = new Date();

  // Pull all participants with session + product + sponsor org + person
  const participants = await prisma.sessionParticipant.findMany({
    where: {
      session: { tenantId: user.tenantId },
      ...(yearFilter
        ? {
            session: {
              tenantId: user.tenantId,
              startDate: {
                gte: new Date(`${yearFilter}-01-01`),
                lt: new Date(`${yearFilter + 1}-01-01`),
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      priceHT: true,
      conventionSigned: true,
      programmeDelivered: true,
      certificateDelivered: true,
      pedagogicalSupportsGiven: true,
      attendanceSheetCollected: true,
      assiduitySheetCollected: true,
      evaluationCollected: true,
      satisfactionCollected: true,
      closingDocsSent: true,
      opcoPreApproved: true,
      opcoApproved: true,
      opcoReimbursed: true,
      paymentReceived: true,
      factureEnvoyee: true,
      person: { select: { firstName: true, lastName: true } },
      sponsorOrg: { select: { legalName: true, opcoCode: true } },
      session: {
        select: {
          id: true,
          code: true,
          startDate: true,
          endDate: true,
          product: { select: { title: true, durationHours: true } },
          trainers: {
            include: { person: { select: { firstName: true, lastName: true } } },
            orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
            take: 1,
          },
        },
      },
    },
    orderBy: { session: { startDate: 'desc' } },
  });

  // Compute statuts + KPIs
  type Row = {
    id: string;
    sessionId: string;
    sessionCode: string;
    sessionStart: Date;
    sessionEnd: Date;
    productTitle: string;
    durationHours: number;
    apprenantNom: string;
    sponsorOrgLabel: string;
    opcoCode: string | null;
    formateurNom: string;
    priceHT: number;
    statutOpco: StatutOpco;
    statutEncaissement: StatutEncaissement;
    missing: string[];
  };

  const rows: Row[] = participants.map((p) => {
    const flags = {
      endDate: p.session.endDate,
      conventionSigned: p.conventionSigned,
      programmeDelivered: p.programmeDelivered,
      certificateDelivered: p.certificateDelivered,
      pedagogicalSupportsGiven: p.pedagogicalSupportsGiven,
      attendanceSheetCollected: p.attendanceSheetCollected,
      assiduitySheetCollected: p.assiduitySheetCollected,
      evaluationCollected: p.evaluationCollected,
      satisfactionCollected: p.satisfactionCollected,
      closingDocsSent: p.closingDocsSent,
      opcoPreApproved: p.opcoPreApproved,
      opcoApproved: p.opcoApproved,
      factureEnvoyee: p.factureEnvoyee,
      opcoReimbursed: p.opcoReimbursed,
      paymentReceived: p.paymentReceived,
    };
    const trainer = p.session.trainers[0]?.person;
    return {
      id: p.id,
      sessionId: p.session.id,
      sessionCode: p.session.code,
      sessionStart: p.session.startDate,
      sessionEnd: p.session.endDate,
      productTitle: p.session.product?.title ?? '—',
      durationHours: p.session.product?.durationHours ?? 0,
      apprenantNom: `${p.person.firstName} ${p.person.lastName}`,
      sponsorOrgLabel: p.sponsorOrg?.legalName ?? '—',
      opcoCode: p.sponsorOrg?.opcoCode ?? null,
      formateurNom: trainer ? `${trainer.firstName} ${trainer.lastName}` : '—',
      priceHT: Number(p.priceHT ?? 0),
      statutOpco: computeStatutOpco(flags, today),
      statutEncaissement: computeStatutEncaissement(flags, today),
      missing: listMissingDocs(flags),
    };
  });

  const filteredRows = statut ? rows.filter((r) => r.statutEncaissement === statut) : rows;

  // KPIs
  const totalCAprevu = rows.reduce((acc, r) => acc + r.priceHT, 0);
  const totalCAencaisse = rows
    .filter((r) => r.statutEncaissement === 'ENCAISSEMENT_COMPLET')
    .reduce((acc, r) => acc + r.priceHT, 0);
  const totalCABloque = rows
    .filter((r) => r.statutEncaissement === 'BLOQUE_DOCS_OPCO')
    .reduce((acc, r) => acc + r.priceHT, 0);
  const totalCARetard = rows
    .filter((r) => r.statutOpco === 'RETARD_30_JOURS')
    .reduce((acc, r) => acc + r.priceHT, 0);
  const tauxEncaissement = totalCAprevu > 0 ? (totalCAencaisse / totalCAprevu) * 100 : 0;

  const fmtEUR = (n: number) =>
    n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtDate = (d: Date) => new Intl.DateTimeFormat('fr-FR').format(d);

  const years = Array.from(
    new Set(participants.map((p) => p.session.startDate.getFullYear())),
  ).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trésorerie"
        subtitle={`${filteredRows.length} inscription${filteredRows.length > 1 ? 's' : ''} — réplique de la vue Excel Tréso AGEFICE`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
            <Euro className="h-3.5 w-3.5" /> CA prévu
          </div>
          <div className="text-2xl font-semibold">{fmtEUR(totalCAprevu)}</div>
          <div className="text-xs text-muted-foreground">tous statuts</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-700 mb-1">
            <Check className="h-3.5 w-3.5" /> CA encaissé
          </div>
          <div className="text-2xl font-semibold text-emerald-700">{fmtEUR(totalCAencaisse)}</div>
          <div className="text-xs text-emerald-700/70">{tauxEncaissement.toFixed(1)}%</div>
        </div>
        <div
          className={`rounded-xl border p-4 ${totalCABloque > 0 ? 'border-amber-200 bg-amber-50' : 'border-border bg-white'}`}
        >
          <div
            className={`flex items-center gap-2 text-xs uppercase tracking-wide mb-1 ${totalCABloque > 0 ? 'text-amber-800' : 'text-muted-foreground'}`}
          >
            <Clock className="h-3.5 w-3.5" /> CA bloqué docs
          </div>
          <div className={`text-2xl font-semibold ${totalCABloque > 0 ? 'text-amber-800' : ''}`}>
            {fmtEUR(totalCABloque)}
          </div>
          <div className="text-xs text-muted-foreground">docs OPCO manquants</div>
        </div>
        <div
          className={`rounded-xl border p-4 ${totalCARetard > 0 ? 'border-red-200 bg-red-50' : 'border-border bg-white'}`}
        >
          <div
            className={`flex items-center gap-2 text-xs uppercase tracking-wide mb-1 ${totalCARetard > 0 ? 'text-red-700' : 'text-muted-foreground'}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> CA retard
          </div>
          <div className={`text-2xl font-semibold ${totalCARetard > 0 ? 'text-red-700' : ''}`}>
            {fmtEUR(totalCARetard)}
          </div>
          <div className="text-xs text-muted-foreground">+ de 30 jours</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Filtres :</span>
        <Link
          href="/app/audit-treso"
          className={`px-3 py-1 rounded-full border ${!annee && !statut ? 'border-primary bg-primary-50 text-primary' : 'border-border hover:bg-muted/50'}`}
        >
          Tous
        </Link>
        {years.map((y) => (
          <Link
            key={y}
            href={`/app/audit-treso?annee=${y}`}
            className={`px-3 py-1 rounded-full border ${annee === String(y) ? 'border-primary bg-primary-50 text-primary' : 'border-border hover:bg-muted/50'}`}
          >
            {y}
          </Link>
        ))}
        <span className="border-l border-border pl-2 ml-2 text-muted-foreground">Statut :</span>
        {(
          [
            'ENCAISSEMENT_COMPLET',
            'BLOQUE_DOCS_OPCO',
            'ATTENTE_VALIDATION_OPCO',
            'VALIDATION_OK_A_FACTURER',
            'FACTURE_ATTENTE_OPCO',
            'A_COMPLETER',
          ] as StatutEncaissement[]
        ).map((s) => (
          <Link
            key={s}
            href={
              annee
                ? `/app/audit-treso?annee=${annee}&statut=${s}` as const
                : (`/app/audit-treso?statut=${s}` as const)
            }
            className={`px-3 py-1 rounded-full border text-xs ${statut === s ? 'border-primary bg-primary-50 text-primary' : 'border-border hover:bg-muted/50'}`}
          >
            {statutEncaissementLabel(s)}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Session</th>
              <th className="text-left px-3 py-2 font-semibold">Apprenant</th>
              <th className="text-left px-3 py-2 font-semibold">OPCO</th>
              <th className="text-right px-3 py-2 font-semibold">Montant</th>
              <th className="text-left px-3 py-2 font-semibold">Statut Qualiopi</th>
              <th className="text-left px-3 py-2 font-semibold">Statut encaissement</th>
              <th className="text-left px-3 py-2 font-semibold">Docs manquants</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  Aucune inscription pour ce filtre.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/app/sessions/${r.sessionId}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {r.sessionCode}
                    </Link>
                    <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                      {r.productTitle}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(r.sessionStart)} → {fmtDate(r.sessionEnd)} · {r.durationHours}h
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">{r.apprenantNom}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-sm">{r.opcoCode ?? '—'}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {r.sponsorOrgLabel}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-right font-medium">
                    {fmtEUR(r.priceHT)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-flex items-center text-xs">
                      {statutOpcoLabel(r.statutOpco)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-flex items-center text-xs">
                      {statutEncaissementLabel(r.statutEncaissement)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.missing.length === 0 ? (
                      <span className="text-xs text-emerald-700">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.missing.slice(0, 5).map((m) => (
                          <span
                            key={m}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700 border border-red-100"
                          >
                            {m}
                          </span>
                        ))}
                        {r.missing.length > 5 && (
                          <span className="text-xs text-muted-foreground">
                            +{r.missing.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
