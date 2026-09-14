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
import {
  alerterConventionNonEnvoyee,
  alerterLeadsDormants,
  alerterPreinscriptionsDeposees,
} from '@/lib/alertes/notifier';
import {
  JOURS_AVANT_ALERTE_CONVENTION,
  TITRE_TACHE_CONVENTION_NON_ENVOYEE,
  decideAlerteConventionNonEnvoyee,
} from '@/lib/alertes/convention-non-envoyee';

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

  // On décide d'abord pour TOUS, on envoie ensuite : c'est ce qui permet le
  // digest. Envoyer dans la boucle produisait un email par lead — trente le
  // lendemain d'un salon (11/09/2026).
  const aAlerter = new Map<string, { tenantId: string; hoursIdle: number }>();
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
    aAlerter.set(lead.id, { tenantId: lead.tenantId, hoursIdle: decision.hoursIdle });
  }

  // Un envoi par tenant — mono-tenant en pratique, mais la boucle coûte une
  // ligne et évite d'avoir à y revenir.
  const parTenantLeads = new Map<string, string[]>();
  const hoursIdleParLead: Record<string, number> = {};
  for (const [leadId, { tenantId, hoursIdle }] of aAlerter) {
    hoursIdleParLead[leadId] = hoursIdle;
    const liste = parTenantLeads.get(tenantId);
    if (liste) liste.push(leadId);
    else parTenantLeads.set(tenantId, [leadId]);
  }

  let leadsAlertes = 0;
  let envoisLeads = 0;
  for (const [tenantId, leadIds] of parTenantLeads) {
    const r = await alerterLeadsDormants({ tenantId, leadIds, hoursIdleParLead });
    leadsAlertes += r.leadsAlertes;
    envoisLeads += r.envois;
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

  // ── J-15 — les conventions qui ne sont pas parties (lot D, spec §5) ───────
  //
  // Une session démarre dans quinze jours, elle a des inscrits, et aucune
  // convention n'est partie en signature. C'est le seul point du chantier où la
  // machine est mieux placée que l'humain : la question ne se pose qu'en
  // regardant le calendrier.
  //
  // Le pré-filtre SQL ne fait que réduire le volume — c'est la fonction pure qui
  // DÉCIDE. Dupliquer la règle en SQL la ferait diverger du test.
  const finFenetreConvention = new Date(
    now.getTime() + (JOURS_AVANT_ALERTE_CONVENTION + 1) * 86_400_000,
  );
  const sessionsProches = await prisma.trainingSession.findMany({
    where: {
      startDate: { gte: now, lte: finFenetreConvention },
      status: { notIn: ['DRAFT', 'CANCELLED', 'COMPLETED'] },
    },
    select: {
      id: true,
      tenantId: true,
      code: true,
      name: true,
      startDate: true,
      status: true,
      _count: { select: { participants: true } },
      // Une demande sur N'IMPORTE QUELLE pièce vaut « c'est parti » : on ne
      // réclame pas un envoi à quelqu'un qui vient d'en faire un.
      signatureRequests: { select: { id: true }, take: 1 },
      // ⚠ ET la convention signée À LA MAIN (lot A), qui ne crée aucune
      // demande. Sans elle, l'alerte réclamerait un envoi pour une pièce déjà
      // signée — et une alerte qui se trompe une fois n'est plus lue.
      documents: {
        where: { type: 'CONVENTION', signedPdfUrl: { not: null } },
        select: { id: true },
        take: 1,
      },
      tasks: {
        where: { title: TITRE_TACHE_CONVENTION_NON_ENVOYEE },
        select: { id: true },
        take: 1,
      },
    },
  });

  let conventionsAlertees = 0;
  for (const s of sessionsProches) {
    const decision = decideAlerteConventionNonEnvoyee(
      {
        startDate: s.startDate,
        status: s.status,
        nbParticipants: s._count.participants,
        aUneDemandeDeSignature: s.signatureRequests.length > 0,
        aUneConventionSignee: s.documents.length > 0,
        dejaAlertee: s.tasks.length > 0,
      },
      now,
    );
    if (!decision.alerter) continue;
    const r = await alerterConventionNonEnvoyee({
      tenantId: s.tenantId,
      sessionId: s.id,
      libelleSession: s.code ?? s.name ?? s.id.slice(0, 8),
      startDate: s.startDate,
      joursRestants: decision.joursRestants,
      nbParticipants: s._count.participants,
    });
    if (r.alertee) conventionsAlertees += 1;
  }

  const resultat = {
    ok: true,
    at: now.toISOString(),
    leadsDormantsAlertes: leadsAlertes,
    // Combien d'emails ont RÉELLEMENT été envoyés pour ces leads : c'est le
    // chiffre qui dit si le digest tient sa promesse.
    leadsDormantsEnvois: envoisLeads,
    leadsExamines: candidats.length,
    alertesDossiers,
    dossiersAnnonces: deposes.length,
    conventionsAlertees,
    sessionsExaminees: sessionsProches.length,
  };
  console.log('[cron:alerts]', JSON.stringify(resultat));
  return NextResponse.json(resultat);
}
