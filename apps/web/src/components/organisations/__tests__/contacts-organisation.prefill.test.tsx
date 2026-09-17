/* @vitest-environment jsdom */

/**
 * Le pré-remplissage du PREMIER contact d'une organisation.
 *
 * CE QUE ÇA ÉVITE. Le formulaire s'ouvrait vide : sur NS ANTIBES IMMOBILIER,
 * Laurent a recopié à la main un email et un téléphone que l'écran affichait
 * déjà deux blocs plus haut, dans « Coordonnées ». Le nom venait bien de
 * `representative`, pas le reste.
 *
 * ⚠ LA LIMITE EST LA RÈGLE, PAS UN OUBLI. On n'hérite QUE pour le premier
 * contact. Un second qui reprendrait l'adresse générique se verrait attribuer
 * celle d'une autre personne — et comme le lien de signature part à l'adresse du
 * contact retenu, ce serait son email à LUI dans le certificat.
 *
 * ⚠ `vitest` n'a pas `globals: true` ici : sans `beforeEach(cleanup)`, le DOM du
 * test précédent survit et rend tous les `queryBy*` menteurs. Pas de `jest-dom`,
 * pas de `user-event` : assertions sur `value` / `textContent`, comme partout
 * ailleurs dans le dépôt.
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/server/actions/crud-edits', () => ({
  createOrganizationContact: vi.fn(),
  updateOrganizationContact: vi.fn(),
  deleteOrganizationContact: vi.fn(),
}));

import { ContactsOrganisation, type ContactAffiche } from '../contacts-organisation';

const EXISTANT: ContactAffiche = {
  id: 'c-1',
  firstName: 'Cameron',
  lastName: 'Guigo',
  email: 'cameron@exemple.fr',
  phone: null,
  function: null,
  isPrimary: true,
};

function afficher(contacts: ContactAffiche[]) {
  render(
    <ContactsOrganisation
      organizationId="org-1"
      contacts={contacts}
      representative="Jilbert Nicolas"
      organisationEmail="nicolas.jilbert@ladresse.com"
      organisationPhone="06 12 34 56 78"
    />,
  );
  fireEvent.click(screen.getByText('Ajouter un contact'));
}

const valeur = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

beforeEach(cleanup);

describe('ContactsOrganisation — pré-remplissage du premier contact', () => {
  it('hérite du nom du responsable, et des coordonnées de l’organisation', () => {
    afficher([]);
    expect(valeur('contact-firstName')).toBe('Jilbert');
    expect(valeur('contact-lastName')).toBe('Nicolas');
    expect(valeur('contact-email')).toBe('nicolas.jilbert@ladresse.com');
    expect(valeur('contact-phone')).toBe('06 12 34 56 78');
  });

  it('dit d’où vient l’adresse, pour qu’on pense à la corriger', () => {
    afficher([]);
    expect(document.body.textContent).toContain('Reprise des coordonnées de l’organisation');
  });

  it('n’hérite PAS des coordonnées au-delà du premier contact', () => {
    afficher([EXISTANT]);
    // Le nom du responsable, lui, reste utile : c'est par lui que le moteur
    // rapproche le contact, quel que soit leur nombre.
    expect(valeur('contact-firstName')).toBe('Jilbert');
    expect(valeur('contact-email')).toBe('');
    expect(valeur('contact-phone')).toBe('');
  });

  it('ne coche « principal » que pour le premier', () => {
    afficher([]);
    expect((screen.getByLabelText('Contact principal') as HTMLInputElement).checked).toBe(true);

    cleanup();
    afficher([EXISTANT]);
    expect((screen.getByLabelText('Contact principal') as HTMLInputElement).checked).toBe(false);
  });

  it('supporte une organisation sans coordonnées — champs vides, pas « null »', () => {
    render(
      <ContactsOrganisation
        organizationId="org-1"
        contacts={[]}
        representative="Jilbert Nicolas"
        organisationEmail={null}
        organisationPhone={null}
      />,
    );
    fireEvent.click(screen.getByText('Ajouter un contact'));
    expect(valeur('contact-email')).toBe('');
    expect(valeur('contact-phone')).toBe('');
  });
});
