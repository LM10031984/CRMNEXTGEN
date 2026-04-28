'use server';

/**
 * Détection des "trous" entre l'Excel SmartOF et la base CRM.
 * Re-lit l'Excel sessions, pour chaque session compare la liste des apprenants attendus
 * avec ce qui est inscrit en base.
 *
 * Renvoie pour chaque apprenant manquant :
 *   - le nom brut depuis Excel
 *   - une liste de candidats Person triés par similarité
 *   - les commanditaires de la session (utiles pour le PersonOrOrgPicker)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import { prisma } from '@qualiof/db';
import { normalizeName } from '@qualiof/shared';
import { validateRequest } from '@/lib/auth';

const EXCEL_PATH = path.resolve(
  process.cwd(),
  '..',
  '..',
  'Export des sessions SmartOF - 28_04_2026.xlsx',
);

export interface GapCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  legalLinks: Array<{
    id: string;
    role: string;
    isPrimary: boolean;
    organization: {
      id: string;
      legalName: string;
      legalForm: string;
      siret: string | null;
      opcoCode: string | null;
    };
  }>;
}

export interface SessionGap {
  sessionId: string;
  sessionCode: string;
  sessionName: string | null;
  startDate: Date;
  status: string;
  expectedCount: number;
  registeredCount: number;
  missing: Array<{
    rawName: string;
    candidates: GapCandidate[];
  }>;
  unmatchedSponsorBudget: number; // budget total / expectedCount
}

function parsePersonName(raw: string): { firstName: string; lastName: string } {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  if (parts.length < 2) return { firstName: cleaned, lastName: '' };
  if (parts[0]! === parts[0]!.toUpperCase() && parts[0]!.length > 1) {
    let end = 1;
    while (end < parts.length && parts[end]!.length > 1 && parts[end]! === parts[end]!.toUpperCase()) end++;
    return { lastName: parts.slice(0, end).join(' '), firstName: parts.slice(end).join(' ') };
  }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1]! };
}

function splitMultilineList(s: string | null): string[] {
  if (!s) return [];
  return String(s).split('|').map((x) => x.trim()).filter(Boolean);
}

function similarity(a: string, b: string): number {
  const aN = normalizeName(a);
  const bN = normalizeName(b);
  if (!aN || !bN) return 0;
  if (aN === bN) return 1;
  if (aN.includes(bN) || bN.includes(aN)) return 0.85;
  // Jaccard sur tokens
  const aTok = new Set(aN.split(' '));
  const bTok = new Set(bN.split(' '));
  const inter = [...aTok].filter((t) => bTok.has(t)).length;
  const uni = new Set([...aTok, ...bTok]).size;
  return uni === 0 ? 0 : inter / uni;
}

export async function getSessionGaps(): Promise<{ sessions: SessionGap[]; total: number; totalMissing: number }> {
  const { user } = await validateRequest();
  if (!user) return { sessions: [], total: 0, totalMissing: 0 };

  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Fichier Excel introuvable : ${EXCEL_PATH}`);
  }

  const buf = fs.readFileSync(EXCEL_PATH);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<{
    ID: string;
    Nom: string;
    Apprenants: string;
    Commanditaires: string;
    'Budget Total': string;
  }>(ws!, { defval: null, raw: false });

  // Charge tous les Persons une fois
  const persons = await prisma.person.findMany({
    where: { tenantId: user.tenantId, archived: false },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      legalLinks: {
        orderBy: { isPrimary: 'desc' },
        include: { organization: { select: { id: true, legalName: true, legalForm: true, siret: true, opcoCode: true } } },
      },
    },
  });

  // Charge toutes les sessions du tenant
  const dbSessions = await prisma.trainingSession.findMany({
    where: { tenantId: user.tenantId },
    include: { participants: { select: { personId: true } } },
  });
  const dbBySesCode = new Map(dbSessions.map((s) => [s.code, s]));

  const out: SessionGap[] = [];
  let totalMissing = 0;

  for (const row of rows) {
    const dbSession = dbBySesCode.get(String(row.ID));
    if (!dbSession) continue;

    const expectedNames = splitMultilineList(row.Apprenants);
    if (expectedNames.length === 0) continue;

    const registeredPersonIds = new Set(dbSession.participants.map((p) => p.personId));
    const missing: SessionGap['missing'] = [];

    for (const rawName of expectedNames) {
      const { firstName, lastName } = parsePersonName(rawName);
      // Cherche les candidats
      const ranked = persons
        .map((p) => ({
          p,
          score: similarity(`${p.firstName} ${p.lastName}`, `${firstName} ${lastName}`),
        }))
        .filter((x) => x.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((x) => x.p);

      // Y a-t-il un candidat parfait déjà inscrit ? Skip alors
      const alreadyRegistered = ranked.some((c) => registeredPersonIds.has(c.id));
      if (alreadyRegistered) continue;

      missing.push({ rawName, candidates: ranked });
    }

    if (missing.length === 0) continue;

    const budget = parseFloat(String(row['Budget Total'] ?? '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    out.push({
      sessionId: dbSession.id,
      sessionCode: dbSession.code,
      sessionName: dbSession.name ?? row.Nom,
      startDate: dbSession.startDate,
      status: dbSession.status,
      expectedCount: expectedNames.length,
      registeredCount: dbSession.participants.length,
      missing,
      unmatchedSponsorBudget: expectedNames.length > 0 ? budget / expectedNames.length : 0,
    });
    totalMissing += missing.length;
  }

  // Tri : sessions avec le plus de manquants en premier
  out.sort((a, b) => b.missing.length - a.missing.length || b.startDate.getTime() - a.startDate.getTime());

  return { sessions: out, total: out.length, totalMissing };
}

export async function ignoreMissingParticipant(opts: {
  sessionId: string;
  rawName: string;
}): Promise<{ ok: boolean }> {
  // Marque ce nom comme "non importable" dans les notes internes de la session
  const { user } = await validateRequest();
  if (!user) return { ok: false };
  const s = await prisma.trainingSession.findFirst({
    where: { id: opts.sessionId, tenantId: user.tenantId },
  });
  if (!s) return { ok: false };
  const tag = `\n[IGNORED] ${opts.rawName}`;
  await prisma.trainingSession.update({
    where: { id: opts.sessionId },
    data: { internalNotes: (s.internalNotes ?? '') + tag },
  });
  return { ok: true };
}
