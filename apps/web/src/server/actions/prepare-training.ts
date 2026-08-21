'use server';

import { revalidatePath } from 'next/cache';
import { prisma, type ClosureDocKind, type DocType } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { generateProgrammeForProduct } from './programme-generator';
import { generateConventionForParticipant } from './convention-generator';
// Cœur SANS auth : `prepareSession` tourne parfois en fire-and-forget, sans
// contexte d'auth. Ne JAMAIS appeler ici le wrapper `generateConventionEntreprise`,
// qui fait `requireRole`.
import { generateConventionEntrepriseCore } from '@/lib/closure/convention-core';
import {
  GROUP_CONVENTION_ENTITY_TYPES,
  expandGroupConventions,
  isGroupConventionDoc,
} from '@/lib/docs/convention-coverage';
import { partitionByPayerRule } from '@/lib/sessions/payer-rule';
import { generateChecklistForSession } from './generate-checklist-formation';
import { generateDerouleForProduct } from './deroule-product-generator';
import { generateConvocationForParticipant } from './convocation-generator';
import { generateAgeficeForParticipant } from './agefice-generator';
import { enqueueClosureJob } from '@/lib/closure/queue-postgres';
import { countAgeficeReady } from '@/lib/sessions/count-agefice-ready';

/**
 * Inscrit tel que les deux orchestrateurs le chargent — le commanditaire et sa
 * forme juridique sont nécessaires pour appliquer la règle payeur AVANT toute
 * génération.
 */
interface PrepareParticipant {
  id: string;
  sponsorOrgId: string;
  sponsorOrg: { id: string; legalName: string; legalForm: string } | null;
  person: { firstName: string; lastName: string };
}

/** `select` partagé — une seule définition, pour que les deux chemins voient la même chose. */
const PREPARE_PARTICIPANT_SELECT = {
  id: true,
  sponsorOrgId: true,
  sponsorOrg: { select: { id: true, legalName: true, legalForm: true } },
  person: { select: { firstName: true, lastName: true } },
} as const;

interface ConventionRouting {
  /** Inscrits COUVERTS par une convention (groupe ou individuelle). */
  covered: number;
  groupsCount: number;
  individuelsCount: number;
  errors: { participantName: string; message: string }[];
}

/**
 * Applique la règle payeur du 12/08 aux conventions d'une session.
 *
 * Payeur personne morale ⇒ UNE convention de groupe par commanditaire ;
 * auto-payeur ⇒ chemin individuel inchangé. Jamais les deux pour un même
 * inscrit — la session porterait deux conventions contradictoires, ce qui se
 * voit en audit (constat du 21/08 sur SES-0107 / SES-0108).
 *
 * Helper PARTAGÉ par `prepareTrainingForSession` et `prepareSession` : ils sont
 * appelés depuis des chemins différents (bouton « Préparer » vs création de
 * session en fire-and-forget), et corriger un seul laisserait l'autre produire
 * le mauvais document.
 *
 * Les groupes sont traités EN SÉRIE : `generateConventionEntrepriseCore`
 * supprime puis recrée des Documents de la même session, deux appels
 * concurrents se marcheraient dessus.
 */
async function routeConventionsByPayerRule(
  tenantId: string,
  sessionId: string,
  participants: ReadonlyArray<PrepareParticipant>,
): Promise<ConventionRouting> {
  const { groups, individuels } = partitionByPayerRule(
    participants.map((p) => ({
      id: p.id,
      sponsorOrgId: p.sponsorOrgId,
      sponsorLegalForm: p.sponsorOrg?.legalForm,
      sponsorName: p.sponsorOrg?.legalName,
    })),
  );

  const errors: ConventionRouting['errors'] = [];
  // Compte les inscrits COUVERTS, pas le nombre d'appels : sinon la fiche
  // session afficherait « 1 convention / 8 inscrits » sur ASSALIT et
  // déclencherait à tort l'action de masse qui régénère des individuelles.
  let covered = 0;

  for (const g of groups) {
    const r = await generateConventionEntrepriseCore(tenantId, sessionId, g.sponsorOrgId).catch(
      (e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    if (r.ok) covered += g.participantIds.length;
    else
      errors.push({
        participantName: g.sponsorName ?? '(entreprise)',
        message: r.error ?? 'Erreur inconnue',
      });
  }

  const byId = new Map(participants.map((p) => [p.id, p]));
  await Promise.all(
    individuels.map(async (participantId) => {
      const p = byId.get(participantId);
      const name = p ? `${p.person.firstName} ${p.person.lastName}` : participantId;
      const r = await generateConventionForParticipant(participantId).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }));
      if (r.ok) covered += 1;
      else errors.push({ participantName: name, message: r.error ?? 'Erreur inconnue' });
    }),
  );

  return { covered, groupsCount: groups.length, individuelsCount: individuels.length, errors };
}

export interface PrepareTrainingResult {
  ok: boolean;
  total: number;
  programmesGenerated: number;
  conventionsGenerated: number;
  convocationsGenerated: number;
  derouleGenerated: boolean;
  errors: { participantName: string; doc: 'PROGRAMME' | 'CONVENTION' | 'DEROULE' | 'CONVOCATION'; message: string }[];
  error?: string;
}

/**
 * "Préparer la formation" : génère les docs PRÉ-formation pour la session.
 *
 * Selon process Qualiopi Start Academy (cf process_startacademy.docx) :
 *  - Programme de formation (indic 1 + 6 — produit-level, idempotent)
 *  - Convention de formation (indic 6, 8 — par participant, idempotent)
 *  - Déroulé pédagogique (indic 10 — produit-level, IA Ollama, idempotent
 *    via hash sha256)
 *  - Check-list formation (indic 17 — session-level, fire & forget)
 *
 * Manquent encore (backlog) :
 *  - Convocation stagiaire (indic 9 — par participant)
 *  - CGV (statique tenant)
 *  - Règlement intérieur (statique tenant, indic 9)
 *
 * Parallélise par participant pour limiter la latence.
 */
export async function prepareTrainingForSession(
  sessionId: string,
): Promise<PrepareTrainingResult> {
  const { user } = await validateRequest();
  if (!user) {
    return {
      ok: false,
      total: 0,
      programmesGenerated: 0,
      conventionsGenerated: 0,
      convocationsGenerated: 0,
      derouleGenerated: false,
      errors: [],
      error: 'Non authentifié',
    };
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: {
      id: true,
      productId: true,
      pricePerLearner: true,
      product: { select: { id: true, title: true, priceHT: true } },
      participants: { select: PREPARE_PARTICIPANT_SELECT },
    },
  });
  if (!session) {
    return {
      ok: false,
      total: 0,
      programmesGenerated: 0,
      conventionsGenerated: 0,
      convocationsGenerated: 0,
      derouleGenerated: false,
      errors: [],
      error: 'Session introuvable',
    };
  }

  // Garde-fou conformité Qualiopi : tarif obligatoire (jamais 0€ dans un
  // programme/convention sinon NON CONFORME audit). Cf feedback Laurent
  // 2026-05-25 — "ça ne doit jamais arriver".
  const productPriceHT = Number(session.product?.priceHT ?? 0);
  const sessionPrice = Number(session.pricePerLearner ?? 0);
  if (productPriceHT === 0 && sessionPrice === 0) {
    return {
      ok: false,
      total: 0,
      programmesGenerated: 0,
      conventionsGenerated: 0,
      convocationsGenerated: 0,
      derouleGenerated: false,
      errors: [],
      error: `Tarif manquant. Le produit "${session.product?.title ?? '(sans titre)'}" a un prix HT à 0 €. Renseigne-le sur /app/produits/${session.productId} avant de préparer la formation. Un programme Qualiopi avec tarif 0 € est non conforme.`,
    };
  }
  // Cas import SmartOF : tarif côté session uniquement, produit resté à 0.
  // On propage session.pricePerLearner → product.priceHT pour que le générateur
  // de programme l'utilise (le programme lit product.priceHT). Évite à Laurent
  // d'avoir à resaisir sur la fiche produit.
  if (productPriceHT === 0 && sessionPrice > 0) {
    await prisma.trainingProduct.update({
      where: { id: session.productId },
      data: { priceHT: sessionPrice },
    });
    console.info(
      `[prepare-training] product ${session.productId} priceHT 0 → ${sessionPrice} (propagé depuis session ${sessionId})`,
    );
    // Supprime aussi le doc Programme obsolète (forcé à 0€) pour forcer regen
    // avec le bon prix. Document est polymorphique : entityType + entityId.
    await prisma.document.deleteMany({
      where: {
        tenantId: user.tenantId,
        entityType: 'TrainingProduct',
        entityId: session.productId,
        type: 'PROGRAMME',
      },
    });
  }

  const errors: PrepareTrainingResult['errors'] = [];
  let programmesGenerated = 0;
  let conventionsGenerated = 0;
  let convocationsGenerated = 0;
  let derouleGenerated = false;

  // Programme = asset PRODUIT (1 seul appel pour toute la session,
  // find-or-create idempotent — réutilisé à chaque clic).
  const prog = await generateProgrammeForProduct(session.productId);
  if (prog.ok) programmesGenerated = 1;
  else errors.push({ participantName: '(produit)', doc: 'PROGRAMME', message: prog.error ?? 'Erreur inconnue' });

  // Déroulé pédagogique = asset PRODUIT (1 seul appel, IA Ollama, idempotent
  // via hash sha256). BUG-6 — couvre indic 10 Qualiopi (preuve adaptation).
  const der = await generateDerouleForProduct(session.productId);
  if (der.ok) derouleGenerated = true;
  else errors.push({ participantName: '(produit)', doc: 'DEROULE', message: der.error ?? 'Erreur inconnue' });

  // Check-list formation (C4.i17) = 1 par session, fire & forget si déjà existe.
  generateChecklistForSession(sessionId).catch((e) => {
    console.warn('[prepare-training] check-list non générée :', e?.message ?? e);
  });
  // NB : Grille d'observation formateur (C3.i11) = doc POST-formation, généré
  // uniquement par closure-pack quand les participants sont CONFIRMED/ATTENDED.

  // Convention : règle payeur (groupe pour les personnes morales, individuelle
  // pour les auto-payeurs). Convocation : NOMINATIVE dans tous les cas — c'est
  // un document personnel, chaque salarié est convoqué.
  const [routing] = await Promise.all([
    routeConventionsByPayerRule(user.tenantId, sessionId, session.participants),
    Promise.all(
      session.participants.map(async (p) => {
        const name = `${p.person.firstName} ${p.person.lastName}`;
        const convoc = await generateConvocationForParticipant(p.id);
        if (convoc.ok) convocationsGenerated++;
        else errors.push({ participantName: name, doc: 'CONVOCATION', message: convoc.error ?? 'Erreur inconnue' });
      }),
    ),
  ]);
  conventionsGenerated = routing.covered;
  for (const e of routing.errors) {
    errors.push({ participantName: e.participantName, doc: 'CONVENTION', message: e.message });
  }

  revalidatePath(`/app/sessions/${sessionId}`);

  return {
    ok: true,
    total: session.participants.length,
    programmesGenerated,
    conventionsGenerated,
    convocationsGenerated,
    derouleGenerated,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Quick task 260525-kl5 — auto-trigger préparation pédagogique complète
// ─────────────────────────────────────────────────────────────────────────

export interface PrepareSessionResult {
  ok: boolean;
  total: number;
  programmesGenerated: number;
  derouleGenerated: boolean;
  checklistGenerated: boolean;
  conventionsGenerated: number;
  convocationsGenerated: number;
  analyseBesoinEnqueued: number;
  analyseBesoinSkipped: number;
  // Demande de prise en charge AGEFICE — TNS uniquement (sponsorOrg AGEFICE
  // ou EI_SELF/AGENT_COMMERCIAL avec AgeficeProfile). Salariés OPCO ignorés.
  ageficeGenerated: number;
  ageficeEligible: number;
  batchId?: string;
  errors: { participantName: string; doc: string; message: string }[];
  error?: string;
}

export interface SessionPreparationStatus {
  ok: boolean;
  programme: boolean;
  deroule: boolean;
  checklist: boolean;
  conventionsCount: number;
  convocationsCount: number;
  analyseBesoinDone: number;
  analyseBesoinInProgress: number;
  analyseBesoinPending: number;
  // Demande AGEFICE — affichée uniquement si ageficeEligibleCount > 0.
  ageficeCount: number;
  ageficeEligibleCount: number;
  participantsCount: number;
  batchId?: string;
  error?: string;
}

/**
 * Préparation pédagogique idempotente d'une session — 6 catégories de docs
 * pré-formation orchestrées en parallèle :
 *  - Programme + Déroulé (produit-level, find-or-create)
 *  - Checklist (session-level, find-or-create)
 *  - Convention + Convocation par participant (find-or-create sha256)
 *  - Analyse besoin par participant via batch BullMQ (kind=ANALYSE_BESOIN)
 *
 * Appelée en fire-and-forget depuis createSessionFull (post-transaction)
 * OU à la demande depuis le bloc UI "Compléter (X manquants)".
 *
 * Pas de `requireRole` ici : le contexte d'auth peut être perdu en
 * fire-and-forget post-transaction. Bail out silencieux si pas d'user. Côté
 * UI, `canWrite` filtre déjà l'accès au bouton.
 */
export async function prepareSession(sessionId: string): Promise<PrepareSessionResult> {
  const empty: PrepareSessionResult = {
    ok: false,
    total: 0,
    programmesGenerated: 0,
    derouleGenerated: false,
    checklistGenerated: false,
    conventionsGenerated: 0,
    convocationsGenerated: 0,
    analyseBesoinEnqueued: 0,
    analyseBesoinSkipped: 0,
    ageficeGenerated: 0,
    ageficeEligible: 0,
    errors: [],
  };

  const { user } = await validateRequest();
  if (!user) {
    return { ...empty, error: 'Non authentifié' };
  }

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: {
      id: true,
      productId: true,
      pricePerLearner: true,
      product: { select: { id: true, title: true, priceHT: true } },
      participants: { select: PREPARE_PARTICIPANT_SELECT },
    },
  });
  if (!session) {
    return { ...empty, error: 'Session introuvable' };
  }

  // Garde-fou tarif (conformité Qualiopi) — identique à prepareTrainingForSession.
  const productPriceHT = Number(session.product?.priceHT ?? 0);
  const sessionPrice = Number(session.pricePerLearner ?? 0);
  if (productPriceHT === 0 && sessionPrice === 0) {
    return {
      ...empty,
      error: `Tarif manquant. Le produit "${session.product?.title ?? '(sans titre)'}" a un prix HT à 0 €. Renseigne-le sur /app/produits/${session.productId} avant de préparer la formation.`,
    };
  }
  // Propage tarif session → produit (cas import SmartOF).
  if (productPriceHT === 0 && sessionPrice > 0) {
    await prisma.trainingProduct.update({
      where: { id: session.productId },
      data: { priceHT: sessionPrice },
    });
    await prisma.document.deleteMany({
      where: {
        tenantId: user.tenantId,
        entityType: 'product',
        entityId: session.productId,
        type: 'PROGRAMME',
      },
    });
  }

  const errors: PrepareSessionResult['errors'] = [];
  const participantIds = session.participants.map((p) => p.id);

  // 1. Produit-level + session-level (Promise.allSettled — chacun reste idempotent
  //    en interne via find-or-create / hash sha256).
  const [progRes, derRes, checklistRes] = await Promise.allSettled([
    generateProgrammeForProduct(session.productId),
    generateDerouleForProduct(session.productId),
    generateChecklistForSession(sessionId),
  ]);

  let programmesGenerated = 0;
  let derouleGenerated = false;
  let checklistGenerated = false;

  if (progRes.status === 'fulfilled' && progRes.value.ok) programmesGenerated = 1;
  else
    errors.push({
      participantName: '(produit)',
      doc: 'PROGRAMME',
      message:
        progRes.status === 'fulfilled'
          ? (progRes.value.error ?? 'Erreur inconnue')
          : (progRes.reason?.message ?? String(progRes.reason)),
    });

  if (derRes.status === 'fulfilled' && derRes.value.ok) derouleGenerated = true;
  else
    errors.push({
      participantName: '(produit)',
      doc: 'DEROULE',
      message:
        derRes.status === 'fulfilled'
          ? (derRes.value.error ?? 'Erreur inconnue')
          : (derRes.reason?.message ?? String(derRes.reason)),
    });

  if (checklistRes.status === 'fulfilled' && checklistRes.value.ok) checklistGenerated = true;
  else
    errors.push({
      participantName: '(session)',
      doc: 'CHECKLIST',
      message:
        checklistRes.status === 'fulfilled'
          ? (checklistRes.value.error ?? 'Erreur inconnue')
          : (checklistRes.reason?.message ?? String(checklistRes.reason)),
    });

  // 2. Convention : règle payeur (groupe vs individuelle) — cf
  //    routeConventionsByPayerRule. Convocation : NOMINATIVE dans tous les cas.
  let convocationsGenerated = 0;
  const [routing] = await Promise.all([
    routeConventionsByPayerRule(user.tenantId, sessionId, session.participants),
    Promise.all(
      session.participants.map(async (p) => {
        const name = `${p.person.firstName} ${p.person.lastName}`;
        const convoc = await Promise.resolve(generateConvocationForParticipant(p.id)).catch(
          (e: unknown) => ({
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
        if (convoc.ok) convocationsGenerated++;
        else
          errors.push({
            participantName: name,
            doc: 'CONVOCATION',
            message: convoc.error ?? 'Erreur inconnue',
          });
      }),
    ),
  ]);
  const conventionsGenerated = routing.covered;
  for (const e of routing.errors) {
    errors.push({ participantName: e.participantName, doc: 'CONVENTION', message: e.message });
  }

  // 2bis. Demande de prise en charge AGEFICE — TNS uniquement.
  //       Règle métier : auto-entrepreneur cotise à l'AGEFICE (CFP), salarié
  //       cotise à un OPCO d'entreprise (pas AGEFICE). Donc on filtre sur :
  //         - sponsorOrg.opcoCode = 'AGEFICE' (cas typique)
  //         - OU legalLink EI_SELF/AGENT_COMMERCIAL avec AgeficeProfile
  let ageficeGenerated = 0;
  let ageficeEligible = 0;
  const ageficeEligibleParticipants =
    participantIds.length > 0
      ? await prisma.sessionParticipant.findMany({
          where: {
            sessionId,
            OR: [
              { sponsorOrg: { opcoCode: 'AGEFICE' } },
              {
                person: {
                  legalLinks: {
                    some: {
                      role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] },
                      organization: { ageficeProfile: { isNot: null } },
                    },
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            person: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
  ageficeEligible = ageficeEligibleParticipants.length;
  await Promise.all(
    ageficeEligibleParticipants.map(async (p) => {
      const name = `${p.person.firstName} ${p.person.lastName}`;
      const r = await generateAgeficeForParticipant(p.id).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }));
      if (r.ok) ageficeGenerated++;
      else
        errors.push({
          participantName: name,
          doc: 'AGEFICE',
          message: r.error ?? 'Erreur inconnue',
        });
    }),
  );

  // 3. Analyse besoin (IA Ollama) — batch BullMQ.
  //    Skip les participants qui ont déjà un PedagogicalAsset.ANALYSE_BESOIN
  //    rendu (pdfUrl != null) → idempotent.
  let analyseBesoinEnqueued = 0;
  let analyseBesoinSkipped = 0;
  let batchId: string | undefined;

  if (participantIds.length > 0) {
    const existingAB = await prisma.pedagogicalAsset.findMany({
      where: {
        tenantId: user.tenantId,
        sessionId,
        kind: 'ANALYSE_BESOIN',
        participantId: { in: participantIds },
        pdfUrl: { not: null },
      },
      select: { participantId: true },
    });
    const doneIds = new Set(existingAB.map((a) => a.participantId).filter((id): id is string => !!id));
    const toEnqueue = session.participants.filter((p) => !doneIds.has(p.id));
    analyseBesoinSkipped = participantIds.length - toEnqueue.length;

    if (toEnqueue.length > 0) {
      const batch = await prisma.closureBatch.create({
        data: {
          tenantId: user.tenantId,
          sessionId,
          status: 'PENDING',
          totalDocs: toEnqueue.length,
          createdByUserId: user.id,
          jobs: {
            create: toEnqueue.map((p) => ({
              participantId: p.id,
              kind: 'ANALYSE_BESOIN' as ClosureDocKind,
              status: 'QUEUED' as const,
            })),
          },
        },
        include: { jobs: { select: { id: true, participantId: true, kind: true } } },
      });
      batchId = batch.id;
      analyseBesoinEnqueued = batch.jobs.length;
      await Promise.all(
        batch.jobs.map((job) =>
          enqueueClosureJob({
            jobId: job.id,
            batchId: batch.id,
            tenantId: user.tenantId,
            sessionId,
            participantId: job.participantId,
            kind: job.kind,
          }),
        ),
      );
    }
  }

  // 4. AuditLog (skip si pas d'user — déjà bail out plus haut, mais ceinture
  //    et bretelles si on étend l'usage en dehors d'un contexte requireRole).
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'TrainingSession',
        entityId: sessionId,
        action: 'session.prepare',
        diff: {
          programmesGenerated,
          derouleGenerated,
          checklistGenerated,
          conventionsGenerated,
          // Traçabilité de la règle payeur (quick 260821-md8) : combien de
          // conventions d'entreprise, combien de nominatives.
          conventionsGroupe: routing.groupsCount,
          conventionsIndividuelles: routing.individuelsCount,
          convocationsGenerated,
          analyseBesoinEnqueued,
          analyseBesoinSkipped,
          ageficeGenerated,
          ageficeEligible,
          errors: errors.length,
        },
      },
    });
  } catch (e) {
    console.warn('[prepareSession] auditLog skipped:', (e as Error)?.message ?? e);
  }

  revalidatePath(`/app/sessions/${sessionId}`);

  return {
    ok: true,
    total: session.participants.length,
    programmesGenerated,
    derouleGenerated,
    checklistGenerated,
    conventionsGenerated,
    convocationsGenerated,
    analyseBesoinEnqueued,
    analyseBesoinSkipped,
    ageficeGenerated,
    ageficeEligible,
    batchId,
    errors,
  };
}

/**
 * Lit l'état agrégé des 6 docs de préparation pédagogique pour piloter
 * l'UI (bloc PreparationPedagogiqueBlock).
 *
 * Tenant-scopée via validateRequest. Bulk-query : 3 requêtes Postgres au
 * total (Document, PedagogicalAsset, ClosureJob).
 */
export async function getSessionPreparationStatus(
  sessionId: string,
): Promise<SessionPreparationStatus> {
  const empty: SessionPreparationStatus = {
    ok: false,
    programme: false,
    deroule: false,
    checklist: false,
    conventionsCount: 0,
    convocationsCount: 0,
    analyseBesoinDone: 0,
    analyseBesoinInProgress: 0,
    analyseBesoinPending: 0,
    ageficeCount: 0,
    ageficeEligibleCount: 0,
    participantsCount: 0,
  };

  const { user } = await validateRequest();
  if (!user) return { ...empty, error: 'Non authentifié' };

  const session = await prisma.trainingSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    select: {
      id: true,
      productId: true,
      // sponsorOrgId requis pour rattacher les conventions GROUPE aux salariés
      // qu'elles couvrent (revue Codex PR #13).
      participants: { select: { id: true, sponsorOrgId: true } },
    },
  });
  if (!session) return { ...empty, error: 'Session introuvable' };

  const participantIds = session.participants.map((p) => p.id);
  const docTypes: DocType[] = [
    'PROGRAMME',
    'DEROULE_PEDAGOGIQUE',
    'CHECKLIST_FORMATION',
    'CONVENTION',
    'CONVOCATION',
    'AGEFICE',
  ];

  const [docs, abAssets, latestBatch, ageficeEligibleParticipants] = await Promise.all([
    prisma.document.findMany({
      where: {
        tenantId: user.tenantId,
        type: { in: docTypes },
        OR: [
          { entityType: 'product', entityId: session.productId, type: { in: ['PROGRAMME', 'DEROULE_PEDAGOGIQUE'] } },
          { entityType: 'session', entityId: session.id, type: 'CHECKLIST_FORMATION' },
          ...(participantIds.length > 0
            ? [
                { entityType: 'participant', entityId: { in: participantIds }, type: { in: ['CONVENTION', 'CONVOCATION'] as DocType[] } },
                // Convention GROUPE : un seul document pour tous les salariés
                // d'un commanditaire, donc pas de participantId. Sans cette
                // branche, le statut annonçait les conventions manquantes et
                // proposait l'action de masse qui régénère des individuelles
                // (revue Codex PR #13).
                // Les DEUX formes de stockage sont interrogées (quick
                // 260821-md8) : `organization` (appli) et `session` (scripts
                // `_gen-*`, présente en prod sur SES-0107 / SES-0108).
                {
                  entityType: { in: [...GROUP_CONVENTION_ENTITY_TYPES] },
                  sessionId: session.id,
                  type: 'CONVENTION' as DocType,
                },
                // Demande AGEFICE — stockée avec participantId (cf agefice-generator).
                { participantId: { in: participantIds }, type: 'AGEFICE' as DocType },
              ]
            : []),
        ],
      },
      select: { type: true, entityId: true, participantId: true, entityType: true },
    }),
    participantIds.length > 0
      ? prisma.pedagogicalAsset.findMany({
          where: {
            tenantId: user.tenantId,
            sessionId: session.id,
            kind: 'ANALYSE_BESOIN',
            participantId: { in: participantIds },
            pdfUrl: { not: null },
          },
          select: { participantId: true },
        })
      : Promise.resolve([] as Array<{ participantId: string | null }>),
    // Dernier batch contenant des jobs ANALYSE_BESOIN pour cette session,
    // pour exposer le batchId (utile pour cross-link batch progress UI).
    prisma.closureBatch.findFirst({
      where: {
        tenantId: user.tenantId,
        sessionId: session.id,
        jobs: { some: { kind: 'ANALYSE_BESOIN' } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        jobs: {
          where: { kind: 'ANALYSE_BESOIN' },
          select: { status: true },
        },
      },
    }),
    // IDs des participants éligibles AGEFICE (TNS) — pilote l'affichage
    // conditionnel de la ligne "Demande AGEFICE" ET sert de set d'intersection
    // pour borner le numérateur (HOTFIX 2 : un dossier généré pour un
    // participant non-éligible ne doit plus gonfler le compteur → plus de 2/1).
    participantIds.length > 0
      ? prisma.sessionParticipant.findMany({
          where: {
            sessionId: session.id,
            OR: [
              { sponsorOrg: { opcoCode: 'AGEFICE' } },
              {
                person: {
                  legalLinks: {
                    some: {
                      role: { in: ['EI_SELF', 'AGENT_COMMERCIAL'] },
                      organization: { ageficeProfile: { isNot: null } },
                    },
                  },
                },
              },
            ],
          },
          select: { id: true },
        })
      : Promise.resolve([] as Array<{ id: string }>),
  ]);

  const eligibleAgeficeIds = ageficeEligibleParticipants.map((p) => p.id);
  const ageficeEligibleCount = eligibleAgeficeIds.length;

  const programme = docs.some((d) => d.type === 'PROGRAMME');
  const deroule = docs.some((d) => d.type === 'DEROULE_PEDAGOGIQUE');
  const checklist = docs.some((d) => d.type === 'CHECKLIST_FORMATION');
  // Conventions individuelles : entityId = participantId. Le test négatif passe
  // par `isGroupConventionDoc` — écrit à la main, il laisserait entrer la forme
  // `session`, dont l'entityId est un sessionId : on compterait alors un
  // identifiant de session comme s'il s'agissait d'un inscrit.
  const conventionsSet = new Set(
    docs
      .filter((d) => d.type === 'CONVENTION')
      .filter(
        (d) => !isGroupConventionDoc({ id: d.entityId, type: d.type, entityType: d.entityType, entityId: d.entityId }),
      )
      .map((d) => d.entityId),
  );
  // Conventions groupe : entityId = sponsorOrgId → on ajoute chaque salarié
  // couvert, sinon il ressort « convention manquante » à tort.
  for (const participantId of expandGroupConventions(
    docs.map((d) => ({ id: d.entityId, type: d.type, entityType: d.entityType, entityId: d.entityId })),
    session.participants.map((p) => ({ id: p.id, sponsorOrgId: p.sponsorOrgId })),
  ).keys()) {
    conventionsSet.add(participantId);
  }
  const convocationsSet = new Set(
    docs.filter((d) => d.type === 'CONVOCATION').map((d) => d.entityId),
  );
  // Demande AGEFICE indexée par participantId (et non entityId — cf
  // agefice-generator où Document.participantId est l'identifiant métier).
  // HOTFIX 2 : on n'expose que les dossiers des participants ÉLIGIBLES via
  // countAgeficeReady (intersection), sinon un dossier orphelin → 2/1.
  const ageficeDocParticipantIds = docs
    .filter((d) => d.type === 'AGEFICE' && d.participantId != null)
    .map((d) => d.participantId as string);
  const ageficeReady = countAgeficeReady(ageficeDocParticipantIds, eligibleAgeficeIds);

  const analyseBesoinDone = abAssets.length;
  let analyseBesoinInProgress = 0;
  let analyseBesoinPending = 0;
  if (latestBatch) {
    for (const job of latestBatch.jobs) {
      if (job.status === 'PROCESSING') analyseBesoinInProgress++;
      else if (job.status === 'QUEUED') analyseBesoinPending++;
    }
  }

  return {
    ok: true,
    programme,
    deroule,
    checklist,
    conventionsCount: conventionsSet.size,
    convocationsCount: convocationsSet.size,
    analyseBesoinDone,
    analyseBesoinInProgress,
    analyseBesoinPending,
    ageficeCount: ageficeReady,
    ageficeEligibleCount,
    participantsCount: participantIds.length,
    batchId: latestBatch?.id,
  };
}
