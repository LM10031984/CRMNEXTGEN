import { describe, it, expect } from 'vitest';

/**
 * Le RETOUR du prestataire, côté décision PURE — lot C.3.
 *
 * CE QUE CE FICHIER GARDE. Le webhook fait trois choses irréversibles :
 * il écrit un `signedAt` dans une colonne Json, il décide du statut d'une
 * demande, et il décide QUI reçoit l'email suivant. Les trois sont des
 * décisions, pas des écritures — elles vivent donc ici, sans base ni réseau,
 * et l'orchestrateur n'a plus qu'à appliquer.
 *
 * ⚠ LE PIÈGE DE CE LOT : un signataire RETROUVÉ PAR DEVINETTE. Le prestataire
 * envoie tantôt un id de signataire, tantôt seulement un email. Se rabattre sur
 * « le premier qui n'a pas signé » poserait la signature du client sur la ligne
 * de l'organisme le jour où les deux événements arrivent dans le désordre — et
 * le certificat, lui, dirait autre chose.
 */

import type { SignatureSigner } from '@qualiof/shared';
import {
  appliquerRefus,
  appliquerSignature,
  cheminsSigne,
  prochainAPrevenir,
  statutApresRetour,
  trouverSignataire,
} from '../retour';

function signataire(over: Partial<SignatureSigner> = {}): SignatureSigner {
  return {
    role: 'Client',
    name: 'Claire DUPONT',
    email: 'claire@agence.fr',
    providerSignerId: 'sg-client',
    status: 'sent',
    signedAt: null,
    signUrl: 'https://docuseal.eu/s/CLIENT',
    declinedAt: null,
    ...over,
  };
}

const CLIENT = signataire();
const OF = signataire({
  role: 'Organisme de formation',
  name: 'Laurent Marx',
  email: 'laurent@start-academy.fr',
  providerSignerId: 'sg-of',
  signUrl: 'https://docuseal.eu/s/OF',
});

const LE_20 = new Date('2026-09-20T14:30:00.000Z');

// ─────────────────────────────────────────────────────────────────────────────

describe('trouverSignataire — retrouvé, jamais deviné', () => {
  it("l'identifiant du prestataire fait foi", () => {
    const t = trouverSignataire([CLIENT, OF], { signerId: 'sg-of', email: null });
    expect(t?.role).toBe('Organisme de formation');
  });

  it("à défaut d'identifiant, l'email — insensible à la casse et aux espaces", () => {
    const t = trouverSignataire([CLIENT, OF], {
      signerId: null,
      email: '  LAURENT@Start-Academy.FR ',
    });
    expect(t?.providerSignerId).toBe('sg-of');
  });

  it("l'identifiant PRIME sur l'email quand les deux sont là", () => {
    const t = trouverSignataire([CLIENT, OF], { signerId: 'sg-client', email: 'laurent@start-academy.fr' });
    expect(t?.providerSignerId).toBe('sg-client');
  });

  it('PUISSANCE — aucun des deux ne correspond ⇒ `null`, JAMAIS un repli sur le premier', () => {
    // Se rabattre sur « le premier qui n'a pas signé » poserait la signature du
    // client sur la ligne de l'organisme si les événements arrivaient dans le
    // désordre. Mieux vaut ne rien écrire et le dire.
    expect(trouverSignataire([CLIENT, OF], { signerId: 'sg-inconnu', email: null })).toBe(null);
    expect(trouverSignataire([CLIENT, OF], { signerId: null, email: 'inconnu@ailleurs.fr' })).toBe(null);
    expect(trouverSignataire([CLIENT, OF], { signerId: null, email: null })).toBe(null);
  });

  it('PUISSANCE — un identifiant fait d’espaces n’identifie personne', () => {
    expect(trouverSignataire([CLIENT, OF], { signerId: '   ', email: null })).toBe(null);
  });
});

describe('appliquerSignature — une ligne change, les autres sont intactes', () => {
  it('pose `signedAt` en ISO et passe le statut du signataire à `completed`', () => {
    const apres = appliquerSignature([CLIENT, OF], CLIENT, LE_20);
    expect(apres[0]!.signedAt).toBe('2026-09-20T14:30:00.000Z');
    expect(apres[0]!.status).toBe('completed');
  });

  it('PUISSANCE — l’AUTRE signataire n’est pas touché', () => {
    const apres = appliquerSignature([CLIENT, OF], CLIENT, LE_20);
    expect(apres[1]).toEqual(OF);
  });

  it('PUISSANCE — l’ordre de la liste est préservé : c’est l’ordre de signature', () => {
    const apres = appliquerSignature([CLIENT, OF], OF, LE_20);
    expect(apres.map((s) => s.providerSignerId)).toEqual(['sg-client', 'sg-of']);
  });

  it('une signature DÉJÀ posée n’est pas réécrite — le premier horodatage fait foi', () => {
    const dejaSigne = signataire({ signedAt: '2026-09-19T08:00:00.000Z', status: 'completed' });
    const apres = appliquerSignature([dejaSigne, OF], dejaSigne, LE_20);
    expect(apres[0]!.signedAt).toBe('2026-09-19T08:00:00.000Z');
  });
});

describe('appliquerRefus — le refus est daté, la signature reste vide', () => {
  it('pose `declinedAt` et le statut `declined`, sans toucher `signedAt`', () => {
    const apres = appliquerRefus([CLIENT, OF], CLIENT, LE_20);
    expect(apres[0]!.declinedAt).toBe('2026-09-20T14:30:00.000Z');
    expect(apres[0]!.status).toBe('declined');
    expect(apres[0]!.signedAt).toBe(null);
  });
});

describe('statutApresRetour — le statut de la demande se DÉDUIT des signataires', () => {
  it('personne n’a signé ⇒ SENT', () => {
    expect(statutApresRetour([CLIENT, OF])).toBe('SENT');
  });

  it('un sur deux ⇒ PARTIALLY_SIGNED', () => {
    expect(statutApresRetour([signataire({ signedAt: '2026-09-20T14:30:00.000Z' }), OF])).toBe(
      'PARTIALLY_SIGNED',
    );
  });

  it('tous ⇒ DONE', () => {
    const tous = [CLIENT, OF].map((s) => ({ ...s, signedAt: '2026-09-20T14:30:00.000Z' }));
    expect(statutApresRetour(tous)).toBe('DONE');
  });

  it('un seul signataire qui a signé ⇒ DONE (le dossier AGEFICE n’en a qu’un)', () => {
    expect(statutApresRetour([{ ...CLIENT, signedAt: '2026-09-20T14:30:00.000Z' }])).toBe('DONE');
  });

  it('PUISSANCE — un REFUS n’est pas une signature : jamais DONE', () => {
    const refus = [
      { ...CLIENT, signedAt: '2026-09-20T14:30:00.000Z' },
      { ...OF, declinedAt: '2026-09-20T15:00:00.000Z' },
    ];
    expect(statutApresRetour(refus)).toBe('PARTIALLY_SIGNED');
  });

  it('PUISSANCE — une liste VIDE ne vaut pas « tout le monde a signé »', () => {
    // `[].every(…)` vaut `true` : sans cette garde, une demande sans signataire
    // ressortirait DONE et le webhook irait chercher un PDF signé qui n'existe pas.
    expect(statutApresRetour([])).toBe('SENT');
  });
});

describe('prochainAPrevenir — celui dont c’est le tour, maintenant', () => {
  it('le client vient de signer ⇒ c’est l’organisme qu’on prévient', () => {
    const apres = appliquerSignature([CLIENT, OF], CLIENT, LE_20);
    expect(prochainAPrevenir(apres)?.providerSignerId).toBe('sg-of');
  });

  it('tout le monde a signé ⇒ personne à prévenir', () => {
    const tous = [CLIENT, OF].map((s) => ({ ...s, signedAt: '2026-09-20T14:30:00.000Z' }));
    expect(prochainAPrevenir(tous)).toBe(null);
  });

  it('PUISSANCE — un signataire SANS LIEN n’est pas prévenu : « signez ici » sans lien est pire que rien', () => {
    const sansLien = { ...OF, signUrl: null };
    const apres = appliquerSignature([CLIENT, sansLien], CLIENT, LE_20);
    expect(prochainAPrevenir(apres)).toBe(null);
  });

  it('PUISSANCE — un signataire qui a REFUSÉ n’est pas « le prochain »', () => {
    const refuse = { ...OF, declinedAt: '2026-09-20T15:00:00.000Z' };
    expect(prochainAPrevenir([{ ...CLIENT, signedAt: '2026-09-20T14:30:00.000Z' }, refuse])).toBe(
      null,
    );
  });

  it('PUISSANCE — c’est le PREMIER non signataire de la liste, pas n’importe lequel', () => {
    const trois = [
      { ...CLIENT, signedAt: '2026-09-20T14:30:00.000Z' },
      { ...OF, providerSignerId: 'sg-2', signUrl: 'https://docuseal.eu/s/DEUX' },
      { ...OF, providerSignerId: 'sg-3', signUrl: 'https://docuseal.eu/s/TROIS' },
    ];
    expect(prochainAPrevenir(trois)?.providerSignerId).toBe('sg-2');
  });
});

describe('cheminsSigne — §4.4, et le certificat À CÔTÉ du PDF', () => {
  it('le PDF signé suit la convention du lot A', () => {
    const c = cheminsSigne({
      tenantId: 'tenant-1',
      sessionCode: 'SES-0048',
      docType: 'CONVENTION',
      entityId: 'org-1',
      sha8: 'deadbeef',
    });
    expect(c.pdf).toBe('sessions/tenant-1/SES-0048/signed/CONVENTION-org-1-deadbeef.pdf');
  });

  it('le certificat porte le MÊME nom, suffixé `.audit-trail.pdf`', () => {
    const c = cheminsSigne({
      tenantId: 'tenant-1',
      sessionCode: 'SES-0048',
      docType: 'CONVENTION',
      entityId: 'org-1',
      sha8: 'deadbeef',
    });
    expect(c.auditTrail).toBe(
      'sessions/tenant-1/SES-0048/signed/CONVENTION-org-1-deadbeef.audit-trail.pdf',
    );
  });

  it('PUISSANCE — un code de session exotique est assaini, jamais propagé dans une clé', () => {
    const c = cheminsSigne({
      tenantId: 'tenant-1',
      sessionCode: 'SES/0048 été',
      docType: 'AGEFICE',
      entityId: 'part-1',
      sha8: 'abc12345',
    });
    // Les accents tombent AUSSI : la classe autorisée est [A-Za-z0-9_-], et
    // une clé de bucket qui porterait un « é » se comporterait différemment
    // selon le fournisseur de stockage. Même règle qu'au lot A, à la lettre.
    expect(c.pdf).toBe('sessions/tenant-1/SES_0048__t_/signed/AGEFICE-part-1-abc12345.pdf');
  });
});
