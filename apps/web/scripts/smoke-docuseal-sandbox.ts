/**
 * Test d'acceptation du lot B (spec signature 2026-09-04 §5) — sandbox DocuSeal.
 *
 * Crée UN envoi réel à partir d'une convention rendue par WeasyPrint avec les
 * ancres invisibles, puis relit ce que DocuSeal en a fait. Le point à prouver :
 * les ancres `{{…}}` donnent bien DEUX champs de signature attribués aux bons
 * rôles. Si DocuSeal n'a créé aucun champ, l'envoi partirait et le signataire
 * n'aurait rien à signer — l'échec serait silencieux en production.
 *
 * `send_email: false` (D-9) : AUCUN email ne part, ni au client ni à l'OF.
 * L'envoi reste ouvert dans le compte pour que Laurent ouvre le lien de
 * signature et termine le test d'acceptation (panneau de signature dans Adobe
 * Reader + téléchargement du certificat).
 *
 *   pnpm -F @qualiof/web exec dotenv -e ../../.env -e ../../.env.local -- \
 *     tsx scripts/smoke-docuseal-sandbox.ts
 *
 * Variantes :
 *   SMOKE_STATE=<submissionId>   relit un envoi existant (statut, certificat)
 *   SMOKE_ARCHIVE=<submissionId> archive un envoi de test
 */

import { writeFileSync } from 'node:fs';
import { renderConventionHtml, type ConventionData } from '../src/lib/convention-template';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import { resolveOfConfig } from '../src/lib/of-config';
import { createDocusealProvider } from '../src/lib/signature/docuseal';
import { SIGNATURE_ROLES } from '../src/lib/signature/text-tags';

const OUT = process.env.PROOF_OUT ?? '/tmp/preuve-signature-lot-b';
const API_KEY = (process.env.DOCUSEAL_API_KEY ?? '').trim();
// Aucun repli : le script ne choisit pas la région à la place de l'opérateur.
const BASE_URL = (process.env.DOCUSEAL_BASE_URL ?? '').trim();

/** Le signataire client du test — par défaut l'OF lui-même, jamais un tiers. */
const CLIENT_EMAIL = process.env.SMOKE_CLIENT_EMAIL ?? 'laurent@start-academy.fr';

function conventionData(): ConventionData {
  return {
    beneficiaireRaisonSociale: 'EXPERTA (TEST QualiOF)',
    beneficiaireSiret: '81234567800042',
    beneficiaireSiren: '812345678',
    beneficiaireRcsVille: 'Nice',
    beneficiaireRepresentantNom: 'Gilles BLANCHON',
    stagiaires: [{ prenom: 'Sophie', nom: 'Augustin', email: 'sophie@experta.fr' }],
    sessionStartDate: new Date('2026-10-07T00:00:00Z'),
    sessionEndDate: new Date('2026-12-16T00:00:00Z'),
    sessionLieu: "EXPERTA, 5 place de l'Ile de Beauté, 06300 Nice",
    conventionDate: new Date('2026-09-16T00:00:00Z'),
    produitTitre: "Intégrer l'IA dans son entreprise",
    produitDureeHeures: 88,
    produitObjectifs: ["Comprendre les usages IA du métier"],
    produitProgrammeMd: '## Module 1\n\nPrise en main des outils.',
    produitTrainerProfile: null,
    produitPriceHTPerStagiaire: 2500,
    signatureTags: true,
  };
}

async function api(path: string, method = 'GET'): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'X-Auth-Token': API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`DocuSeal ${method} ${path} → HTTP ${res.status} : ${await res.text()}`);
  return res.json();
}

async function relire(submissionId: string): Promise<void> {
  const provider = createDocusealProvider({ apiKey: API_KEY, baseUrl: BASE_URL });
  const etat = await provider.getRequest(submissionId);

  console.log(`\nEnvoi ${submissionId} — statut QualiOF : ${etat.status}`);
  for (const s of etat.signers) {
    console.log(
      `  · ${s.role.padEnd(24)} ${s.email.padEnd(32)} ${s.status}` +
        (s.signedAt ? ` (signé le ${s.signedAt.toISOString()})` : ''),
    );
  }
  console.log(`  certificat : ${etat.auditTrailUrl ?? '— pas encore produit'}`);

  if (etat.status === 'DONE') {
    const signes = await provider.downloadSignedDocument(submissionId);
    for (const d of signes) {
      writeFileSync(`${OUT}-docuseal-${d.name}.pdf`, d.pdf);
      console.log(`  → PDF signé écrit : ${OUT}-docuseal-${d.name}.pdf (${d.pdf.length} o)`);
    }
    const cert = await provider.downloadAuditTrail(submissionId);
    writeFileSync(`${OUT}-docuseal-certificat.pdf`, cert);
    console.log(`  → certificat écrit : ${OUT}-docuseal-certificat.pdf (${cert.length} o)`);
  }
}

async function main(): Promise<void> {
  if (!API_KEY) throw new Error('DOCUSEAL_API_KEY absente — rien à tester.');
  if (!BASE_URL) throw new Error('DOCUSEAL_BASE_URL absente — région DocuSeal inconnue.');

  if (process.env.SMOKE_ARCHIVE) {
    await api(`/submissions/${process.env.SMOKE_ARCHIVE}`, 'DELETE');
    console.log(`Envoi ${process.env.SMOKE_ARCHIVE} archivé.`);
    return;
  }
  if (process.env.SMOKE_STATE) {
    await relire(process.env.SMOKE_STATE);
    return;
  }

  const of = resolveOfConfig(null);
  const pdf = await renderHtmlToPdfWeasy(renderConventionHtml(conventionData(), of));
  console.log(`Convention rendue : ${Math.round(pdf.length / 1024)} Ko, ancres incluses.`);

  const provider = createDocusealProvider({ apiKey: API_KEY, baseUrl: BASE_URL });
  const envoi = await provider.createRequest({
    name: 'TEST QualiOF lot B — Convention EXPERTA',
    externalId: 'smoke-lot-b',
    documents: [{ name: 'convention-test-qualiof', pdf }],
    signers: [
      { role: SIGNATURE_ROLES.CLIENT, name: 'Gilles BLANCHON (test)', email: CLIENT_EMAIL, order: 0 },
      {
        role: SIGNATURE_ROLES.OF,
        name: `${of.resp.prenom} ${of.resp.nom}`.trim() || 'Laurent MARX',
        email: of.resp.email || 'laurent@start-academy.fr',
        order: 1,
      },
    ],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  });

  console.log(`\nEnvoi créé — submission ${envoi.providerId} (statut ${envoi.status})`);
  for (const s of envoi.signers) {
    console.log(`  · ${s.role.padEnd(24)} ${s.email.padEnd(32)} → ${s.signUrl ?? 'aucun lien'}`);
  }

  // LE point à prouver : les ancres ont-elles produit des champs de signature ?
  console.log(
    envoi.signatureFieldCount >= 2
      ? `\n✅ ${envoi.signatureFieldCount} champs signature créés depuis les ancres — D-7 validé.`
      : `\n❌ ${envoi.signatureFieldCount} champ signature — les ancres n'ont PAS été reconnues.`,
  );

  // Détail des champs, pour vérifier le rôle et la page de chacun.
  const sub = (await api(`/submissions/${envoi.providerId}`)) as Record<string, unknown>;
  const submitters = Array.isArray(sub.submitters) ? sub.submitters : [];
  console.log('\nSignataires côté DocuSeal :');
  for (const s of submitters) {
    const rec = s as Record<string, unknown>;
    const prefs = (rec.preferences ?? {}) as Record<string, unknown>;
    console.log(
      `  · ${String(rec.role).padEnd(24)} ${String(rec.email).padEnd(32)} ` +
        `statut=${rec.status} send_email=${prefs.send_email} sent_at=${rec.sent_at ?? 'jamais'}`,
    );
  }

  console.log(
    `\nProchaine étape manuelle : ouvrir le lien du signataire « ${SIGNATURE_ROLES.CLIENT} »,\n` +
      `signer, puis relancer avec SMOKE_STATE=${envoi.providerId} pour récupérer\n` +
      'le PDF signé et le certificat de signature.',
  );
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
