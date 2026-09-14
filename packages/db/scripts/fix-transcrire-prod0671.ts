/**
 * fix-transcrire-prod0671.ts — les rubriques quittent le programMd pour leurs
 * colonnes. TRANSCRIPTION, pas rédaction.
 *
 * ## Le défaut, et pourquoi il n'est pas un défaut d'information
 *
 * `PROD-0671` (« Tracfin ») porte un `programMd` de 4 482 caractères qui
 * contient déjà, rédigés et sourcés : cinq objectifs pédagogiques à verbes
 * d'action (dont un nommant l'outil réel, la plateforme ERMES), les méthodes
 * mobilisées, et les modalités d'évaluation. Les colonnes dédiées — celles que
 * lit `/catalogue` — sont VIDES.
 *
 * Conséquence : la fiche publique affiche « Objectifs détaillés disponibles sur
 * demande » alors que les objectifs sont écrits deux champs plus loin. Sur
 * l'indicateur 1, « sur demande » est exactement le contraire de ce qui est
 * demandé — c'est le seul endroit du catalogue qui dise au visiteur que
 * l'information n'est pas accessible.
 *
 * **Défaut de RENDU, pas de contenu.** Réparable sans écrire une ligne.
 *
 * ## Pourquoi le script PARSE au lieu qu'on recopie
 *
 * Une transcription à la main est une rédaction qui s'ignore : une virgule
 * déplacée, un mot « amélioré », et la fiche ne dit plus ce que le programme
 * dit. Le script extrait les sections du `programMd` lui-même. Le dry-run les
 * imprime intégralement pour relecture humaine ; personne ne retape rien.
 *
 * ## ⚠ CE QUE CE SCRIPT NE TRANSCRIT PAS, ET C'EST DÉLIBÉRÉ
 *
 * La section « Accessibilité aux personnes en situation de handicap » du
 * `programMd` nomme **Julien LAFITTE — formation@start-academy.fr**. Or Julien
 * Lafitte a quitté l'organisme, et le référent handicap de l'OF est **Jean-Guy
 * Ourmières** (`checklist-formation-template.ts`, « référent unique, identique
 * sur tous les docs »).
 *
 * La transcrire publierait un contact de conformité périmé sur la fiche — le
 * défaut d'indicateur 26 que la correction de `ACCESSIBILITE_PSH` répare au
 * même moment. Colonne laissée NULLE : la fiche prend alors le repli du
 * catalogue, qui nomme le bon référent. **Ne pas transcrire est ici le
 * meilleur résultat**, pas un renoncement.
 *
 * ## Garde-fous
 *
 * §5.4 (ciblage `{ tenantId, code }`, TITRE vérifié avant écriture), 1 ligne
 * exactement, `AuditLog` dans la même transaction, `DIRECT_URL`, dry-run par
 * défaut, idempotent. Et une règle propre à ce script : **il n'écrit que dans
 * une colonne VIDE**. Une colonne déjà remplie est du contenu, la règle
 * anti-vidage la protège — le script s'arrête plutôt que de l'écraser.
 *
 * Usage :
 *   pnpm --filter @qualiof/db run fix:transcrire-prod0671             # DRY
 *   pnpm --filter @qualiof/db run fix:transcrire-prod0671 --execute
 */
import { PrismaClient } from '@prisma/client';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const CODE = 'PROD-0671';
const TITRE_ATTENDU = 'Tracfin';

const EXECUTE = process.argv.includes('--execute');

/**
 * Le corps d'une section `## …` du markdown, sans son titre.
 *
 * `titre` est une expression : les intitulés varient d'un programme à l'autre
 * (« Méthodes mobilisées », « Moyens et supports pédagogiques »…), et c'est la
 * RUBRIQUE qu'on cherche, pas une chaîne exacte.
 */
function section(md: string, titre: RegExp): string | null {
  const lignes = md.split('\n');
  const debut = lignes.findIndex((l) => /^#{2,3}\s/.test(l) && titre.test(l));
  if (debut === -1) return null;
  const suite = lignes.slice(debut + 1);
  const fin = suite.findIndex((l) => /^#{2,3}\s/.test(l));
  const corps = (fin === -1 ? suite : suite.slice(0, fin)).join('\n').trim();
  return corps.length > 0 ? corps : null;
}

/** Les puces d'un corps de section, débarrassées de leur tiret. */
function puces(corps: string): string[] {
  return corps
    .split('\n')
    .map((l) => l.trim())
    // Le bloc de citation `>` n'est pas un objectif : c'est le rappel
    // réglementaire de ce qu'EST un objectif de formation.
    .filter((l) => l.startsWith('- ') && !l.startsWith('>'))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
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
    await prisma.$transaction(async (tx) => {
      const lignes = await tx.trainingProduct.findMany({
        where: { tenantId: TENANT_ID, code: CODE },
        select: {
          id: true,
          code: true,
          title: true,
          programMd: true,
          objectives: true,
          pedagogicalMethods: true,
          evaluationMethods: true,
        },
      });
      if (lignes.length !== 1) {
        throw new Error(`ATTENDU 1 ligne pour ${CODE}, TROUVÉ ${lignes.length}. Rien n'est écrit.`);
      }
      const p = lignes[0]!;

      console.log(`── ${p.code}`);
      console.log(`   titre attendu : ${TITRE_ATTENDU}`);
      console.log(`   titre en base : ${p.title}`);
      if (p.title.trim().toLowerCase() !== TITRE_ATTENDU.toLowerCase()) {
        throw new Error(
          `TITRE DIVERGENT : attendu « ${TITRE_ATTENDU} », trouvé « ${p.title} ». Rien n'est écrit.`,
        );
      }
      console.log('   ✓ titre confirmé\n');

      const md = p.programMd ?? '';
      const corpsObjectifs = section(md, /objectifs/i);
      const objectifs = corpsObjectifs ? puces(corpsObjectifs) : [];
      const methodes = section(md, /méthodes|moyens/i);
      const evaluation = section(md, /évaluation/i);

      const dejaRempli = (v: unknown): boolean =>
        typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) && v.length > 0;

      const data: Record<string, unknown> = {};
      // `Prisma.InputJsonObject` et non `Record<string, unknown>` : le champ
      // `diff` est un Json, et TypeScript refuse d'y verser un type dont il ne
      // sait pas qu'il est sérialisable. C'est exactement le garde que la
      // couverture tsc des scripts a ouvert le 11/09.
      const trace: Record<string, string | string[]> = {};

      console.log(`── Objectifs extraits : ${objectifs.length}`);
      for (const o of objectifs) console.log(`   • ${o}`);
      if (objectifs.length === 0) throw new Error("Aucun objectif extrait — rien n'est écrit.");
      if (dejaRempli(p.objectives)) {
        console.log('   ℹ️  colonne déjà remplie — laissée telle quelle\n');
      } else {
        data.objectives = objectifs;
        trace.objectives = objectifs;
        console.log('   → sera écrit\n');
      }

      console.log('── Méthodes mobilisées');
      console.log(methodes ? methodes.split('\n').map((l) => `   ${l}`).join('\n') : '   (absente)');
      if (methodes && !dejaRempli(p.pedagogicalMethods)) {
        data.pedagogicalMethods = methodes;
        trace.pedagogicalMethods = methodes;
        console.log('   → sera écrit\n');
      } else {
        console.log('   ℹ️  non écrit (absente du markdown, ou colonne déjà remplie)\n');
      }

      console.log("── Modalités d'évaluation");
      console.log(evaluation ? evaluation.split('\n').map((l) => `   ${l}`).join('\n') : '   (absente)');
      if (evaluation && !dejaRempli(p.evaluationMethods)) {
        data.evaluationMethods = evaluation;
        trace.evaluationMethods = evaluation;
        console.log('   → sera écrit\n');
      } else {
        console.log('   ℹ️  non écrit (absente du markdown, ou colonne déjà remplie)\n');
      }

      console.log('── Accessibilité');
      console.log(
        '   ⛔ NON TRANSCRITE, délibérément : la section du programMd nomme\n' +
          "      « Julien LAFITTE », qui a quitté l'organisme. La colonne reste NULLE,\n" +
          '      la fiche prend le repli du catalogue, qui nomme Jean-Guy Ourmières.\n',
      );

      if (Object.keys(data).length === 0) {
        console.log('ℹ️  Rien à écrire — toutes les colonnes visées sont déjà remplies.');
        return;
      }
      if (!EXECUTE) {
        console.log(
          `ℹ️  DRY — ${Object.keys(data).length} colonne(s) SERAIENT écrite(s) : ` +
            `${Object.keys(data).join(', ')}. Relancer avec --execute.`,
        );
        return;
      }

      await tx.trainingProduct.update({ where: { id: p.id }, data });
      await tx.auditLog.create({
        data: {
          tenantId: TENANT_ID,
          userId: null,
          entity: 'TrainingProduct',
          entityId: p.id,
          action: 'trainingProduct.transcribeFromProgramMd',
          diff: {
            source: 'fix-transcrire-prod0671.ts',
            code: p.code,
            title: p.title,
            champsEcrits: Object.keys(data),
            valeurs: trace,
            accessibiliteNonTranscrite:
              "section du programMd nommant Julien LAFITTE, parti de l'organisme ; " +
              'colonne laissée nulle pour que le repli nomme Jean-Guy Ourmières',
            nature: 'TRANSCRIPTION depuis programMd — aucune rédaction, aucun ajout',
            motif: 'Feu vert Laurent du 12/09/2026. Indicateur 1 : la fiche publique ' +
              'affichait « Objectifs détaillés disponibles sur demande » alors que les ' +
              'objectifs étaient écrits dans programMd.',
          },
        },
      });
      console.log(`✅ ${Object.keys(data).length} colonne(s) écrite(s) : ${Object.keys(data).join(', ')}`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\n❌ Refusé :', e instanceof Error ? e.message : e);
  process.exit(1);
});
