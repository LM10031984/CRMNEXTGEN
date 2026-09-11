/**
 * Recette C.3 sur l'aperçu : rebranche les adresses du jeu DEMO-SIG sur celle du
 * testeur (RECETTE_EMAIL) et pose le signataire OF, pour que tous les emails de
 * la recette arrivent dans UNE boîte — la sienne. Rien d'autre n'est touché.
 */
import { PrismaClient } from '@prisma/client';
import { assertCibleAutorisee } from './assert-db-target.js';

const prisma = new PrismaClient();
const DEMO_DIRIGEANT = 'paul.durand@demo-provence-immo.fr';

async function main(): Promise<void> {
  assertCibleAutorisee('Rebranchage des emails de recette');
  const email = process.env.RECETTE_EMAIL;
  if (!email) throw new Error('RECETTE_EMAIL manquant');

  const c = await prisma.contact.updateMany({ where: { email: DEMO_DIRIGEANT }, data: { email } });
  const q = await prisma.person.updateMany({ where: { email: DEMO_DIRIGEANT }, data: { email } });
  const t = await prisma.tenant.findFirstOrThrow();
  await prisma.tenant.update({
    where: { id: t.id },
    data: { signatoryName: 'Laurent MARX', signatoryEmail: email, signatoryTitle: 'Dirigeant' },
  });
  console.log(`   ✓ contact dirigeant démo : ${c.count} · personne : ${q.count} · signataire OF : ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
