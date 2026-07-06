/**
 * RÉCONCILIATION À BLANC (lecture seule) DB ↔ Drive pour les certificats.
 * N'écrit RIEN. Objectif : prouver qu'on a les bons chemins avant toute
 * régénération de masse.
 *
 * Pour chaque session DB (produit + participants ATTENDED/CONFIRMED), calcule
 * le chemin Drive attendu (même logique que _gen-session-pack : buildSessionPaths)
 * dans les 2 bases connues, et vérifie la présence du certificat existant.
 * Détecte aussi les dossiers apprenant ORPHELINS (présents sur disque mais ne
 * correspondant à aucun participant DB — suffixe enseigne, etc.).
 */
import fs from 'node:fs';
import path from 'node:path';

const { prisma } = await import('@qualiof/db');
const { buildSessionPaths, sanitize, formatDateFR } = await import(
  './gen-session-pack-helpers'
);

const DRIVE_ROOT =
  '/Users/laurentmarx/Library/CloudStorage/GoogleDrive-laurent@start-academy.fr/.shortcut-targets-by-id/1ov5w1JGdItymqXxMmNm7EyJpG1LZChnk/Start Academy/Process, Tableaux suivis & Documents/Formations dispensées/2025';
const BASES = [
  `${DRIVE_ROOT}/Sessions de formation 2026`,
  `${DRIVE_ROOT}/Sessions 2025 Qualiof`,
];
const CERT_FILE = 'Certificat de réalisation.pdf';

const sessions = await prisma.trainingSession.findMany({
  select: {
    id: true,
    code: true,
    startDate: true,
    product: { select: { title: true } },
    participants: {
      where: { enrollmentStatus: { in: ['ATTENDED', 'CONFIRMED'] } },
      select: { id: true, person: { select: { firstName: true, lastName: true } } },
    },
  },
  orderBy: { startDate: 'asc' },
});

type Hit = {
  participantId: string;
  who: string;
  filePath: string;
};
const matched: Hit[] = [];
const missing: { code: string; who: string }[] = [];
const sessionsNoFolder: { code: string; title: string; expected: string }[] = [];
const orphanFolders: { sessionFolder: string; folder: string }[] = [];

function findSessionDir(title: string, startDate: Date): string | null {
  const folderName = sanitize(`${title} (${formatDateFR(startDate)})`);
  for (const base of BASES) {
    const candidate = path.join(base, folderName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

for (const s of sessions) {
  if (!s.product || s.participants.length === 0) continue;
  const dir = findSessionDir(s.product.title, s.startDate);
  if (!dir) {
    sessionsNoFolder.push({
      code: s.code,
      title: s.product.title,
      expected: sanitize(`${s.product.title} (${formatDateFR(s.startDate)})`),
    });
    continue;
  }
  const expectedLearnerDirs = new Set<string>();
  for (const part of s.participants) {
    const who = sanitize(`${part.person.firstName} ${part.person.lastName}`);
    expectedLearnerDirs.add(who);
    const certPath = path.join(dir, who, CERT_FILE);
    if (fs.existsSync(certPath)) {
      matched.push({ participantId: part.id, who, filePath: certPath });
    } else {
      missing.push({ code: s.code, who });
    }
  }
  // Dossiers apprenant présents sur disque mais hors DB (suffixe enseigne, etc.)
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (expectedLearnerDirs.has(entry.name)) continue;
    // n'a un sens que s'il contient bien un certificat
    if (fs.existsSync(path.join(dir, entry.name, CERT_FILE))) {
      orphanFolders.push({ sessionFolder: path.basename(dir), folder: entry.name });
    }
  }
}

// Compte total de fichiers certificat réellement présents sur disque (vérité terrain)
let onDiskTotal = 0;
for (const base of BASES) {
  if (!fs.existsSync(base)) continue;
  for (const sessDir of fs.readdirSync(base, { withFileTypes: true })) {
    if (!sessDir.isDirectory()) continue;
    const full = path.join(base, sessDir.name);
    for (const learner of fs.readdirSync(full, { withFileTypes: true })) {
      if (!learner.isDirectory()) continue;
      if (fs.existsSync(path.join(full, learner.name, CERT_FILE))) onDiskTotal++;
    }
  }
}

console.log('\n══════ RÉCONCILIATION CERTIFICATS DB ↔ DRIVE (lecture seule) ══════\n');
console.log(`Sessions DB analysées (avec produit + participants) : ${sessions.filter((s) => s.product && s.participants.length).length}`);
console.log(`Certificats présents sur disque (vérité terrain)    : ${onDiskTotal}`);
console.log(`✓ MATCHÉS (DB participant ↔ fichier existant)        : ${matched.length}`);
console.log(`⚠ MANQUANTS (participant DB sans fichier au chemin)  : ${missing.length}`);
console.log(`⚠ Sessions DB sans dossier Drive trouvé              : ${sessionsNoFolder.length}`);
console.log(`⚠ Dossiers ORPHELINS (fichier sur disque hors DB)    : ${orphanFolders.length}`);

if (orphanFolders.length) {
  console.log('\n— ORPHELINS (suffixe enseigne / nom divergent → NE seraient PAS écrasés par rebuild) —');
  for (const o of orphanFolders.slice(0, 40)) {
    console.log(`   • [${o.sessionFolder.slice(0, 45)}…] /${o.folder}`);
  }
  if (orphanFolders.length > 40) console.log(`   … +${orphanFolders.length - 40} autres`);
}
if (sessionsNoFolder.length) {
  console.log('\n— SESSIONS DB SANS DOSSIER DRIVE (chemin attendu introuvable) —');
  for (const s of sessionsNoFolder.slice(0, 30)) {
    console.log(`   • ${s.code} → attendu « ${s.expected} »`);
  }
  if (sessionsNoFolder.length > 30) console.log(`   … +${sessionsNoFolder.length - 30} autres`);
}
if (missing.length) {
  console.log('\n— PARTICIPANTS DB SANS CERTIFICAT AU CHEMIN ATTENDU (échantillon) —');
  for (const m of missing.slice(0, 20)) console.log(`   • ${m.code} / ${m.who}`);
  if (missing.length > 20) console.log(`   … +${missing.length - 20} autres`);
}

// Export du plan matché (servira au remplacement ciblé, écrase EXACTEMENT ces chemins)
fs.writeFileSync(
  '/tmp/certificats-match-plan.json',
  JSON.stringify(matched, null, 2),
  'utf8',
);
console.log(`\nPlan de remplacement (matchés) écrit : /tmp/certificats-match-plan.json (${matched.length} entrées)`);
console.log('\nAUCUNE écriture effectuée. Réconciliation seule.\n');

await prisma.$disconnect();
