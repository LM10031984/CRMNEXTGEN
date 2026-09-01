/**
 * AGEFICE 2026-08-28 — diagnostic des lieux de formation.
 *
 * ⚠ AUCUNE écriture. 100 % SELECT.
 *
 * Motif : demande de complément AGEFICE sur une prise en charge — « Le
 * document Feuille(s) d'émargement est incomplet : raison sociale du lieu de
 * formation ». Trois mentions font foi : raison sociale, code postal, ville.
 *
 * Le script liste les lieux qui ne les portent pas, et le nombre de sessions
 * concernées : ce sont autant de sessions dont le pack de clôture sera bloqué
 * tant que le lieu n'est pas complété (décision Laurent : correction à la
 * demande, pas de reprise en masse).
 *
 *   pnpm --filter @qualiof/web exec dotenv -e ../../.env -- tsx scripts/_audit-lieux.ts
 */

import { prisma } from '@qualiof/db';
import { formatLieuFormation, mentionsLieuManquantes } from '../src/lib/locations/format-lieu';

async function main() {
  const locs = await prisma.location.findMany({
    include: { _count: { select: { sessions: true } } },
    orderBy: { name: 'asc' },
  });

  let nIncomplets = 0;
  let sessionsBloquees = 0;
  console.log(`${locs.length} lieux en base\n`);
  for (const l of locs) {
    const manquantes = mentionsLieuManquantes(l);
    if (manquantes.length === 0) continue;
    nIncomplets++;
    sessionsBloquees += l._count.sessions;
    console.log(
      `❌ ${l.name} (${l._count.sessions} session${l._count.sessions > 1 ? 's' : ''}) — manque : ${manquantes.join(', ')}`,
    );
    console.log(`   rendu actuel sur l'émargement : « ${formatLieuFormation(l, '—')} »`);
  }

  const sansLieu = await prisma.trainingSession.count({ where: { locationId: null } });
  console.log(
    `\n${locs.length - nIncomplets}/${locs.length} lieux conformes · ${sessionsBloquees} sessions à compléter avant régénération · ${sansLieu} sessions sans lieu`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
