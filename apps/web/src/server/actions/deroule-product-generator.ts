'use server';

/**
 * Génère le DÉROULÉ PÉDAGOGIQUE au niveau PRODUIT (1 fois pour tous les
 * stagiaires — décision Laurent 05/05/2026). Le déroulé décrit la trame
 * pédagogique du produit (contenu jour par jour, séquences, durées) ; il ne
 * dépend pas d'une session ni d'un participant.
 *
 * Stockage : Document type=DEROULE_PEDAGOGIQUE, entityType='product',
 * entityId=productId. find-or-create par défaut, force=true pour régénérer.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  renderProductDerouleHtml,
  type ProductDerouleData,
} from '@/lib/closure/deroule-template';
import {
  generateDerouleContent,
  type FormationCtx,
} from '@/lib/closure/ollama-generators';
import { stubDerouleContent } from '@/lib/closure/stub-content';
import { parseProgrammeToDeroule } from '@/lib/closure/parse-programme-to-deroule';

export async function generateDerouleForProduct(
  productId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string; usedStub?: boolean }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const product = await prisma.trainingProduct.findFirst({
    where: { id: productId, tenantId: user.tenantId },
  });
  if (!product) return { ok: false, error: 'Produit introuvable' };

  // Guard : le programme PDF doit avoir été généré avant le déroulé.
  // Sans programme, parseProgrammeToDeroule n'a pas de contenu et Ollama
  // produirait du générique sans valeur Qualiopi.
  const programmeDoc = await prisma.document.findFirst({
    where: { tenantId: user.tenantId, type: 'PROGRAMME', entityType: 'product', entityId: productId },
    select: { id: true },
  });
  if (!programmeDoc) {
    return { ok: false, error: 'Générez d\'abord le Programme PDF du produit avant de créer le déroulé.' };
  }

  // Find-or-create par défaut : un déroulé existe déjà → réutilise.
  if (!opts.force) {
    const existing = await prisma.document.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'DEROULE_PEDAGOGIQUE',
        entityType: 'product',
        entityId: productId,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
    }
  }

  const programmeMd = typeof product.programMd === 'string' ? product.programMd : '';

  // 1) Tentative de parsing du programme markdown : si le programme contient
  //    des horaires (ex: "8h30 – 10h45 : ..."), on les reprend FIDÈLEMENT
  //    pour que le déroulé coïncide exactement avec le programme. Pas
  //    d'appel IA (instantané, déterministe, multi-pages OK).
  let content = parseProgrammeToDeroule(programmeMd, product.title);
  let source: 'programme-parse' | 'ollama' | 'stub' = content ? 'programme-parse' : 'stub';

  // 2) Si le programme n'a pas de structure horaire parsable → tentative Ollama
  const formation: FormationCtx = {
    titre: product.title,
    programmeMd,
    nombreHeures: product.durationHours,
  };
  if (!content) {
    content = await generateDerouleContent(formation, 'Document', null, user.tenantId);
    if (content) source = 'ollama';
  }

  let usedStub = false;
  if (!content) {
    // Fallback stub : on calcule des dates fictives à partir de la durée du
    // produit (1 jour = 7h). stubDerouleContent en a besoin pour calculer
    // le nombre de séquences ; le contenu reste générique.
    const nbJours = Math.max(1, Math.ceil(product.durationHours / 8));
    const fakeStart = new Date();
    const fakeEnd = new Date(fakeStart);
    fakeEnd.setDate(fakeStart.getDate() + nbJours - 1);
    content = stubDerouleContent({
      apprenantPrenom: '',
      apprenantNom: '',
      apprenantCivility: null,
      sessionId: `product:${productId}`,
      sessionCode: product.code,
      sessionTitle: product.title,
      sessionStartDate: fakeStart,
      sessionEndDate: fakeEnd,
      sessionLocation: null,
      sessionTrainers: [],
      durationHours: product.durationHours,
    });
    usedStub = true;
    source = 'stub';
  }
  // Trace pour debug : console-log du mode utilisé (parsing/ollama/stub).
  console.log(`[deroule-product] product=${product.code} source=${source} jours=${content.jours.length}`);

  // Render PDF
  const data: ProductDerouleData = {
    produitTitre: product.title,
    produitCode: product.code,
    produitDureeHeures: product.durationHours,
  };
  let pdfBuffer: Buffer;
  try {
    const html = renderProductDerouleHtml(data, content);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF déroulé : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const safeSlug = product.code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const objectKey = `deroules/produits/${safeSlug}-${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'DEROULE_PEDAGOGIQUE',
      entityType: 'product',
      entityId: productId,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  revalidatePath(`/app/produits/${productId}`);
  return { ok: true, documentId: doc.id, pdfUrl: objectKey, usedStub };
}
