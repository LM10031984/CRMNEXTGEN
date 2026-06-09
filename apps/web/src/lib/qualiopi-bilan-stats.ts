/**
 * Bilan Qualiopi C1.i2 — Indicateurs de résultats annuels.
 *
 * Récap par année des sessions terminées : formation, formateur, dates, heures,
 * stagiaires prévus/présents/absents/abandons (+ causes), satisfaction moyenne,
 * taux de recommandation, prix TTC.
 *
 * Périmètre : sessions COMPLETED + IN_PROGRESS de l'année (selon startDate).
 * Les stats satisfaction proviennent des PedagogicalAsset SATISFACTION_CHAUD
 * (rawJson contient les ratings du stagiaire).
 */

import { prisma } from '@qualiof/db';

export interface BilanRow {
  sessionId: string;
  sessionCode: string;
  formationTitre: string;
  formateur: string;
  datesLabel: string;
  startDate: Date;
  endDate: Date;
  nbHeures: number;
  nbStagiairesPrevu: number; // PRE_ENROLLED + CONFIRMED + ATTENDED + NO_SHOW + CANCELLED
  nbStagiairesPresents: number; // ATTENDED + CONFIRMED en cours
  nbStagiairesAbsents: number; // NO_SHOW
  causeAbsence: string;
  nbStagiairesAbandonnes: number; // CANCELLED
  causeAbandon: string;
  noteMoyenneSatisfaction: number | null; // /5 — moyenne sur les ratings TC/B/M
  tauxRecommandation: number | null; // % stagiaires recommandant
  prixTTC: number; // somme priceHT × participants (TVA non applicable selon CGI 261-4-4°)
}

export interface BilanData {
  year: number;
  rows: BilanRow[];
  total: {
    nbSessions: number;
    nbHeures: number;
    nbStagiairesPrevu: number;
    nbStagiairesPresents: number;
    nbStagiairesAbsents: number;
    nbStagiairesAbandonnes: number;
    noteMoyenneSatisfaction: number | null;
    tauxRecommandation: number | null;
    prixTTC: number;
  };
  /** Années disponibles dans le tenant (présence d'au moins 1 session). */
  availableYears: number[];
}

const RATING_TO_NOTE: Record<string, number> = {
  'Très bien': 5,
  'Bien': 4,
  'Moyen': 2.5,
  'Mauvais': 1,
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function aggregateSatisfaction(satisfactionsRaw: any[]): { note: number | null; reco: number | null } {
  if (!satisfactionsRaw.length) return { note: null, reco: null };
  const notes: number[] = [];
  let recommandeYes = 0;
  let recommandeTotal = 0;
  for (const raw of satisfactionsRaw) {
    if (!raw || typeof raw !== 'object') continue;
    // rawJson satisfaction-chaud : { organisation, moyens, contenu, animation, recommandation }
    // Chaque section a des ratings TC/B/M/Mv. On note 5/4/2.5/1 et on moyenne.
    const sectionRatings: string[] = [];
    for (const sectionKey of ['organisation', 'moyens', 'contenu', 'animation']) {
      const section = raw[sectionKey];
      if (section && typeof section === 'object') {
        for (const [key, val] of Object.entries(section)) {
          if (key === 'commentaire') continue;
          if (typeof val === 'string' && RATING_TO_NOTE[val] !== undefined) {
            sectionRatings.push(val);
          }
        }
      }
    }
    if (sectionRatings.length > 0) {
      const avg =
        sectionRatings.reduce((s, r) => s + (RATING_TO_NOTE[r] ?? 0), 0) / sectionRatings.length;
      notes.push(avg);
    }
    // recommandation : "Oui" / "Non"
    const recoVal = raw.recommandation?.choix ?? raw.recommandation;
    if (typeof recoVal === 'string') {
      recommandeTotal++;
      if (recoVal.toLowerCase().startsWith('oui')) recommandeYes++;
    }
  }
  const note = notes.length > 0 ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
  const reco = recommandeTotal > 0 ? (recommandeYes / recommandeTotal) * 100 : null;
  return { note, reco };
}

export async function getQualiopiBilan(tenantId: string, year: number): Promise<BilanData> {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const sessions = await prisma.trainingSession.findMany({
    where: {
      tenantId,
      startDate: { gte: start, lt: end },
      status: { in: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
    },
    include: {
      product: { select: { title: true, durationHours: true } },
      trainers: { include: { person: { select: { firstName: true, lastName: true } } } },
      participants: {
        select: {
          id: true,
          enrollmentStatus: true,
          priceHT: true,
        },
      },
    },
    orderBy: { startDate: 'asc' },
  });

  // Pour les ratings satisfaction, on charge en bloc tous les PedagogicalAsset
  // SATISFACTION_CHAUD des sessions de l'année.
  const sessionIds = sessions.map((s) => s.id);
  const allSatAssets = sessionIds.length
    ? await prisma.pedagogicalAsset.findMany({
        where: {
          tenantId,
          sessionId: { in: sessionIds },
          kind: 'SATISFACTION_CHAUD',
        },
        select: { sessionId: true, rawJson: true },
      })
    : [];

  const satBySession = new Map<string, any[]>();
  for (const a of allSatAssets) {
    const list = satBySession.get(a.sessionId) ?? [];
    list.push(a.rawJson);
    satBySession.set(a.sessionId, list);
  }

  const rows: BilanRow[] = sessions.map((s) => {
    const totalParticipants = s.participants.length;
    const present = s.participants.filter(
      (p) => p.enrollmentStatus === 'ATTENDED' || p.enrollmentStatus === 'CONFIRMED',
    ).length;
    const absent = s.participants.filter((p) => p.enrollmentStatus === 'NO_SHOW').length;
    const abandon = s.participants.filter((p) => p.enrollmentStatus === 'CANCELLED').length;
    const prixTTC = s.participants.reduce((sum, p) => sum + Number(p.priceHT), 0);

    const sats = satBySession.get(s.id) ?? [];
    const { note, reco } = aggregateSatisfaction(sats);

    const sameDay = s.startDate.toDateString() === s.endDate.toDateString();
    const datesLabel = sameDay
      ? formatDate(s.startDate)
      : `du ${formatDate(s.startDate)} au ${formatDate(s.endDate)}`;

    return {
      sessionId: s.id,
      sessionCode: s.code,
      formationTitre: s.product.title,
      formateur:
        s.trainers.length > 0
          ? s.trainers
              .map((t) => `${t.person.firstName} ${t.person.lastName}`.trim())
              .join(', ')
          : '—',
      datesLabel,
      startDate: s.startDate,
      endDate: s.endDate,
      nbHeures: s.product.durationHours,
      nbStagiairesPrevu: totalParticipants,
      nbStagiairesPresents: present,
      nbStagiairesAbsents: absent,
      causeAbsence: absent > 0 ? '— à compléter manuellement —' : '',
      nbStagiairesAbandonnes: abandon,
      causeAbandon: abandon > 0 ? '— à compléter manuellement —' : '',
      noteMoyenneSatisfaction: note,
      tauxRecommandation: reco,
      prixTTC,
    };
  });

  // Total agrégé
  const allNotes = rows.map((r) => r.noteMoyenneSatisfaction).filter((n): n is number => n !== null);
  const allRecos = rows.map((r) => r.tauxRecommandation).filter((n): n is number => n !== null);
  const total = {
    nbSessions: rows.length,
    nbHeures: rows.reduce((s, r) => s + r.nbHeures, 0),
    nbStagiairesPrevu: rows.reduce((s, r) => s + r.nbStagiairesPrevu, 0),
    nbStagiairesPresents: rows.reduce((s, r) => s + r.nbStagiairesPresents, 0),
    nbStagiairesAbsents: rows.reduce((s, r) => s + r.nbStagiairesAbsents, 0),
    nbStagiairesAbandonnes: rows.reduce((s, r) => s + r.nbStagiairesAbandonnes, 0),
    noteMoyenneSatisfaction:
      allNotes.length > 0 ? allNotes.reduce((a, b) => a + b, 0) / allNotes.length : null,
    tauxRecommandation:
      allRecos.length > 0 ? allRecos.reduce((a, b) => a + b, 0) / allRecos.length : null,
    prixTTC: rows.reduce((s, r) => s + r.prixTTC, 0),
  };

  // Années disponibles (toutes les sessions du tenant, group by year)
  const allSessions = await prisma.trainingSession.findMany({
    where: { tenantId },
    select: { startDate: true },
  });
  const yearSet = new Set(allSessions.map((s) => s.startDate.getFullYear()));
  if (yearSet.size === 0) yearSet.add(new Date().getFullYear());
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  return { year, rows, total, availableYears };
}
