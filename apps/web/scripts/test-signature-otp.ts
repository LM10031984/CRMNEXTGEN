/**
 * Recette réelle, uniquement sur les coordonnées explicitement fournies.
 * TEST_OTP_EMAIL, TEST_OTP_PHONE, TEST_OTP_OUT requis ; aucun destinataire implicite.
 * create-email / create-sms : un document fictif + une invitation DocuSeal.
 * status : relit les envois et télécharge le PDF signé + le certificat.
 * Cette recette teste le prestataire et l'adaptateur, pas l'archivage BDD du CRM.
 * Ne charger que DOCUSEAL_API_KEY et DOCUSEAL_BASE_URL depuis la connexion autorisée.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createDocusealProvider } from '../src/lib/signature/docuseal';
import { signaturePhone } from '../src/lib/signature/phone';

type Manifest = {
  mode: 'email' | 'sms';
  providerId: string;
  signerId: string;
  invitationSent: boolean;
  createdAt: string;
};

async function main() {
  const action = process.argv[2];
  if (!['create-email', 'create-sms', 'status'].includes(action ?? '')) {
    throw new Error('Action attendue : create-email, create-sms ou status');
  }
  const out = process.env.TEST_OTP_OUT;
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.trim();
  if (!out || !apiKey || !baseUrl) throw new Error('Dossier de recette et connexion DocuSeal requis.');
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const provider = createDocusealProvider({ apiKey, baseUrl });

  if (action === 'status') {
    for (const mode of ['email', 'sms'] as const) {
      const path = join(out, `${mode}.json`);
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
      const state = await provider.getRequest(manifest.providerId);
      console.log(JSON.stringify({ mode, id: state.providerId, status: state.status,
        signedAt: state.signers[0]?.signedAt, certificateAvailable: !!state.auditTrailUrl }));
      if (state.status !== 'DONE') continue;
      const docs = await provider.downloadSignedDocument(manifest.providerId);
      const certificate = await provider.downloadAuditTrail(manifest.providerId);
      if (!docs.length || !certificate.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw new Error('PDF signé ou certificat manquant/invalide.');
      }
      for (const [index, doc] of docs.entries()) {
        if (!doc.pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Document non PDF.');
        await PDFDocument.load(doc.pdf);
        writeFileSync(join(out, `${mode}-signed-${index + 1}.pdf`), doc.pdf, { mode: 0o600 });
      }
      await PDFDocument.load(certificate);
      writeFileSync(join(out, `${mode}-audit-trail.pdf`), certificate, { mode: 0o600 });
      console.log(`${mode} : ${docs.length} PDF signé(s) et certificat reçus dans ${resolve(out)}.`);
    }
    return;
  }

  const mode = action === 'create-sms' ? 'sms' : 'email';
  const manifestPath = join(out, `${mode}.json`);
  if (existsSync(manifestPath)) throw new Error('Test déjà créé : utiliser status, pas de nouvel envoi automatique.');
  const email = process.env.TEST_OTP_EMAIL?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse de test explicite requise.');
  const phone = mode === 'sms' ? signaturePhone(process.env.TEST_OTP_PHONE) : undefined;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const title = `TEST TECHNIQUE - CODE ${mode.toUpperCase()}`;
  const lines = [title, 'Document fictif - aucun engagement commercial.',
    'Objet : verifier le code de securite et la reception de la preuve.',
    `Destinataire : ${email}`, `Mode : code ${mode === 'sms' ? 'SMS' : 'e-mail'}`,
    'Apres verification du code, apposez votre signature ci-dessous.',
    'Le PDF signe et le certificat seront recuperes pour controle.'];
  lines.forEach((line, i) => page.drawText(line, { x: 48, y: 770 - i * 32, size: i === 0 ? 17 : 11, font }));
  page.drawText('Signature de test :', { x: 48, y: 450, size: 12, font });
  page.drawText('{{Signature;role=Client;type=signature;width=180;height=60}}',
    { x: 48, y: 425, size: 4, font, color: rgb(1, 1, 1) });
  const bytes = Buffer.from(await pdf.save());
  writeFileSync(join(out, `${mode}-unsigned.pdf`), bytes, { mode: 0o600 });
  const request = await provider.createRequest({
    name: title, externalId: `test-otp-${randomUUID()}`,
    documents: [{ name: title, pdf: bytes }],
    signers: [{ role: 'Client', name: 'Laurent Marx', email, order: 0,
      verification: mode, ...(phone ? { phone } : {}) }],
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  const signer = request.signers[0];
  const manifest: Manifest = { mode, providerId: request.providerId,
    signerId: signer?.providerSignerId ?? '', invitationSent: false, createdAt: new Date().toISOString() };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  if (request.signatureFieldCount !== 1 || !signer?.providerSignerId) {
    throw new Error('Envoi créé mais champ de signature incorrect : aucune invitation envoyée.');
  }
  // Exception de recette explicite : invitation envoyée par DocuSeal au seul
  // destinataire fourni. Le mailer et les paramètres des clients sont inchangés.
  await provider.remind(request.providerId, signer.providerSignerId);
  manifest.invitationSent = true;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ mode, providerId: request.providerId, invitationRequested: true }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Échec de la recette OTP');
  process.exitCode = 1;
});
