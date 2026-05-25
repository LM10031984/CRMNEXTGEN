/**
 * Helpers pour la page /app/veille (Phase 13 Plan 13-03 — VEILLE-02).
 *
 * Helpers purs (sans I/O) testables en isolation — séparés de page.tsx pour
 * permettre les tests RBAC sans avoir à monter le Server Component complet.
 *
 * Pattern cohérent avec `filterNavForRole` (Phase 8 nav-config.ts) : 1 fichier
 * de helpers purs par feature complexe.
 */

import type { UserRole } from '@qualiof/db';

/**
 * D-03 (Phase 13 CONTEXT) — LECTEUR n'a PAS accès à l'onglet inbox.
 *
 * L'inbox contient les suggestions auto (status='DRAFT', suggestedBy='AUTO') en
 * attente de validation humaine. C'est un outil d'édition réservé aux
 * ADMIN+MANAGER. Le LECTEUR ne voit que les entrées `ACTIVE` des 4 onglets
 * thématiques.
 *
 * Defense-in-depth : ce helper est consommé à 2 endroits :
 *  1. Côté SERVER (page.tsx) — pour rediriger LECTEUR si tab=inbox forcé en URL
 *  2. Côté CLIENT (VeilleTabsClient prop `canSeeInbox`) — pour NE PAS RENDRE
 *     le bouton inbox dans la nav (pas juste `disabled`)
 *
 * @returns `true` si user a le droit de voir l'inbox (ADMIN ou MANAGER)
 */
export function shouldShowInbox(
  user: { role: UserRole | string } | null,
): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}

/** 5 onglets possibles de la page veille (4 thématiques + inbox conditionnel). */
export type VeilleTab = 'indic_23' | 'indic_24' | 'indic_25' | 'indic_26' | 'inbox';

/**
 * Parse le param URL `?tab=` et le valide.
 *
 * - Si `raw` est absent ou non reconnu → fallback `'indic_23'` (1er onglet thématique).
 * - Si `raw='inbox'` mais `canSeeInbox=false` → fallback `'indic_23'` (defense-in-depth UI).
 *
 * Cohérent avec le pattern Phase 9.1 `product-tabs.tsx` mais avec validation
 * stricte serveur (vs simple lecture client) car les onglets pilotent le scope
 * Prisma (theme=INDIC_23 vs status=DRAFT/inbox).
 */
export function parseTab(
  raw: string | undefined,
  canSeeInbox: boolean,
): VeilleTab {
  const valid: VeilleTab[] = ['indic_23', 'indic_24', 'indic_25', 'indic_26'];
  if (canSeeInbox) valid.push('inbox');
  if (raw && (valid as string[]).includes(raw)) return raw as VeilleTab;
  return 'indic_23';
}

/**
 * Convertit l'ID d'onglet URL en valeur enum Prisma `RegulatoryWatchTheme`.
 *
 * Retourne `null` pour l'onglet 'inbox' (qui n'est pas thématique — il filtre
 * sur status=DRAFT, pas sur theme).
 *
 * @example
 *   tabToTheme('indic_23') === 'INDIC_23'
 *   tabToTheme('inbox') === null
 */
export function tabToTheme(
  tab: VeilleTab,
): 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26' | null {
  if (tab === 'inbox') return null;
  // 'indic_23' → 'INDIC_23'
  return tab.toUpperCase() as 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';
}
