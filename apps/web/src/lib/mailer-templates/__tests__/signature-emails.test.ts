import { describe, it, expect } from 'vitest';

/**
 * Les CINQ gabarits de la chaîne de signature — lot C.2c.
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
 * C'est un choix explicite de Laurent (11/09/2026) — les écrire et les PROUVER
 * maintenant, les brancher en C.3. Ce fichier est donc, pour eux, la seule
 * garde existante : il vérifie ce que le gabarit COMPOSE, jamais qu'un email
 * part. `evidence/signature-C/README.md` le dit noir sur blanc.
 */

import type { OfConfig } from '@/lib/of-config';
import {
  LIBELLE_QUALITE,
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
const PIECE = 'Convention — AGENCE MARTIN & FILS';

function demande(over: Partial<SignatureDemandeInput> = {}): SignatureDemandeInput {
  return {
    signataireNom: 'Claire DUPONT',
    qualiteSignataire: 'responsable-organisation',
    libellePiece: PIECE,
    formationTitre: "L'IA au service de l'agent commercial",
    sessionCode: 'SES-0048',
    signUrl: LIEN,
    dateLimite: new Date('2026-10-11T09:00:00.000Z'),
    ...over,
  };
}

function relance(over: Partial<SignatureRelanceInput> = {}): SignatureRelanceInput {
  return { ...demande(), rang: 1, envoyeeLe: new Date('2026-09-11T09:00:00.000Z'), ...over };
}

function exemplaire(over: Partial<SignatureExemplaireInput> = {}): SignatureExemplaireInput {
  return {
    signataireNom: 'Claire DUPONT',
    qualiteSignataire: 'responsable-organisation',
    libellePiece: PIECE,
    formationTitre: "L'IA au service de l'agent commercial",
    sessionCode: 'SES-0048',
    signeLe: new Date('2026-09-20T14:30:00.000Z'),
    piecesJointes: ['convention-agence-martin.pdf', 'convention-agence-martin.audit-trail.pdf'],
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

describe('T2.1 — demande de signature client : le lien exact, la pièce nommée', () => {
  it('le signUrl LITTÉRAL est dans le html ET dans le texte de repli', () => {
    const { html, text } = renderSignatureDemandeClient(demande(), OF);
    expect(html).toContain('https://docuseal.eu/s/ABC123');
    expect(text).toContain('https://docuseal.eu/s/ABC123');
  });

  it("l'objet nomme la pièce, en toutes lettres", () => {
    expect(renderSignatureDemandeClient(demande(), OF).subject).toBe(
      'Signature demandée — Convention — AGENCE MARTIN & FILS',
    );
  });

  it("l'objet de l'OF dit que c'est son tour", () => {
    expect(renderSignatureDemandeOf(demande(), OF).subject).toBe(
      'À votre tour de signer — Convention — AGENCE MARTIN & FILS',
    );
  });

  it('PUISSANCE — UN SEUL lien cliquable : celui de la signature, jamais un lien vers QualiOF', () => {
    const { html } = renderSignatureDemandeClient(demande(), OF);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['https://docuseal.eu/s/ABC123']);
  });

  it('la date limite est écrite EN TOUTES LETTRES — une date se vérifie, une durée se discute', () => {
    const { html, text } = renderSignatureDemandeClient(demande(), OF);
    expect(html).toContain('11 octobre 2026');
    expect(text).toContain('11 octobre 2026');
    expect(html).not.toContain('30 jours');
  });

  it('aucun montant, aucun tarif : ce n’est pas un email commercial', () => {
    const { subject, html, text } = renderSignatureDemandeClient(demande(), OF);
    for (const t of [subject, html, text]) {
      expect(t).not.toMatch(/€|EUR\b|\bHT\b|\bTTC\b/);
    }
  });

  it('la formation et le code session sont nommés — trois demandes le même jour se distinguent', () => {
    const { html } = renderSignatureDemandeClient(demande(), OF);
    expect(html).toContain('SES-0048');
    expect(html).toContain("L&#39;IA au service de l&#39;agent commercial");
  });
});

describe('T2.2 — échappement : une raison sociale est saisie par un humain', () => {
  it('« AGENCE <b>MARTIN</b> & FILS » ressort échappée, jamais en balises', () => {
    const { html } = renderSignatureDemandeClient(
      demande({ libellePiece: 'AGENCE <b>MARTIN</b> & FILS' }),
      OF,
    );
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<b>MARTIN</b>');
  });

  it('le nom du signataire est échappé lui aussi', () => {
    const { html } = renderSignatureDemandeClient(
      demande({ signataireNom: 'Claire <script>alert(1)</script>' }),
      OF,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('T2.12 / T2.13 — VOCABULAIRE : jamais « dirigeant », et la qualité est REÇUE', () => {
  it('les trois libellés de qualité sont ceux-là, et pas d’autres', () => {
    expect(LIBELLE_QUALITE['responsable-organisation']).toBe("responsable de l'organisation");
    expect(LIBELLE_QUALITE.stagiaire).toBe('stagiaire');
    expect(LIBELLE_QUALITE.of).toBe("signataire de l'organisme de formation");
  });

  it('T2.12 — aucun des cinq rendus n’écrit « dirigeant », pour aucune qualité', () => {
    const rendus = [
      renderSignatureDemandeClient(demande({ qualiteSignataire: 'responsable-organisation' }), OF),
      renderSignatureDemandeClient(demande({ qualiteSignataire: 'stagiaire' }), OF),
      renderSignatureDemandeOf(demande(), OF),
      renderSignatureRelance(relance({ rang: 1 }), OF),
      renderSignatureRelance(relance({ rang: 2 }), OF),
      renderSignatureExemplaire(exemplaire(), OF),
      renderSignatureExemplaire(exemplaire({ qualiteSignataire: 'stagiaire' }), OF),
    ];
    for (const r of rendus) {
      expect(contientDirigeant(r.subject, r.html, r.text)).toBe(false);
    }
  });

  it('T2.13 — « stagiaire » reçu ⇒ le corps dit « stagiaire », PAS « responsable de l’organisation »', () => {
    // Le cas de l'indépendant qui signe sa propre convention : l'ancre du
    // gabarit dit `Client`, le régime dit `STAGIAIRE`. C'est le régime qui nomme.
    const { html } = renderSignatureDemandeClient(demande({ qualiteSignataire: 'stagiaire' }), OF);
    expect(html).toContain('stagiaire');
    expect(html).not.toContain("responsable de l'organisation");
    expect(html).not.toContain('responsable de l&#39;organisation');
  });

  it('« responsable-organisation » reçu ⇒ le corps le dit, et ne dit pas « stagiaire »', () => {
    const { html } = renderSignatureDemandeClient(
      demande({ qualiteSignataire: 'responsable-organisation' }),
      OF,
    );
    expect(html).toContain('responsable de l&#39;organisation');
    expect(html).not.toContain('stagiaire');
  });
});

describe('gabarit 3/4 — les relances J+3 et J+7 (rendues ici, branchées au lot C.3)', () => {
  it('rang 1 ⇒ objet de rappel ; rang 2 ⇒ objet de DERNIER rappel', () => {
    expect(renderSignatureRelance(relance({ rang: 1 }), OF).subject).toBe(
      'Rappel — Convention — AGENCE MARTIN & FILS attend votre signature',
    );
    expect(renderSignatureRelance(relance({ rang: 2 }), OF).subject).toBe(
      'Dernier rappel — Convention — AGENCE MARTIN & FILS attend votre signature',
    );
  });

  it('la relance porte le MÊME lien que la demande — jamais un lien régénéré', () => {
    const { html, text } = renderSignatureRelance(relance(), OF);
    expect(html).toContain('https://docuseal.eu/s/ABC123');
    expect(text).toContain('https://docuseal.eu/s/ABC123');
  });

  it('elle rappelle la date d’envoi ET la date limite — les deux, en toutes lettres', () => {
    const { text } = renderSignatureRelance(relance(), OF);
    expect(text).toContain('11 septembre 2026');
    expect(text).toContain('11 octobre 2026');
  });

  it('PUISSANCE — le dernier rappel DIT que c’est le dernier : après, plus rien ne part', () => {
    const { text } = renderSignatureRelance(relance({ rang: 2 }), OF);
    expect(text).toContain('dernier rappel');
  });
});

describe('gabarit 5 — l’exemplaire signé (rendu ici, branché au lot C.3)', () => {
  it("l'objet annonce l'exemplaire, pas une demande", () => {
    expect(renderSignatureExemplaire(exemplaire(), OF).subject).toBe(
      'Votre exemplaire signé — Convention — AGENCE MARTIN & FILS',
    );
  });

  it('AUCUN lien cliquable : tout est en pièce jointe, rien à aller chercher', () => {
    const { html } = renderSignatureExemplaire(exemplaire(), OF);
    expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual([]);
  });

  it('le CERTIFICAT de signature est annoncé nommément — c’est ce que les AGEFICE réclament', () => {
    const { html, text } = renderSignatureExemplaire(exemplaire(), OF);
    expect(text).toContain('convention-agence-martin.pdf');
    expect(text).toContain('convention-agence-martin.audit-trail.pdf');
    expect(html).toContain('certificat de signature');
  });

  it('PUISSANCE — chaque pièce jointe reçue est ANNONCÉE : une pièce muette est une pièce perdue', () => {
    const { text } = renderSignatureExemplaire(
      exemplaire({ piecesJointes: ['a.pdf', 'b.pdf', 'c.audit-trail.pdf'] }),
      OF,
    );
    for (const f of ['a.pdf', 'b.pdf', 'c.audit-trail.pdf']) expect(text).toContain(f);
  });

  it('la date de signature est écrite en toutes lettres', () => {
    expect(renderSignatureExemplaire(exemplaire(), OF).text).toContain('20 septembre 2026');
  });
});

describe('les cinq gabarits partagent UNE mise en page', () => {
  it('tous portent l’en-tête et le pied de l’organisme', () => {
    const rendus = [
      renderSignatureDemandeClient(demande(), OF),
      renderSignatureDemandeOf(demande(), OF),
      renderSignatureRelance(relance(), OF),
      renderSignatureExemplaire(exemplaire(), OF),
    ];
    for (const r of rendus) {
      expect(r.html).toContain('Start Academy');
      expect(r.html).toContain('12345678900011');
      expect(r.html).toContain('11755555555');
      expect(r.html.startsWith('<!DOCTYPE html>')).toBe(true);
    }
  });

  it('tous rendent un texte de repli non vide', () => {
    const rendus = [
      renderSignatureDemandeClient(demande(), OF),
      renderSignatureDemandeOf(demande(), OF),
      renderSignatureRelance(relance(), OF),
      renderSignatureExemplaire(exemplaire(), OF),
    ];
    for (const r of rendus) expect(r.text.trim().length).toBeGreaterThan(80);
  });
});
