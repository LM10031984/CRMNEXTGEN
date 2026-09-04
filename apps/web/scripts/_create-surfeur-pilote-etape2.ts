/**
 * _create-surfeur-pilote-etape2.ts — Création idempotente du produit
 * « Du surfeur au pilote — Étape 2 » (11h, présentiel) + de la session
 * des 28 et 29 septembre 2026 animée par Sébastien Tedesco.
 *
 * Conventions reprises du repo :
 *   - createProduct (server/actions/crud-edits.ts) : code PROD-NNNN séquentiel.
 *   - createSessionFull (server/actions/sessions-create.ts) : code SES-NNNN,
 *     name = "{titre} - {date fr}", SessionTrainer LEAD + isPrimary.
 *   - proposeSchedule (lib/schedule/propose-business-dates.ts) : SessionSlot
 *     avec startTime/endTime au format "9h00" (PAS "09:00" — cf. dette SES-0110).
 *   - programMd structuré "Jour N :" + "HHhMM – HHhMM : Titre" pour que
 *     parseProgrammeToDeroule reconstitue le déroulé SANS appel IA.
 *
 * ⚠ La base visée est le CLOUD (Supabase) et sa colonne TrainingProduct.
 *   `fundingType` n'existe pas encore (migration 20260902170000 non déployée) :
 *   tous les select sont donc EXPLICITES pour ne pas la demander en RETURNING.
 *
 * ⚠ NE génère AUCUN document / pack / convocation / email. Création BDD pure.
 *   Le pack se déclenche depuis la fiche session (« Préparer la formation »).
 *
 * Run :
 *   cd apps/web && node --import tsx --env-file=../../.env scripts/_create-surfeur-pilote-etape2.ts
 */
import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@qualiof/db';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const DRY = process.env.WRITE !== '1';

const TITLE =
  "Du surfeur au pilote — Étape 2 : consolider le pilotage, maîtriser la route de l'exclusivité";

const OBJECTIVES = [
  "Évaluer la mise en œuvre de son plan de pilotage (GPS : objectifs, priorités, stratégies) et l'ajuster au vu de ses résultats.",
  "Structurer son organisation hebdomadaire et prioriser ses actions à partir de ses propres indicateurs d'activité.",
  "Préparer un rendez-vous d'estimation : découverte du vendeur et de son projet, constitution de l'avis de valeur.",
  "Conduire le rendez-vous d'estimation en posture de conseil et annoncer un prix argumenté.",
  "Présenter et défendre le mandat exclusif et ses honoraires, et traiter les objections courantes.",
  "Mettre en œuvre un suivi structuré après le rendez-vous jusqu'à la signature, et formaliser son plan d'action à 30 jours.",
];

const PROGRAMME_MD = `Formation en présentiel de 11 heures réparties sur 1,5 jour, en collectif restreint de 9 à 10 participants.

Chaque participant apporte ses chiffres d'activité des 12 derniers mois (estimations, mandats, exclusivités, ventes) : ils servent de matière première dès le premier atelier.

Jour 1 : Consolider le pilotage

11h00 – 11h30 : Accueil et inclusion
- Recueil des attentes et contrat de fonctionnement du groupe.
- Auto-positionnement d'entrée sur les objectifs pédagogiques, grille remise en séance.

11h30 – 13h00 : Point d'étape — qu'ai-je piloté depuis l'étape 1 ?
- Retours d'expérience structurés des participants déjà formés : ce qui a tenu, ce qui a lâché.
- Réactivation des fondamentaux surfeur / pilote et du GPS (objectifs, priorités, stratégies) par reformulation croisée : les anciens transmettent, les nouveaux s'approprient.
- Apports complémentaires du formateur sur les points de blocage remontés.

14h30 – 17h10 : Atelier — mon GPS actualisé
- Clarté des objectifs : ce que je vise sur 12 mois, traduit en chiffres d'activité.
- Priorisation : ce que j'arrête, ce que je garde, ce que je démarre.
- Organisation de la semaine type : les créneaux non négociables posés dans l'agenda.
- Atelier individuel guidé sur ses propres indicateurs ; chacun repart avec son GPS ajusté et son organisation hebdomadaire posée.

17h10 – 17h30 : Synthèse et pont vers la journée 2
- Engagements individuels formalisés par écrit.
- Présentation du fil de la journée métier.

Jour 2 : De l'estimation au mandat exclusif

9h00 – 9h30 : Ouverture — la posture du pilote face au vendeur
- Ancrage des acquis de la veille.
- L'autorité professionnelle bienveillante : dire les vérités qui servent le client.

9h30 – 11h00 : Préparer le rendez-vous d'estimation
- La découverte vendeur : projet, motivations, calendrier.
- Les données du marché et la construction de l'avis de valeur.
- Travail sur des dossiers réels apportés par les participants.

11h00 – 11h15 : Pause

11h15 – 12h30 : Conduire le rendez-vous d'estimation
- Structure du rendez-vous et annonce d'un prix argumenté.
- La posture de conseil face aux attentes du vendeur.
- Mises en situation en sous-groupes avec grille d'observation, débriefs collectifs.

12h30 – 13h30 : Pause déjeuner

13h30 – 14h30 : Le mandat exclusif et les honoraires
- Argumenter l'exclusivité du point de vue du vendeur.
- Défendre ses honoraires sans les négocier par avance.
- Traitement des objections courantes : ateliers scripts et jeux de rôle.

14h30 – 15h30 : Le suivi après rendez-vous et le plan d'action 30 jours
- Le rituel de suivi jusqu'à la signature : quoi, quand, par quel canal.
- Formalisation individuelle du plan d'action : une priorité, des actions datées, des indicateurs hebdomadaires.

15h30 – 16h00 : Évaluation des acquis et clôture
- Quiz de validation des acquis et auto-positionnement de sortie.
- Évaluation de la satisfaction à chaud.
- Tour de clôture, engagements et constitution des binômes de suivi (point téléphonique à J+15).`;

const PRODUCT_DATA = {
  title: TITLE,
  durationHours: 11,
  modality: 'PRESENTIEL' as const,
  theme: 'Acquisition / Pilotage',
  priceHT: new Prisma.Decimal(400),
  vatRate: new Prisma.Decimal(0),
  groupFlatPrice: null,
  capacityMin: 9,
  capacityMax: 10,
  isActive: true,
  excludedFromBpf: false,
  bpfSpecialty: '312 - Commerce, vente',
  bpfCategory: 'F.3.d - Autres formations professionnelles',
  objectives: OBJECTIVES,
  programMd: PROGRAMME_MD,
  targetAudience:
    "Conseillers immobiliers indépendants et agents commerciaux exerçant en transaction. Effectif restreint de 9 à 10 participants pour permettre l'individualisation.",
  prerequisites:
    "Exercer une activité de conseil en transaction immobilière. Avoir suivi l'étape 1 « Du surfeur au pilote » est un plus mais n'est pas requis : les notions socles sont réactivées en première demi-journée. Chaque participant apporte ses chiffres d'activité des 12 derniers mois (estimations, mandats, exclusivités, ventes).",
  pedagogicalMethods:
    "Formation en présentiel, en collectif restreint de 9 à 10 participants, favorisant l'individualisation. Alternance d'apports du formateur, d'ateliers individuels sur les données réelles des participants, de travaux en binômes et en sous-groupes, et de mises en situation débriefées.",
  pedagogicalSupport:
    "Supports remis à chaque participant : grille d'auto-positionnement, trame GPS, trames d'atelier, plan d'action 30 jours. Ancrage post-formation : binômes de suivi entre participants avec point téléphonique à J+15.",
  evaluationMethods:
    "Auto-positionnement en entrée et en sortie de formation sur les objectifs pédagogiques. Évaluation des acquis en fin de formation par quiz. Évaluation de la satisfaction à chaud. Feuilles d'émargement par demi-journée. Certificat de réalisation remis à chaque participant.",
  trainerProfile:
    "Sébastien Tedesco — coach et formateur de conseillers immobiliers depuis plus de 10 ans, ancien CEO de Keller Williams France, auteur de « L'extinction ».",
  accessibility:
    "Nos formations sont accessibles aux personnes en situation de handicap. Les modalités (durée, rythme, supports, salle) sont adaptées après étude des besoins avec le référent handicap : formation@start-academy.fr.",
  accessConditions:
    "Inscription au minimum 14 jours calendaires avant le début de la formation auprès de formation@start-academy.fr. Une convention de formation est adressée à la validation de l'inscription, la convocation 7 jours avant le début. Un test de positionnement est à réaliser avant la formation. En cas de subrogation de paiement, l'accord du financeur doit nous être parvenu avant le début de la formation.",
  aiDraftedAt: null,
};

const START = new Date('2026-09-28T00:00:00.000Z');
const END = new Date('2026-09-29T00:00:00.000Z');

// Horaires atypiques (≠ norme maison 9h-13h / 14h-18h) → portés par SessionSlot.
const SLOTS = [
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '11h00', endTime: '13h00', halfDay: 'morning' },
  { date: new Date('2026-09-28T00:00:00.000Z'), startTime: '14h30', endTime: '17h30', halfDay: 'afternoon' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '9h00', endTime: '12h30', halfDay: 'morning' },
  { date: new Date('2026-09-29T00:00:00.000Z'), startTime: '13h30', endTime: '16h00', halfDay: 'afternoon' },
];

const NOTES = [
  'Réseau iad — groupe mixte : participants de l\'étape 1 (janvier 2026) + nouveaux entrants.',
  'Chaque conseiller paye pour lui-même (agents commerciaux EI) → 1 contrat individuel + 1 dossier de financement par participant (OPCO EP / AGEFICE selon la contribution CFP).',
  'Tarif : 400 € HT par participant (11 h).',
  'LIEU À RENSEIGNER — obligatoire avant génération de la convention et de l\'émargement (raison sociale + CP + ville).',
  'HORAIRES ATYPIQUES : J1 11h00-13h00 / 14h30-17h30 · J2 9h00-12h30 / 13h30-16h00 (portés par les créneaux). L\'émargement et la convocation générés utilisent les horaires figés 9h-13h / 14h-18h → À CORRIGER À LA MAIN avant envoi.',
].join('\n');

async function nextProductCode(): Promise<string> {
  const rows = await prisma.trainingProduct.findMany({
    where: { tenantId: TENANT_ID, code: { startsWith: 'PROD-' } },
    select: { code: true },
  });
  const max = rows.reduce((m, r) => {
    const mm = r.code.match(/^PROD-0*(\d+)$/);
    return mm ? Math.max(m, parseInt(mm[1]!, 10)) : m;
  }, 0);
  return `PROD-${String(max + 1).padStart(4, '0')}`;
}

async function nextSessionCode(): Promise<string> {
  const last = await prisma.trainingSession.findFirst({
    where: { tenantId: TENANT_ID, code: { startsWith: 'SES-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const n = last ? parseInt(last.code.replace('SES-', ''), 10) || 0 : 0;
  return `SES-${String(n + 1).padStart(4, '0')}`;
}

async function main() {
  console.log(`=== ${DRY ? 'DRY-RUN (WRITE=1 pour écrire)' : 'ÉCRITURE RÉELLE'} ===\n`);

  // ── 1. Produit ──────────────────────────────────────────────────────────
  let product = await prisma.trainingProduct.findFirst({
    where: { tenantId: TENANT_ID, title: TITLE },
    select: { id: true, code: true },
  });
  if (product) {
    console.log(`Produit déjà présent : ${product.code}`);
  } else {
    const code = await nextProductCode();
    console.log(`Produit à créer : ${code} — ${TITLE}`);
    console.log(`  11h · PRESENTIEL · 400 € HT/apprenant · 9-10 pers. · NSF 312 · ${OBJECTIVES.length} objectifs · programme ${PROGRAMME_MD.length} car.`);
    if (!DRY) {
      // INSERT en SQL brut : le client Prisma de cette branche connaît
      // `TrainingProduct.fundingType` (migration 20260902170000, non mergée)
      // que la base cloud n'a pas encore → `prisma.trainingProduct.create()`
      // échoue en P2022. On écrit donc exactement les colonnes qui existent.
      const id = randomUUID();
      const d = PRODUCT_DATA;
      await prisma.$executeRaw`
        INSERT INTO "TrainingProduct" (
          "id", "tenantId", "code", "title", "durationHours", "modality",
          "prerequisites", "targetAudience", "objectives", "programMd",
          "pedagogicalMethods", "evaluationMethods", "accessibility",
          "trainerProfile", "pedagogicalSupport", "accessConditions",
          "priceHT", "vatRate", "groupFlatPrice", "theme", "version",
          "isActive", "excludedFromBpf", "bpfSpecialty", "bpfCategory",
          "capacityMin", "capacityMax", "ageficeEvaluations",
          "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${TENANT_ID}, ${code}, ${d.title}, ${d.durationHours}, ${'PRESENTIEL'}::"Modality",
          ${d.prerequisites}, ${d.targetAudience}, ${JSON.stringify(d.objectives)}::jsonb, ${d.programMd},
          ${d.pedagogicalMethods}, ${d.evaluationMethods}, ${d.accessibility},
          ${d.trainerProfile}, ${d.pedagogicalSupport}, ${d.accessConditions},
          400, 0, NULL, ${d.theme}, 1,
          true, false, ${d.bpfSpecialty}, ${d.bpfCategory},
          ${d.capacityMin}, ${d.capacityMax}, ARRAY[]::text[],
          now(), now()
        )`;
      product = { id, code };
      console.log(`  ✓ créé id=${id}`);
    }
  }

  // ── 2. Formateur Sébastien TEDESCO ──────────────────────────────────────
  let trainer = await prisma.person.findFirst({
    where: {
      tenantId: TENANT_ID,
      firstName: { equals: 'Sébastien', mode: 'insensitive' },
      lastName: { equals: 'TEDESCO', mode: 'insensitive' },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (trainer) {
    console.log(`\nFormateur déjà présent : ${trainer.firstName} ${trainer.lastName}`);
  } else {
    console.log('\nFormateur à créer : Sébastien TEDESCO (externe, sans email ni structure connue)');
    if (!DRY) {
      trainer = await prisma.person.create({
        data: {
          tenantId: TENANT_ID,
          civility: 'M.',
          firstName: 'Sébastien',
          lastName: 'TEDESCO',
          professionalStatus: 'Formateur',
        },
        select: { id: true, firstName: true, lastName: true },
      });
      console.log(`  ✓ créé id=${trainer.id}`);
    }
  }

  // ── 3. Session ──────────────────────────────────────────────────────────
  const existingSession = await prisma.trainingSession.findFirst({
    where: { tenantId: TENANT_ID, startDate: START, product: { title: TITLE } },
    select: { id: true, code: true },
  });
  if (existingSession) {
    console.log(`\nSession déjà présente : ${existingSession.code}`);
  } else {
    const code = await nextSessionCode();
    const name = `${TITLE} - ${START.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`;
    console.log(`\nSession à créer : ${code}`);
    console.log(`  ${name}`);
    console.log(`  28/09/2026 → 29/09/2026 · PRESENTIEL · DRAFT · 9-10 pers. · 400 € HT/apprenant · lieu NON RENSEIGNÉ`);
    console.log(`  Formateur principal : Sébastien TEDESCO (LEAD, isPrimary)`);
    console.log(`  Créneaux : ${SLOTS.map((s) => `${s.date.toISOString().slice(0, 10)} ${s.startTime}-${s.endTime}`).join(' | ')}`);
    if (!DRY) {
      if (!product || !trainer) throw new Error('produit ou formateur manquant');
      const created = await prisma.$transaction(async (tx) => {
        const s = await tx.trainingSession.create({
          data: {
            tenantId: TENANT_ID,
            productId: product!.id,
            code,
            name,
            status: 'DRAFT',
            startDate: START,
            endDate: END,
            modality: 'PRESENTIEL',
            capacityMin: 9,
            capacityMax: 10,
            pricePerLearner: new Prisma.Decimal(400),
            internalNotes: NOTES,
          },
          select: { id: true, code: true },
        });
        await tx.sessionTrainer.create({
          data: { sessionId: s.id, personId: trainer!.id, role: 'LEAD', isPrimary: true },
          select: { id: true },
        });
        await tx.sessionSlot.createMany({ data: SLOTS.map((sl) => ({ sessionId: s.id, ...sl })) });
        return s;
      });
      console.log(`  ✓ créée ${created.code} id=${created.id}`);
    }
  }

  console.log(`\n=== ${DRY ? 'DRY-RUN terminé — rien écrit' : 'Terminé'} ===`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
