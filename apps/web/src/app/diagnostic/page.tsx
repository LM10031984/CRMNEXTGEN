/**
 * Page publique du diagnostic express — cible du QR code du stand.
 *
 * Publique et sans jeton, contrairement à `/inscription/[token]` : un QR imprimé
 * sur un kakémono ne peut pas porter de secret, et le formulaire ne lit aucune
 * donnée, il n'en crée qu'une.
 *
 * Les journées candidates sont chargées ICI, au rendu serveur, et passées au
 * formulaire. Le navigateur peut donc nommer la vraie formation du catalogue
 * dès la 8e question, sans un seul appel réseau — le wifi du lieu ne peut pas
 * casser l'écran de résultat.
 *
 * Tenant résolu par `findFirst()`, comme `/catalogue` et `/preinscription`.
 */

import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { DiagnosticForm } from '@/components/diagnostic/diagnostic-form';
import { JOURNEES } from '@/lib/diagnostic/catalogue-map';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Diagnostic express — Start Academy',
  description: 'En 90 secondes, la journée de formation qui correspond à votre priorité du moment.',
};

export default async function DiagnosticPage() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) notFound();

  const codes = [...new Set(Object.values(JOURNEES).flat().map((j) => j.code))];
  const produits = await prisma.trainingProduct.findMany({
    where: { tenantId: tenant.id, code: { in: codes }, isActive: true },
    select: { code: true, title: true, durationHours: true },
  });

  // Un produit désactivé disparaît simplement de la liste : le résolveur côté
  // client bascule alors sur le candidat suivant. Le diagnostic ne tombe pas en
  // panne parce qu'une formation a été retirée du catalogue.
  const journees = produits
    .filter((p): p is typeof p & { code: string } => p.code !== null)
    .map((p) => ({ code: p.code, title: p.title, dureeHeures: p.durationHours ?? 8 }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50/30">
      <header className="border-b border-border bg-white">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center">
            S
          </div>
          <div>
            <div className="font-semibold leading-tight">Start Academy</div>
            <div className="text-xs text-muted-foreground">Organisme de formation Qualiopi</div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8">
        <div className="mb-7 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 text-primary-800 text-xs font-medium mb-3">
            Diagnostic express · 90 secondes
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Quelle formation vous ferait gagner le plus, maintenant ?
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Huit questions, aucune réponse à rédiger.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white p-5 md:p-7 shadow-sm">
          <DiagnosticForm journees={journees} />
        </div>
      </main>

      <footer className="border-t border-border bg-white py-5 mt-8">
        <div className="max-w-2xl mx-auto px-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Données hébergées dans l'Union européenne · Qualiopi · RGPD
          </div>
          <div>© Start Academy 2026</div>
        </div>
      </footer>
    </div>
  );
}
