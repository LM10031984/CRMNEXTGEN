import type { User } from 'lucia';
import { logoutAction } from '@/app/login/actions';
import { CmdkTrigger } from './cmdk-trigger';
import { NotificationsBell } from './notifications-bell';

export function TopBar({ user }: { user: User }) {
  return (
    <header className="h-14 border-b border-border bg-white flex items-center px-8 sticky top-0 z-10 gap-3">
      <div className="flex-1 max-w-md">
        <CmdkTrigger />
      </div>
      <div className="flex items-center gap-3">
        <NotificationsBell />
        <div className="text-right text-xs">
          <div className="font-medium leading-tight">{user.firstName} {user.lastName}</div>
          <div className="text-muted-foreground">{user.role}</div>
        </div>
        <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 font-semibold inline-flex items-center justify-center text-sm">
          {user.firstName.charAt(0)}{user.lastName.charAt(0)}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </header>
  );
}
