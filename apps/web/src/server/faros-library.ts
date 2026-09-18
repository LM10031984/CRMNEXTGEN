import type { PrismaClient } from '@qualiof/db';
import {
  FAROS_WORKSHOPS,
  farosContent,
  type FarosWorkshop,
} from '../lib/proposition/faros-workshops';

import { FAROS_EXTENSION_WORKSHOPS } from '../lib/proposition/faros-extensions';

export const FAROS_COMPLEMENTS_REF = 'faros:complements-metier:v1';
export const FAROS_LIBRARY_REF = 'faros:ateliers-appliques:v1';
const CODE = 'BIB-FAROS-APPLIQUE-V1';

/** Import additionnel atomique et immuable : aucun ancien rayon n'est réécrit. */
async function installEdition(
  db: PrismaClient,
  tenantId: string,
  edition: { ref: string; code: string; title: string; workshops: readonly FarosWorkshop[] },
): Promise<'created' | 'unchanged'> {
  const { ref, code, title, workshops } = edition;
  return db.$transaction(
    async (tx) => {
      if (!(await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) {
        throw new Error('Organisme cible introuvable : aucun atelier importé.');
      }
      const existing = await tx.trainingProduct.findUnique({
        where: { tenantId_sourceRef: { tenantId, sourceRef: ref } },
        include: { modules: true },
      });
      if (existing) {
        // Ne jamais écraser une relecture ou un retrait décidé dans le catalogue.
        if (
          existing.modules.length !== workshops.length ||
          workshops.some((w) => {
            const matches = existing.modules.filter((m) => m.sourceRef === w.sourceRef);
            const m = matches[0];
            return (
              matches.length !== 1 ||
              !m ||
              m.contentMd !== farosContent(w) ||
              m.durationMin !== w.durationMin ||
              m.title !== w.title
            );
          })
        )
          throw new Error(
            'L’édition Faros a été modifiée : import arrêté sans écraser le catalogue. Créer une nouvelle édition après relecture.',
          );
        return 'unchanged';
      }
      const foreign = await tx.trainingModule.count({
        where: { product: { tenantId }, sourceRef: { in: workshops.map((w) => w.sourceRef) } },
      });
      if (foreign > 0)
        throw new Error(
          'Des références Faros existent dans un autre rayon : vérifier les doublons avant import.',
        );
      const product = await tx.trainingProduct.create({
        data: {
          tenantId,
          sourceRef: ref,
          code,
          title,
          durationHours: workshops.reduce((n, w) => n + w.durationMin, 0) / 60,
          modality: 'PRESENTIEL',
          isActive: false,
          excludedFromClientOutputs: false,
          fundingType: 'COEUR_METIER',
          theme: 'IA appliquée aux pratiques immobilières',
          prerequisites: workshops[0]!.prerequisites,
          targetAudience:
            'Conseillers immobiliers et responsables d’agence, selon les besoins relevés au diagnostic.',
          objectives: workshops.map((w) => w.outcome),
          programMd: workshops.map(farosContent).join('\n\n'),
          pedagogicalMethods:
            'Démonstrations guidées, exercices sur dossiers anonymisés, mises en situation et correction individuelle des livrables.',
          evaluationMethods:
            'Positionnement à partir du diagnostic, observation de la pratique, contrôle du livrable avec une grille de critères et plan d’action.',
          modules: {
            create: workshops.map((w, i) => ({
              order: i + 1,
              sourceRef: w.sourceRef,
              title: w.title,
              contentMd: farosContent(w),
              durationMin: w.durationMin,
              family: 'Métier immobilier avec IA',
              targetProfile: 'conseiller',
              diagnosticSignals: w.ruleIds,
              isFoundation: w.ruleIds.includes('ia-parametree'),
            })),
          },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          entity: 'TrainingProduct',
          entityId: product.id,
          action: 'catalogue.faros-applique.installed',
          diff: {
            before: null,
            after: {
              sourceRef: ref,
              moduleCount: workshops.length,
              sources: workshops.map((w) => ({ ref: w.sourceRef, capsules: w.sourceCapsules })),
            },
          },
        },
      });
      return 'created';
    },
    { timeout: 30_000 },
  );
}

export async function installFarosLibrary(
  db: PrismaClient,
  tenantId: string,
): Promise<'created' | 'unchanged'> {
  return installEdition(db, tenantId, {
    ref: FAROS_LIBRARY_REF,
    code: CODE,
    title: 'Ateliers Faros — IA appliquée à l’immobilier',
    workshops: FAROS_WORKSHOPS,
  });
}

export async function installFarosComplements(
  db: PrismaClient,
  tenantId: string,
): Promise<'created' | 'unchanged'> {
  return installEdition(db, tenantId, {
    ref: FAROS_COMPLEMENTS_REF,
    code: 'BIB-FAROS-COMPLEMENTS-V1',
    title: 'Faros — développements métier avec IA',
    workshops: FAROS_EXTENSION_WORKSHOPS,
  });
}
