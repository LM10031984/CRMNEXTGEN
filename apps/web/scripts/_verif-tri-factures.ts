/** Vérification : chaque orderBy de la liste des factures est accepté par Postgres. */
import { INVOICE_SORT_KEYS, buildInvoicesOrderBy } from '../src/lib/invoices/list-sort';
const { prisma } = await import('@qualiof/db');

for (const key of [null, ...INVOICE_SORT_KEYS]) {
  for (const dir of ['asc', 'desc'] as const) {
    const orderBy = buildInvoicesOrderBy(key as never, dir);
    try {
      const rows: any[] = await prisma.invoice.findMany({
        orderBy: orderBy as never,
        take: 3,
        include: { payerOrg: { select: { legalName: true } }, participant: { include: { person: { select: { lastName: true } } } } },
      });
      const apercu = rows.map((r) => {
        const payeur = r.payerOrg?.legalName ?? r.participant?.person?.lastName ?? '—';
        switch (key) {
          case 'numero': return r.number;
          case 'date': return r.issueDate?.toISOString().slice(0, 10) ?? 'sans date';
          case 'payeur': return payeur.slice(0, 18);
          case 'montant': return `${Number(r.amountTTC)}€`;
          case 'statut': return r.status;
          default: return `${r.issueDate?.toISOString().slice(0, 10)} ${r.number}`;
        }
      });
      console.log(`✅ ${String(key ?? 'défaut').padEnd(8)} ${dir.padEnd(5)} → ${apercu.join(' · ')}`);
    } catch (e: any) {
      console.log(`❌ ${String(key ?? 'défaut').padEnd(8)} ${dir.padEnd(5)} → ${e?.message?.split('\n')[0]}`);
    }
    if (key === null) break; // le défaut n'a pas de sens directionnel
  }
}
await prisma.$disconnect();
