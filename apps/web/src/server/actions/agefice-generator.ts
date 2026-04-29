'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { getOfConfig } from '@/lib/of-config';
import { buildDeroulementPedagogique } from '@/lib/pedagogy-templates';
import {
  fillAgeficePdf,
  type AgeficeFormData,
  type ExperienceTranche,
  type EvaluationType,
} from '@/lib/agefice-form-fill';

// Heuristique civilité depuis Person.civility (texte libre import legacy)
function inferCivilite(civility: string | null | undefined): 'MR' | 'MME' | null {
  if (!civility) return null;
  const v = civility.trim().toLowerCase().replace(/\./g, '');
  if (['m', 'mr', 'monsieur', 'mister'].includes(v)) return 'MR';
  if (['mme', 'mrs', 'madame', 'mlle', 'mademoiselle'].includes(v)) return 'MME';
  return null;
}

// Map "1-3 ans" / "4 ans" / "Plus de 10 ans" → tranche AGEFICE
function inferExperience(raw: string | null | undefined): ExperienceTranche | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('moins') || s.match(/<\s*1/) || s.includes('< 1')) return 'MOINS_1_AN';
  if (s.includes('plus de 10') || s.match(/\+\s*10/) || s.includes('> 10')) return 'PLUS_10_ANS';
  // chiffre seul
  const m = s.match(/(\d+)/);
  if (m) {
    const n = parseInt(m[1]!, 10);
    if (n < 1) return 'MOINS_1_AN';
    if (n <= 3) return '1_3_ANS';
    if (n <= 10) return '4_10_ANS';
    return 'PLUS_10_ANS';
  }
  return null;
}

// Map TrainingSession.modality → 4 cases AGEFICE (heures)
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
              organization: {
                include: {
                  ageficeProfile: { include: { pointAccueil: true } },
                },
              },
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
      sponsorOrg: {
        include: {
          ageficeProfile: { include: { pointAccueil: true } },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };

  const warnings: string[] = [];

  // ── Détermine l'organisation EI à utiliser ───────────────────
  let eiOrg = participant.sponsorOrg.opcoCode === 'AGEFICE' ? participant.sponsorOrg : null;
  let agefice = eiOrg?.ageficeProfile ?? null;
  if (!eiOrg) {
    const eiLink =
      participant.person.legalLinks.find((l) => l.role === 'EI_SELF') ??
      participant.person.legalLinks[0];
    if (eiLink?.organization) {
      eiOrg = eiLink.organization;
      agefice = eiLink.organization.ageficeProfile;
    }
  }
  if (!eiOrg) {
    return {
      ok: false,
      error:
        "Aucune auto-entreprise rattachée à cet apprenant. Crée un LegalLink EI_SELF avant de générer le formulaire AGEFICE.",
    };
  }
  if (eiOrg.opcoCode !== 'AGEFICE') {
    warnings.push(
      `L'organisation "${eiOrg.legalName}" n'est pas en OPCO=AGEFICE (actuel : ${
        eiOrg.opcoCode ?? 'aucun'
      }). Le formulaire est généré quand même.`,
    );
  }
  if (!agefice) {
    warnings.push(
      "Pas d'AgeficeProfile sur cette organisation : numéro de PA, n° d'affiliation et n° SS resteront vides.",
    );
  }

  // ── Résout le PA AGEFICE (référentiel) ───────────────────────
  // Priorité : AgeficeProfile.pointAccueil → fallback recherche par CP du domicile
  let pointAccueil = agefice?.pointAccueil ?? null;
  const personalAddress = (participant.person.personalAddress ?? null) as null | {
    street?: string;
    postalCode?: string;
    city?: string;
  };
  const orgAddress = (eiOrg.address ?? null) as null | {
    street?: string;
    postalCode?: string;
    city?: string;
  };
  if (!pointAccueil) {
    const cp = personalAddress?.postalCode ?? orgAddress?.postalCode ?? null;
    if (cp) {
      const dept = cp.startsWith('97') || cp.startsWith('98') ? cp.slice(0, 3) : cp.slice(0, 2);
      pointAccueil = await prisma.ageficePointAccueil.findFirst({
        where: { department: dept },
        orderBy: { city: 'asc' },
      });
      if (!pointAccueil) {
        warnings.push(`Aucun PA AGEFICE trouvé pour le département ${dept} dans le référentiel.`);
      }
    } else {
      warnings.push(
        "Aucun code postal sur le domicile ou l'entreprise — impossible de résoudre le PA AGEFICE.",
      );
    }
  }

  const session = participant.session;
  const product = session.product;
  const paFields = (agefice?.paFields ?? {}) as Record<string, any>;
  const of = getOfConfig();

  // ── Construit le payload ─────────────────────────────────────
  const totalHours = product.durationHours;
  const duree = splitDureeByModality(session.modality, totalHours);
  const formateur = session.trainers
    .map((t) => `${t.person.firstName} ${t.person.lastName}`)
    .join(', ');

  // Déroulement pédagogique : si le produit n'a pas de description en base, on
  // tire un template aléatoire en lien avec le thème ; on append toujours la
  // phrase générique (livret + Canva) si pas déjà présente.
  const deroulementPedago = buildDeroulementPedagogique({
    productMethods: product.pedagogicalMethods,
    productSupport: product.pedagogicalSupport,
    theme: product.theme,
    title: product.title,
  });
  const lieuAdresseComplete = session.location
    ? [
        (session.location.address as any)?.street,
        [(session.location.address as any)?.postalCode, (session.location.address as any)?.city]
          .filter(Boolean)
          .join(' '),
      ]
        .filter(Boolean)
        .join('\n')
    : of.addressFull;

  const data: AgeficeFormData = {
    pa: {
      // paName du dossier apprenant prioritaire (libellé court "AGEFICE 06")
      // si absent, fallback sur le nom officiel du référentiel
      name: agefice?.paName ?? pointAccueil?.name ?? '',
      number: pointAccueil?.numberPta ?? paFields['N° de PTA'] ?? null,
      contactName: pointAccueil?.contactName ?? agefice?.paContact ?? null,
      address: pointAccueil?.address1 ?? null,
      postalCode: pointAccueil?.postalCode ?? null,
      city: pointAccueil?.city ?? null,
      phone: pointAccueil?.phone ?? null,
      email: pointAccueil?.email ?? null,
    },
    entreprise: {
      raisonSociale: eiOrg.legalName,
      nomCommercial: eiOrg.network ?? null,
      naf: eiOrg.naf,
      siret: eiOrg.siret,
      activite: eiOrg.activityDescription,
      formeJuridique: eiOrg.legalForm,
      address: orgAddress?.street ?? null,
      postalCode: orgAddress?.postalCode ?? null,
      city: orgAddress?.city ?? null,
    },
    stagiaire: {
      civilite: inferCivilite(participant.person.civility),
      nom: participant.person.lastName,
      prenom: participant.person.firstName,
      nomNaissance: participant.person.birthName,
      dateNaissance: participant.person.birthDate,
      securiteSociale: participant.person.sensitiveData?.socialSecurityNb ?? null,
      phone: participant.person.phone,
      email: participant.person.email,
      diplome: participant.person.diplomas ?? participant.person.educationLevel,
      experience: inferExperience(participant.person.professionalExperience),
    },
    of,
    formationType: 'ACTION',
    obligatoire: false,
    reconversion: false,
    formation: {
      intitule: product.title,
      thematique: product.theme ?? 'immobilier',
      niveau: 'PERFECTIONNEMENT',
      certif: 'SANS_QUALIFICATION',
      dateDebut: session.startDate,
      dateFin: session.endDate,
      dureePresentielIndividuel: duree.presIndiv,
      dureePresentielCollectif: duree.presColl,
      dureeFoadSynchrone: duree.foadSync,
      dureeFoadAsynchrone: duree.foadAsync,
      formateur: formateur || 'À confirmer',
      lieuPostalCode:
        (session.location?.address as any)?.postalCode ?? of.addressCp,
      lieuVille: (session.location?.address as any)?.city ?? of.addressVille,
      lieuAdresseComplete,
      prixHT: Number(participant.priceHT) || Number(product.priceHT),
      enEntreprise: false,
      deroulementPedago,
    },
    evaluations: ['QUIZ', 'FEUILLES_PRESENCE'] satisfies EvaluationType[],
    evaluationAutreDetail: null,
    attestation: 'ATTESTATION_STAGE',
    mandat: true,
    signature: {
      lieu: of.addressVille || null,
      // Date du jour : on génère le PDF juste avant la signature, donc c'est la date réelle
      date: new Date(),
    },
  };

  // ── Génère le PDF ────────────────────────────────────────────
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await fillAgeficePdf(data);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF AGEFICE : ${e?.message ?? e}`, warnings };
  }

  // ── Upload + déduplication ───────────────────────────────────
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const slug = `${participant.person.lastName}-${participant.person.firstName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase();
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
