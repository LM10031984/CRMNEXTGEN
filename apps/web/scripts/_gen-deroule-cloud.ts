import fs from 'node:fs';

const backup = fs.readFileSync('../../.env.local.cloud-backup', 'utf8');
const pick = (k: string) => backup.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1];
process.env.AI_PROVIDER = 'openrouter';
process.env.OPENROUTER_API_KEY = pick('OPENROUTER_API_KEY');

const { prisma } = await import('@qualiof/db');
const { callLlm } = await import('../src/lib/llm-client');
const { SYSTEM_PROMPT_DEROULE } = await import('../src/lib/closure/qualiopi-prompts');
const { renderProductDerouleHtml } = await import('../src/lib/closure/deroule-template');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');

// Prix approximatifs OpenRouter ($/million tokens) — à confirmer sur openrouter.ai
const PRICING: Record<string, { in: number; out: number }> = {
  'anthropic/claude-sonnet-4.6': { in: 3, out: 15 },
  'anthropic/claude-haiku-4.5': { in: 1, out: 5 },
};

const p = await prisma.trainingProduct.findFirstOrThrow({ where: { code: 'PROD-0042' } });
const nbJours = Math.max(1, Math.ceil(p.durationHours / 8));
const prompt = `Génère un déroulé pédagogique pour la formation suivante.

Titre : ${p.title}
Durée totale : ${p.durationHours} heures — ${nbJours} jours (8h/jour, 9h00–18h00)

PROGRAMME DE RÉFÉRENCE (reprendre EXACTEMENT ces blocs horaires et titres) :
${typeof p.programMd === 'string' ? p.programMd : ''}

INSTRUCTION : chaque bloc horaire devient une séquence. Détaille objectifs/contenu/outils/exercice/évaluation à partir du programme. Réponds UNIQUEMENT en JSON {"jours":[{"theme":"...","sequences":[{"duree":"","objectifs":"","contenu":"","outils":"","exercice":"","evaluation":"","isPause":false}]}]}. Pauses : isPause=true, objectifs="Pause déjeuner"/"Pause".`;

const runs = [
  { label: 'sonnet', model: 'anthropic/claude-sonnet-4.6' },
  { label: 'haiku', model: 'anthropic/claude-haiku-4.5' },
];

for (const run of runs) {
  console.log(`\n=== ${run.label.toUpperCase()} (${run.model}) ===`);
  const r = await callLlm({
    tier: 'quality',
    model: run.model,
    systemPrompt: SYSTEM_PROMPT_DEROULE,
    prompt,
    jsonOutput: true,
    maxTokens: 16000,
    timeoutMs: 180000,
  });
  const content: any = r.parsedJson;
  if (!content?.jours) {
    console.log('❌ JSON sans jours. Raw:', r.raw.slice(0, 150));
    continue;
  }
  const nbSeq = content.jours.reduce((n: number, j: any) => n + (j.sequences?.length ?? 0), 0);
  const pdf = await renderHtmlToPdfWeasy(
    renderProductDerouleHtml({ produitTitre: p.title, produitCode: p.code, produitDureeHeures: p.durationHours }, content),
  );
  fs.writeFileSync(`/tmp/closure-day2/deroule-${run.label}.pdf`, pdf);
  const tin = r.usageTokensIn ?? 0;
  const tout = r.usageTokensOut ?? 0;
  const price = PRICING[run.model]!;
  const cost = (tin / 1e6) * price.in + (tout / 1e6) * price.out;
  console.log(`✓ deroule-${run.label}.pdf — ${content.jours.length}j/${nbSeq}séq, ${(pdf.length / 1024).toFixed(0)}KB, ${(r.durationMs / 1000).toFixed(0)}s`);
  console.log(`  tokens in=${tin} out=${tout} → coût ≈ $${cost.toFixed(4)} (ce doc)`);
  const seq = content.jours[0]?.sequences?.find((s: any) => !s.isPause);
  console.log(`  ex. objectifs: ${(seq?.objectifs ?? '').slice(0, 140)}`);
  console.log(`  ex. exercice : ${(seq?.exercice ?? '').slice(0, 140)}`);
}
await prisma.$disconnect();
