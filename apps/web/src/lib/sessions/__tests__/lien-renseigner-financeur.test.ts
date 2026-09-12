import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * La FORME D'URL du lien « Renseigner le financeur de {organisation} → ».
 *
 * CE FICHIER EST UN SECOND CONTRAT, et il fallait bien un second : celui de
 * C.2b-5 (`lien-corriger-financeur.ts`) mène au formulaire d'INSCRIPTION, sur la
 * même page. Celui-ci mène à une AUTRE PAGE — la fiche organisation — où il n'y
 * a ni onglet porteur ni `?retour=`, mais le `?from=` déjà en service dans le
 * dépôt (`withFrom`, `parseFrom`, `BackToListLink`).
 *
 * ⚠ LE TEST DE PUISSANCE est la RECOUVRABILITÉ du retour. Une URL qui « contient
 * bien un from= » ne prouve rien : ce qui compte est que `parseFrom` — le
 * validateur que `BackToListLink` applique à l'ARRIVÉE — rende exactement le
 * chemin visé. Un `from` mal encodé, ou refusé par le validateur, produit un
 * bouton « Retour à la liste » qui renvoie sur la liste des organisations :
 * l'admin ne revient jamais à sa session, et rien ne rougit.
 */

import { parseFrom } from '@/lib/nav/from-link';
import { CHAMP_FINANCEUR, PARAM_CHAMP } from '../lien-corriger-financeur';
import {
  NOM_CHAMP_FINANCEUR_ORG,
  champFinanceurEnEvidence,
  libelleLienRenseignerFinanceur,
  lienRenseignerFinanceur,
  queryApresEditionOrganisation,
  retourVersOnglet,
} from '../lien-renseigner-financeur';

const ORG_ID = 'org-roussel';
const SESSION_ID = 'ses-0048';

describe('lienRenseignerFinanceur — la forme d’URL publiée', () => {
  it('produit exactement l’URL attendue, retour compris', () => {
    expect(
      lienRenseignerFinanceur({
        organizationId: ORG_ID,
        retourVers: retourVersOnglet(SESSION_ID, 'avant'),
      }),
    ).toBe(
      '/app/organisations/org-roussel?champ=financeur' +
        '&from=%2Fapp%2Fsessions%2Fses-0048%3Ftab%3Davant',
    );
  });

  it('PUISSANCE — le retour est RECOUVRABLE à l’arrivée, pas seulement présent', () => {
    // `parseFrom` est le validateur que `BackToListLink` applique en arrivant
    // sur la fiche organisation. S'il refuse la valeur, le bouton retour
    // retombe silencieusement sur la liste des organisations.
    const url = lienRenseignerFinanceur({
      organizationId: ORG_ID,
      retourVers: retourVersOnglet(SESSION_ID, 'avant'),
    });
    const from = new URLSearchParams(url.split('?')[1]).get('from');
    expect(parseFrom(from)).toBe('/app/sessions/ses-0048?tab=avant');
  });

  it('le champ visé est le MÊME mot que sur l’inscription — une seule valeur de `champ=`', () => {
    const url = lienRenseignerFinanceur({ organizationId: ORG_ID });
    expect(new URLSearchParams(url.split('?')[1]).get(PARAM_CHAMP)).toBe(CHAMP_FINANCEUR);
    // …et il désigne le champ `opcoCode` du formulaire d'organisation.
    expect(NOM_CHAMP_FINANCEUR_ORG).toBe('opcoCode');
  });

  it('sans retour : pas de `from=` du tout', () => {
    const url = lienRenseignerFinanceur({ organizationId: ORG_ID });
    expect(url).toBe('/app/organisations/org-roussel?champ=financeur');
  });

  it('PUISSANCE — une origine externe n’est jamais propagée (open redirect)', () => {
    const url = lienRenseignerFinanceur({
      organizationId: ORG_ID,
      retourVers: 'https://evil.test/app/sessions/x',
    });
    expect(url).not.toContain('from=');
  });
});

describe('retourVersOnglet — l’onglet d’où l’on vient, écrit une fois', () => {
  it('Avant et Après s’écrivent', () => {
    expect(retourVersOnglet(SESSION_ID, 'avant')).toBe('/app/sessions/ses-0048?tab=avant');
    expect(retourVersOnglet(SESSION_ID, 'apres')).toBe('/app/sessions/ses-0048?tab=apres');
  });

  it('l’onglet par défaut ne s’écrit pas — même convention que `<SessionTabs>`', () => {
    expect(retourVersOnglet(SESSION_ID, 'session')).toBe('/app/sessions/ses-0048');
  });
});

describe('libelleLienRenseignerFinanceur — il NOMME l’organisation', () => {
  it('le nom vient de la donnée, jamais du code', () => {
    expect(libelleLienRenseignerFinanceur('DEMO-SIG ROUSSEL Camille, EI')).toBe(
      'Renseigner le financeur de DEMO-SIG ROUSSEL Camille, EI →',
    );
  });

  it('sans nom, le lien reste vrai : il ne dit pas « de  → »', () => {
    expect(libelleLienRenseignerFinanceur(null)).toBe(
      "Renseigner le financeur de l'organisation commanditaire →",
    );
    expect(libelleLienRenseignerFinanceur('   ')).toBe(
      "Renseigner le financeur de l'organisation commanditaire →",
    );
  });
});

describe('champFinanceurEnEvidence — une valeur venue de la barre d’adresse', () => {
  it('`financeur` ouvre ; rien d’autre n’ouvre', () => {
    expect(champFinanceurEnEvidence('financeur')).toBe(true);
    expect(champFinanceurEnEvidence('legalName')).toBe(false);
    expect(champFinanceurEnEvidence(null)).toBe(false);
    expect(champFinanceurEnEvidence(undefined)).toBe(false);
    expect(champFinanceurEnEvidence('  ')).toBe(false);
  });
});

describe('queryApresEditionOrganisation — refermer sans boucler', () => {
  it('PUISSANCE — `champ` disparaît : sinon la modale se rouvrirait à chaque rendu', () => {
    const q = new URLSearchParams(
      queryApresEditionOrganisation(
        new URLSearchParams('champ=financeur&from=%2Fapp%2Fsessions%2Fses-0048%3Ftab%3Davant'),
      ),
    );
    expect(q.get('champ')).toBeNull();
    // …et le fil d'Ariane survit, sinon le bouton retour perdrait sa destination.
    expect(q.get('from')).toBe('/app/sessions/ses-0048?tab=avant');
  });

  it('sans autre paramètre, l’URL redevient propre', () => {
    expect(queryApresEditionOrganisation(new URLSearchParams('champ=financeur'))).toBe('');
  });
});

/**
 * Le CÂBLAGE de la fiche organisation — smoke source.
 *
 * `organisations/[id]/page.tsx` est un composant serveur qui ouvre Prisma et
 * Lucia : il n'est pas montable en jsdom. Or sans `from={…}` sur
 * `<BackToListLink>`, le retour vers la session n'existe pas — et rien d'autre
 * ne rougirait. Même forme que `fiche-session-cablage-signature.smoke.test.ts`.
 */
describe('fiche organisation — le retour est réellement branché', () => {
  const orgSrc = readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'app', 'organisations', '[id]', 'page.tsx'),
    'utf-8',
  );

  it('la page lit `searchParams` et passe `from` au lien de retour', () => {
    expect(orgSrc).toMatch(/searchParams/);
    expect(orgSrc).toMatch(/<BackToListLink[\s\S]{0,220}from=\{/);
  });
});
