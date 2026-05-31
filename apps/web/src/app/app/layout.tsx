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
 *  - Calcule la nav filtrée par rôle UNE SEULE FOIS (Phase 8 Plan 08-04 / D-07),
 *    puis la transmet en prop à `Sidebar` (desktop) ET `TopBar` (qui la passe
 *    au `MobileMenuButton` → `MobileNavDrawer`). Garantit que les deux vues
 *    (desktop + mobile) montrent strictement les mêmes items.
 *
 * ⚠️ Le filtre est UNIQUEMENT visuel. La vraie sécurité est `requireRole`
 * côté server actions (D-08) — un LECTEUR qui tape directement
 * `/app/parametres/utilisateurs` se heurte à `requireRole(['ADMIN'])` qui
 * throw `ForbiddenError` et tombe sur `app/app/error.tsx`.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  const role = user.role as UserRole;

  return (
    <div className="min-h-screen bg-slate-50/30">
      <Sidebar role={role} />
      <MainContent>
        <TopBar user={user} role={role} />
        <main className="flex-1 p-4 md:p-8 max-w-screen-2xl w-full mx-auto">{children}</main>
      </MainContent>
      <CommandPalette />
    </div>
  );
}
