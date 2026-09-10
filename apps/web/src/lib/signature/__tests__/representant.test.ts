import { describe, it, expect } from 'vitest';
import {
  nomAffiche,
  resoudreEmailRepresentant,
  resoudreRepresentantEntreprise,
  resoudreRepresentantIndividuel,
} from '../representant';
import type { ContactCandidat, OrganisationRepresentee } from '../representant';

/**
 * Cascade UNIQUE du représentant — lot C.2a, tâche 1.
 *
 * POURQUOI CE FICHIER EXISTE. `convention-core.ts` imprime « Représentée par X »
 * sur le PDF. Si le moteur d'envoi résolvait le signataire par une cascade
 * PARALLÈLE, on enverrait un jour signer à Y une pièce qui nomme X : contestable
 * devant un financeur, et invisible tant que les deux cascades sont testées
 * séparément. Les tests ci-dessous gardent la cascade PARTAGÉE.
 *
 * Le module est pur : aucun mock, aucune base, aucun réseau. C'est ce qui rend
 * les cas tordus (contacts secondaires, emails vides) testables en une ligne.
 */

/** Organisation de référence : EXPERTA, l'entreprise du défaut constaté le 21/08. */
function org(patch: Partial<OrganisationRepresentee> = {}): OrganisationRepresentee {
  return {
    id: 'org-1',
    legalName: 'EXPERTA',
    representative: null,
    contacts: [],
    ...patch,
  };
}

function contact(patch: Partial<ContactCandidat> = {}): ContactCandidat {
  return { firstName: 'Gilles', lastName: 'Blanchon', email: null, isPrimary: true, ...patch };
}

const APPRENANT = { firstName: 'Alice', lastName: 'Martin', email: 'alice.martin@exemple.fr' };

describe('nomAffiche — « Prénom NOM »', () => {
  it('met le nom de famille en MAJUSCULES et laisse le prénom tel quel', () => {
    expect(nomAffiche({ firstName: 'Gilles', lastName: 'Blanchon' })).toBe('Gilles BLANCHON');
    expect(nomAffiche({ firstName: 'Alice', lastName: 'Martin' })).toBe('Alice MARTIN');
  });
});

describe('resoudreRepresentantEntreprise — la cascade du NOM (chemin groupe)', () => {
  it('Test 1 — le représentant de la fiche entreprise gagne sur le contact principal', () => {
    // Contacts volontairement dans un ordre PIÉGEUX : le contact principal
    // n'est pas l'homonyme du représentant. Le nom doit venir du champ
    // `representative`, et l'email de l'homonyme — pas du premier email venu.
    const organisation = org({
      representative: 'Gilles Blanchon',
      contacts: [
        contact({ firstName: 'Sophie', lastName: 'Durand', email: 'accueil@experta.fr' }),
        contact({
          firstName: 'Gilles',
          lastName: 'Blanchon',
          email: 'g.blanchon@experta.fr',
          isPrimary: false,
        }),
      ],
    });

    const res = resoudreRepresentantEntreprise(organisation);
    expect(res).toEqual({ ok: true, nom: 'Gilles Blanchon', source: 'ORG_REPRESENTATIVE' });

    if (!res.ok) throw new Error('inatteignable');
    expect(
      resoudreEmailRepresentant({ nom: res.nom, source: res.source, org: organisation }),
    ).toEqual({ ok: true, email: 'g.blanchon@experta.fr', source: 'CONTACT_NOMME' });
  });

  it('Test 2 — repli sur le contact PRINCIPAL quand `representative` n’est que des espaces', () => {
    const res = resoudreRepresentantEntreprise(
      org({ representative: '   ', contacts: [contact()] }),
    );

    // Nom de famille en MAJUSCULES, exactement comme le PDF l'imprime aujourd'hui.
    expect(res).toEqual({ ok: true, nom: 'Gilles BLANCHON', source: 'CONTACT_PRINCIPAL' });
  });

  it('Test 3 — refus NOMINATIF sans représentant déterminable', () => {
    const res = resoudreRepresentantEntreprise(org({ representative: null, contacts: [] }));

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    // Le message est celui qui part déjà en production depuis le 21/08 : il
    // nomme l'entreprise, donne le lien de la fiche, et dit POURQUOI on refuse.
    expect(res.error).toMatch(/EXPERTA/);
    expect(res.error).toMatch(/représentant/i);
    expect(res.error).toMatch(/opposable/i);
    expect(res.error).toContain('/app/organisations/org-1');
  });

  it('Test 4 — INVARIANT : le NOM ne sort JAMAIS d’un contact non principal', () => {
    // Le moteur d'envoi charge TOUS les contacts pour trouver un email. Sans cet
    // invariant, il nommerait comme signataire quelqu'un que la convention
    // n'imprimerait pas — la divergence exacte que le module sert à supprimer.
    const res = resoudreRepresentantEntreprise(
      org({
        representative: null,
        contacts: [
          contact({ firstName: 'Sophie', lastName: 'Durand', isPrimary: false }),
          contact({ firstName: 'Karim', lastName: 'Benali', isPrimary: false }),
        ],
      }),
    );

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('/app/organisations/org-1');
    // Et surtout : aucun des deux noms secondaires ne s'est glissé dans la sortie.
    expect(res.error).not.toMatch(/DURAND|Sophie|BENALI|Karim/);
  });

  it('le premier contact principal l’emporte sur les suivants (ordre donné par l’appelant)', () => {
    const res = resoudreRepresentantEntreprise(
      org({
        contacts: [
          contact({ firstName: 'Sophie', lastName: 'Durand', isPrimary: false }),
          contact({ firstName: 'Gilles', lastName: 'Blanchon', isPrimary: true }),
          contact({ firstName: 'Karim', lastName: 'Benali', isPrimary: true }),
        ],
      }),
    );

    expect(res).toEqual({ ok: true, nom: 'Gilles BLANCHON', source: 'CONTACT_PRINCIPAL' });
  });
});

describe('resoudreRepresentantIndividuel — la cascade du NOM (chemin individuel)', () => {
  it('Test 5 — EI_SELF : l’apprenant se représente lui-même, et son email est celui de sa fiche', () => {
    const organisation = org({ legalName: 'ALICE MARTIN EI', representative: 'Ne doit pas gagner' });
    const res = resoudreRepresentantIndividuel({
      org: organisation,
      apprenant: APPRENANT,
      estEiSelf: true,
    });

    expect(res).toEqual({ ok: true, nom: 'Alice MARTIN', source: 'APPRENANT_EI_SELF' });

    if (!res.ok) throw new Error('inatteignable');
    expect(
      resoudreEmailRepresentant({
        nom: res.nom,
        source: res.source,
        org: organisation,
        apprenant: APPRENANT,
      }),
    ).toEqual({ ok: true, email: 'alice.martin@exemple.fr', source: 'PERSON' });
  });

  it('salarié : le représentant de la fiche entreprise, sinon l’apprenant en repli', () => {
    expect(
      resoudreRepresentantIndividuel({
        org: org({ representative: 'Gilles Blanchon' }),
        apprenant: APPRENANT,
        estEiSelf: false,
      }),
    ).toEqual({ ok: true, nom: 'Gilles Blanchon', source: 'ORG_REPRESENTATIVE' });

    // Ce chemin ne REFUSE jamais : c'est le comportement actuel de
    // `generateConventionCore`, et le durcir ici casserait la génération.
    expect(
      resoudreRepresentantIndividuel({
        org: org({ representative: '  ' }),
        apprenant: APPRENANT,
        estEiSelf: false,
      }),
    ).toEqual({ ok: true, nom: 'Alice MARTIN', source: 'APPRENANT_REPLI' });
  });
});

describe('resoudreEmailRepresentant — la cascade de l’EMAIL', () => {
  it('Test 6 — email pris sur un contact NON principal : la provenance est NOMMÉE', () => {
    // Le contact principal n'a pas d'email : on prend le suivant, mais on dit
    // d'où il vient (`CONTACT_AUTRE`), pour que le récapitulatif de C.2b puisse
    // le montrer à l'admin au lieu de le masquer.
    const organisation = org({
      contacts: [
        contact({ firstName: 'Gilles', lastName: 'Blanchon', email: null, isPrimary: true }),
        contact({
          firstName: 'Sophie',
          lastName: 'Durand',
          email: 'contact@experta.fr',
          isPrimary: false,
        }),
      ],
    });

    const nom = resoudreRepresentantEntreprise(organisation);
    expect(nom).toEqual({ ok: true, nom: 'Gilles BLANCHON', source: 'CONTACT_PRINCIPAL' });

    expect(
      resoudreEmailRepresentant({
        nom: 'Gilles BLANCHON',
        source: 'CONTACT_PRINCIPAL',
        org: organisation,
      }),
    ).toEqual({ ok: true, email: 'contact@experta.fr', source: 'CONTACT_AUTRE' });
  });

  it('l’homonyme est reconnu quel que soit l’ordre prénom/nom et la casse', () => {
    const organisation = org({
      contacts: [
        contact({ firstName: 'Sophie', lastName: 'Durand', email: 'accueil@experta.fr' }),
        contact({
          firstName: 'BLANCHON',
          lastName: 'Gilles',
          email: 'g.blanchon@experta.fr',
          isPrimary: false,
        }),
      ],
    });

    expect(
      resoudreEmailRepresentant({
        nom: 'Gilles BLANCHON',
        source: 'ORG_REPRESENTATIVE',
        org: organisation,
      }),
    ).toEqual({ ok: true, email: 'g.blanchon@experta.fr', source: 'CONTACT_NOMME' });
  });

  it('Test 7 — aucun email nulle part : refus NOMINATIF, jamais un envoi vers nulle part', () => {
    const organisation = org({
      representative: 'Gilles Blanchon',
      contacts: [contact({ email: null }), contact({ firstName: 'Sophie', lastName: 'Durand' })],
    });

    const res = resoudreEmailRepresentant({
      nom: 'Gilles Blanchon',
      source: 'ORG_REPRESENTATIVE',
      org: organisation,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('EXPERTA');
    expect(res.error).toContain('/app/organisations/org-1');
    expect(res.error).toMatch(/email/i);
    expect(res.error).toMatch(/ne peut partir/i);
  });

  it('Test 8 — PUISSANCE : un email vide est une absence d’email, pas une adresse', () => {
    // Une implémentation qui testerait `email != null` au lieu de « chaîne non
    // vide après trim » rendrait ici `{ ok: true, email: '' }` : la demande de
    // signature partirait vers une adresse vide. Les assertions portent donc sur
    // `ok === false` ET sur le contenu du message, jamais sur une valeur falsy.
    const organisation = org({
      representative: 'Gilles Blanchon',
      contacts: [
        contact({ email: '' }),
        contact({ firstName: 'Sophie', lastName: 'Durand', email: '   ' }),
      ],
    });

    const res = resoudreEmailRepresentant({
      nom: 'Gilles Blanchon',
      source: 'ORG_REPRESENTATIVE',
      org: organisation,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('EXPERTA');
    expect(res.error).toContain('/app/organisations/org-1');
    expect(res.error).toMatch(/ne peut partir/i);
  });

  it('apprenant sans email : refus nominatif aussi (EI_SELF n’est pas une dispense)', () => {
    const organisation = org({ legalName: 'ALICE MARTIN EI' });
    const res = resoudreEmailRepresentant({
      nom: 'Alice MARTIN',
      source: 'APPRENANT_EI_SELF',
      org: organisation,
      apprenant: { firstName: 'Alice', lastName: 'Martin', email: '  ' },
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('ALICE MARTIN EI');
    expect(res.error).toContain('/app/organisations/org-1');
  });

  it('l’email de l’apprenant est nettoyé (espaces autour) mais jamais inventé', () => {
    const res = resoudreEmailRepresentant({
      nom: 'Alice MARTIN',
      source: 'APPRENANT_REPLI',
      org: org(),
      apprenant: { firstName: 'Alice', lastName: 'Martin', email: ' alice@exemple.fr ' },
    });

    expect(res).toEqual({ ok: true, email: 'alice@exemple.fr', source: 'PERSON' });
  });
});
