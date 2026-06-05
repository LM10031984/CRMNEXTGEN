'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { loadOfConfig } from '@/lib/of-config';
import { buildDeroulementPedagogique } from '@/lib/pedagogy-templates';
import {
  fillAgeficePdf,
  type AgeficeFormData,
  type ExperienceTranche,
  type EvaluationType,
  type FormationType,
  type FormationNiveau,
  type FormationCertif,
  type AttestationType,
} from '@/lib/agefice-form-fill';
import { isCanonicalExperience } from '@/lib/agefice-options';

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
  if (isCanonicalExperience(raw)) return raw as ExperienceTranche;
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
  options?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; error?: string; warnings?: string[] }> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  // Force regen : delete les Document AGEFICE existants pour ce participant
  // AVANT de générer, sinon le hash SHA256 idempotent renvoie l'ancien doc
  // (avec adresse buggée ou prix faux). Laurent 2026-06-04 : "je ne peux pas
  // régénérer un doc".
  if (options?.force) {
    await prisma.document.deleteMany({
      where: {
        tenantId: user.tenantId,
        type: 'AGEFICE',
        participantId,
      },
    });
  }

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

  const participantPrice = Number(participant.priceHT);
  const productPrice = Number(product.priceHT);
  const effectivePrice = participantPrice > 0 ? participantPrice : productPrice;
  if (effectivePrice <= 0) {
    return {
      ok: false,
      error:
        "Prix HT non défini : ni sur l'inscription (fiche session, bouton Éditer) ni sur le produit (/app/produits). Renseignez l'un des deux avant de générer le formulaire AGEFICE.",
      warnings,
    };
  }

  const paFields = (agefice?.paFields ?? {}) as Record<string, any>;
  const of = await loadOfConfig(user.tenantId);

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
  // Format "Raison sociale — Nom du lieu\nadresse\nCP Ville" (cf demande Laurent
  // 2026-06-03 : Cerfa AGEFICE exige SARL X — Agence Y + adresse).
  const lieuAdresseComplete = session.location
    ? [
        [
          (session.location as { legalName?: string | null }).legalName,
          session.location.name,
        ]
          .filter(Boolean)
          .join(' — '),
        (session.location.address as any)?.street,
        [(session.location.address as any)?.postalCode, (session.location.address as any)?.city]
          .filter(Boolean)
          .join(' '),
      ]
        .filter(Boolean)
        .join('\n')
    : of.addressFull;

  // ── Conformité Cerfa (Section C/D) ───────────────────────────
  // Lit les valeurs depuis TrainingProduct si renseignées, sinon fallback
  // sur les défauts V1 (= comportement historique avant la Section C).
  const pAny = product as Record<string, unknown>;
  const ageficeFormationType =
    ((pAny.ageficeFormationType as FormationType | null | undefined) ?? 'ACTION') as FormationType;
  const ageficeNiveau =
    ((pAny.ageficeNiveau as FormationNiveau | null | undefined) ?? 'PERFECTIONNEMENT') as FormationNiveau;
  const ageficeCertif =
    ((pAny.ageficeCertif as FormationCertif | null | undefined) ?? 'SANS_QUALIFICATION') as FormationCertif;
  const ageficeAttestation =
    ((pAny.ageficeAttestation as AttestationType | null | undefined) ?? 'ATTESTATION_STAGE') as AttestationType;
  const productEvals = pAny.ageficeEvaluations as string[] | null | undefined;
  const ageficeEvaluations: EvaluationType[] =
    productEvals && productEvals.length > 0
      ? (productEvals as EvaluationType[])
      : (['QUIZ', 'FEUILLES_PRESENCE'] satisfies EvaluationType[]);
  const ageficeObligatoire = (pAny.ageficeObligatoire as boolean | null | undefined) ?? false;
  const ageficeReconversion = (pAny.ageficeReconversion as boolean | null | undefined) ?? false;
  const ageficeEnEntreprise = (pAny.ageficeEnEntreprise as boolean | null | undefined) ?? false;
  const ageficeMandat = (pAny.ageficeMandat as boolean | null | undefined) ?? true;

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
      // AGEFICE refuse les dossiers si la raison sociale n'apparaît pas dans
      // le champ "Adresse Entreprise" du Cerfa. Laurent 2026-06-04 (retour
      // terrain). On force le format "Raison Sociale — Rue".
      address: [eiOrg.legalName, orgAddress?.street].filter(Boolean).join(' — ') || null,
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
    formationType: ageficeFormationType,
    obligatoire: ageficeObligatoire,
    reconversion: ageficeReconversion,
    formation: {
      intitule: product.title,
      thematique: product.theme ?? 'immobilier',
      niveau: ageficeNiveau,
      certif: ageficeCertif,
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
      prixHT: effectivePrice,
      enEntreprise: ageficeEnEntreprise,
      deroulementPedago,
    },
    evaluations: ageficeEvaluations,
    evaluationAutreDetail: null,
    attestation: ageficeAttestation,
    mandat: ageficeMandat,
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
