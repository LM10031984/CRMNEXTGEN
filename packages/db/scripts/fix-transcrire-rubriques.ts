/**
 * fix-transcrire-rubriques.ts — les rubriques quittent le programMd pour leurs
 * colonnes. TRANSCRIPTION, jamais rédaction.
 *
 * Généralisation de `fix-transcrire-prod0671.ts`, qui a fait la première fiche.
 * Relevé du 12/09/2026 : **5 fiches publiées sur 39** portent dans leur
 * `programMd` une rubrique que la colonne dédiée laisse vide. `/catalogue`
 * affiche alors un texte générique — ou « Objectifs détaillés disponibles sur
 * demande » — alors que le spécifique existe deux champs plus loin.
 *
 * **Défaut de RENDU, pas d'information.** Réparable sans écrire une ligne de
 * contenu.
 *
 * ## Le script parse, personne ne retape
 *
 * Une transcription à la main est une rédaction qui s'ignore : une virgule
 * déplacée, un mot « amélioré », et la fiche ne dit plus ce que le programme
 * dit. Le dry-run imprime les sections intégralement pour relecture humaine.
 *
 * ## ⛔ L'ACCESSIBILITÉ N'EST JAMAIS TRANSCRITE
 *
 * Mesuré sur les cinq fiches concernées : **toutes** portent dans leur section
 * accessibilité « Julien LAFITTE — formation@start-academy.fr », un contact
 * qui a quitté l'organisme. La transcrire publierait un contact de conformité
 * périmé — le défaut d'indicateur 26 corrigé par ailleurs le même jour.
 *
 * La règle est plus large que ce constat, et c'est pour ça qu'elle est écrite
 * ici plutôt que dans un `if` : **le référent handicap a une source unique**
 * (`apps/web/src/lib/referent-handicap.ts`, spec §5.5). Une colonne
 * `accessibility` par produit est une copie de plus, donc une divergence de
 * plus. Laisser la colonne NULLE fait jouer le repli du catalogue, qui lit la
 * source unique. **Ne pas transcrire est le meilleur résultat, pas un
 * renoncement.**
 *
 * ## Garde-fous
 *
 * §5.4 (ciblage `{ tenantId, code }`, TITRE vérifié avant écriture), 1 ligne
 * exactement, `AuditLog` dans la même transaction, `DIRECT_URL`, dry-run par
 * défaut, idempotent, et **écriture uniquement dans une colonne VIDE** — une
 * colonne remplie est du contenu, la règle anti-vidage la protège.
 *
 * Usage — UNE fiche à la fois, délibérément :
 *   pnpm --filter @qualiof/db run fix:transcrire PROD-0667
 *   pnpm --filter @qualiof/db run fix:transcrire PROD-0667 --execute
 */
import { PrismaClient } from '@prisma/client';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';

/** Les fiches arbitrées, avec leur titre ATTENDU — c'est lui qui autorise. */
const FICHES: Record<string, string> = {
  'PROD-0667': 'Anglais professionnel boosté par l’IA',
  'PROD-0668': 'Optimisation des systèmes d’information avec l’IA',
  'PROD-0670': 'IA générative',
  'PROD-0673': "Optimiser son activité immobilière grâce à l'Intelligence Artificielle - 40h",
};

const CODE = process.argv[2] ?? '';
const EXECUTE = process.argv.includes('--execute');

/**
 * Le corps d'une section, repéré par un titre EXACT — et refus si ambigu.
 *
 * ⚠ La première version cherchait `/méthodes|moyens/i`. Ces programmes portent
 * DEUX rubriques voisines — « Modalités pédagogiques » (les méthodes) et
 * « Moyens et supports pédagogiques » (les supports, une colonne DISTINCTE) —
 * et le motif attrapait la seconde. Le script s'apprêtait à écrire un support
 * dans la colonne des méthodes. Aucune erreur ne se serait levée : le texte
 * était valide, simplement rangé au mauvais endroit.
 *
 * D'où les deux règles : le titre se reconnaît EN ENTIER, et **deux titres qui
 * répondent au même motif arrêtent tout**. Une ambiguïté qu'on tranche au
 * hasard est une transcription qu'on ne peut pas relire.
 */
function section(md: string, titre: RegExp): string | null {
  const lignes = md.split('\n');
  const indices = lignes.map((l, i) => (titre.test(l) ? i : -1)).filter((i) => i !== -1);
  if (indices.length === 0) return null;
  if (indices.length > 1) {
    throw new Error(
      `Titre AMBIGU (${indices.length} sections répondent à ${titre}) : ` +
        lignes.filter((l) => titre.test(l)).map((l) => `« ${l.trim()} »`).join(', ') +
        `. Rien n'est écrit — une ambiguïté tranchée au hasard ne se relit pas.`,
    );
  }
  const suite = lignes.slice(indices[0]! + 1);
  const fin = suite.findIndex((l) => /^#{2,3}\s/.test(l));
  const corps = (fin === -1 ? suite : suite.slice(0, fin)).join('\n').trim();
  return corps.length > 0 ? corps : null;
}

/**
 * Les contacts qui ont quitté l'organisme. Une section qui en nomme un n'est
 * PAS transcrite : la publier remettrait un contact périmé sur la fiche.
 * Généralisation de la vigilance appliquée à l'accessibilité — le défaut peut
 * se loger dans n'importe quelle rubrique qui donne un contact.
 */
const CONTACTS_PARTIS = /lafitte|julien@start-academy\.fr/i;

function puces(corps: string): string[] {
  return corps
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') && !l.startsWith('>'))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

function masquer(url: string): string {
  return url.replace(/:\/\/[^@]*@/, '://***:***@');
}

async function main(): Promise<void> {
  const titreAttendu = FICHES[CODE];
  if (!titreAttendu) {
    throw new Error(
      `Code « ${CODE || '(absent)'} » hors périmètre arbitré. ` +
        `Fiches prévues : ${Object.keys(FICHES).join(', ')}.`,
    );
  }

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
          id: true, code: true, title: true, programMd: true, objectives: true,
          pedagogicalMethods: true, evaluationMethods: true, prerequisites: true,
          pedagogicalSupport: true, trainerProfile: true, targetAudience: true,
          accessConditions: true,
        },
      });
      if (lignes.length !== 1) {
        throw new Error(`ATTENDU 1 ligne pour ${CODE}, TROUVÉ ${lignes.length}. Rien n'est écrit.`);
      }
      const p = lignes[0]!;

      console.log(`── ${p.code}`);
      console.log(`   titre attendu : ${titreAttendu}`);
      console.log(`   titre en base : ${p.title}`);
      const norm = (t: string) => t.replace(/[’‘´`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm(p.title) !== norm(titreAttendu)) {
        throw new Error(
          `TITRE DIVERGENT : attendu « ${titreAttendu} », trouvé « ${p.title} ». Rien n'est écrit.`,
        );
      }
      console.log('   ✓ titre confirmé\n');

      const md = p.programMd ?? '';
      const dejaRempli = (v: unknown): boolean =>
        typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) && v.length > 0;

      const data: Record<string, unknown> = {};
      const trace: Record<string, string | string[]> = {};

      const objectifs = (() => {
        const c = section(md, /^#{2,3}\s+Objectifs/i);
        return c ? puces(c) : [];
      })();
      console.log(`── Objectifs extraits : ${objectifs.length}`);
      for (const o of objectifs) console.log(`   • ${o}`);
      if (objectifs.length > 0 && !dejaRempli(p.objectives)) {
        data.objectives = objectifs;
        trace.objectives = objectifs;
        console.log('   → sera écrit\n');
      } else {
        console.log('   ℹ️  non écrit (aucun objectif, ou colonne déjà remplie)\n');
      }

      // Un titre ENTIER par colonne. « Modalités pédagogiques », « Modalités
      // d'évaluation » et « Modalités d'accès » commencent tous pareil : un
      // motif court les confondrait.
      const rubriques: { cle: string; titre: RegExp; actuel: unknown; libelle: string }[] = [
        { cle: 'pedagogicalMethods', titre: /^#{2,3}\s+(Modalit[ée]s p[ée]dagogiques|M[ée]thodes (mobilis[ée]es|p[ée]dagogiques))\s*$/i, actuel: p.pedagogicalMethods, libelle: 'Méthodes pédagogiques' },
        { cle: 'pedagogicalSupport', titre: /^#{2,3}\s+Moyens( et supports)? p[ée]dagogiques\s*$/i, actuel: p.pedagogicalSupport, libelle: 'Moyens et supports' },
        { cle: 'evaluationMethods', titre: /^#{2,3}\s+Modalit[ée]s d['’]([ée]valuation)/i, actuel: p.evaluationMethods, libelle: "Modalités d'évaluation" },
        { cle: 'prerequisites', titre: /^#{2,3}\s+Pr[ée]-?requis/i, actuel: p.prerequisites, libelle: 'Prérequis' },
        { cle: 'trainerProfile', titre: /^#{2,3}\s+Profil du formateur/i, actuel: p.trainerProfile, libelle: 'Profil du formateur' },
        { cle: 'targetAudience', titre: /^#{2,3}\s+Public\s*$/i, actuel: p.targetAudience, libelle: 'Public visé' },
        { cle: 'accessConditions', titre: /^#{2,3}\s+Modalit[ée]s d['’]acc[èe]s/i, actuel: p.accessConditions, libelle: "Modalités d'accès" },
      ];
      for (const r of rubriques) {
        const corps = section(md, r.titre);
        console.log(`── ${r.libelle}`);
        console.log(corps ? corps.split('\n').map((l) => `   ${l}`).join('\n') : '   (absente)');
        if (corps && CONTACTS_PARTIS.test(corps)) {
          console.log(
            "   ⛔ NON transcrite : la section nomme un contact qui a quitté\n" +
              "      l'organisme. La colonne reste vide, le repli joue.\n",
          );
        } else if (corps && !dejaRempli(r.actuel)) {
          data[r.cle] = corps;
          trace[r.cle] = corps;
          console.log('   → sera écrit\n');
        } else {
          console.log('   ℹ️  non écrit (absente du markdown, ou colonne déjà remplie)\n');
        }
      }

      console.log('── Accessibilité');
      console.log(
        "   ⛔ JAMAIS transcrite. Le référent handicap a une source unique\n" +
          '      (apps/web/src/lib/referent-handicap.ts, spec §5.5) ; une colonne\n' +
          '      par produit serait une copie de plus. Et les cinq fiches concernées\n' +
          "      nomment toutes « Julien LAFITTE », parti de l'organisme.\n" +
          '      Colonne laissée NULLE → la fiche prend le repli, qui lit la source.\n',
      );

      if (Object.keys(data).length === 0) {
        console.log('ℹ️  Rien à écrire.');
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
            source: 'fix-transcrire-rubriques.ts',
            code: p.code,
            title: p.title,
            champsEcrits: Object.keys(data),
            valeurs: trace,
            accessibiliteNonTranscrite:
              'jamais transcrite : source unique du référent (§5.5), et la section ' +
              "nomme Julien LAFITTE, parti de l'organisme",
            nature: 'TRANSCRIPTION depuis programMd — aucune rédaction, aucun ajout',
            motif: 'Feu vert Laurent du 12/09/2026, étendu aux 4 fiches restantes du ' +
              'relevé « rubrique dans programMd, colonne vide » (5 sur 39 publiées).',
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
