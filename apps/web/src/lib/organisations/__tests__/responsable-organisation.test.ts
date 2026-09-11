/**
 * Le RESPONSABLE d'une organisation, tel que sa fiche doit le dire — demande
 * n°1 de Laurent, 11/09/2026.
 *
 * LE MOT, ET POURQUOI IL CHANGE. L'écran disait « dirigeant » / « représentant
 * légal ». Les deux affirment une QUALITÉ JURIDIQUE que la donnée ne porte pas :
 * `Organization.representative` est un champ libre qui dit seulement qui
 * représente l'organisation et signe ses conventions. Pour un salarié, c'est le
 * RESPONSABLE D'AGENCE — pas nécessairement le représentant légal de la société.
 * Un écran qui l'appelle « dirigeant » fait chercher un mandataire social, et
 * fait hésiter à y mettre le nom qui convient.
 *
 * ⚠ LA CASCADE NE BOUGE PAS, ET CE FICHIER LE VÉRIFIE. `representant.ts`
 * (`representative` → premier contact principal) est LA règle, partagée avec la
 * génération de convention et avec le moteur d'envoi. Ce module l'APPELLE ; il
 * ne la recopie pas, ne la réordonne pas, n'y ajoute aucun repli. Les deux tests
 * « cascade » ci-dessous sont là pour qu'une réécriture se voie.
 *
 * ⚠ VALEURS LITTÉRALES, jamais le retour de la fonction testée (règle de test
 * n°2, cf. `.claude/commands/signature.md`). Comparer un libellé au retour du
 * module qui le compose laisse les deux côtés bouger ensemble : c'est le défaut
 * trouvé sur `lienRenseignerFinanceur` au lot C.2b-6, vert alors que le lien
 * n'était plus posé.
 */

import { describe, it, expect } from 'vitest';
import {
  LIBELLE_RESPONSABLE_ORGANISATION,
  vueResponsableOrganisation,
} from '../responsable-organisation';
import type { OrganisationRepresentee } from '@/lib/signature/representant';

function org(over: Partial<OrganisationRepresentee> = {}): OrganisationRepresentee {
  return {
    id: 'org-1',
    legalName: 'AGENCE MARTIN',
    representative: null,
    contacts: [],
    ...over,
  };
}

describe('le LIBELLE du champ — « responsable », jamais « dirigeant »', () => {
  it('dit ce que le champ décide, pas une qualité juridique', () => {
    expect(LIBELLE_RESPONSABLE_ORGANISATION).toBe('Responsable — signe les conventions');
  });

  it('n’emploie ni « dirigeant » ni « représentant légal »', () => {
    expect(LIBELLE_RESPONSABLE_ORGANISATION).not.toMatch(/dirigeant/i);
    expect(LIBELLE_RESPONSABLE_ORGANISATION).not.toMatch(/représentant légal/i);
  });
});

describe('vueResponsableOrganisation — le nom vient de la CASCADE, jamais d’ici', () => {
  it('`representative` renseigné : c’est lui, et rien d’autre n’est consulté', () => {
    const vue = vueResponsableOrganisation(
      org({
        representative: 'Paul DURAND',
        contacts: [
          { firstName: 'Sophie', lastName: 'BERNARD', email: 'sophie@agence.fr', isPrimary: true },
        ],
      }),
    );
    expect(vue.nom).toBe('Paul DURAND');
  });

  it('`representative` vide : le PREMIER CONTACT PRINCIPAL, en « Prénom NOM »', () => {
    const vue = vueResponsableOrganisation(
      org({
        representative: null,
        contacts: [
          { firstName: 'Sophie', lastName: 'Bernard', email: 'sophie@agence.fr', isPrimary: true },
        ],
      }),
    );
    expect(vue.nom).toBe('Sophie BERNARD');
  });

  it('un contact NON principal n’est jamais candidat — invariant de `representant.ts`', () => {
    const vue = vueResponsableOrganisation(
      org({
        representative: null,
        contacts: [
          { firstName: 'Marc', lastName: 'Petit', email: 'marc@agence.fr', isPrimary: false },
        ],
      }),
    );
    expect(vue.etat).toBe('INCONNU');
    expect(vue.nom).toBeNull();
  });
});

describe('vueResponsableOrganisation — L’EMAIL, et l’avertissement quand il manque', () => {
  it('COMPLET : l’adresse du contact qui PORTE ce nom, affichée telle quelle', () => {
    const vue = vueResponsableOrganisation(
      org({
        representative: 'Paul DURAND',
        contacts: [
          { firstName: 'Paul', lastName: 'Durand', email: 'paul.durand@agence.fr', isPrimary: true },
        ],
      }),
    );
    expect(vue.etat).toBe('COMPLET');
    expect(vue.email).toBe('paul.durand@agence.fr');
    expect(vue.avertissement).toBeNull();
  });

  it('SANS_EMAIL : aucun contact ne porte ce nom ⇒ avertissement NOMINATIF', () => {
    const vue = vueResponsableOrganisation(
      org({
        representative: 'Paul DURAND',
        contacts: [
          { firstName: 'Sophie', lastName: 'BERNARD', email: 'sophie@agence.fr', isPrimary: true },
        ],
      }),
    );
    expect(vue.etat).toBe('SANS_EMAIL');
    expect(vue.email).toBeNull();
    // Il NOMME la personne et l'organisation — sans quoi l'admin ne sait pas
    // quelle adresse renseigner, ni où.
    expect(vue.avertissement).toContain('Paul DURAND');
    expect(vue.avertissement).toContain('AGENCE MARTIN');
    // Et il dit la CONSÉQUENCE, pas seulement le manque : c'est elle qui fait
    // corriger. Le moteur refuse nominativement depuis C.2a.
    expect(vue.avertissement).toContain('aucune convention ne peut partir en signature');
  });

  it('AUCUN REPLI sur un autre contact joignable — décision Laurent du 10/09/2026', () => {
    // Sophie est principale ET joignable. Elle n'est pas le responsable : lui
    // envoyer le lien ferait figurer SON email et SON adresse IP dans le
    // certificat de signature, qui ne prouverait plus rien.
    const vue = vueResponsableOrganisation(
      org({
        representative: 'Paul DURAND',
        contacts: [
          { firstName: 'Sophie', lastName: 'BERNARD', email: 'sophie@agence.fr', isPrimary: true },
        ],
      }),
    );
    expect(vue.email).toBeNull();
    expect(vue.avertissement).not.toContain('sophie@agence.fr');
  });

  it('INCONNU : ni responsable ni contact principal ⇒ l’avertissement dit le GESTE', () => {
    const vue = vueResponsableOrganisation(org());
    expect(vue.etat).toBe('INCONNU');
    expect(vue.nom).toBeNull();
    expect(vue.email).toBeNull();
    expect(vue.avertissement).toContain('AGENCE MARTIN');
    expect(vue.avertissement).toContain('aucune convention ne peut partir en signature');
  });
});

describe('le VOCABULAIRE des avertissements — le mot de Laurent, au mot près', () => {
  it('ils disent « responsable », et jamais « dirigeant »', () => {
    const sansEmail = vueResponsableOrganisation(
      org({ representative: 'Paul DURAND' }),
    ).avertissement;
    const inconnu = vueResponsableOrganisation(org()).avertissement;

    for (const message of [sansEmail, inconnu]) {
      expect(message).not.toBeNull();
      expect(message!).toMatch(/responsable/i);
      expect(message!).not.toMatch(/dirigeant/i);
    }
  });
});
