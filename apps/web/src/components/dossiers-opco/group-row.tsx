'use client';

/**
 * Ligne header d'un groupe (sponsor + session) en mode groupé.
 * Cliquer sur la ligne déplie les sous-rangs (qui sont rendus côté
 * parent dans des <tr> séparés conditionnels au state expanded).
 *
 * On utilise un ID HTML unique pour signaler l'état expand au parent
 * via un Provider context partagé avec les child rows. Plus simple :
 * on garde l'expand state interne à chaque GroupRow et on rend les
 * children directement à l'intérieur d'un fragment via render-prop.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { CreateSponsorInvoiceButton } from '@/components/invoices/create-sponsor-invoice-button';

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export interface GroupAggregate {
  sessionId: string;
  sessionStartDate: Date;
  sessionName: string;
  sponsorOrgId: string;
  sponsorName: string;
  sponsorOpcoCode: string | null;
  participantCount: number;
  totalHT: number;
  allInvoiced: boolean;
  allReimbursed: boolean;
  allPaid: boolean;
}

export function GroupHeaderRow({
  group,
  expanded,
  onToggle,
  colSpan,
}: {
  group: GroupAggregate;
  expanded: boolean;
  onToggle: () => void;
  colSpan: number;
}) {
  return (
    <tr
      className="border-b border-border bg-primary-50/40 hover:bg-primary-50/70 cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <td colSpan={colSpan} className="px-3 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-white"
            aria-label={expanded ? 'Réduire' : 'Développer'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <Users className="h-4 w-4 text-primary shrink-0" />

          <div className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {fmtDate.format(group.sessionStartDate)}
          </div>

          <div className="font-medium text-sm flex-1 min-w-[180px]">
            {group.sponsorName}
            <span className="text-xs text-muted-foreground ml-2">
              · {group.participantCount} apprenant{group.participantCount > 1 ? 's' : ''}
            </span>
          </div>

          <div className="text-xs text-muted-foreground line-clamp-1 max-w-[320px]">
            {group.sessionName}
          </div>

          <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
            {fmtEUR.format(group.totalHT)}
          </div>

          {group.sponsorOpcoCode && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-border text-[10px] font-medium uppercase">
              {group.sponsorOpcoCode}
            </span>
          )}

          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            <CreateSponsorInvoiceButton
              sessionId={group.sessionId}
              sponsorOrgId={group.sponsorOrgId}
              sponsorName={group.sponsorName}
              participantCount={group.participantCount}
              totalHT={group.totalHT}
              allInvoiced={group.allInvoiced}
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * Composant client qui gère l'état expand pour 1 groupe et rend
 * conditionnellement ses children.
 */
export function GroupRowExpander({
  group,
  defaultExpanded = false,
  colSpan,
  children,
}: {
  group: GroupAggregate;
  defaultExpanded?: boolean;
  colSpan: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <>
      <GroupHeaderRow
        group={group}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        colSpan={colSpan}
      />
      {expanded && children}
    </>
  );
}
