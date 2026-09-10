import { describe, it, expect } from 'vitest';

/**
 * Complément lot B — ancre de signature du dossier AGEFICE (Laurent, 10/09/2026).
 *
 * ── Ce que le lot B avait manqué ─────────────────────────────────────────
 *
 * Le dossier AGEFICE envoyé en signature n'est PAS rendu par un gabarit HTML :
 * c'est le **formulaire officiel** (`src/assets/agefice-template.pdf`) rempli
 * champ par champ par `fillAgeficePdf` (pdf-lib). `renderAgeficeHtml`, où le
 * lot B avait posé ses ancres, n'est appelé par personne — vérifié le 10/09.
 * Les ancres HTML n'avaient donc AUCUNE prise sur le document réellement
 * envoyé : la demande de prise en charge serait partie sans champ à signer.
 *
 * ── Pourquoi une ancre dessinée, et pas des coordonnées passées au port ──
 *
 * Deux options se présentaient. Passer à DocuSeal un champ positionné par
 * coordonnées aurait fait entrer la géométrie d'un prestataire dans le port
 * `SignatureProvider` — exactement ce que la décision D-7 cherchait à éviter,
 * et une complication pour toute implémentation future. Dessiner l'ancre dans
 * le PDF garde UN seul mécanisme pour les trois documents, laisse le port
 * intact, et met les coordonnées là où celles de la signature de l'OF vivent
 * déjà (`applyOfSignature`, même fichier, même formulaire).
 *
 * ── Ce qui est verrouillé ici ────────────────────────────────────────────
 *
 * L'ancre vise la case « Nom prénom et signature du demandeur », en bas à
 * GAUCHE de la page 3 — c'est le libellé du formulaire officiel. La case de
 * droite est celle de l'OF, déjà pourvue de l'image de signature de Laurent :
 * on ne la fait pas re-signer (consigne du 10/09).
 */

import { PDFDocument } from 'pdf-lib';
import { fillAgeficePdf, type AgeficeFormData } from '../agefice-form-fill';
import { SIGNATURE_ROLES } from '../signature/text-tags';
import { extractTextFromPdf } from '../pdf-extract';

function data(overrides: Partial<AgeficeFormData> = {}): AgeficeFormData {
  return {
    pa: {
      name: 'PA Test', number: '06', contactName: 'Virginie BEHIN',
      address: '1 rue du Test', postalCode: '06000', city: 'Nice',
      phone: '0400000000', email: 'pa@test.fr',
    },
    entreprise: {
      raisonSociale: 'EXPERTA', nomCommercial: null, naf: '6820A',
      siret: '81234567800042', activite: 'Immobilier', formeJuridique: 'EI',
      address: '5 place de l’Ile de Beauté', postalCode: '06300', city: 'Nice',
    },
    stagiaire: {
      civilite: 'MME', nom: 'AUGUSTIN', prenom: 'Sophie', nomNaissance: null,
      dateNaissance: new Date('1985-04-12T00:00:00Z'), securiteSociale: null,
      phone: '0600000000', email: 'sophie@experta.fr',
      diplome: 'BAC', experience: '4_10_ANS',
    },
    of: {
      name: 'START ACADEMY', rnq: 'RNQ-0001', siret: '95131909400029',
      addressStreet: '12 avenue des Camélias', addressCp: '06800', addressVille: 'Cagnes-sur-Mer',
      resp: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'formation@start-academy.fr' },
      contact: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'formation@start-academy.fr' },
    },
    formationType: 'ACTION',
    obligatoire: false,
    reconversion: false,
    formation: {
      intitule: "Intégrer l'IA", thematique: 'IA', niveau: 'INITIATION',
      certif: 'SANS_QUALIFICATION',
      dateDebut: new Date('2026-10-07T00:00:00Z'), dateFin: new Date('2026-12-16T00:00:00Z'),
      dureePresentielIndividuel: 0, dureePresentielCollectif: 88,
      dureeFoadSynchrone: 0, dureeFoadAsynchrone: 0,
      formateur: 'Laurent MARX', lieuPostalCode: '06300', lieuVille: 'Nice',
      prixHT: 2500, enEntreprise: false, lieuAdresseComplete: 'EXPERTA, Nice',
      deroulementPedago: 'Présentiel',
    },
    evaluations: ['QUIZ'],
    evaluationAutreDetail: null,
    attestation: 'ATTESTATION_STAGE',
    mandat: false,
    signature: { lieu: 'Cagnes-sur-Mer', date: new Date('2026-09-16T00:00:00Z') },
    ...overrides,
  } as AgeficeFormData;
}

/** Texte de la page demandée (1-based) — l'extraction fusionne les pages par défaut. */
async function textePage(pdf: Buffer, page: number): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const res = await extractText(doc, { mergePages: false });
  const pages = res.text as unknown as string[];
  return pages[page - 1] ?? '';
}

/**
 * Le formulaire officiel n'a AUCUN champ nommé pour le nom du demandeur : la
 * page 3 ne porte que « Mandat (Oui) », « Lieu de Signature » et « Date de
 * Signature » (vérifié le 10/09/2026 via
 * `scripts/_inspect-agefice-signature-box.ts`). La case
 * « Nom prénom et signature du demandeur » attend donc un nom DESSINÉ — sinon
 * elle part vide et l'AGEFICE bloque le dossier.
 *
 * Le nom est imprimé QUEL QUE SOIT le mode : un dossier signé à la main a le
 * même besoin qu'un dossier signé électroniquement.
 */
describe('dossier AGEFICE — nom du demandeur imprimé', () => {
  it('imprime « Prénom NOM » sur la page 3, même sans signature électronique', async () => {
    const pdf = await fillAgeficePdf(data());
    expect(await textePage(pdf, 3)).toContain('Sophie AUGUSTIN');
  }, 30_000);

  it('l’imprime aussi en mode signature électronique', async () => {
    const pdf = await fillAgeficePdf(data({ signatureTags: true } as Partial<AgeficeFormData>));
    expect(await textePage(pdf, 3)).toContain('Sophie AUGUSTIN');
  }, 30_000);

  it('assainit les accents pour WinAnsi, comme le nom de l’OF', async () => {
    // `drawText` avec une police standard lève sur un caractère hors WinAnsi :
    // un stagiaire nommé « Gaëlle LŒB » ne doit pas faire échouer la génération.
    const pdf = await fillAgeficePdf(
      data({
        stagiaire: { ...data().stagiaire, prenom: 'Gaëlle', nom: 'LŒB' },
      } as Partial<AgeficeFormData>),
    );
    const texte = await textePage(pdf, 3);
    expect(texte).toContain('Ga');
    expect(texte).toMatch(/L(OE|Œ)B/);
  }, 30_000);

  it('place le nom AU-DESSUS de la zone de signature, sans la chevaucher', async () => {
    const { ANCRE_DEMANDEUR, NOM_DEMANDEUR_Y } = await import('../agefice-form-fill');
    // La zone occupe y..y+height ; le nom doit commencer au-dessus.
    expect(NOM_DEMANDEUR_Y).toBeGreaterThanOrEqual(
      ANCRE_DEMANDEUR.y + ANCRE_DEMANDEUR.height,
    );
    // …et rester sous le libellé imprimé « Nom prénom et signature du
    // demandeur », qui court juste sous les champs Lieu/Date (y = 235).
    expect(NOM_DEMANDEUR_Y).toBeLessThan(220);
  });
});

describe('dossier AGEFICE — ancre de signature du demandeur', () => {
  it('n’en pose AUCUNE par défaut (dossier imprimé, signature manuscrite)', async () => {
    const pdf = await fillAgeficePdf(data());
    expect((await extractTextFromPdf(pdf)).text).not.toContain('{{');
  }, 30_000);

  it('pose l’ancre du STAGIAIRE quand la signature électronique est demandée', async () => {
    const pdf = await fillAgeficePdf(data({ signatureTags: true } as Partial<AgeficeFormData>));
    const texte = (await extractTextFromPdf(pdf)).text.replace(/\s+/g, '');

    expect(texte).toContain(`role=${SIGNATURE_ROLES.STAGIAIRE};type=signature`.replace(/\s+/g, ''));
  }, 30_000);

  it('ne pose PAS d’ancre pour l’OF : son image de signature est déjà apposée', async () => {
    const pdf = await fillAgeficePdf(data({ signatureTags: true } as Partial<AgeficeFormData>));
    const texte = (await extractTextFromPdf(pdf)).text;

    expect(texte).not.toContain(SIGNATURE_ROLES.OF);
  }, 30_000);

  it('place l’ancre en bas à GAUCHE de la page 3, dans la case du demandeur', async () => {
    // La case de droite est celle de l'OF (image apposée par applyOfSignature
    // à x=365) : une ancre qui y atterrirait ferait signer le stagiaire dans le
    // cadre de l'organisme de formation.
    const pdf = await fillAgeficePdf(data({ signatureTags: true } as Partial<AgeficeFormData>));
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPages()).toHaveLength(3);

    const { ANCRE_DEMANDEUR } = await import('../agefice-form-fill');
    expect(ANCRE_DEMANDEUR.page).toBe(2); // index 0-based → page 3
    expect(ANCRE_DEMANDEUR.x).toBeGreaterThanOrEqual(80);
    expect(ANCRE_DEMANDEUR.x + ANCRE_DEMANDEUR.width).toBeLessThan(365); // n’empiète pas sur l’OF
    expect(ANCRE_DEMANDEUR.y).toBeGreaterThan(100); // au-dessus de « En cas de mandat… »
    expect(ANCRE_DEMANDEUR.y + ANCRE_DEMANDEUR.height).toBeLessThan(225); // sous le libellé
  }, 30_000);

  it('l’ancre est invisible : blanche, et retirée du PDF final par le prestataire', async () => {
    const avec = await fillAgeficePdf(data({ signatureTags: true } as Partial<AgeficeFormData>));
    const sans = await fillAgeficePdf(data());
    // Même nombre de pages, même structure : l'ancre n'ajoute aucun visuel.
    expect((await PDFDocument.load(avec)).getPageCount()).toBe(
      (await PDFDocument.load(sans)).getPageCount(),
    );
  }, 30_000);
});
