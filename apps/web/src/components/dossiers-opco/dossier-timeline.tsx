'use client';

/**
 * Timeline 4 étapes pour un dossier OPCO (US-001).
 * Remplace les 4 colonnes ToggleCell par 1 seule cellule visuelle avec
 * 4 cercles connectés (Facture → Validation → Remboursement → Paiement).
 *
 * États :
 *   - DONE (vert plein avec ✓) : booléen true
 *   - ACTIVE (bleu / amber selon SLA) : prochaine étape à faire
 *   - PENDING (gris) : étape future
 *
 * Click sur un cercle → toggle (optimistic, server action).
 * Hover → tooltip avec date de transition + jours écoulés.
 */

import { useState, useTransition } from 'react';
import { Receipt, BadgeCheck, Banknote, Wallet, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toggleDossierBoolean } from '@/server/actions/dossiers-opco';

type Field = 'invoiceSent' | 'opcoApproved' | 'opcoReimbursed' | 'paymentReceived';

interface Step {
  field: Field;
  label: string;
  icon: typeof Receipt;
  /** SLA cible (jours). Au-delà, l'étape "à faire" passe en alerte amber. */
  slaDays?: number;
}

const STEPS: Step[] = [
  { field: 'invoiceSent', label: 'Facture émise', icon: Receipt },
  { field: 'opcoApproved', label: 'Validation OPCO', icon: BadgeCheck, slaDays: 14 },
  { field: 'opcoReimbursed', label: 'Remboursement OPCO', icon: Banknote, slaDays: 30 },
  { field: 'paymentReceived', label: 'Paiement client', icon: Wallet, slaDays: 30 },
];

interface DossierState {
  invoiceSent: boolean;
  opcoApproved: boolean;
  opcoReimbursed: boolean;
  paymentReceived: boolean;
  invoiceSentAt: Date | null;
  opcoApprovedAt: Date | null;
  opcoReimbursedAt: Date | null;
  paymentReceivedAt: Date | null;
}

interface Props {
  participantId: string;
  initial: DossierState;
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function DossierTimeline({ participantId, initial }: Props) {
  const [state, setState] = useState<DossierState>(() => ({
    ...initial,
    invoiceSentAt: initial.invoiceSentAt ? new Date(initial.invoiceSentAt) : null,
    opcoApprovedAt: initial.opcoApprovedAt ? new Date(initial.opcoApprovedAt) : null,
    opcoReimbursedAt: initial.opcoReimbursedAt ? new Date(initial.opcoReimbursedAt) : null,
    paymentReceivedAt: initial.paymentReceivedAt ? new Date(initial.paymentReceivedAt) : null,
  }));
  const [pendingField, setPendingField] = useState<Field | null>(null);
  const [, startTransition] = useTransition();

  function dateOf(f: Field): Date | null {
    switch (f) {
      case 'invoiceSent':
        return state.invoiceSentAt;
      case 'opcoApproved':
        return state.opcoApprovedAt;
      case 'opcoReimbursed':
        return state.opcoReimbursedAt;
      case 'paymentReceived':
        return state.paymentReceivedAt;
    }
  }

  function setDate(f: Field, d: Date | null) {
    setState((s) => {
      switch (f) {
        case 'invoiceSent':
          return { ...s, invoiceSentAt: d };
        case 'opcoApproved':
          return { ...s, opcoApprovedAt: d };
        case 'opcoReimbursed':
          return { ...s, opcoReimbursedAt: d };
        case 'paymentReceived':
          return { ...s, paymentReceivedAt: d };
      }
    });
  }

  function toggle(field: Field) {
    if (pendingField) return;
    const next = !state[field];
    // Optimistic
    setState((s) => ({ ...s, [field]: next }));
    setDate(field, next ? new Date() : null);
    setPendingField(field);
    startTransition(async () => {
      const r = await toggleDossierBoolean(participantId, field, next);
      if (!r.ok) {
        // Rollback
        setState((s) => ({ ...s, [field]: !next }));
        setDate(field, !next ? new Date() : null);
      }
      setPendingField(null);
    });
  }

  // Détermine la prochaine étape "active" : la 1ère non-faite après l'étape
  // faite la plus avancée. Permet d'afficher un visuel "à faire en priorité".
  const firstPendingIdx = STEPS.findIndex((s) => !state[s.field]);
  const lastDoneIdx = (() => {
    let lastIdx = -1;
    for (let i = 0; i < STEPS.length; i++) {
      if (state[STEPS[i]!.field]) lastIdx = i;
    }
    return lastIdx;
  })();

  return (
    <div className="inline-flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const isDone = state[step.field];
        const isActive = idx === firstPendingIdx;
        const isPending = !isDone && !isActive;
        const isFieldPending = pendingField === step.field;
        const Icon = step.icon;

        // SLA : si actif et l'étape précédente est faite depuis plus que slaDays
        const prevDoneDate = idx > 0 ? dateOf(STEPS[idx - 1]!.field) : null;
        const daysFromPrev = prevDoneDate ? daysSince(prevDoneDate) : 0;
        const isAlert = isActive && step.slaDays != null && daysFromPrev > step.slaDays;

        const date = dateOf(step.field);
        const tip = isDone
          ? `${step.label} — fait${date ? ` le ${dateFmt.format(date)} (il y a ${daysSince(date)}j)` : ''}`
          : isActive
            ? `${step.label} — à faire${prevDoneDate ? ` (étape précédente il y a ${daysFromPrev}j${isAlert ? ' ⚠️ SLA dépassé' : ''})` : ''}`
            : `${step.label} — étape suivante`;

        return (
          <div key={step.field} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => toggle(step.field)}
              disabled={pendingField !== null}
              title={tip}
              className={cn(
                'relative inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors',
                isDone && 'bg-emerald-500 text-white hover:bg-emerald-600',
                isActive && !isAlert && 'bg-blue-100 text-blue-700 hover:bg-blue-200 ring-2 ring-blue-300',
                isActive && isAlert && 'bg-amber-100 text-amber-700 hover:bg-amber-200 ring-2 ring-amber-400',
                isPending && 'bg-slate-100 text-slate-400 hover:bg-slate-200',
                pendingField !== null && 'cursor-wait',
              )}
            >
              {isFieldPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isDone ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-3',
                  idx <= lastDoneIdx - 1 ? 'bg-emerald-400' : 'bg-slate-200',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
