/**
 * Jeu de démonstration pour l'écran d'envoi en signature (lot C.2b).
 *
 * POURQUOI : la base du worktree est un seed nu — 0 session, 0 inscription. On ne
 * pouvait donc PAS voir à l'écran le comportement neuf, en particulier
 * l'avertissement « régime incohérent », qui n'a de sens que sur une donnée
 * incohérente. Ce script fabrique les trois situations qui comptent.
 *
 * Les trois situations, et ce qu'elles doivent produire :
 *
 *  1. AGENCE FINANCÉE OPCO EP — dirigeant (email) + 2 salariés inscrits.
 *     Attendu : UNE convention pour l'agence, signée par le dirigeant ; les
 *     salariés ne signent rien ; ni dossier AGEFICE ni assiduité (NA, pas MISSING).
 *
 *  2. TNS AGEFICE via son EI — il est sa propre entreprise bénéficiaire.
 *     Attendu : il signe sa convention (la résolution « dirigeant » tombe sur
 *     lui-même via EI_SELF), son dossier AGEFICE et son assiduité.
 *
 *  3. LE CAS MARION — sponsor SANS financeur, mais rattachée par ailleurs à une
 *     organisation AGEFICE. Relevé en production le 11/09/2026 (SES-0048).
 *     Attendu : la convention RESTE visible (pas de financeur ≠ hors régime —
 *     c'est ce que `docTypesSansObjet` protège), et l'AVERTISSEMENT
 *     « régime incohérent » s'affiche en la nommant, au lieu d'un NA muet.
 *
 * Idempotent : rejouable, il supprime son propre jeu avant de le refaire. Il ne
 * touche à RIEN d'autre — tout est préfixé `DEMO-SIG`.
 *
 * Lecture seule impossible par nature : ce script ÉCRIT. Il refuse donc toute
 * cible non locale, via le même garde-fou que le seed.
 */
import { PrismaClient, LinkRole, DocType, FinancingMode, Modality, LegalForm } from '@prisma/client';
import { createHash } from 'node:crypto';
import { assertCibleAutorisee } from './assert-db-target.js';

const prisma = new PrismaClient();

const MARQUE = 'DEMO-SIG';
const CODE_SESSION = 'DEMO-SIG-01';

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

async function nettoyer(tenantId: string): Promise<void> {
  const session = await prisma.trainingSession.findUnique({ where: { code: CODE_SESSION } });
  if (session) {
    await prisma.document.deleteMany({ where: { sessionId: session.id } });
    await prisma.sessionParticipant.deleteMany({ where: { sessionId: session.id } });
    await prisma.trainingSession.delete({ where: { id: session.id } });
  }
  const orgs = await prisma.organization.findMany({
    where: { tenantId, legalName: { startsWith: MARQUE } },
    select: { id: true },
  });
  const ids = orgs.map((o) => o.id);
  if (ids.length > 0) {
    await prisma.legalLink.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.contact.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.person.deleteMany({ where: { tenantId, lastName: { startsWith: MARQUE } } });
  await prisma.trainingProduct.deleteMany({ where: { tenantId, code: `${MARQUE}-PROD` } });
}

async function main(): Promise<void> {
  assertCibleAutorisee('Semis de démonstration signature');

  const tenant = await prisma.tenant.findFirstOrThrow();
  await nettoyer(tenant.id);

  const produit = await prisma.trainingProduct.create({
    data: {
      tenantId: tenant.id,
      code: `${MARQUE}-PROD`,
      title: "L'IA au service de l'agent commercial immobilier",
      durationHours: 8,
      modality: Modality.PRESENTIEL,
      objectives: [
        'Identifier les usages de l’IA générative dans la prospection immobilière',
        'Rédiger des annonces et des relances assistées par IA',
        'Sécuriser l’usage professionnel des outils au regard du RGPD',
      ],
      programMd:
        '## Jour 1\n\n- Panorama des outils\n- Atelier annonces\n\n## Jour 2\n\n- Relances et suivi\n- Cadre RGPD',
      priceHT: 1344,
      theme: 'IA',
    },
  });

  const debut = new Date();
  debut.setDate(debut.getDate() + 21);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);

  const session = await prisma.trainingSession.create({
    data: {
      tenantId: tenant.id,
      productId: produit.id,
      code: CODE_SESSION,
      name: 'Démo signature — trois régimes de financement',
      startDate: debut,
      endDate: fin,
      modality: Modality.PRESENTIEL,
      pricePerLearner: 1344,
    },
  });

  // ---------- 1. Agence financée OPCO EP -----------------------------------
  const agence = await prisma.organization.create({
    data: {
      tenantId: tenant.id,
      legalName: `${MARQUE} Agence Provence Immobilier`,
      brandName: 'Provence Immobilier',
      siret: '90123456700018',
      siren: '901234567',
      legalForm: LegalForm.SARL,
      opcoCode: 'OPCO_EP',
      // Le représentant que la convention imprime — et donc celui qui signera.
      representative: 'Paul DURAND',
      type: 'Client',
    },
  });
  // Son email : la cascade le cherche sur le contact principal.
  await prisma.contact.create({
    data: {
      tenantId: tenant.id,
      organizationId: agence.id,
      firstName: 'Paul',
      lastName: 'DURAND',
      email: 'paul.durand@demo-provence-immo.fr',
      function: 'Gérant',
      isPrimary: true,
    },
  });
  const dirigeant = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      firstName: 'Paul',
      lastName: `${MARQUE} DURAND`,
      email: 'paul.durand@demo-provence-immo.fr',
    },
  });
  await prisma.legalLink.create({
    data: { personId: dirigeant.id, organizationId: agence.id, role: LinkRole.DIRIGEANT, isPrimary: true },
  });

  const salaries = [];
  for (const [prenom, nom] of [
    ['Sophie', 'MARTIN'],
    ['Karim', 'BENALI'],
  ] as const) {
    const p = await prisma.person.create({
      data: {
        tenantId: tenant.id,
        firstName: prenom,
        lastName: `${MARQUE} ${nom}`,
        email: `${prenom.toLowerCase()}.${nom.toLowerCase()}@demo-provence-immo.fr`,
      },
    });
    await prisma.legalLink.create({
      data: { personId: p.id, organizationId: agence.id, role: LinkRole.SALARIE },
    });
    salaries.push(p);
  }

  // ---------- 2. TNS AGEFICE via son EI ------------------------------------
  const eiTns = await prisma.organization.create({
    data: {
      tenantId: tenant.id,
      legalName: `${MARQUE} BERNARD Julien (EI)`,
      siret: '88123456700017',
      siren: '881234567',
      legalForm: LegalForm.EI,
      opcoCode: 'AGEFICE',
      representative: 'Julien BERNARD',
      type: 'Client',
    },
  });
  const tns = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      firstName: 'Julien',
      lastName: `${MARQUE} BERNARD`,
      email: 'julien.bernard@demo-independant.fr',
    },
  });
  await prisma.legalLink.create({
    data: { personId: tns.id, organizationId: eiTns.id, role: LinkRole.EI_SELF, isPrimary: true },
  });

  // ---------- 3. Le cas Marion : sponsor SANS financeur + signaux AGEFICE ---
  const eiSansFinanceur = await prisma.organization.create({
    data: {
      tenantId: tenant.id,
      legalName: `${MARQUE} ROUSSEL Camille (EI)`,
      siret: '92123456700016',
      siren: '921234567',
      // AUCUN opcoCode : c'est tout l'intérêt du cas.
      legalForm: LegalForm.EI,
      opcoCode: null,
      representative: 'Camille ROUSSEL',
      type: 'Client',
    },
  });
  const enseigneAgefice = await prisma.organization.create({
    data: {
      tenantId: tenant.id,
      legalName: `${MARQUE} Réseau Azur Transactions`,
      brandName: 'Azur Transactions',
      legalForm: LegalForm.SAS,
      opcoCode: 'AGEFICE',
      type: 'Client',
    },
  });
  const marion = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      firstName: 'Camille',
      lastName: `${MARQUE} ROUSSEL`,
      email: 'camille.roussel@demo-azur.fr',
    },
  });
  await prisma.legalLink.create({
    data: { personId: marion.id, organizationId: eiSansFinanceur.id, role: LinkRole.EI_SELF, isPrimary: true },
  });
  // LE signal d'incohérence : rattachée par ailleurs à une organisation AGEFICE.
  await prisma.legalLink.create({
    data: { personId: marion.id, organizationId: enseigneAgefice.id, role: LinkRole.AGENT_COMMERCIAL },
  });

  // ---------- Inscriptions --------------------------------------------------
  const inscrits: {
    personId: string;
    sponsorOrgId: string;
    type: string;
    mode: FinancingMode;
    /** Pièces RÉELLEMENT générées pour cet inscrit — elles suivent son régime. */
    pieces: DocType[];
  }[] = [
    // Salariées OPCO : la convention seule. PAS de dossier AGEFICE ni d'assiduité
    // — les générer ferait apparaître la colonne (garde « visible si un document
    // existe ») et masquerait le NA qu'on veut justement observer.
    ...salaries.map((s) => ({
      personId: s.id,
      sponsorOrgId: agence.id,
      type: 'Salarié',
      mode: FinancingMode.OPCO,
      pieces: [DocType.CONVENTION],
    })),
    // TNS AGEFICE : les trois pièces.
    {
      personId: tns.id,
      sponsorOrgId: eiTns.id,
      type: 'EI',
      mode: FinancingMode.OPCO,
      pieces: [DocType.CONVENTION, DocType.AGEFICE, DocType.ASSIDUITE],
    },
    // Cas Marion : convention seule. En production (SES-0048) elle n'a AUCUN
    // dossier AGEFICE généré — on reproduit fidèlement, sinon l'avertissement
    // serait masqué par la présence du document.
    {
      personId: marion.id,
      sponsorOrgId: eiSansFinanceur.id,
      type: 'EI',
      mode: FinancingMode.AUTOFINANCEMENT,
      pieces: [DocType.CONVENTION],
    },
  ];

  let docs = 0;
  for (const i of inscrits) {
    const sp = await prisma.sessionParticipant.create({
      data: {
        sessionId: session.id,
        personId: i.personId,
        sponsorOrgId: i.sponsorOrgId,
        participantType: i.type,
        financingMode: i.mode,
        priceHT: 1344,
      },
    });
    // Documents « générés » : la matrice a besoin d'une ligne Document pour
    // afficher l'état GÉNÉRÉ. Le PDF réel sera refabriqué à l'ouverture du
    // récapitulatif (amendement n°5) — ces clés sont des jalons, pas des pièces.
    for (const type of i.pieces) {
      const cle = `sessions/${tenant.id}/${CODE_SESSION}/demo-${type}-${sp.id}.pdf`;
      await prisma.document.create({
        data: {
          tenantId: tenant.id,
          type,
          entityType: 'participant',
          entityId: sp.id,
          pdfUrl: cle,
          hashSha256: hash(cle),
          sessionId: session.id,
          participantId: sp.id,
        },
      });
      docs += 1;
    }
  }

  console.log(`\n✅ Session ${CODE_SESSION} — « ${session.name} »`);
  console.log(`   produit : ${produit.title}`);
  console.log(`   4 inscrits, ${docs} documents, 4 organisations, 5 rattachements.\n`);
  console.log('   1. Agence OPCO EP  → Sophie MARTIN, Karim BENALI (salariées)');
  console.log('      convention signée par Paul DURAND ; ni AGEFICE ni assiduité (NA)');
  console.log('   2. TNS AGEFICE     → Julien BERNARD (EI_SELF) : convention + AGEFICE + assiduité');
  console.log('   3. CAS MARION      → Camille ROUSSEL : sponsor SANS financeur,');
  console.log('      rattachée par ailleurs à une enseigne AGEFICE');
  console.log('      → attendu : convention visible + AVERTISSEMENT « régime incohérent »\n');
}

main()
  .catch((e) => {
    console.error('❌ semis échoué :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
