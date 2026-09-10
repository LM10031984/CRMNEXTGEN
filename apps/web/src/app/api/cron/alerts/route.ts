/**
 * Cron des alertes opérationnelles (spec §11.1) — A-2 et A-3.
 *
 * A-1 (« nouveau lead ») n'est PAS ici : elle part au moment où le lead naît,
 * dans l'action qui le crée. Une alerte « nouveau » qui arriverait au prochain
 * passage du cron ne serait plus une alerte de nouveauté.
 *
 * Ce que le cron fait, lui, c'est ce qu'on ne peut constater qu'en regardant
 * l'heure : « ce lead dort depuis 24 h » (A-2), et « des dossiers sont tombés,
 * regroupons-les » (A-3).
 *
 * Cadence horaire (spec §11.1). Protégé par `CRON_SECRET`, comme les autres
 * routes cron du dépôt.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/alerts
 *
 * Mono-tenant comme les crons existants : Start Academy est seule en prod. Le
 * jour où ce ne sera plus vrai, c'est la boucle sur les tenants qu'il faudra
 * ajouter — pas la logique, qui est déjà scopée par `tenantId`.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@qualiof/db';
import { decideLeadStaleAlert, LEAD_STALE_HOURS } from '@/lib/alertes/lead-stale';
import {
  grouperAlertesSubmission,
  type SubmissionSnapshot,
} from '@/lib/alertes/preinscription-digest';
import { alerterLeadDormant, alerterPreinscriptionsDeposees } from '@/lib/alertes/notifier';

export const dynamic = 'force-dynamic';

/**
 * On ne remonte pas plus loin que 30 jours. Un lead oublié depuis six mois
 * n'a pas besoin d'une alerte, il a besoin d'une décision — et réveiller
 * l'historique entier au premier passage du cron enverrait une avalanche
 * d'emails pour des leads que personne ne compte plus traiter.
 */
const FENETRE_RATTRAPAGE_JOURS = 30;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse('CRON_SECRET non configuré', { status: 503 });
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) return unauthorized();

  const now = new Date();
  const debutFenetre = new Date(now.getTime() - FENETRE_RATTRAPAGE_JOURS * 86_400_000);

  // ── A-2 — les leads qui dorment ────────────────────────────────────────────
  const candidats = await prisma.lead.findMany({
    where: {
      status: 'NEW',
      staleAlertedAt: null,
      createdAt: { gte: debutFenetre, lt: new Date(now.getTime() - LEAD_STALE_HOURS * 3_600_000) },
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      createdAt: true,
      staleAlertedAt: true,
      actions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { actions: true } },
    },
  });

  let leadsAlertes = 0;
  for (const lead of candidats) {
    // La requête ci-dessus est un pré-filtre de performance ; c'est la fonction
    // pure qui décide. Dupliquer la règle en SQL la ferait diverger du test.
    const decision = decideLeadStaleAlert(
      {
        status: lead.status,
        createdAt: lead.createdAt,
        lastActionAt: lead.actions[0]?.createdAt ?? null,
        actionCount: lead._count.actions,
        staleAlertedAt: lead.staleAlertedAt,
      },
      now,
    );
    if (!decision.alert) continue;
    await alerterLeadDormant({
      tenantId: lead.tenantId,
      leadId: lead.id,
      hoursIdle: decision.hoursIdle,
    });
    leadsAlertes += 1;
  }

  // ── A-3 — les dossiers déposés, regroupés ─────────────────────────────────
  //
  // Aucune fenêtre de maturation ici, et c'est réfléchi. On avait d'abord
  // attendu une heure avant d'annoncer, pour laisser le groupe se former.
  // Déroulé le scénario réel : 3 dossiers à 10 h 55, 5 à 11 h 05. Avec
  // maturation → un digest de 3 à midi, un de 5 à 13 h. Sans → un digest de 3 à
  // 11 h, un de 5 à midi. MÊME nombre d'emails, une heure plus tôt.
  //
  // Le regroupement ne vient pas de l'attente, il vient du fait que le cron
  // ramasse d'un coup tout ce qui n'a pas encore été annoncé. Attendre ne
  // faisait que retarder.
  const deposes = await prisma.preEnrollment.findMany({
    where: {
      submittedAt: { not: null, gte: debutFenetre },
      submissionAlertedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      batchId: true,
      firstName: true,
      lastName: true,
      submittedAt: true,
      batch: { select: { label: true } },
    },
  });

  const parTenant = new Map<string, SubmissionSnapshot[]>();
  for (const p of deposes) {
    if (!p.submittedAt) continue;
    const snap: SubmissionSnapshot = {
      id: p.id,
      batchId: p.batchId,
      batchLabel: p.batch?.label ?? null,
      firstName: p.firstName,
      lastName: p.lastName,
      submittedAt: p.submittedAt,
    };
    const liste = parTenant.get(p.tenantId);
    if (liste) liste.push(snap);
    else parTenant.set(p.tenantId, [snap]);
  }

  let alertesDossiers = 0;
  for (const [tenantId, snaps] of parTenant) {
    for (const alerte of grouperAlertesSubmission(snaps)) {
      await alerterPreinscriptionsDeposees({ tenantId, alerte });
      alertesDossiers += 1;
    }
  }

  const resultat = {
    ok: true,
    at: now.toISOString(),
    leadsDormantsAlertes: leadsAlertes,
    leadsExamines: candidats.length,
    alertesDossiers,
    dossiersAnnonces: deposes.length,
  };
  console.log('[cron:alerts]', JSON.stringify(resultat));
  return NextResponse.json(resultat);
}
