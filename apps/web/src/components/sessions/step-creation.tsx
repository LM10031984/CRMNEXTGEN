import type { ReactNode } from 'react';
import { Calendar, Euro, ExternalLink, FileText, MapPin, Package, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TimelineStep, type StepState } from './timeline-step';

interface Props {
  state: StepState;
  productId: string | null;
  productLabel: string | null;
  productCode: string | null;
  /** Brouillon IA du programme (au niveau PRODUIT) — sert un badge lecture seule + lien produit. */
  productAiDraftedAt: Date | null;
  productProgrammePdfId: string | null;
  durationHours: number | null;
  startDate: Date | null;
  endDate: Date | null;
  locationLabel: string | null;
  primaryTrainerName: string | null;
  coTrainerCount: number;
  participantsCount: number;
  pricePerLearner: number | null;
  /** Actions à afficher en footer (Modifier session, Ajouter participant…) */
  actions?: ReactNode;
  /** Expansion initiale (dérivée de stagesState[1] === 'active'). */
  expanded?: boolean;
  /** Message bloqueur remonté par sessionStage (si current=1 + blocked). */
  blockerMessage?: string;
}

const fmtEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function fmtDateRange(s: Date | null, e: Date | null): string {
  if (!s || !e) return '—';
  const o: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const a = s.toLocaleDateString('fr-FR', o);
  const b = e.toLocaleDateString('fr-FR', o);
  return a === b ? a : `${a} → ${b}`;
}

export function StepCreation(props: Props) {
  const {
    state,
    productId,
    productLabel,
    productCode,
    productAiDraftedAt,
    productProgrammePdfId,
    durationHours,
    startDate,
    endDate,
    locationLabel,
    primaryTrainerName,
    coTrainerCount,
    participantsCount,
    pricePerLearner,
    actions,
    expanded,
    blockerMessage,
  } = props;

  const totalHT = pricePerLearner ? pricePerLearner * participantsCount : 0;

  return (
    <TimelineStep
      number={1}
      title="Création de la session"
      state={state}
      expanded={expanded}
      blockerMessage={blockerMessage}
      caption="Wizard session : produit, lieu, dates, formateur principal, inscriptions"
      badge={
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
          Validée
        </span>
      }
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Row icon={Package} label="Produit">
          {productLabel ? (
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{productLabel}</span>
              {productCode && <Badge variant="muted" className="font-mono">{productCode}</Badge>}
              {durationHours && (
                <span className="text-xs text-muted-foreground">
                  {durationHours}h · {Math.ceil(durationHours / 8)}j
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground italic">—</span>
          )}
        </Row>
        <Row icon={Calendar} label="Dates">
          <span className="tabular-nums">{fmtDateRange(startDate, endDate)}</span>
        </Row>
        <Row icon={MapPin} label="Lieu">
          {locationLabel ? (
            <span>{locationLabel}</span>
          ) : (
            <span className="text-muted-foreground italic">Distanciel ou à définir</span>
          )}
        </Row>
        <Row icon={Users} label="Formateur principal">
          {primaryTrainerName ? (
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium">{primaryTrainerName}</span>
              {coTrainerCount > 0 && (
                <Badge variant="muted" className="text-[10px]">
                  +{coTrainerCount} co-formateur{coTrainerCount > 1 ? 's' : ''}
                </Badge>
              )}
            </span>
          ) : (
            <span className="text-amber-700 italic">Aucun formateur principal défini</span>
          )}
        </Row>
        <Row icon={Users} label="Inscrits">
          {participantsCount > 0 ? (
            <span className="font-medium">{participantsCount} apprenant{participantsCount > 1 ? 's' : ''}</span>
          ) : (
            <span className="text-amber-700 italic">Aucun inscrit</span>
          )}
        </Row>
        <Row icon={Euro} label="Tarif">
          {pricePerLearner ? (
            <span className="tabular-nums">
              {fmtEUR.format(pricePerLearner)} / stagiaire
              {participantsCount > 0 && (
                <span className="text-xs text-muted-foreground ml-1.5">
                  · CA {fmtEUR.format(totalHT)} HT
                </span>
              )}
            </span>
          ) : (
            <span className="text-amber-700 italic">À définir</span>
          )}
        </Row>
      </dl>

      {/* Programme produit en 1 clic — accessible directement depuis Step 1.
          Bug Laurent 2026-06-04 : "le programme c'est ok mais je devrai
          l'avoir en haut de la session". */}
      {productId && (
        <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50/30 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 h-9 w-9 rounded-lg bg-white text-primary inline-flex items-center justify-center border border-primary-100">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">Programme de la formation</span>
                {productAiDraftedAt && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                    Brouillon IA — à valider sur la fiche produit
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Source Qualiopi · Ind 1 · 6 — partagé pour toutes les sessions du produit
                {productAiDraftedAt && ' · validation IA au niveau produit'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {productProgrammePdfId ? (
              <a
                href={`/api/documents/${productProgrammePdfId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm"
              >
                Ouvrir le PDF
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-amber-300 bg-white text-amber-800 text-xs font-medium">
                À générer (étape 2)
              </span>
            )}
            <a
              href={`/app/produits/${productId}?tab=programme`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border bg-white text-foreground/80 text-xs font-medium hover:bg-muted/40 transition-colors"
              title="Éditer le programme sur la fiche produit"
            >
              Éditer
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {/* La validation du programme IA vit désormais au niveau PRODUIT
          (/app/produits/{id}?tab=programme). Sur la session : programme en
          lecture seule + lien produit (bloc ci-dessus), plus d'action de
          validation ici (Phase 15 Lot 4 — 1 doc = 1 maison). */}

      {/* Actions inline — Modifier la session / Ajouter un apprenant.
          On ne sait jamais — Laurent 2026-06-04. */}
      {actions && (
        <div className="mt-4 pt-4 border-t border-border/60 flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </TimelineStep>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-sm mt-0.5">{children}</dd>
      </div>
    </div>
  );
}
