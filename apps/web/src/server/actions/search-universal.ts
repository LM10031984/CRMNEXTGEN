'use server';

/**
 * Recherche universelle Cmd+K — interroge plusieurs entités en parallèle
 * et retourne un résultat normalisé prêt à afficher dans la palette.
 */

import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export type UniversalHit =
  | { kind: 'person'; id: string; title: string; subtitle: string | null; href: string }
  | { kind: 'org'; id: string; title: string; subtitle: string | null; href: string }
  | { kind: 'session'; id: string; title: string; subtitle: string | null; href: string }
  | { kind: 'product'; id: string; title: string; subtitle: string | null; href: string };

export interface UniversalSearchResult {
  persons: UniversalHit[];
  orgs: UniversalHit[];
  sessions: UniversalHit[];
  products: UniversalHit[];
}

const EMPTY: UniversalSearchResult = { persons: [], orgs: [], sessions: [], products: [] };

export async function universalSearch(query: string): Promise<UniversalSearchResult> {
  const { user } = await validateRequest();
  if (!user) return EMPTY;

  const q = query.trim();
  if (q.length < 2) return EMPTY;

  const tenantId = user.tenantId;
  const limitPerKind = 6;

  const [persons, orgs, sessions, products] = await Promise.all([
    prisma.person.findMany({
      where: {
        tenantId,
        archived: false,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true },
      take: limitPerKind,
    }),
    prisma.organization.findMany({
      where: {
        tenantId,
        archived: false,
        OR: [
          { legalName: { contains: q, mode: 'insensitive' } },
          { siret: { contains: q } },
          { network: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { legalName: 'asc' },
      select: { id: true, legalName: true, siret: true, opcoCode: true, legalForm: true },
      take: limitPerKind,
    }),
    prisma.trainingSession.findMany({
      where: {
        tenantId,
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { product: { title: { contains: q, mode: 'insensitive' } } },
        ],
      },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        startDate: true,
        product: { select: { title: true } },
      },
      take: limitPerKind,
    }),
    prisma.trainingProduct.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { theme: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { title: 'asc' },
      select: { id: true, code: true, title: true, durationHours: true, theme: true },
      take: limitPerKind,
    }),
  ]);

  return {
    persons: persons.map<UniversalHit>((p) => ({
      kind: 'person',
      id: p.id,
      title: `${p.firstName} ${p.lastName.toUpperCase()}`,
      subtitle: p.email,
      href: `/app/apprenants/${p.id}`,
    })),
    orgs: orgs.map<UniversalHit>((o) => ({
      kind: 'org',
      id: o.id,
      title: o.legalName,
      subtitle: [o.legalForm, o.siret, o.opcoCode ? `OPCO ${o.opcoCode}` : null]
        .filter(Boolean)
        .join(' · '),
      href: `/app/organisations/${o.id}`,
    })),
    sessions: sessions.map<UniversalHit>((s) => ({
      kind: 'session',
      id: s.id,
      title: s.name ?? s.product?.title ?? '(sans nom)',
      subtitle: `${s.code} · ${new Date(s.startDate).toLocaleDateString('fr-FR')}`,
      href: `/app/sessions/${s.id}`,
    })),
    products: products.map<UniversalHit>((pr) => ({
      kind: 'product',
      id: pr.id,
      title: pr.title,
      subtitle: [pr.code, pr.theme, `${pr.durationHours}h`].filter(Boolean).join(' · '),
      href: `/app/produits/${pr.id}`,
    })),
  };
}
