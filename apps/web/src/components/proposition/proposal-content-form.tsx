'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarSync, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { ProposalContent } from '@qualiof/shared';

import { rebuildPlanningFromAxes } from '@/lib/proposition/builder';
import { updateProposalContent } from '@/server/actions/propositions';

/**
 * L'éditeur du contenu narratif de la proposition.
 *
 * Ce que l'écran impose, parce que le document l'impose : chaque axe doit dire
 * à quel constat il répond. C'est la promesse d'ultra-personnalisation — un axe
 * sans « pourquoi » est du catalogue, et le schéma le refuse.
 *
 * Enregistrer remet la relecture à zéro : on ne relit pas un texte qu'on vient
 * de changer.
 */
export function ProposalContentForm({
  proposalId,
  initial,
  readOnly,
  catalogueNotices,
  composedWarnings,
  participantCount,
}: {
  proposalId: string;
  initial: ProposalContent;
  readOnly: boolean;
  catalogueNotices: string[];
  /** Ce qui manque au programme Qualiopi du parcours composé (lot I-2). */
  composedWarnings: string[];
  participantCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [content, setContent] = useState<ProposalContent>(initial);

  const patch = (p: Partial<ProposalContent>) => setContent((c) => ({ ...c, ...p }));

  const save = () => {
    start(async () => {
      const r = await updateProposalContent({ proposalId, content });
      if (r.ok) {
        toast.success('Contenu enregistré — la relecture est à refaire');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };

  const lines = (values: string[]) => values.join('\n');
  const fromLines = (raw: string) =>
    raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  return (
    <section className="space-y-5 rounded-lg border border-border p-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Le document</h2>
        {!readOnly && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        )}
      </header>

      {catalogueNotices.length > 0 && (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs leading-relaxed dark:border-sky-800 dark:bg-sky-950/40">
          <p className="mb-1 font-semibold">Ce que le catalogue permet — et ce qu’il ne permet pas</p>
          <ul className="list-disc space-y-1 pl-4">
            {catalogueNotices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {composedWarnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-1 font-semibold">
            Le programme Qualiopi de ce parcours n’est pas encore remettable
          </p>
          <ul className="list-disc space-y-1 pl-4">
            {composedWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Titre de couverture">
          <input
            className={INPUT}
            value={content.subtitle}
            disabled={readOnly}
            onChange={(e) => patch({ subtitle: e.target.value })}
          />
        </Field>
        <Field label="À l’attention de">
          <input
            className={INPUT}
            value={content.recipientLabel}
            disabled={readOnly}
            placeholder="Madame la gérante et son équipe"
            onChange={(e) => patch({ recipientLabel: e.target.value })}
          />
        </Field>
        <Field label="Votre interlocuteur">
          <input
            className={INPUT}
            value={content.contactLabel}
            disabled={readOnly}
            onChange={(e) => patch({ contactLabel: e.target.value })}
          />
        </Field>
      </div>

      <Field
        label="Ce que nous avons entendu"
        hint="Une puce par ligne. Chaque puce doit venir d’une réponse ou d’un ratio du diagnostic — jamais du générique."
      >
        <textarea
          className={`${INPUT} min-h-[120px] font-normal`}
          value={lines(content.heard)}
          disabled={readOnly}
          onChange={(e) => patch({ heard: fromLines(e.target.value) })}
        />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Les axes du parcours
          </h3>
          {!readOnly && (
            <button
              type="button"
              onClick={() =>
                patch({
                  axes: [
                    ...content.axes,
                    {
                      id: `axe-${content.axes.length + 1}-${Date.now()}`,
                      label: `Axe ${content.axes.length + 1}`,
                      title: '',
                      productId: null,
                      productCode: null,
                      description: '',
                      why: '',
                      halfDays: 0,
                      periodLabel: '',
                      matchSource: 'manuel', modules: [],
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter un axe
            </button>
          )}
        </div>

        {content.axes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Aucun axe. Un point de douleur métier reçoit un programme métier : composez le parcours
            depuis le catalogue actif.
          </p>
        )}

        {content.axes.map((axe, i) => (
          <div key={axe.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${INPUT} w-24`}
                value={axe.label}
                disabled={readOnly}
                onChange={(e) => updateAxis(i, { label: e.target.value })}
              />
              <input
                className={`${INPUT} min-w-0 flex-1`}
                value={axe.title}
                disabled={readOnly}
                placeholder="Intitulé du programme"
                onChange={(e) => updateAxis(i, { title: e.target.value })}
              />
              <input
                type="number"
                min={0}
                className={`${INPUT} w-24`}
                value={axe.halfDays}
                disabled={readOnly}
                onChange={(e) => updateAxis(i, { halfDays: Number(e.target.value) })}
                aria-label="Demi-journées"
              />
              <input
                className={`${INPUT} w-28`}
                value={axe.periodLabel}
                disabled={readOnly}
                placeholder="octobre"
                onChange={(e) => updateAxis(i, { periodLabel: e.target.value })}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => patch({ axes: content.axes.filter((_, j) => j !== i) })}
                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={`Retirer ${axe.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <textarea
              className={`${INPUT} min-h-[52px]`}
              value={axe.why}
              disabled={readOnly}
              placeholder="Pourquoi ce module — le constat du diagnostic auquel il répond"
              onChange={(e) => updateAxis(i, { why: e.target.value })}
            />
            {axe.modules.length > 0 && (
              <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Modules composés — et ce qui les a fait entrer
                </p>
                {axe.modules.map((m) => (
                  <div key={m.moduleId} className="border-l-2 border-border pl-2.5 text-[11px]">
                    <p className="font-medium text-foreground">{m.title}</p>
                    <p className="text-muted-foreground">
                      {m.sourceTitle ? `issu de ${m.sourceTitle}` : 'origine inconnue'}
                      {m.durationMin > 0 ? ` · ${m.durationMin} min sur site` : ''}
                      {m.confidence === 'faible' ? ' · rapprochement à vérifier' : ''}
                    </p>
                    {m.needLabel && <p className="text-muted-foreground">Besoin : {m.needLabel}</p>}
                    {m.quotes.length > 0 && (
                      <p className="italic text-muted-foreground">« {m.quotes[0]} »</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {axe.modules.length > 0
                ? `${axe.modules.length} module(s), ${new Set(axe.modules.map((m) => m.sourceCode)).size} programme(s) source · `
                : axe.productCode
                  ? `Programme ${axe.productCode} · `
                  : ''}
              rapprochement {axe.matchSource === 'signaux' ? 'par signaux du catalogue' : axe.matchSource === 'lexique' ? 'par lexique (heuristique)' : 'saisi à la main'}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Planning proposé
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() =>
              patch({
                planning: rebuildPlanningFromAxes(content.axes, content.planning, participantCount),
              })
            }
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            title="Le planning et les axes décrivent le même parcours. Recomposer garde les dates déjà arrêtées."
          >
            <CalendarSync className="h-3.5 w-3.5" />
            Recomposer depuis les axes
          </button>
        )}
      </div>
      <Field
        label=""
        hint="Une ligne par session : date, intitulé, participants — séparés par « | »."
      >
        <textarea
          className={`${INPUT} min-h-[90px]`}
          value={content.planning
            .map((p) => [p.dateLabel, p.sessionLabel, p.participantsLabel].join(' | '))
            .join('\n')}
          disabled={readOnly}
          onChange={(e) =>
            patch({
              planning: fromLines(e.target.value).map((row, i) => {
                const [dateLabel = '', sessionLabel = '', participantsLabel = ''] = row
                  .split('|')
                  .map((s) => s.trim());
                return {
                  id: `planning-${i + 1}`,
                  dateLabel: dateLabel || 'À arrêter',
                  sessionLabel: sessionLabel || '—',
                  participantsLabel,
                };
              }),
            })
          }
        />
      </Field>

      <Field label="Note sur les pièces administratives">
        <textarea
          className={`${INPUT} min-h-[60px]`}
          value={content.piecesDeadlineNote}
          disabled={readOnly}
          onChange={(e) => patch({ piecesDeadlineNote: e.target.value })}
        />
      </Field>

      <Field label="Points clés" hint="Une par ligne — encadré or de la proposition.">
        <textarea
          className={`${INPUT} min-h-[90px]`}
          value={lines(content.keyPoints)}
          disabled={readOnly}
          onChange={(e) => patch({ keyPoints: fromLines(e.target.value) })}
        />
      </Field>

      <Field
        label="Prochaines étapes"
        hint="Une ligne par étape : action | qui | échéance."
      >
        <textarea
          className={`${INPUT} min-h-[90px]`}
          value={content.nextSteps.map((s) => [s.action, s.who, s.when].join(' | ')).join('\n')}
          disabled={readOnly}
          onChange={(e) =>
            patch({
              nextSteps: fromLines(e.target.value).map((row, i) => {
                const [action = '', who = '', when = ''] = row.split('|').map((s) => s.trim());
                return { id: `etape-${i + 1}`, action: action || '—', who, when };
              }),
            })
          }
        />
      </Field>

      <Field label="Mention légale" hint="Jamais retirable — elle protège l’organisme et le client.">
        <textarea className={`${INPUT} min-h-[70px] bg-muted/50`} value={content.legalMention} readOnly />
      </Field>
    </section>
  );

  function updateAxis(index: number, p: Partial<ProposalContent['axes'][number]>) {
    setContent((c) => ({
      ...c,
      axes: c.axes.map((a, i) => (i === index ? { ...a, ...p } : a)),
    }));
  }
}

const INPUT =
  'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}
