/**
 * Annule chez le prestataire les envois de signature créés depuis le jeu de
 * DÉMONSTRATION, et les marque `CANCELED` côté QualiOF.
 *
 * POURQUOI : le semis de démo tourne sur une base locale, mais la clé DocuSeal
 * du `.env` est celle du compte de PRODUCTION (instance UE). Chaque clic
 * « Envoyer » sur l'écran de démonstration crée donc une vraie submission chez
 * le prestataire, avec des noms fictifs. Le point 4 des points ouverts de la
 * fiche DPA impose d'archiver les envois de test une fois le test terminé.
 *
 * `send_email: false` (D-9) garantit que personne n'a jamais été destinataire :
 * ce sont des submissions ouvertes, pas des sollicitations.
 *
 * PORTÉE VOLONTAIREMENT ÉTROITE : seuls les envois rattachés à la session
 * `DEMO-SIG-01` sont touchés. Un envoi réel ne peut pas être pris par erreur.
 *
 * Ce script ne régénère PAS les documents en sens inverse (ce que fait
 * `annulerEnvoiSignature` dans l'application). Inutile ici : le semis est
 * idempotent, `pnpm --filter @qualiof/db run seed:demo-signature` reconstruit
 * un jeu propre.
 */
import { prisma } from '@qualiof/db';
import { createDocusealProvider } from '../src/lib/signature/docuseal';

const CODE_SESSION_DEMO = 'DEMO-SIG-01';

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(dbUrl)) {
    console.error('❌ La base visée n’est pas locale. Ce script ne lit que la base de démo.');
    process.exit(1);
  }

  const apiKey = process.env.DOCUSEAL_API_KEY;
  const baseUrl = process.env.DOCUSEAL_BASE_URL;
  if (!apiKey || !baseUrl) {
    console.error('❌ DOCUSEAL_API_KEY / DOCUSEAL_BASE_URL absentes : rien à annuler chez le prestataire.');
    process.exit(1);
  }
  console.log(`🔎 Base   : ${dbUrl.replace(/:\/\/[^@]*@/, '://***@')}`);
  console.log(`🔎 Prestataire : ${baseUrl} (compte RÉEL)\n`);

  const provider = createDocusealProvider({ apiKey, baseUrl });

  try {
    const session = await prisma.trainingSession.findUnique({
      where: { code: CODE_SESSION_DEMO },
      select: { id: true, tenantId: true },
    });
    if (!session) {
      console.log(`Aucune session ${CODE_SESSION_DEMO} : rien à faire.`);
      return;
    }

    const demandes = await prisma.signatureRequest.findMany({
      where: { sessionId: session.id, status: { in: ['SENT', 'PARTIALLY_SIGNED', 'DRAFT'] } },
      select: { id: true, providerId: true, status: true, documents: { select: { id: true, type: true } } },
    });
    if (demandes.length === 0) {
      console.log('Aucun envoi de démonstration ouvert. Rien à annuler.');
      return;
    }

    const admin = await prisma.user.findFirst({
      where: { tenantId: session.tenantId },
      select: { id: true },
    });

    for (const d of demandes) {
      const piece = d.documents.map((x) => x.type).join(', ') || '(sans pièce)';
      process.stdout.write(`  ${piece.padEnd(11)} ${d.providerId} … `);
      try {
        await provider.cancel(d.providerId);
      } catch (e) {
        // Une submission déjà archivée chez le prestataire fait échouer l'appel.
        // On le dit, et on marque quand même côté QualiOF : l'état local doit
        // refléter que cet envoi ne vit plus.
        console.log(`⚠ prestataire : ${e instanceof Error ? e.message.split('\n')[0] : e}`);
      }
      await prisma.$transaction(async (tx) => {
        await tx.signatureRequest.update({
          where: { id: d.id },
          data: { status: 'CANCELED', lastError: null },
        });
        for (const doc of d.documents) {
          await tx.document.update({ where: { id: doc.id }, data: { status: 'generated' } });
        }
        await tx.auditLog.create({
          data: {
            tenantId: session.tenantId,
            userId: admin?.id ?? null,
            entity: 'SignatureRequest',
            entityId: d.id,
            action: 'signature.canceled',
            diff: {
              motif: 'demo_cleanup',
              motifTexte:
                'Envoi de démonstration annulé chez le prestataire : nettoyage du compte réel après vérification d’écran.',
              providerId: d.providerId,
              statutAvant: d.status,
              pieces: d.documents.map((x) => x.type),
            },
          },
        });
      });
      console.log('annulé ✅');
    }
    console.log(`\n${demandes.length} envoi(s) annulé(s) et marqué(s) CANCELED.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ échec :', e);
  process.exit(1);
});
