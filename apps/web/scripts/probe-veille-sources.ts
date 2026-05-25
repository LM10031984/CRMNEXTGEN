/**
 * Phase 13 Plan 13-05 — Probe HEAD des 12 sources RSS seed.
 *
 * Vérifie que les URLs des sources sont toujours vivantes (status 200/302)
 * et que le content-type contient bien `xml|rss|atom`.
 *
 * Usage :
 *   pnpm --filter @qualiof/web probe:veille
 *
 * Lecture : les sources dont la sortie est "check" ou "ERROR" doivent être
 * revues — soit fix l'URL, soit désactiver `active: false` dans sources.ts.
 *
 * Pas de dépendance Ollama / Redis / BDD — script lecture seule HEAD HTTP.
 */

import { RSS_SOURCES } from '../src/lib/veille/sources';

async function main() {
  console.log(
    `Probe HEAD des ${RSS_SOURCES.length} sources RSS seed...\n` +
      ' '.repeat(10) +
      'theme    | name                            | status | content-type           | verdict',
  );
  console.log('-'.repeat(110));
  let ok = 0;
  let warn = 0;
  let err = 0;
  for (const s of RSS_SOURCES) {
    try {
      const r = await fetch(s.url, {
        method: 'HEAD',
        // Certains serveurs renvoient 405 sur HEAD pur — fallback GET acceptable.
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
      const ct = r.headers.get('content-type') ?? '';
      const isFeed = /xml|rss|atom/i.test(ct);
      const verdict = r.status >= 200 && r.status < 400 && isFeed ? 'OK' : 'check';
      if (verdict === 'OK') ok += 1;
      else warn += 1;
      console.log(
        `${s.theme} | ${s.name.padEnd(30)} | ${String(r.status).padEnd(6)} | ${ct.slice(0, 22).padEnd(22)} | ${verdict}`,
      );
    } catch (e) {
      err += 1;
      console.log(
        `${s.theme} | ${s.name.padEnd(30)} | ERROR  | -                      | ${(e as Error).message.slice(0, 40)}`,
      );
    }
  }
  console.log('-'.repeat(110));
  console.log(`Total : ${ok} OK | ${warn} check | ${err} error sur ${RSS_SOURCES.length}`);
  if (ok < 10) {
    console.warn(
      '⚠️  < 10 sources OK — revoir sources.ts ou les remplacer.',
    );
    process.exit(1);
  }
  process.exit(0);
}

void main();
