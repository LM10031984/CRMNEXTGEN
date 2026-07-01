// Complète le pack SES-0032 : déroulé SESSION (Sonnet, signé), grille obs session
// (Sonnet, genre), programme (méthode péda ind.12). Cœurs sans auth.
import fs from 'node:fs';
const backup = fs.readFileSync('../../.env.local.cloud-backup', 'utf8');
const pick = (k: string) => backup.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1];
process.env.AI_PROVIDER = 'openrouter';
process.env.OPENROUTER_API_KEY = pick('OPENROUTER_API_KEY');

const { prisma } = await import('@qualiof/db');
const { buildClosureContextForParticipant } = await import('../src/lib/closure/build-context');
const { generateDerouleContent, generateGrilleSessionContent } = await import('../src/lib/closure/ollama-generators');
const { renderDerouleHtml } = await import('../src/lib/closure/deroule-template');
const { renderGrilleObsSessionHtml } = await import('../src/lib/closure/grille-obs-session-template');
const { loadTrainerSignatureDataUrl } = await import('../src/lib/closure/shared-template');
const { renderProgrammeHtml } = await import('../src/lib/programme-template');
const { loadOfConfig } = await import('../src/lib/of-config');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');

const OUT = '/tmp/closure-day2/pack-SES0032';
fs.mkdirSync(OUT, { recursive: true });

const session = await prisma.trainingSession.findFirstOrThrow({
  where: { code: 'SES-0032' },
  include: {
    location: true,
    product: true,
    trainers: { include: { person: true } },
    participants: {
      where: { enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] } },
      include: { person: { include: { legalLinks: { where: { role: { in: ['EI_SELF', 'AGENT_COMMERCIAL', 'DIRIGEANT', 'SALARIE'] } }, orderBy: [{ isPrimary: 'desc' }], take: 1 } } } },
    },
  },
});
const tenantId = session.tenantId;
console.log(`SES-0032 — produit ${session.product.code} (${session.product.durationHours}h), formateurs: ${session.trainers.map(t => `${t.person.firstName} ${t.person.lastName}`).join(', ') || '(aucun)'}`);
const firstP = session.participants[0]!;

// ---------- 1) DÉROULÉ SESSION (Sonnet, signature formateur) ----------
const ctx = await buildClosureContextForParticipant(firstP.id, tenantId);
if (!ctx) throw new Error('ctx null');
const formation = { titre: ctx.sessionTitle, programmeMd: ctx.formationMeta?.programmeMd ?? '', nombreHeures: ctx.durationHours };
const deroule = await generateDerouleContent(formation, 'PedagogicalAsset', null, tenantId);
if (deroule) {
  const html = renderDerouleHtml(ctx, deroule);
  fs.writeFileSync(`${OUT}/DEROULE_SESSION.pdf`, await renderHtmlToPdfWeasy(html));
  const nbSeq = deroule.jours.reduce((n, j) => n + j.sequences.length, 0);
  console.log(`✓ DEROULE_SESSION.pdf — ${deroule.jours.length}j/${nbSeq}séq, formateur ctx=${ctx.sessionTrainers[0]?.prenom ?? '—'} ${ctx.sessionTrainers[0]?.nom ?? ''}`);
} else console.log('✗ déroulé: contenu null (LLM échoué)');

// ---------- 2) GRILLE OBS SESSION (Sonnet, genre par stagiaire) ----------
const stagiairesForAi = session.participants.map((p) => ({
  participantId: p.id, prenom: p.person.firstName, nom: p.person.lastName,
  fonction: p.person.legalLinks[0]?.function ?? null, professionalStatus: p.person.professionalStatus, civilite: p.person.civility ?? null,
}));
const grille = await generateGrilleSessionContent(formation, stagiairesForAi, 'Document', null, tenantId);
if (grille) {
  const formateurs = session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`.trim());
  const data = {
    formationTitre: session.product.title, sessionStartDate: session.startDate, sessionEndDate: session.endDate,
    formateurs,
    stagiaires: session.participants.map((p) => ({ participantId: p.id, prenom: p.person.firstName, nom: p.person.lastName })),
    content: grille,
    signatureDataUrl: loadTrainerSignatureDataUrl(tenantId, formateurs[0]) || undefined,
  };
  fs.writeFileSync(`${OUT}/GRILLE_SESSION.pdf`, await renderHtmlToPdfWeasy(renderGrilleObsSessionHtml(data)));
  console.log(`✓ GRILLE_SESSION.pdf — ${grille.competences.length} compétences, ${grille.observations.length} obs`);
} else console.log('✗ grille session: contenu null (LLM échoué)');

// ---------- 3) PROGRAMME (méthode péda ind.12) ----------
const of = await loadOfConfig(tenantId);
const p = session.product;
const lieu = session.location ? `${session.location.name}${(session.location.address as any)?.city ? ` — ${(session.location.address as any).city}` : ''}` : null;
const progData: any = {
  apprenantPrenom: firstP.person.firstName, apprenantNom: firstP.person.lastName, apprenantEmail: firstP.person.email,
  sessionCode: session.code, sessionName: session.name ?? p.title, sessionStartDate: session.startDate, sessionEndDate: session.endDate,
  sessionLieu: lieu, sessionModalite: session.modality, sessionFormateurs: session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`),
  produitTitre: p.title, produitCode: p.code, produitDureeHeures: p.durationHours, produitPriceHT: Number(p.priceHT),
  produitObjectifs: Array.isArray(p.objectives) ? (p.objectives as string[]) : [], produitProgrammeMd: p.programMd ?? '',
  produitPrerequisites: p.prerequisites, produitTargetAudience: p.targetAudience, produitPedagogicalMethods: p.pedagogicalMethods,
  produitEvaluationMethods: p.evaluationMethods, produitAccessibility: p.accessibility, produitAccessConditions: p.accessConditions,
  produitTrainerProfile: p.trainerProfile, produitPedagogicalSupport: p.pedagogicalSupport,
  ofName: of.name, ofSiret: of.siret, ofAddress: of.addressFull, ofRnq: of.rnq, ofPhone: of.phone, ofEmail: of.email, tenantId,
};
const progHtml = renderProgrammeHtml(progData, of);
fs.writeFileSync(`${OUT}/PROGRAMME.pdf`, await renderHtmlToPdfWeasy(progHtml));
const hasAlternance = /alternance/i.test(progHtml);
const hasTourDeTable = /tour de table|tours de table/i.test(progHtml);
console.log(`✓ PROGRAMME.pdf — méthode péda ind.12 : alternance=${hasAlternance} tours_de_table=${hasTourDeTable}`);

console.log(`\nPack complet → ${OUT} (${fs.readdirSync(OUT).length} PDF)`);
await prisma.$disconnect();
