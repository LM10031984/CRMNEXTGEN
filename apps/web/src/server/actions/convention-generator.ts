'use server';

/**
 * Génère une convention de formation professionnelle pour une inscription.
 *
 * Logique métier :
 * - Si le sponsorOrg de l'inscription est l'auto-entreprise de l'apprenant
 *   (LegalLink role EI_SELF), le bénéficiaire = AE, représentant = apprenant
 * - Sinon (sponsor = structure employeur, apprenant salarié), bénéficiaire =
 *   structure, représentant = champ Organization.representative
 *
 * NB : pour grouper plusieurs salariés de la même structure sur une seule
 * convention, on utilisera plus tard generateConventionForSession(sessionId,
 * sponsorOrgId) qui agrège.
 */

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  renderConventionHtml,
  type ConventionData,
  type ConventionStagiaire,
} from '@/lib/convention-template';
import { loadOfConfig } from '@/lib/of-config';

export async function generateConventionForParticipant(
  participantId: string,
  options?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // Idempotence inconditionnelle : on supprime toujours l'ancien Document du
  // même type avant de recréer (anti-doublons). Le paramètre `force` reste
  // accepté dans la signature pour compat appelants mais ne conditionne plus rien.
  await prisma.document.deleteMany({
    where: { tenantId: user.tenantId, type: 'CONVENTION', participantId },
  });

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: {
        include: {
          legalLinks: { include: { organization: true } },
        },
      },
      sponsorOrg: true,
      session: {
        include: {
          product: true,
          location: true,
          trainers: { include: { person: true } },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };
  if (!participant.session.product) return { ok: false, error: 'Produit lié à la session manquant' };

  const participantPrice = Number(participant.priceHT);
  const productPrice = Number(participant.session.product.priceHT);
  const effectivePrice = participantPrice > 0 ? participantPrice : productPrice;
  if (effectivePrice <= 0) {
    return {
      ok: false,
      error:
        "Prix HT non défini : ni sur l'inscription (fiche session, bouton Éditer) ni sur le produit (/app/produits). Renseignez l'un des deux avant de générer la convention.",
    };
  }

  // Détermine si l'apprenant est rattaché à son sponsorOrg via EI_SELF
  // (= auto-entreprise perso) ou via SALARIE/DIRIGEANT (= structure employeur).
  const linkToSponsor = participant.person.legalLinks.find(
    (l) => l.organizationId === participant.sponsorOrgId,
  );
  const isSelfEmployed = linkToSponsor?.role === 'EI_SELF';

  // Représentant qui signe la convention
  const representantNom = isSelfEmployed
    ? `${participant.person.firstName} ${participant.person.lastName.toUpperCase()}`.trim()
    : (participant.sponsorOrg.representative?.trim() || `${participant.person.firstName} ${participant.person.lastName.toUpperCase()}`.trim());

  // Stagiaire(s) couverts par cette convention. Pour le MVP, 1 seule personne.
  const stagiaires: ConventionStagiaire[] = [
    {
      prenom: participant.person.firstName,
      nom: participant.person.lastName,
      email: participant.person.email,
    },
  ];

  // Lieu : "Raison sociale — Nom du lieu, adresse" si dispo, sinon siège OF.
  // legalName ajouté 2026-06-03 (cf demande Laurent : ex "SARL XYZ — Agence
  // Nice Centre, 12 rue X, 06000 Nice").
  const of = await loadOfConfig(user.tenantId);
  const locName = participant.session.location
    ? [
        (participant.session.location as { legalName?: string | null }).legalName,
        participant.session.location.name,
      ]
        .filter(Boolean)
        .join(' — ')
    : null;
  const locAddress = participant.session.location?.address as Record<string, string> | string | null;
  let lieu: string;
  if (typeof locAddress === 'string') lieu = [locName, locAddress].filter(Boolean).join(', ') || locAddress;
  else if (locAddress && typeof locAddress === 'object') {
    const parts = [locAddress.street, locAddress.postalCode, locAddress.city].filter(Boolean);
    lieu = [locName, parts.join(', ')].filter(Boolean).join(', ') || (locName ?? of.addressFull);
  } else {
    lieu = locName ?? of.addressFull;
  }

  // RCS ville : heuristique depuis le code postal de l'org si possible
  const orgAddr = (participant.sponsorOrg.address as Record<string, string> | null) ?? null;
  const rcsVille = orgAddr?.city ?? null;

  // Produit : objectifs depuis la fiche produit
  const objectives = (participant.session.product.objectives as string[] | null) ?? [];

  const data: ConventionData = {
    beneficiaireRaisonSociale: participant.sponsorOrg.legalName,
    beneficiaireSiret: participant.sponsorOrg.siret,
    beneficiaireRcsVille: rcsVille,
    beneficiaireRepresentantNom: representantNom,
    stagiaires,
    sessionStartDate: participant.session.startDate,
    sessionEndDate: participant.session.endDate,
    sessionLieu: lieu,
    produitTitre: participant.session.name ?? participant.session.product.title,
    produitDureeHeures: participant.session.product.durationHours,
    produitObjectifs: objectives,
    produitProgrammeMd: typeof participant.session.product.programMd === 'string' ? participant.session.product.programMd : '',
    produitTrainerProfile: participant.session.product.trainerProfile,
    produitPriceHTPerStagiaire: effectivePrice,
    // Phase 7 (Plan 07-03) — résolution logo uploadé via Paramètres
    tenantId: user.tenantId,
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderConventionHtml(data, of);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF convention : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const objectKey = `conventions/${participant.session.code}/${safePersonSlug}-${hash.slice(0, 8)}.pdf`;

  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const document = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'CONVENTION',
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
  return { ok: true, documentId: document.id };
}
