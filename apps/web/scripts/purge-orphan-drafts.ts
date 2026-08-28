/**
 * Purge des brouillons abandonnés du formulaire public d'inscription.
 *
 * Un visiteur peut déposer ses pièces puis fermer l'onglet sans envoyer sa
 * demande : les fichiers restent sous `sessions/{sessionId}/{draftId}/` sans
 * aucune PreEnrollment associée. Ce script les repère et, sur demande
 * explicite, les supprime.
 *
 * SEC PAR DÉFAUT — il ne fait qu'inventorier. Suppression réelle : WRITE=1.
 * (Destructif = étape séparée : lister, faire valider, puis exécuter.)
 *
 *   pnpm storage:purge-drafts              # inventaire
 *   WRITE=1 pnpm storage:purge-drafts      # suppression
 *   AGE_JOURS=60 pnpm storage:purge-drafts # autre seuil d'ancienneté
 */

import { prisma } from '@qualiof/db';
import { listObjects, deleteFile, PREENROLLMENT_BUCKET } from '../src/lib/storage';

const WRITE = process.env.WRITE === '1';
const AGE_JOURS = Number(process.env.AGE_JOURS ?? 30);
const PREFIXE = 'sessions';

interface Brouillon {
  prefixe: string;
  draftId: string;
  keys: string[];
  dernierDepot: number | null;
}

async function main() {
  if (!Number.isFinite(AGE_JOURS) || AGE_JOURS < 1) {
    throw new Error(`AGE_JOURS invalide : ${process.env.AGE_JOURS}`);
  }
  const ageMaxMs = AGE_JOURS * 24 * 3600 * 1000;

  console.log(
    `Inventaire de ${PREENROLLMENT_BUCKET}/${PREFIXE}/ — brouillons de plus de ${AGE_JOURS} jours`,
  );
  const objets = await listObjects(PREENROLLMENT_BUCKET, PREFIXE);
  console.log(`${objets.length} objets trouvés.`);

  // Regroupement par préfixe sessions/{sessionId}/{draftId}/
  const brouillons = new Map<string, Brouillon>();
  for (const o of objets) {
    const parts = o.key.split('/');
    if (parts.length < 4) continue; // pas un fichier de brouillon
    const prefixe = parts.slice(0, 3).join('/');
    const b = brouillons.get(prefixe) ?? {
      prefixe,
      draftId: parts[2]!,
      keys: [],
      dernierDepot: null,
    };
    b.keys.push(o.key);
    const ts = o.lastModified?.getTime() ?? null;
    if (ts !== null) b.dernierDepot = Math.max(b.dernierDepot ?? 0, ts);
    brouillons.set(prefixe, b);
  }

  const maintenant = Date.now();
  let candidats = 0;
  let supprimes = 0;
  let ignoresSansDate = 0;

  for (const b of brouillons.values()) {
    // Un brouillon sans date exploitable n'est JAMAIS supprimé : on ne devine
    // pas l'ancienneté d'un fichier qu'on s'apprête à détruire.
    if (b.dernierDepot === null) {
      ignoresSansDate++;
      continue;
    }
    if (maintenant - b.dernierDepot < ageMaxMs) continue;

    // Rattaché à une demande réellement soumise ? Alors on garde.
    const rattachee = await prisma.preEnrollment.findFirst({
      where: { extractedData: { path: ['draftId'], equals: b.draftId } },
      select: { id: true },
    });
    if (rattachee) continue;

    candidats++;
    const age = Math.floor((maintenant - b.dernierDepot) / (24 * 3600 * 1000));
    console.log(
      `${WRITE ? 'SUPPRESSION' : 'candidat  '} ${b.prefixe} — ${b.keys.length} fichier(s), ${age} j`,
    );

    if (WRITE) {
      for (const key of b.keys) {
        await deleteFile(PREENROLLMENT_BUCKET, key);
        supprimes++;
      }
    }
  }

  console.log('');
  console.log(`Brouillons inspectés : ${brouillons.size}`);
  if (ignoresSansDate > 0) {
    console.log(`Ignorés (aucune date d'objet exploitable) : ${ignoresSansDate}`);
  }
  console.log(`Orphelins de plus de ${AGE_JOURS} j : ${candidats}`);
  console.log(
    WRITE
      ? `${supprimes} fichiers supprimés.`
      : 'Mode sec — relancer avec WRITE=1 pour supprimer.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
