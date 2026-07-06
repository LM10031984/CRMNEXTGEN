import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { StagingBanner } from '@/components/staging-banner';
import './globals.css';

export const metadata: Metadata = {
  title: 'QualiOF',
  description: "Plateforme Qualiopi pour Start Academy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <StagingBanner />
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
