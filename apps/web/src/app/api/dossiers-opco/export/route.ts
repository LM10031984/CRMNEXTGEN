/**
 * Export CSV (UTF-8 BOM Excel-friendly) de la vue Dossiers OPCO filtrée.
 *
 * Reprend les mêmes searchParams que la page :
 *   ?year=2025&opco=AGEFICE&status=attente-opco&q=...&sort=montant&dir=desc
 *
 * Format de sortie : nommage `dossiers-opco_<opco>_<year>_<YYYYMMDD>.csv`
 */

import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function todayCompact(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function GET(req: Request) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const year = url.searchParams.get('year');
  const opco = url.searchParams.get('opco');
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q')?.trim();

  const where: Prisma.SessionParticipantWhereInput = {
    session: { tenantId: user.tenantId },
  };
  if (year && year !== 'all') {
    const y = parseInt(year, 10);
    if (Number.isFinite(y)) {
      where.session = {
        tenantId: user.tenantId,
        startDate: {
          gte: new Date(Date.UTC(y, 0, 1)),
          lt: new Date(Date.UTC(y + 1, 0, 1)),
        },
      };
    }
  }
  if (opco && opco !== 'all') where.sponsorOrg = { opcoCode: opco };
  if (status === 'a-facturer') where.invoiceSent = false;
  if (status === 'attente-opco') {
    where.invoiceSent = true;
    where.opcoReimbursed = false;
  }
  if (status === 'attente-client') {
    where.invoiceSent = true;
    where.paymentReceived = false;
  }
  if (status === 'complet') {
    where.invoiceSent = true;
    where.opcoReimbursed = true;
    where.paymentReceived = true;
  }
  if (q) {
    where.OR = [
      { person: { firstName: { contains: q, mode: 'insensitive' } } },
      { person: { lastName: { contains: q, mode: 'insensitive' } } },
      { person: { email: { contains: q, mode: 'insensitive' } } },
      { sponsorOrg: { legalName: { contains: q, mode: 'insensitive' } } },
      { session: { code: { contains: q, mode: 'insensitive' } } },
      { session: { name: { contains: q, mode: 'insensitive' } } },
      { session: { product: { title: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  const rows = await prisma.sessionParticipant.findMany({
    where,
    orderBy: { session: { startDate: 'desc' } },
    select: {
      priceHT: true,
      amountCollected: true,
      invoiceSent: true,
      opcoApproved: true,
      opcoReimbursed: true,
      paymentReceived: true,
      financingMode: true,
      person: { select: { firstName: true, lastName: true, email: true } },
      sponsorOrg: { select: { legalName: true, opcoCode: true } },
      session: { select: { code: true, name: true, startDate: true, endDate: true } },
    },
  });

  const headers = [
    'Date début',
    'Date fin',
    'Code session',
    'Nom session',
    'Apprenant',
    'Email',
    'Sponsor',
    'OPCO',
    'Mode financement',
    'Montant HT',
    'Encaissé',
    'Facture émise',
    'OPCO validé',
    'OPCO remboursé',
    'Client payé',
  ];

  const lines = [headers.map(csvEscape).join(';')];
  for (const r of rows) {
    const apprenant = `${r.person.firstName} ${r.person.lastName}`.trim();
    lines.push(
      [
        fmtDate.format(r.session.startDate),
        fmtDate.format(r.session.endDate),
        r.session.code ?? '',
        r.session.name ?? '',
        apprenant,
        r.person.email ?? '',
        r.sponsorOrg?.legalName ?? '',
        r.sponsorOrg?.opcoCode ?? '',
        r.financingMode ?? '',
        Number(r.priceHT).toFixed(2),
        Number(r.amountCollected).toFixed(2),
        r.invoiceSent ? 'OUI' : 'NON',
        r.opcoApproved ? 'OUI' : 'NON',
        r.opcoReimbursed ? 'OUI' : 'NON',
        r.paymentReceived ? 'OUI' : 'NON',
      ]
        .map(csvEscape)
        .join(';'),
    );
  }

  // BOM UTF-8 pour qu'Excel ouvre correctement les accents
  const BOM = '﻿';
  const body = BOM + lines.join('\r\n');

  const opcoLabel = opco && opco !== 'all' ? opco.toUpperCase() : 'tous';
  const yearLabel = year && year !== 'all' ? year : 'all';
  const filename = `dossiers-opco_${opcoLabel}_${yearLabel}_${todayCompact()}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
