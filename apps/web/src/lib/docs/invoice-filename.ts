/**
 * Nom de fichier d'une facture — et de son duplicata acquitté.
 *
 * Laurent 2026-09-10 : « tu devais renommer les documents pour qu'ils soient
 * identifiables […] tu m'as dit l'avoir fait pour tous les docs, ce n'est pas
 * le cas ». Les factures faisaient partie des oubliés : elles sortaient en
 * `F-202601-214.pdf`, ce qui identifie la PIÈCE mais pas le CLIENT. Dans un
 * dossier de dix factures à envoyer, il faut ouvrir chacune pour trouver
 * la bonne.
 *
 *     Facture-F-202601-214-BIANCO-INVEST-ASSURANCES.pdf
 *     Facture-acquittee-F-202601-214-BIANCO-INVEST-ASSURANCES.pdf
 *
 * Le numéro reste EN TÊTE du segment client : c'est lui la clé comptable, et
 * les factures se rangent ainsi dans l'ordre d'émission.
 *
 * Qui est le client : le payeur d'abord (personne morale, cas des salariés
 * groupés sur une SARL), l'apprenant ensuite (auto-payeur). Aucun des deux ⇒
 * on s'en tient au numéro plutôt que d'inventer un nom.
 *
 * Module PUR : il ne connaît que les quelques champs qu'il lit, jamais Prisma.
 */

import { asciiSlug, personFilenamePart } from './download-filename';

export interface InvoiceForFilename {
  number: string;
  payerOrg?: { brandName?: string | null; legalName?: string | null } | null;
  participant?: {
    person: { firstName: string | null; lastName: string | null };
  } | null;
}

export function invoiceDownloadFilename(
  invoice: InvoiceForFilename,
  options?: { acquittee?: boolean },
): string {
  const client =
    asciiSlug(invoice.payerOrg?.brandName ?? invoice.payerOrg?.legalName ?? null) ||
    personFilenamePart(
      invoice.participant?.person.firstName,
      invoice.participant?.person.lastName,
    );

  const segments = [
    options?.acquittee ? 'Facture-acquittee' : 'Facture',
    asciiSlug(invoice.number),
    client,
  ].filter(Boolean);

  return `${segments.join('-')}.pdf`;
}
