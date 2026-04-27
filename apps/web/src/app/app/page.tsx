import { Users, Calendar, FileText, AlertCircle } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { StatCard } from '@/components/dashboard/stat-card';
import { CleanupCard } from '@/components/dashboard/cleanup-card';

export default async function DashboardPage() {
  const { user } = await validateRequest();
  if (!user) return null; // layout redirige déjà

  const tenantId = user.tenantId;
  const now = new Date();

  const [
    nbPersons,
    nbOrgs,
    nbActiveSessions,
    nbUpcomingSessions,
    nbDocs,
    nbAgefice,
    nbCleanupPersons,
    nbCleanupOrgs,
    nbProducts,
  ] = await Promise.all([
    prisma.person.count({ where: { tenantId, archived: false } }),
    prisma.organization.count({ where: { tenantId, archived: false } }),
    prisma.trainingSession.count({ where: { tenantId, status: { in: ['IN_PROGRESS', 'PLANNED', 'OPEN'] } } }),
    prisma.trainingSession.count({ where: { tenantId, startDate: { gt: now } } }),
    prisma.document.count({ where: { tenantId } }),
    prisma.ageficeProfile.count({ where: { organization: { tenantId } } }),
    prisma.person.count({ where: { tenantId, requiresCleanup: true } }),
    prisma.organization.count({ where: { tenantId, requiresCleanup: true } }),
    prisma.trainingProduct.count({ where: { tenantId, isActive: true } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour {user.firstName} 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Voici l'état de Start Academy aujourd'hui.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Apprenants"
          value={nbPersons}
          hint={`${nbOrgs} organisations · ${nbProducts} produits`}
        />
        <StatCard
          icon={Calendar}
          label="Sessions actives"
          value={nbActiveSessions}
          hint={`${nbUpcomingSessions} à venir`}
        />
        <StatCard
          icon={FileText}
          label="Documents générés"
          value={nbDocs}
          hint={`${nbAgefice} profils AGEFICE pré-remplis`}
        />
        <StatCard
          icon={AlertCircle}
          label="À nettoyer"
          value={nbCleanupPersons + nbCleanupOrgs}
          hint={`${nbCleanupPersons} apprenants · ${nbCleanupOrgs} organisations`}
          tone={nbCleanupPersons + nbCleanupOrgs > 0 ? 'warning' : 'default'}
        />
      </div>

      {nbCleanupPersons + nbCleanupOrgs > 0 && (
        <CleanupCard nbPersons={nbCleanupPersons} nbOrgs={nbCleanupOrgs} />
      )}

      <div className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-semibold mb-2">Prochaines étapes (palier 2)</h2>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>CRUD complet apprenants / organisations / produits / formateurs</li>
          <li>
            Composants <code className="font-mono">LegalLinkEditor</code> +{' '}
            <code className="font-mono">PersonOrOrgPicker</code> (cas EI Pascal BIANCO)
          </li>
          <li>Wizard création de session en 4 étapes</li>
          <li>Adapter Qualiopi Gen + bouton "test IA" sur fiche participant</li>
          <li>Formulaire des 54 champs AGEFICE pour les organisations éligibles</li>
        </ul>
      </div>
    </div>
  );
}
