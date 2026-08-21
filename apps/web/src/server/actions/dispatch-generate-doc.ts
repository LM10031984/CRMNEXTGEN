'use server';

/**
 * Server action unifiée pour générer N'IMPORTE QUEL document Qualiopi
 * pré-formation depuis le <DocDock> (bouton magique fiche session).
 *
 * Bug remonté Laurent 2026-06-04 : "il manque le doc AGEFICE SES-0094, je
 * ne vois pas comment la générer". Cette action centralise le dispatch
 * pour qu'un seul clic dans le DocDock règle ça.
 *
 * Docs couverts :
 *   - PROGRAMME · DEROULE · CHECKLIST (partagés produit/session)
 *   - CONVENTION · CONVOCATION · AGEFICE · ANALYSE_BESOIN (par stagiaire)
 *
 * Idempotent : si le doc existe déjà, retourne ok=true sans rien faire.
 * Pour les docs de fin de formation (attestation, QCM, certificat…),
 * utiliser le bouton "Pack fin de formation" qui orchestre BullMQ.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { generateProgrammeForProduct } from './programme-generator';
import { generateDerouleForProduct } from './deroule-product-generator';
import { generateChecklistForSession } from './generate-checklist-formation';
import { generateConventionForParticipant } from './convention-generator';
import { generateConvocationForParticipant } from './convocation-generator';
import { generateAgeficeForParticipant } from './agefice-generator';
import { generateAgeficeAttendanceForParticipant } from './agefice-attendance-generator';
import { enqueueClosureJob } from '@/lib/closure/queue-postgres';
import { isPersonneMoralePayeur } from '@/lib/sessions/payer-rule';
import type {
  DispatchableDocType,
  DispatchGenerateDocInput,
  DispatchResult,
} from '@/lib/sessions/dispatch-doc-types';

export async function dispatchGenerateDoc(
  input: DispatchGenerateDocInput,
): Promise<DispatchResult> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'COMMERCIAL']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  // Tenant scope : la session doit appartenir au tenant courant
  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, tenantId: user.tenantId },
    select: { id: true, productId: true },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };

  try {
    switch (input.docType) {
      // ─── Docs partagés produit/session ──────────────────────────
      case 'PROGRAMME': {
        if (!session.productId) return { ok: false, error: 'Produit manquant' };
        const r = await generateProgrammeForProduct(session.productId, { force: input.force });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: r.ok, error: r.error, docId: r.documentId, resourceKind: 'document' };
      }
      case 'DEROULE': {
        if (!session.productId) return { ok: false, error: 'Produit manquant' };
        const r = await generateDerouleForProduct(session.productId, { force: input.force });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: r.ok, error: r.error, docId: r.documentId, resourceKind: 'document' };
      }
      case 'CHECKLIST': {
        const r = await generateChecklistForSession(input.sessionId, { force: input.force });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: r.ok, error: r.error, docId: r.documentId, resourceKind: 'document' };
      }

      // ─── Docs par stagiaire ─────────────────────────────────────
      case 'CONVENTION': {
        if (!input.participantId) return { ok: false, error: 'participantId requis' };
        const r = await generateConventionForParticipant(input.participantId, { force: input.force });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: r.ok, error: r.error, docId: r.documentId, resourceKind: 'document' };
      }
      case 'CONVOCATION': {
        if (!input.participantId) return { ok: false, error: 'participantId requis' };
        const r = await generateConvocationForParticipant(input.participantId, { force: input.force });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: r.ok, error: r.error, docId: r.documentId, resourceKind: 'document' };
      }
      case 'AGEFICE': {
        if (!input.participantId) return { ok: false, error: 'participantId requis' };
        const r = await generateAgeficeForParticipant(input.participantId, { force: input.force });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: r.ok, error: r.error, docId: r.documentId, resourceKind: 'document' };
      }
      case 'ASSIDUITE_AGEFICE': {
        if (!input.participantId) return { ok: false, error: 'participantId requis' };
        // Attestation d'assiduité AGEFICE (post-formation, montant HT).
        // Pas dans CLOSURE_DOC_KINDS donc le pack BullMQ ne la génère pas.
        // Laurent 2026-06-04 : "Regarde pourquoi l'assiduité agefice ne se génère pas".
        const r = await generateAgeficeAttendanceForParticipant(input.participantId, {
          force: input.force,
        });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: r.ok, error: r.error, docId: r.documentId, resourceKind: 'document' };
      }
      case 'ANALYSE_BESOIN': {
        if (!input.participantId) return { ok: false, error: 'participantId requis' };

        // Règle payeur (quick 260821-md8) : quand le payeur est une personne
        // morale, l'analyse des besoins se fait au nom de l'ENTREPRISE. Sans
        // cette garde, un clic sur la matrice Qualiopi recrée exactement le
        // doublon nominatif que la préparation vient d'arrêter de produire.
        const participant = await prisma.sessionParticipant.findFirst({
          where: {
            id: input.participantId,
            sessionId: input.sessionId,
            session: { tenantId: user.tenantId },
          },
          select: {
            id: true,
            sponsorOrg: { select: { legalName: true, legalForm: true } },
          },
        });
        if (!participant) return { ok: false, error: 'Inscription introuvable' };
        if (isPersonneMoralePayeur(participant.sponsorOrg?.legalForm)) {
          const nom = participant.sponsorOrg?.legalName ?? "l'entreprise commanditaire";
          return {
            ok: false,
            error:
              `Le payeur de cette formation est ${nom} (personne morale) : l'analyse des ` +
              `besoins se fait au nom de l'ENTREPRISE, pas par stagiaire (règle du 12/08, ` +
              `indicateur 4). Générer une analyse nominative ici créerait un doublon du ` +
              `document d'entreprise.`,
          };
        }

        // Analyse besoin = job Ollama asynchrone (BullMQ).
        // Batch status='PENDING' (sera RUNNING quand le worker démarre).
        const batch = await prisma.closureBatch.create({
          data: {
            tenantId: user.tenantId,
            sessionId: input.sessionId,
            status: 'PENDING',
            totalDocs: 1,
            doneDocs: 0,
            errorDocs: 0,
          },
        });
        const job = await prisma.closureJob.create({
          data: {
            batchId: batch.id,
            participantId: input.participantId,
            kind: 'ANALYSE_BESOIN',
            status: 'QUEUED',
          },
        });
        await enqueueClosureJob({
          jobId: job.id,
          batchId: batch.id,
          tenantId: user.tenantId,
          sessionId: input.sessionId,
          participantId: input.participantId,
          kind: 'ANALYSE_BESOIN',
        });
        revalidatePath(`/app/sessions/${input.sessionId}`);
        return { ok: true, enqueued: true };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Bulk : génère TOUS les docs manquants en parallèle. Renvoie le compte
 * de succès/échec pour affichage toast.
 */
export async function dispatchGenerateMissing(input: {
  sessionId: string;
  items: Array<{ docType: DispatchableDocType; participantId?: string }>;
}): Promise<{ ok: boolean; total: number; success: number; failed: number; errors: string[] }> {
  const results = await Promise.allSettled(
    input.items.map((it) =>
      dispatchGenerateDoc({
        sessionId: input.sessionId,
        docType: it.docType,
        participantId: it.participantId,
      }),
    ),
  );
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) success++;
    else {
      failed++;
      if (r.status === 'fulfilled' && r.value.error) errors.push(r.value.error);
      else if (r.status === 'rejected') errors.push(String(r.reason));
    }
  }
  return { ok: failed === 0, total: input.items.length, success, failed, errors };
}
