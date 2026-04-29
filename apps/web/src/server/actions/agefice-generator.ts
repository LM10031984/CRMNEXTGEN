'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdf } from '@/lib/pdf-render';
import { renderAgeficeHtml, type AgeficePdfData } from '@/lib/agefice-template';

const OF_DEFAULTS = {
  name: process.env.OF_NAME ?? 'Start Academy',
  siret: process.env.OF_SIRET ?? '00000000000000',
  address: process.env.OF_ADDRESS ?? '— Adresse à compléter dans .env —',
  rnq: process.env.OF_RNQ ?? '— Numéro de déclaration à compléter —',
  phone: process.env.OF_PHONE ?? '04 00 00 00 00',
  email: process.env.OF_EMAIL ?? 'contact@start-academy.fr',
};

export async function generateAgeficeForParticipant(
  participantId: string,
): Promise<{ ok: boolean; documentId?: string; error?: string; warnings?: string[] }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: {
        include: {
          sensitiveData: true,
          legalLinks: {
            where: { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] } },
            include: {
              organization: { include: { ageficeProfile: true } },
            },
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
      session: {
        include: {
          product: true,
          location: true,
          trainers: { include: { person: true } },
        },
      },
      sponsorOrg: { include: { ageficeProfile: true } },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const warnings: string[] = [];

  // Détermine l'organisation EI à utiliser pour AGEFICE :
  // 1. Le sponsorOrg si AGEFICE
  // 2. Sinon le 1er LegalLink EI_SELF
  // 3. Sinon le 1er LegalLink AGENT_COMMERCIAL
  let eiOrg = participant.sponsorOrg.opcoCode === 'AGEFICE' ? participant.sponsorOrg : null;
  let agefice = eiOrg?.ageficeProfile ?? null;
  if (!eiOrg) {
    const eiLink = participant.person.legalLinks.find((l) => l.role === 'EI_SELF') ?? participant.person.legalLinks[0];
    if (eiLink?.organization) {
      eiOrg = eiLink.organization;
      agefice = eiLink.organization.ageficeProfile;
    }
  }
  if (!eiOrg) {
    return {
      ok: false,
      error: 'Aucune auto-entreprise rattachée à cet apprenant. Crée un LegalLink EI_SELF avant de générer le formulaire AGEFICE.',
    };
  }
  if (eiOrg.opcoCode !== 'AGEFICE') {
    warnings.push(`L'organisation "${eiOrg.legalName}" n'est pas en OPCO=AGEFICE (actuel : ${eiOrg.opcoCode ?? 'aucun'}). Le formulaire est généré quand même.`);
  }
  if (!agefice) {
    warnings.push("Pas d'AgeficeProfile sur cette organisation : les champs PA, paFields seront vides.");
  }

  const session = participant.session;
  const product = session.product;
  const personalAddress = (participant.person.personalAddress ?? null) as null | {
    street?: string; postalCode?: string; city?: string;
  };
  const orgAddress = (eiOrg.address ?? null) as null | { street?: string; postalCode?: string; city?: string };
  const paFields = (agefice?.paFields ?? {}) as Record<string, any>;
  const paAddrJson = (agefice?.paAddress ?? null) as null | { full?: string; street?: string; city?: string };

  const data: AgeficePdfData = {
    // Stagiaire
    stagiaireNom: participant.person.lastName,
    stagiairePrenom: participant.person.firstName,
    stagiaireNomNaissance: participant.person.birthName,
    stagiaireDateNaissance: participant.person.birthDate,
    stagiaireLieuNaissance: paFields['Lieu de naissance (Stagiaire)'] ?? null,
    stagiaireSecu: participant.person.sensitiveData?.socialSecurityNb ?? null,
    stagiaireEmail: participant.person.email,
    stagiaireTel: participant.person.phone,
    stagiaireAdresse: personalAddress?.street ?? null,
    stagiaireCp: personalAddress?.postalCode ?? null,
    stagiaireVille: personalAddress?.city ?? null,
    // Entreprise
    entrepriseRaisonSociale: eiOrg.legalName,
    entrepriseSiret: eiOrg.siret,
    entrepriseSiren: eiOrg.siren,
    entrepriseNaf: eiOrg.naf,
    entrepriseFormeJuridique: eiOrg.legalForm,
    entrepriseRcs: eiOrg.rcs,
    entrepriseAdresse: orgAddress?.street ?? null,
    entrepriseCp: orgAddress?.postalCode ?? null,
    entrepriseVille: orgAddress?.city ?? null,
    entrepriseTel: eiOrg.phone,
    entrepriseEmail: eiOrg.email,
    entrepriseActivite: eiOrg.activityDescription,
    // Bancaire (depuis paFields enrichi par module pré-inscription)
    iban: paFields['IBAN'] ?? null,
    bic: paFields['BIC'] ?? null,
    banque: paFields['Banque'] ?? null,
    // PA
    paName: agefice?.paName ?? null,
    paAddress: paAddrJson?.full ?? paAddrJson?.street ?? (typeof agefice?.paAddress === 'string' ? agefice.paAddress : null),
    paContact: agefice?.paContact ?? null,
    affiliationUrssaf: paFields["N° affiliation URSSAF"] ?? null,
    // Formation
    formationTitre: product.title,
    formationCode: session.code,
    formationDureeHeures: product.durationHours,
    formationDateDebut: session.startDate,
    formationDateFin: session.endDate,
    formationLieu: session.location?.name ?? null,
    formationModalite: session.modality,
    formationFormateur: session.trainers
      .map((t) => `${t.person.firstName} ${t.person.lastName}`)
      .join(', ') || 'À confirmer',
    formationTarifHT: Number(participant.priceHT) || Number(product.priceHT),
    formationTarifTotal: Number(participant.priceHT) || Number(product.priceHT),
    // OF
    ofName: OF_DEFAULTS.name,
    ofSiret: OF_DEFAULTS.siret,
    ofRnq: OF_DEFAULTS.rnq,
    ofAddress: OF_DEFAULTS.address,
    ofPhone: OF_DEFAULTS.phone,
    ofEmail: OF_DEFAULTS.email,
    demandeDate: new Date(),
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderAgeficeHtml(data);
    pdfBuffer = await renderHtmlToPdf(html, `agefice-${session.code}.html`);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF : ${e?.message ?? e}`, warnings };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const slug = `${participant.person.lastName}-${participant.person.firstName}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const key = `agefice/${session.code}/${slug}-${hash.slice(0, 8)}.pdf`;

  try {
    await uploadFile(DOCS_BUCKET, key, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}`, warnings };
  }

  const existing = await prisma.document.findFirst({
    where: { tenantId: user.tenantId, hashSha256: hash, type: 'AGEFICE' },
  });
  if (existing) {
    return { ok: true, documentId: existing.id, warnings };
  }

  const doc = await prisma.document.create({
    data: {
      tenantId: user.tenantId,
      type: 'AGEFICE',
      entityType: 'participant',
      entityId: participantId,
      pdfUrl: key,
      hashSha256: hash,
      sessionId: session.id,
      participantId,
    },
  });

  revalidatePath(`/app/sessions/${session.id}`);
  revalidatePath(`/app/apprenants/${participant.person.id}`);

  return { ok: true, documentId: doc.id, warnings };
}
