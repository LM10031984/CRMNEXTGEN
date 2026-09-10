'use server';

import { validateRequest } from '@/lib/auth';
import { extractDocsFromBuffers, type DocFile, type ExtractedDocs } from '@/lib/preinscription-extractor';
import { downloadFile, DOCS_BUCKET } from '@/lib/storage';
import { filterOwnApprenantKeys } from '@/lib/storage-keys/apprenant-keys';
import { detectNameDivergences } from '@/lib/persons/name-divergence';

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
  /**
   * Divergences d'identité ENTRE les pièces (nom lu différemment sur la CNI et
   * sur l'attestation URSSAF). Canal distinct des `warnings` techniques : une
   * lettre de travers sur un nom se retrouve dans la convention, l'attestation
   * d'assiduité et la raison sociale de l'auto-entreprise — ça mérite mieux
   * qu'une ligne en 10 px. Cas déclencheur : EL GUERTIT lu EL GUERTIJ.
   */
  identityWarnings?: string[];
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

  return runExtraction(files);
}

/**
 * Même extraction, mais à partir des pièces DÉJÀ déposées dans le stockage
 * (quick 260908-lrj). C'est ce qui permet un dépôt unique : le fichier part
 * une fois du navigateur vers Supabase, et le serveur le relit ensuite pour
 * pré-remplir la fiche. Aucun octet ne repasse par Vercel, donc plus de
 * plafond 4,5 Mo sur une photo de pièce d'identité.
 *
 * Les clés viennent du navigateur : on ne lit QUE celles du tenant courant.
 */
export async function extractApprenantDocsFromKeys(
  keys: Partial<Record<'CNI' | 'RIB' | 'CFP', string>>,
): Promise<ExtractApprenantResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const { accepted, rejected } = filterOwnApprenantKeys(keys, user.tenantId);
  if (rejected.length > 0) {
    return { ok: false, error: `Pièce non reconnue (${rejected.join(', ')}) — recommence le dépôt.` };
  }

  const files: DocFile[] = [];
  for (const kind of ['CNI', 'RIB', 'CFP'] as const) {
    const key = accepted[kind];
    if (!key) continue;
    try {
      files.push({
        kind,
        buffer: await downloadFile(DOCS_BUCKET, key),
        contentType: guessFromName(key),
      });
    } catch (e: any) {
      return { ok: false, error: `Lecture de la pièce ${kind} impossible : ${e?.message ?? e}` };
    }
  }

  if (files.length === 0) {
    return { ok: false, error: 'Dépose au moins une pièce (CNI, RIB ou attestation CFP).' };
  }

  return runExtraction(files);
}

/** Pipeline commun aux deux entrées : OCR puis fusion des champs. */
async function runExtraction(files: DocFile[]): Promise<ExtractApprenantResult> {
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

  // Le nom figure sur la CNI ET sur l'attestation URSSAF. Jusqu'ici la CNI
  // gagnait et l'autre valeur était jetée sans rien dire — une lecture
  // douteuse passait donc inaperçue.
  const identityWarnings = detectNameDivergences(
    { label: "la carte d'identité", firstName: extracted.cni?.firstName, lastName: extracted.cni?.lastName },
    { label: "l'attestation URSSAF", firstName: extracted.cfp?.firstName, lastName: extracted.cfp?.lastName },
  ).map((d) => d.message);

  return {
    ok: true,
    data,
    warnings: extracted.warnings,
    identityWarnings,
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
