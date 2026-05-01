import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { MainContent } from '@/components/layout/main-content';
import { CommandPalette } from '@/components/command-palette/command-palette';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MainContent>
        <TopBar user={user} />
        <main className="flex-1 p-8 max-w-screen-2xl w-full mx-auto">{children}</main>
      </MainContent>
      <CommandPalette />
    </div>
  );
}
