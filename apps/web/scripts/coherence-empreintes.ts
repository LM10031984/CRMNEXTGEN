/**
 * Compteur de décrue des documents NON VÉRIFIABLES (lot 0 · 0.2).
 *
 * L'empreinte des données d'entrée (`Document.sourceFingerprint`) ne se pose
 * qu'à la GÉNÉRATION. Tout ce qui a été produit avant le 02/09/2026 reste donc
 * « inconnu » : ni périmé, ni à jour. Ce stock ne peut que décroître, au rythme
 * des régénérations — et c'est ce rythme que ce script mesure.
 *
 * LECTURE SEULE. Aucune écriture, aucune régénération : il compte, il ne
 * corrige pas. La correction passe par /coherence-docs, qui arbitre au cas par
 * cas (un document engagé ne se régénère pas pour faire baisser un compteur).
 *
 *   pnpm --filter @qualiof/web docs:empreintes
 *   DEPUIS=2026-01-01 pnpm --filter @qualiof/web docs:empreintes
 */

import { prisma } from '@qualiof/db';
import { FINGERPRINTED_DOC_TYPES } from '../src/lib/docs/source-fingerprint';

const DEPUIS = process.env.DEPUIS ? new Date(process.env.DEPUIS) : null;

const fmtDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });

function barre(pct: number, largeur = 24): string {
  const plein = Math.round((pct / 100) * largeur);
  return '█'.repeat(plein) + '░'.repeat(largeur - plein);
}

async function main() {
  if (DEPUIS && Number.isNaN(DEPUIS.getTime())) {
    throw new Error(`DEPUIS invalide : ${process.env.DEPUIS} (attendu AAAA-MM-JJ)`);
  }

  const where = {
    type: { in: [...FINGERPRINTED_DOC_TYPES] as never },
    ...(DEPUIS ? { createdAt: { gte: DEPUIS } } : {}),
  };

  const documents = await prisma.document.findMany({
    where,
    select: { type: true, sourceFingerprint: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  if (documents.length === 0) {
    console.log('Aucun document des types couverts par l’empreinte.');
    return;
  }

  const parType = new Map<string, { total: number; avec: number; plusVieuxSans: Date | null }>();
  for (const d of documents) {
    const e = parType.get(d.type) ?? { total: 0, avec: 0, plusVieuxSans: null };
    e.total++;
    if (d.sourceFingerprint) e.avec++;
    else if (!e.plusVieuxSans) e.plusVieuxSans = d.createdAt;
    parType.set(d.type, e);
  }

  const total = documents.length;
  const avec = documents.filter((d) => d.sourceFingerprint).length;
  const sans = total - avec;
  const pct = Math.round((avec / total) * 100);

  console.log('');
  console.log('Décrue des documents non vérifiables — lot 0 · 0.2');
  if (DEPUIS) console.log(`Périmètre : documents créés depuis le ${fmtDate.format(DEPUIS)}`);
  console.log('');
  console.log(`  ${barre(pct)}  ${pct}% vérifiables`);
  console.log(`  ${avec} document(s) avec empreinte · ${sans} restant(s) sans`);
  console.log('');
  console.log('  Type                        avec / total    plus ancien sans empreinte');
  console.log('  ─────────────────────────────────────────────────────────────────────');

  for (const type of FINGERPRINTED_DOC_TYPES) {
    const e = parType.get(type);
    if (!e) continue;
    const ligne = `${type}`.padEnd(26);
    const ratio = `${e.avec} / ${e.total}`.padStart(11);
    const vieux = e.plusVieuxSans ? fmtDate.format(e.plusVieuxSans) : '—';
    console.log(`  ${ligne}${ratio}    ${vieux}`);
  }

  console.log('');
  if (sans === 0) {
    console.log('  Stock épuisé : tous les documents des types couverts sont vérifiables.');
  } else {
    console.log(
      `  Relancer après une campagne de régénération : le nombre de « restant(s) sans »\n  doit baisser. S'il ne bouge pas, la régénération ne passe pas par un chemin\n  qui pose l'empreinte — le vérifier avant de conclure.`,
    );
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
