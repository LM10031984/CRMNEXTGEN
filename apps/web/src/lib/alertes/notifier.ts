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
import { grouperLeadsDormants } from './lead-stale-digest';
import { EQUIPE_JOIGNABLE } from './destinataires';
import { sujetAlerteSubmission, type AlerteSubmission } from './preinscription-digest';
import { TITRE_TACHE_CONVENTION_NON_ENVOYEE } from './convention-non-envoyee';

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

/**
 * L'équipe JOIGNABLE — le filtre est dans `EQUIPE_JOIGNABLE`, avec ses motifs.
 *
 * Sans lui, chaque alerte partait aussi aux comptes sans boîte (`e2e@`,
 * `admin@`) et revenait en bounce sur `formation@`, l'expéditeur lui-même
 * (constat Laurent du 11/09/2026). Filtrer ICI plutôt que dans `sendMail` :
 * `sendMail` ne reçoit qu'une chaîne d'adresses, et sert aussi aux apprenants
 * et aux financeurs, qui ne sont pas des `User`. La question « ce compte est-il
 * joignable ? » se pose là où l'on constitue la liste, pas au moment de poster.
 */
async function equipe(tenantId: string): Promise<Destinataire[]> {
  return prisma.user.findMany({
    where: { tenantId, ...EQUIPE_JOIGNABLE },
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
  /**
   * Une catégorie EXISTANTE, toujours : une alerte qui s'offrirait son propre
   * canal échapperait aux réglages de Paramètres — donc à la seule chose qui
   * protège les boîtes de l'équipe. `internal_notification` est celle des
   * alertes qui ne portent ni lead ni pré-inscription (lot D, J-15).
   */
  category: 'new_lead' | 'preenrollment_submitted' | 'internal_notification';
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
 * A-2 — les leads qui dorment depuis trop longtemps, en UN envoi.
 *
 * Avant le 11/09/2026, cette alerte partait lead par lead. Au premier passage
 * sur un historique — ou le lendemain d'un salon, quand trente contacts sont
 * entrés d'un coup — la boîte recevait trente emails en une minute. Une
 * avalanche ne se lit pas : elle s'archive en bloc, et le lead qui méritait un
 * rappel disparaît avec les autres.
 *
 * Le regroupement se fait par ensemble de destinataires (cf.
 * `lead-stale-digest`), pour que personne ne reçoive les leads d'un autre.
 *
 * Les marqueurs `staleAlertedAt` sont posés APRÈS l'envoi et non avant, et
 * c'est délibéré : si l'envoi échoue, le prochain passage du cron réessaiera.
 * Un marqueur posé d'avance transformerait un incident SMTP en silence
 * définitif sur ces leads — exactement le piège du compteur de relances
 * « brûlé ».
 */
export async function alerterLeadsDormants(args: {
  tenantId: string;
  leadIds: string[];
  /** Ancienneté calculée par le cron, indexée par `Lead.id`. */
  hoursIdleParLead: Record<string, number>;
}): Promise<{ envois: number; leadsAlertes: number }> {
  if (args.leadIds.length === 0) return { envois: 0, leadsAlertes: 0 };
  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: args.leadIds }, tenantId: args.tenantId },
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
    if (leads.length === 0) return { envois: 0, leadsAlertes: 0 };

    const users = await equipe(args.tenantId);

    const groupes = grouperLeadsDormants(
      leads.map((l) => ({
        id: l.id,
        nom: `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() || 'Prospect sans nom',
        hoursIdle: args.hoursIdleParLead[l.id] ?? 0,
        source: l.source ?? null,
        ownerUserId: l.ownerUserId,
      })),
      (lead) => leadStaleRecipients({ ownerUserId: lead.ownerUserId, users }),
    );

    const alertes = new Set<string>();
    for (const groupe of groupes) {
      const n = groupe.leads.length;
      const pluriel = n > 1;

      await poser({
        tenantId: args.tenantId,
        type: 'lead.stale',
        userIds: groupe.userIds,
        payload: { leadIds: groupe.leads.map((l) => l.id), count: n },
        destinataires: users,
        category: 'new_lead',
        subject: pluriel
          ? `${n} leads sans réponse`
          : `Lead sans réponse depuis ${groupe.leads[0]!.hoursIdle} h — ${groupe.leads[0]!.nom}`,
        titre: pluriel ? 'Des leads attendent toujours' : 'Un lead attend toujours',
        intro: pluriel
          ? `${n} leads sont arrivés il y a plus de 24 h et aucune action n'a encore été enregistrée dessus. Le plus ancien est en tête.`
          : `Ce lead est arrivé il y a ${groupe.leads[0]!.hoursIdle} h et aucune action n'a encore été enregistrée dessus.`,
        vedette: pluriel ? `${n} leads sans réponse` : groupe.leads[0]!.nom,
        // Un lead par ligne : le nom, depuis combien de temps, et d'où il vient.
        details: groupe.leads.map((l) => ({
          label: l.nom,
          value: `${l.hoursIdle} h${l.source ? ` · ${l.source}` : ''}`,
        })),
        ctaLabel: pluriel ? 'Voir les leads' : 'Traiter le lead',
        ctaUrl: pluriel
          ? `${appUrl()}/app/leads`
          : `${appUrl()}/app/leads/${groupe.leads[0]!.id}`,
        urgent: true,
      });

      for (const l of groupe.leads) alertes.add(l.id);
    }

    if (alertes.size > 0) {
      await prisma.lead.updateMany({
        where: { id: { in: [...alertes] } },
        data: { staleAlertedAt: new Date() },
      });
    }
    return { envois: groupes.length, leadsAlertes: alertes.size };
  } catch (e) {
    // Prévenir est un effet de bord : un lead doit exister même si l'alerte
    // échoue. On trace, on ne propage pas.
    console.error('[alertes] A-2 leads dormants', e);
    return { envois: 0, leadsAlertes: 0 };
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

/**
 * Lot D — « Convention non envoyée pour signature », à J-15.
 *
 * Destinataires : ADMIN et MANAGER. Ce sont eux qui peuvent envoyer — les trois
 * server actions de signature refusent COMMERCIAL, et alerter quelqu'un sur un
 * geste qu'on lui refuse est la meilleure façon de faire ignorer l'alerte.
 *
 * ⚠ LA TÂCHE D'ABORD, L'EMAIL ENSUITE, et cet ordre est la garantie
 * d'idempotence : c'est l'existence de la `Task` qui empêche le cron horaire de
 * ré-alerter. Envoyer avant de l'écrire ferait partir une alerte par heure si
 * la création échouait — exactement le défaut qu'un digest est censé éviter.
 *
 * UN ENVOI PAR SESSION, volontairement : contrairement aux leads dormants, il
 * n'y a jamais trente sessions à J-15 le même jour, et chaque session appelle
 * un geste distinct sur un écran distinct. Les regrouper ferait perdre le lien
 * direct « cliquer, envoyer ».
 */
export async function alerterConventionNonEnvoyee(args: {
  tenantId: string;
  sessionId: string;
  /** `code ?? name` — ce que l'équipe lit sur la fiche. */
  libelleSession: string;
  startDate: Date;
  joursRestants: number;
  nbParticipants: number;
}): Promise<{ alertee: boolean }> {
  try {
    const users = await equipe(args.tenantId);
    const responsables = users.filter((u) => u.role === 'ADMIN' || u.role === 'MANAGER');
    if (responsables.length === 0) return { alertee: false };

    // Le marqueur, écrit AVANT l'envoi. Le `dueDate` est la date de début : la
    // tâche cesse d'avoir un sens le jour où la session commence.
    await prisma.task.create({
      data: {
        tenantId: args.tenantId,
        title: TITRE_TACHE_CONVENTION_NON_ENVOYEE,
        description:
          `La session ${args.libelleSession} démarre dans ${args.joursRestants} jour` +
          `${args.joursRestants > 1 ? 's' : ''} avec ${args.nbParticipants} inscrit` +
          `${args.nbParticipants > 1 ? 's' : ''}, et aucune convention n’est partie en ` +
          `signature. Envoyez-la depuis la fiche session, ou déposez le scan si elle a ` +
          `été signée à la main.`,
        priority: 'HIGH',
        dueDate: args.startDate,
        sessionId: args.sessionId,
      },
    });

    const jours = `${args.joursRestants} jour${args.joursRestants > 1 ? 's' : ''}`;
    await poser({
      tenantId: args.tenantId,
      type: 'signature.convention_non_envoyee',
      userIds: responsables.map((u) => u.id),
      payload: { sessionId: args.sessionId, joursRestants: args.joursRestants },
      destinataires: responsables,
      // Catégorie EXISTANTE : une alerte qui s'offrirait son propre canal
      // échapperait aux réglages de Paramètres, donc à la seule chose qui
      // protège les boîtes de l'équipe.
      category: 'internal_notification',
      subject: `Convention non envoyée — ${args.libelleSession} démarre dans ${jours}`,
      titre: 'Une convention n’est pas partie en signature',
      intro:
        `La session démarre dans ${jours} et aucune convention n’a été envoyée en ` +
        `signature. Sans engagement signé, le financeur refusera le dossier.`,
      vedette: args.libelleSession,
      details: [
        { label: 'Début', value: args.startDate.toLocaleDateString('fr-FR') },
        { label: 'Inscrits', value: String(args.nbParticipants) },
      ],
      ctaLabel: 'Ouvrir la session',
      ctaUrl: `${appUrl()}/app/sessions/${args.sessionId}`,
      urgent: true,
    });
    return { alertee: true };
  } catch (e) {
    // Prévenir est un effet de bord : le cron ne doit pas tomber pour une
    // session, ni empêcher les suivantes d'être traitées.
    console.error('[alertes] J-15 convention non envoyée', e);
    return { alertee: false };
  }
}
