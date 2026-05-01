/**
 * Pipeline d'extraction des pièces de pré-inscription.
 *
 * Pour chaque pré-inscription SUBMITTED :
 *   1. Charge les fichiers depuis MinIO
 *   2. Extrait le texte (pdf-parse pour PDFs natifs)
 *   3. Appelle Ollama qwen3 avec un prompt par type de doc
 *   4. Stocke les données structurées dans PreEnrollment.extractedData
 *   5. Met à jour le statut → EXTRACTED ou EXTRACTING en cas d'échec
 *
 * Architecture : appelé en fire-and-forget depuis submitPreEnrollmentForm.
 * Pas de blocage côté user : il reçoit son écran de confirmation tout de suite.
 */

import { prisma } from '@qualiof/db';
import { downloadFile, PREENROLLMENT_BUCKET } from '@/lib/storage';
import { extractTextFromFile } from '@/lib/pdf-extract';
import { callOllama } from '@/lib/ai-ollama';

const PROMPT_VERSION = 'v1-2026-04';

const SYSTEM_PROMPT = `Tu es un assistant expert dans l'extraction de données structurées à partir de documents administratifs français (CNI, RIB, Attestation de Contribution à la Formation Professionnelle - CFP).

Règles ABSOLUES :
- Réponds UNIQUEMENT en JSON valide, sans texte avant ou après
- Si un champ n'est pas trouvé : valeur null (jamais d'invention)
- Pour les SIRET / N° Sécurité sociale : EXTRAIS LES TELS QUELS sans modification
- Dates au format ISO (YYYY-MM-DD)
- Conserve les majuscules pour les noms`;

interface CniExtraction {
  firstName: string | null;
  lastName: string | null;
  birthName: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  idDocumentNumber: string | null;
  idDocumentType: string | null; // "CNI", "Passeport", "Titre de séjour"
  expiryDate: string | null;
  nationality: string | null;
}

interface RibExtraction {
  iban: string | null;
  bic: string | null;
  bankName: string | null;
  accountHolder: string | null;
  rawAddress: string | null;
}

interface CfpExtraction {
  // Identité (cross-check avec saisie apprenant)
  firstName: string | null;
  lastName: string | null;
  // Adresse stagiaire (utile pour résoudre le PA AGEFICE par dépt)
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  // Données légales (à pousser dans Person.SensitiveData et Org.AgeficeProfile)
  socialSecurityNb: string | null;     // 13 chiffres + clé 2 chiffres
  siret: string | null;                // 14 chiffres SIRET de l'auto-entreprise
  numTi: string | null;                // Numéro Travailleur Indépendant URSSAF
  affiliationUrssaf: string | null;    // si présent
  activityCode: string | null;         // code APE/NAF "6831Z" pour immobilier
  // Cotisation
  contributionAmount: number | null;
  contributionYear: number | null;
  attestationDate: string | null;      // date de l'attestation (ISO)
}

const PROMPTS = {
  CNI: `Voici le texte extrait d'une pièce d'identité française.
Extrais ces champs au format JSON strict :
{
  "firstName": "Prénom (chaîne)",
  "lastName": "Nom (chaîne MAJUSCULES)",
  "birthName": "Nom de naissance si différent (chaîne ou null)",
  "birthDate": "Date de naissance au format ISO YYYY-MM-DD (string ou null)",
  "birthPlace": "Lieu de naissance (chaîne ou null)",
  "idDocumentNumber": "N° de la pièce d'identité (chaîne ou null)",
  "idDocumentType": "Type : CNI, Passeport, Titre de séjour (chaîne ou null)",
  "expiryDate": "Date d'expiration ISO YYYY-MM-DD (string ou null)",
  "nationality": "Nationalité (chaîne ou null)"
}

Document :
=====
{TEXT}
=====`,

  RIB: `Voici le texte extrait d'un RIB (Relevé d'Identité Bancaire).
Extrais ces champs au format JSON strict :
{
  "iban": "IBAN sans espaces (chaîne ou null)",
  "bic": "Code BIC/SWIFT (chaîne ou null)",
  "bankName": "Nom de la banque (chaîne ou null)",
  "accountHolder": "Titulaire du compte (chaîne ou null)",
  "rawAddress": "Adresse du titulaire si présente (chaîne ou null)"
}

Document :
=====
{TEXT}
=====`,

  CFP: `Voici le texte extrait d'une Attestation de Contribution à la Formation Professionnelle (CFP) émise par l'URSSAF pour les micro-entrepreneurs / auto-entrepreneurs cotisant à l'AGEFICE.

Format type : "MR/MME [NOM] [Prénom]" / "[Adresse]" / "[CP] [Ville]" / "N° Sécurité Sociale [13 chiffres]" / "N° SIRET [14 chiffres]" / "N° TI [chiffres]" / "CODE NAF [4 chiffres + lettre]" / "Vous avez acquitté un versement de [montant] euros, relatif à la contribution due au titre de l'exercice [année]." / "A [Ville], le [Date]"

Extrais ces champs au format JSON strict :
{
  "firstName": "Prénom (chaîne ou null) — STEVE pour 'MR NOEL STEVE'",
  "lastName": "Nom (chaîne MAJUSCULES ou null) — NOEL pour 'MR NOEL STEVE'",
  "addressStreet": "Rue + bâtiment du stagiaire (chaîne ou null)",
  "addressPostalCode": "Code postal du stagiaire à 5 chiffres (chaîne ou null)",
  "addressCity": "Ville du stagiaire (chaîne ou null)",
  "socialSecurityNb": "N° Sécurité sociale à 13 chiffres (chaîne ou null) — sans la clé",
  "siret": "N° SIRET à 14 chiffres (chaîne ou null)",
  "numTi": "N° TI (Numéro Travailleur Indépendant) (chaîne ou null)",
  "affiliationUrssaf": "Autre n° URSSAF si présent (chaîne ou null)",
  "activityCode": "Code NAF/APE au format 0000A (chaîne ou null) — ex 6831Z",
  "contributionAmount": "Montant en euros de la contribution versée (nombre ou null)",
  "contributionYear": "Année (4 chiffres) de l'exercice cotisé (entier ou null)",
  "attestationDate": "Date d'émission de l'attestation au format ISO YYYY-MM-DD (chaîne ou null)"
}

Document :
=====
{TEXT}
=====`,
} as const;

interface ExtractionResult {
  cni: CniExtraction | null;
  rib: RibExtraction | null;
  cfp: CfpExtraction | null;
  warnings: string[];
  durationMs: number;
}

async function extractOne<T>(text: string, kind: keyof typeof PROMPTS): Promise<T | null> {
  if (text.trim().length < 20) return null;
  const prompt = PROMPTS[kind].replace('{TEXT}', text.slice(0, 6000));
  // mistral-small:24b est ~3-5x plus rapide que qwen3:30b-a3b sur extraction
  // structurée et tout aussi fiable sur les docs URSSAF/RIB courts. On le
  // garde par défaut, override possible via OLLAMA_MODEL_FAST.
  const r = await callOllama({
    model: process.env.OLLAMA_MODEL_FAST,
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    jsonOutput: true,
    temperature: 0,
  });
  return (r.parsedJson as T) ?? null;
}

export async function extractPreEnrollmentDocuments(preEnrollmentId: string): Promise<void> {
  const start = Date.now();
  const pe = await prisma.preEnrollment.findUnique({ where: { id: preEnrollmentId } });
  if (!pe) return;

  // Marquer en EXTRACTING dès le démarrage
  await prisma.preEnrollment.update({
    where: { id: preEnrollmentId },
    data: { status: 'EXTRACTING', aiPromptVersion: PROMPT_VERSION },
  });

  const result: ExtractionResult = { cni: null, rib: null, cfp: null, warnings: [], durationMs: 0 };

  try {
    // CNI
    if (pe.cniKey) {
      try {
        const buf = await downloadFile(PREENROLLMENT_BUCKET, pe.cniKey);
        const ext = await extractTextFromFile(buf, guessContentType(pe.cniKey));
        result.warnings.push(...ext.warnings.map((w) => `[CNI] ${w}`));
        if (ext.text) {
          result.cni = await extractOne<CniExtraction>(ext.text, 'CNI');
        }
      } catch (e: any) {
        result.warnings.push(`[CNI] ${e?.message ?? e}`);
      }
    }

    // RIB
    if (pe.ribKey) {
      try {
        const buf = await downloadFile(PREENROLLMENT_BUCKET, pe.ribKey);
        const ext = await extractTextFromFile(buf, guessContentType(pe.ribKey));
        result.warnings.push(...ext.warnings.map((w) => `[RIB] ${w}`));
        if (ext.text) {
          result.rib = await extractOne<RibExtraction>(ext.text, 'RIB');
        }
      } catch (e: any) {
        result.warnings.push(`[RIB] ${e?.message ?? e}`);
      }
    }

    // CFP
    if (pe.cfpKey) {
      try {
        const buf = await downloadFile(PREENROLLMENT_BUCKET, pe.cfpKey);
        const ext = await extractTextFromFile(buf, guessContentType(pe.cfpKey));
        result.warnings.push(...ext.warnings.map((w) => `[CFP] ${w}`));
        if (ext.text) {
          result.cfp = await extractOne<CfpExtraction>(ext.text, 'CFP');
        }
      } catch (e: any) {
        result.warnings.push(`[CFP] ${e?.message ?? e}`);
      }
    }

    result.durationMs = Date.now() - start;

    await prisma.preEnrollment.update({
      where: { id: preEnrollmentId },
      data: {
        status: 'EXTRACTED',
        extractedData: result as any,
        aiExtractedAt: new Date(),
        aiModel: 'qwen3:30b-a3b',
      },
    });
  } catch (e: any) {
    await prisma.preEnrollment.update({
      where: { id: preEnrollmentId },
      data: {
        status: 'SUBMITTED',
        aiErrorMsg: e?.message ?? String(e),
      },
    });
  }
}

function guessContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}
