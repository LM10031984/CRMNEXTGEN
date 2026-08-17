/**
 * Cœur SANS auth de la génération de convention de formation.
 *
 * Extrait de `src/server/actions/convention-generator.ts` (quick 260618-gux,
 * correctif démarrage pipeline) : ce fichier N'IMPORTE PAS `@/lib/auth`, ni
 * directement ni transitivement, afin qu'un script tsx (worker / pipeline) puisse
 * importer le cœur sans tirer `validateRequest` → `react cache` (cf. règle projet
 * « un script tsx ne doit jamais importer, même transitivement, une server action
 * utilisant validateRequest »).
 *
 * Logique métier (inchangée) :
 * - Si le sponsorOrg de l'inscription est l'auto-entreprise de l'apprenant
 *   (LegalLink role EI_SELF), le bénéficiaire = AE, représentant = apprenant
 * - Sinon (sponsor = structure employeur, apprenant salarié), bénéficiaire =
 *   structure, représentant = champ Organization.representative
 *
 * Le wrapper server action `generateConventionForParticipant` lit
 * `validateRequest()`, délègue ici, puis fait `revalidatePath`.
 */

import { createHash } from 'node:crypto';
import { prisma } from '@qualiof/db';
import { uploadFile, DOCS_BUCKET } from '@/lib/storage';
import { renderHtmlToPdfWeasy } from '@/lib/pdf-render';
import {
  renderConventionHtml,
  type ConventionData,
  type ConventionStagiaire,
} from '@/lib/convention-template';
import { loadOfConfig } from '@/lib/of-config';
import { subtractBusinessDaysISO } from '@/lib/business-days';
import { requiresContratIndividuel } from '@/lib/legal-forms';

/**
 * Cœur SANS auth de la génération de convention (réutilisable par scripts
 * pipeline / worker). Prend `tenantId` en paramètre au lieu de lire
 * `validateRequest()`. NE FAIT PAS de revalidatePath (laissé au wrapper).
 * Conserve le `deleteMany` inconditionnel (le test generators-idempotent en
 * dépend) et la logique métier J-15 ouvrés intacte.
 */
export async function generateConventionCore(
  tenantId: string,
  participantId: string,
  options?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; error?: string; sessionId?: string; personId?: string }> {
  void options;
  // Idempotence inconditionnelle : on supprime toujours l'ancien Document du
  // même type avant de recréer (anti-doublons). Le paramètre `force` reste
  // accepté dans la signature pour compat appelants mais ne conditionne plus rien.
  await prisma.document.deleteMany({
    where: { tenantId, type: 'CONVENTION', participantId },
  });

  const participant = await prisma.sessionParticipant.findFirst({
    where: { id: participantId, session: { tenantId } },
    include: {
      person: {
        include: {
          legalLinks: { include: { organization: true } },
        },
      },
      sponsorOrg: true,
      session: {
        include: {
          product: true,
          location: true,
          trainers: { include: { person: true } },
        },
      },
    },
  });
  if (!participant) return { ok: false, error: 'Inscription introuvable' };
  if (!participant.session.product) return { ok: false, error: 'Produit lié à la session manquant' };

  const participantPrice = Number(participant.priceHT);
  const productPrice = Number(participant.session.product.priceHT);
  const effectivePrice = participantPrice > 0 ? participantPrice : productPrice;
  if (effectivePrice <= 0) {
    return {
      ok: false,
      error:
        "Prix HT non défini : ni sur l'inscription (fiche session, bouton Éditer) ni sur le produit (/app/produits). Renseignez l'un des deux avant de générer la convention.",
    };
  }

  // Détermine si l'apprenant est rattaché à son sponsorOrg via EI_SELF
  // (= auto-entreprise perso) ou via SALARIE/DIRIGEANT (= structure employeur).
  const linkToSponsor = participant.person.legalLinks.find(
    (l) => l.organizationId === participant.sponsorOrgId,
  );
  const isSelfEmployed = linkToSponsor?.role === 'EI_SELF';

  // Représentant qui signe la convention
  const representantNom = isSelfEmployed
    ? `${participant.person.firstName} ${participant.person.lastName.toUpperCase()}`.trim()
    : (participant.sponsorOrg.representative?.trim() || `${participant.person.firstName} ${participant.person.lastName.toUpperCase()}`.trim());

  // Stagiaire(s) couverts par cette convention. Pour le MVP, 1 seule personne.
  const stagiaires: ConventionStagiaire[] = [
    {
      prenom: participant.person.firstName,
      nom: participant.person.lastName,
      email: participant.person.email,
    },
  ];

  // Lieu : "Raison sociale — Nom du lieu, adresse" si dispo, sinon siège OF.
  // legalName ajouté 2026-06-03 (cf demande Laurent : ex "SARL XYZ — Agence
  // Nice Centre, 12 rue X, 06000 Nice").
  const of = await loadOfConfig(tenantId);
  const locName = participant.session.location
    ? [
        (participant.session.location as { legalName?: string | null }).legalName,
        participant.session.location.name,
      ]
        .filter(Boolean)
        .join(' — ')
    : null;
  const locAddress = participant.session.location?.address as Record<string, string> | string | null;
  let lieu: string;
  if (typeof locAddress === 'string') lieu = [locName, locAddress].filter(Boolean).join(', ') || locAddress;
  else if (locAddress && typeof locAddress === 'object') {
    const parts = [locAddress.street, locAddress.postalCode, locAddress.city].filter(Boolean);
    lieu = [locName, parts.join(', ')].filter(Boolean).join(', ') || (locName ?? of.addressFull);
  } else {
    lieu = locName ?? of.addressFull;
  }

  // RCS ville : heuristique depuis le code postal de l'org si possible
  const orgAddr = (participant.sponsorOrg.address as Record<string, string> | null) ?? null;
  const rcsVille = orgAddr?.city ?? null;

  // Produit : objectifs depuis la fiche produit
  const objectives = (participant.session.product.objectives as string[] | null) ?? [];

  // COR-1 — date de signature = J-15 jours OUVRÉS avant le début de session
  // (règle Laurent « signée ≥15j avant »). Cohérence : signée J-15 ouvrés →
  // rétractation 14j (Art.6) finit ~J-1 → solde « la veille » (Art.7) cohérent.
  // NE PAS hardcoder de date (audit témoin SES-0087, 2026-06-18).
  const startIso = participant.session.startDate.toISOString().slice(0, 10);
  const conventionIso = subtractBusinessDaysISO(startIso, 15);
  const conventionDate = new Date(conventionIso + 'T00:00:00Z');

  const data: ConventionData = {
    beneficiaireRaisonSociale: participant.sponsorOrg.legalName,
    beneficiaireSiret: participant.sponsorOrg.siret,
    beneficiaireRcsVille: rcsVille,
    beneficiaireRepresentantNom: representantNom,
    stagiaires,
    sessionStartDate: participant.session.startDate,
    sessionEndDate: participant.session.endDate,
    conventionDate,
    sessionLieu: lieu,
    produitTitre: participant.session.name ?? participant.session.product.title,
    produitDureeHeures: participant.session.product.durationHours,
    produitObjectifs: objectives,
    produitProgrammeMd: typeof participant.session.product.programMd === 'string' ? participant.session.product.programMd : '',
    produitTrainerProfile: participant.session.product.trainerProfile,
    produitPriceHTPerStagiaire: effectivePrice,
    // Phase 7 (Plan 07-03) — résolution logo uploadé via Paramètres
    tenantId,
  };

  let pdfBuffer: Buffer;
  try {
    const html = renderConventionHtml(data, of);
    pdfBuffer = await renderHtmlToPdfWeasy(html);
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF convention : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const safePersonSlug = `${participant.person.lastName}-${participant.person.firstName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const objectKey = `conventions/${participant.session.code}/${safePersonSlug}-${hash.slice(0, 8)}.pdf`;

  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload MinIO : ${e?.message ?? e}` };
  }

  const document = await prisma.document.create({
    data: {
      tenantId,
      type: 'CONVENTION',
      entityType: 'participant',
      entityId: participant.id,
      sessionId: participant.session.id,
      participantId: participant.id,
      pdfUrl: objectKey,
      hashSha256: hash,
    },
  });

  return {
    ok: true,
    documentId: document.id,
    sessionId: participant.session.id,
    personId: participant.person.id,
  };
}

// ─── Convention ENTREPRISE (groupe) — quick 260817-mm0 ──────────────────

/**
 * Génère UNE convention de formation unique au nom d'une entreprise
 * commanditaire, couvrant TOUS ses salariés inscrits à la session.
 *
 * Comble le gap constaté sur la session OPTIMMO (11 salariées, dossier OPCO
 * EP) : la convention groupe devait être produite hors app par script.
 *
 * Règle métier (figée 12/08) : payeur personne morale ⇒ 1 convention signée
 * par le chef d'entreprise pour tout le groupe, **jamais une par stagiaire**.
 * Générer la convention groupe supprime donc les conventions individuelles
 * des participants couverts — laisser les deux serait contradictoire en audit.
 *
 * Le Document produit porte `entityType='organization'` + `entityId=orgId` et
 * `participantId=null` (aucune migration : `entityType` est un String libre et
 * `participantId` est nullable). La fiche session le rattache ensuite à chaque
 * participant du groupe pour l'affichage.
 *
 * Cœur SANS auth, comme `generateConventionCore` : n'importe jamais
 * `@/lib/auth`, afin de rester utilisable depuis un script tsx / worker.
 */
export async function generateConventionEntrepriseCore(
  tenantId: string,
  sessionId: string,
  sponsorOrgId: string,
): Promise<{ ok: boolean; documentId?: string; error?: string; sessionId?: string; count?: number }> {
  const org = await prisma.organization.findFirst({
    where: { id: sponsorOrgId, tenantId },
  });
  if (!org) return { ok: false, error: 'Organisation commanditaire introuvable' };

  // Garde métier : un auto-payeur relève du contrat individuel.
  if (requiresContratIndividuel(org.legalForm)) {
    return {
      ok: false,
      error: `« ${org.legalName} » est une personne physique (${org.legalForm}) : ce commanditaire relève du contrat de formation professionnelle individuel, pas de la convention.`,
    };
  }

  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId, sponsorOrgId, session: { tenantId } },
    include: {
      person: true,
      session: { include: { product: true, location: true } },
    },
    orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }],
  });
  if (participants.length === 0) {
    return {
      ok: false,
      error: `Aucun participant rattaché à « ${org.legalName} » sur cette session.`,
    };
  }

  const first = participants[0]!;
  const session = first.session;
  if (!session.product) return { ok: false, error: 'Produit lié à la session manquant' };

  // Prix : le gabarit exprime le total comme « prix unitaire × N stagiaires »
  // (convention-template : totalHT = produitPriceHTPerStagiaire * nbStagiaires).
  // Il ne sait donc PAS représenter des prix hétérogènes. Plutôt que d'imprimer
  // un montant faux sur un document contractuel, on refuse et on dit quoi
  // corriger.
  const productPrice = Number(session.product.priceHT);
  const prices = participants.map((p) => {
    const pp = Number(p.priceHT);
    return pp > 0 ? pp : productPrice;
  });
  const effectivePrice = prices[0]!;
  if (effectivePrice <= 0) {
    return {
      ok: false,
      error: 'Prix HT par stagiaire introuvable (ni sur les inscriptions, ni sur le produit).',
    };
  }
  if (prices.some((p) => p !== effectivePrice)) {
    const detail = participants
      .map((p, i) => `${p.person.firstName} ${p.person.lastName.toUpperCase()} : ${prices[i]} €`)
      .join(' · ');
    return {
      ok: false,
      error: `Les participants de « ${org.legalName} » n'ont pas le même prix HT — la convention groupe afficherait un total faux. Alignez les prix avant de générer (${detail}).`,
    };
  }

  // Annexe nominative : nom + prénom UNIQUEMENT (consigne Laurent — aucune CSP
  // ni poste occupé sur les documents). `ConventionStagiaire` ne porte
  // volontairement pas ces champs.
  const stagiaires: ConventionStagiaire[] = participants.map((p) => ({
    prenom: p.person.firstName,
    nom: p.person.lastName,
    email: p.person.email,
  }));

  const of = await loadOfConfig(tenantId);

  // Lieu : même composition que le chemin individuel.
  const locName = session.location
    ? [
        (session.location as { legalName?: string | null }).legalName,
        session.location.name,
      ]
        .filter(Boolean)
        .join(' — ')
    : null;
  const locAddress = session.location?.address as Record<string, string> | string | null;
  let lieu: string;
  if (typeof locAddress === 'string') lieu = [locName, locAddress].filter(Boolean).join(', ') || locAddress;
  else if (locAddress && typeof locAddress === 'object') {
    const parts = [locAddress.street, locAddress.postalCode, locAddress.city].filter(Boolean);
    lieu = [locName, parts.join(', ')].filter(Boolean).join(', ') || (locName ?? of.addressFull);
  } else {
    lieu = locName ?? of.addressFull;
  }

  const orgAddr = (org.address as Record<string, string> | null) ?? null;

  // Date de signature = J-15 jours OUVRÉS avant le début de session (ind.9 +
  // rétractation + « solde la veille »). NE JAMAIS hardcoder.
  const startIso = session.startDate.toISOString().slice(0, 10);
  const conventionDate = new Date(subtractBusinessDaysISO(startIso, 15) + 'T00:00:00Z');

  const data: ConventionData = {
    beneficiaireRaisonSociale: org.legalName,
    beneficiaireSiret: org.siret,
    beneficiaireRcsVille: orgAddr?.city ?? null,
    // Le chef d'entreprise signe pour le groupe. Sans représentant renseigné,
    // on laisse un emplacement à compléter à la main plutôt que d'inscrire à
    // tort le nom d'un salarié.
    beneficiaireRepresentantNom: org.representative?.trim() || '',
    stagiaires,
    sessionStartDate: session.startDate,
    sessionEndDate: session.endDate,
    conventionDate,
    sessionLieu: lieu,
    produitTitre: session.name ?? session.product.title,
    produitDureeHeures: session.product.durationHours,
    produitObjectifs: (session.product.objectives as string[] | null) ?? [],
    produitProgrammeMd: typeof session.product.programMd === 'string' ? session.product.programMd : '',
    produitTrainerProfile: session.product.trainerProfile,
    produitPriceHTPerStagiaire: effectivePrice,
    tenantId,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderHtmlToPdfWeasy(renderConventionHtml(data, of));
  } catch (e: any) {
    return { ok: false, error: `Erreur génération PDF convention : ${e?.message ?? e}` };
  }

  const hash = createHash('sha256').update(pdfBuffer).digest('hex');
  const orgSlug = org.legalName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const objectKey = `conventions/${session.code}/entreprise-${orgSlug}-${hash.slice(0, 8)}.pdf`;

  try {
    await uploadFile(DOCS_BUCKET, objectKey, pdfBuffer, 'application/pdf');
  } catch (e: any) {
    return { ok: false, error: `Erreur upload storage : ${e?.message ?? e}` };
  }

  const participantIds = participants.map((p) => p.id);

  // Idempotence + règle « jamais une convention par stagiaire » : on remplace
  // l'ancienne convention groupe ET on retire les conventions individuelles
  // des participants désormais couverts par celle-ci.
  const [, , document] = await prisma.$transaction([
    prisma.document.deleteMany({
      where: {
        tenantId,
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: sponsorOrgId,
        sessionId,
      },
    }),
    prisma.document.deleteMany({
      where: { tenantId, type: 'CONVENTION', participantId: { in: participantIds } },
    }),
    prisma.document.create({
      data: {
        tenantId,
        type: 'CONVENTION',
        entityType: 'organization',
        entityId: sponsorOrgId,
        sessionId,
        participantId: null,
        pdfUrl: objectKey,
        hashSha256: hash,
      },
    }),
  ]);

  return { ok: true, documentId: document.id, sessionId, count: participants.length };
}
