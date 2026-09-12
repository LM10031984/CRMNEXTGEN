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
 *  (c) **L'honnêteté sur ce que cet écran sait.** `signedAt` ne se remplit que
 *      par le retour du prestataire. Depuis le lot C.3 ce retour EXISTE — la
 *      phrase d'attente ne promet plus un branchement à venir, elle dit d'où
 *      vient l'information et ce qu'il faut faire pour la voir (recharger).
 *      Une phrase qui nomme encore « le lot C.3 » ferait attendre ce qui est
 *      déjà là : c'est le défaut D-C3-1 de la recette du 11/09/2026.
 *  (d) **La date de signature est LISIBLE.** « a signé » sans date ne permet
 *      pas de savoir si l'on attend depuis une heure ou depuis trois semaines —
 *      et c'est la seule question que l'admin se pose devant une pièce partie.
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
  mentionAttentePiece,
  mentionSignatureFaite,
  ordreSignatairesEnvoyes,
  ordreSignatairesPrevu,
  prochainSignataire,
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
    // ⚠ LITTÉRAL, et la phrase ne nomme PLUS « le lot C.3 » : ce retour est
    // branché depuis le 11/09/2026 (défaut D-C3-1 de la recette). Elle dit d'où
    // vient l'information et le geste pour la voir — jamais un branchement à
    // venir, qui ferait attendre ce qui est déjà là.
    expect(of.attente).toBe(
      'Le lien « Signer maintenant » s’ouvrira ici dès que Paul DURAND aura signé. ' +
        'QualiOF l’apprend par le retour du prestataire : rechargez la fiche session pour ' +
        'voir l’état du moment.',
    );
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
  it('client pas encore signé : elle nomme la personne attendue ET d’où vient l’information', () => {
    const phrase = mentionAttenteOf({
      nomClient: 'Paul DURAND',
      clientASigne: false,
      signUrlOf: 'https://docuseal.eu/s/of',
    });
    // ⚠ LITTÉRAL : c'est la phrase que l'admin lit, au caractère près.
    expect(phrase).toBe(
      'Le lien « Signer maintenant » s’ouvrira ici dès que Paul DURAND aura signé. ' +
        'QualiOF l’apprend par le retour du prestataire : rechargez la fiche session pour ' +
        'voir l’état du moment.',
    );
    // ⚠ ELLE NE NOMME PLUS UN LOT À VENIR. Le retour du prestataire est branché
    // depuis le 11/09/2026 ; laisser « arrive au lot C.3 » ferait attendre ce
    // qui fonctionne déjà — défaut D-C3-1 de la recette.
    expect(phrase!).not.toContain('C.3');
    expect(phrase!).not.toContain('tant qu’il ne l’est pas');
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

/* ── D-C3-1 — l'état PAR SIGNATAIRE, tel que la recette l'a réclamé ───────── */

describe('La date de signature — « a signé » sans date ne dit pas depuis quand', () => {
  it('rend le jour ET l’heure, en fuseau de Paris', () => {
    // 18:01 à Paris = 16:01 UTC en septembre (UTC+2). Le fuseau est FIXÉ :
    // sans lui, la même signature se lirait « 16:01 » sur un serveur en UTC,
    // et l'admin comparerait deux heures qui ne parlent pas de la même chose.
    expect(mentionSignatureFaite('2026-09-11T16:01:00.000Z')).toBe(
      'a signé le 11/09/2026 à 18:01',
    );
  });

  it('pas de date : aucune mention — on n’écrit pas « a signé le — »', () => {
    expect(mentionSignatureFaite(null)).toBeNull();
    expect(mentionSignatureFaite('pas-une-date')).toBeNull();
  });

  it('l’ordre ENVOYÉ transporte `signedAt` tel quel : sans lui, rien à afficher', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [envoye({ signedAt: '2026-09-11T16:01:00.000Z' }), OF_ENVOYE],
    });
    expect(ordre[0]!.signedAt).toBe('2026-09-11T16:01:00.000Z');
    expect(ordre[1]!.signedAt).toBeNull();
  });

  it('l’ordre PRÉVU n’en porte aucune : rien n’est signé avant d’être envoyé', () => {
    const ordre = ordreSignatairesPrevu({ docType: 'CONVENTION', client: CLIENT, of: OF });
    expect(ordre.map((s) => s.signedAt)).toEqual([null, null]);
  });
});

describe('Qui est attendu — la phrase de la LIGNE, celle que D-C3-1 a trouvée fausse', () => {
  it('personne n’a signé : c’est le client qu’on attend, nommé', () => {
    const ordre = ordreSignatairesEnvoyes({ signataires: [envoye(), OF_ENVOYE] });
    expect(prochainSignataire(ordre)?.nom).toBe('Paul DURAND');
    expect(mentionAttentePiece(ordre)).toBe(
      'En attente de la signature de Paul DURAND. Dès que tous les signataires auront ' +
        'signé, le PDF signé et son certificat de signature reviendront ici automatiquement.',
    );
  });

  it('le client a signé : c’est l’organisme qu’on attend, et la phrase change de main', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [envoye({ signedAt: '2026-09-11T16:01:00.000Z' }), OF_ENVOYE],
    });
    expect(prochainSignataire(ordre)?.partie).toBe('OF');
    expect(mentionAttentePiece(ordre)).toBe(
      'Il ne manque plus que la signature de Laurent MARX pour l’organisme de formation. ' +
        'Dès qu’elle sera faite, le PDF signé et son certificat de signature reviendront ici ' +
        'automatiquement.',
    );
  });

  it('tout le monde a signé : AUCUNE phrase — la preuve est en route, pas en attente', () => {
    const ordre = ordreSignatairesEnvoyes({
      signataires: [
        envoye({ signedAt: '2026-09-11T16:01:00.000Z' }),
        { ...OF_ENVOYE, signedAt: '2026-09-11T16:08:00.000Z' },
      ],
    });
    expect(prochainSignataire(ordre)).toBeNull();
    expect(mentionAttentePiece(ordre)).toBeNull();
  });

  it('aucun signataire lisible : aucune phrase inventée', () => {
    expect(prochainSignataire([])).toBeNull();
    expect(mentionAttentePiece([])).toBeNull();
  });

  it('la phrase ne promet plus rien pour « plus tard » : le retour est branché', () => {
    const ordre = ordreSignatairesEnvoyes({ signataires: [envoye({ role: 'Stagiaire' })] });
    const phrase = mentionAttentePiece(ordre);
    expect(phrase).not.toBeNull();
    expect(phrase!).not.toContain('C.2c');
    expect(phrase!).not.toContain('C.3');
  });
});
