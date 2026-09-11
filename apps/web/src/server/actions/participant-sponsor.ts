'use server';

/**
 * « Organisation commanditaire » — corriger le commanditaire d'une inscription.
 *
 * ⚠ LE CHAMP S'EST APPELÉ « Financeur de l'inscription » jusqu'au 11/09/2026
 * (correction n°7 bis) : trompeur, puisqu'on y choisit une ORGANISATION et que
 * le financeur n'est qu'une information qu'elle porte. L'action, elle, n'a pas
 * changé de nom — `changerFinanceurInscription` change bien le financeur DE
 * FAIT, en changeant l'organisation qui le porte.
 * Décision Laurent du 11/09/2026 (retours d'écran C.2b, point 7).
 *
 * LE MANQUE QU'ELLE COMBLE. `SessionParticipant.sponsorOrgId` n'était posé qu'à
 * la création (`add-participant-dialog`). `updateParticipant` acceptait bien un
 * `sponsorOrgId` dans sa signature, mais AUCUN appelant ne le passait — et ce
 * chemin-là n'oppose aucun garde-fou : il aurait laissé re-rattacher une
 * inscription dont le dossier est déjà chez l'AGEFICE, ou dont la convention est
 * signée. Une inscription mal rattachée n'était donc corrigeable qu'en la
 * supprimant et en la recréant, c'est-à-dire en perdant sa ligne, ses documents
 * et son historique.
 *
 * POURQUOI UNE ACTION DÉDIÉE, ET PAS UN CHAMP DE PLUS DANS `updateParticipant`.
 * Ce champ n'est pas un champ de confort : c'est `sponsorOrg.opcoCode` que
 * `participants-regime.ts` lit pour décider QUI signe QUOI, c'est lui que la
 * convention imprime, c'est lui que le dossier de prise en charge désigne. Il
 * porte donc des refus qui n'ont rien à voir avec ceux d'un prix ou d'un statut,
 * un RBAC plus étroit (`ADMIN | MANAGER`, le même ensemble que les actions de
 * signature) et son propre `AuditLog` (`participant.sponsor_changed`). Le mêler
 * au reste aurait rendu ces refus invisibles dans un `if` parmi huit.
 *
 * ⚠ NE PAS CONFONDRE avec le MODE de financement (`financingMode`, toujours
 * édité par `updateParticipant`) : le mode dit COMMENT c'est financé, le
 * financeur dit PAR QUI l'inscription est portée.
 */

import { prisma, type Prisma } from '@qualiof/db';
import { revalidatePath } from 'next/cache';
import {
  ChangerFinanceurInscriptionInputSchema,
  ListerFinanceursInputSchema,
  LIMITE_FINANCEURS_PROPOSES,
} from '@qualiof/shared';
import { requireRole, UnauthorizedError, ForbiddenError } from '@/lib/rbac';
import { verrouChangementFinanceur } from '@/lib/enrollment/verrou-financeur';

export type ResultatAction = { ok: true } | { ok: false; error: string };

/** Une organisation proposée dans le sélecteur « Organisation commanditaire ». */
export interface FinanceurPropose {
  id: string;
  /** `brandName ?? legalName` — ce que l'admin reconnaît à l'écran. */
  label: string;
  /** Raison sociale, affichée en second quand elle diffère du libellé. */
  legalName: string;
  siret: string | null;
  opcoCode: string | null;
}

/** `brandName ?? legalName`, la même règle qu'ailleurs dans la fiche session. */
function libelleOrg(org: { legalName: string; brandName?: string | null }): string {
  const enseigne = (org.brandName ?? '').trim();
  return enseigne.length > 0 ? enseigne : org.legalName;
}

function nomAffiche(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName.toUpperCase()}`.trim();
}

export type ListeFinanceurs =
  | { ok: true; financeurs: FinanceurPropose[]; financeurActuelId: string | null }
  | { ok: false; error: string };

/**
 * Les organisations que l'admin peut choisir comme financeur, PLUS le financeur
 * actuel de l'inscription éditée.
 *
 * ⚠ `tenantId` est NON NÉGOCIABLE ici : c'est la liste qui alimente le
 * sélecteur, donc la seule chose qui décide de ce qui est rattachable. Une liste
 * non cloisonnée ferait apparaître l'organisation d'un autre OF dans le menu, et
 * le refus côté cible ne serait plus qu'un filet — on ne construit pas une
 * interface qui propose ce que le serveur refusera.
 *
 * POURQUOI LE FINANCEUR ACTUEL REMONTE ICI, et n'est pas passé en prop depuis la
 * fiche session : le formulaire s'ouvre par URL (`?inscription=…`), donc
 * potentiellement sans que la ligne correspondante ait été rendue avec sa donnée
 * à jour. Le faire lire par le serveur au moment de l'ouverture est la seule
 * façon d'être sûr que le sélecteur s'ouvre sur l'état RÉEL de l'inscription.
 */
export async function listerFinanceursPossibles(input?: {
  q?: string;
  participantId?: string;
}): Promise<ListeFinanceurs> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = ListerFinanceursInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Recherche invalide.' };
  }
  const terme = parsed.data.q ?? '';

  const where: Prisma.OrganizationWhereInput = {
    tenantId: user.tenantId,
    archived: false,
  };
  if (terme.length >= 2) {
    where.OR = [
      { legalName: { contains: terme, mode: 'insensitive' } },
      { brandName: { contains: terme, mode: 'insensitive' } },
      { siret: { contains: terme.replace(/\D/g, '') || terme } },
    ];
  }

  const orgs = await prisma.organization.findMany({
    where,
    orderBy: { legalName: 'asc' },
    take: LIMITE_FINANCEURS_PROPOSES,
    select: { id: true, legalName: true, brandName: true, siret: true, opcoCode: true },
  });

  const financeurs: FinanceurPropose[] = orgs.map((o) => ({
    id: o.id,
    label: libelleOrg(o),
    legalName: o.legalName,
    siret: o.siret,
    opcoCode: o.opcoCode,
  }));

  let financeurActuelId: string | null = null;
  if (parsed.data.participantId) {
    const inscription = await prisma.sessionParticipant.findUnique({
      where: { id: parsed.data.participantId },
      select: { sponsorOrgId: true, session: { select: { tenantId: true } } },
    });
    // Même cloisonnement que partout : l'inscription d'un autre OF n'existe pas.
    if (inscription && inscription.session.tenantId === user.tenantId) {
      financeurActuelId = inscription.sponsorOrgId;
      if (!financeurs.some((f) => f.id === financeurActuelId)) {
        // Hors plafond, hors recherche, ou archivée : on la ramène quand même,
        // sinon le sélecteur afficherait « aucun financeur » pour une
        // inscription qui en a un.
        const actuel = await prisma.organization.findFirst({
          where: { id: financeurActuelId, tenantId: user.tenantId },
          select: { id: true, legalName: true, brandName: true, siret: true, opcoCode: true },
        });
        if (actuel) {
          financeurs.unshift({
            id: actuel.id,
            label: libelleOrg(actuel),
            legalName: actuel.legalName,
            siret: actuel.siret,
            opcoCode: actuel.opcoCode,
          });
        }
      }
    }
  }

  return { ok: true, financeurs, financeurActuelId };
}

export async function changerFinanceurInscription(input: {
  participantId: string;
  sponsorOrgId: string;
}): Promise<ResultatAction> {
  let user;
  try {
    user = await requireRole(['ADMIN', 'MANAGER']);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  const parsed = ChangerFinanceurInscriptionInputSchema.safeParse(input);
  if (!parsed.success) {
    const premier =
      parsed.error.errors[0]?.message ?? 'Paramètres invalides pour ce changement de financeur.';
    return { ok: false, error: premier };
  }
  const { participantId, sponsorOrgId } = parsed.data;

  const inscription = await prisma.sessionParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      sponsorOrgId: true,
      sponsorOrg: { select: { id: true, legalName: true, brandName: true } },
      person: { select: { id: true, firstName: true, lastName: true } },
      session: { select: { id: true, tenantId: true } },
      opcoSubmissions: {
        select: {
          id: true,
          status: true,
          sponsorOrg: { select: { legalName: true, brandName: true } },
        },
      },
      agreementDocs: {
        select: { id: true, type: true, status: true, signedPdfUrl: true },
      },
    },
  });

  // Cloisonnement tenant : une inscription d'un autre OF n'existe pas, et on ne
  // dit pas laquelle — un message qui distingue « pas à vous » de « n'existe
  // pas » est déjà une fuite.
  if (!inscription || inscription.session.tenantId !== user.tenantId) {
    return { ok: false, error: 'Inscription introuvable.' };
  }

  const nom = nomAffiche(inscription.person);

  // Rien à changer : ni écriture, ni AuditLog vide (même règle que
  // `updateParticipant` / `updateSessionDetails`).
  if (inscription.sponsorOrgId === sponsorOrgId) return { ok: true };

  // ══ LES DEUX REFUS ══════════════════════════════════════════════════════
  // Nominatifs, toujours : l'admin doit savoir QUI est bloqué, par QUOI, et
  // quoi faire ensuite. Cf. `@/lib/enrollment/verrou-financeur`.
  const verrou = verrouChangementFinanceur({
    nomParticipant: nom,
    dossiers: inscription.opcoSubmissions.map((s) => ({
      id: s.id,
      status: s.status as string,
      financeurLabel: s.sponsorOrg === null ? null : libelleOrg(s.sponsorOrg),
    })),
    pieces: inscription.agreementDocs.map((d) => ({
      id: d.id,
      type: d.type as string,
      status: d.status,
      signedPdfUrl: d.signedPdfUrl,
    })),
  });
  if (verrou.bloque) {
    return { ok: false, error: verrou.message };
  }

  // L'organisation CIBLE est elle aussi cherchée dans le tenant : sans ce
  // `tenantId`, un id deviné suffirait à rattacher une inscription à
  // l'organisation d'un autre OF.
  const cible = await prisma.organization.findFirst({
    where: { id: sponsorOrgId, tenantId: user.tenantId },
    select: { id: true, legalName: true, brandName: true, opcoCode: true, archived: true },
  });
  if (!cible) {
    return {
      ok: false,
      error:
        `Financeur introuvable : l'inscription de ${nom} ne peut pas être rattachée à cette ` +
        `organisation, qui n'existe pas dans ce compte. Créez-la depuis Organisations, ` +
        `puis recommencez.`,
    };
  }
  if (cible.archived) {
    return {
      ok: false,
      error:
        `« ${libelleOrg(cible)} » est archivée : l'inscription de ${nom} ne peut pas y être ` +
        `rattachée. Désarchivez l'organisation, ou choisissez-en une autre.`,
    };
  }

  const avant = {
    sponsorOrgId: inscription.sponsorOrgId,
    sponsorOrgLabel: inscription.sponsorOrg === null ? null : libelleOrg(inscription.sponsorOrg),
    opcoCode: null as string | null,
  };
  const apres = {
    sponsorOrgId: cible.id,
    sponsorOrgLabel: libelleOrg(cible),
    opcoCode: cible.opcoCode,
  };

  // ⚠ L'AuditLog est écrit DANS la transaction, via `tx` — jamais après. Un
  // rattachement qui aboutit sans trace, ou une trace sans rattachement, sont
  // tous deux pires que l'échec : c'est précisément ce champ qu'un financeur
  // ou un audit Qualiopi viendra contester.
  await prisma.$transaction(async (tx) => {
    await tx.sessionParticipant.update({
      where: { id: participantId },
      data: { sponsorOrgId: cible.id },
    });
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'SessionParticipant',
        entityId: participantId,
        action: 'participant.sponsor_changed',
        diff: {
          participant: { id: inscription.id, nom },
          sessionId: inscription.session.id,
          // Les deux sponsors NOMMÉS, pas seulement leurs ids : six mois plus
          // tard, l'organisation peut avoir été renommée ou fusionnée, et un
          // UUID seul ne raconte plus rien.
          before: avant,
          after: apres,
        } as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath(`/app/sessions/${inscription.session.id}`);
  return { ok: true };
}
