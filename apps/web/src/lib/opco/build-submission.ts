import { prisma } from '@qualiof/db';
import { groupConventionAnyShapeWhere } from '@/lib/docs/convention-coverage';
import {
  nomFichierCertificat,
  personneDuCertificat,
  personnesCouvertesParLaPiece,
} from '@/lib/signature/certificat-signature';
import { LIBELLES_PIECE_DOSSIER, versionAJoindre } from '@/lib/opco/pieces-dossier';
import { resoudreDestinataireDossier } from '@/lib/opco/destinataire-dossier';

import type { User } from 'lucia';
import type { SubmissionAttachment } from '@/server/actions/opco-submission';
import { estEligibleAgefice } from '@/lib/agefice/eligibilite';
import { resolveDossierPointAccueil } from './point-accueil';
import { acquittedInvoiceKey } from '@/lib/invoice-storage';
import { messageAgefice, validerNir, type DossierStage } from './agefice-envoi';
const ATTACHMENT_LABELS = LIBELLES_PIECE_DOSSIER;
const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
export async function buildOpcoSubmission(participantId: string, user: User, stage: DossierStage) {
  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId: user.tenantId } },
    include: {
      person: {
        include: {
          sensitiveData: true,
          legalLinks: {
            include: {
              organization: { include: { ageficeProfile: { include: { pointAccueil: true } } } },
            },
          },
        },
      },
      // Lot D : le POINT D'ACCUEIL rattaché. C'est lui le destinataire d'un
      // dossier AGEFICE — le commanditaire, lui, est l'entreprise du stagiaire.
      sponsorOrg: { include: { ageficeProfile: { include: { pointAccueil: true } } } },
      session: { include: { product: true } },
    },
  });
  if (!participant) return { ok: false as const, error: 'Inscription introuvable' };

  if (participant.session.status === 'CANCELLED' || participant.enrollmentStatus === 'CANCELLED')
    return { ok: false as const, error: 'La session ou l’inscription est annulée.' };
  const agefice = estEligibleAgefice(participant);
  if (stage === 'FIN_FORMATION' && !agefice)
    return { ok: false as const, error: 'La fin de formation est réservée aux dossiers AGEFICE.' };
  const profiles = participant.person.legalLinks.filter(
    (l) =>
      ['EI_SELF', 'AGENT_COMMERCIAL'].includes(l.role) &&
      l.organization.ageficeProfile &&
      (!l.startDate || l.startDate <= participant.session.endDate) &&
      (!l.endDate || l.endDate >= participant.session.startDate),
  );
  const profile =
    participant.sponsorOrg.ageficeProfile ??
    (profiles.length === 1 ? profiles[0]!.organization.ageficeProfile : null);
  const nir = validerNir(participant.person.sensitiveData?.socialSecurityNb);
  // Récupération des PJ disponibles
  const attachments: SubmissionAttachment[] = [];
  const missing: SubmissionAttachment['kind'][] = [];

  // CNI : SensitiveData
  if (participant.person.sensitiveData?.idDocumentUrl) {
    attachments.push({
      key: participant.person.sensitiveData.idDocumentUrl,
      filename: `CNI_${participant.person.lastName}_${participant.person.firstName}.pdf`,
      kind: 'CNI',
      included: true,
      // Ne se signe pas : dire `false` serait faux, dire `true` le serait aussi.
      signe: false,
    });
  } else {
    missing.push('CNI');
  }

  // RIB : Person.ribKey
  if (participant.person.ribKey) {
    attachments.push({
      key: participant.person.ribKey,
      filename: `RIB_${participant.person.lastName}_${participant.person.firstName}.pdf`,
      kind: 'RIB',
      included: true,
      // Ne se signe pas : dire `false` serait faux, dire `true` le serait aussi.
      signe: false,
    });
  } else {
    missing.push('RIB');
  }

  // CFP attestation : AgeficeProfile.cfpAttestationKey (lié au sponsor)
  if (profile?.cfpAttestationKey) {
    attachments.push({
      key: profile.cfpAttestationKey,
      filename: `Attestation_CFP_${participant.person.lastName}.pdf`,
      kind: 'CFP_ATTESTATION',
      included: true,
      // Ne se signe pas : dire `false` serait faux, dire `true` le serait aussi.
      signe: false,
    });
  } else {
    missing.push('CFP_ATTESTATION');
  }

  // Documents générés (Convention, Programme, PDF AGEFICE)
  const docs = await prisma.document.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        {
          participantId: participant.id,
          type: { in: ['CONVENTION', 'AGEFICE', 'EMARGEMENT', 'ASSIDUITE'] },
        },
        {
          sessionId: participant.session.id,
          type: 'PROGRAMME',
          OR: [
            { participantId: participant.id },
            { participantId: null, entityType: { not: 'organization' } },
            { entityType: 'organization', entityId: participant.sponsorOrgId },
          ],
        },
        // Convention GROUPE (revue Codex PR #13) : pour un salarié couvert par
        // la convention de son entreprise, le document n'a PAS de participantId.
        // Sans cette branche, le dossier OPCO déclarait « CONVENTION manquante »
        // et n'attachait pas le PDF — exactement le scénario OPTIMMO / OPCO EP
        // que la convention groupe devait servir.
        // Quick 260821-md8 : les DEUX formes de stockage, sinon le dossier OPCO
        // EP d'ASSALIT / EXPERTA repart sans sa convention (elle y existe sous
        // la forme `session`, produite par script).
        groupConventionAnyShapeWhere(
          user.tenantId,
          participant.session.id,
          participant.sponsorOrgId,
        ),
      ],
    },
    select: {
      type: true,
      createdAt: true,
      pdfUrl: true,
      participantId: true,
      // La FORME DE STOCKAGE — elle dit qui la pièce couvre, donc qui nommer
      // sur son certificat (correction du 12/09 : le même fichier sortait sous
      // deux noms selon qu'on le téléchargeait ou qu'on le recevait).
      entityType: true,
      entityId: true,
      // Lot D — règle métier n°2 : le PDF signé fait foi. Jusqu'ici le dossier
      // partait avec la convention VIERGE alors que la signée existait à côté.
      signedPdfUrl: true,
      // Règle métier n°3 : le certificat est une pièce à part entière, et c'est
      // ce que les AGEFICE réclament. Il appartient à la DEMANDE, pas au
      // document — jointure, pas requête de plus.
      signatureRequest: { select: { id: true, auditTrailUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Les inscrits de la session — ils servent UNIQUEMENT à savoir qui une
  // convention de GROUPE couvre, donc qui nommer sur son certificat. Une seule
  // requête, et seulement des noms.
  const participantsSession = await prisma.sessionParticipant.findMany({
    where: { sessionId: participant.session.id, session: { tenantId: user.tenantId } },
    select: {
      sponsorOrgId: true,
      person: { select: { firstName: true, lastName: true } },
    },
  });

  const conventionDocs = docs.filter((d) => d.type === 'CONVENTION');
  // Priorité à la convention individuelle quand les deux coexistent
  // (transition : une individuelle émise avant la bascule en groupe).
  const conventionDoc =
    conventionDocs.find((d) => d.participantId === participant.id) ?? conventionDocs[0];
  const ageficeDoc = docs.find((d) => d.type === 'AGEFICE');
  const programmeDoc =
    docs.find((d) => d.type === 'PROGRAMME' && d.participantId === participant.id) ??
    docs.find((d) => d.type === 'PROGRAMME');

  if (conventionDoc) {
    const version = versionAJoindre(conventionDoc);
    attachments.push({
      key: version.key,
      filename: `Convention_${participant.session.code ?? 'session'}.pdf`,
      kind: 'CONVENTION',
      included: true,
      signe: version.signe,
    });
  } else {
    missing.push('CONVENTION');
  }

  if (programmeDoc) {
    const version = versionAJoindre(programmeDoc);
    attachments.push({
      key: version.key,
      filename: `Programme_${participant.session.code ?? 'session'}.pdf`,
      kind: 'PROGRAMME',
      included: true,
      signe: version.signe,
    });
  } else {
    missing.push('PROGRAMME');
  }

  if (ageficeDoc) {
    const version = versionAJoindre(ageficeDoc);
    attachments.push({
      key: version.key,
      filename: `AGEFICE_PA_${participant.person.lastName}.pdf`,
      kind: 'AGEFICE_PA_FORM',
      included: true,
      signe: version.signe,
    });
  } else {
    missing.push('AGEFICE_PA_FORM');
  }

  // ── Les CERTIFICATS de signature — règle métier n°3 ─────────────────────
  //
  // UN PAR DEMANDE, pas un par pièce : une demande peut porter plusieurs
  // documents, et son certificat les couvre tous. Le joindre deux fois mettrait
  // deux pièces jointes identiques dans le mail du financeur.
  //
  // L'ORDRE suit celui des pièces du dossier (convention, puis AGEFICE) : c'est
  // l'ordre dans lequel un instructeur les dépile.
  const certificatsVus = new Set<string>();
  for (const source of [conventionDoc, ageficeDoc]) {
    const demande = source?.signatureRequest ?? null;
    const cle = (demande?.auditTrailUrl ?? '').trim();
    if (demande === null || cle.length === 0) continue;
    if (certificatsVus.has(demande.id)) continue;
    certificatsVus.add(demande.id);
    attachments.push({
      key: cle,
      // Le MÊME nom que celui servi par `/api/signature-requests/[id]/audit-trail` :
      // l'admin retrouve dans le mail du financeur le fichier qu'il a téléchargé.
      // ⚠ LE NOM VIENT DE LA PORTÉE DE LA PIÈCE, pas du dossier qu'on compose.
      // Avant, le certificat d'une convention de groupe prenait le nom de
      // l'inscrit dont on ouvrait le dossier : autant de noms que de salariés
      // pour UN seul fichier — et un nom différent de celui que servait la
      // route. Même module, même règle, des deux côtés.
      filename: nomFichierCertificat({
        docType: source?.type,
        ...(personneDuCertificat(
          personnesCouvertesParLaPiece({
            piece: {
              entityType: source?.entityType ?? null,
              entityId: source?.entityId ?? null,
              participant: source?.participantId === participant.id ? participant.person : null,
            },
            participantsSession,
          }),
        ) ?? {}),
        sessionCode: participant.session.code,
      }),
      kind: 'AUDIT_TRAIL',
      included: true,
      // Le certificat n'est pas « signé » : il EST la preuve de la signature.
      signe: false,
    });
  }

  // ── Le DESTINATAIRE — lot D ─────────────────────────────────────────────
  //
  // Un dossier AGEFICE se dépose auprès d'un POINT D'ACCUEIL, pas auprès du
  // commanditaire : celui-ci est l'entreprise individuelle du stagiaire, et
  // l'application proposait donc de lui envoyer son propre dossier. La règle
  // vit dans `resoudreDestinataireDossier`, sous test unitaire — sans repli
  // silencieux sur l'entreprise, parce qu'un envoi parti au mauvais endroit ne
  // se rattrape pas.
  const routing = agefice
    ? await resolveDossierPointAccueil(profile)
    : { selected: null, department: null, options: [] };
  const pointAccueil = routing.selected;
  const destinataire = resoudreDestinataireDossier({
    opcoCode: agefice ? 'AGEFICE' : participant.sponsorOrg.opcoCode,
    pointAccueil,
    emailBilling: participant.sponsorOrg.emailBilling,
    email: participant.sponsorOrg.email,
  });
  const recipientEmail = destinataire.email;

  // Subject + body défaut
  const opcoCode = participant.sponsorOrg.opcoCode ?? 'OPCO';
  let subject = `Dossier de prise en charge ${opcoCode} — ${participant.person.firstName} ${participant.person.lastName.toUpperCase()} — ${participant.session.code ?? participant.session.product.title}`;

  const dureeHeures = participant.session.product.durationHours;
  const dateDebut = fmtDate.format(participant.session.startDate);
  const dateFin = fmtDate.format(participant.session.endDate);
  const montantHT = Number(participant.priceHT).toFixed(2);

  let bodyHtml = `<p>Bonjour,</p>
<p>Veuillez trouver ci-joint le dossier complet de demande de prise en charge ${opcoCode} pour :</p>
<ul>
  <li><strong>Stagiaire :</strong> ${participant.person.firstName} ${participant.person.lastName.toUpperCase()}</li>
  <li><strong>Formation :</strong> ${participant.session.product.title}</li>
  <li><strong>Code session :</strong> ${participant.session.code ?? '—'}</li>
  <li><strong>Dates :</strong> du ${dateDebut} au ${dateFin}</li>
  <li><strong>Durée :</strong> ${dureeHeures}h</li>
  <li><strong>Montant HT :</strong> ${montantHT} €</li>
</ul>
<p>Pièces jointes :</p>
<ul>
${attachments
  .map((a) => `  <li>${ATTACHMENT_LABELS[a.kind]} : <code>${a.filename}</code></li>`)
  .join('\n')}
</ul>
${
  missing.length > 0
    ? `<p style="color:#b45309"><em>⚠ Pièces manquantes à compléter avant envoi : ${missing.map((m) => ATTACHMENT_LABELS[m]).join(', ')}</em></p>`
    : ''
}
<p>Restant à votre disposition pour toute information complémentaire.</p>
<p>Cordialement,<br/>${user.firstName ?? ''} ${user.lastName ?? ''}<br/>Start Academy</p>`;

  let invoiceId: string | null = null;
  if (stage === 'FIN_FORMATION') {
    if (participant.session.endDate > new Date())
      return {
        ok: false as const,
        error: 'La formation doit être terminée avant de préparer son dossier de fin.',
      };
    const rib = attachments.find((a) => a.kind === 'RIB');
    attachments.splice(0, attachments.length, ...(rib ? [rib] : []));
    missing.splice(0, missing.length, ...(rib ? [] : ['RIB' as const]));
    for (const type of ['EMARGEMENT', 'ASSIDUITE'] as const) {
      const doc = docs.find((d) => d.type === type && d.participantId === participant.id);
      // Le dépôt individuel enregistre aussi sa preuve sans Document généré.
      const statuses = participant.docStatus as Record<string, unknown> | null;
      const entry = statuses?.[type];
      const scan =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null;
      const scanKey =
        typeof scan?.uploadedSignedPdfKey === 'string' ? scan.uploadedSignedPdfKey.trim() : '';
      const scanDate =
        typeof scan?.uploadedSignedAt === 'string'
          ? new Date(scan.uploadedSignedAt).getTime()
          : NaN;
      const manualKey =
        scan?.state === 'MANUAL_OK' &&
        scanKey &&
        Number.isFinite(scanDate) &&
        (!doc || scanDate >= doc.createdAt.getTime())
          ? scanKey
          : null;
      const signedDocument = Boolean(doc?.signedPdfUrl?.trim());
      if (!doc && !manualKey) {
        missing.push(type);
        continue;
      }
      const version = signedDocument
        ? versionAJoindre(doc!)
        : manualKey
          ? { key: manualKey, signe: true }
          : versionAJoindre(doc!);
      attachments.push({
        key: version.key,
        filename: `${type}_${participant.person.lastName}.pdf`,
        kind: type,
        included: true,
        signe: version.signe,
      });
      if (
        signedDocument &&
        doc?.signatureRequest?.auditTrailUrl &&
        !attachments.some((a) => a.key === doc.signatureRequest!.auditTrailUrl)
      ) {
        attachments.push({
          key: doc.signatureRequest.auditTrailUrl,
          filename: `Certificat_${type}_${participant.person.lastName}.pdf`,
          kind: 'AUDIT_TRAIL',
          included: true,
        });
      }
    }
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        status: { notIn: ['DRAFT', 'CANCELLED', 'CREDIT_NOTE'] },
        OR: [
          { participantId: participant.id },
          {
            sessionId: participant.sessionId,
            payerOrgId: participant.sponsorOrgId,
            participantIds: { array_contains: [participant.id] },
          },
        ],
      },
      include: { payments: true, creditNotes: { select: { id: true } } },
    });
    const invoice = invoices.length === 1 ? invoices[0] : null;
    if (
      invoice &&
      invoice.status === 'PAID' &&
      invoice.paidAt &&
      Number(invoice.amountPaid) >= Number(invoice.amountTTC) &&
      invoice.creditNotes.length === 0 &&
      !invoice.payments.some((p) => p.source === 'OPCO_SYNC')
    ) {
      invoiceId = invoice.id;
      attachments.push({
        key: acquittedInvoiceKey(invoice.number),
        filename: `Facture_acquittee_${invoice.number}.pdf`,
        kind: 'FACTURE_ACQUITTEE',
        included: true,
      });
    } else missing.push('FACTURE_ACQUITTEE');
  }
  if (agefice) {
    const mail = messageAgefice(
      stage,
      participant.person.firstName,
      participant.person.lastName,
      nir,
    );
    subject = mail.subject;
    bodyHtml = mail.html;
  }
  return {
    ok: true as const,
    participant,
    agefice,
    profileId: profile?.id ?? null,
    routing,
    invoiceId,
    nir,
    stage,
    recipientEmail,
    subject,
    bodyHtml,
    attachments,
    missing,
    avertissementDestinataire: destinataire.motif,
  };
}
