'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { mergeMlsDuplicate, MlsDuplicateError } from '@/lib/leads/mls-duplicates-service';
const schema = z.object({
  keepId: z.string().uuid(),
  removeId: z.string().uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
export async function confirmMlsMerge(input: unknown) {
  try {
    const actor = await requireRole(['ADMIN']);
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      return { ok: false as const, error: 'Confirmez les deux fiches de la prévisualisation.' };
    const result = await mergeMlsDuplicate({ actor, ...parsed.data });
    revalidatePath('/app/leads', 'layout');
    return { ok: true as const, ...result };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof MlsDuplicateError ||
        e instanceof UnauthorizedError ||
        e instanceof ForbiddenError
          ? e.message
          : 'Fusion interrompue. Rechargez la liste pour vérifier le résultat avant de reprendre.',
    };
  }
}
