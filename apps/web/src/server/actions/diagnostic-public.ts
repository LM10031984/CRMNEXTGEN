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
 * Le scoring est re-calculé ICI même si le client l'a déjà fait pour afficher
 * le résultat : on n'écrit jamais en base une conclusion venue du navigateur.
 */

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@qualiof/db';
import { rateLimitOk } from '@/lib/enrollment/rate-limit';
import { diagnostiquer, resumerPourLead } from '@/lib/diagnostic/scoring';
import { QUESTIONS, PROBLEMATIQUES } from '@/lib/diagnostic/questions';

/** Ce qui distingue les leads du stand de tous les autres, pour les stats. */
export const SOURCE_STAND = 'Salon — 25 ans du MLS';

/**
 * Plafond volontairement HAUT.
 *
 * Piège de terrain : sur le wifi du lieu (ou en 4G derrière le NAT d'un
 * opérateur), tous les prospects sortent avec LA MÊME IP publique. Le plafond
 * de 5/heure de `session-enrollment-public.ts` bloquerait le stand au 6ᵉ
 * visiteur. On garde un garde-fou anti-robot, pas un garde-fou anti-succès.
 */
const MAX_PAR_IP = 80;
const FENETRE_MS = 15 * 60_000;

const ContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom obligatoire').max(80),
  lastName: z.string().trim().min(1, 'Nom obligatoire').max(80),
  email: z.string().trim().toLowerCase().email('Email invalide').max(180),
  phone: z.string().trim().max(30).optional().default(''),
  rgpdAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Merci d’accepter d’être recontacté' }),
  }),
});

const ReponsesSchema = z.record(z.string(), z.string());

export type SoumettreDiagnosticResult =
  | { ok: true; leadId: string }
  | { ok: false; error: string };

export async function soumettreDiagnostic(input: {
  reponses: unknown;
  contact: unknown;
}): Promise<SoumettreDiagnosticResult> {
  const contact = ContactSchema.safeParse(input.contact);
  if (!contact.success) {
    return { ok: false, error: contact.error.issues[0]?.message ?? 'Formulaire incomplet' };
  }

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

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue';
  if (!rateLimitOk(`diagnostic:${ip}`, MAX_PAR_IP, FENETRE_MS)) {
    return { ok: false, error: 'Trop de demandes depuis ce réseau. Réessaie dans quelques minutes.' };
  }

  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) return { ok: false, error: 'Organisme introuvable' };

  const resultat = diagnostiquer(reponses);
  const probl = PROBLEMATIQUES[resultat.dominante];

  // Traçabilité du consentement : le prospect a coché la case à cette
  // seconde-là. C'est ce qui autorise le rappel et l'envoi du programme.
  const consentement = `Consentement au rappel et à l'envoi du programme : OUI, le ${new Date().toLocaleString('fr-FR')}`;

  const lead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      source: SOURCE_STAND,
      firstName: contact.data.firstName,
      lastName: contact.data.lastName,
      email: contact.data.email,
      phone: contact.data.phone || null,
      notes: [resumerPourLead(resultat, reponses), '', consentement].join('\n'),
      lastAction: `Diagnostic express — ${probl.titre}`,
      lastActionAt: new Date(),
    },
    select: { id: true },
  });

  return { ok: true, leadId: lead.id };
}
