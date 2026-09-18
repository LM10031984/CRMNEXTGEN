'use server';

import { prisma, Prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireRole } from '@/lib/rbac';
import { legalLinkAtSession } from '@/lib/persons/legal-link-period';
import { refusalForSessionPayer } from '@/lib/sessions/session-regime';
import {
  assertCompanyPriceEditable,
  synchronizeCompanyPriceTx,
} from '@/lib/pricing/company-session-price';

const Input = z.object({
  sessionId: z.string().min(1),
  regime: z.enum(['ENTREPRISE', 'INDIVIDUEL']),
  priceHT: z
    .number()
    .finite()
    .positive()
    .max(99999999.99)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Deux décimales maximum.'),
  apply: z.boolean().optional(),
  confirmationKey: z.string().optional(),
});
export async function setSessionRegime(
  input: z.infer<typeof Input>,
): Promise<
  | {
      ok: true;
      changed: boolean;
      confirmationKey?: string;
      preview?: { regime: string; priceHT: number; participants: number };
    }
  | { ok: false; error: string }
> {
  try {
    const user = await requireRole(['ADMIN', 'MANAGER']);
    const value = Input.parse(input);
    const result = await prisma.$transaction(
      async (tx) => {
        const session = await tx.trainingSession.findFirst({
          where: { id: value.sessionId, tenantId: user.tenantId },
          include: {
            participants: {
              include: { sponsorOrg: true, person: { include: { legalLinks: true } } },
            },
          },
        });
        if (!session) throw new Error('Session introuvable.');
        const oldPrice =
          session.regime === 'ENTREPRISE' ? session.priceTotalHT : session.pricePerLearner;
        if (session.regime === value.regime && Number(oldPrice) === value.priceHT)
          return { ok: true as const, changed: false };
        await assertCompanyPriceEditable(tx, { ...session, regime: 'ENTREPRISE' });
        const payers = new Set(session.participants.map((p) => p.sponsorOrgId));
        if (value.regime === 'ENTREPRISE' && payers.size > 1)
          throw new Error(
            'Cette session a plusieurs commanditaires. Scindez-la par entreprise avant de déclarer un forfait.',
          );
        for (const p of session.participants) {
          const link = legalLinkAtSession(p.person.legalLinks, p.sponsorOrgId, {
            ...session,
            regime: value.regime,
          });
          const refusal = refusalForSessionPayer(value.regime, {
            sponsorLegalForm: p.sponsorOrg.legalForm,
            roleChezSponsor: link?.role,
            name: `${p.person.firstName} ${p.person.lastName}`,
          });
          if (refusal) throw new Error(refusal);
        }
        const before = {
          regime: session.regime,
          priceTotalHT: session.priceTotalHT?.toString() ?? null,
          pricePerLearner: session.pricePerLearner?.toString() ?? null,
        };
        const after = {
          regime: value.regime,
          priceTotalHT: value.regime === 'ENTREPRISE' ? value.priceHT : null,
          pricePerLearner: value.regime === 'INDIVIDUEL' ? value.priceHT : null,
        };
        const confirmationKey = createHash('sha256')
          .update(
            JSON.stringify({
              before,
              after,
              sessionId: session.id,
              tenantId: user.tenantId,
              dates: [session.startDate, session.endDate],
              participants: session.participants
                .map((p) => ({
                  id: p.id,
                  sponsor: p.sponsorOrg,
                  links: p.person.legalLinks,
                  price: p.priceHT,
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),
            }),
          )
          .digest('hex');
        const preview = {
          regime: value.regime,
          priceHT: value.priceHT,
          participants: session.participants.length,
        };
        if (!value.apply) return { ok: true as const, changed: false, confirmationKey, preview };
        if (value.confirmationKey !== confirmationKey)
          throw new Error(
            'La session a changé depuis la prévisualisation. Vérifiez à nouveau avant de confirmer.',
          );
        const updated = await tx.trainingSession.update({ where: { id: session.id }, data: after });
        let changed = 0;
        if (value.regime === 'ENTREPRISE')
          changed = await synchronizeCompanyPriceTx(tx, updated, user.id);
        else
          for (const p of session.participants) {
            if (Number(p.priceHT) === value.priceHT) continue;
            changed += (
              await tx.sessionParticipant.updateMany({
                where: { id: p.id, sessionId: session.id, session: { tenantId: user.tenantId } },
                data: {
                  priceHT: new Prisma.Decimal(value.priceHT),
                  amountRemaining: new Prisma.Decimal(
                    Math.max(0, value.priceHT - Number(p.amountCollected)),
                  ),
                },
              })
            ).count;
          }
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'TrainingSession',
            entityId: session.id,
            action: 'sessions.setRegime',
            diff: { before, after, participantsUpdated: changed },
          },
        });
        return { ok: true as const, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result.changed) revalidatePath(`/app/sessions/${input.sessionId}`);
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Modification impossible.' };
  }
}
