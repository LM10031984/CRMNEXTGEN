import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QualiOF',
  description: "Plateforme Qualiopi pour Start Academy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
