/**
 * Backfill « audit » Google Calendar (Phase 14 — 14-05).
 *
 * Rétro-crée, pour TOUTES les sessions startDate >= 2025-03-01, l'ensemble des
 * événements calendrier (1 formation + 15 rappels countdown + 3 relances froid)
 * via l'orchestrateur idempotent `syncSessionCalendar`. Produit la preuve d'audit
 * Qualiopi (agenda propre + tous les rappels/convocations/froid).
 *
 * RÈGLES NON NÉGOCIABLES (leçon mémoire « génération masse ») :
 *   - SÉQUENTIEL : for...of await, JAMAIS Promise.all (les runs parallèles ont
 *     provoqué des deadlocks et des pertes de docs). Un délai entre sessions lisse
 *     la charge API Calendar (garde quota / risque 429).
 *   - try/catch PAR session : un échec n'arrête pas le run ; les sessions en échec
 *     sont listées en fin pour un rattrapage SÉQUENTIEL ciblé (SESSION_CODE=…).
 *   - IDEMPOTENT : re-run sans doublon (syncSessionCalendar fait insert/update par
 *     clé). On peut donc rejouer une seule session après un 429 sans risque.
 *
 * Invités : formateur réel TOUJOURS invité + apprenants TOUJOURS en trace. Au
 * backfill, AUCUNE notification n'est envoyée (sessions passées → sendUpdates
 * 'none' imposé par l'orchestrateur ; sessions futures → notifyLearners=false ici
 * pour ne pas spammer — le toggle réel se fait via le hook auto Plan 14-06).
 *
 * SÉCURITÉ :
 *   - DRY par défaut : log ce qui serait fait, AUCUNE écriture Google. WRITE=1 pour
 *     persister réellement (à exécuter dans l'étape humaine validée du Plan 14-05).
 *   - SESSION_CODE=SES-XXXX : limite le run à une seule session (rattrapage ciblé).
 *
 * Worker/CLI-safe : importe @qualiof/db (autorisé), load-session-ctx, sync-session.
 */

import { prisma } from '@qualiof/db';
import { loadSessionEventCtx } from '../src/lib/calendar/load-session-ctx';
import { syncSessionCalendar } from '../src/lib/calendar/sync-session';

// Tenant Start Academy (cf scripts/_align-ses0097.ts). Surchargé par TENANT_ID si fourni.
const TENANT = process.env.TENANT_ID ?? 'db191440-a144-48d1-93c1-767e6f647f2c';
const SINCE = new Date('2025-03-01');
const WRITE = process.env.WRITE === '1';
const ONLY_CODE = process.env.SESSION_CODE; // rattrapage ciblé d'une seule session
const SESSION_DELAY_MS = 200; // lissage anti-429 entre sessions (mode WRITE)

interface Recap {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: { code: string; message: string }[];
  skippedNoTrainer: string[];
}

async function main() {
  console.log(`Tenant : ${TENANT}`);
  console.log(`Périmètre : sessions startDate >= ${SINCE.toISOString().slice(0, 10)}`);
  if (ONLY_CODE) console.log(`Filtre : SESSION_CODE=${ONLY_CODE} (rattrapage ciblé)`);
  console.log(`Mode : ${WRITE ? 'WRITE (écriture réelle Google)' : 'DRY (simulation)'}\n`);

  const sessions = await prisma.trainingSession.findMany({
    where: {
      tenantId: TENANT,
      startDate: { gte: SINCE },
      ...(ONLY_CODE ? { code: ONLY_CODE } : {}),
    },
    select: { id: true, code: true, startDate: true, endDate: true },
    orderBy: { startDate: 'asc' },
  });

  console.log(`Sessions à traiter : ${sessions.length}\n`);

  const NOW = new Date();
  const recap: Recap = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: [],
    skippedNoTrainer: [],
  };

  // SÉQUENTIEL — un for...of avec await. JAMAIS Promise.all (deadlocks/pertes).
  for (const session of sessions) {
    try {
      const loaded = await loadSessionEventCtx(TENANT, session.id);
      if (!loaded) {
        recap.failed.push({ code: session.code, message: 'contexte introuvable (loadSessionEventCtx null)' });
        continue;
      }
      if (loaded.missingTrainerEmail) {
        recap.skippedNoTrainer.push(session.code);
        console.log(`  ⚠ ${session.code} : pas d'e-mail formateur → SKIP`);
        continue;
      }

      const isPastSession = (session.endDate ?? session.startDate) < NOW;

      if (!WRITE) {
        console.log(
          `  [DRY] ${session.code} | début ${session.startDate.toISOString().slice(0, 10)} | ${isPastSession ? 'passée' : 'à venir'} | formateur ${loaded.ctx.trainerEmail} | ${loaded.ctx.learnerEmails.length} apprenant(s) → 19 events`,
        );
        recap.processed += 1;
        continue;
      }

      const res = await syncSessionCalendar({
        tenantId: TENANT,
        sessionId: session.id,
        ctx: loaded.ctx,
        syncMode: 'backfill',
        isPastSession,
        // backfill : jamais de notification apprenants (toggle via hook auto 14-06).
        notifyLearners: false,
      });

      recap.inserted += res.inserted;
      recap.updated += res.updated;
      recap.skipped += res.skipped;
      recap.processed += 1;
      console.log(
        `  ✓ ${session.code} : +${res.inserted} insert / ${res.updated} update / ${res.errors.length} erreur(s)`,
      );
      if (res.errors.length > 0) {
        recap.failed.push({
          code: session.code,
          message: `${res.errors.length} event(s) en échec : ${res.errors.map((e) => e.eventKey).join(', ')}`,
        });
      }

      // Lissage charge API Calendar (anti-429) entre deux sessions, mode WRITE seul.
      await new Promise((r) => setTimeout(r, SESSION_DELAY_MS));
    } catch (err) {
      // Un échec session n'arrête PAS le run (leçon mémoire). Loggé pour rattrapage.
      const message = err instanceof Error ? err.message : String(err);
      recap.failed.push({ code: session.code, message });
      console.log(`  ✗ ${session.code} : ${message}`);
    }
  }

  console.log('\n=== RÉCAP BACKFILL ===');
  console.log(`Sessions traitées      : ${recap.processed}/${sessions.length}`);
  if (WRITE) {
    console.log(`Events insérés         : ${recap.inserted}`);
    console.log(`Events mis à jour      : ${recap.updated}`);
  }
  console.log(`Skip (pas de formateur): ${recap.skippedNoTrainer.length}${recap.skippedNoTrainer.length ? ' → ' + recap.skippedNoTrainer.join(', ') : ''}`);
  console.log(`Sessions en échec      : ${recap.failed.length}`);
  for (const f of recap.failed) console.log(`  ✗ ${f.code} : ${f.message}`);
  if (recap.failed.length > 0) {
    console.log('\nRattrapage SÉQUENTIEL ciblé (idempotent, aucun doublon) :');
    for (const f of recap.failed) console.log(`  WRITE=1 SESSION_CODE=${f.code} pnpm calendar:backfill`);
  }
  if (!WRITE) console.log('\n(DRY — aucune écriture Google. Relancer avec WRITE=1 après validation.)');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Erreur fatale backfill :', err);
  await prisma.$disconnect();
  process.exit(1);
});
