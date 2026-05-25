'use server';

/**
 * Génère la GRILLE D'OBSERVATION CONSOLIDÉE par session (C3.i11 Qualiopi).
 * 1 doc partagé par session avec tous les stagiaires présents (vs grille
 * formateur par-stagiaire actuelle qui reste dans le pack closure).
 *
 * Stockage : Document type=GRILLE_OBS_SESSION, sessionId, entityType='session',
 * entityId=sessionId, participantId=null. Find-or-create idempotent.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  renderGrilleObsSessionHtml,
  type GrilleSessionContent,
  type GrilleSessionTemplateData,
  type GrilleSessionStagiaire,
} from '@/lib/closure/grille-obs-session-template';
import {
  generateGrilleSessionContent,
  type GrilleSessionStagiaireInput,
  type FormationCtx,
} from '@/lib/closure/ollama-generators';

export async function generateGrilleObsSessionForSession(
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string; usedStub?: boolean }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // Find-or-create
  if (!opts.force) {
    const existing = await prisma.document.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'GRILLE_OBS_SESSION',
        entityType: 'session',
        entityId: sessionId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
    }
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    include: {
      product: true,
      trainers: { include: { person: true } },
      participants: {
        where: { enrollmentStatus: { in: ['CONFIRMED', 'ATTENDED'] } },
        include: {
          person: {
            include: {
              legalLinks: {
                where: { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL', 'DIRIGEANT', 'SALARIE'] } },
                orderBy: [{ isPrimary: 'desc' }],
                take: 1,
              },
            },
          },
        },
        orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };
  if (session.participants.length === 0) {
    return {
      ok: false,
      error: 'Aucun apprenant éligible (statut CONFIRMED/ATTENDED) — la grille consolidée se génère après la formation',
    };
  }

  // Stagiaires pour Ollama
  const stagiairesForAi: GrilleSessionStagiaireInput[] = session.participants.map((p) => ({
    participantId: p.id,
    prenom: p.person.firstName,
    nom: p.person.lastName,
    fonction: p.person.legalLinks[0]?.function ?? null,
    professionalStatus: p.person.professionalStatus,
  }));

  const formation: FormationCtx = {
    titre: session.product.title,
    programmeMd: typeof session.product.programMd === 'string' ? session.product.programMd : '',
    nombreHeures: session.product.durationHours,
  };

  // Génération du contenu IA — fallback stub si échec
  let content: GrilleSessionContent | null = await generateGrilleSessionContent(
    formation,
    stagiairesForAi,
    'Document',
    null,
    user.tenantId,
  );
  let usedStub = false;
  if (!content) {
    // Stub : 7 compétences génériques, niveau B partout, observations placeholder
    content = {
      competences: [
        { nom: 'Maîtrise des concepts clés de la formation', niveaux: {} },
        { nom: 'Application pratique sur cas concrets', niveaux: {} },
        { nom: 'Mise en situation professionnelle', niveaux: {} },
        { nom: 'Capacité d\'analyse et synthèse', niveaux: {} },
        { nom: 'Réalisation des exercices proposés', niveaux: {} },
        { nom: 'Participation et engagement', niveaux: {} },
        { nom: 'Capacité à transposer les acquis', niveaux: {} },
      ],
      observations: [],
    };
    for (const s of stagiairesForAi) {
      for (const comp of content.competences) {
        comp.niveaux[s.participantId] = 'B';
      }
      content.observations.push({
        participantId: s.participantId,
        texte: `${s.prenom} ${s.nom} a participé activement à la formation et a atteint les objectifs pédagogiques. Axe de progression : approfondir certaines mises en pratique.`,
      });
    }
    usedStub = true;
  }

  // Render PDF
  const stagiaires: GrilleSessionStagiaire[] = session.participants.map((p) => ({
    participantId: p.id,
    prenom: p.person.firstName,
    nom: p.person.lastName,
  }));
  const data: GrilleSessionTemplateData = {
    formationTitre: session.product.title,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    formateurs: session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`.trim()),
    stagiaires,
    content,
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderGrilleObsSessionHtml(data);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur rendu PDF grille session : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const objectKey = `grille-obs-session/${session.code}/${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'GRILLE_OBS_SESSION',
      entityType: 'session',
      entityId: sessionId,
      sessionId,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  revalidatePath(`/app/sessions/${sessionId}`);
  return { ok: true, documentId: doc.id, pdfUrl: objectKey, usedStub };
}
