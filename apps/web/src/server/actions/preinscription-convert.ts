'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, Prisma, encryptSensitive } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';

interface ConversionInput {
  preEnrollmentId: string;
  // Données admin éditées (peuvent override l'IA)
  firstName: string;
  lastName: string;
  birthName?: string | null;
  email: string;
  phone?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  // Statut pro & EI
  professionalStatus?: string | null; // "Agent commercial" | "Salarié" | "Dirigeant"
  // Org EI (si autoentrepreneur)
  createEiOrg: boolean;
  eiSiret?: string | null;
  eiLegalName?: string | null;
  eiNaf?: string | null;
  eiAddress?: string | null;
  eiCity?: string | null;
  eiPostalCode?: string | null;
  // RIB
  iban?: string | null;
  bic?: string | null;
  bankName?: string | null;
  // SensitiveData
  socialSecurityNb?: string | null;
  // AgeficeProfile pré-remplie
  paName?: string | null;
  paAddress?: string | null;
  affiliationUrssaf?: string | null;
}

export async function convertPreEnrollment(
  input: ConversionInput,
): Promise<{ ok: boolean; personId?: string; orgId?: string; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const pe = await prisma.preEnrollment.findFirst({
    where: { id: input.preEnrollmentId, tenantId: user.tenantId },
  });
  if (!pe) return { ok: false, error: 'Pré-inscription introuvable' };
  if (pe.status === 'CONVERTED') {
    return { ok: false, error: 'Déjà convertie en apprenant' };
  }

  // Validation minimale
  if (!input.firstName?.trim() || !input.lastName?.trim() || !input.email?.trim()) {
    return { ok: false, error: 'Nom, prénom et email sont obligatoires' };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Person (chercher d'abord un existant par email)
      const emailNormalized = input.email.trim().toLowerCase();
      let person = await tx.person.findFirst({
        where: { tenantId: user.tenantId, email: emailNormalized },
      });
      if (!person) {
        person = await tx.person.create({
          data: {
            tenantId: user.tenantId,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            birthName: input.birthName?.trim() || null,
            email: emailNormalized,
            phone: input.phone?.trim() || null,
            birthDate: input.birthDate ? new Date(input.birthDate) : null,
            educationLevel: pe.educationLevel ?? null,
            diplomas: pe.diploma ?? null,
            professionalExperience: pe.professionalExperience ?? null,
            professionalStatus: input.professionalStatus ?? null,
          },
        });
      }

      // 2. SensitiveData (n° SS) — chiffré at-rest via pgcrypto (Sprint 1).
      if (input.socialSecurityNb) {
        const encryptedSsn = await encryptSensitive(input.socialSecurityNb);
        await tx.sensitiveData.upsert({
          where: { personId: person.id },
          create: {
            personId: person.id,
            socialSecurityNb: encryptedSsn,
          },
          update: {
            socialSecurityNb: encryptedSsn,
          },
        });
      }

      // 3. Org EI (si auto-entrepreneur)
      let orgId: string | null = null;
      if (input.createEiOrg && (input.eiSiret || input.eiLegalName)) {
        const cleanSiret = input.eiSiret?.replace(/\D/g, '').slice(0, 14) || null;
        // Chercher une org existante par SIRET
        let org = cleanSiret
          ? await tx.organization.findFirst({
              where: { tenantId: user.tenantId, siret: cleanSiret, archived: false },
            })
          : null;
        if (!org) {
          const orgName = input.eiLegalName?.trim() || `${input.firstName} ${input.lastName.toUpperCase()}`;
          const opcoAge = await tx.opcoCatalog.findUnique({ where: { code: 'AGEFICE' } });
          org = await tx.organization.create({
            data: {
              tenantId: user.tenantId,
              legalName: orgName,
              legalForm: 'AUTO_ENTREPRENEUR',
              siret: cleanSiret,
              siren: cleanSiret ? cleanSiret.slice(0, 9) : null,
              naf: input.eiNaf?.trim() || null,
              address: input.eiAddress
                ? {
                    street: input.eiAddress,
                    postalCode: input.eiPostalCode ?? null,
                    city: input.eiCity ?? null,
                    country: 'France',
                  }
                : Prisma.JsonNull,
              opcoCode: 'AGEFICE',
              opcoCatalogId: opcoAge?.id ?? null,
              type: 'EI personnelle',
            },
          });
        }
        orgId = org.id;

        // 4. LegalLink EI_SELF
        const existingLink = await tx.legalLink.findFirst({
          where: { personId: person.id, organizationId: orgId, role: 'EI_SELF' },
        });
        if (!existingLink) {
          await tx.legalLink.create({
            data: {
              personId: person.id,
              organizationId: orgId,
              role: 'EI_SELF',
              isPrimary: true,
            },
          });
        }

        // 5. AgeficeProfile pré-rempli (l'IBAN/BIC sont stockés dans paFields)
        const existingAp = await tx.ageficeProfile.findUnique({ where: { organizationId: orgId } });
        const paFields: Record<string, any> = {
          'Nom (Stagiaire)': input.lastName,
          'Prénom (Stagiaire)': input.firstName,
          'Date de naissance (Stagiaire)': input.birthDate ?? '',
          'Lieu de naissance (Stagiaire)': input.birthPlace ?? '',
          // Sprint 1 — Sécurité : le N° SS n'est plus dupliqué en clair dans
          // paFields. La source de vérité est SensitiveData.socialSecurityNb
          // (chiffré pgcrypto). Le PDF AGEFICE le lit depuis là.
          'N° Sécurité sociale (Stagiaire)': '',
          'Email (Stagiaire)': emailNormalized,
          'Téléphone (Stagiaire)': input.phone ?? '',
          'N° SIRET (Entreprise)': cleanSiret ?? '',
          'Forme juridique (Entreprise)': 'Auto-entrepreneur',
          'N° affiliation URSSAF': input.affiliationUrssaf ?? '',
          'Nom du PA AGEFICE': input.paName ?? '',
          'Adresse du PA AGEFICE': input.paAddress ?? '',
          'Adresse (Entreprise)': input.eiAddress ?? '',
          'Ville (Entreprise)': input.eiCity ?? '',
          'Code postal (Entreprise)': input.eiPostalCode ?? '',
          'IBAN': input.iban ?? '',
          'BIC': input.bic ?? '',
        };
        if (existingAp) {
          await tx.ageficeProfile.update({
            where: { id: existingAp.id },
            data: {
              paName: input.paName ?? existingAp.paName,
              paContact: existingAp.paContact,
              paAddress: input.paAddress
                ? { full: input.paAddress }
                : existingAp.paAddress ?? Prisma.JsonNull,
              paFields: { ...((existingAp.paFields as any) ?? {}), ...paFields },
            },
          });
        } else {
          await tx.ageficeProfile.create({
            data: {
              organizationId: orgId,
              paName: input.paName ?? null,
              paAddress: input.paAddress ? { full: input.paAddress } : Prisma.JsonNull,
              paFields,
            },
          });
        }
      }

      // 6. PreEnrollment → CONVERTED
      await tx.preEnrollment.update({
        where: { id: pe.id },
        data: {
          status: 'CONVERTED',
          convertedToPersonId: person.id,
          convertedToOrgId: orgId,
          convertedAt: new Date(),
          validatedByUserId: user.id,
          validatedAt: new Date(),
        },
      });

      return { personId: person.id, orgId };
    });

    revalidatePath('/app/inscriptions');
    revalidatePath(`/app/inscriptions/${input.preEnrollmentId}`);
    revalidatePath('/app/apprenants');

    return { ok: true, personId: result.personId, orgId: result.orgId ?? undefined };
  } catch (e: any) {
    console.error('Conversion échouée', e);
    return { ok: false, error: e?.message ?? 'Erreur lors de la conversion' };
  }
}

export async function rejectPreEnrollment(
  preEnrollmentId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };
  const pe = await prisma.preEnrollment.findFirst({ where: { id: preEnrollmentId, tenantId: user.tenantId } });
  if (!pe) return { ok: false, error: 'Pré-inscription introuvable' };
  await prisma.preEnrollment.update({
    where: { id: preEnrollmentId },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      validatedByUserId: user.id,
      validatedAt: new Date(),
    },
  });
  revalidatePath('/app/inscriptions');
  return { ok: true };
}
