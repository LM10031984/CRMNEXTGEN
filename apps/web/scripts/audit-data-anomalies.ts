/**
 * Détection des anomalies de données dans QualiOF.
 *
 * Repère 3 catégories à reviewer manuellement avant correction :
 *   1. Doublons Person (même email OU même firstName+lastName)
 *   2. SessionParticipant avec priceHT divisé par 2 (vs product.priceHT)
 *      ou priceHT < 50% du tarif normal du produit
 *   3. SessionParticipant avec priceHT à 0 ou null
 *
 * Usage : pnpm --filter @qualiof/web exec tsx scripts/audit-data-anomalies.ts
 *
 * Affiche un rapport text — aucune modification DB. Utile pour Laurent
 * avant de lancer un correctif batch.
 */

import { prisma } from '@qualiof/db';

interface AnomalyReport {
  duplicatesByEmail: { email: string; persons: { id: string; name: string; tenantId: string }[] }[];
  duplicatesByName: { name: string; persons: { id: string; email: string | null; tenantId: string }[] }[];
  participantsHalfPrice: {
    sessionCode: string;
    participantId: string;
    personName: string;
    priceHT: number;
    productPriceHT: number;
    ratio: number;
  }[];
  participantsZeroPrice: {
    sessionCode: string;
    participantId: string;
    personName: string;
    productTitle: string;
  }[];
}

async function main() {
  console.log('🔍 Audit des anomalies de données QualiOF\n');

  // 1. Doublons par email (case-insensitive, email non null)
  const emailGroups = await prisma.$queryRaw<{ email: string; cnt: bigint }[]>`
    SELECT LOWER(email) as email, COUNT(*) as cnt
    FROM "Person"
    WHERE archived = false AND email IS NOT NULL AND email <> ''
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `;
  const duplicatesByEmail: AnomalyReport['duplicatesByEmail'] = [];
  for (const g of emailGroups) {
    const persons = await prisma.person.findMany({
      where: { archived: false, email: { equals: g.email, mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true, tenantId: true },
    });
    duplicatesByEmail.push({
      email: g.email,
      persons: persons.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        tenantId: p.tenantId,
      })),
    });
  }

  // 2. Doublons par nom+prénom (cas Alexia ASTIER × 2 sans email partagé)
  const nameGroups = await prisma.$queryRaw<{ key: string; cnt: bigint }[]>`
    SELECT LOWER(TRIM("firstName") || '|' || TRIM("lastName")) as key, COUNT(*) as cnt
    FROM "Person"
    WHERE archived = false
    GROUP BY LOWER(TRIM("firstName") || '|' || TRIM("lastName"))
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `;
  const duplicatesByName: AnomalyReport['duplicatesByName'] = [];
  for (const g of nameGroups) {
    const [first, last] = g.key.split('|');
    const persons = await prisma.person.findMany({
      where: {
        archived: false,
        firstName: { equals: first, mode: 'insensitive' },
        lastName: { equals: last, mode: 'insensitive' },
      },
      select: { id: true, email: true, tenantId: true },
    });
    duplicatesByName.push({
      name: `${first} ${last}`,
      persons: persons.map((p) => ({ id: p.id, email: p.email, tenantId: p.tenantId })),
    });
  }

  // 3. Tarif ÷2 (priceHT < 60% du product.priceHT)
  const sps = await prisma.sessionParticipant.findMany({
    where: { priceHT: { gt: 0 } },
    select: {
      id: true,
      priceHT: true,
      session: {
        select: {
          code: true,
          product: { select: { priceHT: true, title: true } },
        },
      },
      person: { select: { firstName: true, lastName: true } },
    },
  });
  const participantsHalfPrice: AnomalyReport['participantsHalfPrice'] = [];
  for (const sp of sps) {
    const productPrice = Number(sp.session.product.priceHT);
    const sessionPrice = Number(sp.priceHT);
    if (productPrice <= 0) continue;
    const ratio = sessionPrice / productPrice;
    if (ratio < 0.6 && ratio > 0) {
      participantsHalfPrice.push({
        sessionCode: sp.session.code,
        participantId: sp.id,
        personName: `${sp.person.firstName} ${sp.person.lastName}`.trim(),
        priceHT: sessionPrice,
        productPriceHT: productPrice,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  }

  // 4. Tarif à 0
  const zeroPriceSps = await prisma.sessionParticipant.findMany({
    where: { priceHT: 0 },
    select: {
      id: true,
      session: { select: { code: true, product: { select: { title: true } } } },
      person: { select: { firstName: true, lastName: true } },
    },
  });
  const participantsZeroPrice = zeroPriceSps.map((sp) => ({
    sessionCode: sp.session.code,
    participantId: sp.id,
    personName: `${sp.person.firstName} ${sp.person.lastName}`.trim(),
    productTitle: sp.session.product.title,
  }));

  // === Rapport ===
  console.log('=== 1. Doublons par email ===');
  if (duplicatesByEmail.length === 0) {
    console.log('  ✓ Aucun doublon par email');
  } else {
    for (const d of duplicatesByEmail) {
      console.log(`  📧 ${d.email} (${d.persons.length} personnes)`);
      for (const p of d.persons) console.log(`     - ${p.name} [${p.id.slice(0, 8)}]`);
    }
  }

  console.log('\n=== 2. Doublons par nom+prénom ===');
  if (duplicatesByName.length === 0) {
    console.log('  ✓ Aucun doublon par nom');
  } else {
    for (const d of duplicatesByName) {
      console.log(`  👤 ${d.name} (${d.persons.length} personnes)`);
      for (const p of d.persons) console.log(`     - ${p.email ?? '(sans email)'} [${p.id.slice(0, 8)}]`);
    }
  }

  console.log(`\n=== 3. Tarif ÷2 ou plus (ratio < 60%) — ${participantsHalfPrice.length} cas ===`);
  if (participantsHalfPrice.length === 0) {
    console.log('  ✓ Aucun participant avec tarif anormalement bas');
  } else {
    for (const p of participantsHalfPrice.slice(0, 50)) {
      console.log(
        `  💰 ${p.sessionCode} — ${p.personName} : ${p.priceHT}€ (vs ${p.productPriceHT}€ produit, ratio ${(p.ratio * 100).toFixed(0)}%) [${p.participantId.slice(0, 8)}]`,
      );
    }
    if (participantsHalfPrice.length > 50) console.log(`  ... et ${participantsHalfPrice.length - 50} autres`);
  }

  console.log(`\n=== 4. Tarif à 0 / null — ${participantsZeroPrice.length} cas ===`);
  if (participantsZeroPrice.length === 0) {
    console.log('  ✓ Aucun participant avec tarif à 0');
  } else {
    for (const p of participantsZeroPrice.slice(0, 30)) {
      console.log(`  ⚠️  ${p.sessionCode} — ${p.personName} (${p.productTitle}) [${p.participantId.slice(0, 8)}]`);
    }
    if (participantsZeroPrice.length > 30) console.log(`  ... et ${participantsZeroPrice.length - 30} autres`);
  }

  console.log(`\n📊 Résumé : ${duplicatesByEmail.length} doublons email, ${duplicatesByName.length} doublons nom, ${participantsHalfPrice.length} tarifs ÷2+, ${participantsZeroPrice.length} tarifs à 0.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
