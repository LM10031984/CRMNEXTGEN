/**
 * Phase A — Extraction des 159 DOCX programmes Drive en JSON propre.
 *
 * Pour chaque DOCX :
 *  1. Convertit DOCX → texte via `textutil` (utilitaire natif macOS)
 *  2. Parse les sections Qualiopi (Objectifs, Public, Durée, Contenu, etc.)
 *  3. Classifie par thème (IA, Prospection, Vendeur, Acheteur, Négociation, ...)
 *  4. Détecte la durée en heures (ex: "72h", "16h00", "8 heures")
 *
 * Sortie : apps/web/data/programme-examples.json
 *
 * Utilisé ensuite par le générateur Ollama pour faire du few-shot prompting :
 *   - Sélection dynamique de 2-3 exemples similaires au thème demandé
 *   - Injection dans le prompt système pour guider Ollama
 *
 * Usage : cd apps/web && npx tsx scripts/extract-programme-examples.ts
 */

import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const DRIVE_ROOT =
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/.shortcut-targets-by-id/1ov5w1JGdItymqXxMmNm7EyJpG1LZChnk/Start Academy/Formations et programmes';

const OUTPUT = '/Users/laurentmarx/Documents/CRM Next gen/files/apps/web/data/programme-examples.json';

interface ProgrammeExample {
  /** Identifiant stable (slug du nom de fichier) */
  id: string;
  /** Titre lu depuis le contenu */
  title: string;
  /** Nom du dossier parent (donne le n° du programme : 026, 057, etc.) */
  folder: string;
  /** Chemin source pour traçabilité */
  sourcePath: string;
  /** Durée en heures détectée (ou null) */
  hoursDuration: number | null;
  /** Thème principal classifié */
  theme: string;
  /** Markdown complet (~2-3 KB par programme) */
  markdown: string;
  /** Sections parsées séparément (pour usage ciblé dans le prompt) */
  sections: {
    objectives: string | null;
    targetAudience: string | null;
    prerequisites: string | null;
    duration: string | null;
    pedagogicalMethods: string | null;
    detailedContent: string | null;
    trainerProfile: string | null;
    evaluationMethods: string | null;
    accessibility: string | null;
    tariff: string | null;
  };
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function listDocx(root: string, maxDepth = 3, depth = 0): { path: string; folder: string }[] {
  if (depth > maxDepth) return [];
  const out: { path: string; folder: string }[] = [];
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = join(root, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...listDocx(full, maxDepth, depth + 1));
    } else if (stat.isFile() && /\.docx$/i.test(name)) {
      // Skip les conventions (on veut juste les PROGRAMMES)
      if (/c2\.i06_convention/i.test(name)) continue;
      out.push({ path: full, folder: root.split('/').pop() ?? '' });
    }
  }
  return out;
}

function docxToText(path: string): string {
  const tmp = join(tmpdir(), `programme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  try {
    execSync(`textutil -convert txt "${path}" -output "${tmp}"`, { stdio: 'pipe' });
    const fs = require('node:fs');
    const text = fs.readFileSync(tmp, 'utf8');
    fs.unlinkSync(tmp);
    return text;
  } catch (e) {
    return '';
  }
}

/** Section markers — repérés sur l'échantillon "Génération de leads" + variations */
const SECTION_MARKERS: { key: keyof ProgrammeExample['sections']; patterns: RegExp[] }[] = [
  {
    key: 'objectives',
    patterns: [/(?:^|\n)\s*(?:LES\s+)?OBJECTIFS\s+P[ÉE]DAGOGIQUES/i, /(?:^|\n)\s*OBJECTIFS\b/i],
  },
  { key: 'targetAudience', patterns: [/(?:^|\n)\s*PUBLIC\s+VIS[ÉE]/i, /(?:^|\n)\s*PUBLIC\b/i] },
  {
    key: 'prerequisites',
    patterns: [/(?:^|\n)\s*NIVEAU\s+DE\s+CONNAISSANCES/i, /(?:^|\n)\s*PR[ÉE]REQUIS/i],
  },
  {
    key: 'duration',
    patterns: [/(?:^|\n)\s*(?:LA\s+)?DUR[ÉE]E\s+DE\s+FORMATION/i, /(?:^|\n)\s*DUR[ÉE]E\b/i],
  },
  {
    key: 'pedagogicalMethods',
    patterns: [
      /(?:^|\n)\s*(?:LES\s+)?MOYENS\s+P[ÉE]DAGOGIQUES/i,
      /(?:^|\n)\s*M[ÉE]THODES\s+P[ÉE]DAGOGIQUES/i,
    ],
  },
  {
    key: 'detailedContent',
    patterns: [/(?:^|\n)\s*CONTENU\s+D[ÉE]TAILL[ÉE]/i, /(?:^|\n)\s*PROGRAMME\s+D[ÉE]TAILL[ÉE]/i],
  },
  {
    key: 'trainerProfile',
    patterns: [
      /(?:^|\n)\s*(?:L'?)?ENCADREMENT/i,
      /(?:^|\n)\s*PROFIL\s+(?:DU|DES)\s+FORMATEUR/i,
    ],
  },
  {
    key: 'evaluationMethods',
    patterns: [/(?:^|\n)\s*(?:LES\s+)?MOYENS\s+D'?[ÉE]VALUATION/i, /(?:^|\n)\s*[ÉE]VALUATION\b/i],
  },
  {
    key: 'accessibility',
    patterns: [
      /(?:^|\n)\s*ACCESSIBILIT[ÉE]\s+AUX\s+PERSONNES/i,
      /(?:^|\n)\s*PSH\b/i,
      /(?:^|\n)\s*HANDICAP\b/i,
    ],
  },
  { key: 'tariff', patterns: [/(?:^|\n)\s*TARIF\b/i, /(?:^|\n)\s*PRIX\b/i] },
];

const ALL_PATTERNS = SECTION_MARKERS.flatMap((m) => m.patterns);

function parseSections(text: string): ProgrammeExample['sections'] {
  // Trouver toutes les positions de tous les marqueurs
  const hits: { key: keyof ProgrammeExample['sections']; start: number; end: number }[] = [];
  for (const marker of SECTION_MARKERS) {
    for (const pat of marker.patterns) {
      const re = new RegExp(pat.source, pat.flags + (pat.flags.includes('g') ? '' : 'g'));
      let m;
      while ((m = re.exec(text)) !== null) {
        const start = m.index;
        hits.push({ key: marker.key, start, end: start + m[0].length });
      }
    }
  }
  // Trier par position
  hits.sort((a, b) => a.start - b.start);

  // Pour chaque hit, extraire le contenu jusqu'au prochain marqueur (de n'importe quelle key)
  const sections: ProgrammeExample['sections'] = {
    objectives: null,
    targetAudience: null,
    prerequisites: null,
    duration: null,
    pedagogicalMethods: null,
    detailedContent: null,
    trainerProfile: null,
    evaluationMethods: null,
    accessibility: null,
    tariff: null,
  };

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    if (sections[hit.key]) continue; // déjà rempli par un marqueur précédent
    const nextStart = hits[i + 1]?.start ?? text.length;
    const content = text.slice(hit.end, nextStart).trim();
    if (content.length > 0) sections[hit.key] = content;
  }

  return sections;
}

function detectHours(text: string, fileName: string): number | null {
  // 1. Dans le nom de fichier d'abord (souvent fiable : "...- 72h" "...8h00")
  const fileMatch = fileName.match(/(\d{1,3})\s*h(?:00|eures?)?\b/i);
  if (fileMatch?.[1]) return parseInt(fileMatch[1], 10);
  // 2. Dans la section "DURÉE" du texte
  const durMatch = text.match(/\b(\d{1,3})\s*(?:h(?:eures?)?|heure)\b/i);
  if (durMatch?.[1]) return parseInt(durMatch[1], 10);
  return null;
}

function classifyTheme(title: string, content: string): string {
  const t = (title + ' ' + content.slice(0, 500)).toLowerCase();
  if (/\b(ia|intelligence artificielle|chatgpt|gpt|claude|llm|générative)\b/.test(t)) return 'IA';
  if (/\b(prospection|leads?)\b/.test(t)) return 'Prospection';
  if (/\b(vendeur|estimation|mandat)\b/.test(t)) return 'Vendeur';
  if (/\b(acheteur|acqu[ée]reur)\b/.test(t)) return 'Acheteur';
  if (/\b(n[ée]gociation|compromis|objections?)\b/.test(t)) return 'Négociation';
  if (/\b(instagram|r[ée]seau|community|digital|newsletter|seo)\b/.test(t)) return 'Digital';
  if (/\b(manager|recrutement|équipe|coaching|leadership)\b/.test(t)) return 'Management';
  if (/\b(juridique|tracfin|d[ée]ontologie|discrimination)\b/.test(t)) return 'Juridique';
  if (/\b(cadastre|technique)\b/.test(t)) return 'Technique';
  if (/\b(mental|préparation|excellence|mindset)\b/.test(t)) return 'Mindset';
  return 'Autre';
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split(/\n/)) {
    const t = line.trim();
    if (t.length > 0 && !/^c[12]\.i\d+/i.test(t)) return t;
  }
  return '';
}

function main() {
  console.log('📥 Scan des DOCX programmes...');
  const docxList = listDocx(DRIVE_ROOT);
  console.log(`   ${docxList.length} DOCX programmes trouvés\n`);

  const examples: ProgrammeExample[] = [];
  let nOk = 0;
  let nErr = 0;
  let nNoSections = 0;

  for (let i = 0; i < docxList.length; i++) {
    const { path: docxPath, folder } = docxList[i]!;
    const fileName = docxPath.split('/').pop()!;
    process.stdout.write(`\r  [${i + 1}/${docxList.length}] ${fileName.slice(0, 60).padEnd(62)}`);

    const text = docxToText(docxPath);
    if (!text || text.length < 100) {
      nErr++;
      continue;
    }

    const title = firstNonEmptyLine(text) || fileName.replace(/\.docx$/i, '');
    const sections = parseSections(text);
    const sectionsCount = Object.values(sections).filter((v) => v && v.length > 20).length;

    if (sectionsCount < 3) {
      nNoSections++;
      // On garde quand même mais on log
    }

    examples.push({
      id: slugify(fileName.replace(/\.docx$/i, '')),
      title,
      folder,
      sourcePath: docxPath,
      hoursDuration: detectHours(text, fileName),
      theme: classifyTheme(title, text),
      markdown: text.trim(),
      sections,
    });
    nOk++;
  }

  process.stdout.write('\n');
  console.log(`\n📊 Résultats :`);
  console.log(`   ${nOk} programmes extraits`);
  console.log(`   ${nErr} échecs textutil`);
  console.log(`   ${nNoSections} avec < 3 sections détectées (structure différente)`);

  // Stats par thème
  const byTheme = new Map<string, number>();
  for (const ex of examples) byTheme.set(ex.theme, (byTheme.get(ex.theme) ?? 0) + 1);
  console.log(`\n   Par thème :`);
  for (const [t, n] of [...byTheme.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${n.toString().padStart(3)}× ${t}`);
  }

  // Stats durées détectées
  const withHours = examples.filter((e) => e.hoursDuration !== null).length;
  console.log(`\n   ${withHours}/${examples.length} avec durée détectée`);

  // Écrire JSON
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(examples, null, 2), 'utf8');
  const sizeKB = Math.round(JSON.stringify(examples).length / 1024);
  console.log(`\n💾 Output : ${OUTPUT} (${sizeKB} KB)`);

  // Échantillon
  if (examples.length > 0) {
    const sample = examples.find((e) => e.theme === 'IA' && e.sections.objectives) ?? examples[0]!;
    console.log(`\n🔍 Échantillon "${sample.title.slice(0, 70)}" (${sample.theme}, ${sample.hoursDuration ?? '?'}h) :`);
    console.log(`   objectives    : ${(sample.sections.objectives ?? '').slice(0, 100)}...`);
    console.log(`   tariff        : ${(sample.sections.tariff ?? '(non parsé)').slice(0, 100)}`);
    console.log(`   detailedContent length : ${sample.sections.detailedContent?.length ?? 0}`);
  }
}

main();
