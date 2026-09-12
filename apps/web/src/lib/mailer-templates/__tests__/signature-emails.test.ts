import { describe, it, expect } from 'vitest';

/**
 * Les CINQ gabarits de la chaîne de signature — lot C.2c, texte revu le
 * 11/09/2026 (retours Laurent sur `evidence/signature-C`).
 *
 * DEUX MODES DE PANNE, rappelés ici parce qu'onze tests de ce chantier s'y sont
 * perdus :
 *
 * (1) **Le test compare au retour de la fonction testée.** Écrire
 *     `expect(html).toContain(input.signUrl)` ne garde RIEN : changer le gabarit
 *     ET l'entrée laisse tout vert. Toutes les valeurs attendues de ce fichier
 *     sont des constantes LITTÉRALES, écrites ici.
 * (2) **Le calcul est gardé, le câblage ne l'est pas.** Un gabarit parfait dont
 *     personne n'appelle le rendu passe tous ses tests. Le fil vit dans
 *     `signature/__tests__/notifier.test.ts` et
 *     `server/actions/__tests__/signature-envoi.notification.test.ts`.
 *
 * ⚠ TROIS DE CES CINQ GABARITS N'ONT AUCUN APPELANT (relances J+3/J+7,
 * exemplaire signé) : leur déclencheur est le webhook et le cron du lot C.3.
 * Ce fichier est donc, pour eux, la seule garde existante — il vérifie ce que le
 * gabarit COMPOSE, jamais qu'un email part.
 */

import type { OfConfig } from '@/lib/of-config';
import {
  LIBELLE_QUALITE,
  phraseDeRole,
  renderSignatureDemandeClient,
  renderSignatureDemandeOf,
  type SignatureDemandeInput,
} from '../signature-demande';
import { renderSignatureRelance, type SignatureRelanceInput } from '../signature-relance';
import {
  renderSignatureExemplaire,
  type SignatureExemplaireInput,
} from '../signature-exemplaire';

const OF = {
  name: 'Start Academy',
  siret: '12345678900011',
  rnq: '11755555555',
  addressFull: '10 rue des Tests, 75000 Paris',
} as unknown as OfConfig;

const LIEN = 'https://docuseal.eu/s/ABC123';
const ORGANISATION = 'AGENCE MARTIN & FILS';
const FORMATION = "L'IA au service de l'agent commercial";
const EXPEDITEUR = { nom: 'Laurent Marx', telephone: '06 12 34 56 78' };

/** Point 3 — la phrase qui rassure, sous le bouton. Valeur littérale. */
const RASSURANCE =
  'La signature prend deux minutes, depuis un ordinateur ou un téléphone, sans créer de ' +
  'compte. Une question ? Répondez simplement à ce message.';

function demande(over: Partial<SignatureDemandeInput> = {}): SignatureDemandeInput {
  return {
    signataireNom: 'Claire DUPONT',
    qualiteSignataire: 'responsable-organisation',
    piece: 'CONVENTION',
    concerne: ORGANISATION,
    organisation: ORGANISATION,
    libellePiece: `Convention — ${ORGANISATION} (2 participants)`,
    formationTitre: FORMATION,
    sessionCode: 'SES-0048',
    signUrl: LIEN,
    dateLimite: new Date('2026-10-11T09:00:00.000Z'),
    expediteur: EXPEDITEUR,
    ...over,
  };
}

function agefice(over: Partial<SignatureDemandeInput> = {}): SignatureDemandeInput {
  return demande({
    signataireNom: 'Marie EXEMPLE',
    qualiteSignataire: 'stagiaire',
    piece: 'AGEFICE',
    concerne: 'Marie EXEMPLE',
    libellePiece: 'Dossier AGEFICE — Marie EXEMPLE',
    ...over,
  });
}

function relance(over: Partial<SignatureRelanceInput> = {}): SignatureRelanceInput {
  return { ...demande(), rang: 1, envoyeeLe: new Date('2026-09-11T09:00:00.000Z'), ...over };
}

function exemplaire(over: Partial<SignatureExemplaireInput> = {}): SignatureExemplaireInput {
  return {
    signataireNom: 'Claire DUPONT',
    qualiteSignataire: 'responsable-organisation',
    piece: 'CONVENTION',
    concerne: ORGANISATION,
    organisation: ORGANISATION,
    libellePiece: `Convention — ${ORGANISATION} (2 participants)`,
    formationTitre: FORMATION,
    sessionCode: 'SES-0048',
    signeLe: new Date('2026-09-20T14:30:00.000Z'),
    piecesJointes: ['convention-agence-martin.pdf', 'convention-agence-martin.audit-trail.pdf'],
    expediteur: EXPEDITEUR,
    ...over,
  };
}

/** Casse + accents normalisés : « Dirigeant » et « dirigeants » comptent. */
function contientDirigeant(...textes: string[]): boolean {
  return textes.some((t) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .includes('dirigeant'),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('POINT 5 — les objets nomment la PIÈCE et QUI elle concerne', () => {
  it('convention ⇒ « Convention à signer — {organisation} »', () => {
    expect(renderSignatureDemandeClient(demande(), OF).subject).toBe(
      'Convention à signer — AGENCE MARTIN & FILS',
    );
  });

  it('dossier AGEFICE ⇒ « Dossier AGEFICE à signer — {stagiaire} »', () => {
    expect(renderSignatureDemandeClient(agefice(), OF).subject).toBe(
      'Dossier AGEFICE à signer — Marie EXEMPLE',
    );
  });

  it('assiduité ⇒ « Attestation d’assiduité à signer — {stagiaire} »', () => {
    expect(
      renderSignatureDemandeClient(
        agefice({ piece: 'ASSIDUITE', libellePiece: 'Attestation — Marie EXEMPLE' }),
        OF,
      ).subject,
    ).toBe("Attestation d'assiduité à signer — Marie EXEMPLE");
  });

  it('relance rang 1 ⇒ « Rappel : votre convention attend votre signature »', () => {
    expect(renderSignatureRelance(relance({ rang: 1 }), OF).subject).toBe(
      'Rappel : votre convention attend votre signature',
    );
  });

  it('relance rang 2 ⇒ « Dernier rappel : … »', () => {
    expect(renderSignatureRelance(relance({ rang: 2 }), OF).subject).toBe(
      'Dernier rappel : votre convention attend votre signature',
    );
  });

  it('la relance d’un dossier AGEFICE dit « votre dossier AGEFICE », pas « votre convention »', () => {
    expect(renderSignatureRelance(relance({ ...agefice(), rang: 1, envoyeeLe: new Date() }), OF).subject).toBe(
      'Rappel : votre dossier AGEFICE attend votre signature',
    );
  });

  it('l’objet de l’ORGANISME reste inchangé — c’est un email interne', () => {
    expect(renderSignatureDemandeOf(demande(), OF).subject).toBe(
      'À votre tour de signer — Convention — AGENCE MARTIN & FILS (2 participants)',
    );
  });
});

describe('POINT 1 — la phrase de rôle nomme l’organisation, ou l’inscription', () => {
  it('responsable ⇒ « en tant que responsable de {organisation} »', () => {
    expect(phraseDeRole('responsable-organisation', ORGANISATION)).toBe(
      'Vous recevez ce message en tant que responsable de AGENCE MARTIN & FILS.',
    );
  });

  it('stagiaire ⇒ « en tant que stagiaire, pour votre propre inscription »', () => {
    expect(phraseDeRole('stagiaire', ORGANISATION)).toBe(
      'Vous recevez ce message en tant que stagiaire, pour votre propre inscription.',
    );
  });

  it('organisme ⇒ INCHANGÉ', () => {
    expect(phraseDeRole('of', ORGANISATION)).toBe(
      "Vous recevez ce message en qualité de signataire de l'organisme de formation.",
    );
  });

  it('PUISSANCE — organisation inconnue ⇒ repli honnête, jamais « responsable de null »', () => {
    const phrase = phraseDeRole('responsable-organisation', null);
    expect(phrase).toBe("Vous recevez ce message en tant que responsable de l'organisation.");
    expect(phrase).not.toContain('null');
  });

  it('PUISSANCE — une organisation faite d’espaces est une organisation ABSENTE', () => {
    expect(phraseDeRole('responsable-organisation', '   ')).toBe(
      "Vous recevez ce message en tant que responsable de l'organisation.",
    );
  });

  it('la phrase est celle que le corps rend réellement', () => {
    expect(renderSignatureDemandeClient(demande(), OF).text).toContain(
      'Vous recevez ce message en tant que responsable de AGENCE MARTIN & FILS.',
    );
    expect(renderSignatureDemandeClient(agefice(), OF).text).toContain(
      'Vous recevez ce message en tant que stagiaire, pour votre propre inscription.',
    );
  });
});

describe('POINT 2 — une phrase de contexte AVANT le document', () => {
  it('responsable ⇒ « …l’inscription de votre équipe…, il reste une signature : la vôtre. »', () => {
    expect(renderSignatureDemandeClient(demande(), OF).text).toContain(
      "Pour finaliser l'inscription de votre équipe à la formation L'IA au service de " +
        "l'agent commercial, il reste une signature : la vôtre.",
    );
  });

  it('stagiaire ⇒ « Pour finaliser votre inscription à {formation}, il reste votre signature. »', () => {
    expect(renderSignatureDemandeClient(agefice(), OF).text).toContain(
      "Pour finaliser votre inscription à L'IA au service de l'agent commercial, il reste " +
        'votre signature.',
    );
  });

  it('PUISSANCE — elle vient AVANT le bloc du document, pas après', () => {
    const { text } = renderSignatureDemandeClient(demande(), OF);
    expect(text.indexOf('il reste une signature')).toBeLessThan(text.indexOf('- Document :'));
  });

  it('l’organisme garde son intro interne — on ne lui parle pas d’inscription', () => {
    const { text } = renderSignatureDemandeOf(demande(), OF);
    expect(text).toContain("C'est à votre tour de signer ce document.");
    expect(text).not.toContain('il reste une signature');
  });
});

describe('POINT 3 — rassurer sur le geste, sous le bouton', () => {
  it.each([
    ['demande client', () => renderSignatureDemandeClient(demande(), OF)],
    ['demande organisme', () => renderSignatureDemandeOf(demande(), OF)],
    ['relance J+3', () => renderSignatureRelance(relance({ rang: 1 }), OF)],
    ['relance J+7', () => renderSignatureRelance(relance({ rang: 2 }), OF)],
  ])('%s : la phrase est là, en html ET en texte', (_nom, rendre) => {
    const { html, text } = rendre();
    expect(text).toContain(RASSURANCE);
    expect(html).toContain('sans créer de compte');
    expect(html).toContain('Répondez simplement à ce message');
  });

  it('PUISSANCE — elle vient APRÈS le bouton, pas avant : elle rassure sur le geste', () => {
    const { html } = renderSignatureDemandeClient(demande(), OF);
    expect(html.indexOf('Signer le document')).toBeLessThan(html.indexOf('sans créer de compte'));
  });

  it('l’exemplaire signé NE la porte pas : il n’y a plus de geste à faire', () => {
    expect(renderSignatureExemplaire(exemplaire(), OF).text).not.toContain('sans créer de compte');
  });
});

describe('POINT 4 — la signature est une PERSONNE, jamais « l’équipe »', () => {
  it.each([
    ['demande client', () => renderSignatureDemandeClient(demande(), OF)],
    ['demande organisme', () => renderSignatureDemandeOf(demande(), OF)],
    ['relance J+3', () => renderSignatureRelance(relance(), OF)],
    ['exemplaire signé', () => renderSignatureExemplaire(exemplaire(), OF)],
  ])('%s : « Laurent Marx — Start Academy » et le téléphone', (_nom, rendre) => {
    const { html, text } = rendre();
    expect(text).toContain('Laurent Marx — Start Academy');
    expect(text).toContain('06 12 34 56 78');
    expect(html).toContain('Laurent Marx — Start Academy');
    expect(html).toContain('06 12 34 56 78');
  });

  it('PUISSANCE — « L’équipe » a disparu des cinq gabarits', () => {
    const rendus = [
      renderSignatureDemandeClient(demande(), OF),
      renderSignatureDemandeOf(demande(), OF),
      renderSignatureRelance(relance({ rang: 1 }), OF),
      renderSignatureRelance(relance({ rang: 2 }), OF),
      renderSignatureExemplaire(exemplaire(), OF),
    ];
    for (const r of rendus) {
      expect(r.text).not.toContain("L'équipe");
      expect(r.html).not.toContain('L&#39;équipe');
    }
  });

  it('sans téléphone connu, la ligne disparaît — jamais « — null »', () => {
    const { html, text } = renderSignatureDemandeClient(
      demande({ expediteur: { nom: 'Laurent Marx', telephone: null } }),
      OF,
    );
    expect(text).toContain('Laurent Marx — Start Academy');
    expect(text).not.toContain('null');
    expect(html).not.toContain('null');
  });

  it('relance J+7 : « nous vous renverrons une nouvelle demande », pas « réémis »', () => {
    const { text } = renderSignatureRelance(relance({ rang: 2 }), OF);
    expect(text).toContain('nous vous renverrons une nouvelle demande');
    expect(text).not.toContain('réémis');
    expect(renderSignatureRelance(relance({ rang: 2 }), OF).html).not.toContain('réémis');
  });
});

describe('ce qui ne devait PAS bouger — les gardes du premier jet', () => {
  it('le signUrl LITTÉRAL est dans le html ET dans le texte', () => {
    const { html, text } = renderSignatureDemandeClient(demande(), OF);
    expect(html).toContain('https://docuseal.eu/s/ABC123');
    expect(text).toContain('https://docuseal.eu/s/ABC123');
  });

  it('UN SEUL lien cliquable dans la demande : celui de la signature', () => {
    const { html } = renderSignatureDemandeClient(demande(), OF);
    expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual([
      'https://docuseal.eu/s/ABC123',
    ]);
  });

  it('AUCUN lien dans l’exemplaire signé : tout est joint', () => {
    const { html } = renderSignatureExemplaire(exemplaire(), OF);
    expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual([]);
  });

  it('la date limite en toutes lettres, jamais « 30 jours »', () => {
    const { html, text } = renderSignatureDemandeClient(demande(), OF);
    expect(html).toContain('11 octobre 2026');
    expect(text).toContain('11 octobre 2026');
    expect(html).not.toContain('30 jours');
  });

  it('aucun montant, aucun tarif', () => {
    const { subject, html, text } = renderSignatureDemandeClient(demande(), OF);
    for (const t of [subject, html, text]) expect(t).not.toMatch(/€|EUR\b|\bHT\b|\bTTC\b/);
  });

  it('T2.2 — échappement : « AGENCE <b>MARTIN</b> & FILS » ressort échappée', () => {
    const { html } = renderSignatureDemandeClient(
      demande({ organisation: 'AGENCE <b>MARTIN</b> & FILS', concerne: 'AGENCE <b>MARTIN</b> & FILS' }),
      OF,
    );
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<b>MARTIN</b>');
  });

  it('le nom de l’expéditeur est échappé lui aussi', () => {
    const { html } = renderSignatureDemandeClient(
      demande({ expediteur: { nom: 'Laurent <script>x</script>', telephone: null } }),
      OF,
    );
    expect(html).not.toContain('<script>');
  });

  it('T2.12 — aucun des rendus n’écrit « dirigeant », pour aucune qualité', () => {
    const rendus = [
      renderSignatureDemandeClient(demande(), OF),
      renderSignatureDemandeClient(agefice(), OF),
      renderSignatureDemandeOf(demande(), OF),
      renderSignatureRelance(relance({ rang: 1 }), OF),
      renderSignatureRelance(relance({ rang: 2 }), OF),
      renderSignatureExemplaire(exemplaire(), OF),
      renderSignatureExemplaire(exemplaire({ qualiteSignataire: 'stagiaire' }), OF),
    ];
    for (const r of rendus) expect(contientDirigeant(r.subject, r.html, r.text)).toBe(false);
  });

  it('le dictionnaire de repli garde ses trois entrées', () => {
    expect(LIBELLE_QUALITE['responsable-organisation']).toBe("responsable de l'organisation");
    expect(LIBELLE_QUALITE.stagiaire).toBe('stagiaire');
    expect(LIBELLE_QUALITE.of).toBe("signataire de l'organisme de formation");
  });

  it('la relance rappelle la date d’envoi ET la date limite', () => {
    const { text } = renderSignatureRelance(relance(), OF);
    expect(text).toContain('11 septembre 2026');
    expect(text).toContain('11 octobre 2026');
  });

  it('la relance porte le MÊME lien que la demande', () => {
    const { html, text } = renderSignatureRelance(relance(), OF);
    expect(html).toContain('https://docuseal.eu/s/ABC123');
    expect(text).toContain('https://docuseal.eu/s/ABC123');
  });

  it('le CERTIFICAT de signature est annoncé nommément', () => {
    const { html, text } = renderSignatureExemplaire(exemplaire(), OF);
    expect(text).toContain('convention-agence-martin.pdf');
    expect(text).toContain('convention-agence-martin.audit-trail.pdf');
    expect(html).toContain('certificat de signature');
  });

  it('chaque pièce jointe REÇUE est annoncée', () => {
    const { text } = renderSignatureExemplaire(
      exemplaire({ piecesJointes: ['a.pdf', 'b.pdf', 'c.audit-trail.pdf'] }),
      OF,
    );
    for (const f of ['a.pdf', 'b.pdf', 'c.audit-trail.pdf']) expect(text).toContain(f);
  });

  it('tous portent l’en-tête et le pied de l’organisme, et un texte de repli', () => {
    const rendus = [
      renderSignatureDemandeClient(demande(), OF),
      renderSignatureDemandeOf(demande(), OF),
      renderSignatureRelance(relance(), OF),
      renderSignatureExemplaire(exemplaire(), OF),
    ];
    for (const r of rendus) {
      expect(r.html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(r.html).toContain('12345678900011');
      expect(r.html).toContain('11755555555');
      expect(r.text.trim().length).toBeGreaterThan(80);
    }
  });
});
