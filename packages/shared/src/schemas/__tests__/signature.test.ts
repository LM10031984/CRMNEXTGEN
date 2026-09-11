import { describe, it, expect } from 'vitest';

/**
 * Lot B — contrats partagés de la signature électronique
 * (spec 2026-09-04 §4.2 + §5 lot B, D-1).
 *
 * Deux contrats vivent ici parce que le serveur ET le client les lisent :
 *  1. `tenantSignatorySchema` — le signataire OF (nom, email, qualité, ordre),
 *     édité dans Paramètres organisme (D-1). Le champ vide est légitime : il
 *     fait retomber sur le responsable OF déjà configuré (`OF_RESP_*`).
 *  2. `signatureSignersSchema` — le contenu de la colonne Json
 *     `SignatureRequest.signers`. Une colonne Json sans schéma est une dette :
 *     `parseSignatureSigners` est le seul point d'entrée autorisé en lecture,
 *     et il ne fait JAMAIS tomber une page à cause d'une ligne mal formée.
 */

import {
  tenantSignatorySchema,
  signatureSignersSchema,
  parseSignatureSigners,
  signatureSignerSchema,
} from '../signature';

describe('tenantSignatorySchema — signataire OF (D-1)', () => {
  it('accepte un signataire complet', () => {
    const r = tenantSignatorySchema.safeParse({
      signatoryName: 'Laurent MARX',
      signatoryEmail: 'laurent@start-academy.fr',
      signatoryTitle: 'Gérant',
      signatoryOrder: 'AFTER',
    });
    expect(r.success).toBe(true);
  });

  it('l’OF signe APRÈS le client par défaut (D-3)', () => {
    const r = tenantSignatorySchema.parse({
      signatoryName: '',
      signatoryEmail: '',
      signatoryTitle: '',
    });
    expect(r.signatoryOrder).toBe('AFTER');
  });

  it('accepte les champs vides — retour au fallback ENV OF_RESP_*', () => {
    const r = tenantSignatorySchema.safeParse({
      signatoryName: '',
      signatoryEmail: '',
      signatoryTitle: '',
      signatoryOrder: 'AFTER',
    });
    expect(r.success).toBe(true);
  });

  it('refuse un email mal formé (une convention partirait dans le vide)', () => {
    const r = tenantSignatorySchema.safeParse({
      signatoryName: 'Laurent MARX',
      signatoryEmail: 'laurent(at)start-academy.fr',
      signatoryTitle: '',
      signatoryOrder: 'AFTER',
    });
    expect(r.success).toBe(false);
  });

  it('refuse un ordre de signature inconnu', () => {
    const r = tenantSignatorySchema.safeParse({
      signatoryName: '',
      signatoryEmail: '',
      signatoryTitle: '',
      signatoryOrder: 'PARALLELE',
    });
    expect(r.success).toBe(false);
  });
});

describe('signers — contrat de la colonne Json', () => {
  const signer = {
    role: 'Client',
    name: 'Marie Dupont',
    email: 'dirigeant@agence.fr',
    providerSignerId: '501',
    status: 'sent',
    signedAt: null,
    signUrl: 'https://docuseal.com/s/abc',
  };

  it('valide une liste de signataires', () => {
    expect(signatureSignersSchema.safeParse([signer]).success).toBe(true);
  });

  it('parseSignatureSigners relit ce qui a été écrit', () => {
    expect(parseSignatureSigners([signer])).toEqual([{ ...signer, declinedAt: null }]);
  });

  /**
   * ⚠ LA RÈGLE DU LOT C.3, ET L'INCIDENT QU'ELLE ÉVITE.
   *
   * `parseSignatureSigners` écarte SANS BRUIT tout élément qui ne parse pas —
   * c'est voulu : une fiche session ne doit pas tomber en erreur parce qu'un
   * webhook a écrit une ligne inattendue. Le revers est un piège SILENCIEUX :
   * ajouter au schéma un champ **requis** invalide d'un coup TOUTES les lignes
   * déjà en base, écrites avant que le champ existe. Elles ne lèvent pas
   * d'erreur — elles DISPARAISSENT. L'écran affiche un envoi sans aucun
   * signataire, la relance ne trouve personne, et rien dans les logs ne le dit.
   *
   * LA RÈGLE : tout nouveau champ de signataire est `.optional()` AVEC
   * `.default(...)`, jamais `.min(1)` nu.
   *
   * LA GARDE : ce test. La fixture porte EXACTEMENT les sept champs écrits par
   * le lot C.2a — la forme réellement présente en base aujourd'hui, pas un
   * objet recopié du schéma courant. Une fixture recopiée du nouveau schéma
   * porterait le champ neuf, donc passerait quoi qu'il arrive et ne garderait
   * rien.
   */
  const FORME_EN_BASE_C2A = {
    role: 'Client',
    name: 'Paul MARTIN',
    email: 'paul@agence-martin.fr',
    providerSignerId: 'sg-1',
    status: 'sent',
    signedAt: null,
    signUrl: 'https://docuseal.eu/s/abc',
  };

  it('RÈGLE C.3 — un signataire de la forme C.2a (7 champs) SURVIT et ressort complété', () => {
    const relus = parseSignatureSigners([FORME_EN_BASE_C2A]);
    expect(relus).toHaveLength(1);
    expect(relus[0]!.role).toBe('Client');
    expect(relus[0]!.email).toBe('paul@agence-martin.fr');
    // Le champ neuf est REÇU avec son défaut, jamais exigé.
    expect(relus[0]!.declinedAt).toBe(null);
  });

  it('RÈGLE C.3 — les sept champs de C.2a suffisent : aucun champ ajouté depuis n’est requis', () => {
    // Test de PUISSANCE de la règle : on énumère la forme minimale et on exige
    // qu'elle passe. Le jour où quelqu'un ajoutera un champ requis, cette
    // assertion rougira AVANT que les lignes de production disparaissent.
    expect(signatureSignerSchema.safeParse(FORME_EN_BASE_C2A).success).toBe(true);
    expect(Object.keys(FORME_EN_BASE_C2A)).toHaveLength(7);
  });

  it('un `declinedAt` écrit par le webhook est relu tel quel', () => {
    const refuse = { ...FORME_EN_BASE_C2A, declinedAt: '2026-09-20T14:30:00.000Z' };
    expect(parseSignatureSigners([refuse])[0]!.declinedAt).toBe('2026-09-20T14:30:00.000Z');
  });

  it('une ligne mal formée est écartée, pas propagée — jamais de page en erreur', () => {
    expect(parseSignatureSigners([signer, { role: 'Client' }, 42, null])).toEqual([
      { ...signer, declinedAt: null },
    ]);
  });

  it('une valeur qui n’est pas un tableau rend une liste vide', () => {
    expect(parseSignatureSigners(null)).toEqual([]);
    expect(parseSignatureSigners({ role: 'Client' })).toEqual([]);
    expect(parseSignatureSigners('[]')).toEqual([]);
  });
});
