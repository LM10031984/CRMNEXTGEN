'use server';

/**
 * Valider une demande d'inscription reçue par le lien public :
 * conversion en apprenant PUIS création du SessionParticipant.
 *
 * C'est le chaînon qui manquait : `convertPreEnrollment` crée Person +
 * Organization + LegalLink + AgeficeProfile, mais n'inscrivait personne dans
 * la session visée.
 *
 * Un dossier DÉJÀ converti (typiquement depuis /app/inscriptions, qui ne sait
 * que convertir) n'est pas reconverti : on repart de `convertedToPersonId` et
 * `convertedToOrgId`. Sans cela il restait bloqué pour toujours — la
 * conversion refuse de se rejouer, et rien d'autre ne créait le participant.
 *
 * Le formulaire public ne touche JAMAIS au prix. En revanche l'inscrit hérite
 * du tarif de la session : poser 0 en dur fabriquait une convention à zéro
 * euro dès la validation, puisque `prepareTrainingForSession` génère les
 * pièces dans la foulée. Le tarif reste modifiable ensuite depuis la fiche
 * participant, et `applyPriceCascade` le repropage si la session change de
 * tarif (cf. lib/pricing/, audit 2026-08-28 écart E-2).
 */

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { resolveSponsorOrg, cleanSiret } from '@/lib/enrollment/sponsor-org';
import { refusalForSessionPayer } from '@/lib/sessions/session-regime';
import { assertCompanyPriceEditable } from '@/lib/pricing/company-session-price';
import { legalLinkAtSession } from '@/lib/persons/legal-link-period';
import { createDeclaredParticipant } from '@/lib/pricing/declared-session-enrollment';
import { resolveDefaultParticipantPrice } from '@/lib/pricing/resolve-default-price';
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
  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: {
      id: true, tenantId: true, startDate: true, endDate: true, priceTotalHT: true, regime: true,
      pricePerLearner: true,
      product: { select: { priceHT: true, groupFlatPrice: true } },
    },
  });
  if (!session) return { ok: false, error: 'Session introuvable.' };

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

  // 2. Personne + organisation payeuse.
  //
  //    LA CONVERSION EST UNE ÉTAPE FRANCHIE, PAS UN VERROU. Un dossier converti
  //    depuis /app/inscriptions a bien sa Person et son Organization, mais aucun
  //    SessionParticipant — et `convertPreEnrollment` refuse net d'y repasser
  //    (« Déjà convertie en apprenant »). Jusqu'au 15/09/2026 ce dossier était
  //    perdu : l'apprenant existait, la session restait vide, et plus rien ne
  //    pouvait les rapprocher (constaté sur SES-0114, 3 demandes « Inscrite »
  //    pour 0 inscrit). On repart donc de ce que la conversion a laissé.
  const dejaConvertie = pe.status === 'CONVERTED' && Boolean(pe.convertedToPersonId);

  // Refus du PAYEUR avant conversion de la demande. Le contrôle complet est
  // rejoué dans la transaction d'inscription avec les rattachements réels.
  if (session.regime) {
    const targetId = input.overrideSponsorOrgId ?? pe.convertedToOrgId ?? (decision.kind === 'org-existante' ? decision.organizationId : null);
    const target = targetId ? await prisma.organization.findFirst({ where: { id: targetId, tenantId: user.tenantId, archived: false }, select: { legalForm: true, legalName: true } }) : null;
    const person = pe.convertedToPersonId ? await prisma.person.findFirst({ where: { id: pe.convertedToPersonId, tenantId: user.tenantId }, include: { legalLinks: true } }) : null;
    try {
      const role = targetId && person ? legalLinkAtSession(person.legalLinks, targetId, session)?.role : decision.kind === 'creer-ei' ? 'EI_SELF' : null;
      const refusal = refusalForSessionPayer(session.regime, { name: `${pe.firstName ?? ''} ${pe.lastName ?? ''}`, sponsorLegalForm: target?.legalForm ?? (decision.kind === 'creer-ei' ? 'EI' : null), roleChezSponsor: role });
      if (refusal) return { ok: false, error: refusal, needsSponsor: true };
      await assertCompanyPriceEditable(prisma, session);
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  let personId: string;
  let sponsorOrgId: string | null;

  if (dejaConvertie) {
    personId = pe.convertedToPersonId!;
    //  Ordre de priorité du payeur : ce que l'admin vient de choisir l'emporte
    //  (c'est une correction explicite), puis ce que la conversion avait posé,
    //  puis une organisation déjà connue par son SIRET.
    sponsorOrgId =
      input.overrideSponsorOrgId ??
      pe.convertedToOrgId ??
      (decision.kind === 'org-existante' ? decision.organizationId : null);
    if (!sponsorOrgId) {
      return {
        ok: false,
        error:
          decision.kind === 'a-confirmer'
            ? decision.raison
            : "Ce dossier a été converti sans organisation payeuse",
        needsSponsor: true,
      };
    }
  } else {
    if (decision.kind === 'a-confirmer') {
      return { ok: false, error: decision.raison, needsSponsor: true };
    }

    // Conversion en apprenant (Person, Org EI, LegalLink, AgeficeProfile).
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

    personId = conv.personId;
    sponsorOrgId = decision.kind === 'org-existante' ? decision.organizationId : (conv.orgId ?? null);
    if (!sponsorOrgId) {
      return {
        ok: false,
        error: 'Organisation payeuse introuvable après conversion',
        needsSponsor: true,
      };
    }
  }

  // 3. Inscription — jamais deux fois la même personne sur la même session.
  const deja = await prisma.sessionParticipant.findUnique({
    where: { sessionId_personId: { sessionId, personId } },
    select: { id: true },
  });
  if (deja) {
    return { ok: false, error: 'Cette personne est déjà inscrite à cette session' };
  }

  // Tarif hérité de la session (jamais du formulaire public), via la source
  // unique de la règle. Scopé tenant comme toute lecture de ce module.

  const sponsorOrg = await prisma.organization.findFirst({
    where: { id: sponsorOrgId, tenantId: user.tenantId },
    select: { legalForm: true },
  });
  const defaultPrice = resolveDefaultParticipantPrice(session, session?.product ?? null, sponsorOrg);
  if (defaultPrice.needsReview) {
    console.warn(`[inscription ${pe.id}] tarif à arbitrer : ${defaultPrice.reason}`);
  }

  let participant;
  try { participant = session?.regime ? await createDeclaredParticipant(user, { sessionId, personId, sponsorOrgId, participantType: pe.professionalStatus ?? null }) : await prisma.sessionParticipant.create({
    data: {
      sessionId,
      personId,
      sponsorOrgId,
      priceHT: new Prisma.Decimal(defaultPrice.priceHT),
      enrollmentStatus: 'PRE_ENROLLED',
      participantType: pe.professionalStatus ?? null,
    },
  });

  } catch (e) { return { ok: false, error: (e as Error).message }; }

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
