import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `vercel.json` déclare TOUTES les routes cron, et rien d'autre — lot C.3.
 *
 * CE QUE CE FICHIER EMPÊCHE, ET QUI ÉTAIT DÉJÀ ARRIVÉ. Avant ce lot,
 * `vercel.json` ne planifiait QU'UNE route sur quatre. `preinscription-reminders`,
 * `opco-submission-reminders` et `closure-worker` existaient, répondaient,
 * étaient testées — et n'étaient déclenchées par RIEN. Une fonctionnalité qui a
 * l'air livrée et qui ne tourne pas : aucune erreur, aucun log, aucun moyen de
 * s'en apercevoir autrement qu'en constatant que les relances ne partent jamais.
 *
 * LE TEST GARDE LES DEUX SENS :
 *  - une route cron ajoutée sans être planifiée ⇒ ROUGE (le trou d'origine) ;
 *  - un chemin planifié qui ne correspond à aucune route ⇒ ROUGE (une faute de
 *    frappe dans `vercel.json` ne produit qu'un 404 silencieux toutes les nuits).
 *
 * ⚠ LES LIMITES VERCEL, VÉRIFIÉES LE 11/09/2026 à la source
 * (vercel.com/docs/cron-jobs/usage-and-pricing) : **100 crons par projet sur
 * TOUS les plans**, Hobby compris. Ce n'est donc PAS le nombre qui contraint —
 * la crainte notée en DIV-6 du plan C.2c était infondée. Ce qui contraint, c'est
 * la FRÉQUENCE : Hobby = une fois par jour, et une expression plus fréquente
 * **fait échouer le déploiement**. Le déploiement de production porte
 * `*​/5 * * * *` depuis des mois et il est `Ready` : le compte n'est donc pas
 * sur Hobby. Ce test fixe la règle qui en découle.
 */

const RACINE = resolve(__dirname, '../../../../..');
const CRONS_DIR = resolve(__dirname, '..');

const config = JSON.parse(readFileSync(resolve(RACINE, 'vercel.json'), 'utf-8')) as {
  crons: Array<{ path: string; schedule: string }>;
};

/** Les routes réellement présentes sous `app/api/cron/`. */
const routes = readdirSync(CRONS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== '__tests__')
  .map((e) => `/api/cron/${e.name}`)
  .sort();

describe('vercel.json — toute route cron est planifiée, et réciproquement', () => {
  it('les SIX routes existantes sont déclarées', () => {
    expect(routes).toEqual([
      '/api/cron/closure-worker',
      '/api/cron/diagnostic-worker',
      '/api/cron/opco-submission-reminders',
      '/api/cron/preinscription-reminders',
      '/api/cron/signature-reminders',
      '/api/cron/signature-sync',
    ]);
  });

  it('PUISSANCE — aucune route n’est orpheline : chacune a son cron', () => {
    const planifies = new Set(config.crons.map((c) => c.path));
    const orphelines = routes.filter((r) => !planifies.has(r));
    expect(orphelines).toEqual([]);
  });

  it('PUISSANCE — aucun chemin planifié ne pointe dans le vide', () => {
    const existantes = new Set(routes);
    const fantomes = config.crons.map((c) => c.path).filter((p) => !existantes.has(p));
    expect(fantomes).toEqual([]);
  });

  it('les deux crons de signature portent les bons chemins, littéralement', () => {
    const parChemin = new Map(config.crons.map((c) => [c.path, c.schedule]));
    // Le filet des webhooks perdus tourne à l'heure : la spec dit « requêtes
    // SENT > 1 h sans webhook ».
    expect(parChemin.get('/api/cron/signature-sync')).toBe('17 * * * *');
    // Les relances sont quotidiennes : J+3 et J+7 se comptent en jours.
    expect(parChemin.get('/api/cron/signature-reminders')).toBe('35 7 * * *');
  });

  it('PUISSANCE — aucune expression ne fait tout partir à la même minute', () => {
    // Six crons déclenchés ensemble, c'est six fonctions concurrentes sur la
    // même base. Les quotidiens sont échelonnés ; seuls les « toutes les 5
    // minutes » se partagent leur créneau, et c'est sans conséquence.
    const quotidiens = config.crons
      .map((c) => c.schedule)
      .filter((s) => /^\d+ \d+ \* \* \*$/.test(s));
    expect(new Set(quotidiens).size).toBe(quotidiens.length);
    expect(quotidiens.length).toBeGreaterThanOrEqual(3);
  });

  it('chaque expression est un cron à cinq champs — pas six, pas quatre', () => {
    for (const { path, schedule } of config.crons) {
      expect(schedule.trim().split(/\s+/), `${path} : « ${schedule} »`).toHaveLength(5);
    }
  });
});
