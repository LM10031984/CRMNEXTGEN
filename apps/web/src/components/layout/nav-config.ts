import {
  Users,
  Building2,
  GraduationCap,
  BookOpen,
  FileText,
  Calendar,
  Receipt,
  Megaphone,
  Settings,
  LayoutDashboard,
  Landmark,
  ClipboardCheck,
  Inbox,
  Wallet,
  History,
  UserCog,
  TrendingUp,
  Sliders,
  Newspaper,
  FilePlus,
  BarChart3,
  Stethoscope,
} from 'lucide-react';
import type { UserRole } from '@qualiof/db';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Rôles autorisés à voir cet item dans la sidebar.
   *
   * - `undefined` (absent) → visible pour TOUS les rôles (item "neutre", typiquement
   *   les lectures de base : Dashboard, Sessions, Apprenants).
   * - Tableau de rôles → l'item est visible UNIQUEMENT pour les rôles listés.
   *
   * ⚠️ Filtre purement VISUEL (D-07 CONTEXT.md). La sécurité réelle est dans
   * `requireRole` côté server actions (D-08). Ne JAMAIS s'appuyer sur ce champ
   * pour de la protection serveur.
   */
  allowedRoles?: UserRole[];
}

export interface NavSection {
  title?: string;
  /** Identifiant pour persister l'état déplié/replié (localStorage). */
  id?: string;
  /** Section repliable — démarre repliée par défaut. */
  collapsible?: boolean;
  items: NavItem[];
}

// Hiérarchie simplifiée 2026-05 : 3 sections claires, focus sur le workflow
// quotidien (Sessions + Apprenants + Pré-inscriptions). La configuration
// (référentiels, paramètres, etc.) est repliable pour réduire le bruit visuel.
//
// Phase 8 (Plan 08-04) — ajout `allowedRoles` par item suivant la matrice D-02
// (cf. packages/shared/src/constants/permissions.ts pour la source de vérité).
// Items sans `allowedRoles` = visibles pour tous (Dashboard, Apprenants,
// Sessions, Produits, Organisations, Templates, Inscriptions — tous au moins R).
//
// Cette config est consommée par <Sidebar> (desktop, hidden md:flex)
// ET par <MobileNavDrawer> (drawer < md). Un seul array source de vérité.
export const NAV: NavSection[] = [
  {
    title: 'Essentiel',
    items: [
      // Dashboard, Sessions, Apprenants : visibles pour les 6 rôles (au moins R)
      { label: 'Tableau de bord', href: '/app', icon: LayoutDashboard },
      { label: 'Sessions', href: '/app/sessions', icon: Calendar },
      { label: 'Apprenants', href: '/app/apprenants', icon: Users },
      // Inscriptions (ex-Pré-inscriptions, Phase 12 D-01) : ADMIN/MANAGER/COMMERCIAL
      // uniquement (D-02 preenrollments — RBAC héritée). Le rename de la route
      // /app/preinscriptions → /app/inscriptions a remplacé l'ancien stub
      // Placeholder par le vrai listing admin (cf. Phase 12 Plan 01).
      {
        label: 'Inscriptions',
        href: '/app/inscriptions',
        icon: Inbox,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL'],
      },
    ],
  },
  {
    title: 'Suivi',
    items: [
      // Pilotage Direction (quick 260620-d42) : ADMIN+MANAGER uniquement — vue
      // CA réalisé vs objectif vs prévisionnel. Réservée à la direction (pas de
      // COMMERCIAL/COMPTABLE/LECTEUR/FORMATEUR). Sécurité réelle : garde hasRole
      // côté page.tsx + requireRole côté setRevenueTarget. BarChart3 la distingue
      // de "Vue de charge" (TrendingUp).
      {
        label: 'Pilotage',
        href: '/app/pilotage',
        icon: BarChart3,
        allowedRoles: ['ADMIN', 'MANAGER'],
      },
      // Dossiers OPCO : ADMIN/MANAGER/COMMERCIAL/COMPTABLE/LECTEUR (FORMATEUR exclu)
      {
        label: 'Dossiers OPCO',
        href: '/app/dossiers-opco',
        icon: ClipboardCheck,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE', 'LECTEUR'],
      },
      // Factures : ADMIN/MANAGER/COMPTABLE/LECTEUR (COMMERCIAL et FORMATEUR exclus)
      {
        label: 'Factures',
        href: '/app/factures',
        icon: Receipt,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR'],
      },
      // Devis commerciaux : ADMIN/MANAGER/COMMERCIAL (les rôles qui prospectent).
      // COMPTABLE et LECTEUR n'ont pas besoin (le devis devient une facture une
      // fois accepté, et c'est la facture qui est visible côté compta).
      {
        label: 'Devis',
        href: '/app/devis',
        icon: FilePlus,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL'],
      },
      // Budget AGEFICE : ADMIN/MANAGER/COMMERCIAL/COMPTABLE/LECTEUR (FORMATEUR exclu)
      {
        label: 'Budget AGEFICE',
        href: '/app/budget-agefice',
        icon: Wallet,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE', 'LECTEUR'],
      },
      // Audit Trésorerie : réplique vue Excel Tréso AGEFICE avec les 2 formules
      // statut Airtable (Statut_Opco + Statut_encaissement).
      {
        label: 'Audit Tréso',
        href: '/app/audit-treso',
        icon: Wallet,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMPTABLE', 'LECTEUR'],
      },
      // Leads : ADMIN/MANAGER/COMMERCIAL uniquement
      {
        label: 'Leads',
        href: '/app/leads',
        icon: Megaphone,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL'],
      },
      // Diagnostics d'agence (chaîne diagnostic, lot B) : le R1 commercial.
      // Mêmes rôles que Leads — c'est le prolongement du même métier. À ne pas
      // confondre avec /diagnostic (public, express du stand MLS).
      {
        label: 'Diagnostics',
        href: '/app/diagnostics',
        icon: Stethoscope,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL'],
      },
      // Vue de charge (Phase 9 Plan 09-04) : ADMIN+MANAGER uniquement
      // — destinee aux supervisions de pipeline commercial (pas a COMMERCIAL
      // qui voit ses propres leads via la liste filtree).
      {
        label: 'Vue de charge',
        href: '/app/leads/charge',
        icon: TrendingUp,
        allowedRoles: ['ADMIN', 'MANAGER'],
      },
      // Veille Qualiopi (Phase 13 Plan 13-03) : ADMIN/MANAGER/LECTEUR visualisent
      // — LECTEUR consulte les 4 onglets thématiques (sans inbox D-03 — masquage
      // strict côté server page.tsx + côté client VeilleTabsClient prop canSeeInbox).
      // Les autres rôles (COMMERCIAL/COMPTABLE/FORMATEUR) ne voient PAS le lien
      // (la sidebar est filtre VISUEL uniquement — server actions guardées par
      // requireRole(['ADMIN','MANAGER']) cf. veille.ts Plan 02).
      {
        label: 'Veille Qualiopi',
        href: '/app/veille',
        icon: Newspaper,
        allowedRoles: ['ADMIN', 'MANAGER', 'LECTEUR'],
      },
    ],
  },
  {
    title: 'Configuration',
    id: 'config',
    collapsible: true,
    items: [
      // Organisations : 6 rôles (au moins R) — pas de filtre
      { label: 'Organisations', href: '/app/organisations', icon: Building2 },
      // Formateurs : ADMIN/MANAGER/FORMATEUR/LECTEUR (COMMERCIAL et COMPTABLE exclus)
      {
        label: 'Formateurs',
        href: '/app/formateurs',
        icon: GraduationCap,
        allowedRoles: ['ADMIN', 'MANAGER', 'FORMATEUR', 'LECTEUR'],
      },
      // Produits : 6 rôles — pas de filtre
      { label: 'Produits de formation', href: '/app/produits', icon: BookOpen },
      // Modèles de documents (Phase 12 Plan 02 D-09) : ADMIN/MANAGER/LECTEUR
      // (FORMATEUR/COMMERCIAL/COMPTABLE exclus — pas utile pour leur métier).
      // Sécurité réelle : requireRole côté page.tsx + filtre visuel sidebar.
      {
        label: 'Modèles de documents',
        href: '/app/templates',
        icon: FileText,
        allowedRoles: ['ADMIN', 'MANAGER', 'LECTEUR'],
      },
      // Financeurs : ADMIN/MANAGER/COMMERCIAL/COMPTABLE (FORMATEUR et LECTEUR exclus)
      {
        label: 'Financeurs',
        href: '/app/financeurs',
        icon: Landmark,
        allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL', 'COMPTABLE'],
      },
      // Paramètres OF : ADMIN only (D-02 tenantSettings)
      {
        label: 'Paramètres',
        href: '/app/parametres',
        icon: Settings,
        allowedRoles: ['ADMIN'],
      },
      // Distribution leads (Phase 9 Plan 09-04) : ADMIN only — 3 toggles tenant
      // (autoAssignLeads / notifyOnLeadAssignEmail / notifyOnLeadAssignBell).
      {
        label: 'Distribution leads',
        href: '/app/parametres/distribution-leads',
        icon: Sliders,
        allowedRoles: ['ADMIN'],
      },
      // Utilisateurs (Phase 8 Plan 08-04) : ADMIN only
      {
        label: 'Utilisateurs',
        href: '/app/parametres/utilisateurs',
        icon: UserCog,
        allowedRoles: ['ADMIN'],
      },
      // Historique AuditLog (Phase 8 Plan 08-05 — à venir) : ADMIN only
      {
        label: 'Historique',
        href: '/app/parametres/historique',
        icon: History,
        allowedRoles: ['ADMIN'],
      },
    ],
  },
];

export const SECTION_STORAGE_PREFIX = 'qualiof-sidebar-section-';

/**
 * Filtre les sections/items de la nav selon le rôle utilisateur.
 *
 * Pure fn (pas d'I/O ni d'état) → testable en isolation. Phase 8 D-07.
 *
 * Règles :
 *  - Un item sans `allowedRoles` est conservé pour tous les rôles (défaut = visible).
 *  - Un item avec `allowedRoles` est conservé UNIQUEMENT si `role ∈ allowedRoles`.
 *  - Une section dont TOUS les items sont filtrés est elle-même retirée (pas de
 *    titre orphelin dans la sidebar).
 *  - Le tableau source `nav` n'est PAS muté (retourne de nouveaux objets section).
 *
 * @example
 *   const visibleNav = filterNavForRole(NAV, 'LECTEUR');
 *   // → Utilisateurs / Historique / Paramètres absents
 */
export function filterNavForRole(nav: NavSection[], role: UserRole): NavSection[] {
  return nav
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (it) => !it.allowedRoles || it.allowedRoles.includes(role),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
