/**
 * _gen-optimmo-152h-docs.ts — Génération des 2 PDF portail OPCO EP (quick 2026-08-12) :
 *   1. PROGRAMME détaillé PROD-0674 (renderProgrammeHtml + patch tarif GROUPE intra).
 *   2. CONVENTION de formation UNIQUE de groupe SES-0106 (règle figée 12/08 :
 *      payeur = personne morale → 1 seule convention, signée chef d'entreprise).
 *      renderConventionHtml 11 stagiaires + patchs : prix forfait groupe,
 *      modalités de règlement OPCO EP (paiement direct/subrogation), annexe
 *      nominative NOM + PRÉNOM UNIQUEMENT (décision Laurent 12/08 — pas de CSP).
 *
 * Pipeline habituel : WeasyPrint (footer in-body running element — JAMAIS footer
 * natif), upload Supabase (STORAGE_PROVIDER=supabase), Document rows, copies
 * locales dans « CRM Next gen/ » (noms ≤ 50 car., < 8 Mo).
 *
 * ⚠ AUCUN email. Programme + convention SEULEMENT (pas de pack/convocations).
 *
 * Run : cd apps/web && node --import tsx --env-file=../../.env scripts/_gen-optimmo-152h-docs.ts
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '../src/lib/storage';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import { renderProgrammeHtml, type ProgrammeData } from '../src/lib/programme-template';
import {
  renderConventionHtml,
  type ConventionData,
  type ConventionStagiaire,
} from '../src/lib/convention-template';
import { loadOfConfig } from '../src/lib/of-config';
import { subtractBusinessDaysISO } from '../src/lib/business-days';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const PRODUCT_CODE = 'PROD-0674';
const SESSION_CODE = 'SES-0106';
const NB_STAGIAIRES = 11;
const TOTAL_GROUP_HT = 4500;

/** ONLY_CONVENTION=1 → ne régénère QUE la convention (retour Laurent 12/08 n°3). */
const ONLY_CONVENTION = process.env.ONLY_CONVENTION === '1';

const OUT_DIR = '/Users/laurentmarx/Documents/CRM Next gen';
const OUT_PROGRAMME = path.join(OUT_DIR, 'Programme-IA-152h-OPTIMMO.pdf');
const OUT_CONVENTION = path.join(OUT_DIR, `Convention-OPTIMMO-${SESSION_CODE}.pdf`);

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Remplacement obligatoire : throw si le motif est introuvable (anti-dérive template). */
function mustReplace(html: string, pattern: RegExp, replacement: string, label: string): string {
  if (!pattern.test(html)) throw new Error(`Patch « ${label} » : motif introuvable — template modifié ?`);
  return html.replace(pattern, replacement);
}

/**
 * Retour Laurent 12/08 : programme AÉRÉ. Le programMd est désormais du vrai
 * markdown (## jour / ### demi-journée / listes réelles) — ce CSS additionnel
 * (injecté avant </head>, cascade APRÈS le style template, templates app NON
 * touchés) espace les jours, garde les titres avec leur contenu (anti-veuve)
 * et donne un interligne confortable. Footer in-body : intact.
 */
const AIRY_PROGRAMME_CSS = `<style>
  .programme-md { line-height: 1.55; }
  .programme-md h2 { margin: 18px 0 6px 0; page-break-after: avoid; }
  .programme-md h3 { margin: 10px 0 4px 0; page-break-after: avoid; }
  .programme-md p { margin: 6px 0 4px 0; }
  .programme-md ul { margin: 2px 0 12px 20px; }
  .programme-md li { margin-bottom: 2.5px; }
  .programme-md p em { color: #64748B; }
</style>`;

function withAiryProgramme(html: string, label: string): string {
  return mustReplace(html, /<\/head>/, `${AIRY_PROGRAMME_CSS}</head>`, `CSS aération ${label}`);
}

async function main() {
  console.log('=== Génération PDF OPTIMMO 152h (programme + convention groupe) ===\n');

  const product = await prisma.trainingProduct.findFirst({
    where: { tenantId: TENANT_ID, code: PRODUCT_CODE },
  });
  if (!product) throw new Error(`${PRODUCT_CODE} introuvable`);

  const session = await prisma.trainingSession.findFirst({
    where: { tenantId: TENANT_ID, code: SESSION_CODE },
    include: {
      location: true,
      participants: { include: { person: true, sponsorOrg: true } },
    },
  });
  if (!session) throw new Error(`${SESSION_CODE} introuvable`);
  if (session.participants.length !== NB_STAGIAIRES)
    throw new Error(`Effectif ${session.participants.length} ≠ ${NB_STAGIAIRES}`);

  const of = await loadOfConfig(TENANT_ID);
  const objectives = (product.objectives as string[] | null) ?? [];

  // =========================================================================
  // 1) PROGRAMME détaillé (sauté si ONLY_CONVENTION=1)
  // =========================================================================
  if (!ONLY_CONVENTION) {
  const progData: ProgrammeData = {
    produitTitre: product.title,
    produitCode: product.code,
    produitDureeHeures: product.durationHours,
    produitPriceHT: Number(product.priceHT),
    produitObjectifs: objectives,
    produitProgrammeMd: typeof product.programMd === 'string' ? product.programMd : '',
    produitPrerequisites: product.prerequisites,
    produitTargetAudience: product.targetAudience,
    produitPedagogicalMethods: product.pedagogicalMethods,
    produitEvaluationMethods: product.evaluationMethods,
    produitAccessibility: product.accessibility,
    produitAccessConditions: product.accessConditions,
    produitTrainerProfile: product.trainerProfile,
    produitPedagogicalSupport: product.pedagogicalSupport,
    ofName: of.name,
    ofSiret: of.siret,
    ofAddress: of.addressFull,
    ofRnq: of.rnq,
    ofPhone: of.phone,
    ofEmail: of.email,
    tenantId: TENANT_ID,
  };

  let progHtml = renderProgrammeHtml(progData, of);
  // Prix de GROUPE intra — le template écrit « HT par stagiaire » (faux ici).
  progHtml = mustReplace(
    progHtml,
    /<\/strong> HT par stagiaire/,
    `</strong> HT — forfait groupe intra-entreprise (session de ${NB_STAGIAIRES} stagiaires)`,
    'tarif groupe programme',
  );
  progHtml = withAiryProgramme(progHtml, 'programme');

  const progPdf = await renderHtmlToPdfWeasy(progHtml);
  const progHash = createHash('sha256').update(progPdf).digest('hex');
  const progKey = `programmes/produits/prod-0674-${progHash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, progKey, progPdf, 'application/pdf');

  // REMPLACEMENT (retour Laurent 12/08) : supprime les lignes PROGRAMME
  // précédentes de ce produit avant recréation — pas de doublon de Document.
  // Les anciens objets storage deviennent orphelins (pas de deleteFile dans
  // lib/storage ; purge = étape destructive séparée, consignée au rapport).
  const oldProgs = await prisma.document.findMany({
    where: { tenantId: TENANT_ID, type: 'PROGRAMME', entityType: 'product', entityId: product.id },
    select: { pdfUrl: true },
  });
  for (const o of oldProgs) if (o.pdfUrl !== progKey) console.log(`  ⚠ orphelin storage : ${o.pdfUrl}`);
  await prisma.document.deleteMany({
    where: { tenantId: TENANT_ID, type: 'PROGRAMME', entityType: 'product', entityId: product.id },
  });
  const progDoc = await prisma.document.create({
    data: {
      tenantId: TENANT_ID,
      type: 'PROGRAMME',
      entityType: 'product',
      entityId: product.id,
      pdfUrl: progKey,
      hashSha256: progHash,
    },
    select: { id: true },
  });
  fs.writeFileSync(OUT_PROGRAMME, progPdf);
  console.log(`PROGRAMME : Document ${progDoc.id}`);
  console.log(`  storage : ${progKey}`);
  console.log(`  local   : ${OUT_PROGRAMME} (${(progPdf.length / 1024).toFixed(0)} Ko)\n`);
  } else {
    console.log('PROGRAMME : inchangé (ONLY_CONVENTION=1)\n');
  }

  // =========================================================================
  // 2) CONVENTION UNIQUE de groupe (payeur = OPTIMMO SARL, personne morale)
  // =========================================================================
  const sorted = [...session.participants].sort((a, b) =>
    a.person.lastName.localeCompare(b.person.lastName, 'fr'),
  );
  // Annexe + Article 4 : NOM + Prénom UNIQUEMENT (pas de CSP, pas d'email —
  // décision Laurent 12/08 ; la CSP reste interne, LegalLink.function).
  const stagiaires: ConventionStagiaire[] = sorted.map((p) => ({
    prenom: p.person.firstName,
    nom: p.person.lastName,
    email: null,
  }));

  const sponsor = sorted[0]!.sponsorOrg;
  const sumHT = sorted.reduce((acc, p) => acc + Math.round(Number(p.priceHT) * 100), 0);
  if (sumHT !== TOTAL_GROUP_HT * 100) throw new Error(`Somme priceHT ${sumHT / 100} ≠ ${TOTAL_GROUP_HT}`);

  const orgAddr = (sponsor.address as Record<string, string> | null) ?? null;
  const startIso = session.startDate.toISOString().slice(0, 10);
  const conventionIso = subtractBusinessDaysISO(startIso, 15); // règle J-15 ouvrés (COR-1)

  // Lieu — même construction que convention-core (legalName — name, rue, cp, ville)
  const locName = session.location
    ? [session.location.legalName, session.location.name].filter(Boolean).join(' — ')
    : null;
  const locAddress = session.location?.address as Record<string, string> | null;
  const lieu = locAddress
    ? [locName, [locAddress.street, locAddress.postalCode, locAddress.city].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ')
    : (locName ?? of.addressFull);

  const convData: ConventionData = {
    beneficiaireRaisonSociale: sponsor.legalName,
    beneficiaireSiret: sponsor.siret,
    beneficiaireRcsVille: orgAddr?.city ? orgAddr.city.charAt(0) + orgAddr.city.slice(1).toLowerCase() : null,
    beneficiaireRepresentantNom: sponsor.representative ?? 'Gilles Blanchon',
    stagiaires,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    conventionDate: new Date(conventionIso + 'T00:00:00Z'),
    sessionLieu: lieu,
    produitTitre: product.title, // titre produit PROPRE (pas session.name suffixé date)
    produitDureeHeures: product.durationHours, // 152h → « 19 journées de 8 heures »
    produitObjectifs: objectives,
    produitProgrammeMd: typeof product.programMd === 'string' ? product.programMd : '',
    produitTrainerProfile: product.trainerProfile,
    // 4500/11 : en JS (4500/11)*11 === 4500 → l'article 7 affiche 4 500,00 € HT.
    produitPriceHTPerStagiaire: TOTAL_GROUP_HT / NB_STAGIAIRES,
    tenantId: TENANT_ID,
  };

  // Rule 1 (2026-08-12) — incohérence interne détectée au contrôle : le corps
  // de la convention affichait l'adresse Tenant BDD obsolète (« 12 avenue des
  // camélias, Cagnes sur Mer ») alors que le footer OF_* affiche le siège
  // officiel Qualiopi (Vence) — observation connue depuis 22-06 (« 1 édition
  // Paramètres organisme » en attente). Override LOCAL au document, aucune
  // écriture sur le Tenant (hors périmètre validé) ; fix racine = édition UI.
  const ofConv = {
    ...of,
    addressFull: '618 Bd Jean Maurel Inférieur, 06140 Vence',
    addressVille: 'Vence',
  };
  let convHtml = renderConventionHtml(convData, ofConv);
  convHtml = withAiryProgramme(convHtml, 'convention');

  // Patch 1 — Article 7 : « (soit 409,09 € HT × 11 stagiaires) » → forfait groupe
  // (évite le faux calcul apparent 409,09 × 11 = 4 499,99).
  convHtml = mustReplace(
    convHtml,
    /\s*\(soit [^)]*stagiaires\)/,
    ' (forfait groupe intra-entreprise — 11 stagiaires)',
    'forfait groupe article 7',
  );

  // Patch 2 — Article 7 : modalités de règlement OPCO EP explicites
  // (paiement direct OF par subrogation OU remboursement à l'entreprise).
  convHtml = mustReplace(
    convHtml,
    /<p>En cas de subrogation de paiement par un OPCO[^<]*<\/p>/,
    `<p>La prise en charge du coût de la formation pourra être sollicitée par l'entreprise bénéficiaire auprès de son opérateur de compétences, l'<strong>OPCO EP</strong> (Opérateur de compétences des Entreprises de Proximité), selon l'une des modalités suivantes : soit le <strong>paiement direct de l'organisme de formation par l'OPCO EP</strong> (subrogation de paiement), sous réserve que l'accord de prise en charge soit communiqué à l'organisme de formation avant le début de la formation ; soit le <strong>règlement par l'entreprise bénéficiaire puis remboursement par l'OPCO EP</strong> selon les règles de prise en charge en vigueur. À défaut de prise en charge totale, la part non couverte reste due par l'entreprise bénéficiaire.</p>`,
    'modalités OPCO EP',
  );

  // Patch 3 (retour Laurent 12/08 n°3) — le programme détaillé 19 jours NE
  // figure PLUS dans la convention (déposé au portail OPCO EP comme document
  // séparé) : l'Article 3 devient une simple mention « document joint ».
  // La section .programme-md ne contient aucun <section> imbriqué (sortie
  // marked) → le premier </section> rencontré clôt bien l'Article 3.
  convHtml = mustReplace(
    convHtml,
    /<section class="programme-section">[\s\S]*?<\/section>/,
    `<section>
  <h2 class="article">Article 3 — Programme de formation</h2>
  <p>Le programme détaillé de la formation (152 heures — 19 journées), conforme aux objectifs définis à l'article 2, est remis en <strong>document joint</strong> à la présente convention, dont il fait partie intégrante.</p>
</section>`,
    'programme → document joint (article 3)',
  );

  // Patch 4 — Annexe 1 : liste nominative (NOM Prénom uniquement), nouvelle page.
  const annexeRows = sorted
    .map(
      (p, i) =>
        `<tr><td style="border:1px solid #CBD5E1; padding:5px 10px; text-align:center; width:36px;">${i + 1}</td>` +
        `<td style="border:1px solid #CBD5E1; padding:5px 10px;">${escapeHtml(`${p.person.lastName.toUpperCase()} ${p.person.firstName}`)}</td></tr>`,
    )
    .join('');
  const fmtD = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const annexe = `
<div style="page-break-before: always;"></div>
<h2 class="article">Annexe 1 — Liste nominative des stagiaires</h2>
<p>Action de formation « ${escapeHtml(product.title)} » — du ${fmtD(session.startDate)} au ${fmtD(session.endDate)}, ${escapeHtml(lieu)}.</p>
<p>Effectif : <strong>11 stagiaires</strong>, salariés de l'entreprise bénéficiaire ${escapeHtml(sponsor.legalName)}.</p>
<table style="border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 10.5pt;">
  <thead>
    <tr>
      <th style="border:1px solid #CBD5E1; background:#F8FAFC; padding:5px 10px; width:36px;">N°</th>
      <th style="border:1px solid #CBD5E1; background:#F8FAFC; padding:5px 10px; text-align:left;">Nom et prénom</th>
    </tr>
  </thead>
  <tbody>${annexeRows}</tbody>
</table>
</body>`;
  convHtml = mustReplace(convHtml, /<\/body>/, annexe, 'annexe nominative');

  const convPdf = await renderHtmlToPdfWeasy(convHtml);
  const convHash = createHash('sha256').update(convPdf).digest('hex');
  const convKey = `conventions/${SESSION_CODE}/optimmo-groupe-${convHash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, convKey, convPdf, 'application/pdf');

  // 1 SEULE convention de groupe → Document au niveau SESSION (pas par
  // participant). Idempotence : remplace l'éventuelle convention session
  // précédente de cette même session (ancien objet storage = orphelin, loggé).
  const oldConvs = await prisma.document.findMany({
    where: { tenantId: TENANT_ID, type: 'CONVENTION', entityType: 'session', entityId: session.id },
    select: { pdfUrl: true },
  });
  for (const o of oldConvs) if (o.pdfUrl !== convKey) console.log(`  ⚠ orphelin storage : ${o.pdfUrl}`);
  await prisma.document.deleteMany({
    where: { tenantId: TENANT_ID, type: 'CONVENTION', entityType: 'session', entityId: session.id },
  });
  const convDoc = await prisma.document.create({
    data: {
      tenantId: TENANT_ID,
      type: 'CONVENTION',
      entityType: 'session',
      entityId: session.id,
      sessionId: session.id,
      pdfUrl: convKey,
      hashSha256: convHash,
    },
    select: { id: true },
  });
  fs.writeFileSync(OUT_CONVENTION, convPdf);
  console.log(`CONVENTION (groupe, ${NB_STAGIAIRES} stagiaires) : Document ${convDoc.id}`);
  console.log(`  signature prévue le ${conventionIso} (J-15 ouvrés), représentant : ${sponsor.representative}`);
  console.log(`  storage : ${convKey}`);
  console.log(`  local   : ${OUT_CONVENTION} (${(convPdf.length / 1024).toFixed(0)} Ko)\n`);

  console.log('Aucun email envoyé. Programme + convention SEULEMENT. ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
