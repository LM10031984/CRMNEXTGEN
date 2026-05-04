'use server';

import { validateRequest } from '@/lib/auth';
import { extractDocsFromBuffers, type DocFile, type ExtractedDocs } from '@/lib/preinscription-extractor';

/**
 * Pré-extrait les champs Person depuis les fichiers uploadés (CFP/CNI/RIB).
 *
 * Utilisé par le wizard de création apprenant manuel — pas de side-effect DB.
 * L'admin valide/édite ensuite les champs avant le submit qui crée la Person.
 */
export interface ExtractApprenantResult {
  ok: boolean;
  data?: {
    // Identité
    firstName: string | null;
    lastName: string | null;
    civility: string | null;
    birthName: string | null;
    birthDate: string | null;
    birthPlace: string | null;
    nationality: string | null;
    idDocumentNumber: string | null;
    idDocumentType: string | null;
    expiryDate: string | null;
    // Adresse
    addressStreet: string | null;
    addressPostalCode: string | null;
    addressCity: string | null;
    // Auto-entreprise (CFP)
    siret: string | null;
    activityCode: string | null;
    socialSecurityNb: string | null;
    numTi: string | null;
    contributionAmount: number | null;
    contributionYear: number | null;
    // Bancaire (RIB)
    iban: string | null;
    bic: string | null;
    bankName: string | null;
    accountHolder: string | null;
  };
  warnings?: string[];
  error?: string;
  durationMs?: number;
}

export async function extractApprenantDocs(formData: FormData): Promise<ExtractApprenantResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const files: DocFile[] = [];
  for (const kind of ['CNI', 'RIB', 'CFP'] as const) {
    const f = formData.get(kind);
    if (f instanceof File && f.size > 0) {
      const buffer = Buffer.from(await f.arrayBuffer());
      files.push({ kind, buffer, contentType: f.type || guessFromName(f.name) });
    }
  }

  if (files.length === 0) {
    return { ok: false, error: 'Aucun fichier fourni (attendu : CNI, RIB, CFP)' };
  }

  let extracted: ExtractedDocs;
  try {
    extracted = await extractDocsFromBuffers(files);
  } catch (e: any) {
    return { ok: false, error: `Extraction échouée : ${e?.message ?? e}` };
  }

  // Fusion CNI + CFP pour identité (CNI prioritaire), CFP pour adresse + auto-entreprise
  const data: NonNullable<ExtractApprenantResult['data']> = {
    firstName: extracted.cni?.firstName ?? extracted.cfp?.firstName ?? null,
    lastName: extracted.cni?.lastName ?? extracted.cfp?.lastName ?? null,
    civility: inferCivility(extracted.cni, extracted.cfp),
    birthName: extracted.cni?.birthName ?? null,
    birthDate: extracted.cni?.birthDate ?? null,
    birthPlace: extracted.cni?.birthPlace ?? null,
    nationality: extracted.cni?.nationality ?? null,
    idDocumentNumber: extracted.cni?.idDocumentNumber ?? null,
    idDocumentType: extracted.cni?.idDocumentType ?? null,
    expiryDate: extracted.cni?.expiryDate ?? null,
    addressStreet: extracted.cfp?.addressStreet ?? null,
    addressPostalCode: extracted.cfp?.addressPostalCode ?? null,
    addressCity: extracted.cfp?.addressCity ?? null,
    siret: extracted.cfp?.siret ?? null,
    activityCode: extracted.cfp?.activityCode ?? null,
    socialSecurityNb: extracted.cfp?.socialSecurityNb ?? null,
    numTi: extracted.cfp?.numTi ?? null,
    contributionAmount: extracted.cfp?.contributionAmount ?? null,
    contributionYear: extracted.cfp?.contributionYear ?? null,
    iban: extracted.rib?.iban ?? null,
    bic: extracted.rib?.bic ?? null,
    bankName: extracted.rib?.bankName ?? null,
    accountHolder: extracted.rib?.accountHolder ?? null,
  };

  return {
    ok: true,
    data,
    warnings: extracted.warnings,
    durationMs: extracted.durationMs,
  };
}

function guessFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

function inferCivility(
  cni: { firstName?: string | null } | null,
  _cfp: { firstName?: string | null } | null,
): string | null {
  // La CNI ne renseigne pas systématiquement la civilité dans le texte extrait.
  // Le CFP est plus fiable : "MR NOEL Steve" / "MME DUPONT Marie".
  // Heuristique : on relie côté UI manuel pour l'instant — l'admin choisit.
  return null;
}
