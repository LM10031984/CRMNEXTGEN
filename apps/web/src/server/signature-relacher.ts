/**
 * RELÂCHER UNE PIÈCE — le chemin unique de sortie du gel (lots C.2b-bis, C.3).
 *
 * POURQUOI CE MODULE EXISTE. Un envoi réussi pose `Document.status =
 * 'sent_for_signature'` : la pièce est GELÉE — ni régénérable, ni renvoyable.
 * Trois événements la relâchent, et ils n'ont RIEN en commun côté déclencheur :
 *
 *  1. l'admin clique « Annuler l'envoi » (`annulerEnvoiSignature`) ;
 *  2. le signataire REFUSE (`form.declined`, webhook du lot C.3) ;
 *  3. la demande EXPIRE (`submission.expired`, ou le cron `signature-sync`).
 *
 * Ce qu'ils font ensuite, en revanche, est IDENTIQUE au détail près du motif :
 * rendre au document le statut que le journal lui connaissait avant l'envoi, et
 * le régénérer SANS ses ancres — donc avec le tampon de l'organisme, comme
 * avant. Trois implémentations auraient divergé à la première correction, et le
 * document laissé à ancres est un document sans tampon : une pièce remise à un
 * financeur dans cet état est un défaut qu'aucun écran ne signale.
 *
 * ⚠ CE MODULE N'ANNULE RIEN CHEZ LE PRESTATAIRE. C'est délibéré : le cas 1 doit
 * annuler AVANT (sinon quelqu'un signe une pièce que QualiOF croit annulée), les
 * cas 2 et 3 arrivent APRÈS que le prestataire a déjà clos la demande. L'appelant
 * décide ; ce module ne fait que la partie locale.
 *
 * ⚠ ET IL NE DÉTRUIT JAMAIS UNE PREUVE. Tous les générateurs commencent par un
 * `deleteMany` : régénérer une pièce qui porte déjà un exemplaire signé
 * l'effacerait. On s'abstient alors, et `raisonNonRegeneree` le DIT.
 */

import { prisma, type Prisma } from '@qualiof/db';
import {
  GROUP_CONVENTION_ENTITY_TYPE,
  groupConventionAnyShapeWhere,
} from '@/lib/docs/convention-coverage';
import {
  generateConventionCore,
  generateConventionEntrepriseCore,
} from '@/lib/closure/convention-core';
import { generateAgeficeForParticipant } from '@/server/actions/agefice-generator';
import { generateAgeficeAttendanceForParticipant } from '@/server/actions/agefice-attendance-generator';
import { DOC_TYPES_SIGNABLES, type DocTypeSignable } from '@/lib/signature/regime';
import type { FormeDocument } from '@/lib/signature/signataire-de-la-piece';
import {
  messagePreuveConservee,
  messageRegenerationApresAnnulationImpossible,
  type PieceRelachee,
} from '@/lib/signature/envoi-contrats';

/** Statuts de `Document.status` qui interdisent de toucher au PDF. */
export const STATUT_SIGNE = 'signed';
export const STATUT_ENVOYE = 'sent_for_signature';
/** L'état d'un document simplement produit — celui d'avant tout envoi. */
export const STATUT_GENERE = 'generated';

type ResultatGenerateur = { ok: boolean; error?: string };

/**
 * Régénérer une pièce, avec ou SANS ses ancres.
 *
 * Table de DONNÉES : brancher une pièce signable de plus se fait ici, jamais
 * dans un `if` au milieu d'une boucle.
 */
export const REGENERATION_PAR_PIECE: Record<
  DocTypeSignable,
  (a: {
    tenantId: string;
    sessionId: string;
    forme: FormeDocument;
    signatureTags: boolean;
  }) => Promise<ResultatGenerateur>
> = {
  CONVENTION: async ({ tenantId, sessionId, forme, signatureTags }) =>
    forme.forme === 'GROUPE'
      ? generateConventionEntrepriseCore(tenantId, sessionId, forme.organizationId, null, {
          signatureTags,
        })
      : generateConventionCore(tenantId, forme.participantId, { signatureTags }),
  AGEFICE: async ({ forme, signatureTags }) =>
    forme.forme === 'INDIVIDUEL'
      ? generateAgeficeForParticipant(forme.participantId, { signatureTags })
      : { ok: false, error: 'Un dossier AGEFICE est toujours nominatif.' },
  ASSIDUITE: async ({ forme, signatureTags }) =>
    forme.forme === 'INDIVIDUEL'
      ? generateAgeficeAttendanceForParticipant(forme.participantId, { signatureTags })
      : { ok: false, error: "Une attestation d'assiduité est toujours nominative." },
};

/** Cette pièce fait-elle partie des trois qui partent en signature ? */
export function estPieceSignable(type: string): type is DocTypeSignable {
  return (DOC_TYPES_SIGNABLES as readonly string[]).includes(type);
}

/**
 * La forme d'un document DÉJÀ EN BASE, pour pouvoir le régénérer sans repasser
 * par le plan d'envoi — ni l'annulation ni le webhook ne connaissent le plan.
 *
 * `null` pour la convention de groupe produite par les scripts `_gen-*`
 * (`entityType='session'`) : elle ne porte aucun commanditaire, donc rien ne dit
 * pour QUELLE organisation la régénérer. On préfère le dire plutôt que d'en
 * régénérer une au hasard.
 */
export function formeDuDocumentEnBase(doc: {
  entityType: string;
  entityId: string;
  participantId: string | null;
}): FormeDocument | null {
  if (doc.participantId !== null) {
    return { forme: 'INDIVIDUEL', participantId: doc.participantId };
  }
  if (doc.entityType === GROUP_CONVENTION_ENTITY_TYPE) {
    return { forme: 'GROUPE', organizationId: doc.entityId };
  }
  return null;
}

/**
 * Le statut que le journal connaissait au document AVANT son envoi.
 *
 * Lu dans le `diff` de `signature.sent`, qui écrit `status: { before, after }`.
 * Sans cette relecture, un renvoi forcé d'une pièce déjà signée reviendrait à
 * `generated` et perdrait la mention de sa signature.
 */
export function statutAvantEnvoiDuJournal(diff: unknown): string | null {
  if (typeof diff !== 'object' || diff === null) return null;
  const statut = (diff as { status?: unknown }).status;
  if (typeof statut !== 'object' || statut === null) return null;
  const avant = (statut as { before?: unknown }).before;
  return typeof avant === 'string' && avant.length > 0 ? avant : null;
}

export interface DocumentCharge {
  id: string;
  pdfUrl: string;
  hashSha256: string;
  status: string;
}

/**
 * Le `Document` qui porte cette pièce, dans sa forme actuelle.
 *
 * Partagé entre l'envoi (qui vérifie le hash confirmé), l'annulation et le
 * webhook : les générateurs REMPLACENT le document — l'id change — donc tout
 * appelant qui régénère doit relire, sinon sa trace pointe une ligne supprimée.
 */
export async function trouverDocument(
  tenantId: string,
  sessionId: string,
  docType: DocTypeSignable,
  forme: FormeDocument,
): Promise<DocumentCharge | null> {
  const select = { id: true, pdfUrl: true, hashSha256: true, status: true };

  if (docType === 'CONVENTION' && forme.forme === 'GROUPE') {
    // Les DEUX formes de stockage d'une convention de groupe — source unique
    // `convention-coverage.ts`, jamais un filtre `entityType` écrit à la main.
    return prisma.document.findFirst({
      where: groupConventionAnyShapeWhere(tenantId, sessionId, forme.organizationId),
      orderBy: { createdAt: 'desc' },
      select,
    });
  }

  return prisma.document.findFirst({
    where: {
      tenantId,
      type: docType,
      participantId: forme.forme === 'INDIVIDUEL' ? forme.participantId : undefined,
    },
    orderBy: { createdAt: 'desc' },
    select,
  });
}

export interface DocumentARelacher {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  sessionId: string | null;
  participantId: string | null;
  status: string;
  signedPdfUrl: string | null;
}

/** Les statuts d'avant-envoi, relus du journal, pour chaque document. */
export async function lireStatutsAvantEnvoi(
  tenantId: string,
  documents: readonly DocumentARelacher[],
): Promise<Map<string, string>> {
  const statuts = new Map<string, string>();
  for (const doc of documents) {
    const trace = await prisma.auditLog.findFirst({
      where: { tenantId, entity: 'Document', entityId: doc.id, action: 'signature.sent' },
      orderBy: { createdAt: 'desc' },
      select: { diff: true },
    });
    statuts.set(doc.id, statutAvantEnvoiDuJournal(trace?.diff) ?? STATUT_GENERE);
  }
  return statuts;
}

export interface RelacherInput {
  tenantId: string;
  /** `null` pour un webhook : il n'y a pas d'utilisateur derrière un événement. */
  userId: string | null;
  demande: {
    id: string;
    providerId: string;
    status: string;
    sessionId: string;
    documents: readonly DocumentARelacher[];
  };
  /** Le statut que prend la demande — `CANCELED`, `DECLINED`, `EXPIRED`. */
  statutDemande: 'CANCELED' | 'DECLINED' | 'EXPIRED';
  /** L'action de journal : `signature.canceled`, `signature.declined`, … */
  action: string;
  /** Ce que le journal doit porter en plus (motif, refus, cause). */
  diff: Record<string, unknown>;
  /** Message d'erreur mémorisé sur la demande, quand il y en a un. */
  lastError?: string | null;
  /** L'action de journal de la RÉGÉNÉRATION qui suit, et son motif écrit. */
  regeneration: { action: string; motif: string };
}

/**
 * Rend les pièces à leur état d'avant l'envoi, et journalise.
 *
 * L'ÉCRITURE EST TRANSACTIONNELLE, la régénération suit. Ce découpage n'est pas
 * un choix de confort : la régénération est faite par les générateurs, partagés
 * avec cinq autres appelants (dette ouverte en lot H), et une transaction qui
 * les engloberait tiendrait ouvert le temps d'un rendu PDF.
 */
export async function relacherPieces(input: RelacherInput): Promise<PieceRelachee[]> {
  const { tenantId, userId, demande, statutDemande, action, diff } = input;
  const statutsAvant = await lireStatutsAvantEnvoi(tenantId, demande.documents);

  await prisma.$transaction(async (tx) => {
    await tx.signatureRequest.update({
      where: { id: demande.id },
      data: { status: statutDemande, lastError: input.lastError ?? null },
    });

    for (const doc of demande.documents) {
      const statutRetabli = statutsAvant.get(doc.id) ?? STATUT_GENERE;
      await tx.document.update({
        where: { id: doc.id },
        data: { status: statutRetabli, signatureRequestId: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entity: 'Document',
          entityId: doc.id,
          action,
          diff: {
            ...diff,
            signatureRequestId: demande.id,
            providerId: demande.providerId,
            docType: doc.type,
            status: { before: doc.status, after: statutRetabli },
            demande: { before: demande.status, after: statutDemande },
          } as Prisma.InputJsonValue,
        },
      });
    }
  });

  const pieces: PieceRelachee[] = [];
  for (const doc of demande.documents) {
    const statutRetabli = statutsAvant.get(doc.id) ?? STATUT_GENERE;
    const base = { documentId: doc.id, docType: doc.type, statutRetabli };

    if (doc.signedPdfUrl !== null || statutRetabli === STATUT_SIGNE) {
      pieces.push({ ...base, regeneree: false, raisonNonRegeneree: messagePreuveConservee() });
      continue;
    }

    const forme = formeDuDocumentEnBase(doc);
    if (!estPieceSignable(doc.type) || forme === null) {
      pieces.push({
        ...base,
        regeneree: false,
        raisonNonRegeneree: messageRegenerationApresAnnulationImpossible(
          'la forme de ce document ne dit pas pour qui le régénérer (convention de groupe ' +
            'sans commanditaire porté).',
        ),
      });
      continue;
    }

    const sessionDuDocument = doc.sessionId ?? demande.sessionId;
    const resultat = await REGENERATION_PAR_PIECE[doc.type]({
      tenantId,
      sessionId: sessionDuDocument,
      forme,
      signatureTags: false,
    });
    if (!resultat.ok) {
      pieces.push({
        ...base,
        regeneree: false,
        raisonNonRegeneree: messageRegenerationApresAnnulationImpossible(
          resultat.error ?? 'cause inconnue.',
        ),
      });
      continue;
    }

    // ⚠ Les générateurs REMPLACENT le Document : l'id change. On relit, sinon
    // la trace et le lien rendus pointeraient une ligne supprimée.
    const apres = await trouverDocument(tenantId, sessionDuDocument, doc.type, forme);
    const idApres = apres?.id ?? doc.id;
    pieces.push({ ...base, documentId: idApres, regeneree: true, raisonNonRegeneree: null });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        entity: 'Document',
        entityId: idApres,
        action: input.regeneration.action,
        diff: {
          signatureRequestId: demande.id,
          docType: doc.type,
          motif: input.regeneration.motif,
          documentId: { before: doc.id, after: idApres },
        },
      },
    });
  }
  return pieces;
}
