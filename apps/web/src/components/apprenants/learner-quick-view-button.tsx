'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Eye, X, Mail, Phone, Briefcase, GraduationCap, Wallet, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLearnerQuickView, type LearnerQuickViewData } from '@/server/actions/persons';
import { formatFunderCode } from '@/lib/funder-codes';

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const ROLE_LABELS: Record<string, string> = {
  EI_SELF: 'EI / Auto-entrepreneur',
  AGENT_COMMERCIAL: 'Agent commercial',
  DIRIGEANT: 'Dirigeant',
  SALARIE: 'Salarié',
  FORMATEUR: 'Formateur',
};

export function LearnerQuickViewButton({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LearnerQuickViewData | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !data) {
      startTransition(async () => {
        const r = await getLearnerQuickView(personId);
        setData(r);
      });
    }
  }

  const completenessTone =
    !data ? 'bg-muted text-muted-foreground'
      : data.completenessPct >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : data.completenessPct >= 60 ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-300 ease-out active:scale-[0.97]"
          aria-label="Vue rapide"
          title="Vue rapide"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-2xl border-l border-border overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 bg-white border-b border-border px-5 py-3 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Vue rapide
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {pending && !data && (
            <div className="p-5 text-sm text-muted-foreground">Chargement…</div>
          )}

          {data && (
            <div className="p-5 space-y-5">
              <div>
                <h2 className="text-xl font-semibold">
                  {data.lastName.toUpperCase()} {data.firstName}
                </h2>
                {data.professionalStatus && (
                  <p className="text-sm text-muted-foreground mt-0.5">{data.professionalStatus}</p>
                )}
                <div className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium mt-3', completenessTone)}>
                  <span className="tabular-nums">{data.completenessPct}% complète</span>
                </div>
              </div>

              <section className="space-y-1.5">
                {data.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={`mailto:${data.email}`} className="hover:text-primary truncate">
                      {data.email}
                    </a>
                  </div>
                )}
                {data.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={`tel:${data.phone}`} className="hover:text-primary">
                      {data.phone}
                    </a>
                  </div>
                )}
              </section>

              {data.legalLinks.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Rattachements ({data.legalLinks.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {data.legalLinks.map((l, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{l.orgName}</div>
                          <div className="text-xs text-muted-foreground">
                            {ROLE_LABELS[l.role] ?? l.role}
                            {l.isPrimary && ' · principal'}
                            {l.opcoCode && ` · ${formatFunderCode(l.opcoCode)}`}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* grid-cols-3 OK même mobile : 3 KPI compacts (chiffre + label court) */}
              <section className="grid grid-cols-3 gap-2">
                <KPI icon={GraduationCap} label="Sessions" value={String(data.totalParticipations)} />
                <KPI icon={Wallet} label="Total CA" value={fmtEUR.format(data.totalAmount)} />
                <KPI icon={Wallet} label={`AGEFICE ${new Date().getFullYear()}`} value={fmtEUR.format(data.ageficeConsumedYear)} />
              </section>

              {data.recentSessions.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    5 dernières inscriptions
                  </h3>
                  <ul className="space-y-2">
                    {data.recentSessions.map((s) => (
                      <li key={s.id} className="text-sm border border-border rounded-lg p-2.5">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-mono text-[11px] text-muted-foreground">{s.code}</span>
                          <span className="text-xs tabular-nums">{fmtEUR.format(s.priceHT)}</span>
                        </div>
                        <div className="truncate font-medium">{s.name ?? '(sans nom)'}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(s.startDate).toLocaleDateString('fr-FR')} · {s.sponsorName}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="pt-2 border-t border-border">
                <Link
                  href={`/app/apprenants/${data.id}` as any}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-700"
                  onClick={() => setOpen(false)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir la fiche complète
                </Link>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function KPI({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
