'use server';

import { randomUUID } from 'crypto';
import { validateRequest } from '@/lib/auth';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';

export type ApprenantDocKind = 'CNI' | 'RIB' | 'CFP';

export interface UploadApprenantDocsResult {
  ok: boolean;
  keys?: Partial<Record<ApprenantDocKind, string>>;
  error?: string;
}

const MAX_FILE_SIZE_MB = 10;

function safeExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'bin';
  return /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
}

function guessContentType(name: string, fallback?: string): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const ext = safeExt(name);
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

export async function uploadApprenantDocs(
  formData: FormData,
): Promise<UploadApprenantDocsResult> {
  const { user } = await validateRequest();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const keys: Partial<Record<ApprenantDocKind, string>> = {};
  const folder = randomUUID();

  for (const kind of ['CNI', 'RIB', 'CFP'] as const) {
    const f = formData.get(kind);
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return { ok: false, error: `${kind} dépasse ${MAX_FILE_SIZE_MB} Mo` };
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    const key = `apprenants/${user.tenantId}/${folder}/${kind.toLowerCase()}.${safeExt(f.name)}`;
    try {
      await uploadFile(DOCS_BUCKET, key, buffer, guessContentType(f.name, f.type));
      keys[kind] = key;
    } catch (e: any) {
      return { ok: false, error: `Upload ${kind} échoué : ${e?.message ?? e}` };
    }
  }

  return { ok: true, keys };
}
