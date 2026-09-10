import { describe, it, expect } from 'vitest';

/**
 * Lot B — ancres de signature (spec 2026-09-04 §5 lot B, D-7).
 *
 * DocuSeal positionne ses champs à partir de **text tags** imprimés dans le PDF
 * (`{{Signature;role=Client;type=signature}}`) : plus aucune coordonnée à
 * maintenir côté QualiOF. Les ancres sont rendues en blanc sur blanc — le
 * lecteur ne voit rien, l'extracteur de texte de DocuSeal les lit.
 *
 * Ce que ces tests verrouillent :
 *  1. La syntaxe exacte du tag (séparateur `;`, `role=`, `type=`) — une faute
 *     ici et DocuSeal ne crée aucun champ, sans erreur : l'envoi part et le
 *     signataire n'a rien à signer.
 *  2. L'invisibilité (couleur blanche) ET l'insécabilité (`nowrap`) : un tag
 *     coupé en fin de ligne par WeasyPrint n'est plus reconnu.
 *  3. Le refus des caractères qui cassent le tag (`;` `{` `}` `=`) dans un nom
 *     ou un rôle — échec bruyant plutôt que champ silencieusement absent.
 *
 * PROTOCOLE DE MUTATION : dans `text-tags.ts`, remplacer le séparateur `;` par
 * `,` → le test 1 vire ROUGE. Retirer `white-space: nowrap` → test 4 ROUGE.
 */

import {
  SIGNATURE_ROLES,
  signatureTag,
  renderSignatureAnchor,
} from '@/lib/signature/text-tags';

describe('signatureTag — syntaxe DocuSeal', () => {
  it('produit un tag signature complet, attributs dans un ordre stable', () => {
    expect(
      signatureTag({
        name: 'Signature client',
        role: SIGNATURE_ROLES.CLIENT,
        type: 'signature',
        width: 200,
        height: 60,
      }),
    ).toBe('{{Signature client;role=Client;type=signature;width=200;height=60}}');
  });

  it('omet width/height quand ils ne sont pas fournis', () => {
    expect(signatureTag({ name: 'Date', role: SIGNATURE_ROLES.OF, type: 'datenow' })).toBe(
      '{{Date;role=Organisme de formation;type=datenow}}',
    );
  });

  it('sait rendre un champ optionnel (required=false)', () => {
    expect(
      signatureTag({ name: 'Paraphe', role: SIGNATURE_ROLES.STAGIAIRE, type: 'initials', required: false }),
    ).toBe('{{Paraphe;role=Stagiaire;type=initials;required=false}}');
  });

  it.each([
    ['point-virgule', 'Sign;ature'],
    ['accolade ouvrante', 'Sign{ature'],
    ['accolade fermante', 'Sign}ature'],
    ['égal', 'Sign=ature'],
  ])('refuse un nom contenant un %s (le tag serait cassé silencieusement)', (_label, name) => {
    expect(() => signatureTag({ name, role: SIGNATURE_ROLES.CLIENT, type: 'signature' })).toThrow(
      /caractère interdit/i,
    );
  });

  it('refuse un rôle vide (DocuSeal rattacherait le champ au premier signataire)', () => {
    expect(() => signatureTag({ name: 'Signature', role: '  ', type: 'signature' })).toThrow(
      /rôle/i,
    );
  });
});

describe('renderSignatureAnchor — ancre invisible dans le HTML WeasyPrint', () => {
  const html = renderSignatureAnchor({
    name: 'Signature client',
    role: SIGNATURE_ROLES.CLIENT,
    type: 'signature',
    width: 200,
    height: 60,
  });

  it('embarque le tag littéral', () => {
    expect(html).toContain('{{Signature client;role=Client;type=signature;width=200;height=60}}');
  });

  it('est écrite en blanc (invisible à l’impression comme à l’écran)', () => {
    expect(html.toLowerCase()).toMatch(/color:\s*#fff/);
  });

  it('est insécable : un tag coupé en fin de ligne ne serait plus reconnu', () => {
    expect(html.toLowerCase()).toMatch(/white-space:\s*nowrap/);
  });

  it('n’échappe PAS les accolades — DocuSeal lit le texte extrait, pas le HTML', () => {
    expect(html).not.toContain('&#123;');
    expect(html).not.toContain('&lbrace;');
  });

  /**
   * Constaté sur la première convention réellement signée (envoi EU 1619115,
   * 10/09/2026) : les deux signatures DÉBORDAIENT de leur cadre, celle du
   * client chevauchant la bordure et le libellé du bloc de l'OF. Le champ
   * DocuSeal démarre à l'ancre et s'étend vers le BAS ; sans place réservée
   * sous elle, il sort du cadre.
   *
   * Sur une pièce contractuelle destinée à un financeur, une signature à
   * cheval entre les deux parties est contestable. L'ancre réserve donc
   * elle-même la hauteur du champ qu'elle déclare.
   */
  it('réserve sous elle la hauteur du champ qu’elle déclare', () => {
    expect(html).toMatch(/[^-]height:\s*60pt/);
  });

  it('ne réserve rien quand aucune hauteur n’est déclarée', () => {
    const sansHauteur = renderSignatureAnchor({
      name: 'Signature',
      role: SIGNATURE_ROLES.CLIENT,
      type: 'signature',
    });
    expect(sansHauteur).not.toMatch(/[^-]height:\s*\d+pt/);
  });
});
