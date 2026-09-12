import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `notifierSignataire` — le SEUL point d'envoi de la chaîne de signature.
 *
 * CE QUE CE FICHIER GARDE, ET POURQUOI. Trois choses se décident ici, et
 * chacune s'est déjà trompée ailleurs dans ce chantier :
 *
 *  1. QUI est prévenu. `signataires[0]`, parce que la liste est déjà triée par
 *     ordre de signature. Chercher « celui dont la partie vaut CLIENT » serait
 *     une SECONDE règle : avec `signatoryOrder = BEFORE`, c'est l'organisme qui
 *     signe en premier, et prévenir le client à sa place lui enverrait un lien
 *     qui ne s'ouvrira qu'après le passage de l'autre.
 *  2. COMMENT on le nomme. La qualité vient du RÉGIME (`SignerRole`), jamais du
 *     nom d'ancre : le gabarit de convention n'écrit que `Client`, y compris
 *     pour un indépendant qui signe pour lui-même. C'est l'amendement n°6 du
 *     lot C, revenu par la porte du vocabulaire.
 *  3. CE QU'ON DIT quand ça ne part pas. Quatre motifs distincts, parce qu'ils
 *     n'appellent pas le même geste.
 */

const { sendMailMock, auditLogCreate } = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
  auditLogCreate: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({ prisma: { auditLog: { create: auditLogCreate } } }));
vi.mock('@/lib/mailer', () => ({ sendMail: sendMailMock }));

import type { OfConfig } from '@/lib/of-config';
import { notifierSignataire } from '../notifier';
import type { SignataireEnvoye } from '../envoi-contrats';

const OF = {
  name: 'Start Academy',
  siret: '12345678900011',
  rnq: '11755555555',
  addressFull: '10 rue des Tests, 75000 Paris',
} as unknown as OfConfig;

const EMAIL_CLIENT = 'responsable@agence.fr';
const EMAIL_OF = 'laurent@start-academy.fr';

const CLIENT: SignataireEnvoye = {
  partie: 'CLIENT',
  role: 'Client',
  nom: 'Claire DUPONT',
  email: EMAIL_CLIENT,
  signUrl: 'https://docuseal.eu/s/CLIENT-1',
  signedAt: null,
};

const OF_SIGNATAIRE: SignataireEnvoye = {
  partie: 'OF',
  role: 'Organisme de formation',
  nom: 'Laurent MARX',
  email: EMAIL_OF,
  signUrl: 'https://docuseal.eu/s/OF-1',
  signedAt: null,
};

function args(over: Partial<Parameters<typeof notifierSignataire>[0]> = {}) {
  return {
    tenantId: 'tenant-1',
    sessionId: 'ses-1',
    signatureRequestId: 'req-1',
    documentId: 'doc-1',
    libellePiece: 'Convention — AGENCE MARTIN (2 participants)',
    piece: 'CONVENTION' as const,
    concerne: 'AGENCE MARTIN',
    organisation: 'AGENCE MARTIN' as string | null,
    formationTitre: "L'IA au service de l'agent commercial",
    sessionCode: 'SES-0048',
    dateLimite: new Date('2026-10-11T09:00:00.000Z'),
    role: 'DIRIGEANT' as const,
    signataires: [CLIENT, OF_SIGNATAIRE],
    of: OF,
    signataireOfNom: 'Laurent Marx' as string | null,
    ...over,
  };
}

/** L'argument réellement passé à `sendMail`. */
function envoiFait() {
  return sendMailMock.mock.calls[0]![0] as {
    to: string;
    subject: string;
    html: string;
    text: string;
    context: { category: string; tenantId: string; sessionId?: string | null;
      documentIds?: string[]; relatedEntity?: string | null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMailMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });
  auditLogCreate.mockResolvedValue({ id: 'audit-1' });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('T2.4 — on prévient CELUI DONT C’EST LE TOUR (D-3/D-8)', () => {
  it('ordre AFTER (client d’abord) ⇒ l’email part à l’adresse du CLIENT', async () => {
    const r = await notifierSignataire(args({ signataires: [CLIENT, OF_SIGNATAIRE] }));
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(envoiFait().to).toBe('responsable@agence.fr');
    expect(r).toEqual({
      envoye: true,
      destinataire: 'responsable@agence.fr',
      partie: 'CLIENT',
      motif: null,
    });
  });

  it('ordre BEFORE (organisme d’abord) ⇒ l’email part à l’adresse de l’ORGANISME', async () => {
    const r = await notifierSignataire(args({ signataires: [OF_SIGNATAIRE, CLIENT] }));
    expect(envoiFait().to).toBe('laurent@start-academy.fr');
    expect(r.partie).toBe('OF');
  });

  it('le gabarit suit la partie : « À votre tour de signer » pour l’organisme', async () => {
    await notifierSignataire(args({ signataires: [OF_SIGNATAIRE, CLIENT] }));
    expect(envoiFait().subject).toBe(
      'À votre tour de signer — Convention — AGENCE MARTIN (2 participants)',
    );
  });

  it('…et « Convention à signer — {organisation} » pour le bénéficiaire', async () => {
    await notifierSignataire(args());
    expect(envoiFait().subject).toBe('Convention à signer — AGENCE MARTIN');
  });

  it('PUISSANCE — un seul email par pièce, jamais un par signataire', async () => {
    await notifierSignataire(args());
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('le lien envoyé est celui du signataire prévenu, pas celui de l’autre', async () => {
    await notifierSignataire(args({ signataires: [OF_SIGNATAIRE, CLIENT] }));
    expect(envoiFait().html).toContain('https://docuseal.eu/s/OF-1');
    expect(envoiFait().html).not.toContain('https://docuseal.eu/s/CLIENT-1');
  });
});

describe('T2.5 / T2.11 — le contexte de l’envoi', () => {
  it('T2.5 — la catégorie est « signature », littéralement', async () => {
    await notifierSignataire(args());
    expect(envoiFait().context.category).toBe('signature');
  });

  it('le tenant et la session voyagent avec — le mode session témoin en dépend', async () => {
    await notifierSignataire(args());
    expect(envoiFait().context.tenantId).toBe('tenant-1');
    expect(envoiFait().context.sessionId).toBe('ses-1');
  });

  it('la demande est rattachée, pour qu’on retrouve l’email depuis elle', async () => {
    await notifierSignataire(args());
    expect(envoiFait().context.relatedEntity).toBe('signatureRequest:req-1');
  });

  it('T2.11 — AUCUN `documentIds` : c’est un LIEN qui part, pas un PDF', async () => {
    await notifierSignataire(args());
    // Une ligne `EmailMessage` affirmerait qu'un document a quitté la maison,
    // et c'est elle qui gèle ensuite la régénération d'un document « engagé ».
    const ids = envoiFait().context.documentIds;
    expect(ids === undefined || ids.length === 0).toBe(true);
  });
});

describe('T2.6 / T2.7 — ce qu’on dit quand ça ne part PAS', () => {
  it('T2.6 — catégorie décochée (dryRun + suppressed) ⇒ motif `categorie-decochee`', async () => {
    sendMailMock.mockResolvedValue({ ok: true, dryRun: true, suppressed: true });
    const r = await notifierSignataire(args());
    expect(r).toEqual({
      envoye: false,
      destinataire: 'responsable@agence.fr',
      partie: 'CLIENT',
      motif: 'categorie-decochee',
    });
  });

  it('T2.6 bis — SMTP absent (dryRun SEUL) ⇒ motif `dry-run-env`, pas le même geste', async () => {
    sendMailMock.mockResolvedValue({ ok: true, dryRun: true });
    expect((await notifierSignataire(args())).motif).toBe('dry-run-env');
  });

  it('SMTP qui refuse ⇒ motif `erreur-smtp`', async () => {
    sendMailMock.mockResolvedValue({ ok: false, error: 'connexion refusée' });
    expect((await notifierSignataire(args())).motif).toBe('erreur-smtp');
  });

  it('T2.7 — pas de lien, pas d’email : `sendMail` n’est JAMAIS appelé', async () => {
    const r = await notifierSignataire(
      args({ signataires: [{ ...CLIENT, signUrl: null }, OF_SIGNATAIRE] }),
    );
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(r.motif).toBe('aucun-lien');
    expect(r.envoye).toBe(false);
  });

  it('PUISSANCE — un lien fait d’espaces est un lien ABSENT', async () => {
    const r = await notifierSignataire(
      args({ signataires: [{ ...CLIENT, signUrl: '   ' }, OF_SIGNATAIRE] }),
    );
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(r.motif).toBe('aucun-lien');
  });
});

describe('T2.13 — la qualité est REÇUE du régime, jamais devinée depuis l’ancre', () => {
  it('role STAGIAIRE sur une ancre `Client` ⇒ le corps dit « stagiaire »', async () => {
    // Le cas de l'indépendant qui signe sa propre convention : l'ancre du
    // gabarit dit `Client` (elle ne sait rien du régime), le régime dit
    // STAGIAIRE. Dériver de l'ancre l'appellerait « responsable de
    // l'organisation » — un mot faux dans une pièce que lira un financeur.
    await notifierSignataire(args({ role: 'STAGIAIRE' }));
    expect(envoiFait().html).toContain('stagiaire');
    expect(envoiFait().html).not.toContain('responsable de l&#39;organisation');
  });

  it('role DIRIGEANT ⇒ « responsable de {organisation} », et jamais « dirigeant »', async () => {
    await notifierSignataire(args({ role: 'DIRIGEANT' }));
    const { subject, html, text } = envoiFait();
    expect(text).toContain('Vous recevez ce message en tant que responsable de AGENCE MARTIN.');
    for (const t of [subject, html, text]) expect(t.toLowerCase()).not.toContain('dirigeant');
  });

  it('côté ORGANISME, le régime ne décide rien : c’est le signataire de l’organisme', async () => {
    await notifierSignataire(args({ role: 'STAGIAIRE', signataires: [OF_SIGNATAIRE, CLIENT] }));
    expect(envoiFait().html).toContain('signataire de l&#39;organisme de formation');
  });
});

describe('CÂBLAGE — les quatre valeurs qui traversent depuis le plan et les réglages', () => {
  /**
   * ⚠ CES QUATRE TESTS GARDENT LE FIL, pas le calcul. `piece`, `concerne`,
   * `organisation` et `signataireOfNom` sont calculés ailleurs (plan d'envoi,
   * résolution du signataire OF) et rendus ici. Chacun est OBLIGATOIRE dans la
   * signature — `tsc` attrape l'oubli — mais `tsc` ne voit pas la SUBSTITUTION :
   * passer `concerne: ''` compile parfaitement et produit un objet d'email
   * tronqué. D'où des assertions sur la valeur RÉELLEMENT rendue.
   */
  it('`piece` décide de l’objet : AGEFICE ne dit pas « Convention »', async () => {
    await notifierSignataire(args({ piece: 'AGEFICE', concerne: 'Marie EXEMPLE' }));
    expect(envoiFait().subject).toBe('Dossier AGEFICE à signer — Marie EXEMPLE');
  });

  it('`piece` ASSIDUITE ⇒ « Attestation d’assiduité à signer — … »', async () => {
    await notifierSignataire(args({ piece: 'ASSIDUITE', concerne: 'Marie EXEMPLE' }));
    expect(envoiFait().subject).toBe("Attestation d'assiduité à signer — Marie EXEMPLE");
  });

  it('`concerne` est ce que l’objet nomme — pas le libellé du plan', async () => {
    await notifierSignataire(args({ concerne: 'PROVENCE IMMOBILIER' }));
    expect(envoiFait().subject).toBe('Convention à signer — PROVENCE IMMOBILIER');
    // Le libellé du plan, lui, reste dans le CORPS : c'est là qu'il sert.
    expect(envoiFait().text).toContain('Convention — AGENCE MARTIN (2 participants)');
  });

  it('`organisation` est ce que la phrase de rôle nomme', async () => {
    await notifierSignataire(args({ organisation: 'PROVENCE IMMOBILIER' }));
    expect(envoiFait().text).toContain(
      'Vous recevez ce message en tant que responsable de PROVENCE IMMOBILIER.',
    );
  });

  it('PUISSANCE — organisation inconnue ⇒ repli, jamais « responsable de null »', async () => {
    await notifierSignataire(args({ organisation: null }));
    const { text, html } = envoiFait();
    expect(text).toContain("Vous recevez ce message en tant que responsable de l'organisation.");
    expect(text).not.toContain('null');
    expect(html).not.toContain('null');
  });

  it('`signataireOfNom` SIGNE l’email — la même personne que celle qui signe le PDF', async () => {
    await notifierSignataire(args({ signataireOfNom: 'Laurent Marx' }));
    expect(envoiFait().text).toContain('Laurent Marx — Start Academy');
    expect(envoiFait().text).not.toContain("L'équipe");
  });

  it('PUISSANCE — sans signataire tenant, on retombe sur le responsable d’of-config', async () => {
    const ofAvecResp = {
      ...OF,
      resp: { prenom: 'Jean-Guy', nom: 'BLANCHON', phone: '04 93 00 00 00' },
    } as unknown as typeof OF;
    await notifierSignataire(args({ signataireOfNom: null, of: ofAvecResp }));
    expect(envoiFait().text).toContain('Jean-Guy BLANCHON — Start Academy');
    expect(envoiFait().text).toContain('04 93 00 00 00');
  });

  it('PUISSANCE — sans personne nommable, l’organisme signe : jamais un email anonyme', async () => {
    await notifierSignataire(args({ signataireOfNom: null }));
    expect(envoiFait().text).toContain('Start Academy — Start Academy');
  });
});

describe('la trace — en clair dans le journal, masquée dans les logs', () => {
  it('écrit `signature.notified` avec le destinataire EN CLAIR', async () => {
    await notifierSignataire(args());
    expect(auditLogCreate).toHaveBeenCalledTimes(1);
    const trace = auditLogCreate.mock.calls[0]![0] as {
      data: { action: string; entity: string; entityId: string; diff: Record<string, unknown> };
    };
    expect(trace.data.action).toBe('signature.notified');
    expect(trace.data.entity).toBe('Document');
    expect(trace.data.entityId).toBe('doc-1');
    // Comme `signature.sent` : un journal d'audit qui masque ne prouve plus rien.
    expect(trace.data.diff).toMatchObject({
      destinataire: 'responsable@agence.fr',
      partie: 'CLIENT',
      envoye: true,
      motif: null,
      signatureRequestId: 'req-1',
    });
  });

  it('trace aussi les NON-envois — sinon un silence ne laisse aucune trace', async () => {
    sendMailMock.mockResolvedValue({ ok: true, dryRun: true, suppressed: true });
    await notifierSignataire(args());
    const trace = auditLogCreate.mock.calls[0]![0] as { data: { diff: Record<string, unknown> } };
    expect(trace.data.diff).toMatchObject({ envoye: false, motif: 'categorie-decochee' });
  });

  it('PUISSANCE — une trace qui échoue ne fait PAS échouer l’email', async () => {
    auditLogCreate.mockRejectedValue(new Error('base indisponible'));
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await notifierSignataire(args());
    expect(r.envoye).toBe(true);
    erreur.mockRestore();
  });

  it('T2.9 — aucun `console.*` ne porte l’adresse complète', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    auditLogCreate.mockRejectedValue(new Error('base indisponible'));

    await notifierSignataire(args());

    const sorties = [...log.mock.calls, ...erreur.mock.calls].flat().map((x) => String(x));
    for (const sortie of sorties) expect(sortie).not.toContain('responsable@agence.fr');
    log.mockRestore();
    erreur.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
