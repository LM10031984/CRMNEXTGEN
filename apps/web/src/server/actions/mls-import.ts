'use server';
import { requireRole } from '@/lib/rbac';
import { importMls } from '@/lib/leads/mls-service';
import { revalidatePath } from 'next/cache';
export async function uploadMls(form: FormData) {
  try {
    const actor = await requireRole(['ADMIN']);
    const file = form.get('file');
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith('.xlsx') ||
      file.size > 5 * 1024 * 1024
    )
      return { ok: false as const, error: 'Choisissez un fichier XLSX de moins de 5 Mo.' };
    const digest = form.get('digest');
    const report = await importMls({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      actor,
      expectedDigest: typeof digest === 'string' && digest ? digest : undefined,
    });
    if (digest) {
      revalidatePath('/app/leads');
      revalidatePath('/app/organisations');
    }
    return { ok: true as const, report };
  } catch (e) {
    // Les erreurs Prisma peuvent contenir une requête / des coordonnées : pas de détail envoyé au navigateur.
    const message =
      e instanceof Error && !('code' in e)
        ? e.message
        : 'Import impossible. La transaction a été annulée. Relancez la prévisualisation.';
    return { ok: false as const, error: message };
  }
}
