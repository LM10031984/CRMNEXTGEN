'use client';

/**
 * Phase 15 Lot 2 (15-02) — Onglet « Avant la formation ».
 *
 * Réembarque les actions UNIQUES de l'ancien `<DocDockDrawer>` (seul
 * consommateur de `dispatchGenerateMissing`/`dispatchGenerateDoc`, vérifié
 * RESEARCH Q2), sans le drawer :
 *   - CTA « Tout générer » → `dispatchGenerateMissing` (manquants pré-formation)
 *   - une ligne LISIBLE par doc/stagiaire (CONVENTION · CONVOCATION · AGEFICE ·
 *     ANALYSE_BESOIN · ASSIDUITE_AGEFICE) → `dispatchGenerateDoc({ docType, participantId })`.
 *     « Régénérer » = même action avec `force: true`.
 *
 * Le MOTEUR (server actions) est CONSERVÉ ; on ne déplace que l'UI.
 *
 * Source unique : l'état de chaque doc (`generated`/`pending`/`missing`) est
 * lu depuis les `DocDockItem[]` passés en props par `page.tsx` (dérivés de
 * `buildDocDockItems`). AUCUN recompute local.
 *
 * Lisibilité (LOCKED CONTEXT) : une ligne par doc, statut + action claire ;
 * fini les cartes 4-colonnes en `text-[11px]`.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, ExternalLink, Loader2, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  dispatchGenerateDoc,
  dispatchGenerateMissing,
} from '@/server/actions/dispatch-generate-doc';
import { docCompletion } from '@/lib/sessions/doc-completion';
import { LearnerPhaseActions } from '../learner-phase-actions';
import type { DocDockItem } from '@/lib/sessions/dispatch-doc-types';
import {
  SignedDocDropZone,
  type DropZoneParticipant,
} from '../qualiopi-matrix/signed-doc-drop-zone';

interface Props {
  sessionId: string;
  /** Items pré-formation dérivés de `buildDocDockItems` (source unique). */
  items: DocDockItem[];
  /** RBAC : ADMIN/MANAGER/COMMERCIAL peuvent générer. */
  canGenerate: boolean;
  /**
   * Lot A signature (spec 2026-09-04 §5 A) — stagiaires, pour la zone de dépôt
   * repliée : un doc pré-formation signé à la main (convention rendue papier,
   * AGEFICE signé au stylo) revient ici en attendant la signature électronique
   * (lot C).
   */
  dropZoneParticipants?: DropZoneParticipant[];
}

/** Docs pré-formation qui peuvent revenir signés à la main. */
const AVANT_SIGNABLE_DOC_TYPES = [
  { value: 'CONVENTION', label: 'Convention' },
  { value: 'AGEFICE', label: 'Dossier AGEFICE' },
  { value: 'CONVOCATION', label: 'Convocation' },
];

/** Ordre d'affichage des docs partagés produit/session en haut. */
const SHARED_ORDER: string[] = ['PROGRAMME', 'DEROULE', 'CHECKLIST'];

export function TabAvant({ sessionId, items, canGenerate, dropZoneParticipants }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());

  const completion = docCompletion(items);

  // Partagés (produit/session) puis docs par stagiaire, regroupés par apprenant.
  const sharedItems = items
    .filter((it) => it.section === 'shared')
    .sort((a, b) => SHARED_ORDER.indexOf(a.docType) - SHARED_ORDER.indexOf(b.docType));

  // Groupé par `participantId` et non par nom : deux homonymes dans la même
  // session (ça arrive dans une fratrie d'agents commerciaux) partageaient
  // sinon un seul bloc — et un seul bouton de téléchargement, qui aurait servi
  // le dossier de l'un pour l'autre.
  const participantGroups: Array<{
    participantId?: string;
    name: string;
    items: DocDockItem[];
  }> = (() => {
    const byParticipant = new Map<string, { participantId?: string; name: string; items: DocDockItem[] }>();
    for (const it of items) {
      if (it.section === 'shared') continue;
      const key = it.participantId ?? it.participantName ?? '—';
      const group = byParticipant.get(key) ?? {
        participantId: it.participantId,
        name: it.participantName ?? '—',
        items: [],
      };
      group.items.push(it);
      byParticipant.set(key, group);
    }
    return Array.from(byParticipant.values());
  })();

  function setBusy(key: string, on: boolean) {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handleGenerate(item: DocDockItem, force = false) {
    setBusy(item.key, true);
    startTransition(async () => {
      try {
        const r = await dispatchGenerateDoc({
          sessionId,
          docType: item.docType,
          participantId: item.participantId,
          force,
        });
        if (r.ok) {
          toast.success(
            r.enqueued
              ? `${item.label} — IA en cours`
              : force
                ? `${item.label} régénéré`
                : `${item.label} généré`,
          );
          router.refresh();
        } else {
          toast.error(r.error ?? `Erreur ${item.label}`);
        }
      } finally {
        setBusy(item.key, false);
      }
    });
  }

  function handleGenerateAll(scope: DocDockItem[] = items) {
    const missing = scope.filter((it) => it.state === 'missing');
    if (missing.length === 0) return;
    setBusyKeys((prev) => {
      const next = new Set(prev);
      for (const it of missing) next.add(it.key);
      return next;
    });
    startTransition(async () => {
      try {
        const r = await dispatchGenerateMissing({
          sessionId,
          items: missing.map((it) => ({
            docType: it.docType,
            participantId: it.participantId,
          })),
        });
        if (r.ok) {
          toast.success(
            `${r.success} document${r.success > 1 ? 's' : ''} généré${r.success > 1 ? 's' : ''}`,
          );
        } else {
          toast.warning(
            `${r.success}/${r.total} OK · ${r.failed} échec${r.failed > 1 ? 's' : ''}`,
          );
        }
        router.refresh();
      } finally {
        setBusyKeys(new Set());
      }
    });
  }

  return (
    <div className="space-y-6 pt-4">
      {/* En-tête onglet : récap source unique + CTA « Tout générer ». */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <div>
            <h2 className="font-semibold text-base">Documents avant la formation</h2>
            <p className="text-sm text-muted-foreground">
              Convention · Convocation · AGEFICE · Analyse de besoins · Assiduité AGEFICE
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <Check className="h-3 w-3" /> {completion.ready}/{completion.total} prêts
            </span>
            {completion.missing > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                {completion.missing} manquant{completion.missing > 1 ? 's' : ''}
              </span>
            )}
            {canGenerate && completion.missing > 0 && (
              <button
                type="button"
                onClick={() => handleGenerateAll()}
                disabled={pending}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 disabled:cursor-wait transition-colors shadow-sm"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Tout générer ({completion.missing})
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Partagés (produit / session) */}
      {sharedItems.length > 0 && (
        <DocLineSection title="Partagés (produit / session)">
          {sharedItems.map((it) => (
            <DocLine
              key={it.key}
              item={it}
              canGenerate={canGenerate}
              busy={busyKeys.has(it.key)}
              onGenerate={() => handleGenerate(it, false)}
              onRegenerate={() => handleGenerate(it, true)}
            />
          ))}
        </DocLineSection>
      )}

      {/* Par stagiaire — la ligne du nom porte SES actions de phase
          (Laurent 2026-09-10 : « ici un bouton par apprenant »). */}
      {participantGroups.map((group) => (
        <DocLineSection
          key={group.participantId ?? group.name}
          title={group.name}
          actions={
            group.participantId ? (
              <LearnerPhaseActions
                sessionId={sessionId}
                participantId={group.participantId}
                participantName={group.name}
                phase="avant"
                readyCount={group.items.filter((it) => it.state === 'generated').length}
                missingCount={group.items.filter((it) => it.state === 'missing').length}
                canGenerate={canGenerate}
                onGenerateAll={() => handleGenerateAll(group.items)}
                busy={group.items.some((it) => busyKeys.has(it.key))}
              />
            ) : null
          }
        >
          {group.items.map((it) => (
            <DocLine
              key={it.key}
              item={it}
              canGenerate={canGenerate}
              busy={busyKeys.has(it.key)}
              onGenerate={() => handleGenerate(it, false)}
              onRegenerate={() => handleGenerate(it, true)}
            />
          ))}
        </DocLineSection>
      ))}

      {/* Lot A signature — dépôt d'un doc pré-formation signé à la main.
          Repliée par défaut : le cas courant avant la session reste la
          génération, pas le dépôt d'un scan. */}
      {canGenerate && dropZoneParticipants && dropZoneParticipants.length > 0 && (
        <SignedDocDropZone
          sessionId={sessionId}
          docType="CONVENTION"
          docLabel="documents"
          participants={dropZoneParticipants}
          defaultOpen={false}
          docTypeOptions={AVANT_SIGNABLE_DOC_TYPES}
        />
      )}

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Aucun document pré-formation à générer (inscris d'abord des apprenants).
        </p>
      )}
    </div>
  );
}

/* ── Sous-composants ──────────────────────────────────────────────────── */

function DocLineSection({
  title,
  actions,
  children,
}: {
  title: string;
  /** Actions de la ligne du nom (téléchargement / génération par apprenant). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {actions}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function DocLine({
  item,
  canGenerate,
  busy,
  onGenerate,
  onRegenerate,
}: {
  item: DocDockItem;
  canGenerate: boolean;
  busy: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  const stateNode =
    item.state === 'pending' || busy ? (
      <Loader2 className="h-4 w-4 text-sky-500 animate-spin shrink-0" />
    ) : item.state === 'generated' ? (
      <span className="h-4 w-4 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shrink-0">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    ) : (
      <span
        className="h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-50 shrink-0"
        aria-hidden="true"
      />
    );

  return (
    <li className="flex items-center gap-3 py-2.5">
      {stateNode}
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.label}</span>

      {item.state === 'generated' && item.pdfUrl ? (
        <div className="inline-flex items-center gap-1 shrink-0">
          <a
            href={item.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-primary hover:bg-primary-50 transition-colors"
          >
            Ouvrir <ExternalLink className="h-3 w-3" />
          </a>
          {/* « Ouvrir » consulte, « Télécharger » enregistre — et seul le second
              porte `?dl=1`, donc un nom parlant. Sans ce lien, enregistrer depuis
              la visionneuse du navigateur redonnait le nom technique de l'objet
              stocké (« Rousseau Stéphane 24-96-3C95 », Laurent 2026-09-08). */}
          <a
            href={`${item.pdfUrl}?dl=1`}
            aria-label={`Télécharger ${item.label}`}
            title="Télécharger avec un nom de fichier lisible"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Télécharger
          </a>
          {canGenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={busy}
              // Nom accessible = label du doc → ciblé par les tests par docType.
              aria-label={`Régénérer ${item.label}`}
              title="Régénérer ce document (le tarif ou le contenu a changé)"
              // LIBELLÉ VISIBLE, pas une icône seule (retour Laurent 02/09 :
              // « j'ai pas de bouton pour regénérer le programme »). L'action
              // existait, mais un carré de 32 px sans texte à côté d'un lien
              // « Ouvrir » ne se voit pas — et c'est le seul moyen de refaire
              // un document après une correction de tarif ou de fiche.
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Régénérer
            </button>
          )}
        </div>
      ) : item.state === 'pending' ? (
        <span className="text-xs text-sky-700 font-medium shrink-0">IA…</span>
      ) : canGenerate ? (
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          // Nom accessible = label du doc (« Générer Convention — … ») → les
          // tests `getByRole('button', { name: /convention/i })` matchent ici.
          aria-label={`Générer ${item.label}`}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-semibold shrink-0 transition-colors shadow-sm',
            'bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 disabled:cursor-wait',
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Générer
        </button>
      ) : (
        <span className="text-xs text-muted-foreground shrink-0">À générer</span>
      )}
    </li>
  );
}
