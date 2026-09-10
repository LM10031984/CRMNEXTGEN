/**
 * Les trois alertes opérationnelles de la chaîne (spec §11.1), câblées.
 *
 * A-1 nouveau lead · A-2 lead non traité depuis 24 h · A-3 dossier déposé.
 *
 * CE QUE CE MODULE NE FAIT PAS, ET C'EST VOULU
 *
 * Il ne DÉCIDE rien. Les décisions — faut-il alerter, qui reçoit, comment
 * regrouper — vivent dans `lead-stale.ts` et `preinscription-digest.ts`, en
 * fonctions pures testées. Ici on ne fait qu'exécuter : écrire la notification,
 * poser l'email dans le chokepoint, tracer. C'est la séparation qui permet de
 * tester la règle d'alerte sans cron, sans base et sans SMTP.
 *
 * Il ne construit pas non plus de second système de notification : `Notification`
 * et `sendMail` existent, avec leur garde-fou par catégorie fail-closed. Une
 * alerte qui se serait offert son propre canal aurait échappé aux réglages de
 * Paramètres — donc à la seule chose qui protège les boîtes mail de l'équipe.
 *
 * Aucune alerte ne fait échouer l'action qui l'a déclenchée : prévenir est un
 * effet de bord. Un email qui part mal ne doit pas empêcher un lead d'exister.
 */

import { prisma } from '@qualiof/db';
import { sendMail } from '@/lib/mailer';
import { loadOfConfig } from '@/lib/of-config';
import { renderAlerteInterne } from '@/lib/mailer-templates/alerte-interne';
import { newLeadRecipients, leadStaleRecipients } from './lead-stale';
import { sujetAlerteSubmission, type AlerteSubmission } from './preinscription-digest';

function appUrl(): string {
  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  return base.replace(/\/+$/, '');
}

interface Destinataire {
  id: string;
  role: string;
  email: string | null;
  firstName: string | null;
}

async function equipe(tenantId: string): Promise<Destinataire[]> {
  return prisma.user.findMany({
    where: { tenantId },
    select: { id: true, role: true, email: true, firstName: true },
  });
}

/**
 * Écrit les notifications cloche et envoie l'email — dans cet ordre.
 *
 * La cloche d'abord parce qu'elle est locale et ne peut pas échouer pour une
 * raison réseau : si le SMTP tombe, l'équipe voit quand même l'alerte en
 * ouvrant l'application. L'inverse laisserait une panne de mail effacer
 * complètement l'information.
 */
async function poser(args: {
  tenantId: string;
  type: string;
  userIds: string[];
  payload: Record<string, unknown>;
  destinataires: Destinataire[];
  category: 'new_lead' | 'preenrollment_submitted';
  subject: string;
  titre: string;
  intro: string;
  vedette: string;
  details?: { label: string; value: string }[];
  ctaLabel: string;
  ctaUrl: string;
  urgent?: boolean;
}): Promise<void> {
  if (args.userIds.length === 0) return;

  await prisma.notification.createMany({
    data: args.userIds.map((userId) => ({
      tenantId: args.tenantId,
      userId,
      type: args.type,
      payload: args.payload as never,
    })),
  });

  const emails = args.destinataires
    .filter((u) => args.userIds.includes(u.id) && u.email)
    .map((u) => u.email as string);
  if (emails.length === 0) return;

  const of = await loadOfConfig(args.tenantId);
  const { subject, html, text } = renderAlerteInterne(
    {
      subject: args.subject,
      titre: args.titre,
      intro: args.intro,
      vedette: args.vedette,
      details: args.details,
      ctaLabel: args.ctaLabel,
      ctaUrl: args.ctaUrl,
      urgent: args.urgent,
    },
    of,
  );

  // Un seul envoi multi-destinataires : l'alerte est interne, tout le monde
  // sait qui est dans l'équipe, et n envois séparés multiplieraient par n les
  // chances qu'un incident SMTP en fasse disparaître une partie sans trace.
  await sendMail({
    to: emails.join(', '),
    subject,
    html,
    text,
    context: { tenantId: args.tenantId, category: args.category, sessionId: null },
  });
}

/** A-1 — un lead vient de naître. */
export async function alerterNouveauLead(args: {
  tenantId: string;
  leadId: string;
}): Promise<void> {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: args.leadId, tenantId: args.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        source: true,
        ownerUserId: true,
      },
    });
    if (!lead) return;

    const users = await equipe(args.tenantId);
    const userIds = newLeadRecipients({ ownerUserId: lead.ownerUserId, users });
    const nom = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Prospect sans nom';

    await poser({
      tenantId: args.tenantId,
      type: 'lead.created',
      userIds,
      payload: { leadId: lead.id, prospectName: nom, source: lead.source ?? null },
      destinataires: users,
      category: 'new_lead',
      subject: `Nouveau lead — ${nom}`,
      titre: 'Nouveau lead',
      intro: lead.ownerUserId
        ? 'Un nouveau lead vient de vous être attribué.'
        : "Un nouveau lead vient d'arriver et n'est attribué à personne.",
      vedette: nom,
      details: [
        ...(lead.source ? [{ label: 'Source', value: lead.source }] : []),
        ...(lead.email ? [{ label: 'Email', value: lead.email }] : []),
        ...(lead.phone ? [{ label: 'Téléphone', value: lead.phone }] : []),
      ],
      ctaLabel: 'Voir le lead',
      ctaUrl: `${appUrl()}/app/leads/${lead.id}`,
    });
  } catch (e) {
    // Prévenir est un effet de bord : un lead doit exister même si l'alerte
    // échoue. On trace, on ne propage pas.
    console.error('[alertes] A-1 nouveau lead', e);
  }
}

/**
 * A-2 — ce lead dort depuis trop longtemps.
 *
 * Le marqueur `staleAlertedAt` est posé DANS la même opération, et c'est lui
 * qui garantit l'alerte unique. Le poser après l'envoi et non avant est
 * délibéré : si l'envoi échoue, le prochain passage du cron réessaiera. Un
 * marqueur posé d'avance transformerait un incident SMTP en silence définitif
 * sur ce lead — exactement le piège du compteur de relances « brûlé ».
 */
export async function alerterLeadDormant(args: {
  tenantId: string;
  leadId: string;
  hoursIdle: number;
}): Promise<void> {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: args.leadId, tenantId: args.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        source: true,
        ownerUserId: true,
        createdAt: true,
      },
    });
    if (!lead) return;

    const users = await equipe(args.tenantId);
    const userIds = leadStaleRecipients({ ownerUserId: lead.ownerUserId, users });
    const nom = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Prospect sans nom';

    await poser({
      tenantId: args.tenantId,
      type: 'lead.stale',
      userIds,
      payload: { leadId: lead.id, prospectName: nom, hoursIdle: args.hoursIdle },
      destinataires: users,
      category: 'new_lead',
      subject: `Lead sans réponse depuis ${args.hoursIdle} h — ${nom}`,
      titre: 'Un lead attend toujours',
      intro: `Ce lead est arrivé il y a ${args.hoursIdle} h et aucune action n'a encore été enregistrée dessus.`,
      vedette: nom,
      details: [
        ...(lead.source ? [{ label: 'Source', value: lead.source }] : []),
        ...(lead.phone ? [{ label: 'Téléphone', value: lead.phone }] : []),
        ...(lead.email ? [{ label: 'Email', value: lead.email }] : []),
      ],
      ctaLabel: 'Traiter le lead',
      ctaUrl: `${appUrl()}/app/leads/${lead.id}`,
      urgent: true,
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { staleAlertedAt: new Date() },
    });
  } catch (e) {
    console.error('[alertes] A-2 lead dormant', e);
  }
}

/**
 * A-3 — un ou plusieurs dossiers viennent d'être déposés.
 *
 * Destinataires : les ADMIN, et eux seuls — ce sont eux qui valident les
 * pièces. Alerter les commerciaux à chaque dépôt ferait du bruit sur une
 * tâche qui ne leur revient pas.
 */
export async function alerterPreinscriptionsDeposees(args: {
  tenantId: string;
  alerte: AlerteSubmission;
}): Promise<void> {
  try {
    const users = await equipe(args.tenantId);
    const admins = users.filter((u) => u.role === 'ADMIN');
    if (admins.length === 0) return;

    const a = args.alerte;
    const vedette =
      a.kind === 'digest'
        ? `${a.preEnrollmentIds.length} dossiers déposés`
        : a.nom;
    const details =
      a.kind === 'digest'
        ? [
            ...(a.batchLabel ? [{ label: 'Campagne', value: a.batchLabel }] : []),
            { label: 'Participants', value: a.noms.join(', ') },
          ]
        : a.batchLabel
          ? [{ label: 'Campagne', value: a.batchLabel }]
          : [];

    await poser({
      tenantId: args.tenantId,
      type: 'preenrollment.submitted',
      userIds: admins.map((u) => u.id),
      payload: {
        preEnrollmentIds: a.preEnrollmentIds,
        batchId: a.batchId,
        count: a.preEnrollmentIds.length,
      },
      destinataires: users,
      category: 'preenrollment_submitted',
      subject: sujetAlerteSubmission(a),
      titre: 'Dossier de pré-inscription à vérifier',
      intro:
        a.kind === 'digest'
          ? 'Plusieurs participants viennent de déposer leur dossier. Les pièces sont à vérifier.'
          : 'Un participant vient de déposer son dossier. Les pièces sont à vérifier.',
      vedette,
      details,
      ctaLabel: 'Vérifier les pièces',
      ctaUrl: `${appUrl()}/app/preinscriptions`,
    });

    await prisma.preEnrollment.updateMany({
      where: { id: { in: a.preEnrollmentIds }, tenantId: args.tenantId },
      data: { submissionAlertedAt: new Date() },
    });
  } catch (e) {
    console.error('[alertes] A-3 pré-inscriptions déposées', e);
  }
}
