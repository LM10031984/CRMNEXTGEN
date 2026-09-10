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
 * DÉCISION DE LAURENT DU 10/09/2026 — AUCUN REPLI SUR UN AUTRE CONTACT.
 * L'email du signataire est celui du représentant résolu, ou rien. Envoyer le
 * lien dans la boîte de B pour une pièce qui nomme A ferait enregistrer l'email
 * et l'adresse IP de B dans le certificat de signature : la preuve serait
 * inexploitable devant un financeur. La seule dérogation est une adresse SAISIE
 * explicitement par l'admin au moment de l'envoi — et elle se journalise.
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
    // `representative`, et l'email de l'homonyme — jamais du premier email venu.
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
    ).toEqual({
      ok: true,
      nom: 'Gilles Blanchon',
      email: 'g.blanchon@experta.fr',
      source: 'CONTACT_NOMME',
    });
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
    // Le moteur d'envoi charge TOUS les contacts. Sans cet invariant, il
    // nommerait comme signataire quelqu'un que la convention n'imprimerait pas —
    // la divergence exacte que le module sert à supprimer.
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
    ).toEqual({
      ok: true,
      nom: 'Alice MARTIN',
      email: 'alice.martin@exemple.fr',
      source: 'PERSON',
    });
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

describe('resoudreEmailRepresentant — l’adresse du REPRÉSENTANT, ou rien', () => {
  it('le contact qui PORTE le nom du représentant, où qu’il soit dans la liste', () => {
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

    // L'homonyme est reconnu quel que soit l'ordre prénom/nom et la casse : un
    // annuaire saisi à la main mélange les deux.
    expect(
      resoudreEmailRepresentant({
        nom: 'Gilles BLANCHON',
        source: 'ORG_REPRESENTATIVE',
        org: organisation,
      }),
    ).toEqual({
      ok: true,
      nom: 'Gilles BLANCHON',
      email: 'g.blanchon@experta.fr',
      source: 'CONTACT_NOMME',
    });
  });

  it('Test 6 — AUCUN REPLI : représentant sans email ⇒ refus, MÊME si un autre contact en a un', () => {
    // Décision Laurent du 10/09/2026. Le repli « premier contact avec un email »
    // est ANNULÉ : envoyer le lien à Sophie pour une convention qui nomme Gilles
    // ferait figurer l'email et l'IP de Sophie dans le certificat de signature.
    // La preuve ne vaudrait plus rien devant un financeur.
    //
    // Ce test est le gardien de la règle : quiconque réintroduit un repli le
    // fait rougir, parce qu'il assure à la fois le REFUS et l'ABSENCE de
    // l'adresse du tiers dans la sortie.
    const organisation = org({
      representative: 'Gilles Blanchon',
      contacts: [
        contact({ firstName: 'Gilles', lastName: 'Blanchon', email: null, isPrimary: true }),
        contact({
          firstName: 'Sophie',
          lastName: 'Durand',
          email: 'accueil@experta.fr',
          isPrimary: false,
        }),
      ],
    });

    const res = resoudreEmailRepresentant({
      nom: 'Gilles Blanchon',
      source: 'ORG_REPRESENTATIVE',
      org: organisation,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('Gilles Blanchon');
    expect(res.error).toContain('EXPERTA');
    expect(res.error).toContain('/app/organisations/org-1');
    // L'adresse du tiers n'apparaît NULLE PART : ni comme repli, ni comme
    // suggestion. La proposer reviendrait à proposer de fabriquer la preuve.
    expect(res.error).not.toContain('accueil@experta.fr');
    expect(res.error).not.toMatch(/Sophie|DURAND/);
  });

  it('Test 7 — aucun contact du tout : refus nominatif, jamais un envoi vers nulle part', () => {
    const res = resoudreEmailRepresentant({
      nom: 'Gilles Blanchon',
      source: 'ORG_REPRESENTATIVE',
      org: org({ representative: 'Gilles Blanchon' }),
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('EXPERTA');
    expect(res.error).toContain('/app/organisations/org-1');
    expect(res.error).toMatch(/certificat de signature/i);
  });

  it('Test 8 — PUISSANCE : un email vide est une absence d’email, pas une adresse', () => {
    // Une implémentation qui testerait `email != null` au lieu de « chaîne non
    // vide après trim » rendrait ici `{ ok: true, email: '' }` : la demande de
    // signature partirait vers une adresse vide. Les assertions portent donc sur
    // `ok === false` ET sur le contenu du message, jamais sur une valeur falsy.
    const organisation = org({
      representative: 'Gilles Blanchon',
      contacts: [contact({ email: '' })],
    });

    const res = resoudreEmailRepresentant({
      nom: 'Gilles Blanchon',
      source: 'ORG_REPRESENTATIVE',
      org: organisation,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('Gilles Blanchon');
    expect(res.error).toContain('/app/organisations/org-1');
  });

  it('apprenant sans email : refus nominatif qui renvoie vers SA fiche, pas vers l’entreprise', () => {
    const res = resoudreEmailRepresentant({
      nom: 'Alice MARTIN',
      source: 'APPRENANT_EI_SELF',
      org: org({ legalName: 'ALICE MARTIN EI' }),
      apprenant: { firstName: 'Alice', lastName: 'Martin', email: '  ' },
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('Alice MARTIN');
    expect(res.error).toMatch(/fiche apprenant/i);
  });

  it('l’email de l’apprenant est nettoyé (espaces autour) mais jamais inventé', () => {
    expect(
      resoudreEmailRepresentant({
        nom: 'Alice MARTIN',
        source: 'APPRENANT_REPLI',
        org: org(),
        apprenant: { firstName: 'Alice', lastName: 'Martin', email: ' alice@exemple.fr ' },
      }),
    ).toEqual({ ok: true, nom: 'Alice MARTIN', email: 'alice@exemple.fr', source: 'PERSON' });
  });
});

/**
 * La SEULE dérogation au « pas de repli » : l'admin saisit lui-même l'adresse.
 *
 * C'est une décision humaine, prise devant le récapitulatif d'envoi (C.2b) et
 * assumée : elle n'est jamais implicite, et la server action la journalise
 * (nom retenu + email retenu). La fonction rend donc les deux, et une `source`
 * qui distingue « adresse du représentant » de « adresse saisie par l'admin ».
 */
describe('resoudreEmailRepresentant — surcharge saisie par l’admin', () => {
  it('l’adresse saisie l’emporte sur celle du contact homonyme, et se nomme comme telle', () => {
    const organisation = org({
      representative: 'Gilles Blanchon',
      contacts: [contact({ email: 'g.blanchon@experta.fr' })],
    });

    expect(
      resoudreEmailRepresentant({
        nom: 'Gilles Blanchon',
        source: 'ORG_REPRESENTATIVE',
        org: organisation,
        emailSaisi: ' direction@experta.fr ',
      }),
    ).toEqual({
      ok: true,
      nom: 'Gilles Blanchon',
      email: 'direction@experta.fr',
      source: 'SAISI_PAR_ADMIN',
    });
  });

  it('elle débloque le refus — c’est sa raison d’être', () => {
    const res = resoudreEmailRepresentant({
      nom: 'Gilles Blanchon',
      source: 'ORG_REPRESENTATIVE',
      org: org({ representative: 'Gilles Blanchon' }),
      emailSaisi: 'direction@experta.fr',
    });

    expect(res).toEqual({
      ok: true,
      nom: 'Gilles Blanchon',
      email: 'direction@experta.fr',
      source: 'SAISI_PAR_ADMIN',
    });
  });

  it('une saisie vide n’est pas une saisie : on retombe sur la cascade normale', () => {
    expect(
      resoudreEmailRepresentant({
        nom: 'Gilles Blanchon',
        source: 'ORG_REPRESENTATIVE',
        org: org({ contacts: [contact({ email: 'g.blanchon@experta.fr' })] }),
        emailSaisi: '   ',
      }),
    ).toEqual({
      ok: true,
      nom: 'Gilles Blanchon',
      email: 'g.blanchon@experta.fr',
      source: 'CONTACT_NOMME',
    });
  });

  it('une saisie qui n’est pas une adresse est REFUSÉE, jamais envoyée telle quelle', () => {
    // Sans cette garde, « Gilles » tapé à la place d'une adresse partirait chez
    // le prestataire et le dossier n'avancerait jamais, sans que personne sache
    // pourquoi. Le refus nomme la saisie fautive.
    const res = resoudreEmailRepresentant({
      nom: 'Gilles Blanchon',
      source: 'ORG_REPRESENTATIVE',
      org: org({ contacts: [contact({ email: 'g.blanchon@experta.fr' })] }),
      emailSaisi: 'Gilles',
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('inatteignable');
    expect(res.error).toContain('Gilles');
    expect(res.error).toMatch(/adresse email/i);
  });
});
