/**
 * Adaptateur mock — le défaut, et le seul chemin actif tant que le lot 3 n'est
 * pas livré.
 *
 * Même principe que le mailer (`MAIL_DRY_RUN`) : sans identifiants, ou avec
 * `EINVOICE_DRY_RUN=1`, RIEN ne sort de la machine. Un raccordement à une
 * plateforme d'État qui partirait par défaut serait le contraire d'un
 * garde-fou — ici l'inaction est l'état sûr, et il faut une décision explicite
 * pour en sortir.
 *
 * Il n'imite pas la plateforme : il rend des réponses plausibles et STABLES,
 * pour que les tests portent sur notre code et pas sur la météo du réseau.
 */

import { createHash } from 'node:crypto';
import type {
  DirectoryEntry,
  EInvoiceDocument,
  EInvoicePlatform,
  PlatformEvent,
  SubmitResult,
  ValidationReport,
} from '../port';

/**
 * Id déterministe dérivé du contenu : deux envois du même document rendent le
 * même id, ce qui exerce l'idempotence `(invoiceId, xmlSha256)` au lieu de la
 * masquer derrière un compteur qui changerait à chaque exécution.
 */
function idDeterministe(graine: string): string {
  const hex = createHash('sha256').update(graine).digest('hex').slice(0, 12);
  return String(BigInt('0x' + hex));
}

export class MockEInvoicePlatform implements EInvoicePlatform {
  readonly name = 'MOCK';

  async ping() {
    return { ok: true, detail: 'adaptateur mock — aucune connexion sortante' };
  }

  async validate(doc: EInvoiceDocument): Promise<ValidationReport> {
    // Le mock ne sait pas lire un CII. Il vérifie ce qu'il PEUT vérifier — un
    // document vide n'est jamais valide — et le dit sans prétendre davantage.
    if (doc.content.length === 0) {
      return {
        valid: false,
        issues: [{ severity: 'fatal', code: null, message: 'Document vide.' }],
        raw: { mock: true },
      };
    }
    return { valid: true, issues: [], raw: { mock: true, bytes: doc.content.length } };
  }

  async submit(doc: EInvoiceDocument): Promise<SubmitResult> {
    return {
      externalId: idDeterministe(`invoice:${doc.externalId}`),
      raw: { mock: true, externalId: doc.externalId },
    };
  }

  async pollEvents(): Promise<{ events: PlatformEvent[]; hasMore: boolean }> {
    // Aucun événement : en mock rien n'a été transmis, donc rien ne peut avoir
    // changé d'état. Inventer une progression donnerait une fausse confiance.
    return { events: [], hasMore: false };
  }

  async lookupDirectory(siren: string): Promise<DirectoryEntry[]> {
    // Annuaire vide = client non joignable = repli sur l'email. C'est le
    // comportement actuel de QualiOF, et le bon défaut hors production.
    void siren;
    return [];
  }
}
