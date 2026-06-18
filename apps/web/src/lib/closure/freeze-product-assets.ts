/**
 * Figeage des assets pédagogiques au niveau PRODUIT (quick 260618-rkj).
 *
 * Règle métier (Laurent) : une même formation = un même PROGRAMME et un même
 * CORPS de déroulé sur TOUTES ses sessions (conformité Qualiopi ind. 1/5) et
 * zéro re-coût LLM à chaque session.
 *
 *   - PROGRAMME : normalisé UNE fois par produit (LLM), persisté sur
 *     `TrainingProduct.programMd`. Réutilisé tel quel ensuite.
 *   - DÉROULÉ : le CORPS (jours[]) est généré UNE fois par produit (LLM) et
 *     persisté sur `TrainingProduct.derouleJson`. Le bilan/rapport formateur
 *     N'EST PAS figé ici — il reste généré PAR SESSION (cf. generate-deroule-session).
 *
 * Ce module est un module lib pur côté serveur : PAS `'use server'`, et il
 * N'IMPORTE JAMAIS `@/lib/auth` (transitivement) — sinon les scripts tsx
 * (worker, pipeline) cassent au boot (« react does not provide an export named
 * 'cache' »). Cf. mémoire feedback_worker_no_react_imports.
 */

import { prisma } from '@qualiof/db';
import { generateNormalizedProgramme, generateDerouleContent } from './ollama-generators';
import type { DerouleContent } from './deroule-template';

export interface FrozenProductAssets {
  /** Programme normalisé figé (markdown) — alimente Programme.pdf ET Convention.pdf. */
  programmeMd: string;
  /** Corps figé du déroulé (jours[] SANS rapportFormateur) — identique toutes sessions. */
  derouleBody: DerouleContent;
}

/**
 * Fige (1×/produit) le programme normalisé + le corps du déroulé, puis les
 * persiste sur `TrainingProduct` (programMd normalisé + derouleJson). Mémoïse
 * par `productId` via la `Map` fournie : un même run multi-sessions n'effectue
 * qu'UN SEUL figeage par produit. Si le produit est déjà figé (derouleJson
 * présent en base), réutilise le figé SANS re-LLM (zéro re-coût).
 */
export async function freezeProductAssets(
  tenantId: string,
  product: {
    id: string;
    programMd: string;
    objectives: unknown;
    durationHours: number;
    title: string;
    derouleJson: unknown;
  },
  memo: Map<string, FrozenProductAssets>,
): Promise<FrozenProductAssets> {
  const cached = memo.get(product.id);
  if (cached) return cached;

  const objectives = Array.isArray(product.objectives) ? (product.objectives as string[]) : [];

  // Marqueur « déjà figé » : si derouleJson est présent en base, le produit est
  // déjà passé par ce helper → programMd l'est aussi. On réutilise tel quel =
  // ZÉRO re-coût LLM (corrections_demandees §1 : détecter un déroulé produit
  // existant + ne pas re-normaliser).
  const alreadyFrozen = product.derouleJson != null;

  let programmeMd: string;
  let derouleBody: DerouleContent;

  if (alreadyFrozen) {
    programmeMd = product.programMd ?? '';
    derouleBody = stripRapport(product.derouleJson as DerouleContent);
  } else {
    // 1) PROGRAMME : normaliser UNE fois (fallback = programMd brut si LLM null).
    programmeMd =
      (await generateNormalizedProgramme(
        product.programMd ?? '',
        objectives,
        product.durationHours,
        product.title,
        tenantId,
      )) ?? (product.programMd ?? '');

    // 2) DÉROULÉ : générer le CORPS une fois, ancré sur le programme FIGÉ. On
    //    retire rapportFormateur du figé produit (le bilan est par session).
    const generated = await generateDerouleContent(
      { titre: product.title, programmeMd, nombreHeures: product.durationHours },
      'PedagogicalAsset',
      null,
      tenantId,
    );
    if (!generated) {
      throw new Error('Corps déroulé null (LLM) — figeage produit avorté');
    }
    derouleBody = stripRapport(generated);

    // Persiste le figé sur le produit (programMd normalisé + corps déroulé).
    await prisma.trainingProduct.update({
      where: { id: product.id },
      data: { programMd: programmeMd, derouleJson: derouleBody as object },
    });
  }

  const frozen: FrozenProductAssets = { programmeMd, derouleBody };
  memo.set(product.id, frozen);
  return frozen;
}

/** Retire rapportFormateur du corps (le bilan est par session, pas figé au produit). */
function stripRapport(c: DerouleContent): DerouleContent {
  return { jours: c.jours };
}
