/* @vitest-environment jsdom */

/**
 * Le champ « Responsable — signe les conventions » de la FICHE ORGANISATION —
 * demande n°1 de Laurent, 11/09/2026.
 *
 * CE QUE CET ÉCRAN NE DISAIT PAS, ET QUI COÛTE UN ENVOI. La fiche affichait le
 * représentant dans le SOUS-TITRE de la page, mêlé au réseau et au nom
 * commercial — sans son email, et sans rien dire quand il manquait. Or c'est
 * exactement ce manque qui fait refuser l'envoi : depuis le lot C.2a,
 * `resoudreEmailRepresentant` refuse NOMINATIVEMENT et aucune convention ne part
 * pour cette organisation. L'admin l'apprenait au moment d'envoyer, sur un autre
 * écran, après avoir préparé son dossier.
 *
 * ⚠ `vitest` n'a pas `globals: true` ici : sans `beforeEach(cleanup)`, le DOM du
 * test précédent survit et rend tous les `queryBy*` menteurs (constaté en
 * C.2b-1). Pas de `jest-dom`, pas de `user-event` : assertions sur
 * `textContent` / `getAttribute`, comme partout ailleurs dans le dépôt.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResponsableOrganisation } from '../responsable-organisation';
import type { OrganisationRepresentee } from '@/lib/signature/representant';

beforeEach(cleanup);

function org(over: Partial<OrganisationRepresentee> = {}): OrganisationRepresentee {
  return {
    id: 'org-1',
    legalName: 'AGENCE MARTIN',
    representative: null,
    contacts: [],
    ...over,
  };
}

const AVEC_EMAIL = org({
  representative: 'Paul DURAND',
  contacts: [
    { firstName: 'Paul', lastName: 'Durand', email: 'paul.durand@agence.fr', isPrimary: true },
  ],
});

const SANS_EMAIL = org({
  representative: 'Paul DURAND',
  contacts: [
    { firstName: 'Sophie', lastName: 'BERNARD', email: 'sophie@agence.fr', isPrimary: true },
  ],
});

describe('le champ porte le MOT de Laurent — « responsable », jamais « dirigeant »', () => {
  it('le libellé du champ est « Responsable — signe les conventions »', () => {
    render(<ResponsableOrganisation organisation={AVEC_EMAIL} />);
    expect(screen.getByText('Responsable — signe les conventions')).toBeTruthy();
  });

  it('le rendu n’emploie NI « dirigeant » NI « représentant légal »', () => {
    // « dirigeant » affirme une qualité juridique que la donnée ne porte pas :
    // pour un salarié, le signataire est le responsable d'agence, et le champ
    // dit seulement qui représente l'organisation et signe ses conventions.
    for (const organisation of [AVEC_EMAIL, SANS_EMAIL, org()]) {
      cleanup();
      const { container } = render(<ResponsableOrganisation organisation={organisation} />);
      expect(container.textContent ?? '').not.toMatch(/dirigeant/i);
      expect(container.textContent ?? '').not.toMatch(/représentant légal/i);
    }
  });
});

describe('L’EMAIL est à l’écran — c’est lui qui décide qu’un envoi peut partir', () => {
  it('responsable joignable : son nom ET son adresse sont lisibles', () => {
    render(<ResponsableOrganisation organisation={AVEC_EMAIL} />);
    expect(screen.getByText('Paul DURAND')).toBeTruthy();
    expect(screen.getByText('paul.durand@agence.fr')).toBeTruthy();
  });

  it('l’adresse est cliquable — la corriger commence souvent par écrire à la personne', () => {
    render(<ResponsableOrganisation organisation={AVEC_EMAIL} />);
    const lien = screen.getByText('paul.durand@agence.fr');
    expect(lien.getAttribute('href')).toBe('mailto:paul.durand@agence.fr');
  });

  it('responsable joignable : AUCUN avertissement — un écran qui alerte à tort n’alerte plus', () => {
    render(<ResponsableOrganisation organisation={AVEC_EMAIL} />);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});

describe('L’AVERTISSEMENT quand l’adresse manque — la promesse de cette demande', () => {
  it('email manquant : un `alert` VISIBLE, nominatif, qui dit la conséquence', () => {
    render(<ResponsableOrganisation organisation={SANS_EMAIL} />);
    const alerte = screen.getByRole('alert');
    const texte = alerte.textContent ?? '';
    expect(texte).toContain('Paul DURAND');
    expect(texte).toContain('AGENCE MARTIN');
    expect(texte).toContain('aucune convention ne peut partir en signature');
  });

  it('email manquant : le NOM reste affiché — l’avertissement complète, il ne remplace pas', () => {
    render(<ResponsableOrganisation organisation={SANS_EMAIL} />);
    expect(screen.getByText('Paul DURAND')).toBeTruthy();
  });

  it('aucun responsable résoluble : un `alert` aussi, avec le geste à faire', () => {
    render(<ResponsableOrganisation organisation={org()} />);
    const texte = screen.getByRole('alert').textContent ?? '';
    expect(texte).toContain('AGENCE MARTIN');
    expect(texte).toContain('aucune convention ne peut partir en signature');
  });

  it('aucun repli : l’adresse d’un AUTRE contact joignable n’apparaît jamais', () => {
    // Sophie est principale et joignable — elle n'est pas le responsable.
    const { container } = render(<ResponsableOrganisation organisation={SANS_EMAIL} />);
    expect(container.textContent ?? '').not.toContain('sophie@agence.fr');
  });
});
