/**
 * Benchmark des 3 generators Ollama.
 *
 * Génère 1 doc de chaque type pour la session la plus récente, mesure
 * latence et taille du JSON. Utile pour choisir entre qwen3:30b-a3b et
 * mistral-small:24b.
 */

import { prisma } from '@qualiof/db';
import {
  generateAnalyseBesoinContent,
  generateGrilleContent,
  generateQcmContent,
} from '../src/lib/closure/ollama-generators';

async function main() {
  const session = await prisma.trainingSession.findFirst({
    where: { participants: { some: {} } },
    include: {
      product: true,
      participants: { take: 1, include: { person: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!session) {
    console.error('Aucune session');
    process.exit(1);
  }
  const p = session.participants[0]!.person;
  console.log(`Session : ${session.code} — Stagiaire : ${p.firstName} ${p.lastName}`);
  console.log(`Modèle : ${process.env.CLOSURE_OLLAMA_MODEL ?? 'mistral-small:24b (default)'}\n`);

  const formation = {
    titre: session.product.title,
    programmeMd: session.product.programMd ?? '',
    nombreHeures: session.product.durationHours,
  };
  const stagiaire = {
    prenom: p.firstName,
    nom: p.lastName,
    entreprise: null,
    fonction: null,
    anciennete: p.professionalExperience ?? null,
    diplomes: p.diplomas ?? null,
    professionalStatus: p.professionalStatus ?? null,
  };

  console.log('▶️  generate-qcm…');
  let t = Date.now();
  const qcm = await generateQcmContent(formation);
  console.log(`   → ${Date.now() - t}ms — ${qcm ? `${qcm.questions.length} questions` : 'NULL (fallback stub)'}`);

  console.log('▶️  generate-analyse-besoin…');
  t = Date.now();
  const ab = await generateAnalyseBesoinContent(formation, stagiaire);
  console.log(
    `   → ${Date.now() - t}ms — ${ab ? `objectifs:${ab.objectifs_stagiaire?.length} attentes:${ab.attentes?.length} freins:${(ab.freins_identifies ?? []).length}` : 'NULL (fallback stub)'}`,
  );

  console.log('▶️  generate-grille…');
  t = Date.now();
  const grille = await generateGrilleContent(formation, stagiaire);
  console.log(
    `   → ${Date.now() - t}ms — ${grille ? `${grille.competences.length} compétences, obs_globales=${grille.observations_globales ? 'oui' : 'non'}` : 'NULL (fallback stub)'}`,
  );

  // Affiche un échantillon
  if (qcm) {
    console.log('\nSample QCM Q1 :', qcm.questions[0]?.question);
  }
  if (ab) {
    console.log('Sample analyse-besoin contexte :', (ab.contexte_professionnel ?? '').slice(0, 100), '…');
  }
  if (grille) {
    console.log('Sample grille comp. 1 :', grille.competences[0]?.nom);
    console.log('Sample grille obs. :', grille.observations_globales?.commentaire?.slice(0, 80), '…');
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
