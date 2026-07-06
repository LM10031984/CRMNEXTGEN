/**
 * Remplit PROD-0671 (Tracfin 4h, 168€) :
 *  - objectives (5, depuis le programme)
 *  - derouleJson FIGÉ à l'identique de l'horaire réel 14h-18h (pas de LLM)
 * Puis rend un aperçu du Déroulé pédagogique pour validation.
 */
import fs from 'node:fs';

const { prisma } = await import('@qualiof/db');
const { renderProductDerouleHtml } = await import('../src/lib/closure/deroule-template');
const { renderHtmlToPdfWeasy } = await import('../src/lib/pdf-render');

const OBJECTIVES = [
  'Comprendre le rôle de TRACFIN et le cadre légal de la lutte contre le blanchiment de capitaux et le financement du terrorisme (LCB-FT)',
  "Identifier les obligations de vigilance et de déclaration de soupçon incombant aux professionnels de l'immobilier",
  'Reconnaître les indicateurs de blanchiment et les situations à risque dans les transactions immobilières',
  'Remplir une déclaration de soupçon sur la plateforme ERMES et désigner un déclarant/correspondant',
  'Réagir de manière adéquate face à des scénarios réalistes grâce à des mises en situation et jeux de rôle',
];

// Déroulé FIGÉ — fidèle à l'horaire fourni par Laurent (4h, 14h00→18h00, 1 journée).
const derouleJson = {
  jours: [
    {
      theme: 'TRACFIN & lutte contre le blanchiment (LCB-FT) — Professionnels de l’immobilier',
      sequences: [
        {
          duree: '14h00 – 14h20',
          objectifs:
            'Partie 1 – Les fondamentaux. Lancer la session et mesurer le niveau initial du groupe',
          contenu:
            'Accueil des participants, présentation du programme et des objectifs, tour de table. Recueil des attentes.',
          outils: 'Support projeté, feuille d’émargement',
          exercice: 'Quiz à main levée : « Qui a déjà entendu parler de TRACFIN ? »',
          evaluation: 'Évaluation diagnostique du niveau initial (positionnement)',
        },
        {
          duree: '14h20 – 15h00',
          objectifs: 'Comprendre pourquoi TRACFIN concerne directement le professionnel de l’immobilier',
          contenu:
            'Rôle de TRACFIN, cadre légal LCB-FT, enjeux et responsabilités pour l’agent immobilier. Sanctions encourues (Commission nationale des sanctions).',
          outils: 'Diaporama, textes de référence (Code monétaire et financier)',
          exercice: 'Échanges sur des cas médiatisés de blanchiment immobilier',
          evaluation: 'Questions-réponses orales',
        },
        {
          duree: '15h00 – 15h30',
          objectifs: 'Identifier les obligations de vigilance et de déclaration applicables',
          contenu:
            'Obligations de vigilance (identification client, bénéficiaire effectif), conservation des pièces, déclaration de soupçon, désignation d’un déclarant/correspondant.',
          outils: 'Fiche-outil « obligations de vigilance », modèle de fiche client',
          exercice: 'Lecture commentée d’une fiche client type',
          evaluation: 'Vérification de la compréhension par questionnement ciblé',
        },
        {
          duree: '15h30 – 15h45',
          objectifs: 'Pause café',
          contenu: '',
          outils: '',
          exercice: '',
          evaluation: '',
          isPause: true,
        },
        {
          duree: '15h45 – 16h00',
          objectifs: 'Reconnaître les signaux d’alerte et indicateurs de blanchiment',
          contenu:
            'Typologie des indicateurs de blanchiment dans les transactions immobilières : incohérences de financement, montages, paiements atypiques, prête-noms.',
          outils: 'Cartographie des risques, check-list de contrôle',
          exercice: 'Repérage d’anomalies sur des exemples courts',
          evaluation: 'Auto-évaluation des signaux identifiés',
        },
        {
          duree: '16h00 – 18h00',
          objectifs:
            'Partie 2 – Mises en situation. Appliquer la démarche LCB-FT sur un cas complet en équipe',
          contenu:
            'Jeux de rôle : 5 équipes de 6 personnes. Chaque équipe reçoit un dossier client fictif complet (identité, justificatifs, contexte de la transaction). Analyse du dossier, détection des anomalies, décision sur la suite à donner (vigilance renforcée / déclaration de soupçon).',
          outils: 'Dossiers clients fictifs, plateforme ERMES (démonstration de la déclaration)',
          exercice: 'Analyse de dossier en équipe + restitution argumentée',
          evaluation: 'Évaluation des décisions par équipe + débrief formateur. QCM final.',
        },
      ],
    },
  ],
};

if (process.env.WRITE === '1') {
  const prod = await prisma.trainingProduct.findFirstOrThrow({ where: { code: 'PROD-0671' }, select: { id: true } });
  await prisma.trainingProduct.update({
    where: { id: prod.id },
    data: { objectives: OBJECTIVES, derouleJson: derouleJson as object },
  });
  console.log('✓ PROD-0671 mis à jour : objectives (5) + derouleJson figé (4h, 14h-18h).');
} else {
  console.log('(DRY — ajoute WRITE=1 pour persister)');
}

// Aperçu du Déroulé pédagogique (rendu produit)
const p: any = await prisma.trainingProduct.findFirst({
  where: { code: 'PROD-0671' },
  select: { title: true, durationHours: true },
});
const html = renderProductDerouleHtml(
  { produitTitre: p.title, produitCode: 'PROD-0671', produitDureeHeures: p.durationHours },
  derouleJson as never,
);
const pdf = await renderHtmlToPdfWeasy(html);
fs.writeFileSync('/tmp/PREVIEW-deroule-tracfin.pdf', pdf);
console.log('Aperçu déroulé : /tmp/PREVIEW-deroule-tracfin.pdf');

await prisma.$disconnect();
