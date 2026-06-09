import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { MainContent } from '@/components/layout/main-content';
import { CommandPalette } from '@/components/command-palette/command-palette';
import type { UserRole } from '@qualiof/db';

/**
 * Layout protégé `/app/*`. Server Component qui :
 *  - Garde l'authentification (redirect /login si pas de session).
 *  - Transmet `user.role` (string sérialisable) à `Sidebar` (desktop) ET
 *    `TopBar` (qui le passe à `MobileMenuButton` → `MobileNavDrawer`). Chaque
 *    Client Component importe `NAV` localement et applique `filterNavForRole`
 *    côté client. Les deux vues (desktop + mobile) partagent ainsi la même
 *    source de vérité sans traverser la frontière RSC→Client avec les
 *    références de fonctions Lucide (cf. debug `dashboard-rsc-icon-prop`
 *    2026-05-16).
 *
 * ⚠️ Le filtre est UNIQUEMENT visuel (D-07). La vraie sécurité est `requireRole`
 * côté server actions (D-08) — un LECTEUR qui tape directement
 * `/app/parametres/utilisateurs` se heurte à `requireRole(['ADMIN'])` qui
 * throw `ForbiddenError` et tombe sur `app/app/error.tsx`.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  const role = user.role as UserRole;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={role} />
      <MainContent>
        <TopBar user={user} />
        <main className="flex-1 p-4 md:p-8 max-w-screen-2xl w-full mx-auto">{children}</main>
      </MainContent>
      <CommandPalette />
    </div>
  );
}
