/**
 * _gen-optimmo-analyse-besoins.ts — ANALYSE DES BESOINS ENTREPRISE SES-0106
 * (quick 2026-08-12, 1ʳᵉ application de la règle figée du 12/08 : payeur =
 * personne morale → 1 SEULE analyse au niveau de l'ENTREPRISE, pas par stagiaire).
 *
 * - Recueil auprès d'OPTIMMO SARL représentée par Gilles Blanchon (chef
 *   d'entreprise) pour la formation 152 h / 19 j (07/10 → 02/11/2026).
 * - Structure transposée ENTREPRISE depuis analyse-besoin-template.ts
 *   (helpers partagés wrapHtml/renderBrandHeader — footer corp habituel).
 * - Datée du mardi 08/09/2026 : l'analyse PRÉCÈDE la signature de la
 *   convention (16/09/2026) — règle de datation du chantier.
 * - PAS de CSP, PAS de liste nominative (le besoin est celui de l'entreprise).
 * - Signataire OF : Laurent MARX (signature + tampon, comme la convention).
 * - Base : PedagogicalAsset kind=ANALYSE_BESOIN NIVEAU SESSION
 *   (participantId null — un seul asset, pas 11). Footer : getOfConfig()
 *   env-only (Vence) — on ne passe PAS loadOfConfig (adresse Tenant BDD
 *   obsolète Cagnes, cf. Rule 1 convention).
 *
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_gen-optimmo-analyse-besoins.ts
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma, Prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '../src/lib/storage';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import {
  BRAND_DARK,
  SECTION_BLUE,
  escapeHtml,
  formatDateFr,
  renderBrandHeader,
  wrapHtml,
} from '../src/lib/closure/shared-template';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const SESSION_CODE = 'SES-0106';
const ANALYSE_DATE = new Date('2026-09-08T00:00:00Z'); // mardi, J-6 ouvrés avant la convention du 16/09
const OUT_PDF = '/Users/laurentmarx/Documents/CRM Next gen/Analyse-besoins-OPTIMMO-SES-0106.pdf';

// ---------------------------------------------------------------------------
// Contenu — recueil ENTREPRISE (ind. 4). Ton professionnel, aucun nom de
// stagiaire, aucune CSP.
// ---------------------------------------------------------------------------
const CONTENU = {
  contexte_entreprise:
    "OPTIMMO SARL exploite une agence immobilière sous enseigne Century 21 à Nice (siège : 2 avenue Saint Sylvestre, 06100 Nice). L'agence couvre les métiers de la transaction (vente), de la location et de la gestion locative, avec une équipe de 11 salariées aux fonctions variées : négociation, gestion, assistanat commercial et encadrement. Le quotidien de l'agence mobilise un volume important de tâches rédactionnelles et administratives (annonces, courriers, comptes rendus, suivi des dossiers vendeurs, bailleurs et locataires, communication de l'agence) qui pèsent sur le temps disponible pour la relation client et le développement commercial.",
  besoins_dirigeant: [
    "Dégager du temps productif sur les tâches répétitives et rédactionnelles (courriers, annonces, comptes rendus, suivi de dossiers) au profit de la relation client.",
    "Faire monter en compétence l'ensemble des équipes sur les outils numériques d'assistance récents, avec un socle commun partagé entre les fonctions (négociation, gestion, assistanat, encadrement).",
    "Harmoniser et professionnaliser les supports produits par l'agence : annonces, avis de valeur, communication locale et supports commerciaux.",
    "Sécuriser les usages au sein de l'agence : confidentialité des données clients, conformité réglementaire (RGPD) et règles internes d'utilisation.",
    "Structurer des processus d'agence durables (bibliothèques de modèles, automatisation des tâches récurrentes, indicateurs de pilotage).",
  ],
  objectifs_attendus: [
    "Chaque salariée sait utiliser les outils étudiés sur ses cas métier concrets (prospection, estimation, annonces, gestion locative, relation client, administratif).",
    "Les processus clés de l'agence sont revus et outillés, avec des gains de temps mesurables sur les tâches récurrentes.",
    "Un cadre d'utilisation interne est défini (bonnes pratiques, confidentialité, vérification humaine des productions).",
    "L'agence dispose d'un plan d'action de déploiement à l'issue de la formation, avec des référents identifiés.",
  ],
  public_prerequis:
    "Public concerné : les 11 salariées de l'agence, tous métiers confondus (négociation, gestion, assistanat commercial, encadrement). Prérequis : aucun prérequis technique — être à l'aise avec l'utilisation courante d'un ordinateur et d'un smartphone. Un test de positionnement individuel sera réalisé avant l'entrée en formation.",
  modalites_calendrier:
    "Formation intra-entreprise en présentiel, organisée dans les locaux de l'entreprise (29 boulevard Simone Veil, 06200 Nice) afin de travailler sur les dossiers et outils réels de l'agence. Calendrier envisagé : du 7 octobre au 2 novembre 2026, soit 19 journées ouvrées de 8 heures (9h00-13h00 / 14h00-18h00), pour un volume total de 152 heures. Ce rythme en continuité, convenu avec le dirigeant, permet une mise en application immédiate entre les journées.",
  adaptation_of:
    "Le programme « Intégrer l'Intelligence Artificielle dans son entreprise pour gagner en productivité » (152 heures / 19 journées) répond aux besoins identifiés : il part des fondamentaux communs (prise en main des outils, méthode de rédaction des instructions), déroule ensuite les applications métier propres à l'agence (prospection, estimation, annonces, communication, relation client, gestion locative, back-office), puis outille l'automatisation des tâches récurrentes, le pilotage par les données et le cadre juridique et éthique des usages, avant de conclure par la construction d'assistants par poste de travail et un plan de déploiement propre à l'agence. Les ateliers s'appuieront sur les dossiers réels de l'entreprise ; la progression pédagogique est adaptée à un public non technique aux fonctions variées.",
};

async function main() {
  console.log('=== Analyse des besoins ENTREPRISE — SES-0106 / OPTIMMO ===\n');

  const session = await prisma.trainingSession.findFirst({
    where: { tenantId: TENANT_ID, code: SESSION_CODE },
    include: {
      product: true,
      location: true,
      participants: { include: { sponsorOrg: true }, take: 1 },
    },
  });
  if (!session?.product) throw new Error('Session/produit introuvable');
  const sponsor = session.participants[0]?.sponsorOrg;
  if (!sponsor) throw new Error('SponsorOrg introuvable');
  const nbParticipants = await prisma.sessionParticipant.count({ where: { sessionId: session.id } });
  if (nbParticipants !== 11) throw new Error(`Effectif ${nbParticipants} ≠ 11`);
  // Garde de datation : l'analyse précède la convention (16/09) et le début de session.
  if (!(ANALYSE_DATE < new Date('2026-09-16T00:00:00Z'))) throw new Error('Date analyse ≥ date convention');

  const fmtD = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

  const sigPath = new URL('../src/assets/signature-laurent.png', import.meta.url);
  const tamponPath = new URL('../src/assets/tampon-start-academy.png', import.meta.url);
  const sigUrl = `data:image/png;base64,${fs.readFileSync(sigPath).toString('base64')}`;
  const tamponUrl = `data:image/png;base64,${fs.readFileSync(tamponPath).toString('base64')}`;

  const list = (items: string[]) =>
    `<ul class="bullets" style="list-style: none; margin-left: 14px;">
  ${items.map((it) => `<li style="margin-bottom: 4px;"><span style="color: ${SECTION_BLUE}; font-weight: 700; margin-right: 6px;">•</span>${escapeHtml(it)}</li>`).join('\n  ')}
</ul>`;

  const body = `
${renderBrandHeader(undefined, TENANT_ID)}
<main class="body">
  <h1 class="doc-title">Analyse des besoins de l'entreprise</h1>
  <p class="doc-subtitle">Recueil des besoins en amont de la formation — formation intra-entreprise</p>
  <hr class="doc-rule" />

  <div style="margin: 10px 0 14px 0; padding: 10px 14px; background: #F8FAFC; border-left: 3px solid ${SECTION_BLUE};">
    <p style="margin: 2px 0;"><strong style="color: ${BRAND_DARK};">Entreprise bénéficiaire :</strong> ${escapeHtml(sponsor.legalName)} (enseigne ${escapeHtml(sponsor.brandName ?? 'Century 21')}) — SIRET ${escapeHtml(sponsor.siret ?? '')}</p>
    <p style="margin: 2px 0;">Siège social : 2 avenue Saint Sylvestre, 06100 Nice</p>
    <p style="margin: 2px 0;">Représentée par <strong>${escapeHtml(sponsor.representative ?? 'Gilles Blanchon')}</strong>, chef d'entreprise — interlocuteur du présent recueil.</p>
  </div>

  <div style="margin: 0 0 14px 0; padding: 10px 14px; background: #F8FAFC; border-left: 3px solid ${SECTION_BLUE};">
    <p style="margin: 2px 0;"><strong style="color: ${BRAND_DARK};">Formation envisagée :</strong> « ${escapeHtml(session.product.title)} »</p>
    <p style="margin: 2px 0;">Durée : <strong>152 heures / 19 journées de 8 heures</strong> — du <strong>${fmtD(session.startDate)}</strong> au <strong>${fmtD(session.endDate)}</strong></p>
    <p style="margin: 2px 0;">Modalité : intra-entreprise, présentiel — Locaux OPTIMMO, 29 boulevard Simone Veil, 06200 Nice</p>
    <p style="margin: 2px 0;">Effectif concerné : <strong>11 salariées</strong></p>
  </div>

  <h2 class="section">Contexte de l'entreprise</h2>
  <p class="paragraph">${escapeHtml(CONTENU.contexte_entreprise)}</p>

  <h2 class="section">Besoins exprimés par le dirigeant</h2>
  ${list(CONTENU.besoins_dirigeant)}

  <h2 class="section">Objectifs attendus de la formation</h2>
  ${list(CONTENU.objectifs_attendus)}

  <h2 class="section">Public concerné et prérequis</h2>
  <p class="paragraph">${escapeHtml(CONTENU.public_prerequis)}</p>

  <h2 class="section">Modalités et calendrier envisagés</h2>
  <p class="paragraph">${escapeHtml(CONTENU.modalites_calendrier)}</p>

  <h2 class="section">Adaptation proposée par l'organisme de formation</h2>
  <p class="paragraph">${escapeHtml(CONTENU.adaptation_of)}</p>

  <h2 class="section">Situation de handicap</h2>
  <p class="paragraph">Interrogé sur d'éventuels besoins d'adaptation liés à une situation de handicap ou à une maladie invalidante au sein des équipes concernées, le représentant de l'entreprise n'a signalé <strong>aucun besoin d'adaptation</strong> à ce stade. Les salariées seront de nouveau interrogées individuellement lors du test de positionnement préalable.</p>
  <p style="font-size: 9pt; color: #475569; margin-top: 6px;">Référent handicap : <strong>Jean-Guy Ourmières</strong> — jean-guy@start-academy.fr — 06 10 23 00 60 (responsable pédagogique, référent handicap).</p>

  <div style="margin-top: 14mm; padding: 12px 14px; border: 1px solid #E2E8F0; border-radius: 6px; background: #F8FAFC; page-break-inside: avoid;">
    <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
      Analyse réalisée par
    </div>
    <div style="font-size: 12pt; font-weight: 700; color: ${BRAND_DARK};">Laurent MARX</div>
    <div style="font-size: 9.5pt; color: #475569; margin-top: 2px;">
      Le ${escapeHtml(formatDateFr(ANALYSE_DATE))} — Dirigeant, Start Academy — recueil réalisé auprès de ${escapeHtml(sponsor.representative ?? 'Gilles Blanchon')}, chef d'entreprise ${escapeHtml(sponsor.legalName)}.
    </div>
    <div style="margin-top: 6px; white-space: nowrap;">
      <img src="${sigUrl}" alt="Signature" style="max-height: 20mm; max-width: 36mm; vertical-align: bottom;" />
      <img src="${tamponUrl}" alt="Tampon Start Academy" style="max-height: 28mm; max-width: 28mm; vertical-align: bottom; margin-left: 5mm;" />
    </div>
  </div>
</main>
`;

  const html = wrapHtml({ title: 'Analyse des besoins — OPTIMMO SARL', bodyHtml: body });
  if (/annexe/i.test(html)) throw new Error('« annexe » détecté dans le HTML');

  const pdf = await renderHtmlToPdfWeasy(html);
  const hash = createHash('sha256').update(pdf).digest('hex');
  const key = `analyses/${SESSION_CODE}/optimmo-entreprise-${hash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, key, pdf, 'application/pdf');

  // 1 SEUL asset niveau SESSION (participantId null). L'unique Prisma ne
  // protège pas avec NULL (Postgres NULLS DISTINCT) → find-or-replace manuel,
  // orphelin storage loggé.
  const olds = await prisma.pedagogicalAsset.findMany({
    where: { tenantId: TENANT_ID, sessionId: session.id, participantId: null, kind: 'ANALYSE_BESOIN' },
    select: { id: true, pdfUrl: true },
  });
  for (const o of olds) if (o.pdfUrl && o.pdfUrl !== key) console.log(`  ⚠ orphelin storage : ${o.pdfUrl}`);
  await prisma.pedagogicalAsset.deleteMany({
    where: { tenantId: TENANT_ID, sessionId: session.id, participantId: null, kind: 'ANALYSE_BESOIN' },
  });
  const asset = await prisma.pedagogicalAsset.create({
    data: {
      tenantId: TENANT_ID,
      sessionId: session.id,
      participantId: null,
      kind: 'ANALYSE_BESOIN',
      rawJson: {
        scope: 'entreprise',
        entreprise: sponsor.legalName,
        interlocuteur: sponsor.representative ?? 'Gilles Blanchon',
        dateAnalyse: ANALYSE_DATE.toISOString().slice(0, 10),
        ...CONTENU,
      } as unknown as Prisma.InputJsonValue,
      pdfUrl: key,
      hashSha256: hash,
      generatedAt: ANALYSE_DATE,
    },
    select: { id: true },
  });

  fs.writeFileSync(OUT_PDF, pdf);
  console.log(`ANALYSE BESOINS ENTREPRISE : PedagogicalAsset ${asset.id} (niveau session, participantId null)`);
  console.log(`  datée du ${formatDateFr(ANALYSE_DATE)} (avant convention du 16/09/2026)`);
  console.log(`  storage : ${key}`);
  console.log(`  local   : ${OUT_PDF} (${(pdf.length / 1024).toFixed(0)} Ko, nom ${path.basename(OUT_PDF).length} car.)`);
  console.log('\nAucun email envoyé. ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
