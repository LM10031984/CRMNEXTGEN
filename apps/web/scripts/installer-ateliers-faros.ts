/** Déploiement Start Academy uniquement ; WRITE=1 requis. Aucune lecture de .env. */
import { prisma } from '@qualiof/db';
import { installFarosLibrary, installFarosComplements } from '../src/server/faros-library';
import { FAROS_WORKSHOPS } from '../src/lib/proposition/faros-workshops';

import { FAROS_EXTENSION_WORKSHOPS } from '../src/lib/proposition/faros-extensions';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
try {
  if (process.env.WRITE !== '1') {
    console.log(
      `Simulation : ${FAROS_WORKSHOPS.length} ateliers Faros et ${FAROS_EXTENSION_WORKSHOPS.length} compléments dans des rayons inactifs. WRITE=1 pour installer.`,
    );
  } else {
    const result = await installFarosLibrary(prisma, TENANT_ID);
    const complements = await installFarosComplements(prisma, TENANT_ID);
    console.log(`Compléments Faros ${complements} : ${FAROS_EXTENSION_WORKSHOPS.length} ateliers.`);
    console.log(
      `Faros ${result} : ${FAROS_WORKSHOPS.length} ateliers ; aucun produit existant réécrit.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
