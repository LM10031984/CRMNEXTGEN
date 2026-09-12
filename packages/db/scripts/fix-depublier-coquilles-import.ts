/**
 * fix-depublier-coquilles-import.ts — deux coquilles quittent la vitrine.
 *
 * ## Ce que ce script fait, et rien d'autre
 *
 * `TrainingProduct.isActive` passe de `true` à `false` pour DEUX produits du
 * tenant `db191440-…` : `PROD-7a78c8b2` et `PROD-f8be726b`. Aucune autre
 * colonne, sur aucune autre ligne.
 *
 * ## Pourquoi — ce ne sont pas des offres
 *
 * Une session client (« Formation L'agence de l'olivier ») et un événement
 * (« Event Avec Sebastien Tedesco ») que l'import SmartOF du 12/08/2026 a
 * transformés en produits de catalogue. Relevé du 12/09 : **0 h, 0 €,
 * `programMd` vide, aucun champ Qualiopi renseigné** — et pourtant `isActive`,
 * donc rendus sur `/catalogue` avec « Tarif sur demande » et « Objectifs
 * détaillés disponibles sur demande ». Sur l'indicateur 1, une fiche qui
 * n'annonce rien est pire que pas de fiche.
 *
 * Arbitré par Laurent le 12/09/2026.
 *
 * **Elles restent en base avec leur session.** `isActive` ne pilote que la
 * VITRINE : les sessions, conventions et attestations déjà émises ne sont pas
 * touchées, et la traçabilité Qualiopi reste intacte. On retire une fiche de
 * la devanture, on n'efface pas un dossier.
 *
 * **`excludedFromClientOutputs` ne bouge PAS**, délibérément. Ces produits
 * n'ont aucun contenu : le moteur de composition ne peut rien en tirer de toute
 * façon. Ajouter un second changement sur la même ligne rendrait l'AuditLog
 * moins lisible — une ligne d'audit qui porte deux décisions n'en documente
 * bien aucune.
 *
 * ## Les garde-fous — dont celui que la §5.4 vient d'imposer
 *
 *  1. **Ciblage par `tenantId` ET `code`** : `code` n'est unique que par tenant.
 *  2. **Exactement 1 ligne par code, 2 au total.**
 *  3. **Le TITRE est vérifié avant d'écrire**, et c'est la nouveauté. §5.4 :
 *     « exactement 1 ligne » ne suffit pas, *une ligne unique peut être la
 *     mauvaise ligne* — les deux bases séquencent indépendamment, et le même
 *     code y désigne parfois deux produits différents (`PROD-0681`). Un titre
 *     qui ne correspond pas arrête TOUT : on n'écrit aucune des deux lignes.
 *  4. **Tout ou rien** : les deux mises à jour et les deux `AuditLog` sont dans
 *     une seule transaction. Dépublier une coquille sur deux laisserait un état
 *     que personne n'a décidé.
 *  5. **Le dry-run imprime le titre**, pour qu'un humain le lise. C'est le seul
 *     garde-fou que le script ne peut pas s'appliquer à lui-même.
 *
 * Connexion par `DIRECT_URL` (:5432) : pgbouncer en mode transaction ne tient
 * pas une transaction interactive. Même raison que `run-readonly-sql.ts`.
 *
 * Idempotent : une ligne déjà `isActive: false` est laissée telle quelle, sans
 * second AuditLog.
 *
 * Usage :
 *   pnpm --filter @qualiof/db run fix:depublier-coquilles             # DRY
 *   pnpm --filter @qualiof/db run fix:depublier-coquilles --execute   # applique
 */
import { PrismaClient } from '@prisma/client';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

/** Les deux lignes visées, avec le titre ATTENDU — c'est lui qui autorise l'écriture. */
const CIBLES = [
  { code: 'PROD-7a78c8b2', titre: "Formation L'agence de l'olivier" },
  { code: 'PROD-f8be726b', titre: 'Event Avec Sebastien Tedesco' },
] as const;

const MOTIF =
  "Ce n'est pas une offre : une session client et un événement que l'import " +
  'SmartOF du 12/08/2026 a transformés en produits de catalogue (0 h, 0 €, ' +
  'programMd vide, aucun champ Qualiopi). Le produit reste en base avec sa ' +
  'session — isActive ne pilote que la vitrine, la traçabilité Qualiopi est ' +
  'intacte. Arbitré par Laurent le 12/09/2026.';

const EXECUTE = process.argv.includes('--execute');

/**
 * Comparaison de titres tolérante à ce qui ne porte aucun sens : apostrophe
 * typographique contre apostrophe droite, espaces multiples, espaces de bord.
 * Elle ne tolère RIEN d'autre — c'est une vérification d'identité, pas une
 * recherche approchante.
 */
function normaliserTitre(t: string): string {
  return t.replace(/[’‘´`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

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
      const aEcrire: { id: string; code: string; title: string }[] = [];

      // ── Phase 1 : on CONTRÔLE les deux lignes avant d'en écrire une seule.
      for (const cible of CIBLES) {
        const lignes = await tx.trainingProduct.findMany({
          where: { tenantId: TENANT_ID, code: cible.code },
          select: { id: true, code: true, title: true, isActive: true },
        });

        if (lignes.length !== 1) {
          throw new Error(
            `ATTENDU 1 ligne pour { tenantId, code: ${cible.code} }, TROUVÉ ${lignes.length}. ` +
              `Rien n'est écrit, sur aucune des ${CIBLES.length} cibles.`,
          );
        }
        const ligne = lignes[0]!;

        console.log(`── ${cible.code}`);
        console.log(`   titre attendu : ${cible.titre}`);
        console.log(`   titre en base : ${ligne.title}`);
        console.log(`   isActive      : ${ligne.isActive}`);

        // §5.4 — le contrôle qui distingue « une ligne » de « LA ligne ».
        if (normaliserTitre(ligne.title) !== normaliserTitre(cible.titre)) {
          throw new Error(
            `TITRE DIVERGENT sur ${cible.code} : attendu « ${cible.titre} », ` +
              `trouvé « ${ligne.title} ». Le code désigne une AUTRE ligne que celle ` +
              `arbitrée. Rien n'est écrit, sur aucune cible.`,
          );
        }
        console.log('   ✓ titre confirmé\n');

        if (!ligne.isActive) {
          console.log(`   ℹ️  déjà dépubliée — laissée telle quelle\n`);
          continue;
        }
        aEcrire.push({ id: ligne.id, code: ligne.code, title: ligne.title });
      }

      if (!EXECUTE || aEcrire.length === 0) {
        return { ecrites: 0, aEcrire: aEcrire.map((l) => l.code) };
      }

      // ── Phase 2 : les deux écritures et leurs deux traces, ou rien.
      for (const l of aEcrire) {
        await tx.trainingProduct.update({ where: { id: l.id }, data: { isActive: false } });
        await tx.auditLog.create({
          data: {
            tenantId: TENANT_ID,
            userId: null,
            entity: 'TrainingProduct',
            entityId: l.id,
            action: 'trainingProduct.unpublish',
            diff: {
              source: 'fix-depublier-coquilles-import.ts',
              code: l.code,
              title: l.title,
              champ: 'isActive',
              avant: true,
              apres: false,
              excludedFromClientOutputsInchange: true,
              motif: MOTIF,
            },
          },
        });
      }
      return { ecrites: aEcrire.length, aEcrire: aEcrire.map((l) => l.code) };
    });

    const apres = await prisma.trainingProduct.findMany({
      where: { tenantId: TENANT_ID, code: { in: CIBLES.map((c) => c.code) } },
      select: {
        code: true,
        title: true,
        isActive: true,
        excludedFromClientOutputs: true,
        updatedAt: true,
      },
      orderBy: { code: 'asc' },
    });

    console.log('── Relu APRÈS');
    if (EXECUTE) {
      console.log(`   ✅ ${resultat.ecrites} ligne(s) dépubliée(s)\n`);
    } else {
      console.log(
        `   ℹ️  DRY — ${resultat.aEcrire.length} ligne(s) SERAIENT dépubliée(s) ` +
          `(${resultat.aEcrire.join(', ') || 'aucune'}). Relancer avec --execute.\n`,
      );
    }
    console.table(apres);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n❌ Refusé :', e instanceof Error ? e.message : e);
  process.exit(1);
});
