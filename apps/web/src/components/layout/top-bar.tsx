import type { User } from 'lucia';
import type { UserRole } from '@qualiof/db';
import { CmdkTrigger } from './cmdk-trigger';
import { NotificationsBell } from './notifications-bell';
import { MobileMenuButton } from './mobile-menu-button';
import { UserMenuButton } from './user-menu-button';

interface TopBarProps {
  user: User;
}

export function TopBar({ user }: TopBarProps) {
  return (
    <header className="h-14 border-b border-border bg-white flex items-center px-4 md:px-8 sticky top-0 z-10 gap-3">
      <MobileMenuButton role={user.role as UserRole} />
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
