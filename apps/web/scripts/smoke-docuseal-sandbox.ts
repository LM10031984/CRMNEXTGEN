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
import {
  renderAgeficeAttendanceHtml,
  type AgeficeAttendanceTemplateData,
} from '../src/lib/closure/agefice-attendance-template';
import { fillAgeficePdf, type AgeficeFormData } from '../src/lib/agefice-form-fill';
import { extractTextFromPdf } from '../src/lib/pdf-extract';
import { renderHtmlToPdfWeasy } from '../src/lib/pdf-render';
import { resolveOfConfig } from '../src/lib/of-config';
import { createDocusealProvider } from '../src/lib/signature/docuseal';
import { SIGNATURE_ROLES } from '../src/lib/signature/text-tags';

const OUT = process.env.PROOF_OUT ?? '/tmp/preuve-signature-lot-b';
const API_KEY = (process.env.DOCUSEAL_API_KEY ?? '').trim();
// Aucun repli : le script ne choisit pas la région à la place de l'opérateur.
const BASE_URL = (process.env.DOCUSEAL_BASE_URL ?? '').trim();

/**
 * Type de document à envoyer : `convention` (défaut), `agefice`, `assiduite`.
 * Les trois n'ont PAS le même mécanisme d'ancrage — la convention et
 * l'attestation sont rendues en HTML par WeasyPrint, le dossier AGEFICE est le
 * formulaire officiel rempli par pdf-lib, où l'ancre est DESSINÉE.
 */
const DOC = (process.env.SMOKE_DOC ?? 'convention') as 'convention' | 'agefice' | 'assiduite';

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

function ageficeData(signatureTags: boolean): AgeficeFormData {
  return {
    pa: { name: 'PA Nice', number: '06', contactName: 'Virginie BEHIN', address: '1 rue du Test',
          postalCode: '06000', city: 'Nice', phone: '0400000000', email: 'pa@test.fr' },
    entreprise: { raisonSociale: 'EXPERTA (TEST QualiOF)', nomCommercial: null, naf: '6820A',
                  siret: '81234567800042', activite: 'Immobilier', formeJuridique: 'EI',
                  address: "5 place de l'Ile de Beauté", postalCode: '06300', city: 'Nice' },
    stagiaire: { civilite: 'MME', nom: 'AUGUSTIN', prenom: 'Sophie', nomNaissance: null,
                 dateNaissance: new Date('1985-04-12T00:00:00Z'), securiteSociale: null,
                 phone: '0600000000', email: 'sophie@experta.fr', diplome: 'BAC', experience: '4_10_ANS' },
    of: { name: 'START ACADEMY', rnq: 'RNQ-0001', siret: '95131909400029',
          addressStreet: '12 avenue des Camélias', addressCp: '06800', addressVille: 'Cagnes-sur-Mer',
          resp: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'formation@start-academy.fr' },
          contact: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'formation@start-academy.fr' } },
    formationType: 'ACTION', obligatoire: false, reconversion: false,
    formation: { intitule: "Intégrer l'IA dans son entreprise", thematique: 'IA', niveau: 'INITIATION',
                 certif: 'SANS_QUALIFICATION', dateDebut: new Date('2026-10-07T00:00:00Z'),
                 dateFin: new Date('2026-12-16T00:00:00Z'), dureePresentielIndividuel: 0,
                 dureePresentielCollectif: 88, dureeFoadSynchrone: 0, dureeFoadAsynchrone: 0,
                 formateur: 'Laurent MARX', lieuPostalCode: '06300', lieuVille: 'Nice', prixHT: 2500,
                 enEntreprise: false, lieuAdresseComplete: 'EXPERTA, Nice', deroulementPedago: 'Présentiel' },
    evaluations: ['QUIZ'], evaluationAutreDetail: null, attestation: 'ATTESTATION_STAGE',
    mandat: false, signature: { lieu: 'Cagnes-sur-Mer', date: new Date() },
    signatureTags,
  } as AgeficeFormData;
}

function assiduiteData(signatureTags: boolean): AgeficeAttendanceTemplateData {
  return {
    tenantId: 'test', formationIntitule: "Intégrer l'IA dans son entreprise",
    formationDateDebut: new Date('2026-10-07T00:00:00Z'), formationDateFin: new Date('2026-12-16T00:00:00Z'),
    formateurNomQualite: 'Laurent MARX, formateur', nombreParticipants: 5,
    ofRaisonSociale: 'START ACADEMY', ofNumeroDeclaration: 'RNQ-0001', ofDreetsVille: 'Nice',
    ofResponsablePrenomNom: 'Laurent MARX', ofResponsableQualite: 'PDG', ofLieuDelivrance: 'Cagnes-sur-Mer',
    stagiaireNomPrenom: 'Sophie AUGUSTIN', entrepriseRaisonSociale: 'EXPERTA (TEST QualiOF)',
    prevuePresIndividuel: 0, prevuePresCollectif: 88, prevueFoadSync: 0, prevueFoadAsync: 0,
    realiseePresIndividuel: 0, realiseePresCollectif: 88, realiseeFoadSync: 0, realiseeFoadAsync: 0,
    sommeChiffres: 2500, sommeLettres: 'deux mille cinq cents euros', modeReglement: 'Virement',
    dateReglement: new Date('2026-12-20T00:00:00Z'), dateDelivrance: new Date('2026-12-20T00:00:00Z'),
    signatureTags,
  } as AgeficeAttendanceTemplateData;
}

/** Rend le PDF du type demandé, avec ses ancres. */
async function construireDocument(): Promise<{ nom: string; titre: string; pdf: Buffer; roles: string[] }> {
  const of = resolveOfConfig(null);
  if (DOC === 'agefice') {
    return {
      nom: 'dossier-agefice-test-qualiof',
      titre: 'TEST QualiOF — Dossier AGEFICE Sophie AUGUSTIN',
      pdf: await fillAgeficePdf(ageficeData(true)),
      // Une seule partie signe : l'OF a déjà son image apposée sur le formulaire.
      roles: [SIGNATURE_ROLES.STAGIAIRE],
    };
  }
  if (DOC === 'assiduite') {
    return {
      nom: 'attestation-assiduite-test-qualiof',
      titre: "TEST QualiOF — Attestation d'assiduité Sophie AUGUSTIN",
      pdf: await renderHtmlToPdfWeasy(renderAgeficeAttendanceHtml(assiduiteData(true))),
      roles: [SIGNATURE_ROLES.STAGIAIRE, SIGNATURE_ROLES.OF],
    };
  }
  return {
    nom: 'convention-test-qualiof',
    titre: 'TEST QualiOF lot B — Convention EXPERTA',
    pdf: await renderHtmlToPdfWeasy(renderConventionHtml(conventionData(), of)),
    roles: [SIGNATURE_ROLES.CLIENT, SIGNATURE_ROLES.OF],
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

  if (etat.status !== 'DONE') {
    console.log('\n(rien à télécharger tant que tous les signataires n\'ont pas signé)');
    return;
  }

  const signes = await provider.downloadSignedDocument(submissionId);
  for (const d of signes) {
    writeFileSync(`${OUT}-docuseal-${d.name}.pdf`, d.pdf);
    console.log(`  → PDF signé écrit : ${OUT}-docuseal-${d.name}.pdf (${d.pdf.length} o)`);
  }
  const cert = await provider.downloadAuditTrail(submissionId);
  writeFileSync(`${OUT}-docuseal-certificat.pdf`, cert);
  console.log(`  → certificat écrit : ${OUT}-docuseal-certificat.pdf (${cert.length} o)`);

  // ─── Vérification 1 : le PDF signé porte-t-il une VRAIE signature numérique ?
  // C'est ce qui déclenche le panneau de signature d'Adobe Reader — et c'est
  // toute la valeur probante qu'on achète chez un prestataire tiers.
  console.log('\n=== Signature numérique du PDF (panneau Adobe) ===\n');
  const brut = signes[0]!.pdf.toString('latin1');
  const controles: Array<[string, boolean, string]> = [
    ['objet de signature /Type /Sig', /\/Type\s*\/Sig/.test(brut), ''],
    ['plage signée /ByteRange', /\/ByteRange/.test(brut), (brut.match(/\/ByteRange\s*\[[^\]]*\]/) ?? [''])[0]],
    [
      'format PAdES/CMS (/SubFilter)',
      /\/SubFilter\s*\/(ETSI\.CAdES\.detached|adbe\.pkcs7\.detached|ETSI\.RFC3161)/.test(brut),
      (brut.match(/\/SubFilter\s*\/[A-Za-z0-9.]+/) ?? [''])[0],
    ],
    ['champ de formulaire signature (/AcroForm)', /\/AcroForm/.test(brut), ''],
  ];
  for (const [libelle, ok, detail] of controles) {
    console.log(`${ok ? '  OK  ' : ' ÉCHEC'} │ ${libelle}${detail ? ` — ${detail}` : ''}`);
  }
  const signeNumeriquement = controles.slice(0, 3).every(([, ok]) => ok);
  console.log(
    signeNumeriquement
      ? "\n✅ PDF signé numériquement : Adobe Reader affichera le panneau de signature."
      : "\n❌ Aucune signature numérique détectée — le PDF n'a que l'image de la signature.",
  );

  // ─── Vérification 2 : le certificat porte-t-il la trace d'un hébergement UE ?
  console.log('\n=== Certificat de signature (ce que réclame l\'AGEFICE) ===\n');
  const texte = (await extractTextFromPdf(cert)).text;
  const attendus: Array<[string, RegExp]> = [
    ['adresse email du signataire', /@/],
    ['adresse IP', /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/],
    [
      'horodatage',
      /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/,
    ],
    ['identifiant d\'enveloppe', /[0-9a-f]{8,}|\b1619\d{3}\b/i],
  ];
  for (const [libelle, motif] of attendus) {
    console.log(`${motif.test(texte) ? '  OK  ' : ' ABSENT'} │ ${libelle}`);
  }

  const hoteCertificat = (etat.auditTrailUrl ?? '').match(/^https?:\/\/([^/]+)/)?.[1] ?? '(inconnu)';
  const hotesDocuments = [
    ...new Set(etat.documentUrls.map((u) => u.match(/^https?:\/\/([^/]+)/)?.[1] ?? '(inconnu)')),
  ];
  console.log(`\n  certificat servi par : ${hoteCertificat}`);
  console.log(`  documents signés servis par : ${hotesDocuments.join(', ') || '(aucun)'}`);

  const tousHotes = [hoteCertificat, ...hotesDocuments];
  const horsUe = tousHotes.filter((h) => /docuseal\.com$/i.test(h));
  const enUe = tousHotes.filter((h) => /docuseal\.eu$/i.test(h));
  console.log(
    horsUe.length > 0
      ? `❌ ${horsUe.length} pièce(s) servie(s) par le serveur global : ${horsUe.join(', ')}`
      : enUe.length === tousHotes.length
        ? '✅ Certificat et document signé servis par l\'instance UE.'
        : `⚠ Hôtes inattendus : ${tousHotes.join(', ')} — à vérifier à la main.`,
  );

  // Le texte du certificat ne cite aucun hôte : c'est normal, et c'est
  // précisément pour ça que l'hébergement se lit sur l'URL de service.
  const citesDansTexte = texte.match(/docuseal\.(eu|com)[^\s]*/gi) ?? [];
  if (citesDansTexte.length > 0) {
    console.log(`  (hôtes cités dans le texte : ${[...new Set(citesDansTexte)].join(', ')})`);
  }

  console.log('\n--- Texte du certificat (300 premiers caractères) ---');
  console.log(texte.slice(0, 300).replace(/\s+/g, ' '));
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
  const doc = await construireDocument();
  console.log(`Document « ${DOC} » rendu : ${Math.round(doc.pdf.length / 1024)} Ko, ancres incluses.`);

  const nomOf = `${of.resp.prenom} ${of.resp.nom}`.trim() || 'Laurent MARX';
  const emailOf = of.resp.email || 'laurent@start-academy.fr';
  const signataires = doc.roles.map((role, i) => ({
    role,
    name: role === SIGNATURE_ROLES.OF ? nomOf : 'Sophie AUGUSTIN (test)',
    email: role === SIGNATURE_ROLES.OF ? emailOf : CLIENT_EMAIL,
    order: i,
  }));

  const provider = createDocusealProvider({ apiKey: API_KEY, baseUrl: BASE_URL });
  // `fields` n'est présent que dans la réponse de création : on garde la trace
  // brute pour le mode mesure (l'adaptateur, lui, n'en expose que le compte).
  let creation: Record<string, unknown> = {};
  const fetchOrigine = globalThis.fetch;
  globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
    const r = await fetchOrigine(...a);
    if (String(a[0]).endsWith('/submissions/pdf')) {
      creation = (await r.clone().json()) as Record<string, unknown>;
    }
    return r;
  }) as typeof fetch;

  const envoi = await provider.createRequest({
    name: doc.titre,
    externalId: `smoke-${DOC}`,
    documents: [{ name: doc.nom, pdf: doc.pdf }],
    signers: signataires,
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  });

  console.log(`\nEnvoi créé — submission ${envoi.providerId} (statut ${envoi.status})`);
  for (const s of envoi.signers) {
    console.log(`  · ${s.role.padEnd(24)} ${s.email.padEnd(32)} → ${s.signUrl ?? 'aucun lien'}`);
  }

  // LE point à prouver : les ancres ont-elles produit des champs de signature ?
  // ─── Mode mesure : où le prestataire place-t-il réellement les champs ?
  // Les coordonnées ne sont exposées QU'À LA CRÉATION (le GET ne les rend pas).
  // C'est le seul moyen de vérifier qu'un champ tombe dans la bonne case sans
  // demander une signature humaine.
  if (process.env.SMOKE_MEASURE === '1') {
    const sub = (await api(`/submissions/${envoi.providerId}`)) as Record<string, unknown>;
    const roleParUuid = new Map<string, string>();
    for (const x of (Array.isArray(sub.submitters) ? sub.submitters : []) as Array<Record<string, unknown>>) {
      roleParUuid.set(String(x.uuid), String(x.role));
    }
    console.log('\nGéométrie des champs (A4 = 595 × 842 pt, origine haut-gauche) :');
    for (const f of (creation.fields ?? []) as Array<Record<string, unknown>>) {
      const a = ((f.areas as Array<Record<string, number>>) ?? [{}])[0] ?? {};
      const x = (a.x ?? 0) * 595, y = (a.y ?? 0) * 842;
      const w = (a.w ?? 0) * 595, h = (a.h ?? 0) * 842;
      console.log(
        `  « ${f.name} »  rôle=${roleParUuid.get(String(f.submitter_uuid)) ?? '?'}` +
          `  page ${(a.page ?? 0) + 1}  x=${x.toFixed(0)} y=${y.toFixed(0)}  ${w.toFixed(0)} × ${h.toFixed(0)} pt`,
      );
    }
    await api(`/submissions/${envoi.providerId}`, 'DELETE');
    console.log(`\nEnvoi de mesure ${envoi.providerId} archivé.`);
    return;
  }

  const attendus = doc.roles.length;
  console.log(
    envoi.signatureFieldCount >= attendus
      ? `\n✅ ${envoi.signatureFieldCount} champ(s) signature créé(s) pour ${attendus} rôle(s) — ancrage validé.`
      : `\n❌ ${envoi.signatureFieldCount} champ(s) pour ${attendus} rôle(s) — ancrage NON reconnu.`,
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
