import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@qualiof/db';
import { ProposalContentSchema, ProposalPricingSchema, ProposalFundingSchema } from '@qualiof/shared';

import { loadFundingRules } from '@/lib/financement/load-rules';
import { loadOfConfig } from '@/lib/of-config';
import { computePricing } from '@/lib/proposition/pricing';
import { renderPropositionHtml } from '@/lib/proposition/templates/proposition-template';
import {
  hashPublicToken,
  isWellFormedPublicToken,
  publicTokenMatches,
} from '@/lib/proposition/public-link';

/**
 * Le lien de lecture de la proposition (spec §9.1, §9.4).
 *
 * Servi par une route plutôt que par une page React, et c'est délibéré : le
 * dirigeant lit EXACTEMENT le document que le PDF imprime, rendu par le même
 * template. Une seconde implémentation en composants divergerait au premier
 * correctif, et c'est précisément le défaut que la chaîne est censée supprimer.
 *
 * Doctrine des liens publics :
 *   • le token n'existe en base que sous forme d'empreinte SHA-256 ;
 *   • la comparaison est à temps constant ;
 *   • expiration vérifiée à chaque ouverture, aucune mise en cache ;
 *   • aucun nom de participant dans le document (le template le garantit, un
 *     test de contrat le vérifie) ;
 *   • chaque consultation est journalisée — la première ouverture est le
 *     signal commercial « proposition vue » (relance du lot H).
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Le document reste lisible à l'écran : @page ne s'applique qu'à l'impression. */
const SCREEN_STYLES = `
@media screen{
  html{ background:#e9edf1 }
  body{ max-width:210mm; margin:0 auto; padding:24px 16px; background:#ffffff }
  .page{ margin-bottom:32px }
}`;

function refuse(message: string, status: number): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Proposition indisponible</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1.5rem;color:#1c2733;line-height:1.6}` +
      `h1{font-size:1.25rem;margin-bottom:.75rem;color:#00527A}</style></head>` +
      `<body><h1>Cette proposition n’est plus consultable</h1><p>${message}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isWellFormedPublicToken(token)) {
    return refuse('Le lien est incomplet ou a été altéré.', 404);
  }

  const candidateHash = hashPublicToken(token);

  // On ne peut pas interroger la base par le token brut : seule l'empreinte y
  // est stockée. La recherche porte donc sur l'empreinte, puis la comparaison
  // finale se fait à temps constant.
  const proposal = await prisma.proposal.findFirst({
    where: { publicTokenHash: candidateHash },
    select: {
      id: true,
      tenantId: true,
      reference: true,
      version: true,
      status: true,
      validUntil: true,
      publicTokenHash: true,
      publicTokenExpiresAt: true,
      contentJson: true,
      pricingJson: true,
      fundingJson: true,
      generationSource: true,
      reviewedAt: true,
      owner: { select: { firstName: true, lastName: true } },
      organization: { select: { legalName: true } },
      diagnostic: { select: { reference: true } },
      lead: { select: { firstName: true, lastName: true, notes: true } },
      quotes: { select: { number: true } },
    },
  });

  if (!proposal?.publicTokenHash || !publicTokenMatches(candidateHash, proposal.publicTokenHash)) {
    return refuse('Ce lien n’existe pas, ou il a été révoqué.', 404);
  }
  if (proposal.publicTokenExpiresAt && proposal.publicTokenExpiresAt < new Date()) {
    return refuse(
      'Ce lien a expiré. Demandez-en un nouveau à votre interlocuteur — la proposition, elle, existe toujours.',
      410,
    );
  }
  // Une proposition jamais relue ne se diffuse pas : la porte tient aussi ici,
  // pas seulement dans l'écran qui a créé le lien.
  if (!proposal.reviewedAt) {
    return refuse('Cette proposition n’est pas encore finalisée.', 404);
  }

  const [{ values: rules }, of] = await Promise.all([
    loadFundingRules(proposal.tenantId),
    loadOfConfig(proposal.tenantId),
  ]);

  const content = ProposalContentSchema.parse(proposal.contentJson);
  const pricing = ProposalPricingSchema.parse(proposal.pricingJson);
  const funding = ProposalFundingSchema.parse(proposal.fundingJson);

  const agencyName =
    proposal.organization?.legalName ??
    proposal.lead.notes?.replace(/^Agence\s*:\s*/, '').trim() ??
    [proposal.lead.firstName, proposal.lead.lastName].filter(Boolean).join(' ');

  const html = renderPropositionHtml({
    reference: proposal.reference,
    version: proposal.version,
    agencyName,
    generatedAt: new Date(),
    validUntil: proposal.validUntil,
    ownerLabel: [proposal.owner.firstName, proposal.owner.lastName].filter(Boolean).join(' '),
    of: {
      name: of.name,
      siret: of.siret || null,
      numDA: of.rnq || null,
      address: of.addressFull || null,
      email: of.email || null,
      phone: of.phone || null,
    },
    content,
    onsiteHoursPerHalfDay: rules.HALF_DAY_ONSITE_HOURS,
    trainerCount: rules.TRAINER_COUNT_DEFAULT,
    pricing: computePricing({ pricing, rules }),

    funding,
    auditReference: proposal.diagnostic.reference,
    quoteNumbers: proposal.quotes.map((q) => q.number),
    generationSource: proposal.generationSource,
  }).replace('</head>', `<style>${SCREEN_STYLES}</style></head>`);

  // Journal de consultation — sans utilisateur (le lecteur est le client), et
  // sans le token : seule la trace du fait qu'il a été ouvert.
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: proposal.tenantId,
        entity: 'Proposal',
        entityId: proposal.id,
        action: 'proposition.public_link.viewed',
        diff: { reference: proposal.reference } as Prisma.InputJsonValue,
        userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
    });
  } catch (e) {
    // Un journal qui échoue ne doit pas priver le client de sa proposition.
    console.error('[proposition] journal de consultation', e);
  }

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
