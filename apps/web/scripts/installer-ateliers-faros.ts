/** Déploiement Start Academy uniquement ; WRITE=1 requis. Aucune lecture de .env. */
import { prisma } from '@qualiof/db';
import { installFarosLibrary } from '../src/server/faros-library';
import { FAROS_WORKSHOPS } from '../src/lib/proposition/faros-workshops';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
try {
  if (process.env.WRITE !== '1') {
    console.log(`Simulation : ${FAROS_WORKSHOPS.length} ateliers Faros dans un nouveau rayon inactif. WRITE=1 pour installer.`);
  } else {
    const result = await installFarosLibrary(prisma, TENANT_ID);
    console.log(`Faros ${result} : ${FAROS_WORKSHOPS.length} ateliers ; aucun produit existant réécrit.`);
  }
} finally {
  await prisma.$disconnect();
}
