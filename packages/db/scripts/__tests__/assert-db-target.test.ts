/**
 * Garde-fou de cible de base — tests.
 *
 * Ce module empêche `pnpm db:seed`, `pnpm db:reset` et consorts d'écrire sur la
 * PRODUCTION : le `.env` racine porte l'URL Supabase, et `prisma/seed.ts` la
 * charge en dur. C'est du code de sécurité, il doit être gardé lui-même.
 *
 * PROTOCOLE DE MUTATION : retirer le test `/supabase/i` d'`analyserCible` →
 * « une URL Supabase est une cible de production » ROUGE. Retirer le repli sur
 * les hôtes non locaux → « un hôte distant est refusé » ROUGE.
 */
import { describe, it, expect } from 'vitest';
import { analyserCible, masquer } from '../assert-db-target';

const PROD = 'postgresql://user:motdepasse@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
const LOCAL = 'postgresql://qualiof:qualiof@localhost:5432/qualiof_dev';

describe('analyserCible — ce qui est refusé', () => {
  it('une URL Supabase est une cible de production', () => {
    const c = analyserCible(PROD);
    expect(c.autorisee).toBe(false);
    // Motif EXACT, pas un `toMatch(/supabase/i)` : le repli « hôte distant »
    // recopie le nom d'hôte dans son motif, lequel contient « supabase ». Une
    // assertion souple passerait donc même si la règle Supabase disparaissait.
    expect(c.motif).toBe('cible Supabase (production)');
  });

  it('une URL Supabase sur un hôte LOCAL reste refusée', () => {
    // Le cas qui isole la règle Supabase du repli « hôte distant » : ici l'hôte
    // est local, seul le test /supabase/i peut refuser. Retirer cette règle rend
    // la cible AUTORISÉE — le rouge est franc, pas cosmétique.
    const c = analyserCible('postgresql://u:p@localhost:5432/supabase_miroir');
    expect(c.autorisee).toBe(false);
    expect(c.motif).toBe('cible Supabase (production)');
  });

  it('un hôte distant est refusé même sans le mot « supabase »', () => {
    // Défense en profondeur : le jour où la prod déménage, le garde-fou tient.
    const c = analyserCible('postgresql://u:p@db.exemple.net:5432/qualiof');
    expect(c.autorisee).toBe(false);
    expect(c.motif).toMatch(/distant/i);
  });

  it('une DATABASE_URL absente est refusée, pas ignorée', () => {
    // Sans URL, Prisma retomberait sur sa propre résolution : on refuse avant.
    expect(analyserCible(undefined).autorisee).toBe(false);
    expect(analyserCible('').autorisee).toBe(false);
  });

  it('une URL illisible est refusée plutôt qu’interprétée', () => {
    const c = analyserCible('ceci-nest-pas-une-url');
    expect(c.autorisee).toBe(false);
    expect(c.motif).toMatch(/illisible/i);
  });
});

describe('analyserCible — ce qui est autorisé', () => {
  it.each([
    ['localhost', LOCAL],
    ['127.0.0.1', 'postgresql://u:p@127.0.0.1:5432/qualiof_dev'],
    ['une base par worktree', 'postgresql://u:p@localhost:5432/qualiof_dev_signature'],
  ])('%s est une cible locale', (_nom, url) => {
    const c = analyserCible(url);
    expect(c.autorisee).toBe(true);
    expect(c.motif).toBeNull();
  });

  it('rend le nom de la base, pour que le message dise où l’on écrit', () => {
    expect(analyserCible(LOCAL).base).toBe('qualiof_dev');
    expect(analyserCible(LOCAL).hote).toBe('localhost');
  });
});

describe('masquer', () => {
  it('ne laisse jamais fuiter le mot de passe dans un message d’erreur', () => {
    const m = masquer(PROD);
    expect(m).not.toContain('motdepasse');
    expect(m).not.toContain('user');
    expect(m).toContain('supabase.com');
  });
});
