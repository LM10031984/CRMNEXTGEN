/**
 * GARDE — un contact n'est pas du contenu.
 *
 * En deux jours, QUATRE noms de personne physique ont été trouvés dans du texte
 * destiné au client ou au financeur, dont DEUX de personnes parties — chacun
 * découvert par accident, jamais par un garde. Un OF certifié dont les documents
 * nomment des personnes parties est un constat d'auditeur.
 *
 * Tout nom de personne, toute adresse, tout téléphone vient désormais de
 * `lib/contacts-organisme.ts`. Ce test échoue si un littéral revient.
 *
 * §4 ter — il lit les FICHIERS. Importer les valeurs supprimerait l'écart qu'on
 * surveille au lieu de le détecter.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../..', '..', '..');

/**
 * Les fichiers dont le texte part au client ou au financeur. Les énumérer est
 * délibéré : ajouter une surface ici est le moment où l'on décide qui la garde.
 */
const SURFACES = [
  'apps/web/src/lib/catalogue-constants.ts',
  'apps/web/src/lib/programme-template.ts',
  'apps/web/src/lib/calendar/texts.ts',
  'apps/web/src/lib/closure/checklist-formation-template.ts',
  'apps/web/src/lib/closure/analyse-besoin-template.ts',
  'apps/web/src/lib/diagnostic/journees-faros.ts',
];

/** Une adresse nominative, un téléphone français : les deux formes d'un contact. */
const ADRESSE_NOMINATIVE = /'[a-z][a-z.-]*@start-academy\.fr'|"[a-z][a-z.-]*@start-academy\.fr"/;
const TELEPHONE_FR = /['"`]0[1-9](?:[ .-]?[0-9]{2}){4}['"`]/;
/** « Prénom NOM » ou « Prénom Nom » dans un littéral de chaîne. */
const NOM_PROPRE = /['"`][^'"`]*\b[A-ZÉÈÀ][a-zéèêëàâçïîôû'’-]{2,}[- ][A-ZÉÈÀ][A-ZÉÈÀa-zéèêëàâçïîôû'’-]{2,}\b[^'"`]*['"`]/;

const NOMS_CONNUS = /(Lafitte|LAFITTE|Ourmi[èe]res|OURMI[ÈE]RES|Béatrice\s+Blanc|Laurent\s+MARX)/;

/**
 * `replaceDepartedContact` RÉPARE des données entrantes (champs SmartOF figés
 * qui nomment encore Julien LAFITTE). Elle doit donc citer ce qu'elle retire :
 * ce sont des motifs de nettoyage, pas des contacts émis. Elle est exclue du
 * balayage, et c'est la seule exception.
 *
 * ⚠ **Elle est un symptôme, pas un remède** : une fonction qui répare après coup
 * existe parce que la donnée source est mauvaise. Le jour où plus aucun contact
 * n'est en dur — ni dans le code, ni dans les 19 `accessConditions` et 5
 * `programMd` de la base qui citent encore Julien LAFITTE — elle devient
 * inutile et se retire. Pas avant : elle protège aujourd'hui des documents
 * réels.
 */
const REPARATION = /export function replaceDepartedContact[\s\S]*?\n\}/;

function code(f: string): string {
  return fs
    .readFileSync(path.join(RACINE, f), 'utf8')
    .replace(REPARATION, 'export function replaceDepartedContact() {}')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');
}

describe("Contacts de l'organisme — aucun littéral dans les surfaces client", () => {
  it.each(SURFACES)('%s ne nomme aucune personne en dur', (f) => {
    const src = code(f);
    const m = src.match(NOMS_CONNUS);
    expect(
      m ? `${f} nomme « ${m[0]} » en dur` : null,
      'Un nom de personne dans un texte client vient de lib/contacts-organisme.ts.',
    ).toBeNull();
  });

  it.each(SURFACES)('%s ne porte ni adresse nominative ni téléphone en dur', (f) => {
    const src = code(f);
    expect(ADRESSE_NOMINATIVE.test(src), `${f} : adresse nominative en dur`).toBe(false);
    expect(TELEPHONE_FR.test(src), `${f} : téléphone en dur`).toBe(false);
  });

  it('le motif « Prénom NOM » attrape bien un nom — il ne dort pas', () => {
    // Sans ce cas, un motif cassé rendrait les tests ci-dessus verts pour rien.
    expect(NOM_PROPRE.test("const x = 'Référent : Jean-Guy Ourmières — ok';")).toBe(true);
    expect(NOM_PROPRE.test("const x = 'Formation accessible aux personnes';")).toBe(false);
  });

  it('D — `targetAudience` vide ne fait JAMAIS apparaître `accessConditions`', () => {
    // Deux informations distinctes : à qui la formation s'adresse, et comment on
    // s'y inscrit. Rendre la seconde à la place de la première est faux quel que
    // soit son contenu. 19 fiches publiées portent un contact périmé dans
    // `accessConditions` : aujourd'hui masqué, une substitution suffisait à le
    // révéler.
    const src = code('apps/web/src/app/catalogue/page.tsx');
    expect(
      /targetAudience\?\.trim\(\)\s*\|\|\s*\n?\s*product\.accessConditions/.test(src),
      'La substitution targetAudience → accessConditions est revenue.',
    ).toBe(false);
    expect(src).toMatch(/const publicVise\s*=\s*\n?\s*product\.targetAudience\?\.trim\(\)\s*\|\|\s*'/);
  });
});
