import { describe, it, expect } from 'vitest';
import { MockEInvoicePlatform } from '../adapters/mock';

/**
 * Lot 1 — l'adaptateur par défaut.
 *
 * Ce qui compte ici n'est pas qu'il « marche » : c'est qu'il **n'émette rien**
 * et qu'il ne raconte rien. Un mock qui simulerait une progression de statuts
 * donnerait une fausse confiance sur un raccordement à une plateforme d'État
 * qui n'existe pas encore.
 */

const doc = (content: Buffer, externalId = 'FAC-000123') =>
  ({ content, contentType: 'application/pdf', externalId }) as const;

describe('adaptateur mock — il ne prétend rien', () => {
  const platform = new MockEInvoicePlatform();

  it('se nomme MOCK : la transmission stockée dira la vérité sur son origine', () => {
    expect(platform.name).toBe('MOCK');
  });

  it('ne rend aucun événement — rien n’a été transmis, rien ne peut avoir bougé', async () => {
    const r = await platform.pollEvents();
    expect(r.events).toEqual([]);
    expect(r.hasMore).toBe(false);
  });

  it('rend un annuaire vide : le client n’est pas joignable, on reste sur l’email', async () => {
    expect(await platform.lookupDirectory('123456789')).toEqual([]);
  });

  it('refuse un document vide plutôt que de le déclarer valide', async () => {
    const r = await platform.validate(doc(Buffer.alloc(0)));
    expect(r.valid).toBe(false);
    expect(r.issues[0]!.severity).toBe('fatal');
  });

  it('valide ce qu’il peut vérifier, sans prétendre lire un CII', async () => {
    const r = await platform.validate(doc(Buffer.from('%PDF-1.7')));
    expect(r.valid).toBe(true);
    expect(r.raw).toMatchObject({ mock: true });
  });
});

describe('idempotence exercée, pas masquée', () => {
  const platform = new MockEInvoicePlatform();

  it('le même document rend le MÊME identifiant plateforme', async () => {
    const a = await platform.submit(doc(Buffer.from('x')));
    const b = await platform.submit(doc(Buffer.from('x')));
    expect(a.externalId).toBe(b.externalId);
  });

  it('deux factures différentes rendent des identifiants différents', async () => {
    const a = await platform.submit(doc(Buffer.from('x'), 'FAC-000123'));
    const b = await platform.submit(doc(Buffer.from('x'), 'FAC-000124'));
    expect(a.externalId).not.toBe(b.externalId);
  });

  it('l’identifiant reste un entier en TEXTE — un int64 ne tient pas dans un Number', async () => {
    const r = await platform.submit(doc(Buffer.from('x')));
    expect(typeof r.externalId).toBe('string');
    expect(r.externalId).toMatch(/^\d+$/);
  });
});
