/**
 * Supprime UN lead de test et tout ce qui pend dessous.
 *
 * Né du 10/09/2026 : la vérification de l'express du stand après la mise en
 * production de la chaîne exigeait une vraie saisie — donc un vrai lead, avec
 * un vrai email parti. Ce lead-là doit disparaître, sinon les relances
 * J+1/J+4/J+10 poursuivront un prospect qui n'existe pas.
 *
 * Sans `--apply`, ne fait que MONTRER. C'est la convention des scripts qui
 * touchent la prod dans ce dépôt, et elle vaut doublement pour une suppression.
 *
 *   pnpm --filter @qualiof/db exec dotenv -e ../../.env -- \
 *     tsx scripts/purge-lead-test.ts <leadId>            # montre
 *   … tsx scripts/purge-lead-test.ts <leadId> --apply    # supprime
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import { prisma } from '../src/index.js';

const APPLY = process.argv.includes('--apply');
const leadId = process.argv.find((a) => !a.startsWith('--') && /^[0-9a-f-]{36}$/i.test(a));

async function main(): Promise<void> {
  if (!leadId) {
    console.error('Usage : tsx scripts/purge-lead-test.ts <leadId> [--apply]');
    process.exit(1);
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      email: true,
      source: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          actions: true,
          diagnosticSubmissions: true,
          diagnostics: true,
          proposals: true,
          tasks: true,
          comments: true,
        },
      },
    },
  });

  if (!lead) {
    console.error(`Lead ${leadId} introuvable — rien à faire.`);
    process.exit(1);
  }

  console.log(`Mode : ${APPLY ? '**SUPPRESSION (--apply)**' : 'simulation (rien n’est supprimé)'}\n`);
  console.log(`Lead      : ${lead.firstName ?? ''} ${lead.lastName ?? ''} <${lead.email}>`);
  console.log(`  id      : ${lead.id}`);
  console.log(`  source  : ${lead.source}`);
  console.log(`  statut  : ${lead.status} · créé le ${lead.createdAt.toISOString()}`);
  console.log('\nCe qui pend dessous :');
  for (const [k, v] of Object.entries(lead._count)) console.log(`  ${String(v).padStart(3)} ${k}`);

  // Refus net : ce script est fait pour un lead de VÉRIFICATION, pas pour
  // effacer un prospect. Une proposition ou un diagnostic accroché signifie
  // qu'on s'est trompé de ligne.
  if (lead._count.proposals > 0 || lead._count.diagnostics > 0) {
    console.error(
      '\n❌ Refus : ce lead porte une proposition ou un diagnostic complet. Ce n’est pas\n' +
        '   un lead de vérification. Suppression annulée.',
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n_Simulation. Relancer avec `--apply` pour supprimer._');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // La trace d'abord : après le delete, plus rien ne dira ce qui a existé.
    await tx.auditLog.create({
      data: {
        tenantId: lead.tenantId,
        userId: null,
        entity: 'Lead',
        entityId: lead.id,
        action: 'lead.purge_test',
        diff: {
          motif: 'Lead créé par la vérification de l’express du stand après la mise en production de la chaîne (10/09/2026)',
          lead: {
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            source: lead.source,
            createdAt: lead.createdAt.toISOString(),
          },
          supprime: lead._count,
        },
      },
    });

    await tx.diagnosticSubmission.deleteMany({ where: { leadId: lead.id } });
    await tx.leadAction.deleteMany({ where: { leadId: lead.id } });
    await tx.task.deleteMany({ where: { leadId: lead.id } });
    await tx.internalComment.deleteMany({ where: { leadId: lead.id } });
    await tx.lead.delete({ where: { id: lead.id } });
  });

  console.log('\n✅ Lead supprimé, avec sa soumission et ses actions. AuditLog écrit.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
