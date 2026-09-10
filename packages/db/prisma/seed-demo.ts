/**
 * Jeu de démonstration pour la base d'APERÇU — jamais pour la production.
 *
 * Pourquoi il existe (relecture du 10/09/2026) : l'aperçu Vercel construisait
 * bien, mais sa base ne contenait que le tenant, l'admin et les référentiels.
 * Laurent pouvait constater que les écrans s'affichent — il ne pouvait rien
 * juger : 0 session, 0 lead, 0 diagnostic, et la liste « Formation pressentie »
 * réduite à son option vide. Une relecture sur base vide ne relit rien.
 *
 * ── Trois garde-fous, dans cet ordre ────────────────────────────────────────
 *
 *  1. **Refus de la production.** Le script s'arrête si l'URL de base ne porte
 *     pas la marque d'un environnement jetable, à moins que `SEED_DEMO_FORCE=1`
 *     ne soit posé sciemment. Le piège est connu : les deux projets Supabase
 *     vivent sur des comptes différents et leurs poolers se ressemblent
 *     (`aws-0` pour la prod, `aws-1` pour l'aperçu) — recopier une adresse en
 *     changeant seulement le ref donne une chaîne qui a l'air juste.
 *  2. **Tout est marqué.** Chaque ligne créée porte le préfixe `DEMO-` dans sa
 *     référence, ou la mention « (démo) » dans son nom. On voit d'un coup d'œil
 *     ce qui est fictif, et `--purge` sait tout reprendre.
 *  3. **Rejouable.** Relancer le script ne duplique rien : il repère ses
 *     propres lignes par leur code et les met à jour.
 *
 * ── Ce qu'il sème ──────────────────────────────────────────────────────────
 *
 *  · 3 produits de formation actifs, alignés sur l'unité de vente (demi-journée
 *    de 4 h, 336 € HT/participant — §8.1) ;
 *  · 2 agences fictives, dont une avec son dirigeant et ses agents ;
 *  · 1 lead frais, non traité, pour l'écran de prospection ;
 *  · 1 diagnostic LÉGER terminé, DEMO-DIAG-0001, avec ses 4 fiches équipe et
 *    toutes ses réponses — l'exemple canonique de la spec : 4 indés au-dessus
 *    du seuil AGEFICE, donc 9 demi-journées de groupe et une prise en charge
 *    plafonnée ;
 *  · 1 campagne de RDV ouverte sur ce diagnostic, avec deux dates (une matinée
 *    et une journée, pour que le décompte en demi-journées se voie) et quatre
 *    dossiers dans quatre états différents — complet, pièces manquantes, rejeté,
 *    et formulaire non rendu. Sans eux, l'écran « ce qui bloque » du lot F
 *    reste vide et il n'y a rien à relire.
 *
 * Le lien public de la campagne est DÉTERMINISTE en démonstration, et le script
 * l'affiche : sans lui, la page `/rdv/[token]` serait inatteignable, puisqu'un
 * token réel ne s'affiche qu'une fois à la création. C'est un écart assumé, et
 * la raison pour laquelle ce script refuse toute base qui n'est pas jetable.
 *
 * Usage :
 *   DATABASE_URL=… DIRECT_URL=… pnpm --filter @qualiof/db exec tsx prisma/seed-demo.ts
 *   … --purge   pour retirer le jeu de démo sans toucher au reste
 */

import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import { LegalForm, Modality } from '@prisma/client';
import {
  getQuestionsForVariant,
  REFERENTIAL_VERSION,
  type DiagnosticQuestion,
} from '@qualiof/shared/diagnostic';
import { prisma } from '../src/index.js';

const MARQUE = 'DEMO';
const PURGE = process.argv.includes('--purge');

/**
 * Une base jetable s'annonce comme telle. La liste est volontairement courte :
 * mieux vaut un refus injuste, qu'on lève avec `SEED_DEMO_FORCE=1` en sachant
 * ce qu'on fait, qu'un jeu fictif déposé dans les vraies données d'un OF.
 */
const HOTES_JETABLES = /(apercu|aperçu|preview|staging|localhost|127\.0\.0\.1|aws-1-eu-west-1)/i;

function verifierCible(): void {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('Ni DIRECT_URL ni DATABASE_URL : aucune base cible.');
  }
  const hote = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  if (HOTES_JETABLES.test(url)) {
    console.log(`→ base cible : ${hote} (reconnue comme environnement d'aperçu ou local)`);
    return;
  }
  if (process.env.SEED_DEMO_FORCE === '1') {
    console.warn(`⚠ base cible NON reconnue comme jetable (${hote}) — forcé par SEED_DEMO_FORCE=1`);
    return;
  }
  throw new Error(
    `Refus : la base ${hote} ne s'annonce pas comme un environnement d'aperçu.\n` +
      `La production de QualiOF est sur le pooler aws-0 ; l'aperçu sur aws-1.\n` +
      `Si la cible est bien jetable, relancez avec SEED_DEMO_FORCE=1.`,
  );
}

/**
 * Dans N jours, à H heures pile **à Paris**.
 *
 * `setHours` suivrait le fuseau de la machine qui lance le seed : lancé depuis
 * un runner en UTC, il fabriquerait des créneaux décalés de deux heures, et la
 * page publique annoncerait au participant une heure qu'on ne tiendra pas.
 * Le décalage est donc lu pour la date visée — il change entre l'été et l'hiver.
 */
const FUSEAU_OF = 'Europe/Paris';

function decalageOf(d: Date): string {
  const nom = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSEAU_OF,
    timeZoneName: 'longOffset',
  })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value;
  return nom?.replace('GMT', '') || '+00:00';
}

function dateA(joursPlusTard: number, heure: number): Date {
  const jour = new Date(Date.now() + joursPlusTard * 86_400_000);
  const aaaammjj = new Intl.DateTimeFormat('fr-CA', {
    timeZone: FUSEAU_OF,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(jour);
  return new Date(`${aaaammjj}T${String(heure).padStart(2, '0')}:00:00${decalageOf(jour)}`);
}

/** Une valeur plausible par TYPE de question — le seed ne périme pas quand le référentiel bouge. */
function reponsePlausible(q: DiagnosticQuestion): unknown {
  switch (q.type) {
    case 'int':
      return q.id.includes('agencies') ? 2 : 12;
    case 'percent':
      return 20;
    case 'rating5':
      return 4;
    case 'money':
      return 95_000;
    case 'date':
      return '2025-09-01';
    case 'url':
      return 'https://exemple-demo.invalid';
    case 'yesno':
      return true;
    case 'choice':
      return q.choices?.[0] ?? 'oui';
    case 'multichoice':
      return q.choices?.slice(0, 2) ?? [];
    case 'text':
    default:
      return 'Réponse de démonstration — donnée fictive.';
  }
}

async function purger(tenantId: string): Promise<void> {
  // Ordre voulu : les enfants d'abord, faute de cascade sur tous les liens.
  const diagnostics = await prisma.diagnostic.findMany({
    where: { tenantId, reference: { startsWith: `${MARQUE}-` } },
    select: { id: true },
  });
  const ids = diagnostics.map((d) => d.id);

  const batches = await prisma.enrollmentBatch.findMany({
    where: { tenantId, label: { startsWith: `${MARQUE} ` } },
    select: { id: true },
  });
  if (batches.length > 0) {
    const batchIds = batches.map((b) => b.id);
    await prisma.preEnrollment.updateMany({
      where: { batchId: { in: batchIds } },
      data: { batchId: null },
    });
    await prisma.enrollmentBatch.deleteMany({ where: { id: { in: batchIds } } });
  }

  if (ids.length > 0) {
    await prisma.diagnosticParticipant.deleteMany({ where: { diagnosticId: { in: ids } } });
    await prisma.diagnosticAnswer.deleteMany({ where: { diagnosticId: { in: ids } } });
    await prisma.diagnostic.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.lead.deleteMany({ where: { tenantId, source: `${MARQUE}` } });
  await prisma.legalLink.deleteMany({
    where: { organization: { tenantId, legalName: { contains: '(démo)' } } },
  });
  await prisma.person.deleteMany({ where: { tenantId, lastName: { endsWith: '(démo)' } } });
  await prisma.organization.deleteMany({
    where: { tenantId, legalName: { contains: '(démo)' } },
  });
  await prisma.trainingProduct.deleteMany({
    where: { tenantId, code: { startsWith: `${MARQUE}-` } },
  });
  console.log('✓ jeu de démonstration retiré');
}

async function main(): Promise<void> {
  verifierCible();

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!tenant) throw new Error('Aucun tenant : lancez `db:seed` avant `seed-demo`.');
  const owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  });
  if (!owner) throw new Error('Aucun utilisateur : lancez `db:seed` avant `seed-demo`.');

  if (PURGE) {
    await purger(tenant.id);
    return;
  }

  // ── Produits ───────────────────────────────────────────────────────────────
  // Les durées sont des multiples de la demi-journée (§8.1, D-20) : 4 h sur
  // site par demi-journée. 36 h = 9 demi-journées, le parcours canonique.
  const produits = [
    {
      code: `${MARQUE}-PROD-001`,
      title: 'Prise de mandat en exclusivité — parcours 9 demi-journées (démo)',
      durationHours: 36,
      theme: 'Acquisition',
      objectives: [
        'Argumenter l’exclusivité face à un vendeur réticent',
        'Structurer le rendez-vous de prise de mandat',
        'Sécuriser le compromis',
      ],
    },
    {
      code: `${MARQUE}-PROD-002`,
      title: 'IA appliquée à la prospection immobilière (démo)',
      durationHours: 8,
      theme: 'IA',
      objectives: ['Rédiger une annonce assistée par IA', 'Qualifier un fichier de prospection'],
    },
    {
      code: `${MARQUE}-PROD-003`,
      title: 'Obligations réglementaires — TRACFIN et non-discrimination (démo)',
      durationHours: 4,
      theme: 'Réglementaire',
      objectives: ['Identifier une opération atypique', 'Tenir le registre des mandats'],
    },
  ];

  for (const p of produits) {
    await prisma.trainingProduct.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      update: { title: p.title, durationHours: p.durationHours, isActive: true },
      create: {
        tenantId: tenant.id,
        code: p.code,
        title: p.title,
        durationHours: p.durationHours,
        modality: Modality.PRESENTIEL,
        objectives: p.objectives,
        programMd: `## ${p.title}\n\nProgramme de démonstration — contenu fictif.`,
        theme: p.theme,
        // 336 € HT la demi-journée par participant (§8.1) : le prix affiché
        // découle du nombre de demi-journées, il n'est pas saisi au hasard.
        priceHT: (p.durationHours / 4) * 336,
        isActive: true,
      },
    });
  }
  console.log(`✓ ${produits.length} produits de formation`);

  // ── Agences ────────────────────────────────────────────────────────────────
  const agences = [
    { legalName: 'OPTIMMO Conseil (démo)', brandName: 'OPTIMMO', form: LegalForm.SARL },
    { legalName: 'Rivage Immobilier (démo)', brandName: 'Rivage', form: LegalForm.SAS },
  ];
  const agencesCreees: { id: string; legalName: string }[] = [];
  for (const a of agences) {
    const existante = await prisma.organization.findFirst({
      where: { tenantId: tenant.id, legalName: a.legalName },
      select: { id: true, legalName: true },
    });
    agencesCreees.push(
      existante ??
        (await prisma.organization.create({
          data: {
            tenantId: tenant.id,
            legalName: a.legalName,
            brandName: a.brandName,
            legalForm: a.form,
            type: 'Client',
            email: 'contact@exemple-demo.invalid',
          },
          select: { id: true, legalName: true },
        })),
    );
  }
  const optimmo = agencesCreees[0]!;
  console.log(`✓ ${agencesCreees.length} agences`);

  // ── Lead non traité — l'écran de prospection a besoin d'une ligne vivante ──
  const leadExistant = await prisma.lead.findFirst({
    where: { tenantId: tenant.id, source: MARQUE },
    select: { id: true },
  });
  const lead =
    leadExistant ??
    (await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        source: MARQUE,
        firstName: 'Camille',
        lastName: 'Renard (démo)',
        email: 'camille.renard@exemple-demo.invalid',
        phone: '06 00 00 00 01',
        organizationId: optimmo.id,
        ownerUserId: owner.id,
        notes: 'Agence : OPTIMMO Conseil — donnée de démonstration.',
      },
      select: { id: true },
    }));
  console.log('✓ 1 lead');

  // ── Diagnostic léger terminé — l'exemple canonique de la spec ──────────────
  const reference = `${MARQUE}-DIAG-0001`;
  const existant = await prisma.diagnostic.findFirst({
    where: { tenantId: tenant.id, reference },
    select: { id: true },
  });

  const diagnostic =
    existant ??
    (await prisma.diagnostic.create({
      data: {
        tenantId: tenant.id,
        reference,
        leadId: lead.id,
        organizationId: optimmo.id,
        ownerUserId: owner.id,
        variant: 'LEGER',
        mode: 'GUIDE',
        status: 'TERMINE',
        referentialVersion: REFERENTIAL_VERSION,
        meetingAt: new Date(Date.now() - 7 * 86_400_000),
        r2PlannedAt: new Date(Date.now() + 7 * 86_400_000),
        declaredGoal: 'Passer de 1 mandat sur 5 en exclusivité à 1 sur 2.',
        expectedParticipants: 4,
        completedAt: new Date(Date.now() - 6 * 86_400_000),
      },
      select: { id: true },
    }));

  const questions = getQuestionsForVariant('LEGER');
  for (const q of questions) {
    await prisma.diagnosticAnswer.upsert({
      where: { diagnosticId_questionId: { diagnosticId: diagnostic.id, questionId: q.id } },
      update: {},
      create: {
        diagnosticId: diagnostic.id,
        questionId: q.id,
        value: reponsePlausible(q) as never,
      },
    });
  }
  console.log(`✓ diagnostic ${reference} — ${questions.length} réponses`);

  // Quatre indépendants au-dessus du seuil AGEFICE : c'est la fixture qui donne
  // 36 demi-journées cumulées, 9 de groupe, et une prise en charge plafonnée.
  const equipe = [
    { displayName: 'Marie Delaunay (démo)', caN1: 96_000, fonction: 'Négociatrice' },
    { displayName: 'Julien Pasquier (démo)', caN1: 78_000, fonction: 'Négociateur' },
    { displayName: 'Sophie Lambert (démo)', caN1: 112_000, fonction: 'Négociatrice' },
    { displayName: 'Karim Benali (démo)', caN1: 84_000, fonction: 'Négociateur' },
  ];
  const dejaLa = await prisma.diagnosticParticipant.count({
    where: { diagnosticId: diagnostic.id },
  });
  if (dejaLa === 0) {
    await prisma.diagnosticParticipant.createMany({
      data: equipe.map((p) => ({
        diagnosticId: diagnostic.id,
        displayName: p.displayName,
        statut: 'INDEPENDANT' as const,
        fonction: p.fonction,
        caN1: p.caN1,
        wantsTraining: true,
        includedInProposal: true,
      })),
    });
  }
  console.log(`✓ ${equipe.length} fiches équipe`);

  // ── Campagne de RDV + dossiers ────────────────────────────────────────────
  const token = createHash('sha256').update(`${MARQUE}-campagne-v1`).digest('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const labelCampagne = `${MARQUE} RDV OPTIMMO Conseil (démo)`;

  const campagneExistante = await prisma.enrollmentBatch.findFirst({
    where: { tenantId: tenant.id, label: labelCampagne },
    select: { id: true },
  });

  const dansNJours = (n: number) => new Date(Date.now() + n * 86_400_000);
  const produitPhare = await prisma.trainingProduct.findFirst({
    where: { tenantId: tenant.id, code: `${MARQUE}-PROD-001` },
    select: { id: true },
  });

  const campagne =
    campagneExistante ??
    (await prisma.enrollmentBatch.create({
      data: {
        tenantId: tenant.id,
        label: labelCampagne,
        organizationId: optimmo.id,
        leadId: lead.id,
        diagnosticId: diagnostic.id,
        productId: produitPhare?.id ?? null,
        tokenHash,
        expiresAt: dansNJours(30),
        maxUses: 12,
        usedCount: 4,
        createdById: owner.id,
        dateOptions: {
          create: [
            // Une matinée et une journée : le décompte en demi-journées se voit
            // d'un écran à l'autre (D-23).
            { startsAt: dateA(28, 9), endsAt: dateA(28, 13), label: 'Axe 1 — dans vos locaux' },
            { startsAt: dateA(42, 9), endsAt: dateA(42, 17), label: 'Axes 2 et 3 — journée' },
          ],
        },
      },
      select: { id: true },
    }));

  const dossiers = [
    {
      firstName: 'Marie',
      lastName: 'Delaunay (démo)',
      status: 'VALIDATED' as const,
      pieces: true,
      rendu: true,
    },
    {
      firstName: 'Julien',
      lastName: 'Pasquier (démo)',
      status: 'EXTRACTED' as const,
      pieces: false,
      rendu: true,
    },
    {
      firstName: 'Sophie',
      lastName: 'Lambert (démo)',
      status: 'REJECTED' as const,
      pieces: true,
      rendu: true,
      motif: 'RIB illisible — à redéposer.',
    },
    {
      firstName: 'Karim',
      lastName: 'Benali (démo)',
      status: 'PENDING_FORM' as const,
      pieces: false,
      rendu: false,
    },
  ];

  for (const [i, d] of dossiers.entries()) {
    const jeton = createHash('sha256').update(`${MARQUE}-dossier-${i}`).digest('hex');
    await prisma.preEnrollment.upsert({
      where: { token: jeton },
      update: { batchId: campagne.id },
      create: {
        tenantId: tenant.id,
        token: jeton,
        expiresAt: dansNJours(30),
        batchId: campagne.id,
        firstName: d.firstName,
        lastName: d.lastName,
        email: `${d.firstName.toLowerCase()}@exemple-demo.invalid`,
        status: d.status,
        submittedAt: d.rendu ? new Date(Date.now() - (i + 1) * 86_400_000) : null,
        cniKey: d.pieces ? `demo/${i}/cni.jpg` : null,
        ribKey: d.pieces ? `demo/${i}/rib.pdf` : null,
        cfpKey: d.pieces ? `demo/${i}/cfp.pdf` : null,
        rejectionReason: d.motif ?? null,
      },
    });
  }
  console.log(`✓ campagne de RDV + ${dossiers.length} dossiers (complet, incomplet, rejeté, non rendu)`);

  console.log('\nJeu de démonstration en place. Tout porte « démo » ou le préfixe DEMO-.');
  console.log(`Lien public de la campagne (démo, déterministe) : /rdv/${token}`);
}

main()
  .catch((e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
