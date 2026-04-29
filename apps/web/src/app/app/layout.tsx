import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* Compense la sidebar fixe (w-64 = 16rem) */}
      <div className="ml-64 flex flex-col min-h-screen">
        <TopBar user={user} />
        <main className="flex-1 p-8 max-w-screen-2xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
