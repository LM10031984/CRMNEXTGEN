import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

// Inter en variable font + preload. Expose la CSS var `--font-inter` qui est
// chaînée dans `tailwind.config.ts` (fontFamily.sans) → tout le site hérite.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'QualiOF',
  description: "Plateforme Qualiopi pour Start Academy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          // Style SaaS Premium : forme cohérente avec les cartes du CRM
          // (rounded-2xl, ring-1 ring-slate-200, shadow-card-hover).
          // `richColors` continue de teinter automatiquement success / error /
          // warning / info — on n'override que le shell.
          toastOptions={{
            classNames: {
              toast: 'rounded-2xl !ring-1 !ring-slate-200 !shadow-card-hover !font-sans !text-sm',
              description: '!text-slate-600 !text-xs',
              actionButton: '!rounded-lg !text-xs !font-medium',
              cancelButton: '!rounded-lg !text-xs !font-medium',
              closeButton: '!rounded-md !ring-1 !ring-slate-200',
            },
          }}
        />
      </body>
    </html>
  );
}
