import { describe, it, expect } from 'vitest';

/**
 * L'ORDRE COMPLET DES SIGNATAIRES, tel qu'il s'écrit — demande n°2 de Laurent
 * (11/09/2026, après vérification d'écran).
 *
 * CE QUE CE FICHIER GARDE, et pourquoi chaque promesse compte :
 *
 *  (a) **L'OF apparaît, numéroté, à sa place.** Le moteur l'envoie depuis le
 *      lot C.2a ; l'écran ne le montrait nulle part. Un admin qui relit un
 *      récapitulatif ne pouvait pas savoir que quelqu'un signerait après le
 *      client — et donc pas savoir que la pièce n'est pas close au premier
 *      paraphe.
 *  (b) **« Signer maintenant » est adossé à la DONNÉE, jamais au fait d'avoir
 *      envoyé.** Le lien de l'OF n'a de sens qu'une fois le client passé
 *      (D-3, `order: AFTER`). Tant que `signedAt` du client est nul, le lien
 *      n'existe PAS dans le DOM — et l'écran DIT pourquoi.
 *  (c) **L'honnêteté sur le lot C.3.** `signedAt` ne se remplit que par le
 *      retour du prestataire, qui n'est pas branché. On ne simule pas, on ne
 *      laisse pas croire que l'écran se mettra à jour tout seul : la phrase
 *      d'attente le nomme.
 *
 * ⚠ VALEURS LITTÉRALES, jamais le retour de la fonction testée. Une assertion
 * qui comparerait `texte` au résultat d'un constructeur de texte collapserait
 * avec lui : les deux côtés bougeraient ensemble et la mutation resterait
 * verte. C'est exactement le défaut trouvé sur `lienRenseignerFinanceur` au
 * lot C.2b-6.
 */

import {
  QUALITE_OF,
  mentionAttenteOf,
  ordreSignatairesEnvoyes,
  ordreSignatairesPrevu,
  texteOrdreSignataires,
} from '../ordre-signataires';
import type { SignataireEnvoye } from '@/lib/signature/envoi-contrats';

const CLIENT = { nom: 'Paul DURAND', email: 'paul.durand@provence-immo.fr' };
const OF = {
  nom: 'Laurent MARX',
  email: 'laurent@start-academy.fr',
  ordre: 'AFTER' as const,
};

describe('Prévu (récapitulatif) — le client d’abord, l’organisme ensuite', () => {
  it('la convention rend DEUX lignes numérotées, dans la forme dictée', () => {
    const ordre = ordreSignatairesPrevu({ docType: 'CONVENTION', client: CLIENT, of: OF });

    expect(ordre).toHaveLength(2);
    // ⚠ LITTÉRAL des deux côtés : c'est la forme que Laurent a dictée, mot pour
    // mot. Un tiret cadratin devenu demi-cadratin, une parenthèse perdue, et la
    // ligne ne se lit plus pareil — le test doit le voir.
    expect(ordre[0]!.texte).toBe('1. Paul DURAND — paul.durand@provence-immo.fr');
    expect(ordre[1]!.texte).toBe(
      '2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM',
    );
    expect(ordre[0]!.partie).toBe('CLIENT');
    expect(ordre[1]!.partie).toBe('OF');
    expect(ordre[0]!.rang).toBe(1);
    expect(ordre[1]!.rang).toBe(2);
  });

  it('l’attestation d’assiduité aussi : elle porte la seconde ancre', () => {
    const ordre = ordreSignatairesPrevu({ docType: 'ASSIDUITE', client: CLIENT, of: OF });
    expect(ordre).toHaveLength(2);
    expect(ordre[1]!.texte).toBe(
      '2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM',
    );
  });

  it('le dossier AGEFICE n’en rend QU’UNE : l’OF n’y re-signe pas', () => {
    const ordre = ordreSignatairesPrevu({ docType: 'AGEFICE', client: CLIENT, of: OF });
    expect(ordre).toHaveLength(1);
    expect(ordre[0]!.texte).toBe('1. Paul DURAND — paul.durand@provence-immo.fr');
    // Même si un signataire OF est passé, la TABLE des ancres tranche : le
    // formulaire officiel porte déjà l'image de signature de l'organisme.
    expect(ordre.map((s) => s.partie)).toEqual(['CLIENT']);
  });

  it('`BEFORE` inverse réellement les rangs — l’ordre n’est pas écrit en dur', () => {
    const ordre = ordreSignatairesPrevu({
      docType: 'CONVENTION',
      client: CLIENT,
      of: { ...OF, ordre: 'BEFORE' },
    });
    expect(ordre[0]!.texte).toBe(
      '1. Laurent MARX (organisme de formation), signe en premier depuis le CRM',
    );
    expect(ordre[1]!.texte).toBe('2. Paul DURAND — paul.durand@provence-immo.fr');
  });

  it('signataire OF non résolu : on ne l’invente pas, on rend la seule ligne sûre', () => {
    const ordre = ordreSignatairesPrevu({ docType: 'CONVENTION', client: CLIENT, of: null });
    expect(ordre).toHaveLength(1);
    expect(ordre[0]!.partie).toBe('CLIENT');
  });

  it('client non résolu : AUCUNE ligne — un « 1. » attribué à l’OF mentirait', () => {
    // Sans client, numéroter l'OF « 1. » puis écrire « signe en dernier »
    // produirait une ligne qui se contredit elle-même. La pièce ne partira pas
    // de toute façon : c'est l'empêchement du moteur qui le dit.
    expect(ordreSignatairesPrevu({ docType: 'CONVENTION', client: null, of: OF })).toEqual([]);
  });

  it('la forme assemblée est celle de l’énoncé, séparateur compris', () => {
    const ordre = ordreSignatairesPrevu({ docType: 'CONVENTION', client: CLIENT, of: OF });
    expect(texteOrdreSignataires(ordre)).toBe(
      '1. Paul DURAND — paul.durand@provence-immo.fr · ' +
        '2. Laurent MARX (organisme de formation), signe en dernier depuis le CRM',
    );
  });

  it('« organisme de formation » n’est écrit qu’à UN endroit', () => {
    expect(QUALITE_OF).toBe('organisme de formation');
  });
});

/* ── Envoyé (écran résultat) ──────────────────────────────────────────────── */

function envoye(over: Partial<SignataireEnvoye> = {}): SignataireEnvoye {
  return {
    partie: 'CLIENT',
    role: 'Client',
    nom: 'Paul DURAND',
    email: 'paul.durand@provence-immo.fr',
    signUrl: 'https://docuseal.eu/s/client',
    signedAt: null,
    ...over,
  };
}

const OF_ENVOYE: SignataireEnvoye = {
  partie: 'OF',
  role: 'Organisme de formation',
  nom: 'Laurent MARX',
  email: 'laurent@start-academy.fr',
  signUrl: 'https://docuseal.eu/s/of',
  signedAt: null,
};

describe('Envoyé — « Signer maintenant » ne s’ouvre QUE sur la donnée', () => {
  it('client non signé : PAS de lien pour l’OF, et la raison est dite', () => {
    const ordre = ordreSignatairesEnvoyes({ signataires: [envoye(), OF_ENVOYE] });

    expect(ordre).toHaveLength(2);
    const of = ordre[1]!;
    expect(of.partie).toBe('OF');
    // ⚠ LA PROMESSE : le lien n'existe pas tant que le client n'a pas signé.
    expect(of.signerMaintenant).toBe(false);
    expect(of.attente).not.toBeNull();
    // …et la phrase dit d'où viendra le changement d'état, sans le promettre.
    expect(of.attente).toContain('Paul DURAND');
    expect(of.attente).toContain('C.3');
  });

  it('client signé + lien rendu : le lien de l’OF s’ouvre, et l’attente disparaît', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [envoye({ signedAt: '2026-09-11T09:30:00.000Z' }), OF_ENVOYE],
    });

    const of = ordre[1]!;
    expect(of.signerMaintenant).toBe(true);
    expect(of.attente).toBeNull();
    // Le lien est celui du signataire OF, jamais celui du client.
    expect(of.signUrl).toBe('https://docuseal.eu/s/of');
    expect(ordre[0]!.signUrl).toBe('https://docuseal.eu/s/client');
  });

  it('client signé mais AUCUN lien pour l’OF : on le dit, on n’ouvre rien', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [
        envoye({ signedAt: '2026-09-11T09:30:00.000Z' }),
        { ...OF_ENVOYE, signUrl: null },
      ],
    });
    const of = ordre[1]!;
    expect(of.signerMaintenant).toBe(false);
    expect(of.attente).toContain('aucun lien');
  });

  it('OF déjà signé : plus de lien, plus d’attente — il n’a plus rien à faire', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [
        envoye({ signedAt: '2026-09-11T09:30:00.000Z' }),
        { ...OF_ENVOYE, signedAt: '2026-09-11T10:00:00.000Z' },
      ],
    });
    const of = ordre[1]!;
    expect(of.aSigne).toBe(true);
    expect(of.signerMaintenant).toBe(false);
    expect(of.attente).toBeNull();
  });

  it('pièce à un seul signataire (AGEFICE) : une ligne, aucun lien OF nulle part', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [envoye({ role: 'Stagiaire' })],
    });
    expect(ordre).toHaveLength(1);
    expect(ordre[0]!.texte).toBe('1. Paul DURAND — paul.durand@provence-immo.fr');
    expect(ordre.some((s) => s.signerMaintenant)).toBe(false);
  });

  it('l’ordre RENDU est celui du moteur : `BEFORE` se lit « signe en premier »', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [OF_ENVOYE, envoye()],
    });
    expect(ordre[0]!.texte).toBe(
      '1. Laurent MARX (organisme de formation), signe en premier depuis le CRM',
    );
    expect(ordre[1]!.texte).toBe('2. Paul DURAND — paul.durand@provence-immo.fr');
  });
});

describe('La phrase d’attente — honnête sur ce que cet écran sait, et ne sait pas', () => {
  it('client pas encore signé : elle nomme la personne attendue ET le lot qui branchera le retour', () => {
    const phrase = mentionAttenteOf({
      nomClient: 'Paul DURAND',
      clientASigne: false,
      signUrlOf: 'https://docuseal.eu/s/of',
    });
    expect(phrase).not.toBeNull();
    expect(phrase!).toContain('Paul DURAND');
    expect(phrase!).toContain('lot C.3');
    // ⚠ Elle ne doit PAS promettre une mise à jour automatique de cet écran :
    // rien ne remplit `signedAt` avant le webhook.
    expect(phrase!).toContain('prestataire');
  });

  it('tout est réuni : aucune phrase — un écran qui explique une absence inexistante fait douter', () => {
    expect(
      mentionAttenteOf({
        nomClient: 'Paul DURAND',
        clientASigne: true,
        signUrlOf: 'https://docuseal.eu/s/of',
      }),
    ).toBeNull();
  });
});
