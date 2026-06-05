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
  renderAgeficeAttendanceHtml,
  type AgeficeAttendanceTemplateData,
} from '@/lib/closure/agefice-attendance-template';
import { renderHtmlToPdf } from '@/lib/pdf-render';

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
  options?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; error?: string; warnings?: string[] }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  if (options?.force) {
    await prisma.document.deleteMany({
      where: { tenantId: user.tenantId, type: 'ASSIDUITE', participantId },
    });
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: {
        include: {
          legalLinks: {
            // Tous les LegalLinks pertinents : EI (autoentrepreneur) ou
            // employeur (salarié immobilier sous enseigne).
            where: { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL', 'SALARIE'] } },
            include: { organization: true },
          },
        },
      },
      sponsorOrg: true,
      session: {
        include: {
          product: { select: { title: true, durationHours: true, priceHT: true } },
          trainers: {
            include: {
              person: { select: { firstName: true, lastName: true } },
            },
            orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
          },
          _count: { select: { participants: true } },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };
  if (!participant.session.product) return { ok: false, error: 'Produit manquant' };

  const warnings: string[] = [];

  // ── Société du stagiaire (raison sociale entreprise) ──────────
  // Priorité métier :
  //   1. sponsorOrg si AGEFICE (cas typique financement)
  //   2. EI_SELF (autoentrepreneur — sa propre EI)
  //   3. AGENT_COMMERCIAL (indépendant rattaché enseigne immobilière)
  //   4. SALARIE (structure employeur)
  //   5. sponsorOrg fallback
  let eiOrgName: string | null = null;
  if (participant.sponsorOrg?.opcoCode === 'AGEFICE') {
    eiOrgName = participant.sponsorOrg.legalName;
  } else {
    const orderedRoles = ['EI_SELF', 'AGENT_COMMERCIAL', 'SALARIE'] as const;
    const link = orderedRoles
      .map((role) => participant.person.legalLinks.find((l) => l.role === role))
      .find((l) => l != null);
    eiOrgName = link?.organization?.legalName ?? participant.sponsorOrg?.legalName ?? null;
  }
  if (!eiOrgName) {
    warnings.push('Aucune entreprise/EI rattachée au stagiaire — champ laissé vide.');
  }

  // ── Formateur principal ───────────────────────────────────────
  // Pas de suffixe "— Formateur" en dur (tautologique avec le label de la
  // ligne du tableau "Nom et qualité du formateur"). Si `trainer.role` est
  // renseigné et différent du défaut générique, on l'ajoute après une virgule.
  const primaryTrainer =
    participant.session.trainers.find((t) => t.isPrimary) ??
    participant.session.trainers[0];
  let formateurNomQualite: string | null = null;
  if (primaryTrainer) {
    const nom = `${primaryTrainer.person.firstName} ${primaryTrainer.person.lastName}`.trim();
    const role = primaryTrainer.role?.trim();
    // Ne jamais afficher les codes internes (LEAD / CO / FORMATEUR…).
    // Laurent 2026-06-04 : "LEAD ne sert à rien dans Nom et qualité".
    const isInternalCode =
      !role || /^(lead|co|formateur( principal)?)$/i.test(role);
    formateurNomQualite = isInternalCode ? nom : `${nom}, ${role}`;
  }

  // ── OF config (pre-resolve BDD+ENV) ───────────────────────────
  const of = await loadOfConfig(user.tenantId);
  const ofResponsablePrenomNom =
    of.resp.prenom && of.resp.nom
      ? `${of.resp.prenom} ${of.resp.nom}`
      : of.name;
  const ofResponsableQualite = of.resp.titre || 'Dirigeant';
  // Le label PDF dit "DREETS/DRIEETS/DEETS de ___" → c'est la ville/UD de
  // rattachement DREETS, pas la région administrative. Start Academy
  // (Cagnes sur Mer, NDA 93 06 10481 06) est rattaché à l'UD de Grasse.
  // V1 hardcoded — futur : ajouter un champ tenant.dreetsCity éditable.
  const ofDreetsVille = 'Grasse';

  // ── Durées (prévues seulement V1 — réalisées vides) ───────────
  const totalHours = participant.session.product.durationHours;
  const split = splitDureeByModality(participant.session.modality, totalHours);

  // ── Règlement ────────────────────────────────────────────────
  // Source : priceHT du participant (Decimal en euros, schéma 553).
  // Fallback product.priceHT si participant à 0 (cas import SmartOF avant
  // propagation). Si toujours 0 → bloc masqué côté template.
  const priceParticipant = Number(participant.priceHT ?? 0);
  const priceProduct = Number(
    (participant.session.product as { priceHT?: unknown }).priceHT ?? 0,
  );
  const montant = priceParticipant > 0 ? priceParticipant : priceProduct;
  const sommeChiffres: number | null = montant > 0 ? montant : null;
  const sommeLettres: string | null = null;
  const modeReglement = 'Virement bancaire';
  const dateReglement = participant.session.endDate;
  if (sommeChiffres == null) {
    warnings.push(
      'Montant HT à 0 € — bloc règlement masqué. Renseigne le tarif sur la session ou le produit.',
    );
  }

  // ── Compose les données + génère le PDF ───────────────────────
  // Durées réalisées : par défaut = prévues (formation supposée intégralement
  // suivie, cohérent avec modèle Kristin où prévu=réalisé=72). Si le
  // formateur a besoin d'ajuster, V3 : lire l'Attendance réelle par modalité.
  const data: AgeficeAttendanceTemplateData = {
    tenantId: user.tenantId,
    formationIntitule:
      participant.session.name ?? participant.session.product.title,
    formationDateDebut: participant.session.startDate,
    formationDateFin: participant.session.endDate,
    formateurNomQualite,
    nombreParticipants: participant.session._count.participants,
    ofRaisonSociale: of.name,
    ofNumeroDeclaration: of.rnq,
    ofDreetsVille,
    ofResponsablePrenomNom,
    ofResponsableQualite,
    ofLieuDelivrance: of.addressVille || '',
    // Format Kristin : "M./Mme NOM Prénom" (civilité + NOM en majuscules + Prénom).
    // Si pas de civilité saisie, on omet (pas de fallback générique).
    stagiaireNomPrenom: [
      participant.person.civility?.trim(),
      `${(participant.person.lastName ?? '').toUpperCase()} ${participant.person.firstName ?? ''}`.trim(),
    ]
      .filter(Boolean)
      .join(' '),
    entrepriseRaisonSociale: eiOrgName,
    prevuePresIndividuel: split.presIndiv,
    prevuePresCollectif: split.presColl,
    prevueFoadSync: split.foadSync,
    prevueFoadAsync: split.foadAsync,
    realiseePresIndividuel: split.presIndiv || null,
    realiseePresCollectif: split.presColl || null,
    realiseeFoadSync: split.foadSync || null,
    realiseeFoadAsync: split.foadAsync || null,
    sommeChiffres,
    sommeLettres,
    modeReglement,
    dateReglement,
    dateDelivrance: new Date(),
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderAgeficeAttendanceHtml(data);
    pdfBuffer = await renderHtmlToPdf(html);
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
