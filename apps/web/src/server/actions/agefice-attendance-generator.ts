'use server';

/**
 * BUG-12 — Génère l'Attestation d'assiduité AGEFICE pour un participant.
 *
 * Pattern : clone du AGEFICE V2 generator (agefice-generator.ts) mais simplifié
 * car 27 fields seulement (vs 92). Idempotent via hash sha256.
 *
 * V1 minimal :
 *  - Durées Prévues : ventilées par splitDureeByModality
 *  - Durées Réalisées : laissées vides (formateur les remplit manuellement
 *    dans le PDF avant envoi OPCO — Attendance pas encore calculée auto)
 *  - Somme lettres : vide (helper numberToFrenchWords TODO V2)
 *  - Mode règlement : "Virement bancaire" (default static)
 *  - Date règlement : depuis Invoice.paidAt si trouvée, sinon vide
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { loadOfConfig } from '@/lib/of-config';
import {
  fillAgeficeAttendancePdf,
  type AgeficeAttendanceData,
} from '@/lib/agefice-attendance-fill';

// Map TrainingSession.modality → 4 cases AGEFICE (heures).
// Clone du helper agefice-generator.ts (déduplication possible plus tard).
function splitDureeByModality(
  modality: string | null | undefined,
  totalHours: number,
): { presIndiv: number; presColl: number; foadSync: number; foadAsync: number } {
  switch ((modality ?? '').toUpperCase()) {
    case 'PRESENTIEL':
      return { presIndiv: 0, presColl: totalHours, foadSync: 0, foadAsync: 0 };
    case 'DISTANCIEL':
      return { presIndiv: 0, presColl: 0, foadSync: totalHours, foadAsync: 0 };
    case 'MIXTE':
    case 'BLENDED': {
      const half = Math.round(totalHours / 2);
      return { presIndiv: 0, presColl: half, foadSync: totalHours - half, foadAsync: 0 };
    }
    default:
      return { presIndiv: 0, presColl: totalHours, foadSync: 0, foadAsync: 0 };
  }
}

export async function generateAgeficeAttendanceForParticipant(
  participantId: string,
): Promise<{ ok: boolean; documentId?: string; error?: string; warnings?: string[] }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: {
        include: {
          legalLinks: {
            where: { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] } },
            include: { organization: true },
          },
        },
      },
      sponsorOrg: true,
      session: {
        include: {
          product: { select: { title: true, durationHours: true } },
          trainers: {
            include: { person: { select: { firstName: true, lastName: true } } },
            orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
          },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };
  if (!participant.session.product) return { ok: false, error: 'Produit manquant' };

  const warnings: string[] = [];

  // ── EI / auto-entreprise du stagiaire (raison sociale entreprise) ─
  // Priorité : sponsorOrg si AGEFICE, sinon 1er LegalLink EI_SELF, sinon
  // 1er LegalLink, sinon sponsorOrg (en dernier recours).
  let eiOrgName: string | null = null;
  if (participant.sponsorOrg?.opcoCode === 'AGEFICE') {
    eiOrgName = participant.sponsorOrg.legalName;
  } else {
    const eiLink =
      participant.person.legalLinks.find((l) => l.role === 'EI_SELF') ??
      participant.person.legalLinks[0];
    eiOrgName = eiLink?.organization?.legalName ?? participant.sponsorOrg?.legalName ?? null;
  }
  if (!eiOrgName) {
    warnings.push('Aucune entreprise/EI rattachée au stagiaire — champ laissé vide.');
  }

  // ── Formateur principal ───────────────────────────────────────
  const primaryTrainer =
    participant.session.trainers.find((t) => t.isPrimary) ??
    participant.session.trainers[0];
  const formateurNomQualite = primaryTrainer
    ? `${primaryTrainer.person.firstName} ${primaryTrainer.person.lastName} — Formateur`
    : null;

  // ── OF config (pre-resolve BDD+ENV) ───────────────────────────
  const of = await loadOfConfig(user.tenantId);
  const ofResponsablePrenomNom =
    of.resp.prenom && of.resp.nom
      ? `${of.resp.prenom} ${of.resp.nom}`
      : of.name;
  const ofResponsableQualite = of.resp.titre || 'Dirigeant';
  // Région : pas en BDD pour l'instant — static PACA pour Start Academy.
  const ofRegion = 'Provence-Alpes-Côte d’Azur';

  // ── Durées (prévues seulement V1 — réalisées vides) ───────────
  const totalHours = participant.session.product.durationHours;
  const split = splitDureeByModality(participant.session.modality, totalHours);

  // ── Règlement (Invoice du participant si trouvée) ─────────────
  const invoice = await prisma.invoice.findFirst({
    where: {
      tenantId: user.tenantId,
      participantId,
      status: { in: ['PAID', 'PARTIAL'] },
    },
    orderBy: { paidAt: 'desc' },
    select: { amountTTC: true, paidAt: true },
  });
  const sommeChiffres = invoice ? Number(invoice.amountTTC) : null;
  // Mode règlement : pas de champ sur Invoice — static default. Le user pourra
  // l'éditer manuellement dans le PDF si besoin (formulaire éditable).
  const modeReglement = 'Virement bancaire';
  const dateReglement = invoice?.paidAt ?? null;

  // ── Compose les données + génère le PDF ───────────────────────
  const data: AgeficeAttendanceData = {
    formationIntitule:
      participant.session.name ?? participant.session.product.title,
    formationDateDebut: participant.session.startDate,
    formationDateFin: participant.session.endDate,
    formateurNomQualite,
    ofRaisonSociale: of.name,
    ofNumeroDeclaration: of.rnq,
    ofRegion,
    ofResponsablePrenomNom,
    ofResponsableQualite,
    ofLieuDelivrance: of.addressVille || '',
    stagiaireNomPrenom: `${participant.person.firstName} ${participant.person.lastName}`.trim(),
    entrepriseRaisonSociale: eiOrgName,
    prevuePresIndividuel: split.presIndiv,
    prevuePresCollectif: split.presColl,
    prevueFoadSync: split.foadSync,
    prevueFoadAsync: split.foadAsync,
    // V1 : formateur édite manuellement le PDF pour les réalisées.
    realiseePresIndividuel: null,
    realiseePresCollectif: null,
    realiseeFoadSync: null,
    realiseeFoadAsync: null,
    sommeChiffres,
    sommeLettres: null, // V1 : laissé vide
    modeReglement,
    dateReglement,
    dateDelivrance: new Date(),
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await fillAgeficeAttendancePdf(data);
  } catch (e: any) {
    return { ok: false, error: `Erreur rendu PDF attestation assiduité : ${e?.message ?? e}` };
  }

  // ── Idempotence sha256 + upload + Document ────────────────────
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const existing = await prisma.document.findFirst({
    where: {
      tenantId: user.tenantId,
      type: 'ASSIDUITE',
      participantId,
      hashSha256: hash,
    },
    select: { id: true, pdfUrl: true },
  });
  if (existing) {
    return { ok: true, documentId: existing.id, warnings: warnings.length ? warnings : undefined };
  }

  const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const objectKey = `assiduite/${participant.session.code}/${safePersonSlug}-${hash.slice(0, 8)}.pdf`;
  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'ASSIDUITE',
      entityType: 'participant',
      entityId: participant.id,
      sessionId: participant.session.id,
      participantId: participant.id,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  revalidatePath(`/app/sessions/${participant.session.id}`);
  revalidatePath(`/app/apprenants/${participant.person.id}`);
  return {
    ok: true,
    documentId: doc.id,
    warnings: warnings.length ? warnings : undefined,
  };
}
