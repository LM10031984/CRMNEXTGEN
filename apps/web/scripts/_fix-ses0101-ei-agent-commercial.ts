/**
 * SES-0101 — met les 11 apprenants au statut « Agent commercial » cohérent ET
 * débloque la génération AGEFICE (qui exige un LegalLink EI_SELF).
 *
 * Pour chaque participant :
 *  1. lien AGENT_COMMERCIAL → Ashley & Parker : isPrimary=true, function='Agent commercial'
 *     (l'émargement/attestation affichent le lien primaire → « Agent commercial »).
 *  2. garantit un lien EI_SELF vers une auto-entreprise à son nom (isPrimary=false) :
 *     - existe déjà (Taylor, Sophie) → juste isPrimary=false ;
 *     - sinon → crée Organization EI « Prénom NOM » (SIRET à compléter) + LegalLink EI_SELF.
 *     Sans ce lien, agefice-generator renvoie « Aucune auto-entreprise rattachée ».
 *
 * Idempotent. Usage : cd apps/web && node --import tsx --env-file=../../.env scripts/_fix-ses0101-ei-agent-commercial.ts
 */
const { prisma } = await import('@qualiof/db');

const CODE = 'SES-0101';
const ASHLEY_ID = 'a506c05c-bee9-4335-ad53-1e5346a2fb27';

const session = await prisma.trainingSession.findFirst({
  where: { code: CODE },
  include: { participants: { include: { person: { include: { legalLinks: true } } } } },
});
if (!session) throw new Error(`${CODE} introuvable`);

let createdEi = 0;
let flipped = 0;

for (const sp of session.participants) {
  const person = sp.person;
  const links = person.legalLinks;

  // 1) AGENT_COMMERCIAL → Ashley : primaire + libellé.
  const agentLink = links.find((l) => l.organizationId === ASHLEY_ID && l.role === 'AGENT_COMMERCIAL');
  if (agentLink && (!agentLink.isPrimary || agentLink.function !== 'Agent commercial')) {
    await prisma.legalLink.update({
      where: { id: agentLink.id },
      data: { isPrimary: true, function: 'Agent commercial' },
    });
    flipped++;
  }

  // 2) EI_SELF garanti (auto-entreprise perso), NON primaire.
  let eiLink = links.find((l) => l.role === 'EI_SELF');
  if (eiLink) {
    if (eiLink.isPrimary) {
      await prisma.legalLink.update({ where: { id: eiLink.id }, data: { isPrimary: false } });
      flipped++;
    }
  } else {
    // Crée l'auto-entreprise à son nom (SIRET vide → à compléter pour l'AGEFICE).
    const eiName = `${person.firstName} ${person.lastName}`.trim();
    const org = await prisma.organization.create({
      data: {
        tenantId: session.tenantId,
        legalName: eiName,
        legalForm: 'EI',
        type: 'Client',
        opcoCode: 'AGEFICE',
      },
    });
    await prisma.legalLink.create({
      data: {
        personId: person.id,
        organizationId: org.id,
        role: 'EI_SELF',
        function: 'Auto-entrepreneur',
        isPrimary: false,
      },
    });
    createdEi++;
    console.log(`  + EI créée : ${eiName} (SIRET à compléter)`);
  }
}

console.log(`\n=== ${CODE} : ${createdEi} auto-entreprises créées, ${flipped} liens ajustés ===`);

// Contrôle final.
const check = await prisma.sessionParticipant.findMany({
  where: { sessionId: session.id },
  include: { person: { include: { legalLinks: { include: { organization: { select: { legalName: true } } } } } } },
});
for (const sp of check) {
  const ll = sp.person.legalLinks;
  const primary = ll.find((l) => l.isPrimary);
  const hasEi = ll.some((l) => l.role === 'EI_SELF');
  console.log(
    `  ${sp.person.firstName} ${sp.person.lastName} — primaire: ${primary?.role ?? '∅'} (${primary?.function ?? '—'}) · EI_SELF: ${hasEi ? '✓' : '✗'}`,
  );
}
await prisma.$disconnect();
