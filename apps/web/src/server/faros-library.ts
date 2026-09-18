import type { PrismaClient } from '@qualiof/db';
import { FAROS_WORKSHOPS, farosContent } from '../lib/proposition/faros-workshops';

export const FAROS_LIBRARY_REF = 'faros:ateliers-appliques:v1';
const CODE = 'BIB-FAROS-APPLIQUE-V1';

/** Import additionnel atomique et immuable : aucun ancien rayon n'est réécrit. */
export async function installFarosLibrary(db: PrismaClient, tenantId: string): Promise<'created' | 'unchanged'> {
  return db.$transaction(async (tx) => {
    if (!await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })) {
      throw new Error('Organisme cible introuvable : aucun atelier importé.');
    }
    const existing = await tx.trainingProduct.findUnique({
      where: { tenantId_sourceRef: { tenantId, sourceRef: FAROS_LIBRARY_REF } }, include: { modules: true },
    });
    if (existing) {
      // Ne jamais écraser une relecture ou un retrait décidé dans le catalogue.
      if (existing.modules.length !== FAROS_WORKSHOPS.length || FAROS_WORKSHOPS.some((w) => {
        const matches = existing.modules.filter((m) => m.sourceRef === w.sourceRef);
        const m = matches[0];
        return matches.length !== 1 || !m || m.contentMd !== farosContent(w) || m.durationMin !== w.durationMin || m.title !== w.title;
      })) throw new Error('L’édition Faros v1 a été modifiée : import arrêté sans écraser le catalogue. Créer une nouvelle édition après relecture.');
      return 'unchanged';
    }
    const foreign = await tx.trainingModule.count({ where: { product: { tenantId }, sourceRef: { in: FAROS_WORKSHOPS.map((w) => w.sourceRef) } } });
    if (foreign > 0) throw new Error('Des références Faros existent dans un autre rayon : vérifier les doublons avant import.');
    const product = await tx.trainingProduct.create({ data: {
      tenantId, sourceRef: FAROS_LIBRARY_REF, code: CODE,
      title: 'Ateliers Faros — IA appliquée à l’immobilier',
      durationHours: FAROS_WORKSHOPS.reduce((n, w) => n + w.durationMin, 0) / 60,
      modality: 'PRESENTIEL', isActive: false, excludedFromClientOutputs: false,
      fundingType: 'COEUR_METIER', theme: 'IA appliquée aux pratiques immobilières',
      prerequisites: FAROS_WORKSHOPS[0]!.prerequisites,
      targetAudience: 'Conseillers immobiliers et responsables d’agence, selon les besoins relevés au diagnostic.',
      objectives: FAROS_WORKSHOPS.map((w) => w.outcome),
      programMd: FAROS_WORKSHOPS.map(farosContent).join('\n\n'),
      pedagogicalMethods: 'Démonstrations guidées, exercices sur dossiers anonymisés, mises en situation et correction individuelle des livrables.',
      evaluationMethods: 'Positionnement à partir du diagnostic, observation de la pratique, contrôle du livrable avec une grille de critères et plan d’action.',
      modules: { create: FAROS_WORKSHOPS.map((w, i) => ({
        order: i + 1, sourceRef: w.sourceRef, title: w.title, contentMd: farosContent(w),
        durationMin: w.durationMin, family: 'Métier immobilier avec IA', targetProfile: 'conseiller',
        diagnosticSignals: w.ruleIds, isFoundation: w.ruleIds.includes('ia-parametree'),
      })) },
    }, select: { id: true } });
    await tx.auditLog.create({ data: {
      tenantId, entity: 'TrainingProduct', entityId: product.id, action: 'catalogue.faros-applique.installed',
      diff: { before: null, after: { sourceRef: FAROS_LIBRARY_REF, moduleCount: FAROS_WORKSHOPS.length,
        sources: FAROS_WORKSHOPS.map((w) => ({ ref: w.sourceRef, capsules: w.sourceCapsules })) } },
    } });
    return 'created';
  }, { timeout: 30_000 });
}
