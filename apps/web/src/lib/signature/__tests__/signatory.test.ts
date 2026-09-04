import { describe, it, expect } from 'vitest';

/**
 * Lot B — résolution du signataire OF (spec 2026-09-04 §3 + D-1).
 *
 * « Le signataire OF est toujours le même : un TenantSignatory (nom, email,
 * rôle) configuré une fois dans les paramètres tenant. »
 *
 * Règle métier n°4 gravée : **signataires résolus, jamais devinés**. Un
 * signataire sans email ne devient pas un envoi à l'aveugle : il devient un
 * refus nominatif. On le teste ici parce que c'est le seul endroit du lot B
 * qui décide « qui signe », et que le lot C s'appuiera dessus sans le rejouer.
 */

import { resolveTenantSignatory } from '@/lib/signature/signatory';
import type { OfConfig } from '@/lib/of-config';

const of = {
  name: 'START ACADEMY',
  resp: {
    civilite: 'MR',
    prenom: 'Laurent',
    nom: 'MARX',
    titre: 'PDG',
    phone: '0631056390',
    email: 'laurent@start-academy.fr',
  },
} as unknown as OfConfig;

describe('resolveTenantSignatory', () => {
  it('prend le signataire configuré dans Paramètres quand il est complet', () => {
    const r = resolveTenantSignatory(
      {
        signatoryName: 'Sophie GÉRANTE',
        signatoryEmail: 'sophie@start-academy.fr',
        signatoryTitle: 'Directrice',
        signatoryOrder: 'AFTER',
      },
      of,
    );

    expect(r).toEqual({
      ok: true,
      signatory: {
        name: 'Sophie GÉRANTE',
        email: 'sophie@start-academy.fr',
        title: 'Directrice',
        order: 'AFTER',
      },
    });
  });

  it('retombe sur le responsable OF quand Paramètres est vide (aucune double saisie)', () => {
    const r = resolveTenantSignatory(
      { signatoryName: null, signatoryEmail: null, signatoryTitle: null, signatoryOrder: null },
      of,
    );

    expect(r.ok).toBe(true);
    expect(r.ok && r.signatory).toEqual({
      name: 'Laurent MARX',
      email: 'laurent@start-academy.fr',
      title: 'PDG',
      order: 'AFTER',
    });
  });

  it('respecte l’ordre « l’OF signe en premier » quand il est réglé ainsi', () => {
    const r = resolveTenantSignatory(
      {
        signatoryName: null,
        signatoryEmail: null,
        signatoryTitle: null,
        signatoryOrder: 'BEFORE',
      },
      of,
    );
    expect(r.ok && r.signatory.order).toBe('BEFORE');
  });

  it('bloque avec un message nominatif quand aucun email n’est trouvable (règle n°4)', () => {
    const sansEmail = { ...of, resp: { ...of.resp, email: '' } } as unknown as OfConfig;
    const r = resolveTenantSignatory(
      { signatoryName: 'Laurent MARX', signatoryEmail: '', signatoryTitle: '', signatoryOrder: null },
      sansEmail,
    );

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/signataire/i);
    expect(r.ok === false && r.error).toMatch(/Param/i);
  });

  it('bloque aussi quand le nom manque — un PDF « signé par ??? » n’a aucune valeur', () => {
    const sansNom = { ...of, resp: { ...of.resp, nom: '', prenom: '' } } as unknown as OfConfig;
    const r = resolveTenantSignatory(
      { signatoryName: '', signatoryEmail: '', signatoryTitle: '', signatoryOrder: null },
      sansNom,
    );
    expect(r.ok).toBe(false);
  });

  it('ignore les blancs de saisie', () => {
    const r = resolveTenantSignatory(
      {
        signatoryName: '   ',
        signatoryEmail: '  ',
        signatoryTitle: '  ',
        signatoryOrder: 'AFTER',
      },
      of,
    );
    expect(r.ok && r.signatory.name).toBe('Laurent MARX');
  });
});
