'use server';

/**
 * Server actions Paramètres OF — Assets (Phase 7 Plan 07-03 Task 2).
 *
 * 4 actions :
 *  - `uploadTenantLogo(formData)` : upload PNG/JPG/SVG ≤ 5 Mo dans
 *    `public/of-assets/{tenantId}/logo.{ext}`, update Tenant.logoPath,
 *    AuditLog 'parameters.upload.logo', invalidateAssetCache.
 *  - `uploadTenantSignature(role, formData)` : upload PNG/JPG ≤ 2 Mo dans
 *    `public/of-assets/{tenantId}/signature-{pedago|dirigeant}.png`, update
 *    Tenant.{signaturePedagoPath|signatureDirigeantPath}, AuditLog
 *    'parameters.upload.signature.{role}', invalidateAssetCache.
 *  - `resetTenantLogo()` : supprime le fichier disque + reset Tenant.logoPath
 *    à null, AuditLog 'parameters.reset.logo', invalidateAssetCache.
 *  - `resetTenantSignature(role)` : supprime le fichier disque + reset
 *    Tenant.{signaturePedagoPath|signatureDirigeantPath} à null, AuditLog
 *    'parameters.reset.signature.{role}', invalidateAssetCache.
 *
 * Sécurité multi-tenant : `validateRequest()` → user.tenantId, écriture
 * uniquement dans le dossier du tenant courant. Pas d'override possible.
 *
 * Cascade impact (Plan 07-03 Task 1) :
 *  - `shared-template.ts loadLogoColorDataUrl(tenantId)` lit en cascade
 *    public/of-assets/{tenantId}/logo.{png,jpg,svg} → fallback bundled
 *  - `loadSignatureDataUrl(tenantId, role)` idem pour signatures
 *  - `programme-template.ts` + `convention-template.ts` consomment ces helpers
 *    centraux (le logoCache local a été supprimé) → l'upload UI affecte tous
 *    les PDF générés (closure + programme + convention) sans redémarrage.
 *
 * Convention AuditLog (D-09 / Plan 07-02) :
 *  - entity = 'Tenant', entityId = user.tenantId
 *  - action :
 *      'parameters.upload.logo'
 *      'parameters.upload.signature.pedago'
 *      'parameters.upload.signature.dirigeant'
 *      'parameters.reset.logo'
 *      'parameters.reset.signature.pedago'
 *      'parameters.reset.signature.dirigeant'
 *  - diff : { logoPath|signaturePedagoPath|signatureDirigeantPath: { before, after } }
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { invalidateAssetCache } from '@/lib/closure/shared-template';
import { logTenantSettingsChange } from '@/lib/audit-log';

// ─── Constantes ─────────────────────────────────────────────────────────
const MAX_LOGO_MB = 5;
const MAX_SIGNATURE_MB = 2;
const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
const ALLOWED_SIGNATURE_MIME = new Set(['image/png', 'image/jpeg']);

// ─── Types résultat (discriminated unions) ──────────────────────────────
export type AssetResult = { ok: true; path: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

// ─── Helpers internes ───────────────────────────────────────────────────
function extFromMime(mime: string): string {
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/jpeg') return 'jpg';
  return 'png';
}

function tenantAssetDir(tenantId: string): string {
  return path.join(process.cwd(), 'public', 'of-assets', tenantId);
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    /* OK si fichier absent — idempotent */
  }
}

// ─── LOGO ───────────────────────────────────────────────────────────────

/**
 * Upload le logo OF de l'utilisateur courant.
 *
 * FormData : champ `file` (File PNG/JPG/SVG ≤ 5 Mo).
 *
 * Effets :
 *  1. Supprime les variantes d'extension précédentes (logo.png, logo.jpg, logo.svg)
 *     pour éviter qu'un ancien logo.png masque le nouveau logo.svg fraîchement uploadé.
 *  2. Écrit le nouveau fichier `logo.{ext}` dans public/of-assets/{tenantId}/.
 *  3. Update Tenant.logoPath = `/of-assets/{tenantId}/logo.{ext}` (URL publique).
 *  4. invalidateAssetCache(tenantId) → prochain rendu PDF lira le nouveau fichier.
 *  5. AuditLog 'parameters.upload.logo' avec diff before/after.
 *  6. revalidatePath('/app/parametres') pour rafraîchir l'aperçu UI.
 */
export async function uploadTenantLogo(formData: FormData): Promise<AssetResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const f = formData.get('file');
  if (!(f instanceof File) || f.size === 0) {
    return { ok: false, error: 'Aucun fichier' };
  }
  if (f.size > MAX_LOGO_MB * 1024 * 1024) {
    return { ok: false, error: `Logo > ${MAX_LOGO_MB} Mo` };
  }
  if (!ALLOWED_LOGO_MIME.has(f.type)) {
    return { ok: false, error: 'Format autorisé : PNG, JPG, SVG' };
  }

  const ext = extFromMime(f.type);
  const dir = tenantAssetDir(user.tenantId);
  await fs.mkdir(dir, { recursive: true });

  // Supprime les variantes d'extension précédentes (logo.png, logo.jpg, logo.svg)
  // — sinon `loadLogoColorDataUrl` qui essaie .png → .jpg → .svg pourrait
  // continuer de servir l'ancien fichier d'une autre extension.
  await Promise.all(
    ['png', 'jpg', 'svg'].map((e) => unlinkIfExists(path.join(dir, `logo.${e}`))),
  );

  const filename = `logo.${ext}`;
  const buffer = Buffer.from(await f.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  const publicPath = `/of-assets/${user.tenantId}/${filename}`;
  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { logoPath: true },
  });
  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { logoPath: publicPath },
  });

  invalidateAssetCache(user.tenantId);
  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'parameters.upload.logo',
    diff: { logoPath: { before: before?.logoPath ?? null, after: publicPath } },
  });
  revalidatePath('/app/parametres');
  return { ok: true, path: publicPath };
}

/**
 * Reset le logo OF de l'utilisateur courant.
 *
 * Effets :
 *  1. Supprime toutes les variantes d'extension (logo.png/jpg/svg) du disque.
 *  2. Set Tenant.logoPath = null (templates retombent sur bundled).
 *  3. invalidateAssetCache → prochain rendu utilise le fallback bundled.
 *  4. AuditLog 'parameters.reset.logo'.
 *
 * Idempotent : si déjà reset, retourne { ok: true } sans toucher AuditLog.
 */
export async function resetTenantLogo(): Promise<SimpleResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { logoPath: true },
  });
  if (!before?.logoPath) {
    // Déjà reset — no-op (pas d'AuditLog superflu)
    return { ok: true };
  }

  const dir = tenantAssetDir(user.tenantId);
  await Promise.all(
    ['png', 'jpg', 'svg'].map((e) => unlinkIfExists(path.join(dir, `logo.${e}`))),
  );

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { logoPath: null },
  });

  invalidateAssetCache(user.tenantId);
  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'parameters.reset.logo',
    diff: { logoPath: { before: before.logoPath, after: null } },
  });
  revalidatePath('/app/parametres');
  return { ok: true };
}

// ─── SIGNATURES ─────────────────────────────────────────────────────────

/**
 * Upload une signature OF (pédago ou dirigeant) pour l'utilisateur courant.
 *
 * FormData : champ `file` (File PNG/JPG ≤ 2 Mo — SVG non autorisé pour signature).
 *
 * Le filename sur disque est fixe (pas dépendant de l'extension uploadée) :
 *  - role='pedago'    → signature-pedago.png
 *  - role='dirigeant' → signature-dirigeant.png
 *
 * Note : si l'upload est un JPG, on l'écrit quand même sous `.png` car le
 * loader cherche cette extension fixe. Le mime-type est conservé dans la
 * data-URL via le sniffing extension `path.extname()` → reste 'png' même si
 * le contenu est JPG (limitation acceptée — les loaders signature ne servent
 * que ce filename fixe). Pour homogénéité, on impose en interne png pour
 * les signatures uploadées.
 */
export async function uploadTenantSignature(
  role: 'pedago' | 'dirigeant',
  formData: FormData,
): Promise<AssetResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const f = formData.get('file');
  if (!(f instanceof File) || f.size === 0) {
    return { ok: false, error: 'Aucun fichier' };
  }
  if (f.size > MAX_SIGNATURE_MB * 1024 * 1024) {
    return { ok: false, error: `Signature > ${MAX_SIGNATURE_MB} Mo` };
  }
  if (!ALLOWED_SIGNATURE_MIME.has(f.type)) {
    return { ok: false, error: 'Format autorisé : PNG, JPG' };
  }

  const filename = role === 'pedago' ? 'signature-pedago.png' : 'signature-dirigeant.png';
  const dir = tenantAssetDir(user.tenantId);
  await fs.mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await f.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  const publicPath = `/of-assets/${user.tenantId}/${filename}`;
  const fieldName = role === 'pedago' ? 'signaturePedagoPath' : 'signatureDirigeantPath';
  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { signaturePedagoPath: true, signatureDirigeantPath: true },
  });
  const beforeVal = role === 'pedago' ? before?.signaturePedagoPath : before?.signatureDirigeantPath;

  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { [fieldName]: publicPath },
  });

  invalidateAssetCache(user.tenantId);
  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: `parameters.upload.signature.${role}`,
    diff: { [fieldName]: { before: beforeVal ?? null, after: publicPath } },
  });
  revalidatePath('/app/parametres');
  return { ok: true, path: publicPath };
}

/**
 * Reset une signature OF (pédago ou dirigeant).
 *
 * Effets :
 *  1. Supprime le fichier signature-{role}.png du disque.
 *  2. Set Tenant.signaturePedagoPath|signatureDirigeantPath = null.
 *  3. invalidateAssetCache → fallback bundled.
 *  4. AuditLog 'parameters.reset.signature.{role}'.
 *
 * Idempotent : si déjà reset, retourne { ok: true } sans toucher AuditLog.
 */
export async function resetTenantSignature(role: 'pedago' | 'dirigeant'): Promise<SimpleResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const fieldName = role === 'pedago' ? 'signaturePedagoPath' : 'signatureDirigeantPath';
  const filename = role === 'pedago' ? 'signature-pedago.png' : 'signature-dirigeant.png';

  const before = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { signaturePedagoPath: true, signatureDirigeantPath: true },
  });
  const beforeVal = role === 'pedago' ? before?.signaturePedagoPath : before?.signatureDirigeantPath;
  if (!beforeVal) {
    // Déjà reset — no-op
    return { ok: true };
  }

  await unlinkIfExists(path.join(tenantAssetDir(user.tenantId), filename));
  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: { [fieldName]: null },
  });

  invalidateAssetCache(user.tenantId);
  await logTenantSettingsChange({
    tenantId: user.tenantId,
    userId: user.id,
    action: `parameters.reset.signature.${role}`,
    diff: { [fieldName]: { before: beforeVal, after: null } },
  });
  revalidatePath('/app/parametres');
  return { ok: true };
}
