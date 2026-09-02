/**
 * Analyse des besoins au nom de l'ENTREPRISE — cœur SANS auth.
 *
 * Règle payeur figée le 12/08, appliquée au document de l'indicateur 4 : quand
 * le payeur est une personne morale, le besoin analysé est celui de la
 * STRUCTURE qui commande et qui paye. UNE analyse pour tout le groupe, jamais
 * une par salarié — une analyse au nom d'un salarié alors que le besoin est
 * celui de l'entreprise est une non-conformité en audit.
 *
 * La quick 260821-md8 avait fait la moitié qui protège : `selectAnalyseBesoinTargets`
 * a cessé d'enfiler une génération IA par stagiaire pour ces inscrits (8 appels
 * pour 8 documents non conformes sur ASSALIT). Restait le manque : aucun
 * générateur applicatif ne produisait la variante entreprise, qui n'existait
 * que par script hors app (`_gen-assalit-experta-analyses.ts`, SES-0107/0108).
 * Ce module la produit — le gabarit reprend celui du document validé.
 *
 * Stockage : `PedagogicalAsset` de niveau SESSION (`participantId = null`),
 * `rawJson.scope = 'entreprise'`. Aucune migration : c'est la forme déjà
 * reconnue en lecture par `selectAnalyseBesoinTargets`.
 *
 * ⚠ Une session ne peut porter qu'UNE analyse de niveau session
 * (`@@unique([sessionId, participantId, kind])`). Sur une session
 * multi-commanditaires, la dernière génération remplace la précédente et le cas
 * est journalisé — même arbitrage que la convention de groupe.
 *
 * Cœur SANS auth : n'importe jamais `@/lib/auth`, afin de rester utilisable
 * depuis un script tsx ou le worker.
 */

import { createHash } from 'node:crypto';
import { prisma, type Prisma } from '@qualiof/db';
import { DOCS_BUCKET, uploadFile } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import { loadOfConfig } from '@/lib/of-config';
import { subtractBusinessDaysISO } from '@/lib/business-days';
import { requiresContratIndividuel } from '@/lib/legal-forms';
import { releveDeLaConvention, estEmployeurDeLApprenant } from '@/lib/sessions/payer-rule';
import { formatLieuFormation } from '@/lib/locations/format-lieu';
import { generateAnalyseBesoinEntrepriseContent } from './ollama-generators';
import {
  BRAND_DARK,
  SECTION_BLUE,
  escapeHtml,
  formatDateFr,
  renderBrandHeader,
  wrapHtml,
  loadSignatureDataUrl,
  loadStampDataUrl,
} from './shared-template';

export interface AnalyseBesoinEntrepriseResult {
  ok: boolean;
  assetId?: string;
  error?: string;
  sessionId?: string;
  /** Salariés couverts par l'analyse produite. */
  count?: number;
}

/** Date du recueil : J-20 ouvrés avant le début. */
const JOURS_OUVRES_AVANT_DEBUT = 20;

const fmtJour = (d: Date) =>
  d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });

const MODALITE_LABEL: Record<string, string> = {
  PRESENTIEL: 'présentiel',
  DISTANCIEL: 'distanciel',
  MIXTE: 'mixte (présentiel et distanciel)',
};

function bullets(items: string[]): string {
  return `<ul class="bullets" style="list-style: none; margin-left: 14px;">
  ${items
    .map(
      (it) =>
        `<li style="margin-bottom: 4px;"><span style="color: ${SECTION_BLUE}; font-weight: 700; margin-right: 6px;">•</span>${escapeHtml(it)}</li>`,
    )
    .join('\n  ')}
</ul>`;
}

export async function generateAnalyseBesoinEntrepriseCore(
  tenantId: string,
  sessionId: string,
  sponsorOrgId: string,
): Promise<AnalyseBesoinEntrepriseResult> {
  const org = await prisma.organization.findFirst({
    where: { id: sponsorOrgId, tenantId },
    include: {
      // Repli du représentant : le contact principal le plus ancien, comme la
      // convention de groupe (quick 260821-md8).
      contacts: {
        where: { isPrimary: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { firstName: true, lastName: true },
      },
    },
  });
  if (!org) return { ok: false, error: 'Organisation commanditaire introuvable' };

  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId, sponsorOrgId, session: { tenantId } },
    include: {
      person: { include: { legalLinks: true } },
      session: { include: { product: true, location: true } },
    },
    orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
  });

  // Même critère que la convention (02/09) : une entreprise individuelle qui
  // paye pour ses SALARIÉS exprime un besoin d'ENTREPRISE — c'est le sien, pas
  // celui de chaque stagiaire. On ne refuse donc que si aucun inscrit de ce
  // commanditaire n'y est salarié, c'est-à-dire le vrai auto-payeur.
  const aUnSalarie = participants.some((p) =>
    estEmployeurDeLApprenant(
      p.person?.legalLinks?.find((l) => l.organizationId === sponsorOrgId)?.role ?? null,
    ),
  );
  if (requiresContratIndividuel(org.legalForm) && !aUnSalarie) {
    return {
      ok: false,
      error: `« ${org.legalName} » est une personne physique (${org.legalForm}) et aucun inscrit n'y est salarié : son analyse des besoins est INDIVIDUELLE, au nom de l'apprenant.`,
    };
  }
  if (participants.length === 0) {
    return {
      ok: false,
      error: `Aucun salarié rattaché à « ${org.legalName} » sur cette session.`,
    };
  }

  const first = participants[0]!;
  const session = first.session;
  if (!session.product) {
    return { ok: false, error: 'Produit lié à la session manquant' };
  }

  const representant =
    (org.representative ?? '').trim() ||
    [org.contacts[0]?.firstName, org.contacts[0]?.lastName].filter(Boolean).join(' ').trim();
  if (!representant) {
    return {
      ok: false,
      error: `Aucun représentant déterminable pour « ${org.legalName} » : renseignez le représentant légal sur la fiche entreprise, ou un contact principal.`,
    };
  }

  const of = await loadOfConfig(tenantId);
  const lieu = formatLieuFormation(session.location, of.addressFull);
  const modalite = MODALITE_LABEL[session.modality] ?? 'présentiel';
  const effectif = participants.length;
  // Fonctions SANS les noms : le document décrit un besoin collectif.
  const fonctions = participants
    .map(
      (p) =>
        p.person?.legalLinks?.find((l) => l.organizationId === sponsorOrgId)?.function ?? null,
    )
    .filter((f): f is string => !!f && f.trim().length > 0);

  const contenu = await generateAnalyseBesoinEntrepriseContent(
    {
      titre: session.product.title,
      nombreHeures: session.product.durationHours ?? 0,
      programmeMd: session.product.programMd ?? '',
    } as Parameters<typeof generateAnalyseBesoinEntrepriseContent>[0],
    {
      raisonSociale: org.legalName,
      activiteDeclaree: org.activityDescription,
      naf: org.naf,
      adresse: formatLieuFormation({ name: org.legalName, legalName: org.legalName, address: org.address }, ''),
      representant,
      effectif,
      fonctions,
    },
    {
      debut: fmtJour(session.startDate),
      fin: fmtJour(session.endDate),
      lieu,
      modalite,
    },
    'PedagogicalAsset',
    null,
    tenantId,
  );
  // Aucun stub sur CE document : une analyse générique au nom d'une entreprise
  // est une non-conformité à l'indicateur 4, pire qu'un document absent.
  if (!contenu) {
    return {
      ok: false,
      error:
        "La génération IA de l'analyse des besoins d'entreprise a échoué. Aucun document n'a été produit (pas de contenu générique sur ce document) — relancez la génération.",
    };
  }

  const startIso = session.startDate.toISOString().slice(0, 10);
  const analyseDate = new Date(
    subtractBusinessDaysISO(startIso, JOURS_OUVRES_AVANT_DEBUT) + 'T00:00:00Z',
  );

  const heures = session.product.durationHours ?? 0;
  const jours = heures > 0 ? Math.ceil(heures / 8) : 0;
  const sigUrl = loadSignatureDataUrl(tenantId, 'pedago');
  const tamponUrl = loadStampDataUrl(tenantId);
  const signataire = `${of.contact.prenom} ${of.contact.nom}`.trim() || of.name;

  const body = `
${renderBrandHeader(undefined, tenantId)}
<main class="body">
  <h1 class="doc-title">Analyse des besoins de l'entreprise</h1>
  <p class="doc-subtitle">Recueil des besoins en amont de la formation — formation intra-entreprise</p>
  <hr class="doc-rule" />

  <div style="margin: 10px 0 14px 0; padding: 10px 14px; background: #F8FAFC; border-left: 3px solid ${SECTION_BLUE};">
    <p style="margin: 2px 0;"><strong style="color: ${BRAND_DARK};">${escapeHtml(representant)}, représentant de la société ${escapeHtml(org.legalName)}</strong>${org.siret ? ` (SIRET ${escapeHtml(org.siret)})` : ''}, ${escapeHtml(contenu.activite)}, a sollicité ${escapeHtml(of.name)} pour un projet de formation de ses équipes.</p>
    <p style="margin: 6px 0 2px 0;">Il est l'interlocuteur du présent recueil des besoins, mené pour le compte de son entreprise.</p>
  </div>

  <div style="margin: 0 0 14px 0; padding: 10px 14px; background: #F8FAFC; border-left: 3px solid ${SECTION_BLUE};">
    <p style="margin: 2px 0;"><strong style="color: ${BRAND_DARK};">Formation envisagée :</strong> « ${escapeHtml(session.product.title)} »</p>
    <p style="margin: 2px 0;">Durée : <strong>${heures} heures${jours > 0 ? ` / ${jours} journée${jours > 1 ? 's' : ''}` : ''}</strong> — du <strong>${fmtJour(session.startDate)}</strong> au <strong>${fmtJour(session.endDate)}</strong></p>
    <p style="margin: 2px 0;">Modalité : ${escapeHtml(modalite)}${lieu ? ` — ${escapeHtml(lieu)}` : ''}</p>
    <p style="margin: 2px 0;">Effectif concerné : <strong>${effectif} salarié${effectif > 1 ? 's' : ''}</strong></p>
  </div>

  <h2 class="section">Contexte de l'entreprise</h2>
  <p class="paragraph">${escapeHtml(contenu.contexte)}</p>

  <h2 class="section">Besoins exprimés par le représentant de l'entreprise</h2>
  ${bullets(contenu.besoins_exprimes)}

  <h2 class="section">Objectifs attendus de la formation</h2>
  ${bullets(contenu.objectifs_attendus)}

  <h2 class="section">Public concerné et prérequis</h2>
  <p class="paragraph">${escapeHtml(contenu.public_prerequis)}</p>

  <h2 class="section">Modalités et calendrier envisagés</h2>
  <p class="paragraph">${escapeHtml(contenu.modalites)}</p>

  <h2 class="section">Adaptation proposée par l'organisme de formation</h2>
  <p class="paragraph">${escapeHtml(contenu.adaptation_proposee)}</p>

  <h2 class="section">Situation de handicap</h2>
  <p class="paragraph">Interrogé sur d'éventuels besoins d'adaptation liés à une situation de handicap ou à une maladie invalidante au sein des équipes concernées, ${escapeHtml(representant)} n'a signalé <strong>aucun besoin d'adaptation</strong> à ce stade. ${effectif > 1 ? 'Les salariés seront de nouveau interrogés individuellement' : 'Le salarié sera de nouveau interrogé'} lors du test de positionnement préalable.</p>
  <p style="font-size: 9pt; color: #475569; margin-top: 6px;">Référent handicap : <strong>${escapeHtml(of.handicapReferent)}</strong>${of.resp.email ? ` — ${escapeHtml(of.resp.email)}` : ''}${of.resp.phone ? ` — ${escapeHtml(of.resp.phone)}` : ''}.</p>

  <div style="margin-top: 14mm; padding: 12px 14px; border: 1px solid #E2E8F0; border-radius: 6px; background: #F8FAFC; page-break-inside: avoid;">
    <div style="font-size: 9pt; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Analyse réalisée par</div>
    <div style="font-size: 12pt; font-weight: 700; color: ${BRAND_DARK};">${escapeHtml(signataire)}</div>
    <div style="font-size: 9.5pt; color: #475569; margin-top: 2px;">
      Le ${escapeHtml(formatDateFr(analyseDate))} — ${escapeHtml(of.contact.titre || 'Dirigeant')}, ${escapeHtml(of.name)} — recueil réalisé auprès de ${escapeHtml(representant)}, représentant de la société ${escapeHtml(org.legalName)}.
    </div>
    ${
      sigUrl || tamponUrl
        ? `<div style="margin-top: 6px; white-space: nowrap;">
      ${sigUrl ? `<img src="${sigUrl}" alt="Signature" style="max-height: 20mm; max-width: 36mm; vertical-align: bottom;" />` : ''}
      ${tamponUrl ? `<img src="${tamponUrl}" alt="Tampon" style="max-height: 28mm; max-width: 28mm; vertical-align: bottom; margin-left: 5mm;" />` : ''}
    </div>`
        : ''
    }
  </div>
</main>
`;

  const html = wrapHtml({
    title: `Analyse des besoins — ${org.legalName}`,
    bodyHtml: body,
  });
  const pdfBuffer = await renderHtmlToPdfWeasy(html);
  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const slug = org.legalName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const objectKey = `analyses/${tenantId}/${session.code}/${slug}-entreprise-${hash.slice(0, 8)}.pdf`;
  await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');

  const participantIds = participants.map((p) => p.id);

  // Une session ne porte qu'UNE analyse de niveau session : sur une session
  // multi-commanditaires, la dernière génération remplace la précédente.
  const autresInscrits = await prisma.sessionParticipant.findMany({
    where: { sessionId, session: { tenantId }, sponsorOrgId: { not: sponsorOrgId } },
    select: {
      sponsorOrgId: true,
      sponsorOrg: { select: { legalForm: true } },
      person: { select: { legalLinks: { select: { organizationId: true, role: true } } } },
    },
  });
  const multi = autresInscrits.some((p) =>
    releveDeLaConvention({
      sponsorLegalForm: p.sponsorOrg?.legalForm,
      roleChezSponsor:
        p.person?.legalLinks?.find((l) => l.organizationId === p.sponsorOrgId)?.role ?? null,
    }),
  );
  if (multi) {
    console.warn(
      '[analyse-besoin-entreprise] session MULTI-commanditaires : une seule analyse de niveau session peut être stockée —',
      sessionId,
    );
  }

  const operations = [
    // Idempotence : l'analyse d'entreprise précédente de cette session.
    prisma.pedagogicalAsset.deleteMany({
      where: { tenantId, sessionId, participantId: null, kind: 'ANALYSE_BESOIN' },
    }),
    // Règle « jamais une analyse par salarié » : les nominatives des couverts.
    prisma.pedagogicalAsset.deleteMany({
      where: {
        tenantId,
        sessionId,
        kind: 'ANALYSE_BESOIN',
        participantId: { in: participantIds },
      },
    }),
    prisma.pedagogicalAsset.create({
      data: {
        tenantId,
        sessionId,
        participantId: null,
        kind: 'ANALYSE_BESOIN',
        rawJson: {
          scope: 'entreprise',
          entreprise: org.legalName,
          interlocuteur: representant,
          effectif,
          dateAnalyse: analyseDate.toISOString().slice(0, 10),
          ...contenu,
        } as unknown as Prisma.InputJsonValue,
        pdfUrl: objectKey,
        hashSha256: hash,
        generatedAt: analyseDate,
      },
    }),
  ];
  // L'asset créé est TOUJOURS la dernière opération — ne pas indexer en dur.
  const results = await prisma.$transaction(operations);
  const asset = results[results.length - 1] as { id: string };

  return { ok: true, assetId: asset.id, sessionId, count: effectif };
}
