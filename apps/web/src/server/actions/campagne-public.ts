'use server';

/**
 * L'action publique de la campagne de RDV — elle DISTRIBUE, elle ne collecte pas.
 *
 * Précision de Laurent (10/09/2026) qui affine §7.1 : la page `/rdv/[token]` ne
 * porte AUCUN formulaire de pré-inscription. Elle remet à chaque participant
 * SON lien individuel `/preinscription/[token]`, et c'est ce lien-là qui porte
 * le formulaire.
 *
 * Ce n'est pas un détail d'ergonomie, c'est ce qui évite un second pipeline.
 * Tout l'existant — OCR, extraction, validation admin, motif de rejet,
 * relances automatiques des dossiers non rendus — est accroché à une
 * pré-inscription INDIVIDUELLE. Un formulaire porté par le lien partagé aurait
 * dû recréer chacune de ces briques à côté des premières (§13 : « campagne par
 * RDV au-dessus, pas un second pipeline »).
 *
 * Aucune authentification ici, par construction. Les garde-fous sont donc
 * ailleurs, et il y en a quatre : le token est comparé par empreinte à temps
 * constant, l'état du lien est recalculé à chaque appel par la fonction pure,
 * le quota s'incrémente dans la MÊME transaction que la création (sinon deux
 * ouvertures simultanées passeraient toutes les deux), et rien de ce qui est
 * renvoyé ne parle des autres participants.
 */

import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@qualiof/db';
import { z } from 'zod';

import {
  hashPublicToken,
  isWellFormedPublicToken,
  publicTokenMatches,
} from '@/lib/proposition/public-link';
import { campagneLinkState, CAMPAGNE_LINK_MESSAGE } from '@/lib/campagne/lien';

/** Validité du lien individuel : celle de la campagne, jamais au-delà. */
const MIN_VALIDITE_JOURS = 7;

const DemandeSchema = z.object({
  token: z.string(),
  firstName: z.string().trim().min(1, 'Votre prénom').max(80),
  lastName: z.string().trim().min(1, 'Votre nom').max(80),
  email: z.string().trim().email('Un email valide').max(160),
  /** Choix de date — facultatif : on ne bloque pas quelqu'un qui hésite. */
  dateOptionId: z.string().uuid().optional().nullable(),
});

export type DemandeLienInput = z.input<typeof DemandeSchema>;

export type DemandeLienResult =
  | { ok: true; url: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Remet à un participant son lien de pré-inscription.
 *
 * Idempotent sur l'email : rouvrir le lien avec la même adresse REND LE MÊME
 * lien plutôt que d'en créer un second. C'est ce qui permet à quelqu'un de
 * reprendre son dossier depuis son téléphone après l'avoir commencé sur son
 * poste — et ça évite les doublons que l'admin devrait démêler à la main.
 */
export async function demanderLienPreinscription(
  input: DemandeLienInput,
): Promise<DemandeLienResult> {
  const parsed = DemandeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Vérifiez les informations saisies.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  if (!isWellFormedPublicToken(data.token)) {
    return { ok: false, error: 'Ce lien n’est pas valide.' };
  }

  const candidat = hashPublicToken(data.token);
  const batch = await prisma.enrollmentBatch.findUnique({
    where: { tokenHash: candidat },
    select: {
      id: true,
      tenantId: true,
      tokenHash: true,
      status: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      productId: true,
    },
  });
  // Message identique qu'on trouve ou non la campagne : distinguer les deux
  // dirait à qui teste des tokens lesquels existent.
  if (!batch || !publicTokenMatches(candidat, batch.tokenHash)) {
    return { ok: false, error: 'Ce lien n’est pas valide.' };
  }

  const now = new Date();
  const etat = campagneLinkState(batch, now);
  if (etat !== 'ouverte') {
    return { ok: false, error: CAMPAGNE_LINK_MESSAGE[etat] };
  }

  const email = data.email.toLowerCase();

  // Déjà passé par là : on rend le même lien. Cherché dans la campagne
  // uniquement — un même email peut légitimement avoir une pré-inscription
  // ailleurs, sur une autre session.
  const existante = await prisma.preEnrollment.findFirst({
    where: { batchId: batch.id, tenantId: batch.tenantId, email },
    select: { token: true, expiresAt: true },
  });
  if (existante && existante.expiresAt.getTime() > now.getTime()) {
    if (data.dateOptionId) {
      await voter(batch.id, data.dateOptionId, existante.token);
    }
    return { ok: true, url: `/preinscription/${existante.token}` };
  }

  // La pré-inscription n'expire jamais après la campagne : un formulaire
  // qu'on remplirait après la clôture n'aurait plus de session où atterrir.
  // Mais on laisse au moins une semaine, sinon un lien demandé la veille de
  // l'expiration serait mort-né.
  const minimum = new Date(now.getTime() + MIN_VALIDITE_JOURS * 86_400_000);
  const expiresAt = batch.expiresAt.getTime() > minimum.getTime() ? batch.expiresAt : minimum;
  const token = randomUUID().replace(/-/g, '');

  try {
    await prisma.$transaction(async (tx) => {
      // Le quota s'incrémente sous condition, dans la même opération que la
      // création : deux participants qui ouvrent le lien à la même seconde ne
      // doivent pas pouvoir passer tous les deux sur la dernière place.
      const pris = await tx.enrollmentBatch.updateMany({
        where: {
          id: batch.id,
          status: 'OUVERTE',
          expiresAt: { gt: now },
          OR: [{ maxUses: null }, { usedCount: { lt: batch.maxUses ?? 0 } }],
        },
        data: { usedCount: { increment: 1 } },
      });
      if (pris.count === 0) throw new Error('QUOTA');

      await tx.preEnrollment.create({
        data: {
          tenantId: batch.tenantId,
          token,
          expiresAt,
          batchId: batch.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email,
          status: 'PENDING_FORM',
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'QUOTA') {
      return { ok: false, error: CAMPAGNE_LINK_MESSAGE['quota-atteint'] };
    }
    console.error('[campagne] création du lien individuel', e);
    return { ok: false, error: 'Impossible de préparer votre dossier. Réessayez dans un instant.' };
  }

  if (data.dateOptionId) {
    await voter(batch.id, data.dateOptionId, token);
  }

  return { ok: true, url: `/preinscription/${token}` };
}

/**
 * Enregistre le choix de date.
 *
 * Le vote est stocké par TOKEN de pré-inscription et non par email : `votes`
 * est un Json lisible par l'admin, et y écrire une adresse email en ferait une
 * donnée personnelle de plus, sur une colonne qui n'est pas faite pour ça.
 *
 * Un échec ici ne remonte pas : le participant a obtenu son lien, c'est
 * l'essentiel. Perdre une voix est regrettable ; perdre le lien serait grave.
 */
async function voter(batchId: string, dateOptionId: string, cle: string): Promise<void> {
  try {
    const option = await prisma.batchDateOption.findFirst({
      where: { id: dateOptionId, batchId },
      select: { id: true, votes: true },
    });
    if (!option) return;

    const votes: Record<string, boolean> =
      option.votes && typeof option.votes === 'object' && !Array.isArray(option.votes)
        ? { ...(option.votes as Record<string, boolean>) }
        : {};
    votes[cle] = true;

    // Une voix par participant : on retire la sienne des autres dates, sinon
    // quelqu'un qui change d'avis compterait deux fois et le dépouillement
    // annoncerait plus de votants que de participants.
    await prisma.$transaction(async (tx) => {
      const autres = await tx.batchDateOption.findMany({
        where: { batchId, id: { not: dateOptionId } },
        select: { id: true, votes: true },
      });
      for (const a of autres) {
        if (!a.votes || typeof a.votes !== 'object' || Array.isArray(a.votes)) continue;
        const v: Record<string, boolean> = { ...(a.votes as Record<string, boolean>) };
        if (!(cle in v)) continue;
        delete v[cle];
        await tx.batchDateOption.update({
          where: { id: a.id },
          data: { votes: v as Prisma.InputJsonValue },
        });
      }
      await tx.batchDateOption.update({
        where: { id: dateOptionId },
        data: { votes: votes as Prisma.InputJsonValue },
      });
    });
  } catch (e) {
    console.error('[campagne] vote de date', e);
  }
}
