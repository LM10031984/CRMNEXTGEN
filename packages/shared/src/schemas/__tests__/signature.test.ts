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
    expect(parseSignatureSigners([signer])).toEqual([signer]);
  });

  it('une ligne mal formée est écartée, pas propagée — jamais de page en erreur', () => {
    expect(parseSignatureSigners([signer, { role: 'Client' }, 42, null])).toEqual([signer]);
  });

  it('une valeur qui n’est pas un tableau rend une liste vide', () => {
    expect(parseSignatureSigners(null)).toEqual([]);
    expect(parseSignatureSigners({ role: 'Client' })).toEqual([]);
    expect(parseSignatureSigners('[]')).toEqual([]);
  });
});
