/**
 * Page /admin/queues (Sprint 2 — Observabilité).
 *
 * Monitoring custom des queues BullMQ — alternative légère à Bull Board
 * qui n'a pas d'adapter Next.js App Router propre. On affiche pour
 * chaque queue :
 *   - Compteurs (waiting / active / completed / failed / delayed)
 *   - 20 derniers jobs (avec leur état, durée, error si failed)
 *   - Bouton pour retry/clean failed (admin only)
 *
 * RBAC : ADMIN uniquement. Garde côté server (redirect login si pas d'auth,
 * 403 page si pas admin).
 */

import { notFound, redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { hasRole } from '@/lib/rbac';
import { getClosureQueue, CLOSURE_QUEUE_NAME } from '@/lib/closure/queue';
import { getInvoiceReminderQueue, INVOICE_REMINDER_QUEUE_NAME } from '@/lib/invoice-reminders/queue';
import type { Queue, Job } from 'bullmq';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Loader2, PauseCircle, Server,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface QueueSnapshot {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  recent: Array<{
    id: string;
    name: string;
    state: string;
    timestamp: number | undefined;
    finishedOn: number | undefined;
    processedOn: number | undefined;
    durationMs: number | null;
    failedReason: string | null;
    attemptsMade: number;
  }>;
}

async function snapshotQueue(queue: Queue, name: string): Promise<QueueSnapshot> {
  const counts = await queue.getJobCounts(
    'waiting', 'active', 'completed', 'failed', 'delayed', 'paused',
  );
  // 20 derniers jobs tous statuts confondus (ordre BullMQ : récent en 1er).
  const jobs = await queue.getJobs(
    ['waiting', 'active', 'completed', 'failed', 'delayed'],
    0,
    19,
    false,
  );

  const recent = await Promise.all(
    jobs.map(async (j: Job) => {
      const state = await j.getState();
      const durationMs =
        j.processedOn && j.finishedOn ? j.finishedOn - j.processedOn : null;
      return {
        id: j.id ?? '?',
        name: j.name,
        state,
        timestamp: j.timestamp,
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
        durationMs,
        failedReason: j.failedReason ?? null,
        attemptsMade: j.attemptsMade,
      };
    }),
  );

  return {
    name,
    counts: {
      waiting: Number(counts.waiting ?? 0),
      active: Number(counts.active ?? 0),
      completed: Number(counts.completed ?? 0),
      failed: Number(counts.failed ?? 0),
      delayed: Number(counts.delayed ?? 0),
      paused: Number(counts.paused ?? 0),
    },
    recent,
  };
}

function formatRelative(ts: number | undefined): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
}

function StateBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
    waiting:   { label: 'En attente', cls: 'bg-slate-100 text-slate-700',           icon: Clock },
    active:    { label: 'En cours',   cls: 'bg-blue-100 text-blue-700',             icon: Loader2 },
    completed: { label: 'Terminé',    cls: 'bg-emerald-100 text-emerald-700',       icon: CheckCircle2 },
    failed:    { label: 'Échoué',     cls: 'bg-rose-100 text-rose-700',             icon: AlertTriangle },
    delayed:   { label: 'Différé',    cls: 'bg-amber-100 text-amber-700',           icon: Clock },
    paused:    { label: 'En pause',   cls: 'bg-slate-200 text-slate-700',           icon: PauseCircle },
  };
  const c = cfg[state] ?? cfg.waiting!;
  const Icon = c.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${c.cls}`}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'blue' | 'green' | 'red' | 'amber' }) {
  const cls = {
    neutral: 'bg-white ring-slate-200',
    blue:    'bg-blue-50 ring-blue-200',
    green:   'bg-emerald-50 ring-emerald-200',
    red:     'bg-rose-50 ring-rose-200',
    amber:   'bg-amber-50 ring-amber-200',
  }[tone];
  return (
    <div className={`rounded-xl ring-1 p-4 ${cls}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default async function QueuesPage() {
  const { user } = await validateRequest();
  if (!user) redirect('/login');
  if (!hasRole(user, ['ADMIN'])) notFound();

  const [closure, reminders] = await Promise.all([
    snapshotQueue(getClosureQueue(), CLOSURE_QUEUE_NAME),
    snapshotQueue(getInvoiceReminderQueue(), INVOICE_REMINDER_QUEUE_NAME),
  ]);

  const snapshots = [closure, reminders];

  return (
    <div className="space-y-8 p-6">
      <header className="flex items-center gap-3">
        <Server className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Queues BullMQ</h1>
          <p className="text-sm text-muted-foreground">
            Monitoring temps réel des jobs (closure docs, relances factures). Actualise la page pour rafraîchir.
          </p>
        </div>
      </header>

      {snapshots.map((q) => (
        <section key={q.name} className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">{q.name}</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Counter label="Waiting"   value={q.counts.waiting}   tone="neutral" />
            <Counter label="Active"    value={q.counts.active}    tone="blue" />
            <Counter label="Completed" value={q.counts.completed} tone="green" />
            <Counter label="Failed"    value={q.counts.failed}    tone="red" />
            <Counter label="Delayed"   value={q.counts.delayed}   tone="amber" />
            <Counter label="Paused"    value={q.counts.paused}    tone="neutral" />
          </div>

          <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Job</th>
                  <th className="text-left p-3">État</th>
                  <th className="text-left p-3">Soumis</th>
                  <th className="text-left p-3">Durée</th>
                  <th className="text-left p-3">Tentatives</th>
                  <th className="text-left p-3">Erreur</th>
                </tr>
              </thead>
              <tbody>
                {q.recent.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">
                      Aucun job récent dans cette queue.
                    </td>
                  </tr>
                )}
                {q.recent.map((j) => (
                  <tr key={j.id} className="border-t border-slate-100">
                    <td className="p-3 font-mono text-xs">
                      <span className="text-muted-foreground">#{j.id.slice(0, 8)}</span>{' '}
                      <span>{j.name}</span>
                    </td>
                    <td className="p-3"><StateBadge state={j.state} /></td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatRelative(j.timestamp)}
                    </td>
                    <td className="p-3 text-xs tabular-nums">
                      {j.durationMs != null ? `${j.durationMs} ms` : '—'}
                    </td>
                    <td className="p-3 text-xs tabular-nums">{j.attemptsMade}</td>
                    <td className="p-3 text-xs text-rose-700 max-w-md truncate">
                      {j.failedReason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
