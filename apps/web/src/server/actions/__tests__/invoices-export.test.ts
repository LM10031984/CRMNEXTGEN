// Wave 0 stub — Phase 11 — implemented in Plan 11-07
import { describe, it } from 'vitest';

describe('exportInvoicesXlsx (route /api/factures/export)', () => {
  it.todo('GET sans session → 401');
  it.todo('GET avec session COMMERCIAL → 403');
  it.todo('GET avec session FORMATEUR → 403');
  it.todo('GET avec session ADMIN → 200 + Content-Type xlsx');
  it.todo('GET avec session COMPTABLE → 200');
  it.todo('Content-Disposition contient filename=factures_YYYY-MM-DD_YYYY-MM-DD.xlsx');
  it.todo('Bad request (from > to ou format invalide) → 400');
  it.todo('Sheet contient 12 colonnes attendues : Date émission / Numéro / Type / Libellé / Payeur / SIRET / Montant HT / TVA / Montant TTC / Payé / Reste / Statut');
  it.todo('Avoirs (status=CREDIT_NOTE) lignes avec Type=AVO + amountHT négatif');
  it.todo('Crée AuditLog invoices.exported avec diff {from, to, count}');
  it.todo('Période vide (0 factures matchées) → 200 + sheet avec headers uniquement');
});
