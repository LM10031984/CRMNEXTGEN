'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Wrapper réutilisable pour les sections de la page Paramètres OF
 * (Phase 7 Plan 07-04).
 *
 * Comportement :
 *  - Affiche une carte avec en-tête (icône + titre + description optionnelle).
 *  - Bouton "Modifier" en haut à droite (sauf si `allowEdit=false`, mode legacy).
 *  - Bascule entre `readView` (mode lecture, ReactNode statique) et `editView`
 *    (mode édition, render-prop qui reçoit `onSaved` / `onCancel`).
 *  - Le form interne (passé via editView) déclenche `onSaved()` après save
 *    réussi ou `onCancel()` après abandon → revient en mode read.
 *
 * Pattern d'inline edit cohérent avec la fiche apprenant Phase 5
 * (cf. CONTEXT.md "Claude's Discretion").
 *
 * Composant client (`useState`) — la page parente reste Server Component.
 */

export interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  description?: string;
  readView: ReactNode;
  /**
   * Render-prop : reçoit `onSaved` et `onCancel`.
   * Le form interne doit appeler l'un des deux pour quitter le mode édition.
   * Si non fourni, le bouton "Modifier" est masqué (lecture seule strict).
   */
  editView?: (onSaved: () => void, onCancel: () => void) => ReactNode;
  /** false → masque le bouton "Modifier" (sections legacy lecture seule). */
  allowEdit?: boolean;
  className?: string;
}

export function SettingsSection({
  icon,
  title,
  description,
  readView,
  editView,
  allowEdit = true,
  className,
}: SettingsSectionProps) {
  const [editing, setEditing] = useState(false);

  // Si pas de editView fourni mais allowEdit=true par défaut → forcer read-only.
  const canEdit = allowEdit && typeof editView === 'function';

  return (
    <section
      className={cn(
        'rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-6',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 min-w-0">
          {icon}
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight">{title}</h2>
            {description ? (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            ) : null}
          </div>
        </div>
        {canEdit && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-8 px-3 rounded-md border border-input bg-white text-xs font-medium hover:bg-muted transition-colors shrink-0"
          >
            Modifier
          </button>
        ) : null}
      </header>

      <div className="text-sm">
        {editing && editView
          ? editView(
              () => setEditing(false),
              () => setEditing(false),
            )
          : readView}
      </div>
    </section>
  );
}
