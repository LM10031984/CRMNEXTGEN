/**
 * fix-d19ter-prod-00661.ts — PROD-00661 sort du chemin de composition.
 *
 * ## Ce que ce script fait, et rien d'autre
 *
 * UNE colonne, UNE ligne : `TrainingProduct.excludedFromClientOutputs`
 * passe de `false` à `true` pour le produit `PROD-00661` du tenant
 * `db191440-…`. Aucune autre colonne ne bouge.
 *
 * **`isActive` reste `true`, et c'est voulu.** Le produit RESTE au catalogue
 * public : une session réelle a eu lieu sous ce code, et l'auditeur Qualiopi
 * doit pouvoir en consulter le programme (indicateur 1). Ce qu'on coupe est
 * uniquement sa capacité à être **proposé par le moteur** dans un audit ou une
 * proposition. Désactiver le produit aurait retiré la fiche d'un dossier
 * réellement exécuté — c'est l'inverse de ce qu'on cherche.
 *
 * ## Pourquoi — premier usage réel de D-19 ter
 *
 * C'est la réponse à **D-18**. « Communication digitale & Stratégie marketing
 * pour activité événementielle » était remonté sur la douleur e-réputation
 * d'une AGENCE IMMOBILIÈRE. Le réflexe était d'accuser le moteur de
 * recommandation ; le relevé dit autre chose : le rapprochement lexical était
 * correct, c'est le produit qui n'aurait pas dû être diffusable. Un défaut de
 * DONNÉE, pas de code — et donc un défaut qu'aucun test unitaire n'attrape.
 *
 * Arbitré par Laurent le 12/09/2026.
 *
 * ## Les trois garde-fous
 *
 *  1. **Ciblage par `tenantId` ET `code`**, jamais le code seul : `code` n'est
 *     unique que PAR tenant (`@@unique([tenantId, code])`). Cibler le code seul
 *     marcherait aujourd'hui et écrirait chez le mauvais OF le jour où un
 *     second tenant existe.
 *  2. **Exactement 1 ligne, ou rien.** À 0 comme à 2, le script n'écrit pas et
 *     le dit. Une correction de données qui « touche ce qu'elle trouve » est
 *     une correction qu'on ne peut pas relire après coup.
 *  3. **`AuditLog` dans la MÊME transaction.** Une écriture en production sans
 *     trace est précisément ce qui rend une ligne inexplicable trois semaines
 *     plus tard — le cas `PROD-cdd22466`, créé le 21/08 sans aucune entrée.
 *     Hors transaction, un échec du log laisserait l'écriture orpheline.
 *
 * La connexion passe par `DIRECT_URL` (:5432) et non par la poolée (:6543) :
 * pgbouncer en mode transaction ne tient pas une transaction interactive, et
 * le garde-fou n°3 n'en serait plus un. Même raison que `run-readonly-sql.ts`.
 *
 * Idempotent : si la valeur est déjà `true`, le script ne réécrit pas et ne
 * pose pas un second AuditLog.
 *
 * Usage :
 *   pnpm --filter @qualiof/db run fix:d19ter-prod-00661             # DRY
 *   pnpm --filter @qualiof/db run fix:d19ter-prod-00661 --execute   # applique
 */
import { PrismaClient } from '@prisma/client';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const CODE = 'PROD-00661';
const MOTIF =
  "D-19 ter — premier usage réel. Réponse à D-18 : ce produit événementiel " +
  "avait été recommandé à tort sur la douleur e-réputation d'une agence " +
  "immobilière. Ce n'était pas un défaut de moteur, c'était un produit " +
  "diffusable qui n'aurait pas dû l'être. isActive reste true : la fiche " +
  'catalogue demeure consultable (une session réelle a eu lieu, indicateur 1). ' +
  'Arbitré par Laurent le 12/09/2026.';

const EXECUTE = process.argv.includes('--execute');

function masquer(url: string): string {
  return url.replace(/:\/\/[^@]*@/, '://***:***@');
}

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Ni DIRECT_URL ni DATABASE_URL.');
  console.log(`🔎 Cible : ${masquer(url)}`);
  console.log(`   Mode  : ${EXECUTE ? '⚠️  ÉCRITURE RÉELLE' : 'DRY — aucune écriture'}\n`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const resultat = await prisma.$transaction(async (tx) => {
      // Garde-fou n°1 + n°2 — les DEUX champs, et le compte avant tout.
      const lignes = await tx.trainingProduct.findMany({
        where: { tenantId: TENANT_ID, code: CODE },
        select: {
          id: true,
          code: true,
          title: true,
          isActive: true,
          excludedFromClientOutputs: true,
        },
      });

      if (lignes.length !== 1) {
        throw new Error(
          `ATTENDU 1 ligne, TROUVÉ ${lignes.length} pour ` +
            `{ tenantId: ${TENANT_ID}, code: ${CODE} }. Rien n'est écrit.`,
        );
      }

      const avant = lignes[0]!;
      console.log('── Ligne visée, AVANT');
      console.log(`   id     : ${avant.id}`);
      console.log(`   code   : ${avant.code}`);
      console.log(`   titre  : ${avant.title}`);
      console.log(`   actif  : ${avant.isActive}`);
      console.log(`   exclu  : ${avant.excludedFromClientOutputs}\n`);

      if (avant.excludedFromClientOutputs) {
        return { applique: false, motif: 'déjà à true — rien à faire', avant };
      }
      if (!EXECUTE) {
        return { applique: false, motif: 'DRY — relancer avec --execute', avant };
      }

      // L'écriture, ciblée par `id` : la ligne vient d'être identifiée dans
      // CETTE transaction, on ne rejoue pas le filtre.
      await tx.trainingProduct.update({
        where: { id: avant.id },
        data: { excludedFromClientOutputs: true },
      });

      // Garde-fou n°3 — la trace, même transaction.
      await tx.auditLog.create({
        data: {
          tenantId: TENANT_ID,
          userId: null,
          entity: 'TrainingProduct',
          entityId: avant.id,
          action: 'trainingProduct.excludedFromClientOutputs',
          diff: {
            source: 'fix-d19ter-prod-00661.ts',
            code: avant.code,
            title: avant.title,
            champ: 'excludedFromClientOutputs',
            avant: false,
            apres: true,
            isActiveInchange: avant.isActive,
            motif: MOTIF,
          },
        },
      });

      return { applique: true, motif: 'écrit', avant };
    });

    const apres = await prisma.trainingProduct.findFirst({
      where: { tenantId: TENANT_ID, code: CODE },
      select: {
        id: true,
        code: true,
        title: true,
        isActive: true,
        excludedFromClientOutputs: true,
        priceHT: true,
        durationHours: true,
        updatedAt: true,
      },
    });

    console.log('── Ligne relue, APRÈS');
    console.log(`   ${resultat.applique ? '✅ écrit' : 'ℹ️  non écrit'} — ${resultat.motif}\n`);
    console.log(apres);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n❌ Refusé :', e instanceof Error ? e.message : e);
  process.exit(1);
});
