/**
 * Le chargement de la bibliothèque de modules — **une seule définition**.
 *
 * Pourquoi ce fichier existe : le même mapping « ligne Prisma → `LibraryModule` »
 * vivait en QUATRE exemplaires (l'action de proposition, deux sondes, le
 * générateur de la liste de rattachement). Chaque fois qu'un champ entrait dans
 * `LibraryModule`, il fallait le recopier quatre fois — et le 11/09/2026 les
 * sondes ont silencieusement décroché sur `contentMd` et sur
 * `source.excludedFromClientOutputs`.
 *
 * Le silence est le vrai problème : `apps/web/scripts/**` n'est **pas** couvert
 * par `tsconfig.json` (`include` ne prend que `src/**`), donc `tsc` ne voyait
 * rien. Une sonde a donc rendu, sur un dossier réel, un parcours vide en
 * annonçant 9 demi-journées — sans qu'aucune barrière ne se lève.
 *
 * Ce fichier vit dans `server/` et non dans `lib/proposition/`, où les moteurs
 * sont **purs** (aucun import prisma/next, testables sans base). Charger est de
 * l'entrée-sortie : ça ne décide rien, et ça n'a rien à faire à côté des
 * fonctions qu'on veut pouvoir jouer en test sans docker.
 */
import { prisma } from '@qualiof/db';

import type { LibraryModule } from '@/lib/proposition/module-matcher';

/**
 * Tous les modules du tenant, vus par le moteur de recommandation.
 *
 * **On ne filtre RIEN ici**, et c'est délibéré : la pige, les rayons en doublon
 * (D-19 bis), les programmes non diffusables (D-19 ter) et les modules sans
 * déroulé (règle 4) sont tous écartés par `recommendModules`, qui le **dit** en
 * notice. Les retirer en silence à la lecture rendrait les règles invisibles au
 * commercial, qui ne saurait pas pourquoi un module attendu n'est pas là.
 */
export async function loadPropositionLibrary(tenantId: string): Promise<LibraryModule[]> {
  const products = await prisma.trainingProduct.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      title: true,
      theme: true,
      isActive: true,
      fundingType: true,
      supersededByProductId: true,
      excludedFromClientOutputs: true,
      modules: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          family: true,
          targetProfile: true,
          durationMin: true,
          diagnosticSignals: true,
          needIdentification: true,
          isFoundation: true,
          excludedFromClientOutputs: true,
          contentMd: true,
        },
      },
    },
  });

  const codeById = new Map(products.map((p) => [p.id, p.code]));

  return products.flatMap((p) =>
    p.modules.map(
      (m): LibraryModule => ({
        moduleId: m.id,
        title: m.title,
        family: m.family,
        targetProfile: m.targetProfile,
        signals: Array.isArray(m.diagnosticSignals)
          ? (m.diagnosticSignals as unknown[]).map(String)
          : [],
        needIdentification: m.needIdentification,
        isFoundation: m.isFoundation,
        durationMin: m.durationMin,
        excludedFromClientOutputs: m.excludedFromClientOutputs,
        contentMd: m.contentMd,
        source: {
          productId: p.id,
          code: p.code,
          title: p.title,
          theme: p.theme,
          fundingType: p.fundingType,
          isActive: p.isActive,
          excludedFromClientOutputs: p.excludedFromClientOutputs,
          supersededBy: p.supersededByProductId
            ? (codeById.get(p.supersededByProductId) ?? p.supersededByProductId)
            : null,
        },
      }),
    ),
  );
}
