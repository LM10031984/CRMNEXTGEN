/**
 * Rattache les pièces déposées sur une demande d'inscription à la fiche de
 * l'apprenant créé.
 *
 * Pourquoi une copie et pas une simple recopie de clé : les pièces du
 * formulaire public vivent dans le bucket `preinscriptions`, alors que la fiche
 * apprenant lit dans `qualiof-docs` (route `/api/apprenants/[id]/docs/[kind]`).
 * Recopier la clé telle quelle produirait des documents introuvables — c'est
 * exactement le symptôme observé le 28/08/2026 : après validation, la fiche
 * apprenant n'affichait plus ni CNI, ni RIB, ni attestation CFP.
 *
 * Les trois destinations ne sont PAS au même endroit (héritage du modèle) :
 *   CNI → SensitiveData.idDocumentUrl
 *   RIB → Person.ribKey
 *   CFP → AgeficeProfile.cfpAttestationKey (donc il faut une organisation)
 *
 * Le verso de la pièce d'identité n'est pas transféré : la fiche apprenant n'a
 * pas de champ pour lui. Il reste consultable sur la demande d'origine.
 *
 * Tolérant aux pannes : l'échec d'une pièce n'empêche pas les autres ni
 * l'inscription — l'admin peut toujours redéposer le document à la main.
 */

import { randomUUID } from 'node:crypto';
import { downloadFile, uploadFile, DOCS_BUCKET, PREENROLLMENT_BUCKET } from '@/lib/storage';

export interface DocsSource {
  cniKey: string | null;
  ribKey: string | null;
  cfpKey: string | null;
}

export interface CopiedDocs {
  cniKey?: string;
  ribKey?: string;
  cfpKey?: string;
  warnings: string[];
}

function extension(key: string): string {
  const nom = key.split('/').pop() ?? '';
  const ext = nom.includes('.') ? nom.split('.').pop()! : 'pdf';
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
}

function contentType(ext: string): string {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

/**
 * Copie les pièces vers le bucket des documents apprenant et renvoie les
 * nouvelles clés, prêtes à être persistées par l'appelant.
 */
export async function copyEnrollmentDocs(
  source: DocsSource,
  tenantId: string,
  personId: string,
): Promise<CopiedDocs> {
  const out: CopiedDocs = { warnings: [] };

  const pieces = [
    ['cni', source.cniKey],
    ['rib', source.ribKey],
    ['cfp', source.cfpKey],
  ] as const;

  for (const [kind, key] of pieces) {
    if (!key) continue;
    try {
      const buffer = await downloadFile(PREENROLLMENT_BUCKET, key);
      const ext = extension(key);
      const destination = `apprenants/${tenantId}/${personId}/${kind}-${randomUUID()}.${ext}`;
      await uploadFile(DOCS_BUCKET, destination, buffer, contentType(ext));
      if (kind === 'cni') out.cniKey = destination;
      else if (kind === 'rib') out.ribKey = destination;
      else out.cfpKey = destination;
    } catch (e: any) {
      out.warnings.push(`${kind.toUpperCase()} non recopiée : ${e?.message ?? e}`);
    }
  }

  return out;
}
