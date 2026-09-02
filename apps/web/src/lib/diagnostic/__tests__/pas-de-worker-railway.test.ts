import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * INCIDENT DU 2026-09-01 — Jean-Guy n'a jamais reçu son programme.
 *
 * Cause racine, mesurée depuis le conteneur (`railway ssh --service worker`) :
 * Railway avale TOUTE connexion sortante vers un port SMTP — 25, 465, 587 et
 * 2525 — vers n'importe quel hôte (Gmail comme OVH comme Brevo), alors que le
 * même conteneur atteint `openrouter.ai:443` en 9 ms. Le worker générait donc
 * bien le programme, puis mourait sur `connect ENETUNREACH` / `Connection
 * timeout`, trois fois, jusqu'à `FAILED`.
 *
 * Conséquence : le process pm2 `diagnostic` ne doit PAS tourner sur Railway. Il
 * ne peut rien envoyer, et il est nuisible — il rafle les soumissions `PENDING`
 * avant le chemin Vercel et consomme les 3 tentatives, ce qui les enterre en
 * `FAILED` sans espoir de reprise automatique.
 *
 * L'envoi du diagnostic se fait sur VERCEL : le navigateur du prospect
 * (`POST /api/diagnostic/traiter`) en principal, le cron Vercel en rattrapage.
 *
 * Ce test existe pour qu'on ne le remette pas « pour faire bonne mesure ».
 */
describe('ecosystem pm2 — Railway ne peut pas envoyer d’email', () => {
  const config = readFileSync(
    join(process.cwd(), '..', '..', 'ecosystem.config.cjs'),
    'utf8',
  );

  it('ne déclare AUCUN process pm2 pour le diagnostic', () => {
    expect(config).not.toMatch(/name:\s*'diagnostic'/);
    expect(config).not.toMatch(/diagnostic-worker\.ts/);
  });

  it('garde les workers qui n’envoient pas d’email (closure, veille, ocr)', () => {
    for (const nom of ['closure', 'veille', 'ocr']) {
      expect(config, `le process ${nom} a disparu`).toMatch(
        new RegExp(`name:\\s*'${nom}'`),
      );
    }
  });

  it('porte la raison en clair, pour qu’on ne le rétablisse pas par inadvertance', () => {
    expect(config).toMatch(/SMTP/);
  });
});
