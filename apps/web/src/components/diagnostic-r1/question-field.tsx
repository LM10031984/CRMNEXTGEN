'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import type { DiagnosticQuestion } from '@qualiof/shared/diagnostic';

/**
 * Le champ de saisie d'une question, choisi d'après le type déclaré au
 * référentiel. Un composant, tous les types — parce qu'une page de chapitre en
 * aligne dix et que dix composants différents donneraient dix comportements
 * clavier différents.
 *
 * Deux partis pris de terrain :
 *   • le hint du référentiel est AFFICHÉ, pas caché derrière une icône : c'est
 *     le script oral du commercial, il doit être lisible pendant qu'il parle ;
 *   • Entrée passe au champ suivant. On saisit au clavier, en face du client,
 *     sans chercher la souris.
 */

export interface QuestionFieldProps {
  question: DiagnosticQuestion;
  value: unknown;
  isSkipped: boolean;
  disabled?: boolean;
  onChange: (value: unknown) => void;
  onSkipToggle: (skipped: boolean) => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

function focusNext(el: HTMLElement) {
  const focusables = Array.from(
    document.querySelectorAll<HTMLElement>('[data-diag-field="true"]'),
  ).filter((n) => !n.hasAttribute('disabled'));
  const i = focusables.indexOf(el);
  if (i >= 0 && i < focusables.length - 1) focusables[i + 1]!.focus();
}

function onEnterAdvance(e: React.KeyboardEvent<HTMLElement>) {
  // Sur un textarea, Entrée fait un retour à la ligne — c'est ce qu'on veut
  // pour les verbatims du dirigeant (« ses trois priorités, ses mots »).
  if (e.key !== 'Enter' || e.currentTarget.tagName === 'TEXTAREA') return;
  e.preventDefault();
  focusNext(e.currentTarget);
}

export function QuestionField({
  question,
  value,
  isSkipped,
  disabled,
  onChange,
  onSkipToggle,
}: QuestionFieldProps) {
  const id = useId();
  const [showHint, setShowHint] = useState(true);
  const common = {
    id,
    'data-diag-field': 'true' as const,
    disabled: disabled || isSkipped,
    onKeyDown: onEnterAdvance,
    className: INPUT_CLASS,
  };

  function renderInput() {
    switch (question.type) {
      case 'text':
        return (
          <textarea
            {...common}
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className={`${INPUT_CLASS} resize-y min-h-[72px]`}
          />
        );
      case 'int':
      case 'money':
      case 'percent':
        return (
          <div className="relative">
            <input
              {...common}
              inputMode="decimal"
              // `type="text"` volontaire : un input number avale les espaces et
              // la virgule décimale que tout le monde tape en français, et la
              // molette change la valeur par accident en plein rendez-vous.
              type="text"
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => onChange(e.target.value)}
              placeholder={
                question.type === 'percent'
                  ? 'ex. 45'
                  : question.type === 'money'
                    ? 'ex. 120 000'
                    : 'ex. 12'
              }
            />
            {question.type !== 'int' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {question.type === 'money' ? '€' : '%'}
              </span>
            )}
          </div>
        );
      case 'date':
        return (
          <input
            {...common}
            type="date"
            value={typeof value === 'string' ? value.slice(0, 10) : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case 'url':
        return (
          <input
            {...common}
            type="url"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://"
          />
        );
      case 'yesno': {
        const labels = question.answerLabels ?? { yes: 'Oui', no: 'Non' };
        return (
          <div className="flex flex-wrap gap-2">
            {(['yes', 'no'] as const).map((v) => (
              <button
                key={v}
                type="button"
                data-diag-field="true"
                disabled={disabled || isSkipped}
                onClick={() => onChange(value === v ? null : v)}
                className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                  value === v
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border hover:bg-muted'
                } disabled:opacity-50`}
              >
                {labels[v]}
              </button>
            ))}
          </div>
        );
      }
      case 'choice':
        return (
          <div className="flex flex-wrap gap-2">
            {(question.choices ?? []).map((c) => (
              <button
                key={c}
                type="button"
                data-diag-field="true"
                disabled={disabled || isSkipped}
                onClick={() => onChange(value === c ? null : c)}
                className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                  value === c
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border hover:bg-muted'
                } disabled:opacity-50`}
              >
                {question.optionLabels?.[c] ?? c}
              </button>
            ))}
          </div>
        );
      case 'multichoice': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-wrap gap-2">
            {(question.choices ?? []).map((c) => {
              const on = selected.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  data-diag-field="true"
                  disabled={disabled || isSkipped}
                  onClick={() => onChange(on ? selected.filter((x) => x !== c) : [...selected, c])}
                  className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                    on ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'
                  } disabled:opacity-50`}
                >
                  {question.optionLabels?.[c] ?? c}
                </button>
              );
            })}
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className={`py-4 ${isSkipped ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-1">
        <label htmlFor={id} className="block text-sm font-medium leading-snug">
          {question.question}
          {question.required && <span className="text-red-600 ml-1">*</span>}
        </label>
        <button
          type="button"
          onClick={() => onSkipToggle(!isSkipped)}
          disabled={disabled}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {isSkipped ? 'Reprendre' : 'Ne sait pas'}
        </button>
      </div>

      {question.hint && showHint && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-2 leading-relaxed">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>{question.hint}</span>
          <button
            type="button"
            onClick={() => setShowHint(false)}
            className="ml-auto shrink-0 underline underline-offset-2 hover:text-foreground"
            aria-label="Masquer l'aide de saisie"
          >
            masquer
          </button>
        </p>
      )}

      {renderInput()}

      {isSkipped && (
        <p className="text-xs text-muted-foreground mt-1">
          Marquée « ne sait pas » — comptée comme traitée, signalée dans le rapport.
        </p>
      )}
    </div>
  );
}
