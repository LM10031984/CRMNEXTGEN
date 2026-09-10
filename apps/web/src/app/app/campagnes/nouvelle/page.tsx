import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { NouvelleCampagneForm } from '@/components/campagne/nouvelle-campagne-form';

/**
 * Création d'une campagne de RDV (lot F, §7.1).
 *
 * La spec dit « depuis le diagnostic (ou la proposition) ». En pratique
 * l'écran est ici, et le diagnostic s'y accroche par `?diagnostic=` : c'est le
 * même formulaire, qu'on l'ouvre depuis un dossier ou depuis la liste, donc un
 * seul à maintenir. Le rattachement pré-rempli fait le reste.
 */
export const dynamic = 'force-dynamic';

export default async function NouvelleCampagnePage({
  searchParams,
}: {
  searchParams: Promise<{ diagnostic?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) return null;
  const { diagnostic: diagnosticId } = await searchParams;

  // Produits actifs seulement : une campagne annonce une formation qu'on vend.
  // Les conteneurs du catalogue diagnostic sont inactifs par construction
  // (corollaire D-19) et n'ont donc rien à faire dans cette liste.
  const produits = await prisma.trainingProduct.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    orderBy: { title: 'asc' },
    select: { id: true, title: true, durationHours: true },
    take: 300,
  });

  const diagnostic = diagnosticId
    ? await prisma.diagnostic.findFirst({
        where: { id: diagnosticId, tenantId: user.tenantId },
        select: {
          id: true,
          reference: true,
          organization: { select: { legalName: true } },
          lead: { select: { firstName: true, lastName: true } },
          _count: { select: { participants: true } },
        },
      })
    : null;

  const nomClient =
    diagnostic?.organization?.legalName ??
    `${diagnostic?.lead?.firstName ?? ''} ${diagnostic?.lead?.lastName ?? ''}`.trim();

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Nouvelle campagne de pré-inscription"
        subtitle="Le lien que le dirigeant diffusera à son équipe pour constituer les dossiers."
      />
      <NouvelleCampagneForm
        produits={produits}
        diagnosticId={diagnostic?.id ?? null}
        libelleSuggere={
          diagnostic
            ? `RDV ${nomClient || diagnostic.reference}`
            : ''
        }
        effectifSuggere={diagnostic?._count.participants ?? 0}
      />
    </div>
  );
}
