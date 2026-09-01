/**
 * _gen-assalit-experta-analyses.ts — ANALYSES DES BESOINS ENTREPRISE
 * SES-0107 (ASSALIT SYNDIC) et SES-0108 (EXPERTA).
 *
 * Règle figée 12/08 : payeur = personne morale → 1 SEULE analyse au niveau
 * ENTREPRISE, jamais par stagiaire. Asset PedagogicalAsset ANALYSE_BESOIN
 * niveau session (participantId null).
 *
 * Écart assumé vs _gen-optimmo-analyse-besoins.ts : ce dernier contournait
 * loadOfConfig pour forcer Vence (l'adresse Tenant Cagnes était alors jugée
 * erronée). Depuis le déménagement du 12/08 Cagnes EST l'adresse officielle →
 * on utilise loadOfConfig, comme les conventions du même jour.
 *
 * Chronologie : analyse 20/08 < convention 21/08 < formation 07/10.
 *
 * Run : cd apps/web && pnpm dotenv -e ../../.env -- tsx scripts/_gen-assalit-experta-analyses.ts
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma, Prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '../src/lib/storage';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import {
  BRAND_DARK, SECTION_BLUE, escapeHtml, formatDateFr, renderBrandHeader, wrapHtml,
} from '../src/lib/closure/shared-template';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const ANALYSE_DATE = new Date('2026-08-20T00:00:00Z');
const CONVENTION_DATE = new Date('2026-08-21T00:00:00Z');
const INTERLOCUTEUR = 'Gilles Blanchon';
const OUT_DIR = '/Users/laurentmarx/Documents/CRM Next gen';

interface Contenu {
  activite: string;
  adresse: string;
  contexte: string;
  besoins: string[];
  objectifs: string[];
  public_prerequis: string;
  modalites: string;
  adaptation: string;
}

const PAR_SESSION: Record<string, Contenu> = {
  'SES-0107': {
    activite: "société d'administration de biens et de syndic de copropriété",
    adresse: '15 rue Masséna, 06000 Nice',
    contexte:
      "Gilles Blanchon représente la société ASSALIT SYNDIC, société d'administration de biens et de syndic de copropriété établie au 15 rue Masséna à Nice. L'activité repose sur la gestion d'un portefeuille de copropriétés et de biens en gestion locative : préparation et tenue des assemblées générales, rédaction des procès-verbaux, appels de fonds, suivi des travaux et des prestataires, traitement des demandes des copropriétaires et des locataires. Le quotidien des équipes mobilise un volume considérable d'écrits normés et de lecture de documents longs — règlements de copropriété, contrats de prestation, devis, diagnostics, procès-verbaux — au détriment du temps consacré à la relation avec les copropriétaires et au suivi opérationnel des immeubles.",
    besoins: [
      "Réduire le temps consacré aux écrits répétitifs et normés de la gestion : convocations et procès-verbaux d'assemblée générale, courriers aux copropriétaires, relances, régularisations de charges, congés.",
      "Accélérer la lecture et la synthèse des documents longs du métier : règlements de copropriété, contrats de prestataires, devis de travaux, diagnostics techniques.",
      "Doter l'ensemble des collaborateurs d'un socle commun sur les outils numériques d'assistance, quelle que soit leur fonction (gestion de copropriété, gestion locative, comptabilité, assistanat).",
      "Professionnaliser et harmoniser la communication du cabinet auprès des copropriétaires, des bailleurs et des locataires.",
      "Sécuriser les usages : confidentialité des données des copropriétaires et des locataires, conformité au RGPD, règles internes de vérification des productions.",
      "Structurer des pratiques durables : bibliothèques de modèles partagées, automatisation des tâches récurrentes, assistants adaptés à chaque poste.",
    ],
    objectifs: [
      "Chaque collaborateur sait mobiliser les outils étudiés sur ses propres dossiers : copropriété, gestion locative, back-office administratif.",
      "Les écrits récurrents du cabinet sont outillés par des modèles réutilisables, avec un gain de temps mesurable sur leur production.",
      "La synthèse des documents longs est fiabilisée et raccourcie, avec une vérification humaine systématique.",
      "Un cadre interne d'utilisation est défini et partagé : confidentialité, conformité, contrôle des contenus produits.",
      "Le cabinet dispose à l'issue de la formation d'un plan d'action de déploiement et de référents identifiés.",
    ],
    public_prerequis:
      "Public concerné : 8 salariés du cabinet, toutes fonctions confondues — gestion de copropriété, gestion locative, comptabilité et assistanat. Prérequis : aucun prérequis technique ; être à l'aise avec l'utilisation courante d'un ordinateur et d'un smartphone. Un test de positionnement individuel sera réalisé avant l'entrée en formation.",
    modalites:
      "Formation intra-entreprise en présentiel, organisée dans les locaux de l'entreprise (15 rue Masséna, 06000 Nice) afin de travailler directement sur les dossiers et les outils réels du cabinet. Calendrier envisagé : du 7 au 21 octobre 2026, soit 11 journées ouvrées de 8 heures (9h00-13h00 / 14h00-18h00), pour un volume total de 88 heures. Ce rythme resserré, convenu avec le représentant de l'entreprise, permet une mise en application immédiate d'une journée à l'autre.",
    adaptation:
      "Le programme « Intégrer l'Intelligence Artificielle dans son entreprise pour gagner en productivité » en version 88 heures sur 11 journées répond aux besoins identifiés. Il ouvre sur deux journées de fondamentaux communs — compréhension des outils, limites et risques, méthode de rédaction des instructions — puis déroule les applications métier du cabinet : écrits professionnels, communication, relation client, gestion locative et back-office administratif, ces deux dernières journées constituant le cœur du besoin exprimé. Il outille ensuite l'automatisation des tâches récurrentes et la construction d'assistants adaptés à chaque poste, avant une journée consacrée au cadre juridique et éthique (RGPD, AI Act, déontologie) et une journée finale de mise en situation, d'évaluation et de construction du plan d'action. Les ateliers s'appuieront sur les dossiers réels du cabinet ; la progression est calibrée pour un public non technique aux fonctions variées.",
  },
  'SES-0108': {
    activite: "cabinet d'administration de biens",
    adresse: "5 place de l'Île de Beauté, 06300 Nice",
    contexte:
      "Gilles Blanchon représente la société EXPERTA, cabinet d'administration de biens établi au 5 place de l'Île de Beauté à Nice. La structure, de taille resserrée, assure la gestion d'un portefeuille de biens et de copropriétés : suivi administratif et comptable des lots, relations avec les propriétaires et les locataires, préparation des documents de gestion, coordination des prestataires. Une collaboratrice concentre l'essentiel de la production administrative et rédactionnelle du cabinet, ce qui rend le temps passé sur les écrits répétitifs et sur la lecture de documents longs particulièrement pénalisant pour l'activité.",
    besoins: [
      "Alléger la charge rédactionnelle quotidienne : courriers de gestion, relances, régularisations, comptes rendus et reporting aux propriétaires.",
      "Accélérer la lecture et la synthèse des documents longs : contrats, règlements, devis, diagnostics, procès-verbaux.",
      "Monter en compétence sur les outils numériques d'assistance, sans prérequis technique, avec une application directe aux dossiers du cabinet.",
      "Sécuriser les usages : confidentialité des données des propriétaires et des locataires, conformité au RGPD, vérification humaine des contenus produits.",
      "Constituer des modèles et des automatisations réutilisables, afin que les gains de temps survivent à la formation.",
    ],
    objectifs: [
      "La collaboratrice sait mobiliser les outils étudiés sur ses dossiers réels de gestion et d'administration de biens.",
      "Les écrits récurrents du cabinet disposent de modèles fiables et réutilisables.",
      "La synthèse des documents longs est raccourcie, avec un contrôle humain systématique.",
      "Les règles de confidentialité et de conformité applicables au cabinet sont connues et appliquées.",
      "Un plan d'action personnalisé est établi à l'issue de la formation, avec des priorités de déploiement.",
    ],
    public_prerequis:
      "Public concerné : 1 salariée du cabinet, en charge de la gestion administrative et de la production documentaire. Prérequis : aucun prérequis technique ; être à l'aise avec l'utilisation courante d'un ordinateur et d'un smartphone. Un test de positionnement sera réalisé avant l'entrée en formation.",
    modalites:
      "Formation intra-entreprise en présentiel, organisée dans les locaux de l'entreprise (5 place de l'Île de Beauté, 06300 Nice) afin de travailler directement sur les dossiers réels du cabinet. Calendrier envisagé : du 7 au 21 octobre 2026, soit 11 journées ouvrées de 8 heures (9h00-13h00 / 14h00-18h00), pour un volume total de 88 heures. Le format individuel permet une adaptation continue du rythme et des cas travaillés au poste de la participante.",
    adaptation:
      "Le programme « Intégrer l'Intelligence Artificielle dans son entreprise pour gagner en productivité » en version 88 heures sur 11 journées répond aux besoins identifiés. Il ouvre sur deux journées de fondamentaux — compréhension des outils, limites et risques, méthode de rédaction des instructions — puis déroule les applications métier : écrits professionnels, communication, relation client, gestion locative et back-office administratif, qui constituent le cœur de l'activité de la participante. Il outille ensuite l'automatisation des tâches récurrentes et la construction d'un assistant adapté à son poste, avant une journée sur le cadre juridique et éthique (RGPD, AI Act, déontologie) et une journée finale de mise en situation, d'évaluation et de plan d'action. Le format individuel autorise un travail approfondi sur les dossiers propres au cabinet et un ajustement permanent du rythme.",
  },
};

async function main() {
  if (!(ANALYSE_DATE < CONVENTION_DATE)) throw new Error('Analyse ≥ convention — chronologie rompue');

  const sigUrl = `data:image/png;base64,${fs.readFileSync(new URL('../src/assets/signature-laurent.png', import.meta.url)).toString('base64')}`;
  const tamponUrl = `data:image/png;base64,${fs.readFileSync(new URL('../src/assets/tampon-start-academy.png', import.meta.url)).toString('base64')}`;
  const fmtD = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const list = (items: string[]) =>
    `<ul class="bullets" style="list-style: none; margin-left: 14px;">
  ${items.map((it) => `<li style="margin-bottom: 4px;"><span style="color: ${SECTION_BLUE}; font-weight: 700; margin-right: 6px;">•</span>${escapeHtml(it)}</li>`).join('\n  ')}
</ul>`;

  for (const [code, C] of Object.entries(PAR_SESSION)) {
    const session = await prisma.trainingSession.findFirstOrThrow({
      where: { tenantId: TENANT_ID, code },
      include: { product: true, participants: { include: { sponsorOrg: true }, take: 1 } },
    });
    const sponsor = session.participants[0]!.sponsorOrg;
    const n = await prisma.sessionParticipant.count({ where: { sessionId: session.id } });

    const body = `
${renderBrandHeader(undefined, TENANT_ID)}
<main class="body">
  <h1 class="doc-title">Analyse des besoins de l'entreprise</h1>
  <p class="doc-subtitle">Recueil des besoins en amont de la formation — formation intra-entreprise</p>
  <hr class="doc-rule" />

  <div style="margin: 10px 0 14px 0; padding: 10px 14px; background: #F8FAFC; border-left: 3px solid ${SECTION_BLUE};">
    <p style="margin: 2px 0;"><strong style="color: ${BRAND_DARK};">${escapeHtml(INTERLOCUTEUR)}, représentant de la société ${escapeHtml(sponsor.legalName)}</strong> (SIRET ${escapeHtml(sponsor.siret ?? '')}), ${escapeHtml(C.activite)} située ${escapeHtml(C.adresse)}, a sollicité Start Academy pour un projet de formation de ses équipes.</p>
    <p style="margin: 6px 0 2px 0;">Il est l'interlocuteur du présent recueil des besoins, mené pour le compte de son entreprise.</p>
  </div>

  <div style="margin: 0 0 14px 0; padding: 10px 14px; background: #F8FAFC; border-left: 3px solid ${SECTION_BLUE};">
    <p style="margin: 2px 0;"><strong style="color: ${BRAND_DARK};">Formation envisagée :</strong> « ${escapeHtml(session.product.title)} »</p>
    <p style="margin: 2px 0;">Durée : <strong>88 heures / 11 journées de 8 heures</strong> — du <strong>${fmtD(session.startDate)}</strong> au <strong>${fmtD(session.endDate)}</strong></p>
    <p style="margin: 2px 0;">Modalité : intra-entreprise, présentiel — ${escapeHtml(C.adresse)}</p>
    <p style="margin: 2px 0;">Effectif concerné : <strong>${n} salarié${n > 1 ? 's' : 'e'}</strong></p>
  </div>

  <h2 class="section">Contexte de l'entreprise</h2>
  <p class="paragraph">${escapeHtml(C.contexte)}</p>

  <h2 class="section">Besoins exprimés par le représentant de l'entreprise</h2>
  ${list(C.besoins)}

  <h2 class="section">Objectifs attendus de la formation</h2>
  ${list(C.objectifs)}

  <h2 class="section">Public concerné et prérequis</h2>
  <p class="paragraph">${escapeHtml(C.public_prerequis)}</p>

  <h2 class="section">Modalités et calendrier envisagés</h2>
  <p class="paragraph">${escapeHtml(C.modalites)}</p>

  <h2 class="section">Adaptation proposée par l'organisme de formation</h2>
  <p class="paragraph">${escapeHtml(C.adaptation)}</p>

  <h2 class="section">Situation de handicap</h2>
  <p class="paragraph">Interrogé sur d'éventuels besoins d'adaptation liés à une situation de handicap ou à une maladie invalidante au sein des équipes concernées, ${escapeHtml(INTERLOCUTEUR)} n'a signalé <strong>aucun besoin d'adaptation</strong> à ce stade. ${n > 1 ? 'Les salariés seront de nouveau interrogés individuellement' : 'La salariée sera de nouveau interrogée'} lors du test de positionnement préalable.</p>
  <p style="font-size: 9pt; color: #475569; margin-top: 6px;">Référent handicap : <strong>Jean-Guy Ourmières</strong> — jean-guy@start-academy.fr — 06 10 23 00 60 (responsable pédagogique, référent handicap).</p>

  <div style="margin-top: 14mm; padding: 12px 14px; border: 1px solid #E2E8F0; border-radius: 6px; background: #F8FAFC; page-break-inside: avoid;">
    <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Analyse réalisée par</div>
    <div style="font-size: 12pt; font-weight: 700; color: ${BRAND_DARK};">Laurent MARX</div>
    <div style="font-size: 9.5pt; color: #475569; margin-top: 2px;">
      Le ${escapeHtml(formatDateFr(ANALYSE_DATE))} — Dirigeant, Start Academy — recueil réalisé auprès de ${escapeHtml(INTERLOCUTEUR)}, représentant de la société ${escapeHtml(sponsor.legalName)}.
    </div>
    <div style="margin-top: 6px; white-space: nowrap;">
      <img src="${sigUrl}" alt="Signature" style="max-height: 20mm; max-width: 36mm; vertical-align: bottom;" />
      <img src="${tamponUrl}" alt="Tampon Start Academy" style="max-height: 28mm; max-width: 28mm; vertical-align: bottom; margin-left: 5mm;" />
    </div>
  </div>
</main>
`;
    const html = wrapHtml({ title: `Analyse des besoins — ${sponsor.legalName}`, bodyHtml: body });
    // Les gates portent sur le TEXTE : les data-URI base64 (signature, tampon,
    // logo) contiennent des suites de lettres aléatoires qui déclenchent des
    // faux positifs — « vence » s'y trouvait.
    // …et hors commentaires : shared-template.ts porte encore un commentaire CSS
    // « adresse longue Vence sur 2 lignes », périmé depuis le 12/08 (à nettoyer).
    const texte = html
      .replace(/data:[a-z/+;-]*base64,[A-Za-z0-9+/=]+/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    if (/annexe/i.test(texte)) throw new Error('« annexe » détecté');
    if (/century/i.test(texte)) throw new Error('« Century » détecté — entités indépendantes');
    if (/vence/i.test(texte)) throw new Error('« Vence » détecté — adresse obsolète');
    if (!/Cagnes/i.test(texte)) throw new Error('Adresse Cagnes absente du pied de page');

    const pdf = await renderHtmlToPdfWeasy(html);
    const hash = createHash('sha256').update(pdf).digest('hex');
    const slug = sponsor.legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const key = `analyses/${code}/${slug}-entreprise-${hash.slice(0, 8)}.pdf`;
    await uploadFile(DOCS_BUCKET, key, pdf, 'application/pdf');

    const olds = await prisma.pedagogicalAsset.findMany({
      where: { tenantId: TENANT_ID, sessionId: session.id, participantId: null, kind: 'ANALYSE_BESOIN' },
      select: { pdfUrl: true },
    });
    for (const o of olds) if (o.pdfUrl && o.pdfUrl !== key) console.log(`  ⚠ orphelin storage : ${o.pdfUrl}`);
    await prisma.pedagogicalAsset.deleteMany({
      where: { tenantId: TENANT_ID, sessionId: session.id, participantId: null, kind: 'ANALYSE_BESOIN' },
    });
    await prisma.pedagogicalAsset.create({
      data: {
        tenantId: TENANT_ID, sessionId: session.id, participantId: null, kind: 'ANALYSE_BESOIN',
        rawJson: { scope: 'entreprise', entreprise: sponsor.legalName, interlocuteur: INTERLOCUTEUR,
                   dateAnalyse: ANALYSE_DATE.toISOString().slice(0, 10), ...C } as unknown as Prisma.InputJsonValue,
        pdfUrl: key, hashSha256: hash, generatedAt: ANALYSE_DATE,
      },
    });

    const out = path.join(OUT_DIR, `Analyse-besoins-${sponsor.legalName}-${code}.pdf`);
    fs.writeFileSync(out, pdf);
    console.log(`ANALYSE ${code} · ${sponsor.legalName} · ${n} salarié(s) · ${(pdf.length / 1024).toFixed(0)} Ko`);
    console.log(`  storage : ${key}`);
    console.log(`  local   : ${out}\n`);
  }
  console.log('Aucun email envoyé. ✅');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
