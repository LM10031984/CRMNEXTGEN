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

/**
 * « PAS UNE ENTREPRISE INDIVIDUELLE DONT L'APPRENANT SIGNE », écrit
 * explicitement — lot D (D-C3-3).
 *
 * `null` est la valeur normale : l'immense majorité des organisations sont des
 * agences dont un responsable signe. Nommer la constante fait que ces tests
 * disent « ce cas ne parle pas d'EI », au lieu d'aligner quinze `null` muets.
 */
const SANS_EI_SELF = null;

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
      SANS_EI_SELF,
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
      SANS_EI_SELF,
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
      SANS_EI_SELF,
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
      SANS_EI_SELF,
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
      SANS_EI_SELF,
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
      SANS_EI_SELF,
    );
    expect(vue.email).toBeNull();
    expect(vue.avertissement).not.toContain('sophie@agence.fr');
  });

  it('INCONNU : ni responsable ni contact principal ⇒ l’avertissement dit le GESTE', () => {
    const vue = vueResponsableOrganisation(org(), SANS_EI_SELF);
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
      SANS_EI_SELF,
    ).avertissement;
    const inconnu = vueResponsableOrganisation(org(), SANS_EI_SELF).avertissement;

    for (const message of [sansEmail, inconnu]) {
      expect(message).not.toBeNull();
      expect(message!).toMatch(/responsable/i);
      expect(message!).not.toMatch(/dirigeant/i);
    }
  });
});

/* ── D-C3-3 — une ENTREPRISE INDIVIDUELLE dont l'apprenant signe ─────────── */

/**
 * CE QUE LA RECETTE C.3 A TROUVÉ (11/09/2026, fiche DEMO-SIG BERNARD Julien).
 * L'encart annonçait « Aucune adresse email pour Julien BERNARD, responsable de
 * … : aucune convention ne peut partir en signature pour cette organisation »
 * — et le moteur envoyait très bien, à l'adresse de Julien lui-même.
 *
 * POURQUOI LA FICHE SE TROMPAIT. Elle appelait
 * `resoudreRepresentantEntreprise`, le chemin des AGENCES : `representative`,
 * sinon le premier contact principal, sinon refus. Pour une entreprise
 * individuelle liée à son apprenant par un `LegalLink` de rôle `EI_SELF`, le
 * moteur emprunte l'AUTRE chemin — `resoudreRepresentantIndividuel` — et prend
 * l'adresse de la fiche APPRENANT. Deux chemins, une seule fiche : elle en
 * affichait un et le moteur suivait l'autre.
 *
 * UN ÉCRAN QUI SE TROMPE EST PIRE QU'UN ÉCRAN MUET : il fait « corriger » une
 * cascade qui est juste — exactement ce que le mot « dirigeant » faisait avant
 * lui.
 */
describe('vueResponsableOrganisation — l’EI dont l’apprenant signe (D-C3-3)', () => {
  const JULIEN = { firstName: 'Julien', lastName: 'BERNARD', email: 'julien@demo-sig.fr' };

  it('le signataire est l’APPRENANT, et son adresse vient de sa fiche', () => {
    const vue = vueResponsableOrganisation(
      org({ legalName: 'DEMO-SIG BERNARD Julien', representative: null }),
      JULIEN,
    );
    expect(vue.etat).toBe('COMPLET');
    expect(vue.nom).toBe('Julien BERNARD');
    expect(vue.email).toBe('julien@demo-sig.fr');
  });

  it('AUCUN avertissement : le moteur envoie, et l’écran doit le dire', () => {
    const vue = vueResponsableOrganisation(
      org({ legalName: 'DEMO-SIG BERNARD Julien' }),
      JULIEN,
    );
    expect(vue.avertissement).toBeNull();
  });

  it('l’absence de contact principal ne bloque PLUS rien — ce n’est pas ce chemin', () => {
    // Avant : « Aucun responsable pour … aucune convention ne peut partir ».
    const vue = vueResponsableOrganisation(org({ contacts: [] }), JULIEN);
    expect(vue.etat).toBe('COMPLET');
  });

  it('apprenant SANS adresse : l’avertissement envoie vers SA fiche, pas vers un contact', () => {
    const vue = vueResponsableOrganisation(
      org({ legalName: 'DEMO-SIG BERNARD Julien' }),
      { ...JULIEN, email: null },
    );
    expect(vue.etat).toBe('SANS_EMAIL');
    expect(vue.nom).toBe('Julien BERNARD');
    expect(vue.avertissement).toBe(
      'Aucune adresse email pour « Julien BERNARD », qui signe pour son entreprise ' +
        'individuelle : aucune convention ne peut partir en signature. Renseignez son ' +
        'adresse sur sa fiche apprenant, ou saisissez-la au moment de l’envoi.',
    );
  });

  it('la phrase n’envoie JAMAIS vers « le contact qui porte ce nom » — il n’y en a pas', () => {
    const vue = vueResponsableOrganisation(org(), { ...JULIEN, email: null });
    expect(vue.avertissement).not.toMatch(/contact qui porte ce nom/);
  });

  it('`representative` renseigné ne l’emporte PAS sur le lien EI_SELF', () => {
    // Le régime a déjà tranché que l'apprenant signe pour lui-même : c'est le
    // même ordre que `resoudreRepresentantIndividuel`, où `estEiSelf` est
    // testé AVANT `representative`. L'inverser ferait diverger l'écran du
    // moteur, ce que cette correction supprime.
    const vue = vueResponsableOrganisation(
      org({ representative: 'Paul DURAND', contacts: [] }),
      JULIEN,
    );
    expect(vue.nom).toBe('Julien BERNARD');
  });
});

/* ── Le câblage : le lien EI_SELF traverse-t-il la page ? ────────────────── */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const pageSrc = readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'app', 'organisations', '[id]', 'page.tsx'),
  'utf-8',
);

/**
 * La source SANS ses commentaires.
 *
 * Le commentaire qui explique le choix cite le critère écarté
 * (`legalForm === 'EI'`) : sans ce nettoyage, l'assertion « ce critère n'est
 * pas employé » se déclencherait sur sa propre documentation — elle ne
 * garderait donc rien, et empêcherait d'expliquer le code.
 */
const pageCode = pageSrc.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * `apprenantEiSelf` est OBLIGATOIRE : l'oublier ne compile pas. Mais
 * `apprenantEiSelf={null}` compile parfaitement et reproduit exactement l'écran
 * de la recette — « aucune convention ne peut partir » sur une organisation
 * dont elles partaient. C'est la SUBSTITUTION que `tsc` ne voit pas, pour la
 * troisième fois de ce chantier.
 */
describe('fiche organisation — le lien EI_SELF remonte au champ responsable (D-C3-3)', () => {
  it('le lien est CHERCHÉ, et sur le rôle — pas sur la forme juridique', () => {
    // `legalForm === 'EI'` ne décide rien : ce qui décide, c'est le `LegalLink`
    // que le moteur lit lui aussi (`estEiSelfChezSponsor`). Deux critères pour
    // une question finiraient par répondre différemment.
    expect(pageSrc).toMatch(/org\.legalLinks\.find\(\(l\) => l\.role === 'EI_SELF'\)/);
    expect(pageCode).not.toMatch(/legalForm === 'EI'/);
  });

  it('et il est PASSÉ au champ : la substitution par `null` doit rougir', () => {
    expect(pageSrc).toMatch(/apprenantEiSelf=\{apprenantEiSelf\}/);
    expect(pageSrc).not.toMatch(/apprenantEiSelf=\{null\}/);
  });

  it('l’adresse de l’apprenant est réellement chargée — sans elle, le champ reste vide', () => {
    expect(pageSrc).toMatch(/person: \{ select: \{ id: true, firstName: true, lastName: true, email: true \} \}/);
  });
});
