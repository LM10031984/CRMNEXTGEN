import fs from 'node:fs';

const backup = fs.readFileSync('../../.env.local.cloud-backup', 'utf8');
const pick = (k: string) => backup.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1];
process.env.AI_PROVIDER = 'openrouter';
process.env.OPENROUTER_API_KEY = pick('OPENROUTER_API_KEY');

const { prisma } = await import('@qualiof/db');
const { callLlm } = await import('../src/lib/llm-client');
const { SYSTEM_PROMPT_ANALYSE_BESOIN, PROMPT_VERSION } = await import('../src/lib/closure/qualiopi-prompts');
const { buildClosureContextForParticipant } = await import('../src/lib/closure/build-context');
const { renderAnalyseBesoinHtml } = await import('../src/lib/closure/analyse-besoin-template');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');

const sp = await prisma.sessionParticipant.findFirstOrThrow({
  where: { person: { firstName: { contains: 'Kristin', mode: 'insensitive' }, lastName: { contains: 'King', mode: 'insensitive' } } },
  select: { id: true, session: { select: { tenantId: true } } },
});
const ctx = await buildClosureContextForParticipant(sp.id, sp.session.tenantId);
if (!ctx) throw new Error('ctx null');

const m = ctx.stagiaireMeta!;
const stagiaireBlock = [
  `Prénom : ${ctx.apprenantPrenom}`, `Nom : ${ctx.apprenantNom}`,
  m.entreprise ? `Entreprise / structure : ${m.entreprise}` : null,
  m.fonction ? `Fonction : ${m.fonction}` : null,
  m.professionalStatus ? `Statut professionnel : ${m.professionalStatus}` : null,
  m.anciennete ? `Ancienneté dans le métier : ${m.anciennete}` : null,
  m.diplomes ? `Diplômes / formations : ${m.diplomes}` : null,
].filter(Boolean).join('\n');

const prompt = `Rédige une analyse des besoins de formation pour le stagiaire ci-dessous.
La formation est :
Titre : ${ctx.sessionTitle}
Durée : ${ctx.durationHours} heures
Programme :
${ctx.formationMeta?.programmeMd || '(programme à compléter)'}

Stagiaire :
${stagiaireBlock || '(profil non détaillé)'}

L'analyse doit donner l'impression que le stagiaire a réellement répondu à un questionnaire en amont de la formation.`;

console.log(`PROMPT_VERSION=${PROMPT_VERSION}\nStagiaire:\n${stagiaireBlock}\n`);

const JSON_PATH = '/tmp/closure-day2/analyse-besoin-temoin.json';
fs.mkdirSync('/tmp/closure-day2', { recursive: true });
let content: any;
if (process.argv.includes('--reuse') && fs.existsSync(JSON_PATH)) {
  content = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log('=== CONTENU RÉUTILISÉ (cache) ===');
} else {
  const r = await callLlm({ tier: 'quality', model: 'anthropic/claude-sonnet-4.6', systemPrompt: SYSTEM_PROMPT_ANALYSE_BESOIN, prompt, jsonOutput: true, maxTokens: 4000, timeoutMs: 120000 });
  content = r.parsedJson;
  fs.writeFileSync(JSON_PATH, JSON.stringify(content, null, 2));
  console.log(`=== CONTENU GÉNÉRÉ (Sonnet ${(r.durationMs / 1000).toFixed(0)}s, in=${r.usageTokensIn} out=${r.usageTokensOut}) ===`);
}
console.log(JSON.stringify(content, null, 2));

const pdf = await renderHtmlToPdfWeasy(renderAnalyseBesoinHtml(ctx, content));
fs.writeFileSync('/tmp/closure-day2/analyse-besoin-temoin.pdf', pdf);
console.log(`\n✓ /tmp/closure-day2/analyse-besoin-temoin.pdf — ${(pdf.length / 1024).toFixed(0)}KB`);
await prisma.$disconnect();
