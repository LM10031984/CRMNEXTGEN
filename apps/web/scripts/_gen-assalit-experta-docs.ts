/**
 * _gen-assalit-experta-docs.ts — Programme 88h + 2 conventions de groupe
 * (ASSALIT SYNDIC / SES-0107 et EXPERTA / SES-0108), portail OPCO EP.
 *
 * Calqué sur _gen-optimmo-152h-docs.ts (12/08) avec trois écarts assumés :
 *   1. AUCUN override d'adresse. Le script OPTIMMO forçait Vence parce que la
 *      base portait Camélias par erreur ; depuis le déménagement du 12/08 la
 *      config est juste (12 av. des Camélias, Cagnes-sur-Mer) — on la respecte.
 *   2. Deux sessions partagent UN produit → 1 seul PDF programme, 2 conventions.
 *   3. EXPERTA n'a qu'une stagiaire : les patchs « forfait groupe » ne
 *      s'appliquent qu'à partir de 2 stagiaires (sinon « soit 2 500 × 1 » est
 *      exact et le mot « groupe » serait absurde).
 *
 * Règle métier : payeur = personne morale → 1 SEULE convention de groupe par
 * session, Document au niveau session (jamais par participant).
 *
 * ⚠ AUCUN email. Programme + conventions seulement.
 * Run : cd apps/web && pnpm dotenv -e ../../.env -- tsx scripts/_gen-assalit-experta-docs.ts
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '../src/lib/storage';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import { renderProgrammeHtml, type ProgrammeData } from '../src/lib/programme-template';
import { renderConventionHtml, type ConventionData, type ConventionStagiaire } from '../src/lib/convention-template';
import { loadOfConfig } from '../src/lib/of-config';

const TENANT_ID = 'db191440-a144-48d1-93c1-767e6f647f2c';
const SESSIONS = ['SES-0107', 'SES-0108'] as const;
const CONVENTION_ISO = '2026-08-21'; // signée aujourd'hui
const REPRESENTANT = 'Gilles Blanchon';
const OUT_DIR = '/Users/laurentmarx/Documents/CRM Next gen';

function mustReplace(html: string, pattern: RegExp, replacement: string, label: string): string {
  if (!pattern.test(html)) throw new Error(`Patch « ${label} » : motif introuvable — template modifié ?`);
  return html.replace(pattern, replacement);
}

const AIRY_CSS = `<style>
  .programme-md { line-height: 1.55; }
  .programme-md h2 { margin: 18px 0 6px 0; page-break-after: avoid; }
  .programme-md h3 { margin: 10px 0 4px 0; page-break-after: avoid; }
  .programme-md p { margin: 6px 0 4px 0; }
  .programme-md ul { margin: 2px 0 12px 20px; }
  .programme-md li { margin-bottom: 2.5px; }
  .programme-md p em { color: #64748B; }
</style>`;
const airy = (html: string, label: string) =>
  mustReplace(html, /<\/head>/, `${AIRY_CSS}</head>`, `CSS aération ${label}`);

async function main() {
  const of = await loadOfConfig(TENANT_ID);
  console.log(`OF : ${of.name} — ${(of as any).addressFull}\n`);

  const sessions = await Promise.all(
    SESSIONS.map((code) =>
      prisma.trainingSession.findFirstOrThrow({
        where: { tenantId: TENANT_ID, code },
        include: { location: true, product: true, participants: { include: { person: true, sponsorOrg: true } } },
      }),
    ),
  );
  const product = sessions[0]!.product;
  if (sessions.some((s) => s.productId !== product.id)) throw new Error('Les 2 sessions ne partagent pas le produit');
  const objectives = (product.objectives as string[] | null) ?? [];

  // ── 1) PROGRAMME (produit partagé → un seul PDF) ────────────────────────
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
    ofName: of.name, ofSiret: of.siret, ofAddress: (of as any).addressFull,
    ofRnq: (of as any).rnq, ofPhone: of.phone, ofEmail: of.email,
    tenantId: TENANT_ID,
  };
  let progHtml = renderProgrammeHtml(progData, of);
  progHtml = mustReplace(progHtml, /<\/strong> HT par stagiaire/,
    '</strong> HT — forfait groupe intra-entreprise', 'tarif groupe programme');
  progHtml = airy(progHtml, 'programme');
  const nbJours = (progHtml.match(/JOUR\s+\d+/g) ?? []).length;
  if (nbJours < 11) throw new Error(`Programme : ${nbJours} occurrences « JOUR » (11 attendues au moins)`);

  const progPdf = await renderHtmlToPdfWeasy(progHtml);
  const progHash = createHash('sha256').update(progPdf).digest('hex');
  const progKey = `programmes/produits/${product.code.toLowerCase()}-${progHash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, progKey, progPdf, 'application/pdf');
  await prisma.document.deleteMany({
    where: { tenantId: TENANT_ID, type: 'PROGRAMME', entityType: 'product', entityId: product.id },
  });
  await prisma.document.create({
    data: { tenantId: TENANT_ID, type: 'PROGRAMME', entityType: 'product', entityId: product.id, pdfUrl: progKey, hashSha256: progHash },
  });
  const outProg = path.join(OUT_DIR, 'Programme-IA-88h.pdf');
  fs.writeFileSync(outProg, progPdf);
  console.log(`PROGRAMME 88h · ${nbJours} jours · ${(progPdf.length / 1024).toFixed(0)} Ko`);
  console.log(`  storage : ${progKey}`);
  console.log(`  local   : ${outProg}\n`);

  // ── 2) CONVENTIONS de groupe (1 par session) ────────────────────────────
  const tamponDataUrl = `data:image/png;base64,${fs
    .readFileSync(new URL('../src/assets/tampon-start-academy.png', import.meta.url))
    .toString('base64')}`;

  for (const session of sessions) {
    const sorted = [...session.participants].sort((a, b) => a.person.lastName.localeCompare(b.person.lastName, 'fr'));
    const n = sorted.length;
    const sponsor = sorted[0]!.sponsorOrg;
    const totalHT = sorted.reduce((acc, p) => acc + Math.round(Number(p.priceHT) * 100), 0) / 100;
    const stagiaires: ConventionStagiaire[] = sorted.map((p) => ({
      prenom: p.person.firstName, nom: p.person.lastName, email: null,
    }));

    const startIso = session.startDate.toISOString().slice(0, 10);
    if (!(CONVENTION_ISO < startIso)) throw new Error('Date de signature ≥ début de session');

    const orgAddr = (sponsor.address as Record<string, string> | null) ?? null;
    const locName = session.location
      ? [session.location.legalName, session.location.name].filter(Boolean).join(' — ') : null;
    const locAddress = session.location?.address as Record<string, string> | null;
    const lieu = locAddress
      ? [locName, [locAddress.street, locAddress.postalCode, locAddress.city].filter(Boolean).join(', ')].filter(Boolean).join(', ')
      : (locName ?? (of as any).addressFull);

    const convData: ConventionData = {
      beneficiaireRaisonSociale: sponsor.legalName,
      beneficiaireSiret: sponsor.siret,
      beneficiaireRcsVille: orgAddr?.city ? orgAddr.city.charAt(0) + orgAddr.city.slice(1).toLowerCase() : null,
      beneficiaireRepresentantNom: sponsor.representative ?? REPRESENTANT,
      stagiaires,
      sessionStartDate: session.startDate,
      sessionEndDate: session.endDate,
      conventionDate: new Date(CONVENTION_ISO + 'T00:00:00Z'),
      sessionLieu: lieu,
      produitTitre: product.title,
      produitDureeHeures: product.durationHours,
      produitObjectifs: objectives,
      produitProgrammeMd: typeof product.programMd === 'string' ? product.programMd : '',
      produitTrainerProfile: product.trainerProfile,
      produitPriceHTPerStagiaire: totalHT / n,
      tenantId: TENANT_ID,
    };

    let html = renderConventionHtml(convData, of);
    html = airy(html, 'convention');

    // Forfait groupe : seulement à partir de 2 stagiaires (cf. en-tête).
    if (n > 1) {
      html = mustReplace(html, /\s*\(soit [^)]*stagiaires?\)/,
        ` (forfait groupe intra-entreprise — ${n} stagiaires)`, 'forfait groupe article 7');
    }

    html = mustReplace(html, /<p>En cas de subrogation de paiement par un OPCO[^<]*<\/p>/,
      `<p>La prise en charge du coût de la formation pourra être sollicitée par l'entreprise bénéficiaire auprès de son opérateur de compétences, l'<strong>OPCO EP</strong> (Opérateur de compétences des Entreprises de Proximité), selon l'une des modalités suivantes : soit le <strong>paiement direct de l'organisme de formation par l'OPCO EP</strong> (subrogation de paiement), sous réserve que l'accord de prise en charge soit communiqué à l'organisme de formation avant le début de la formation ; soit le <strong>règlement par l'entreprise bénéficiaire puis remboursement par l'OPCO EP</strong> selon les règles de prise en charge en vigueur. À défaut de prise en charge totale, la part non couverte reste due par l'entreprise bénéficiaire.</p>`,
      'modalités OPCO EP');

    html = mustReplace(html,
      /<img src="(data:[^"]+)" alt="Signature" style="max-height: 22mm; max-width: 60mm; margin-top: 4px;" \/>/,
      `<div style="margin-top: 4px; white-space: nowrap;">` +
        `<img src="$1" alt="Signature" style="max-height: 22mm; max-width: 38mm; vertical-align: bottom;" />` +
        `<img src="${tamponDataUrl}" alt="Tampon Start Academy" style="max-height: 30mm; max-width: 30mm; vertical-align: bottom; margin-left: 5mm;" />` +
        `</div>`, 'tampon à côté de la signature OF');

    // Gates de sortie (mêmes que 12/08).
    if (!/<section class="programme-section">/.test(html)) throw new Error('Article 3 programme absent');
    if (/document joint/i.test(html)) throw new Error('Mention « document joint » résiduelle');
    if (/annexe/i.test(html)) throw new Error('Le HTML convention contient encore « annexe »');

    const pdf = await renderHtmlToPdfWeasy(html);
    const hash = createHash('sha256').update(pdf).digest('hex');
    const key = `conventions/${session.code}/${sponsor.legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-groupe-${hash.slice(0, 8)}.pdf`;
    await uploadFile(DOCS_BUCKET, key, pdf, 'application/pdf');
    await prisma.document.deleteMany({
      where: { tenantId: TENANT_ID, type: 'CONVENTION', entityType: 'session', entityId: session.id },
    });
    await prisma.document.create({
      data: { tenantId: TENANT_ID, type: 'CONVENTION', entityType: 'session', entityId: session.id,
              sessionId: session.id, pdfUrl: key, hashSha256: hash },
    });
    const out = path.join(OUT_DIR, `Convention-${sponsor.legalName}-${session.code}.pdf`);
    fs.writeFileSync(out, pdf);
    console.log(`CONVENTION ${session.code} · ${sponsor.legalName} · ${n} stagiaire${n > 1 ? 's' : ''} · ${totalHT.toLocaleString('fr-FR')} € HT · ${(pdf.length / 1024).toFixed(0)} Ko`);
    console.log(`  représentant : ${sponsor.representative ?? REPRESENTANT} · signée le ${CONVENTION_ISO}`);
    console.log(`  storage : ${key}`);
    console.log(`  local   : ${out}\n`);
  }

  console.log('Aucun email envoyé. ✅');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
