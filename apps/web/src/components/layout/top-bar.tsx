import type { User } from 'lucia';
import { CmdkTrigger } from './cmdk-trigger';
import { NotificationsBell } from './notifications-bell';
import { MobileMenuButton } from './mobile-menu-button';
import { UserMenuButton } from './user-menu-button';
import type { UserRole } from '@qualiof/db';

interface TopBarProps {
  user: User;
  /** Rôle utilisateur — transmis au MobileNavDrawer pour filtrer NAV côté client. */
  role: UserRole;
}

export function TopBar({ user, role }: TopBarProps) {
  return (
    <header
      className="
        h-16 sticky top-0 z-10 flex items-center gap-3 px-4 md:px-8
        bg-white/70 backdrop-blur-md backdrop-saturate-150
        border-b border-slate-200/60
      "
    >
      <MobileMenuButton role={role} />
      <div className="flex-1 max-w-md">
        <CmdkTrigger />
      </div>
      <div className="flex items-center gap-2">
        <NotificationsBell />
        <UserMenuButton user={user} />
      </div>
    </header>
  );
}
