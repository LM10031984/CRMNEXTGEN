// Wave 0 stub — Phase 11 — implemented in Plan 11-08
import { describe, it } from 'vitest';

describe('getInvoicesListData', () => {
  it.todo('calcul KPI caMois = sum(amountTTC) Invoice WHERE status ∈ {ISSUED,PAID,PARTIAL} AND issueDate dans mois courant');
  it.todo('calcul KPI impayesAmount + impayesCount = sum(amountTTC - amountPaid) Invoice WHERE status ∈ {ISSUED,PARTIAL,OVERDUE}');
  it.todo('calcul KPI dsoMoyen = avg(paidAt - issueDate) en jours sur les PAID du mois (null si aucune)');
  it.todo('calcul KPI aFacturerCount = count SessionParticipant enrollmentStatus=COMPLETED sans Invoice liée');
  it.todo('filtre statuses multiple');
  it.todo('filtre période from/to');
  it.todo('filtre payerOrgId');
  it.todo('filtre onlyUnpaid = ISSUED+PARTIAL+OVERDUE');
  it.todo('tri par défaut : issueDate DESC, number DESC');
  it.todo('pagination page/pageSize');
});
