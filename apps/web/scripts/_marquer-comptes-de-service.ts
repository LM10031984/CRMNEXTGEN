/**
 * Marque les comptes de service et désactive les comptes sans boîte.
 *
 * POURQUOI (11/09/2026) : les alertes internes partaient à TOUS les `User` du
 * tenant. `e2e@start-academy.fr` et `admin@startacademy.fr` n'ont pas de boîte
 * → deux bounces sur `formation@` à chaque alerte A-2. Le code filtre désormais
 * (`lib/alertes/destinataires.ts`), mais encore faut-il que la base dise QUI
 * est un robot et QUI est fermé.
 *
 * Deux traitements, volontairement différents :
 *
 *   • `e2e@start-academy.fr` → marqué compte de service, PAS désactivé.
 *     Playwright s'y connecte : le fermer casserait la suite E2E. Le drapeau
 *     le retire des destinataires sans toucher à sa capacité à se connecter.
 *
 *   • `admin@startacademy.fr` → DÉSACTIVÉ. Compte historique du seed, dont le
 *     mot de passe s'affichait encore sur la page de connexion en dev. Aucune
 *     personne derrière, aucune boîte.
 *
 * `lecteur.test@startacademy.fr` est SIGNALÉ mais pas touché : c'est un compte
 * de test au vu de son nom, mais son rôle LECTEUR ne le rend destinataire
 * d'aucune alerte aujourd'hui, et c'est à un humain de décider de son sort.
 *
 * USAGE
 *   pnpm exec dotenv -e ../../.env -- tsx scripts/_marquer-comptes-de-service.ts          # DRY
 *   WRITE=1 pnpm exec dotenv -e ../../.env -- tsx scripts/_marquer-comptes-de-service.ts  # WRITE
 */

import { prisma } from '@qualiof/db';

const WRITE = process.env.WRITE === '1';

/** Comptes robots : restent actifs, cessent d'être écrits. */
const COMPTES_DE_SERVICE = ['e2e@start-academy.fr'];

/** Comptes sans personne derrière : fermés. */
const A_DESACTIVER = ['admin@startacademy.fr'];

/** Suspects, signalés sans être touchés. */
const A_SIGNALER = ['lecteur.test@startacademy.fr'];

async function main() {
  console.log(`=== comptes de service — mode ${WRITE ? 'WRITE (écriture réelle)' : 'DRY (lecture seule)'} ===\n`);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      disabledAt: true,
      isServiceAccount: true,
      lastLoginAt: true,
    },
    orderBy: { email: 'asc' },
  });

  console.log('État actuel :');
  for (const u of users) {
    const etats = [
      u.disabledAt ? 'DÉSACTIVÉ' : 'actif',
      u.isServiceAccount ? 'compte de service' : null,
      u.lastLoginAt ? `dernière connexion ${u.lastLoginAt.toISOString().slice(0, 10)}` : 'jamais connecté',
    ].filter(Boolean);
    console.log(`  ${u.email.padEnd(34)} ${u.role.padEnd(10)} ${etats.join(' · ')}`);
  }

  const service = users.filter((u) => COMPTES_DE_SERVICE.includes(u.email) && !u.isServiceAccount);
  const fermer = users.filter((u) => A_DESACTIVER.includes(u.email) && u.disabledAt === null);
  const signaler = users.filter((u) => A_SIGNALER.includes(u.email));

  console.log('\nCe qui va changer :');
  if (service.length === 0 && fermer.length === 0) {
    console.log('  (rien — tout est déjà dans l’état voulu)');
  }
  for (const u of service) console.log(`  • ${u.email} → compte de service (reste ACTIF pour Playwright)`);
  for (const u of fermer) console.log(`  • ${u.email} → DÉSACTIVÉ (plus de connexion possible)`);

  if (signaler.length > 0) {
    console.log('\n⚠ Signalés, NON touchés :');
    for (const u of signaler) {
      console.log(
        `  • ${u.email} (${u.role}) — ressemble à un compte de test. Son rôle ne le rend`,
      );
      console.log('    destinataire d’aucune alerte aujourd’hui : à trancher à la main.');
    }
  }

  if (!WRITE) {
    console.log('\nDRY : rien n’a été écrit. Relancer avec WRITE=1 pour appliquer.');
    return;
  }

  if (service.length > 0) {
    const r = await prisma.user.updateMany({
      where: { id: { in: service.map((u) => u.id) } },
      data: { isServiceAccount: true },
    });
    console.log(`\n✅ ${r.count} compte(s) marqué(s) compte de service.`);
  }
  if (fermer.length > 0) {
    const r = await prisma.user.updateMany({
      where: { id: { in: fermer.map((u) => u.id) } },
      data: { disabledAt: new Date() },
    });
    console.log(`✅ ${r.count} compte(s) désactivé(s).`);
    // Un compte fermé dont la session vit encore reste connecté : on coupe.
    const s = await prisma.authSession.deleteMany({
      where: { userId: { in: fermer.map((u) => u.id) } },
    });
    console.log(`✅ ${s.count} session(s) ouverte(s) invalidée(s).`);
  }
}

main()
  .catch((e) => {
    console.error('❌', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
