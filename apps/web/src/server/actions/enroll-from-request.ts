'use server';

/**
 * Valider une demande d'inscription reçue par le lien public :
 * conversion en apprenant PUIS création du SessionParticipant.
 *
 * C'est le chaînon qui manquait : `convertPreEnrollment` crée Person +
 * Organization + LegalLink + AgeficeProfile, mais n'inscrivait personne dans
 * la session visée.
 *
 * Le prix est posé à 0 : la tarification se saisit depuis la fiche session
 * (bouton « Modifier » du participant), comme pour toute inscription. Le
 * formulaire public ne touche JAMAIS au prix.
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { resolveSponsorOrg, cleanSiret } from '@/lib/enrollment/sponsor-org';
import { convertPreEnrollment } from './preinscription-convert';
import { prepareTrainingForSession } from './prepare-training';

export async function enrollFromRequest(input: {
  preEnrollmentId: string;
  overrideSponsorOrgId?: string;
}): Promise<
  { ok: true; participantId: string } | { ok: false; error: string; needsSponsor?: boolean }
> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const pe = await prisma.preEnrollment.findFirst({
    where: { id: input.preEnrollmentId, tenantId: user.tenantId },
  });
  if (!pe) return { ok: false, error: 'Demande introuvable' };
  if (!pe.intendedSessionId) {
    return { ok: false, error: "Cette demande n'est rattachée à aucune session" };
  }
  const sessionId = pe.intendedSessionId;

  // 1. Qui paye ? — la recherche par SIRET est faite ici, la décision est
  //    déléguée au module pur (testable sans base).
  const siret = cleanSiret(pe.companySiret);
  const matched = input.overrideSponsorOrgId
    ? { id: input.overrideSponsorOrgId }
    : siret
      ? await prisma.organization.findFirst({
          where: { tenantId: user.tenantId, siret, archived: false },
          select: { id: true },
        })
      : null;

  const decision = resolveSponsorOrg({
    professionalStatus: pe.professionalStatus,
    companyName: pe.companyName,
    companySiret: pe.companySiret,
    firstName: pe.firstName ?? '',
    lastName: pe.lastName ?? '',
    matchedOrganizationId: matched?.id ?? null,
  });

  if (decision.kind === 'a-confirmer') {
    return { ok: false, error: decision.raison, needsSponsor: true };
  }

  // 2. Conversion en apprenant (Person, Org EI, LegalLink, AgeficeProfile).
  const conv = await convertPreEnrollment({
    preEnrollmentId: pe.id,
    firstName: pe.firstName ?? '',
    lastName: pe.lastName ?? '',
    birthName: pe.birthName,
    email: pe.email ?? '',
    phone: pe.phone,
    birthDate: pe.birthDate ? pe.birthDate.toISOString().slice(0, 10) : null,
    birthPlace: pe.birthPlace,
    professionalStatus: pe.professionalStatus,
    createEiOrg: decision.kind === 'creer-ei',
    eiSiret: decision.kind === 'creer-ei' ? decision.siret : null,
    eiLegalName: decision.kind === 'creer-ei' ? decision.legalName : null,
    eiAddress: pe.address,
    eiCity: pe.city,
    eiPostalCode: pe.postalCode,
  });
  if (!conv.ok || !conv.personId) {
    return { ok: false, error: conv.error ?? 'Conversion échouée' };
  }

  const sponsorOrgId = decision.kind === 'org-existante' ? decision.organizationId : conv.orgId;
  if (!sponsorOrgId) {
    return {
      ok: false,
      error: 'Organisation payeuse introuvable après conversion',
      needsSponsor: true,
    };
  }

  // 3. Inscription — jamais deux fois la même personne sur la même session.
  const deja = await prisma.sessionParticipant.findUnique({
    where: { sessionId_personId: { sessionId, personId: conv.personId } },
    select: { id: true },
  });
  if (deja) {
    return { ok: false, error: 'Cette personne est déjà inscrite à cette session' };
  }

  const participant = await prisma.sessionParticipant.create({
    data: {
      sessionId,
      personId: conv.personId,
      sponsorOrgId,
      priceHT: new Prisma.Decimal(0),
      enrollmentStatus: 'PRE_ENROLLED',
      participantType: pe.professionalStatus ?? null,
    },
  });

  // 4. Documents du nouvel inscrit. Idempotent (find-or-create) : rejouer ne
  //    duplique rien, et la règle « payeur personne morale ⇒ convention de
  //    groupe » est appliquée par l'orchestrateur, pas ici.
  await Promise.resolve(prepareTrainingForSession(sessionId)).catch((e: any) =>
    console.warn('[inscription] préparation documentaire échouée', e?.message ?? e),
  );

  revalidatePath(`/app/sessions/${sessionId}`);
  revalidatePath('/app/inscriptions');
  return { ok: true, participantId: participant.id };
}
