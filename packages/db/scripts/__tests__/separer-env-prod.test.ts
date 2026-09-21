import { describe, it, expect } from 'vitest';
import { separerEnvProd } from '../separer-env-prod';

/**
 * Le déplacement de l'URL de production hors du `.env` racine.
 *
 * Cet outil touche un fichier de SECRETS sur le poste de quelqu'un. Trois
 * exigences, chacune testée :
 *   · il ne déplace que ce qui est DISTANT — relancé, il ne fait rien ;
 *   · il ne touche à aucune autre ligne, à l'octet près ;
 *   · son compte rendu ne contient jamais une valeur.
 */

const PROD = 'postgresql://postgres.abcdef:S3cr3t@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
const PROD_DIRECT = 'postgresql://postgres.abcdef:S3cr3t@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
const LOCAL = 'postgresql://qualiof:qualiof_dev@localhost:5432/qualiof_dev?schema=public';

const ENV = [
  '# QualiOF',
  'NODE_ENV="development"',
  '',
  '# === Database ===',
  `DATABASE_URL="${PROD}"`,
  `DIRECT_URL="${PROD_DIRECT}"`,
  'TEST_DATABASE_URL="postgresql://qualiof:qualiof@localhost:5432/qualiof_test"',
  'OPENROUTER_API_KEY="sk-or-ne-doit-pas-bouger"',
  '',
].join('\n');

describe('separerEnvProd', () => {
  it('déplace les deux URL distantes, verbatim, et pose les locales à leur place', () => {
    const r = separerEnvProd({ env: ENV, urlLocale: LOCAL });
    expect(r.prod).toContain(`DATABASE_URL="${PROD}"`);
    expect(r.prod).toContain(`DIRECT_URL="${PROD_DIRECT}"`);
    expect(r.env).toContain(`DATABASE_URL="${LOCAL}"`);
    expect(r.env).toContain(`DIRECT_URL="${LOCAL}"`);
    expect(r.env).not.toContain('supabase');
    expect(r.deplacees).toEqual(['DATABASE_URL', 'DIRECT_URL']);
  });

  it('ne touche à AUCUNE autre ligne, à l’octet près', () => {
    const r = separerEnvProd({ env: ENV, urlLocale: LOCAL });
    const autres = (texte: string) =>
      texte.split('\n').filter((l) => !/^(DATABASE_URL|DIRECT_URL)=/.test(l));
    expect(autres(r.env)).toEqual(autres(ENV));
    expect(r.env).toContain('OPENROUTER_API_KEY="sk-or-ne-doit-pas-bouger"');
    expect(r.env).toContain('TEST_DATABASE_URL=');
  });

  it('est idempotent : relancé sur un .env déjà local, il ne déplace rien', () => {
    const premier = separerEnvProd({ env: ENV, urlLocale: LOCAL });
    const second = separerEnvProd({ env: premier.env, urlLocale: LOCAL });
    expect(second.deplacees).toEqual([]);
    expect(second.prod).toBe('');
    expect(second.env).toBe(premier.env);
  });

  it('ne déplace que ce qui est distant : une seule des deux URL suffit', () => {
    const mixte = ENV.replace(`DIRECT_URL="${PROD_DIRECT}"`, `DIRECT_URL="${LOCAL}"`);
    const r = separerEnvProd({ env: mixte, urlLocale: LOCAL });
    expect(r.deplacees).toEqual(['DATABASE_URL']);
    expect(r.prod).not.toContain('DIRECT_URL');
  });

  it('ignore une URL distante en COMMENTAIRE — elle ne sert à personne', () => {
    const r = separerEnvProd({ env: `# DATABASE_URL="${PROD}"\nDATABASE_URL="${LOCAL}"\n`, urlLocale: LOCAL });
    expect(r.deplacees).toEqual([]);
  });

  it('son compte rendu ne contient jamais une valeur', () => {
    const r = separerEnvProd({ env: ENV, urlLocale: LOCAL });
    const compteRendu = JSON.stringify({ deplacees: r.deplacees, message: r.message });
    expect(compteRendu).not.toContain('S3cr3t');
    expect(compteRendu).not.toContain('abcdef');
    expect(compteRendu).not.toContain('supabase.com');
  });

  it('le fichier produit se suffit : un en-tête qui dit ce qu’il est', () => {
    const r = separerEnvProd({ env: ENV, urlLocale: LOCAL });
    expect(r.prod.startsWith('#')).toBe(true);
    expect(r.prod).toMatch(/PRODUCTION/);
  });
});
