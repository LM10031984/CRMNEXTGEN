/**
 * Sortir l'URL de PRODUCTION du `.env` racine — migration d'un poste.
 *
 *   pnpm --filter @qualiof/db run env:separer-prod
 *
 * POURQUOI (21/09/2026)
 *
 * Tant que `.env` portait l'URL Supabase, tout ce qui le chargeait sans y
 * penser parlait à la production : un `dotenv -e ../../.env`, le CLI Prisma,
 * un script lancé à la main. `.env` est le fichier qu'on charge PAR DÉFAUT ;
 * il ne doit désigner que du local. La production vit désormais dans
 * `.env.prod`, que seuls nomment les scripts qui la visent volontairement.
 *
 * CE QUE FAIT CET OUTIL, ET CE QU'IL S'INTERDIT
 *
 *   · il ne déplace que les URL DISTANTES de `DATABASE_URL` / `DIRECT_URL` —
 *     relancé sur un poste déjà migré, il ne fait rien ;
 *   · il recopie la ligne VERBATIM dans `.env.prod` (guillemets, paramètres
 *     `?pgbouncer=…` compris) et ne touche à aucune autre ligne de `.env` ;
 *   · il n'affiche JAMAIS une valeur : ni URL, ni hôte, ni identifiant ;
 *   · il ne crée AUCUNE sauvegarde — une copie de plus d'un secret est une
 *     fuite de plus à surveiller. `.env` est réécrit par renommage atomique ;
 *   · il refuse d'écraser un `.env.prod` qui porte déjà une AUTRE valeur.
 *
 * ORDRE DE BASCULE : fusionner d'abord la PR qui fait désigner `.env.prod` aux
 * scripts de production, PUIS migrer le poste. `.env.prod` absent est ignoré en
 * silence par dotenv : avant migration, les scripts retombent sur `.env` et se
 * comportent comme avant. Après migration, une branche PAS ENCORE rebasée
 * (scripts en `-e ../../.env` seul) n'atteint plus la production — elle échoue
 * bruyamment, ce qui est le comportement voulu.
 */

import { existsSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { analyserCible } from './assert-db-target';

const CLES = ['DATABASE_URL', 'DIRECT_URL'] as const;
type Cle = (typeof CLES)[number];

const EN_TETE = [
  '# ===========================================',
  '# QualiOF — base de PRODUCTION. Rien d’autre ici.',
  '#',
  '# Jamais chargé par défaut. Seuls le désignent les scripts qui visent',
  '# volontairement la production :',
  '#   dotenv -e ../../.env.prod -e ../../.env -- …',
  '# (le PREMIER fichier gagne : dotenv n’écrase pas une variable déjà posée).',
  '# Ignoré par git (.gitignore : .env*). Ne jamais le copier ni le commiter.',
  '# ===========================================',
  '',
].join('\n');

/** `CLE="valeur"`, `CLE='valeur'`, `CLE=valeur`, `export CLE=…` — hors commentaire. */
function lireAffectation(ligne: string): { cle: string; valeur: string } | null {
  const m = ligne.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) return null;
  const brut = m[2]!.trim();
  const valeur = brut.replace(/^(['"])(.*)\1\s*(?:#.*)?$/, '$2');
  return { cle: m[1]!, valeur };
}

export interface ResultatSeparation {
  /** Le nouveau contenu de `.env`. Identique à l'entrée s'il n'y a rien à déplacer. */
  env: string;
  /** Le contenu de `.env.prod`, ou `''` s'il n'y a rien à déplacer. */
  prod: string;
  /** Les clés déplacées — des NOMS, jamais des valeurs. */
  deplacees: Cle[];
  /** Compte rendu affichable tel quel. Ne contient aucune valeur. */
  message: string;
}

/** Pure : deux textes en entrée, deux textes en sortie. Aucun accès disque. */
export function separerEnvProd(entree: { env: string; urlLocale: string }): ResultatSeparation {
  const deplacees: Cle[] = [];
  const lignesProd: string[] = [];

  const lignes = entree.env.split('\n').map((ligne) => {
    const affectation = lireAffectation(ligne);
    if (!affectation || !(CLES as readonly string[]).includes(affectation.cle)) return ligne;
    if (affectation.valeur === '' || analyserCible(affectation.valeur).autorisee) return ligne;

    deplacees.push(affectation.cle as Cle);
    lignesProd.push(ligne);
    return `${affectation.cle}="${entree.urlLocale}"`;
  });

  if (deplacees.length === 0) {
    return {
      env: entree.env,
      prod: '',
      deplacees,
      message: 'Rien à déplacer : .env ne désigne aucune base distante.',
    };
  }

  return {
    env: lignes.join('\n'),
    prod: `${EN_TETE}${lignesProd.join('\n')}\n`,
    deplacees,
    message:
      `Déplacé vers .env.prod : ${deplacees.join(', ')}. ` +
      `.env désigne maintenant la base locale pour ${deplacees.length > 1 ? 'ces clés' : 'cette clé'}.`,
  };
}

/** L'URL locale à poser dans `.env` : celle de `.env.local` si elle existe, sinon le défaut du modèle. */
function urlLocaleDuPoste(racine: string): string {
  const defaut = 'postgresql://qualiof:qualiof_dev@localhost:5432/qualiof?schema=public';
  const fichier = path.join(racine, '.env.local');
  if (!existsSync(fichier)) return defaut;
  for (const ligne of readFileSync(fichier, 'utf8').split('\n')) {
    const a = lireAffectation(ligne);
    if (a?.cle === 'DATABASE_URL' && a.valeur !== '' && analyserCible(a.valeur).autorisee) return a.valeur;
  }
  return defaut;
}

function executer(): void {
  const racine = path.resolve(__dirname, '../../..');
  const fichierEnv = path.join(racine, '.env');
  const fichierProd = path.join(racine, '.env.prod');

  if (!existsSync(fichierEnv)) {
    console.log('Aucun .env à la racine : rien à faire.');
    return;
  }

  const resultat = separerEnvProd({
    env: readFileSync(fichierEnv, 'utf8'),
    urlLocale: urlLocaleDuPoste(racine),
  });

  if (resultat.deplacees.length === 0) {
    console.log(`✓ ${resultat.message}`);
    return;
  }

  if (existsSync(fichierProd)) {
    const existant = readFileSync(fichierProd, 'utf8');
    const manquantes = resultat.prod
      .split('\n')
      .filter((l) => lireAffectation(l) !== null)
      .filter((l) => !existant.split('\n').includes(l));
    if (manquantes.length > 0) {
      console.error(
        '❌ .env.prod existe déjà et porte une AUTRE valeur pour une clé à déplacer.\n' +
          '   Rien n’a été écrit. Comparez les deux fichiers à la main, puis relancez.',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(fichierProd, resultat.prod, { mode: 0o600 });
  }
  chmodSync(fichierProd, 0o600);

  // Renommage atomique : jamais un .env à moitié écrit, et aucune sauvegarde —
  // une copie de plus d'un secret est une fuite de plus à surveiller.
  const temporaire = `${fichierEnv}.tmp-${process.pid}`;
  writeFileSync(temporaire, resultat.env, { mode: 0o600 });
  renameSync(temporaire, fichierEnv);

  console.log(`✓ ${resultat.message}`);
  console.log('  .env.prod est en lecture/écriture pour vous seul (600) et ignoré par git.');
}

if (process.argv[1] && process.argv[1].endsWith('separer-env-prod.ts')) {
  executer();
}
