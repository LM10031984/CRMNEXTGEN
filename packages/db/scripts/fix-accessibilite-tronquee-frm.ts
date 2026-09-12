/**
 * fix-accessibilite-tronquee-frm.ts — deux overrides avariés s'effacent.
 *
 * ## Ce que ce script fait
 *
 * `TrainingProduct.accessibility` passe de son texte actuel à `NULL` sur
 * `FRM-0001` et `FRM-0002`. Rien d'autre, nulle part ailleurs.
 *
 * ## Pourquoi vider, alors que la règle est de ne jamais vider
 *
 * La règle anti-vidage du 11/09/2026 protège du **CONTENU** : un import ne doit
 * pas écraser ce qu'un humain a écrit en base. Elle ne protège pas une
 * **avarie**.
 *
 * Ces deux fiches portent 141 caractères où le texte est coupé au milieu, deux
 * fois, par des points de suspension littéraux :
 *
 *     La loi du 5 septembre 2018 pour la « liberté de choisir son avenir
 *     professionnel »…
 *     Notre organisme tente de donner à tous les mêmes chances…
 *
 * C'est une extraction tronquée écrite en base, pas une rédaction. Comparaison
 * dans la même famille : `FRM-0003` porte les 441 caractères complets du même
 * texte, et `FRM-0004` à `FRM-0007` un texte propre de 212.
 *
 * ## La preuve exigée avant d'agir, et elle est empirique
 *
 * `/catalogue` rend `product.accessibility?.trim() || ACCESSIBILITE_PSH`. Donc
 * un champ nul rend le repli — encore faut-il vérifier ce que le repli VAUT.
 *
 * Vérifié sur une fiche réelle : `PROD-0058` a `accessibility IS NULL` en
 * production, et la page rend pour elle le texte COMPLET — « Formation
 * accessible aux personnes en situation de handicap. Référent handicap :
 * Julien Lafitte — julien@start-academy.fr — Adaptations sur demande
 * (matériel, rythme, supports). Réseau partenaires : Agefiph, Cap emploi 06,
 * MDPH 06. » 231 caractères, le référent handicap NOMMÉ avec son contact.
 *
 * Vider remplace donc 141 caractères amputés par 231 complets : **le client lit
 * mieux après qu'avant**. C'est ce qui distingue l'avarie du contenu.
 *
 * ⚠ **Le repli n'est PAS le texte du tenant**, contrairement à ce qu'on pouvait
 * croire. `/catalogue` lit la constante `ACCESSIBILITE_PSH`
 * (`lib/catalogue-constants.ts`) ; les colonnes `Tenant.qualiopi*` existent
 * mais servent au PROGRAMME COMPOSÉ (`lib/docs/qualiopi-mentions.ts`), et
 * valent `NULL` en production. Après ce script, ces deux fiches suivront donc
 * la constante du code — comme les 29 autres fiches déjà dans ce cas. C'est
 * l'état cohérent, pas un effet de bord.
 *
 * Arbitré par Laurent le 12/09/2026.
 *
 * ## Garde-fous — §5.4, comme la dépublication
 *
 * Ciblage `{ tenantId, code }`, exactement 1 ligne par code, **titre vérifié
 * avant d'écrire**, tout ou rien dans une transaction, un `AuditLog` par ligne
 * portant le texte RETIRÉ (une avarie qu'on efface doit rester lisible dans
 * l'audit — sinon on ne peut plus prouver ce qu'on a fait), `DIRECT_URL`,
 * dry-run par défaut, idempotent.
 *
 * Usage :
 *   pnpm --filter @qualiof/db run fix:accessibilite-frm             # DRY
 *   pnpm --filter @qualiof/db run fix:accessibilite-frm --execute   # applique
 */
import { PrismaClient } from '@prisma/client';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

const CIBLES = [
  { code: 'FRM-0001', titre: "Exploiter La puissance de l'IA dans son activité immobilière" },
  { code: 'FRM-0002', titre: "Claude d'anthropic pour les conseillers immobiliers" },
] as const;

const MOTIF =
  "Override d'accessibilité TRONQUÉ (141 caractères coupés par deux « … » " +
  'littéraux) retiré au profit du repli complet de /catalogue (231 caractères, ' +
  'référent handicap nommé avec son contact). Vider une AVARIE n\'est pas vider ' +
  'du CONTENU : la règle anti-vidage du 11/09 protège ce qu\'un humain a écrit, ' +
  'pas une extraction coupée. Preuve empirique : PROD-0058 a accessibility NULL ' +
  'et rend le texte complet. Arbitré par Laurent le 12/09/2026.';

const EXECUTE = process.argv.includes('--execute');

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
      const aVider: { id: string; code: string; title: string; ancien: string }[] = [];

      for (const cible of CIBLES) {
        const lignes = await tx.trainingProduct.findMany({
          where: { tenantId: TENANT_ID, code: cible.code },
          select: { id: true, code: true, title: true, accessibility: true },
        });
        if (lignes.length !== 1) {
          throw new Error(
            `ATTENDU 1 ligne pour { tenantId, code: ${cible.code} }, TROUVÉ ${lignes.length}. ` +
              `Rien n'est écrit, sur aucune cible.`,
          );
        }
        const ligne = lignes[0]!;

        console.log(`── ${cible.code}`);
        console.log(`   titre attendu : ${cible.titre}`);
        console.log(`   titre en base : ${ligne.title}`);
        if (normaliserTitre(ligne.title) !== normaliserTitre(cible.titre)) {
          throw new Error(
            `TITRE DIVERGENT sur ${cible.code} : attendu « ${cible.titre} », trouvé ` +
              `« ${ligne.title} ». Rien n'est écrit, sur aucune cible.`,
          );
        }
        console.log('   ✓ titre confirmé');

        if (ligne.accessibility === null) {
          console.log('   ℹ️  déjà nul — laissé tel quel\n');
          continue;
        }
        console.log(`   accessibility : ${ligne.accessibility.length} caractères`);
        console.log(`   → ${JSON.stringify(ligne.accessibility.slice(0, 100))}\n`);

        // Garde supplémentaire, propre à CE correctif : on ne vide que ce qui
        // est effectivement tronqué. Un texte complet écrit entre-temps est du
        // CONTENU, et la règle anti-vidage le protège.
        if (!ligne.accessibility.includes('…')) {
          throw new Error(
            `${cible.code} : le texte d'accessibilité ne contient AUCUN « … » — ce n'est ` +
              `donc pas l'avarie visée, mais du contenu. Rien n'est écrit, sur aucune cible.`,
          );
        }
        aVider.push({
          id: ligne.id,
          code: ligne.code,
          title: ligne.title,
          ancien: ligne.accessibility,
        });
      }

      if (!EXECUTE || aVider.length === 0) {
        return { ecrites: 0, aVider: aVider.map((l) => l.code) };
      }

      for (const l of aVider) {
        await tx.trainingProduct.update({ where: { id: l.id }, data: { accessibility: null } });
        await tx.auditLog.create({
          data: {
            tenantId: TENANT_ID,
            userId: null,
            entity: 'TrainingProduct',
            entityId: l.id,
            action: 'trainingProduct.clearAccessibilityOverride',
            diff: {
              source: 'fix-accessibilite-tronquee-frm.ts',
              code: l.code,
              title: l.title,
              champ: 'accessibility',
              // Le texte retiré est CONSERVÉ ici : effacer une avarie sans en
              // garder la trace rendrait l'opération invérifiable.
              avant: l.ancien,
              apres: null,
              repliApplique: 'ACCESSIBILITE_PSH (lib/catalogue-constants.ts)',
              motif: MOTIF,
            },
          },
        });
      }
      return { ecrites: aVider.length, aVider: aVider.map((l) => l.code) };
    });

    const apres = await prisma.trainingProduct.findMany({
      where: { tenantId: TENANT_ID, code: { in: CIBLES.map((c) => c.code) } },
      select: { code: true, accessibility: true, updatedAt: true },
      orderBy: { code: 'asc' },
    });

    console.log('── Relu APRÈS');
    console.log(
      EXECUTE
        ? `   ✅ ${resultat.ecrites} override(s) retiré(s)\n`
        : `   ℹ️  DRY — ${resultat.aVider.length} override(s) SERAIENT retiré(s) ` +
            `(${resultat.aVider.join(', ') || 'aucun'}). Relancer avec --execute.\n`,
    );
    console.table(
      apres.map((a) => ({
        code: a.code,
        accessibility: a.accessibility === null ? '(null → repli complet)' : `${a.accessibility.length} car.`,
        updatedAt: a.updatedAt,
      })),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n❌ Refusé :', e instanceof Error ? e.message : e);
  process.exit(1);
});
