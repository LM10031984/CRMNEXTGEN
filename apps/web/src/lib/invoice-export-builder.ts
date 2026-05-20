/**
 * Helper pur — Construction des lignes d'export comptable xlsx (Phase 11 Plan 11-07).
 *
 * Pourquoi un helper isolé du fichier route :
 *  - Testable sans mocker Prisma / NextResponse / xlsx.write.
 *  - Le mapping `Invoice` → row reste explicite, facile à faire évoluer (ex. ajouter
 *    une colonne « Date paiement » optionnelle si Laurent le demande).
 *  - La route (`apps/web/src/app/api/factures/export/route.ts`) consomme ce helper.
 *
 * Conventions (D-14 + D-16 CONTEXT.md) :
 *  - **12 colonnes verbatim** (cf `EXPORT_HEADERS`).
 *  - **Avoirs en négatif** : `inv.amountHT` est déjà stocké signé négatif côté BDD
 *    pour `status='CREDIT_NOTE'` (Plan 11-05). On les ressort tels quels →
 *    `SUM(HT)` Excel donne le solde net (D-16).
 *  - **Libellé** : `firstName lastName` du participant, sinon "Facture groupée"
 *    pour les factures sponsor-group multi-participants (D-04 Plan 11-02).
 *  - **SIRET vide accepté** : pas d'erreur si `payerOrg` absent (facture sans org).
 *  - **issueDate null** : colonne vide (string '') — possible pour DRAFT.
 *
 * Pattern : clone-strict de `apps/web/src/app/api/qualiopi-bilan/export/route.ts`
 * (Phase 3, qui mappe `bilan.rows` vers tableau de tableaux pour `aoa_to_sheet`).
 */

export const EXPORT_HEADERS = [
  'Date émission',
  'Numéro',
  'Type',
  'Libellé',
  'Payeur',
  'SIRET',
  'Montant HT',
  'TVA',
  'Montant TTC',
  'Payé',
  'Reste',
  'Statut',
] as const;

/**
 * Forme minimale attendue par le helper. La route /api/factures/export passe les
 * `Invoice` Prisma castés en `InvoiceExportInput` via `.map()` (Decimal accepté
 * en string|number).
 */
export interface InvoiceExportInput {
  status: string;
  number: string;
  issueDate: Date | null;
  /** Prisma Decimal — sérialisé en string par défaut, accepte aussi number. */
  amountHT: number | string;
  amountTTC: number | string;
  amountPaid: number | string;
  payerOrg: { legalName: string | null; siret: string | null } | null;
  participant: { person: { firstName: string; lastName: string } | null } | null;
}

/**
 * Construit le tableau `[headers, ...rows]` consommable par `XLSX.utils.aoa_to_sheet`.
 *
 * Type de retour : tableau de tableaux (cellules `string | number`) — pas d'objets,
 * pour rester compatible avec `aoa_to_sheet` directement.
 *
 * @param invoices Liste de factures (Invoice Prisma + payerOrg + participant.person)
 * @returns `{ headers: EXPORT_HEADERS, rows: (string|number)[][] }`
 */
export function buildInvoiceExportRows(invoices: InvoiceExportInput[]): {
  headers: typeof EXPORT_HEADERS;
  rows: (string | number)[][];
} {
  const rows: (string | number)[][] = invoices.map((inv) => {
    const isAvoir = inv.status === 'CREDIT_NOTE';
    const libelle = inv.participant?.person
      ? `${inv.participant.person.firstName} ${inv.participant.person.lastName}`
      : 'Facture groupée';

    // Prisma Decimal arrive en string si non sérialisé en number (ex. quand on passe
    // l'objet tel quel depuis findMany). Number() gère les deux cas (et NaN s'il y a
    // un bug en amont, ce qui sera visible côté Excel — fail loud).
    const ht = Number(inv.amountHT);
    const ttc = Number(inv.amountTTC);
    const paid = Number(inv.amountPaid);

    return [
      // Col 0 : Date émission (YYYY-MM-DD ou '')
      inv.issueDate ? new Date(inv.issueDate).toISOString().slice(0, 10) : '',
      // Col 1 : Numéro
      inv.number,
      // Col 2 : Type (FAC | AVO) — D-14
      isAvoir ? 'AVO' : 'FAC',
      // Col 3 : Libellé (participant ou "Facture groupée")
      libelle,
      // Col 4 : Payeur (raison sociale)
      inv.payerOrg?.legalName ?? '',
      // Col 5 : SIRET
      inv.payerOrg?.siret ?? '',
      // Col 6 : Montant HT (négatif pour AVO — D-16, déjà signé en BDD Plan 11-05)
      ht,
      // Col 7 : TVA dérivée = TTC - HT
      ttc - ht,
      // Col 8 : Montant TTC (négatif pour AVO)
      ttc,
      // Col 9 : Payé
      paid,
      // Col 10 : Reste à encaisser = TTC - Payé
      ttc - paid,
      // Col 11 : Statut (string brute Prisma — l'expert-comptable comprend)
      inv.status,
    ];
  });

  return { headers: EXPORT_HEADERS, rows };
}
