'use server';

/**
 * Envoi MANUEL des relances J+4 et J+10 d'un lead du stand.
 *
 * « Manuel » n'est pas une limitation qu'on lèvera plus tard, c'est la règle :
 * le prospect a coché une case autorisant le rappel et l'envoi de SON programme.
 * Il n'a pas souscrit à une séquence. Un cron qui enverrait ces deux emails tout
 * seul transformerait un consentement individuel en campagne — autre finalité,
 * autre déclaration au registre, et le premier signalement pour spam arrive un
 * jour où personne ne surveille.
 *
 * Donc : le brouillon est fabriqué ici, montré sur la fiche, et c'est un humain
 * qui clique. Le chemin critique du stand (résultat, programme) n'est pas touché.
 *
 * Chaque envoi est tracé DEUX fois, parce que les deux lectures existent :
 *  - `LeadAction` — l'historique daté, dans l'ordre, sur la fiche ;
 *  - `lastAction` — la colonne visible dans la liste, sans ouvrir la fiche.
 * Sans la seconde, le 18 septembre au matin, impossible de voir qui a déjà reçu
 * quoi sans ouvrir 80 fiches.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { sendMail } from '@/lib/mailer';
import { loadOfConfig } from '@/lib/of-config';
import { composerRelance, ETAPE_LIBELLE, type EtapeRelance } from '@/lib/diagnostic/relances';
import { signataire } from '@/lib/mailer-templates/diagnostic-programme';
import { PROBLEMATIQUES, type ProblematiqueKey } from '@/lib/diagnostic/questions';
import { SOURCE_STAND } from '@/lib/diagnostic/questions';

export type ResultatRelance = { ok: true; destinataire: string } | { ok: false; error: string };

function estProblematique(v: string): v is ProblematiqueKey {
  return Object.prototype.hasOwnProperty.call(PROBLEMATIQUES, v);
}

/**
 * Envoie la relance choisie au prospect, et la trace.
 *
 * Refuse plutôt que de deviner : sans email, sans soumission de diagnostic, ou
 * sur un lead qui ne vient pas du stand, il n'y a rien à envoyer — ces relances
 * parlent d'un diagnostic rempli sur un salon.
 */
export async function envoyerRelanceDiagnostic(
  leadId: string,
  etape: EtapeRelance,
): Promise<ResultatRelance> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: {
        id: true,
        firstName: true,
        email: true,
        source: true,
        notes: true,
        diagnosticSubmissions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { dominante: true },
        },
      },
    });

    if (!lead) return { ok: false, error: 'Lead introuvable' };
    if (!lead.email) return { ok: false, error: 'Ce lead n’a pas d’adresse email' };
    if (!lead.firstName) return { ok: false, error: 'Ce lead n’a pas de prénom' };

    const sub = lead.diagnosticSubmissions[0];
    if (!sub || !estProblematique(sub.dominante)) {
      return { ok: false, error: 'Aucun diagnostic exploitable sur ce lead' };
    }

    const of = await loadOfConfig(user.tenantId);

    const { subject, text } = composerRelance(etape, {
      prenom: lead.firstName,
      dominante: sub.dominante,
      // Le même humain que celui qui signe le programme (mailer-templates).
      signataire: signataire(of).nom,
      evenement: EVENEMENT,
    });

    const envoi = await sendMail({
      to: lead.email,
      subject,
      // Texte brut des deux côtés : ces relances doivent avoir l'air écrites à
      // la main. Un <pre> serait une mise en page ; on n'en veut aucune.
      html: `<div style="white-space:pre-wrap; font-family:-apple-system,'Helvetica Neue',Arial,sans-serif; font-size:15px; line-height:1.6; color:#1F2937;">${echapper(text)}</div>`,
      text,
      context: { tenantId: user.tenantId, category: 'diagnostic_program' },
    });

    if (envoi.suppressed) {
      return {
        ok: false,
        error:
          'Rien n’est parti : la catégorie « Programme du diagnostic express » est décochée dans Paramètres → Emails.',
      };
    }
    if (envoi.dryRun) {
      return { ok: false, error: 'Rien n’est parti : l’application est en mode dry-run (MAIL_DRY_RUN).' };
    }
    if (!envoi.ok) {
      return { ok: false, error: `Envoi échoué : ${envoi.error ?? '?'}` };
    }

    const ligne = `Relance ${ETAPE_LIBELLE[etape]} envoyée`;
    await prisma.$transaction([
      prisma.leadAction.create({
        data: { leadId: lead.id, type: 'email', subject, body: text },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          lastAction: ligne,
          lastActionAt: new Date(),
          // On AJOUTE aux notes, on ne remplace jamais : la ligne de priorité du
          // diagnostic est en tête et sert encore au moment du rappel.
          notes: [lead.notes ?? '', '', `${new Date().toLocaleString('fr-FR')} — ${ligne} (${subject})`]
            .join('\n')
            .trim(),
        },
      }),
    ]);

    revalidatePath(`/app/leads/${lead.id}`);
    revalidatePath('/app/leads');
    return { ok: true, destinataire: lead.email };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

/** Rappelé dans les deux relances — c'est ce qui rend l'email crédible. */
const EVENEMENT = SOURCE_STAND.replace(/^Salon — /, '');

function echapper(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
