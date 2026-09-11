/**
 * « RESPONSABLE DE L'ORGANISATION », jamais « dirigeant » — demande n°1 de
 * Laurent, 11/09/2026. Garde LEXICALE sur la source des écrans.
 *
 * LE MOTIF, ÉCRIT UNE FOIS ICI. « Dirigeant » affirme une QUALITÉ JURIDIQUE que
 * la donnée ne porte pas. `Organization.representative` est un champ libre : il
 * dit seulement qui représente l'organisation et signe ses conventions. Pour un
 * salarié, ce signataire est le RESPONSABLE D'AGENCE — pas nécessairement le
 * mandataire social. Un écran qui écrit « dirigeant » fait chercher un
 * représentant légal, et fait hésiter à saisir le nom qui convient ; il pousse
 * aussi à « corriger » une cascade qui est juste.
 *
 * POURQUOI UNE GARDE DE SOURCE, ET PAS SEULEMENT DES TESTS DE RENDU. Le mot ne
 * revient jamais par la grande porte : il revient dans une phrase d'aide, un
 * `title`, un libellé de badge — du texte que personne ne monte en jsdom. Une
 * relecture ne l'attrape pas deux mois plus tard. Cette garde, si.
 *
 * ⚠ CE QU'ELLE NE TOUCHE PAS, ET C'EST VOLONTAIRE. `SignerRole.DIRIGEANT`,
 * `LinkRole.DIRIGEANT`, la colonne `OpcoCatalog.conventionSigner` : ce sont des
 * VALEURS EN BASE, seedées et migrées. Le renommage demandé est TEXTUEL. Les
 * jetons en majuscules sont donc retirés avant la recherche — et le test
 * « la frontière » ci-dessous vérifie qu'ils sont toujours là.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LIBELLE_RESPONSABLE_ORGANISATION,
  MOT_RESPONSABLE_ORGANISATION,
} from '@/lib/organisations/responsable-organisation';

const SRC = path.join(__dirname, '..', '..', '..');
const lire = (relatif: string) => readFileSync(path.join(SRC, relatif), 'utf-8');

/**
 * Les fichiers qui ÉCRIVENT à l'écran ce que signe le responsable. Liste
 * explicite : un glob attraperait les fixtures de test, où `dirigeant@agence.fr`
 * est une adresse d'exemple et non un mot d'écran.
 */
const FICHIERS_ECRAN = [
  'components/sessions/signature/bloc-signature.tsx',
  'components/sessions/signature/recapitulatif-envoi.tsx',
  'components/organisations/responsable-organisation.tsx',
  'components/forms/edit-organization-button.tsx',
  'lib/sessions/bloc-signature-vue.ts',
  'lib/sessions/ordre-signataires.ts',
  'lib/organisations/responsable-organisation.ts',
  'lib/signature/text-tags.ts',
];

/** La source privée de ses jetons d'enum — eux restent, par décision. */
function sansJetonsEnum(source: string): string {
  return source.replace(/\bDIRIGEANT\b/g, '');
}

/**
 * USAGE contre MENTION — et c'est la demande de Laurent qui l'impose.
 *
 * Il exige que le MOTIF du renommage soit écrit en commentaire (« "dirigeant"
 * affirme une qualité juridique que la donnée ne porte pas »). Une garde qui
 * bannirait la suite de lettres interdirait d'écrire le motif, et une règle
 * sans son motif se fait oublier au premier lot pressé.
 *
 * La frontière retenue est celle de la typographie déjà employée partout dans ce
 * dépôt : entre guillemets français, le mot est CITÉ ; ailleurs, il est EMPLOYÉ.
 * Citer coûte deux caractères — et ces deux caractères sont exactement le geste
 * qui fait relire la phrase avant de la réintroduire.
 */
function sansMentions(source: string): string {
  return source.replace(/«\s*dirigeants?\s*»/gi, '');
}

/**
 * Les LITTÉRAUX de chaîne d'un fichier — ce qui a une chance d'atteindre l'écran.
 *
 * Les commentaires sont retirés d'abord : eux ne s'affichent jamais, et leurs
 * apostrophes fausseraient le découpage. Ce qui reste est grossier mais
 * suffisant — on cherche un mot, pas à parser TypeScript.
 */
function litterauxDeChaine(source: string): string[] {
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return sansCommentaires.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
}

describe('le MOT — « responsable de l’organisation » partout où l’écran nomme ce signataire', () => {
  it.each(FICHIERS_ECRAN)('%s n’EMPLOIE plus le mot proscrit', (relatif) => {
    // Cité entre guillemets (le motif du renommage) : autorisé. Employé pour
    // désigner ce signataire : interdit.
    expect(sansMentions(sansJetonsEnum(lire(relatif)))).not.toMatch(/dirigeant/i);
  });

  it.each(FICHIERS_ECRAN)('%s ne le met dans AUCUN texte d’écran, pas même cité', (relatif) => {
    // ⚠ ICI, PAS DE DÉROGATION. Un commentaire s'adresse au prochain
    // développeur ; une chaîne s'affiche. Le mot ne revient jamais par la grande
    // porte : il revient dans une phrase d'aide, un `title`, un libellé de
    // badge — du texte que personne ne monte en jsdom, et qu'une relecture
    // n'attrape pas deux mois plus tard.
    for (const litteral of litterauxDeChaine(lire(relatif))) {
      expect(sansJetonsEnum(litteral)).not.toMatch(/dirigeant/i);
    }
  });

  it('le vocabulaire est figé à UN endroit, pas réécrit dans chaque fichier', () => {
    // Valeurs LITTÉRALES : les comparer au retour du module qui les compose
    // laisserait les deux côtés bouger ensemble (règle de test n°2).
    expect(LIBELLE_RESPONSABLE_ORGANISATION).toBe('Responsable — signe les conventions');
    expect(MOT_RESPONSABLE_ORGANISATION).toBe('responsable de l’organisation');
  });
});

/**
 * LA FRONTIÈRE — ce qui doit rester « dirigeant », et pourquoi.
 *
 * Ces tests ne gardent pas une préférence de style : ils gardent une DÉCISION.
 * Laurent, 11/09/2026 : « Ne PAS renommer l'enum `SignerRole.DIRIGEANT` ni la
 * colonne `conventionSigner` : ce sont des valeurs en base, seedées et migrées.
 * Le renommage est textuel, pas structurel. » Sans ce rappel exécutable, le
 * prochain passage de vocabulaire emporterait la donnée avec le libellé — et
 * une migration de valeurs d'enum dans un lot de libellés, ça ne se voit qu'en
 * production.
 */
describe('la FRONTIÈRE — les valeurs en base gardent leur nom', () => {
  it('`SignerRole.DIRIGEANT` est intact — c’est la valeur de `OpcoCatalog.conventionSigner`', () => {
    expect(lire('lib/signature/regime.ts')).toMatch(
      /export type SignerRole = 'DIRIGEANT' \| 'STAGIAIRE'/,
    );
  });

  it('le rôle `LinkRole.DIRIGEANT` garde son libellé « Dirigeant » sur la fiche organisation', () => {
    // AUTRE CONCEPT, et c'est tout le point : `LinkRole` dit le rôle d'une
    // PERSONNE dans une organisation (dirigeant, salarié, EI). Il ne désigne pas
    // le signataire des conventions — lequel se lit sur `representative`, et
    // peut parfaitement être un salarié responsable d'agence. Aligner les deux
    // mots ferait croire que le badge « Dirigeant » désigne le signataire.
    expect(lire('app/app/organisations/[id]/page.tsx')).toMatch(/DIRIGEANT: 'Dirigeant',/);
  });
});

/**
 * LE FIL — règle de test n°1 (`.claude/commands/signature.md`).
 *
 * Le champ est calculé PUR et testé comme tel ; il n'arrive à l'écran que si la
 * fiche le rend ET charge ses contacts. `page.tsx` est un composant serveur qui
 * ouvre Prisma et Lucia : il n'est pas montable en jsdom, et la prop se perdrait
 * sans qu'aucun test ne bouge. C'est le trou exact trouvé deux fois sur ce
 * chantier (C.2b-1, puis C.2b-8 : retirer `signataireOf:` faisait disparaître
 * l'organisme de toutes les lignes, 95 tests restaient verts).
 */
describe('le FIL — la fiche organisation rend le champ ET charge de quoi le résoudre', () => {
  const fiche = lire('app/app/organisations/[id]/page.tsx');

  it('la fiche rend `<ResponsableOrganisation>`', () => {
    expect(fiche).toMatch(/<ResponsableOrganisation\b/);
    expect(fiche).toMatch(/@\/components\/organisations\/responsable-organisation/);
  });

  it('elle lui passe l’organisation ET ses contacts — sans eux, aucun email résoluble', () => {
    // Retirer `contacts` de la requête laisserait le nom s'afficher et l'email
    // disparaître en silence : la cascade se rabattrait sur une liste vide.
    expect(fiche).toMatch(/contacts: \{/);
    expect(fiche).toMatch(/orderBy: \[\{ isPrimary: 'desc' \}, \{ createdAt: 'asc' \}\]/);
    expect(fiche).toMatch(/contacts: org\.contacts,/);
  });

  it('la modale d’édition porte le nouveau libellé, et plus « Représentant légal »', () => {
    const modale = lire('components/forms/edit-organization-button.tsx');
    expect(modale).toContain('LIBELLE_RESPONSABLE_ORGANISATION');
    expect(modale).not.toMatch(/label: 'Représentant légal'/);
  });
});
