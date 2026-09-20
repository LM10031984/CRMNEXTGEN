import { isCompanyDossier, isEmployeeStatus, selectDossierConvention } from '@/lib/opco/company-dossier';
import { manualSignedKey } from '@/lib/opco/manual-signed-key';
import { prisma } from '@qualiof/db';
import { groupConventionAnyShapeWhere } from '@/lib/docs/convention-coverage';
import { missingFormationDocuments, parisDay, shouldAlertFormation } from './formation-rules';
import { deliverFormationAlert, queueFormationAlert } from './formation-notifier';

/** Re-evaluate current pieces before enqueueing; never send an obsolete missing-piece reminder. */
export async function checkFormationDocuments(
  now = new Date(),
  onlySessionId?: string,
): Promise<number> {
  const sessions = await prisma.trainingSession.findMany({
    where: {
      ...(onlySessionId ? { id: onlySessionId } : {}),
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
      startDate: {
        gte: new Date(now.getTime() - 86_400_000),
        lte: new Date(now.getTime() + 22 * 86_400_000),
      },
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      regime: true,
      participants: {
        where: { enrollmentStatus: { not: 'CANCELLED' } },
        select: {
          id: true,
          sponsorOrgId: true,
          personId: true,
          participantType: true,
          docStatus: true,
          person: {
            select: {
              firstName: true,
              lastName: true,
              ribKey: true,
              legalLinks: { select: { organizationId: true, role: true, startDate: true, endDate: true } },
              sensitiveData: { select: { idDocumentUrl: true } },
            },
          },
          sponsorOrg: { select: { ageficeProfile: { select: { cfpAttestationKey: true } } } },
        },
      },
      preEnrollments: {
        where: {
          status: { in: ['SUBMITTED', 'EXTRACTING', 'EXTRACTED', 'VALIDATED'] },
          convertedAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          professionalStatus: true,
          cniKey: true,
          ribKey: true,
          cfpKey: true,
        },
      },
    },
  });
  let examined = 0;
  for (const session of sessions) {
    if (!shouldAlertFormation(session.startDate, session.status, now)) continue;
    const cases: Array<{ id: string; name: string; path: string; missing: string[] }> = [];
    for (const p of session.participants) {
      const company = isCompanyDossier({ ...p, session });
      const conventions = await prisma.document.findMany({
        where: {
          tenantId: session.tenantId,
          type: 'CONVENTION',
          OR: [
            { participantId: p.id },
            groupConventionAnyShapeWhere(session.tenantId, session.id, p.sponsorOrgId),
          ],
        },
        select: { id: true, participantId: true, entityType: true, entityId: true, signedPdfUrl: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const convention = selectDossierConvention(conventions, p.id, p.sponsorOrgId, company);
      const programmes = company ? await prisma.document.findMany({
        where: { tenantId: session.tenantId, sessionId: session.id, type: 'PROGRAMME', OR: [
          { participantId: p.id },
          { participantId: null, entityType: { not: 'organization' } },
          { entityType: 'organization', entityId: p.sponsorOrgId },
        ] },
        select: { pdfUrl: true }, orderBy: { createdAt: 'desc' }, take: 1,
      }) : [];
      cases.push({
        id: p.id,
        name: `${p.person.firstName} ${p.person.lastName}`,
        path: `/app/sessions/${session.id}`,
        missing: missingFormationDocuments({
          cni: Boolean(p.person.sensitiveData?.idDocumentUrl),
          rib: Boolean(p.person.ribKey),
          cfp: Boolean(p.sponsorOrg.ageficeProfile?.cfpAttestationKey),
          convention: Boolean(convention?.signedPdfUrl?.trim() || manualSignedKey(p.docStatus, 'CONVENTION', convention?.createdAt)),
          company,
          programme: Boolean(programmes[0]?.pdfUrl?.trim()),
        }),
      });
    }
    for (const pe of session.preEnrollments) {
      cases.push({
        id: pe.id,
        name: `${pe.firstName ?? ''} ${pe.lastName ?? ''}`.trim(),
        path: `/app/inscriptions/${pe.id}`,
        missing: missingFormationDocuments({
          cni: Boolean(pe.cniKey),
          rib: Boolean(pe.ribKey),
          cfp: Boolean(pe.cfpKey),
          convention: false,
          company: session.regime === 'ENTREPRISE' || isEmployeeStatus(pe.professionalStatus),
          programme: false,
        }),
      });
    }
    for (const item of cases) {
      examined++;
      if (!item.missing.length) continue;
      const key = `missing:${session.id}:${item.id}:${parisDay(session.startDate)}`;
      const previous = await prisma.emailMessage.findFirst({
        where: {
          tenantId: session.tenantId,
          status: 'sent',
          relatedEntity: { contains: key },
          id: { startsWith: 'formation-alert:' },
        },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      });
      if (!shouldAlertFormation(session.startDate, session.status, now, previous?.sentAt)) continue;
      // Same deterministic id until a real send, then next weekly reminder.
      const id = await queueFormationAlert({
        tenantId: session.tenantId,
        key: `${key}:${previous?.sentAt?.toISOString() ?? 'first'}`,
        sessionId: session.id,
        subject: `Dossier incomplet : ${item.name} — ${session.name}`,
        lines: [
          `${item.name} — ${session.name}`,
          `Début de formation : ${session.startDate.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`,
          `Pièces à compléter : ${item.missing.join(', ')}.`,
        ],
        path: item.path,
      });
      await deliverFormationAlert(id);
    }
  }
  return examined;
}
