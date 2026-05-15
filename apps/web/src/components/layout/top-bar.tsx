import type { User } from 'lucia';
import { CmdkTrigger } from './cmdk-trigger';
import { NotificationsBell } from './notifications-bell';
import { MobileMenuButton } from './mobile-menu-button';
import { UserMenuButton } from './user-menu-button';
import type { NavSection } from './nav-config';

interface TopBarProps {
  user: User;
  /**
   * Sections de navigation déjà filtrées par rôle (D-07). Transmises au
   * MobileMenuButton → MobileNavDrawer pour que le drawer mobile partage la
   * même vue que la sidebar desktop.
   */
  nav: NavSection[];
}

export function TopBar({ user, nav }: TopBarProps) {
  return (
    <header className="h-14 border-b border-border bg-white flex items-center px-4 md:px-8 sticky top-0 z-10 gap-3">
      <MobileMenuButton nav={nav} />
      <div className="flex-1 max-w-md">
        <CmdkTrigger />
      </div>
      <div className="flex items-center gap-3">
        <NotificationsBell />
        <UserMenuButton user={user} />
      </div>
    </header>
  );
}
