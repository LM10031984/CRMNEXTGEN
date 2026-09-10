import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { loadFundingRules } from '@/lib/financement/load-rules';
import { NouvelleCampagneForm } from '@/components/campagne/nouvelle-campagne-form';

/**
 * Création d'une campagne de RDV (lot F, §7.1).
 *
 * Un seul formulaire, deux façons d'y arriver, et c'est voulu : depuis la fiche
 * d'un diagnostic (`?diagnostic=`), qui pré-remplit l'agence, le lead, le
 * libellé et l'effectif ; ou depuis la liste, où l'on choisit l'agence
 * soi-même. Le second cas est celui du client récurrent qu'on reforme sans
 * refaire un R1 — le rendre impossible pousserait à saisir un faux diagnostic.
 *
 * D-22 : dans les deux cas, l'agence est obligatoire. Ce qui a disparu, c'est
 * la campagne sans aucun client.
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

  const [produits, agences, regles] = await Promise.all([
    // Produits actifs seulement : une campagne annonce une formation qu'on vend.
    // Les conteneurs du catalogue diagnostic sont inactifs par construction
    // (corollaire D-19) et n'ont donc rien à faire dans cette liste.
    prisma.trainingProduct.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, durationHours: true },
      take: 300,
    }),
    prisma.organization.findMany({
      where: { tenantId: user.tenantId, archived: false },
      orderBy: { legalName: 'asc' },
      select: { id: true, legalName: true, brandName: true },
      take: 500,
    }),
    loadFundingRules(user.tenantId),
  ]);

  const diagnostic = diagnosticId
    ? await prisma.diagnostic.findFirst({
        where: { id: diagnosticId, tenantId: user.tenantId },
        select: {
          id: true,
          reference: true,
          meetingAt: true,
          r2PlannedAt: true,
          organizationId: true,
          leadId: true,
          organization: { select: { legalName: true } },
          lead: { select: { firstName: true, lastName: true } },
          _count: { select: { participants: true } },
        },
      })
    : null;

  const nomClient =
    diagnostic?.organization?.legalName ??
    `${diagnostic?.lead?.firstName ?? ''} ${diagnostic?.lead?.lastName ?? ''}`.trim();

  // Le libellé pré-rempli porte l'agence ET la date du rendez-vous : c'est ce
  // qui distingue deux campagnes du même client dans la liste, six mois après.
  const dateRdv = diagnostic?.r2PlannedAt ?? diagnostic?.meetingAt ?? null;
  const libelleSuggere = diagnostic
    ? `RDV ${nomClient || diagnostic.reference}${
        dateRdv
          ? ` — ${new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(dateRdv)}`
          : ''
      }`
    : '';

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Nouvelle campagne de pré-inscription"
        subtitle="Le lien que le dirigeant diffusera à son équipe pour constituer les dossiers."
      />
      <NouvelleCampagneForm
        produits={produits}
        agences={agences}
        halfDayOnsiteHours={regles.values.HALF_DAY_ONSITE_HOURS}
        trainerCount={regles.values.TRAINER_COUNT_DEFAULT}
        diagnostic={
          diagnostic
            ? {
                id: diagnostic.id,
                reference: diagnostic.reference,
                organizationId: diagnostic.organizationId,
                leadId: diagnostic.leadId,
                nomClient,
              }
            : null
        }
        libelleSuggere={libelleSuggere}
        effectifSuggere={diagnostic?._count.participants ?? 0}
      />
    </div>
  );
}
