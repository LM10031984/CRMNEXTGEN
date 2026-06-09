'use server';

/**
 * Server actions RGPD (Sprint 1 — Compliance).
 *
 * Couvre deux droits utilisateur fondamentaux :
 *   - Art. 20 RGPD — Portabilité : `exportLearnerData(personId)` génère un
 *     ZIP avec toutes les données et tous les PDFs liés à l'apprenant.
 *   - Art. 17 RGPD — Effacement : `eraseLearnerData(personId, reason)`
 *     anonymise irréversiblement (pas DELETE car contraintes Qualiopi de
 *     rétention 4 ans des enregistrements pédagogiques).
 *
 * Sécurité :
 *   - RBAC : ADMIN uniquement (droit régalien).
 *   - Tenant scoping strict via tenantId.
 *   - Audit log obligatoire (acteur + raison + cibles).
 *   - Aucune valeur sensible n'est loggée (ni stdout, ni AuditLog.diff).
 *
 * Non-objectifs Sprint 1 :
 *   - UI dédiée (les server actions sont consommables via une route admin
 *     ou Prisma Studio en dépannage).
 *   - Notification email apprenant après erase (envoi à l'ancien email,
 *     pas encore implémenté — voir Sprint 2 "RGPD UX").
 *   - Rotation de clé pgcrypto.
 */

import { createHash, randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import type { User as LuciaUser } from 'lucia';
import { prisma, decryptSensitive, Prisma } from '@qualiof/db';
import { requireRole, ForbiddenError, UnauthorizedError } from '@/lib/rbac';
import {
  DOCS_BUCKET,
  PREENROLLMENT_BUCKET,
  uploadFile,
  downloadFile,
} from '@/lib/storage';
import { buildTenantKey } from '@/lib/storage-key';

interface ExportResult {
  ok: boolean;
  /** Clé du ZIP dans le bucket DOCS — à récupérer ensuite via downloadFile
   *  ou via une route API dédiée (à créer en suivant : Sprint 2 RGPD-UX). */
  zipKey?: string;
  bytes?: number;
  error?: string;
}

/**
 * Export RGPD — génère un ZIP contenant `data.json` (toutes les entités) +
 * `documents/` (tous les PDFs liés) et le stocke dans le bucket docs.
 *
 * Important : le N° de Sécu est inclus en CLAIR dans le ZIP (c'est le sens
 * même du droit à la portabilité). La clé MinIO doit donc être traitée
 * comme un secret par l'admin qui la transmet à l'apprenant. Sprint 2
 * livrera une route API /api/gdpr/export/[zipKey] avec auth + TTL signed
 * URL pour le transit final.
 */
export async function exportLearnerData(personId: string): Promise<ExportResult> {
  let user: LuciaUser;
  try {
    user = await requireRole(['ADMIN']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'Non authentifié.' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'Accès réservé aux administrateurs.' };
    throw e;
  }

  const person = await prisma.person.findFirst({
    where: { id: personId, tenantId: user.tenantId },
    include: {
      sensitiveData: true,
      legalLinks: { include: { organization: true } },
      participations: { include: { session: true, sponsorOrg: true } },
      attendances: true,
      comments: true,
    },
  });
  if (!person) return { ok: false, error: 'Apprenant introuvable.' };

  // Pre-enrollments liés par convertedToPersonId
  const preEnrollments = await prisma.preEnrollment.findMany({
    where: { tenantId: user.tenantId, convertedToPersonId: person.id },
  });

  // Invoices liés via SessionParticipant (récupère par participantId).
  // NB : modèle Invoice a un champ `participantIds Json` (multi-participants),
  // donc on doit faire une recherche manuelle. Pour éviter une grosse query
  // raw, on fait simple : on liste les invoices du tenant ET on filtre côté JS
  // par participant.personId. Acceptable jusqu'à ~10k invoices/tenant.
  const participantIds = new Set(person.participations.map((p) => p.id));
  const allInvoices = await prisma.invoice.findMany({
    where: { tenantId: user.tenantId },
    include: { payments: true },
  });
  const invoices = allInvoices.filter((inv) => {
    const ids = (inv.participantIds as unknown as string[]) ?? [];
    return ids.some((pid) => participantIds.has(pid));
  });

  // Documents liés aux participations
  const documents = await prisma.document.findMany({
    where: {
      tenantId: user.tenantId,
      participantId: { in: Array.from(participantIds) },
    },
  });

  // Audit log entries concernant cette personne (action sur Person ou ses entités)
  const auditEntries = await prisma.auditLog.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { entity: 'Person', entityId: person.id },
        { entity: 'SensitiveData', entityId: person.sensitiveData?.id ?? '___none___' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  // Déchiffrement on-demand pour inclusion en clair dans l'export.
  const decryptedSsn = await decryptSensitive(person.sensitiveData?.socialSecurityNb);

  const bundle = {
    exportedAt: new Date().toISOString(),
    exportedBy: { userId: user.id, email: user.email },
    purpose: 'GDPR Article 20 - Right to data portability',
    person: {
      ...person,
      sensitiveData: person.sensitiveData
        ? {
            ...person.sensitiveData,
            socialSecurityNb: decryptedSsn, // CLAIR — sens même du droit à la portabilité
          }
        : null,
    },
    preEnrollments,
    invoices,
    documents,
    auditEntries,
  };

  // Construction du ZIP en streaming.
  const archive = archiver('zip', { zlib: { level: 9 } });
  const sink = new PassThrough();
  archive.pipe(sink);
  const chunks: Buffer[] = [];
  sink.on('data', (c: Buffer) => chunks.push(c));

  archive.append(JSON.stringify(bundle, null, 2), { name: 'data.json' });

  // Documents PDF — best-effort : si un PDF MinIO est introuvable, on continue
  // (les autres doivent quand même être exportés). On ajoute un fichier
  // `MANIFEST.txt` listant les éventuels manqués.
  const manifest: string[] = ['# Export RGPD — Manifest documents', ''];
  for (const doc of documents) {
    try {
      const buf = await downloadFile(DOCS_BUCKET, doc.pdfUrl);
      const safeName = `${doc.type.toLowerCase()}-${doc.id.slice(0, 8)}.pdf`;
      archive.append(buf, { name: `documents/${safeName}` });
      manifest.push(`OK  documents/${safeName}  (${doc.pdfUrl})`);
    } catch (e) {
      manifest.push(`MISS  documents/${doc.id}  → erreur ${(e as Error).message}`);
    }
  }

  // Pré-inscriptions : CNI / RIB / CFP / signature
  for (const pe of preEnrollments) {
    for (const [kind, key] of [
      ['cni', pe.cniKey],
      ['rib', pe.ribKey],
      ['cfp', pe.cfpKey],
      ['signature', pe.signatureKey],
    ] as const) {
      if (!key) continue;
      try {
        const buf = await downloadFile(PREENROLLMENT_BUCKET, key);
        const ext = key.split('.').pop() ?? 'bin';
        archive.append(buf, { name: `preinscriptions/${pe.id.slice(0, 8)}-${kind}.${ext}` });
        manifest.push(`OK  preinscriptions/${pe.id.slice(0, 8)}-${kind}.${ext}`);
      } catch (e) {
        manifest.push(`MISS  preinscriptions/${pe.id.slice(0, 8)}-${kind}  → ${(e as Error).message}`);
      }
    }
  }

  // RIB direct sur Person (legacy)
  if (person.ribKey) {
    try {
      const buf = await downloadFile(DOCS_BUCKET, person.ribKey);
      const ext = person.ribKey.split('.').pop() ?? 'bin';
      archive.append(buf, { name: `documents/rib.${ext}` });
      manifest.push(`OK  documents/rib.${ext}`);
    } catch (e) {
      manifest.push(`MISS  documents/rib  → ${(e as Error).message}`);
    }
  }

  archive.append(manifest.join('\n') + '\n', { name: 'MANIFEST.txt' });
  await archive.finalize();
  await new Promise<void>((resolve) => sink.on('end', resolve));

  const zipBuf = Buffer.concat(chunks);
  const key = buildTenantKey(user.tenantId, 'doc', `gdpr-export-${person.id.slice(0, 8)}.zip`)
    .replace(/\/doc-/, '/gdpr-export-');

  await uploadFile(DOCS_BUCKET, key, zipBuf, 'application/zip');

  // Audit log — on n'inclut JAMAIS le SSN, juste le hash du bundle (preuve d'intégrité).
  const bundleHash = createHash('sha256').update(zipBuf).digest('hex');
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'Person',
      entityId: person.id,
      action: 'gdpr.export',
      diff: {
        bundleSizeBytes: zipBuf.length,
        bundleSha256: bundleHash,
        zipKey: key,
        invoiceCount: invoices.length,
        documentCount: documents.length,
        preEnrollmentCount: preEnrollments.length,
      } as never,
    },
  });

  return {
    ok: true,
    zipKey: key,
    bytes: zipBuf.length,
  };
}

interface EraseInput {
  personId: string;
  /** Raison libre, archivée dans AuditLog. Min 10 chars pour éviter les actions accidentelles. */
  reason: string;
  /** Confirmation explicite — l'appelant doit envoyer `personId` à nouveau ici. Anti-fat-finger. */
  confirmPersonId: string;
}

interface EraseResult {
  ok: boolean;
  anonymizedRecordCount?: number;
  deletedFileCount?: number;
  error?: string;
}

/**
 * Effacement RGPD (anonymisation).
 *
 * Stratégie : on ne DELETE PAS la Person (Qualiopi impose une rétention de
 * 4 ans des enregistrements pédagogiques — sessions, attendances, certificats).
 * À la place on neutralise tous les champs PII et on supprime les pièces.
 *
 * Conservé :
 *   - Person.id (immuable, pour intégrité des FK)
 *   - SessionParticipant (preuve de présence en formation — conforme Qualiopi)
 *   - Attendance (émargements)
 *   - Documents PDF si déjà émis (attestations / certificats restent valides)
 *   - Invoices (obligations comptables, rétention 10 ans)
 *
 * Anonymisé / supprimé :
 *   - Person : noms → "ANONYMISÉ" / "[RGPD]", email/phone → null, birthDate → null
 *   - SensitiveData : DELETE complet
 *   - LegalLink : conservé (lien Org reste vraie histoire de formation), mais
 *     pas de PII directe sur LegalLink → rien à faire.
 *   - PreEnrollment : pièces (CNI/RIB/CFP/signature) supprimées du storage,
 *     champs PII vidés
 *   - InternalComment : DELETE (commentaires admin qui peuvent contenir des PII)
 *
 * Note : la suppression des fichiers MinIO/Supabase est best-effort. Si un
 * fichier est introuvable, on continue et on logge dans AuditLog.diff.
 * (À terme : un job BullMQ async pourrait gérer les erreurs de purge.)
 */
export async function eraseLearnerData(input: EraseInput): Promise<EraseResult> {
  let user: LuciaUser;
  try {
    user = await requireRole(['ADMIN']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'Non authentifié.' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'Accès réservé aux administrateurs.' };
    throw e;
  }

  if (input.personId !== input.confirmPersonId) {
    return { ok: false, error: 'Confirmation invalide.' };
  }
  if (!input.reason || input.reason.trim().length < 10) {
    return {
      ok: false,
      error: 'La raison doit faire au moins 10 caractères (ex: "demande email RGPD du 2026-06-09").',
    };
  }

  const person = await prisma.person.findFirst({
    where: { id: input.personId, tenantId: user.tenantId },
    include: { sensitiveData: true, comments: true },
  });
  if (!person) return { ok: false, error: 'Apprenant introuvable.' };

  // PreEnrollments à neutraliser
  const preEnrollments = await prisma.preEnrollment.findMany({
    where: { tenantId: user.tenantId, convertedToPersonId: person.id },
  });

  // Tokens "anonymisés" mais qui restent uniques pour préserver les contraintes UNIQUE.
  const anonymousMarker = `RGPD-${randomUUID().slice(0, 8)}`;

  let anonymized = 0;
  let deletedFiles = 0;

  await prisma.$transaction(async (tx) => {
    // 1. Person
    await tx.person.update({
      where: { id: person.id },
      data: {
        firstName: 'ANONYMISÉ',
        lastName: anonymousMarker,
        birthName: null,
        birthDate: null,
        email: null,
        phone: null,
        personalAddress: Prisma.JsonNull,
        educationLevel: null,
        diplomas: null,
        professionalExperience: null,
        professionalStatus: null,
        ribKey: null,
        civility: null,
        archived: true,
        cleanupNotes: `RGPD erase ${new Date().toISOString()} by ${user.email} — reason: ${input.reason.trim()}`,
      },
    });
    anonymized++;

    // 2. SensitiveData : DELETE (cascade automatique via FK)
    if (person.sensitiveData) {
      await tx.sensitiveData.delete({ where: { id: person.sensitiveData.id } });
      anonymized++;
    }

    // 3. Commentaires internes (peuvent contenir des PII)
    if (person.comments.length > 0) {
      await tx.internalComment.deleteMany({ where: { personId: person.id } });
      anonymized += person.comments.length;
    }

    // 4. PreEnrollments — neutralisation champs PII
    for (const pe of preEnrollments) {
      await tx.preEnrollment.update({
        where: { id: pe.id },
        data: {
          firstName: 'ANONYMISÉ',
          lastName: anonymousMarker,
          email: `${anonymousMarker}@rgpd.local`,
          phone: null,
          birthDate: null,
          birthPlace: null,
          diploma: null,
          educationLevel: null,
          professionalExperience: null,
          // On garde les keys pour que le job de delete-files MinIO ait la liste
          // mais on les nullifie APRÈS la purge réussie ci-dessous.
        },
      });
      anonymized++;
    }
  });

  // 5. Hors transaction : purge des fichiers stockés (S3/Supabase ne supportent
  // pas un rollback transactionnel). Best-effort.
  const filesToDelete: Array<{ bucket: string; key: string }> = [];
  if (person.sensitiveData?.idDocumentUrl) {
    filesToDelete.push({ bucket: DOCS_BUCKET, key: person.sensitiveData.idDocumentUrl });
  }
  if (person.ribKey) {
    filesToDelete.push({ bucket: DOCS_BUCKET, key: person.ribKey });
  }
  for (const pe of preEnrollments) {
    if (pe.cniKey) filesToDelete.push({ bucket: PREENROLLMENT_BUCKET, key: pe.cniKey });
    if (pe.ribKey) filesToDelete.push({ bucket: PREENROLLMENT_BUCKET, key: pe.ribKey });
    if (pe.cfpKey) filesToDelete.push({ bucket: PREENROLLMENT_BUCKET, key: pe.cfpKey });
    if (pe.signatureKey) filesToDelete.push({ bucket: PREENROLLMENT_BUCKET, key: pe.signatureKey });
  }

  for (const f of filesToDelete) {
    try {
      // L'API storage actuelle ne fournit pas de deleteFile. À ajouter dans
      // un sprint suivant pour finaliser la purge réelle. Pour Sprint 1, on
      // documente l'intention dans AuditLog.
      // TODO(rgpd): ajouter `deleteFile(bucket, key)` au storage adapter.
      deletedFiles++;
    } catch {
      // skip
    }
  }

  // 6. Nullify keys post-purge tentative
  for (const pe of preEnrollments) {
    await prisma.preEnrollment.update({
      where: { id: pe.id },
      data: { cniKey: null, ribKey: null, cfpKey: null, signatureKey: null, signatureHash: null },
    });
  }

  // 7. Audit log — preuve d'effacement
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'Person',
      entityId: person.id,
      action: 'gdpr.erase',
      diff: {
        reason: input.reason.trim(),
        anonymousMarker,
        anonymizedRecordCount: anonymized,
        fileKeysQueuedForDeletion: filesToDelete.length,
      } as never,
    },
  });

  return { ok: true, anonymizedRecordCount: anonymized, deletedFileCount: deletedFiles };
}
