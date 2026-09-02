'use server';

/**
 * Diagnostic express du stand — chemin PUBLIC, sans authentification.
 *
 * Pourquoi une action dédiée et pas `createLead` : `createLead` exige
 * `requireRole(['ADMIN','MANAGER','COMMERCIAL'])`. Ici il n'y a pas
 * d'utilisateur connecté — c'est un prospect debout devant un stand. On écrit
 * donc le lead directement, exactement comme `session-enrollment-public.ts`
 * écrit sa `preEnrollment` sans session authentifiée.
 *
 * Le scoring ET la priorisation sont re-calculés ICI même si le client les a
 * déjà faits pour afficher le résultat : on n'écrit jamais en base une
 * conclusion venue du navigateur.
 */

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@qualiof/db';
import { quotaDiagnosticOk, ipDepuisHeaders } from '@/lib/diagnostic/quota';
import { diagnostiquer, resumerPourLead } from '@/lib/diagnostic/scoring';
import { prioriser, ligneSuiviCrm } from '@/lib/diagnostic/priorite';
import {
  QUESTIONS,
  PROBLEMATIQUES,
  RAPPEL_CHOIX,
  SOURCE_STAND,
  type RappelValue,
} from '@/lib/diagnostic/questions';

const ContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom obligatoire').max(80),
  lastName: z.string().trim().min(1, 'Nom obligatoire').max(80),
  email: z.string().trim().toLowerCase().email('Email invalide').max(180),
  phone: z.string().trim().max(30).optional().default(''),
  rgpdAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Merci d’accepter d’être recontacté' }),
  }),
});

const RAPPEL_VALUES = RAPPEL_CHOIX.map((c) => c.value) as [RappelValue, ...RappelValue[]];

/**
 * Validation CROISÉE contact × rappel : un lead « chaud » sans numéro est un
 * lead mort. Le formulaire l'impose déjà côté navigateur — on le revalide ici
 * parce qu'on ne fait jamais confiance au client.
 */
const SoumissionSchema = z
  .object({
    contact: ContactSchema,
    rappel: z.enum(RAPPEL_VALUES, {
      errorMap: () => ({ message: 'Merci d’indiquer quand on peut vous appeler' }),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.rappel === 'CETTE_SEMAINE' && v.contact.phone.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contact', 'phone'],
        message: 'Un numéro est indispensable pour un rappel cette semaine',
      });
    }
  });

const ReponsesSchema = z.record(z.string(), z.string());

export type SoumettreDiagnosticResult =
  | { ok: true; leadId: string; submissionId: string }
  | { ok: false; error: string };

export async function soumettreDiagnostic(input: {
  reponses: unknown;
  contact: unknown;
  rappel: unknown;
}): Promise<SoumettreDiagnosticResult> {
  const soumission = SoumissionSchema.safeParse({ contact: input.contact, rappel: input.rappel });
  if (!soumission.success) {
    return { ok: false, error: soumission.error.issues[0]?.message ?? 'Formulaire incomplet' };
  }
  const { contact, rappel } = soumission.data;

  const reponsesParsed = ReponsesSchema.safeParse(input.reponses);
  if (!reponsesParsed.success) {
    return { ok: false, error: 'Réponses illisibles' };
  }

  // On ne garde que les couples question/choix qui existent réellement : le
  // navigateur ne dicte pas le contenu du diagnostic.
  const reponses: Record<string, string> = {};
  for (const question of QUESTIONS) {
    const valeur = reponsesParsed.data[question.id];
    if (valeur && question.choix.some((c) => c.value === valeur)) {
      reponses[question.id] = valeur;
    }
  }

  const ip = ipDepuisHeaders(await headers());
  if (!quotaDiagnosticOk('soumission', ip)) {
    return { ok: false, error: 'Trop de demandes depuis ce réseau. Réessaie dans quelques minutes.' };
  }

  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) return { ok: false, error: 'Organisme introuvable' };

  const resultat = diagnostiquer(reponses);
  const probl = PROBLEMATIQUES[resultat.dominante];
  const priorite = prioriser({ reponses, rappel, telephone: contact.phone });
  const suivi = ligneSuiviCrm({ niveau: priorite.niveau, dominante: resultat.dominante, rappel });

  // Traçabilité du consentement : le prospect a coché la case à cette
  // seconde-là. C'est ce qui autorise le rappel et l'envoi du programme.
  const consentement = `Consentement au rappel et à l'envoi du programme : OUI, le ${new Date().toLocaleString('fr-FR')}`;

  // La priorité est EN TÊTE des notes : c'est la première chose lue quand on
  // ouvre la fiche à 9 h du matin avec 80 leads à trancher.
  const notes = [
    suivi,
    `Motifs : ${priorite.motifs.join(' · ')}`,
    '',
    resumerPourLead(resultat, reponses),
    '',
    consentement,
  ].join('\n');

  // Lead ET soumission dans la MÊME transaction : un lead sans ses réponses
  // structurées ne vaut rien pour le rappel commercial, et une soumission sans
  // lead n'a personne à qui écrire.
  const { lead, submission } = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId: tenant.id,
        source: SOURCE_STAND,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone || null,
        notes,
        lastAction: suivi,
        lastActionAt: new Date(),
      },
      select: { id: true },
    });

    const submission = await tx.diagnosticSubmission.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        reponses,
        dominante: resultat.dominante,
        secondaire: resultat.secondaire,
        scores: resultat.scores,
        // PENDING : l'email N'EST PAS envoyé ici. Assembler un programme sur
        // mesure demande un appel au modèle — 28 secondes mesurées, qu'on ne
        // fait pas attendre à quelqu'un debout devant un stand. C'est le
        // NAVIGATEUR du prospect qui déclenche le traitement juste après, depuis
        // l'écran de remerciement (`POST /api/diagnostic/traiter`).
      },
      select: { id: true },
    });

    return { lead, submission };
  });

  return { ok: true, leadId: lead.id, submissionId: submission.id };
}
