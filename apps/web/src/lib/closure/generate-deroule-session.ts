/**
 * Cœur SANS auth de persistance du DÉROULÉ PÉDAGOGIQUE niveau SESSION.
 *
 * Le déroulé pédagogique est un document de SESSION (pas par participant) :
 * 1 seul asset par session, partagé. Il est stocké comme `PedagogicalAsset`
 * avec `kind = DEROULE` et `participantId = null` (cohérent avec le worker qui
 * mappe DEROULE_PEDA → PedagogicalKind.DEROULE).
 *
 * ⚠ IDEMPOTENCE — MÉCANISME OBLIGATOIRE (findFirst-then-update/create) :
 * NE PAS utiliser `upsert({ where: { sessionId_participantId_kind: { ...,
 * participantId: null } } })`. Deux raisons :
 *   (a) en Postgres, l'index unique composé `@@unique([sessionId,
 *       participantId, kind])` ne déclenche PAS `NULLS NOT DISTINCT` →
 *       deux lignes (sessionId=X, participantId=NULL, kind=DEROULE) NE violent
 *       PAS la contrainte → doublon à chaque relance ;
 *   (b) le `where` composé Prisma typé string REFUSE `null` (erreur de type /
 *       requête invalide).
 * → On fait : findFirst({ sessionId, participantId: null, kind: 'DEROULE' })
 *   puis update({ where: { id } }) si trouvé, sinon create. Garantie : 1 seul
 *   asset déroulé-session quel que soit le nombre de relances.
 *
 * NB : ce module n'est PAS `'use server'` — c'est un module lib pur côté
 * serveur, exporté pour réutilisation par les scripts pipeline.
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { buildClosureContextForParticipant } from './build-context';
import { generateDerouleContent, generateRapportFormateur } from './ollama-generators';
import { renderDerouleHtml, type DerouleContent } from './deroule-template';

export interface PersistDerouleSessionResult {
  ok: boolean;
  assetId?: string;
  pdfUrl?: string;
  error?: string;
}

export async function persistDerouleSession(
  tenantId: string,
  sessionId: string,
  opts?: { force?: boolean; frozenBody?: DerouleContent },
): Promise<PersistDerouleSessionResult> {
  // 1. Court-circuit idempotent : si un déroulé-session existe déjà et qu'on
  //    n'est pas en mode force, on le réutilise SANS régénérer le LLM.
  const existing = await prisma.pedagogicalAsset.findFirst({
    where: { sessionId, participantId: null, kind: 'DEROULE' },
    select: { id: true, pdfUrl: true },
  });
  if (existing && !opts?.force) {
    return { ok: true, assetId: existing.id, pdfUrl: existing.pdfUrl ?? undefined };
  }

  // 2. Charge la session + produit + 1er participant (le rendu du déroulé a
  //    besoin d'un ClosureContext, construit à partir d'un participantId).
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId },
    include: {
      product: true,
      participants: {
        where: { enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable' };
  if (!session.product) return { ok: false, error: 'Produit lié à la session manquant' };
  const firstParticipant = session.participants[0];
  if (!firstParticipant) {
    return { ok: false, error: 'Aucun participant inscrit (contexte de rendu déroulé indisponible)' };
  }

  const ctx = await buildClosureContextForParticipant(firstParticipant.id, tenantId);
  if (!ctx) return { ok: false, error: 'Contexte closure null' };

  // 3. Détermine le contenu du déroulé.
  const formation = {
    titre: ctx.sessionTitle,
    programmeMd: ctx.formationMeta?.programmeMd ?? session.product.programMd ?? '',
    nombreHeures: ctx.durationHours,
  };

  let deroule: DerouleContent;
  if (opts?.frozenBody) {
    // FIGER-DEROULE : corps figé au PRODUIT (identique toutes sessions). On NE
    //   régénère PAS le corps. Seul le bilan/rapport formateur est généré PAR
    //   SESSION (Haiker tier 'fast') puis fusionné au corps figé avant rendu →
    //   corps identique entre 2 sessions, bilan potentiellement différent.
    const rapport = await generateRapportFormateur(formation, 'PedagogicalAsset', null, tenantId);
    deroule = rapport ? { ...opts.frozenBody, rapportFormateur: rapport } : opts.frozenBody;
  } else {
    // Rétro-compat (pas de figé fourni) : génération complète via LLM (qui
    //   inclut déjà son rapportFormateur). Pas de stub silencieux pour un doc
    //   Qualiopi : si le LLM échoue, on remonte.
    const generated = await generateDerouleContent(formation, 'PedagogicalAsset', null, tenantId);
    if (!generated) return { ok: false, error: 'déroulé contenu null (LLM)' };
    deroule = generated;
  }

  // 4. Rendu PDF + upload MinIO.
  let pdfBuffer: Buffer;
  try {
    const html = renderDerouleHtml(ctx, deroule);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur rendu PDF déroulé : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const objectKey = `deroules/${session.code}/${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  // 5. Persistance idempotente — findFirst-then-update/create (PAS upsert
  //    compound key sur participantId=null, cf en-tête).
  const asset = existing
    ? await prisma.pedagogicalAsset.update({
        where: { id: existing.id },
        data: {
          rawJson: deroule as object,
          pdfUrl: objectKey,
          hashSha256: hash,
          generatedAt: new Date(),
        },
        select: { id: true, pdfUrl: true },
      })
    : await prisma.pedagogicalAsset.create({
        data: {
          tenantId,
          sessionId,
          participantId: null,
          kind: 'DEROULE',
          rawJson: deroule as object,
          pdfUrl: objectKey,
          hashSha256: hash,
        },
        select: { id: true, pdfUrl: true },
      });

  return { ok: true, assetId: asset.id, pdfUrl: asset.pdfUrl ?? objectKey };
}
