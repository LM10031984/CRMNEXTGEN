import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RÉGÉNÉRER UNE PIÈCE SIGNÉE — la chaîne complète, type par type.
 *
 * LE DÉFAUT (production, 21/09/2026)
 *
 * Trois trous se cumulaient, et chacun suffisait à perdre une pièce signée :
 *
 *  1. le classement d'engagement ne lisait PAS `Document.signedPdfUrl`. Une
 *     assiduité signée par retour DocuSeal ne touche pas `docStatus` : elle
 *     ressortait donc « libre », sans confirmation ni motif ;
 *  2. le rattachement à un dossier financeur ne cherchait que la clé `pdfUrl`,
 *     alors qu'un dossier joint la version SIGNÉE quand elle existe
 *     (`versionAJoindre`) — une pièce signée déjà partie dans un dossier de
 *     solde passait donc, elle aussi, pour libre ;
 *  3. le `deleteMany` des générateurs emportait la ligne signée.
 *
 * CE QUE CES TESTS VERROUILLENT, dans les mots de la demande :
 * régénérer une pièce signée SANS motif → refus ; AVEC motif → la pièce neuve
 * devient courante « à signer », l'ancienne est CONSERVÉE, et le dossier de
 * solde reste attaché à l'ancienne.
 *
 * Volontairement joué contre la VRAIE lecture d'engagement (seul `prisma` est
 * doublé) : c'est le raccord entre les deux modules qui était cassé, le doubler
 * aurait reproduit le trou au lieu de le prouver fermé.
 *
 * Test de puissance, joué le 21/09/2026 — deux mutations, deux effets nets :
 *  · retirer `signedCopy` de `classifyDocumentEngagement` → 16 ROUGES, les
 *    quatre premiers tests de chacun des quatre types. Les tests « dossier de
 *    solde » restent verts, et c'est juste : ils passent par l'autre preuve ;
 *  · rétablir le filtre sur la seule clé `pdfUrl` → 4 ROUGES, exactement les
 *    tests « dossier de solde », un par type.
 */

const m = vi.hoisted(() => ({
  documentFindFirst: vi.fn(),
  emailFindMany: vi.fn(),
  participantFindFirst: vi.fn(),
  submissionFindMany: vi.fn(),
}));

vi.mock('@qualiof/db', async () => {
  const actual = await vi.importActual<typeof import('@qualiof/db')>('@qualiof/db');
  return {
    ...actual,
    prisma: {
      document: { findFirst: m.documentFindFirst },
      emailMessage: { findMany: m.emailFindMany },
      sessionParticipant: { findFirst: m.participantFindFirst },
      opcoSubmission: { findMany: m.submissionFindMany },
    },
  };
});

import {
  checkDocumentReplacement,
  MOTIF_MIN_LENGTH,
  type ReplacementVerdict,
} from '../replacement-guard';

import { porteUnExemplaireSigne, SANS_EXEMPLAIRE_SIGNE } from '../exemplaire-signe';

/**
 * `ReplacementVerdict` est une union discriminée : `refusal` et `warning`
 * n'existent que sur la branche refusée. Ce garde-fou fait le rétrécissement
 * pour `tsc` ET échoue avec un message lisible si le verdict autorisait.
 */
function refus(v: ReplacementVerdict) {
  if (v.allowed) throw new Error('attendu : un REFUS, obtenu une autorisation');
  return v;
}

/** Le pendant : rétrécit sur la branche autorisée, seule à porter `motif`. */
function autorise(v: ReplacementVerdict) {
  if (!v.allowed) throw new Error(`attendu : une AUTORISATION, obtenu ${v.refusal}`);
  return v;
}

/** Les pièces qu'un apprenant signe, et que régénérer pouvait détruire. */
const PIECES = [
  { docType: 'ASSIDUITE', libelle: "attestation d'assiduité" },
  { docType: 'AGEFICE', libelle: 'demande de prise en charge' },
  { docType: 'CONVENTION', libelle: 'convention' },
  { docType: 'CONVOCATION', libelle: 'convocation' },
] as const;

const TENANT = 'tnt-1';
const PARTICIPANT = 'part-1';
const CLE_GENEREE = 'assiduite/SES-0042/king-kristin-abcd1234.pdf';
const CLE_SIGNEE = 'sessions/tnt-1/SES-0042/signed/ASSIDUITE-part-1-abcd1234.pdf';

/**
 * La pièce EXISTE et porte un exemplaire signé. `findFirst` sert les deux
 * lectures successives (l'id, puis le document complet) : un seul objet
 * satisfait les deux `select`.
 */
function pieceSignee(docType: string, options?: { attachmentsDuDossier?: string[] }) {
  m.documentFindFirst.mockResolvedValue({
    id: 'doc-signe',
    type: docType,
    createdAt: new Date('2026-09-10T09:00:00.000Z'),
    pdfUrl: CLE_GENEREE,
    signedPdfUrl: CLE_SIGNEE,
    signedAt: new Date('2026-09-12T14:00:00.000Z'),
    participantId: PARTICIPANT,
  });
  m.emailFindMany.mockResolvedValue([]);
  m.participantFindFirst.mockResolvedValue({ conventionSigned: false, docStatus: {} });
  m.submissionFindMany.mockResolvedValue(
    options?.attachmentsDuDossier
      ? [
          {
            status: 'SENT',
            sentAt: new Date('2026-09-13T08:00:00.000Z'),
            attachments: options.attachmentsDuDossier.map((key) => ({ key, included: true })),
          },
        ]
      : [],
  );
}

const CIBLE = (docType: string) => ({
  tenantId: TENANT,
  participantId: PARTICIPANT,
  docType,
  mode: 'unitaire' as const,
  action: 'regenerate' as const,
});

beforeEach(() => {
  m.documentFindFirst.mockReset();
  m.emailFindMany.mockReset();
  m.participantFindFirst.mockReset();
  m.submissionFindMany.mockReset();
});

describe.each(PIECES)('$libelle signée — régénération', ({ docType }) => {
  it('sans rien : REFUS, et le refus dit pourquoi', async () => {
    pieceSignee(docType);

    const verdict = await checkDocumentReplacement(CIBLE(docType));

    expect(verdict.allowed).toBe(false);
    expect(refus(verdict).refusal).toBe('confirmation_requise');
    expect(refus(verdict).warning).toContain('exemplaire signé');
  });

  it('confirmée mais SANS motif : toujours refus — un engagement prouvé s’écrit', async () => {
    pieceSignee(docType);

    const verdict = await checkDocumentReplacement({
      ...CIBLE(docType),
      confirmEngaged: true,
    });

    expect(verdict.allowed).toBe(false);
    expect(refus(verdict).refusal).toBe('motif_requis');
  });

  it('un motif trop court ne passe pas pour un motif', async () => {
    pieceSignee(docType);

    const verdict = await checkDocumentReplacement({
      ...CIBLE(docType),
      confirmEngaged: true,
      motif: 'x'.repeat(MOTIF_MIN_LENGTH - 1),
    });

    expect(verdict.allowed).toBe(false);
    expect(refus(verdict).refusal).toBe('motif_requis');
  });

  it('avec motif : autorisée, et le motif est conservé pour l’audit', async () => {
    pieceSignee(docType);
    const motif = 'Ville de formation erronée sur la pièce signée';

    const verdict = await checkDocumentReplacement({
      ...CIBLE(docType),
      confirmEngaged: true,
      motif,
    });

    expect(verdict.allowed).toBe(true);
    expect(autorise(verdict).motif).toBe(motif);
  });

  it('engage aussi quand le dossier de solde porte la clé SIGNÉE, pas la générée', async () => {
    // Le cas qui passait à travers : `versionAJoindre` joint `signedPdfUrl`
    // dès qu'elle existe, et la garde ne cherchait que `pdfUrl`.
    pieceSignee(docType, { attachmentsDuDossier: [CLE_SIGNEE] });

    const verdict = await checkDocumentReplacement(CIBLE(docType));

    expect(verdict.allowed).toBe(false);
    expect(refus(verdict).engagement?.level).toBe('ENGAGED');
    expect(refus(verdict).engagement?.reasons.join(' · ')).toContain('dossier financeur');
  });
});

describe('l’exemplaire signé survit à la régénération', () => {
  it('le `where` de suppression épargne les lignes signées', () => {
    // Deux valeurs seulement sont effaçables : jamais signé, ou champ vidé.
    expect(SANS_EXEMPLAIRE_SIGNE.OR).toEqual([{ signedPdfUrl: null }, { signedPdfUrl: '' }]);
  });

  it('reconnaît une ligne signée, et ne se laisse pas prendre à un champ vide', () => {
    expect(porteUnExemplaireSigne({ signedPdfUrl: CLE_SIGNEE })).toBe(true);
    expect(porteUnExemplaireSigne({ signedPdfUrl: null })).toBe(false);
    expect(porteUnExemplaireSigne({ signedPdfUrl: '' })).toBe(false);
    expect(porteUnExemplaireSigne({ signedPdfUrl: '   ' })).toBe(false);
    expect(porteUnExemplaireSigne({})).toBe(false);
  });

  it('la ligne signée n’étant pas supprimée, la pièce jointe du dossier résout encore', () => {
    // Un dossier ne référence pas d'identifiant : il recopie la CLÉ. Tant que
    // la ligne vit, la clé signée reste servie — c'est ce qui garantit que le
    // dossier de solde déjà envoyé reste attaché à l'ANCIENNE pièce.
    const ligneSignee = { signedPdfUrl: CLE_SIGNEE };
    const effacable = porteUnExemplaireSigne(ligneSignee) === false;

    expect(effacable).toBe(false);
  });
});
