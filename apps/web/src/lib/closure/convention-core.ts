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
  deriveSiren,
  type ConventionData,
  type ConventionStagiaire,
} from '@/lib/convention-template';
import { formatLieuFormation } from '@/lib/locations/format-lieu';
import { loadOfConfig } from '@/lib/of-config';
import { subtractBusinessDaysISO } from '@/lib/business-days';
import { requiresContratIndividuel } from '@/lib/legal-forms';
import { isPersonneMoralePayeur } from '@/lib/sessions/payer-rule';
import { groupConventionAnyShapeWhere } from '@/lib/docs/convention-coverage';

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
): Promise<{ ok: boolean; documentId?: string; error?: string; sessionId?: string; personId?: string; skipped?: boolean }> {
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

  // Garde anti-doublon (revue Codex PR #13). Si une convention GROUPE couvre
  // déjà ce participant, ne pas en émettre une individuelle : la session
  // porterait les DEUX, ce qui viole la règle « jamais une convention par
  // stagiaire » et se verrait en audit.
  //
  // Posée ICI plutôt que chez les appelants : `generateConventionForParticipant`
  // est invoqué depuis 5 endroits (préparation ×2, matrice Qualiopi, création
  // de session, pack de clôture) — une garde centrale les couvre tous.
  //
  // Retourne un SUCCÈS, pas une erreur : le participant EST couvert, et les
  // flux batch ne doivent pas tomber en échec pour autant. Le deleteMany
  // ci-dessus a par ailleurs déjà retiré l'éventuelle individuelle obsolète.
  //
  // Quick 260821-md8 : la garde interroge les DEUX formes de stockage. Sur
  // SES-0107 / SES-0108 la convention de groupe existante est celle des
  // scripts `_gen-*` (`entityType='session'`) ; une garde limitée à la forme
  // `organization` la manquait et réémettait une convention nominative.
  const groupConvention = await prisma.document.findFirst({
    where: groupConventionAnyShapeWhere(tenantId, participant.session.id, participant.sponsorOrgId),
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (groupConvention) {
    return {
      ok: true,
      documentId: groupConvention.id,
      skipped: true,
      sessionId: participant.session.id,
      personId: participant.person.id,
    };
  }

  // Ceinture du 28/08 — PREMIÈRE convention d'une entreprise.
  //
  // La garde ci-dessus ne joue que si la convention groupe existe déjà. Or
  // deux chemins appellent encore le cœur individuel sans router par la règle
  // payeur : `sessions.addParticipant` (auto-génération à l'inscription) et
  // `closure-pack` (boucle sur les participants). Sur le 1er salarié inscrit
  // chez une entreprise, aucune convention groupe n'existe encore — et une
  // nominative était fabriquée, exactement ce que la règle du 12/08 interdit.
  //
  // Payeur personne morale ⇒ le cœur individuel ne produit RIEN. Succès
  // `skipped` (les flux batch ne doivent pas tomber en échec) ; l'émission de
  // la convention de groupe revient à `routeConventionsByPayerRule`, seul
  // endroit qui traite les groupes EN SÉRIE — `generateConventionEntrepriseCore`
  // supprime puis recrée des Documents, deux appels concurrents se
  // marcheraient dessus.
  //
  // Forme juridique absente ⇒ chemin individuel (cf. `isPersonneMoralePayeur`) :
  // on ne présume pas d'une convention de groupe sur une donnée manquante.
  if (isPersonneMoralePayeur(participant.sponsorOrg?.legalForm)) {
    return {
      ok: true,
      skipped: true,
      sessionId: participant.session.id,
      personId: participant.person.id,
    };
  }

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
  // Quick 260821-md8 : composition déléguée à `formatLieuFormation`, PARTAGÉE
  // avec le chemin entreprise. La duplication précédente est exactement ce qui
  // aurait laissé un des deux chemins cassé après correctif.
  const of = await loadOfConfig(tenantId);
  const lieu = formatLieuFormation(participant.session.location, of.addressFull);

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
    // Ligne RCS = SIREN (9 chiffres), pas le SIRET. La cascade de représentant
    // ci-dessus reste INCHANGÉE : sur le chemin auto-payeur, l'apprenant signe.
    beneficiaireSiren: deriveSiren(participant.sponsorOrg.siren, participant.sponsorOrg.siret),
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
    include: {
      // Repli du représentant légal (quick 260821-md8) : le contact principal
      // le plus ancien, un seul. La requête reste scopée tenant via l'org.
      contacts: {
        where: { isPrimary: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { firstName: true, lastName: true },
      },
    },
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

  // Prix : pour une entreprise, c'est un PRIX GLOBAL négocié pour le groupe,
  // pas un tarif par salarié (correction Laurent 18/08). On somme donc les
  // priceHT des participants — exactement ce que fait déjà la facture groupée
  // (`createInvoiceForSponsorGroup`), pour que convention et facture affichent
  // le même montant. Les prix peuvent légitimement différer d'un salarié à
  // l'autre : seul le total engage l'entreprise.
  // ⚠ AUCUN fallback sur le prix produit (revue Codex PR #13) : la facture
  // groupée (`createInvoiceForSponsorGroup`) somme les priceHT BRUTS. Combler
  // un prix manquant ici ferait dire à la convention un montant SUPÉRIEUR à
  // celui facturé — deux documents contractuels qui se contredisent. On refuse
  // plutôt, en nommant les personnes à compléter.
  const sansPrix = participants.filter((p) => Number(p.priceHT) <= 0);
  if (sansPrix.length > 0) {
    const noms = sansPrix
      .map((p) => `${p.person.firstName} ${p.person.lastName.toUpperCase()}`)
      .join(', ');
    return {
      ok: false,
      error: `Prix HT manquant pour ${noms} — renseignez le prix de chaque inscription avant de générer la convention (sinon son total différerait de la facture).`,
    };
  }
  const productPrice = Number(session.product.priceHT);
  const prixGlobalHT = participants.reduce((sum, p) => sum + Number(p.priceHT), 0);

  // Représentant légal — quick 260821-md8. Cascade : champ explicite de la
  // fiche entreprise, puis contact principal. À défaut, on REFUSE.
  //
  // Le défaut exact constaté le 21/08 sur la convention EXPERTA envoyée au
  // portail OPCO EP : « Représentée par , ». Une convention sans signataire
  // n'est pas opposable — elle ne doit pas pouvoir être produite. Le refus
  // tombe ICI, à côté de la garde des prix manquants, donc AVANT tout rendu
  // PDF et toute écriture.
  const contactPrincipal = org.contacts?.[0];
  const representantNom =
    org.representative?.trim() ||
    (contactPrincipal
      ? `${contactPrincipal.firstName} ${contactPrincipal.lastName.toUpperCase()}`.trim()
      : '');
  if (!representantNom) {
    return {
      ok: false,
      error:
        `Représentant légal inconnu pour « ${org.legalName} » : renseignez le représentant ` +
        `sur la fiche entreprise (/app/organisations/${org.id}) ou désignez un contact ` +
        `principal. Une convention sans signataire n'est pas opposable.`,
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

  // Lieu : MÊME helper que le chemin individuel (quick 260821-md8).
  const lieu = formatLieuFormation(session.location, of.addressFull);

  const orgAddr = (org.address as Record<string, string> | null) ?? null;

  // Date de signature = J-15 jours OUVRÉS avant le début de session (ind.9 +
  // rétractation + « solde la veille »). NE JAMAIS hardcoder.
  const startIso = session.startDate.toISOString().slice(0, 10);
  const conventionDate = new Date(subtractBusinessDaysISO(startIso, 15) + 'T00:00:00Z');

  const data: ConventionData = {
    beneficiaireRaisonSociale: org.legalName,
    beneficiaireSiret: org.siret,
    // Ligne RCS = SIREN (9 chiffres) ; le SIRET a désormais sa propre ligne.
    beneficiaireSiren: deriveSiren(org.siren, org.siret),
    beneficiaireRcsVille: orgAddr?.city ?? null,
    // Le chef d'entreprise signe pour le groupe — résolu et GARANTI non vide
    // par la garde ci-dessus.
    beneficiaireRepresentantNom: representantNom,
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
    // Renseigné pour compat du type, mais c'est `prixGlobalHT` qui fait foi
    // côté rendu pour une convention entreprise.
    produitPriceHTPerStagiaire: productPrice,
    prixGlobalHT,
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

  // Quick 260821-md8 — convergence des DEUX formes de stockage.
  //
  // La forme `session` (scripts `_gen-*`) ne porte PAS de commanditaire : la
  // supprimer serait ambigu sur une session multi-entreprises, où elle peut
  // couvrir une AUTRE entreprise que celle qu'on régénère. On ne la remplace
  // donc QUE si la session n'a qu'un seul commanditaire personne morale — le
  // cas ASSALIT / EXPERTA / OPTIMMO.
  //
  // Les auto-payeurs présents sur la session ne comptent pas : ils relèvent du
  // contrat individuel et n'ont aucune convention de groupe à revendiquer.
  const autresCommanditaires = await prisma.sessionParticipant.findMany({
    where: { sessionId, session: { tenantId }, sponsorOrgId: { not: sponsorOrgId } },
    select: { sponsorOrgId: true, sponsorOrg: { select: { legalForm: true } } },
    distinct: ['sponsorOrgId'],
  });
  const monoCommanditaire = !autresCommanditaires.some((p) =>
    isPersonneMoralePayeur(p.sponsorOrg?.legalForm),
  );
  if (!monoCommanditaire) {
    console.warn(
      '[convention-entreprise] doc groupe forme "session" conservé (session multi-commanditaires) — à arbitrer :',
      sessionId,
    );
  }

  // Idempotence + règle « jamais une convention par stagiaire » : on remplace
  // l'ancienne convention groupe ET on retire les conventions individuelles
  // des participants désormais couverts par celle-ci.
  //
  // Ce remplacement ne se déclenche que sur une régénération EXPLICITE : aucune
  // migration de fond, aucun balayage automatique de la base.
  const operations = [
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
    ...(monoCommanditaire
      ? [
          prisma.document.deleteMany({
            where: {
              tenantId,
              type: 'CONVENTION',
              entityType: 'session',
              entityId: sessionId,
              sessionId,
              participantId: null,
            },
          }),
        ]
      : []),
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
  ];
  // Le Document créé est TOUJOURS la dernière opération — ne pas indexer en dur.
  const results = await prisma.$transaction(operations);
  const document = results[results.length - 1] as { id: string };

  return { ok: true, documentId: document.id, sessionId, count: participants.length };
}
