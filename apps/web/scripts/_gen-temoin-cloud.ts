// Génération TÉMOIN cloud (Claude Sonnet/Haiku) d'une session complète, arbo nichée.
// Usage : SES=SES-0087 tsx scripts/_gen-temoin-cloud.ts
// - Provider forcé sur openrouter (clé depuis .env.local.cloud-backup)
// - Rendu PDF direct dans dossiers /tmp (PAS de persistance DB/MinIO pour le témoin)
// - Défensif : chaque doc en try/catch, on continue si l'un échoue.
import fs from 'node:fs';
import path from 'node:path';

// 1) Provider cloud AVANT tout import qui appelle le LLM
const backupPath = path.resolve(process.cwd(), '../../.env.local.cloud-backup');
const backup = fs.readFileSync(backupPath, 'utf8');
const pick = (k: string) => backup.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1];
process.env.AI_PROVIDER = 'openrouter';
process.env.OPENROUTER_API_KEY = pick('OPENROUTER_API_KEY')!;
process.env.OPENROUTER_MODEL_FAST = pick('OPENROUTER_MODEL_FAST') ?? 'anthropic/claude-haiku-4.5';
process.env.OPENROUTER_MODEL_QUALITY = pick('OPENROUTER_MODEL_QUALITY') ?? 'anthropic/claude-sonnet-4.6';

const SES = process.env.SES ?? 'SES-0087';

const { prisma } = await import('@qualiof/db');
const { buildClosureContextForParticipant } = await import('../src/lib/closure/build-context');
const { renderClosureDoc } = await import('../src/lib/closure/renderer');
const { renderProgrammeHtml } = await import('../src/lib/programme-template');
const { renderConventionHtml } = await import('../src/lib/convention-template');
const { renderChecklistFormationHtml } = await import('../src/lib/closure/checklist-formation-template');
const { generateDerouleContent } = await import('../src/lib/closure/ollama-generators');
const { renderDerouleHtml } = await import('../src/lib/closure/deroule-template');
const { loadOfConfig } = await import('../src/lib/of-config');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');

// noms de fichiers FR par kind closure
const KIND_FR: Record<string, string> = {
  ANALYSE_BESOIN: 'Analyse de besoin',
  POSITIONNEMENT: 'Positionnement',
  QCM: 'QCM',
  GRILLE_OBS: "Grille d'observation",
  ATTESTATION: 'Attestation de fin de formation',
  CERTIFICAT: 'Certificat de réalisation',
  EMARGEMENT: 'Émargement',
  SATISFACTION_CHAUD: 'Satisfaction à chaud',
  SATISFACTION_FROID: 'Satisfaction à froid',
};
// docs per-participant (DEROULE_PEDA exclu = doc session)
const PART_KINDS = [
  'ANALYSE_BESOIN', 'POSITIONNEMENT', 'QCM', 'GRILLE_OBS',
  'ATTESTATION', 'CERTIFICAT', 'EMARGEMENT', 'SATISFACTION_CHAUD', 'SATISFACTION_FROID',
] as const;

const sanitize = (s: string) => s.replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

const session = await prisma.trainingSession.findFirstOrThrow({
  where: { code: SES },
  include: {
    location: true,
    product: true,
    trainers: { include: { person: true } },
    participants: {
      where: { enrollmentStatus: { in: ['PRE_ENROLLED', 'CONFIRMED', 'ATTENDED'] } },
      include: {
        sponsorOrg: true,
        person: { include: { legalLinks: { include: { organization: true } } } },
      },
    },
  },
});

const of = await loadOfConfig(session.tenantId);
const p = session.product;
const parts = session.participants;
const dateStr = session.startDate.toISOString().slice(0, 10);
const ROOT = `/tmp/qualiof-gen/${sanitize(`${session.code} - ${p.title} - ${dateStr}`)}`;
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

const lieu = session.location
  ? `${session.location.name}${(session.location.address as any)?.city ? ` — ${(session.location.address as any).city}` : ''}`
  : null;
const formateurs = session.trainers.map((t) => `${t.person.firstName} ${t.person.lastName}`.trim());

console.log(`\n=== TÉMOIN ${session.code} — ${p.title} (${p.durationHours}h) ===`);
console.log(`Formateur(s) : ${formateurs.join(', ') || '(aucun)'} | Apprenants : ${parts.length} | Provider : ${process.env.AI_PROVIDER}`);
console.log(`Sortie : ${ROOT}\n`);

let ok = 0, ko = 0, stub = 0;
const log = (icon: string, msg: string) => console.log(`  ${icon} ${msg}`);
async function write(file: string, buf: Buffer | Uint8Array) {
  fs.writeFileSync(file, buf);
}

const firstP = parts[0]!;

// ---------- SOURCE PROGRAMME UNIQUE (Laurent 2026-06-18) ----------
// On normalise UNE FOIS le programme (grille horaire figée + verbes évaluables)
// et on l'utilise À LA FOIS pour Programme.pdf ET Convention.pdf (plus de
// divergence). Fallback sur le programMd brut si le LLM échoue.
const { generateNormalizedProgramme } = await import('../src/lib/closure/ollama-generators');
const normalizedProgrammeMd =
  (await generateNormalizedProgramme(
    p.programMd ?? '',
    Array.isArray(p.objectives) ? (p.objectives as string[]) : [],
    p.durationHours,
    p.title,
    session.tenantId,
  )) ?? (p.programMd ?? '');
log(
  normalizedProgrammeMd === (p.programMd ?? '') ? '⚠' : '✓',
  normalizedProgrammeMd === (p.programMd ?? '')
    ? 'Programme normalisé : fallback brut (LLM null)'
    : 'Programme normalisé (source unique Programme + Convention)',
);

// ---------- DOCS SESSION (racine) ----------
// 1) Programme
try {
  const progData: any = {
    apprenantPrenom: firstP.person.firstName, apprenantNom: firstP.person.lastName, apprenantEmail: firstP.person.email,
    sessionCode: session.code, sessionName: session.name ?? p.title, sessionStartDate: session.startDate, sessionEndDate: session.endDate,
    sessionLieu: lieu, sessionModalite: session.modality, sessionFormateurs: formateurs,
    produitTitre: p.title, produitCode: p.code, produitDureeHeures: p.durationHours, produitPriceHT: Number(p.priceHT),
    produitObjectifs: Array.isArray(p.objectives) ? (p.objectives as string[]) : [], produitProgrammeMd: normalizedProgrammeMd,
    produitPrerequisites: p.prerequisites, produitTargetAudience: p.targetAudience, produitPedagogicalMethods: p.pedagogicalMethods,
    produitEvaluationMethods: p.evaluationMethods, produitAccessibility: p.accessibility, produitAccessConditions: p.accessConditions,
    produitTrainerProfile: p.trainerProfile, produitPedagogicalSupport: p.pedagogicalSupport,
    ofName: of.name, ofSiret: of.siret, ofAddress: of.addressFull, ofRnq: of.rnq, ofPhone: of.phone, ofEmail: of.email, tenantId: session.tenantId,
  };
  await write(`${ROOT}/Programme.pdf`, await renderHtmlToPdfWeasy(renderProgrammeHtml(progData, of)));
  ok++; log('✓', 'Programme.pdf');
} catch (e: any) { ko++; log('✗', `Programme — ${e?.message ?? e}`); }

// 2) Déroulé pédagogique (Sonnet, avec rapport formateur)
try {
  const formation = { titre: p.title, programmeMd: p.programMd ?? '', nombreHeures: p.durationHours };
  const deroule = await generateDerouleContent(formation as any, 'PedagogicalAsset', null, session.tenantId);
  if (!deroule) throw new Error('contenu null (LLM)');
  const ctx = await buildClosureContextForParticipant(firstP.id, session.tenantId);
  await write(`${ROOT}/Déroulé pédagogique.pdf`, await renderHtmlToPdfWeasy(renderDerouleHtml(ctx as any, deroule)));
  const nbSeq = deroule.jours.reduce((n: number, j: any) => n + j.sequences.length, 0);
  ok++; log('✓', `Déroulé pédagogique.pdf — ${deroule.jours.length}j / ${nbSeq} séq`);
} catch (e: any) { ko++; log('✗', `Déroulé — ${e?.message ?? e}`); }

// 3) Checklist de préparation (auto-cochée si session passée)
try {
  const addr = session.location?.address as any;
  const cityLine = [addr?.postalCode, addr?.city].filter(Boolean).join(' ');
  const lieuFormation = session.location
    ? (addr?.street ? [addr.street, cityLine].filter(Boolean).join(', ') : `${session.location.name}${addr?.city ? ` — ${addr.city}` : ''}`)
    : 'À renseigner';
  const isPast = session.endDate.getTime() < Date.now();
  const horsDept06 = !String(addr?.postalCode ?? '').startsWith('06');
  const checklistData: any = {
    formationTitre: p.title, sessionCode: session.code, sessionStartDate: session.startDate, sessionEndDate: session.endDate,
    formateurs, lieuFormation, isPast, horsDept06,
    trainerLodgingReserved: horsDept06 || session.needsTrainerLodging, trainerLodgingPlace: session.trainerLodgingPlace, trainerLodgingDates: session.trainerLodgingDates,
    hasDisabledLearner: session.hasDisabledLearner, disabilityAdaptations: session.disabilityAdaptations,
    apportee: { deroulePedagogique: isPast, emargement: isPast, positionnement: isPast, satisfaction: isPast, livretSupport: isPast, cleUsb: isPast, pc: isPast, videoprojecteur: isPast },
    conditionsLieu: { salleAdaptee: isPast, paperboard: isPast, espacePause: isPast, espaceRepas: isPast, connexionInternet: isPast, prisesElectriques: isPast },
  };
  await write(`${ROOT}/Checklist de préparation.pdf`, await renderHtmlToPdfWeasy(renderChecklistFormationHtml(checklistData)));
  ok++; log('✓', 'Checklist de préparation.pdf');
} catch (e: any) { ko++; log('✗', `Checklist — ${e?.message ?? e}`); }

// ---------- DOCS PAR APPRENANT ----------
for (const part of parts) {
  const who = sanitize(`${part.person.firstName} ${part.person.lastName}`);
  const dir = `${ROOT}/${who}`;
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n  — ${who} —`);

  // Convention
  try {
    if (!part.sponsorOrg) throw new Error('pas de sponsorOrg (commanditaire) sur l\'inscription');
    const link = part.person.legalLinks.find((l: any) => l.organizationId === part.sponsorOrgId);
    const isSelf = link?.role === 'EI_SELF';
    const repr = isSelf
      ? `${part.person.firstName} ${part.person.lastName.toUpperCase()}`.trim()
      : (part.sponsorOrg.representative?.trim() || `${part.person.firstName} ${part.person.lastName.toUpperCase()}`.trim());
    const effPrice = Number(part.priceHT) > 0 ? Number(part.priceHT) : Number(p.priceHT);
    const orgAddr = part.sponsorOrg.address as any;
    const convData: any = {
      beneficiaireRaisonSociale: part.sponsorOrg.legalName ?? part.sponsorOrg.name,
      beneficiaireSiret: part.sponsorOrg.siret ?? null,
      beneficiaireRcsVille: orgAddr?.city ?? null,
      beneficiaireRepresentantNom: repr,
      stagiaires: [{ prenom: part.person.firstName, nom: part.person.lastName, email: part.person.email }],
      sessionStartDate: session.startDate, sessionEndDate: session.endDate, sessionLieu: lieu ?? of.addressFull,
      produitTitre: session.name ?? p.title, produitDureeHeures: p.durationHours,
      produitObjectifs: Array.isArray(p.objectives) ? (p.objectives as string[]) : [],
      produitProgrammeMd: normalizedProgrammeMd, produitTrainerProfile: p.trainerProfile,
      produitPriceHTPerStagiaire: effPrice, tenantId: session.tenantId,
    };
    await write(`${dir}/Convention de formation.pdf`, await renderHtmlToPdfWeasy(renderConventionHtml(convData, of)));
    ok++; log('✓', 'Convention de formation.pdf');
  } catch (e: any) { ko++; log('✗', `Convention — ${e?.message ?? e}`); }

  // Pack closure (9 docs)
  const ctx = await buildClosureContextForParticipant(part.id, session.tenantId);
  if (!ctx) { ko += PART_KINDS.length; log('✗', 'contexte closure null → 9 docs sautés'); continue; }
  for (const kind of PART_KINDS) {
    try {
      const res: any = await renderClosureDoc(kind as any, ctx as any);
      await write(`${dir}/${KIND_FR[kind]}.pdf`, res.pdfBuffer);
      if (res.usedStub) { stub++; log('⚠', `${KIND_FR[kind]}.pdf — STUB (LLM échoué)`); } else { ok++; log('✓', `${KIND_FR[kind]}.pdf`); }
    } catch (e: any) { ko++; log('✗', `${KIND_FR[kind]} — ${e?.message ?? e}`); }
  }
}

console.log(`\n=== Terminé : ${ok} OK, ${stub} stub, ${ko} échec ===`);
console.log(`Arbo : ${ROOT}`);
await prisma.$disconnect();
