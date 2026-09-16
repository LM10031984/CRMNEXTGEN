/**
 * GARDE — la modalité déclarée à l'AGEFICE est celle de la session, sur les DEUX pièces.
 *
 * ## Les trois défauts que ces tests tiennent (16/09/2026)
 *
 * `splitDureeByModality` existe **en deux exemplaires identiques** —
 * `agefice-generator.ts` et `agefice-attendance-generator.ts`, le clone assumé
 * en commentaire. Les deux portent les mêmes défauts, sur des pièces qui partent
 * au financeur :
 *
 *   **(a)** l'enum Prisma `Modality` contient `ELEARNING`. La fonction n'a pas ce
 *           `case`. `ELEARNING` tombe dans `default` et déclare **toutes** ses
 *           heures en présentiel collectif, en silence.
 *   **(b)** le `default` est muet : une modalité inconnue ou nulle produit la
 *           **même affirmation positive** qu'un vrai présentiel. Une absence
 *           rendue par une affirmation (§4 quinquies).
 *   **(c)** `foadAsync` vaut 0 dans les **quatre** branches, puis part dans
 *           `prevueFoadAsync` / `realiseeFoadAsync`. La case FOAD asynchrone du
 *           formulaire AGEFICE ne peut **structurellement jamais** être remplie.
 *
 * ## Pourquoi ces tests portent sur le RENDU
 *
 * §4 quinquies : un test sur l'objet ne prouve rien sur le document. Les deux
 * surfaces sont lues telles que le financeur les reçoit —
 * les **champs du formulaire officiel** rempli par `fillAgeficePdf`, et les
 * **cellules du tableau** de `renderAgeficeAttendanceHtml`.
 *
 * Et les deux ne rendent pas un zéro de la même façon : `fmtNumber(0)` écrit
 * « 0 » dans la case du Cerfa — une affirmation — quand `fmtH(0)` laisse la
 * cellule HTML vide. Le même défaut se lit donc deux fois différemment.
 *
 * ## ⚠️ Ces tests doivent rester ROUGES après la déduplication
 *
 * Fusionner les deux clones ne corrige aucun des trois défauts. Si l'un d'eux
 * passe au vert à l'étape « une seule source », c'est que le test ne mesurait
 * pas ce qu'il prétend.
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { fillAgeficePdf, type AgeficeFormData } from '@/lib/agefice-form-fill';
import {
  renderAgeficeAttendanceHtml,
  type AgeficeAttendanceTemplateData,
} from '@/lib/closure/agefice-attendance-template';
// N'existe pas encore : la fonction vit en double dans les deux générateurs.
// L'étape « déduplication » la crée ici, avec la logique ACTUELLE — donc sans
// rien corriger.
import { splitDureeByModality } from '@/lib/agefice/duree-par-modalite';

const TOTAL = 40;

/** Les quatre valeurs de l'enum Prisma `Modality`, plus les deux cas muets. */
const ENTREES: { nom: string; modality: string | null }[] = [
  { nom: 'PRESENTIEL', modality: 'PRESENTIEL' },
  { nom: 'DISTANCIEL', modality: 'DISTANCIEL' },
  { nom: 'MIXTE', modality: 'MIXTE' },
  { nom: 'ELEARNING', modality: 'ELEARNING' },
  { nom: 'null (session sans modalité)', modality: null },
  { nom: 'chaîne inconnue', modality: 'TELEPRESENTIEL' },
];

// ── Surface 1 — le formulaire officiel ──────────────────────────────────────

const CHAMPS = {
  presIndiv: 'Durée ( Présentiel Individuel - Formation)',
  presColl: 'Durée ( Présentiel Collectif - Formation)',
  foadSync: 'Durée ( FOAD Synchrone - Formation)',
  foadAsync: 'Durée ( FOAD Asynchrone - Formation)',
} as const;

function formData(split: ReturnType<typeof splitDureeByModality>): AgeficeFormData {
  return {
    pa: { name: 'PA', number: '06', contactName: 'C', address: 'a', postalCode: '06000', city: 'Nice', phone: '0400000000', email: 'pa@t.fr' },
    entreprise: { raisonSociale: 'EXPERTA', nomCommercial: null, naf: '6820A', siret: '81234567800042', activite: 'Immo', formeJuridique: 'EI', address: 'a', postalCode: '06300', city: 'Nice' },
    stagiaire: { civilite: 'MME', nom: 'AUGUSTIN', prenom: 'Sophie', nomNaissance: null, dateNaissance: new Date('1985-04-12T00:00:00Z'), securiteSociale: null, phone: '0600000000', email: 's@t.fr', diplome: 'BAC', experience: '4_10_ANS' },
    of: {
      name: 'START ACADEMY', rnq: 'RNQ-0001', siret: '95131909400029',
      addressStreet: '12 av', addressCp: '06800', addressVille: 'Cagnes',
      resp: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'f@t.fr' },
      contact: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'f@t.fr' },
    },
    formationType: 'ACTION', obligatoire: false, reconversion: false,
    formation: {
      intitule: "Intégrer l'IA", thematique: 'IA', niveau: 'INITIATION', certif: 'SANS_QUALIFICATION',
      dateDebut: new Date('2026-10-07T00:00:00Z'), dateFin: new Date('2026-12-16T00:00:00Z'),
      dureePresentielIndividuel: split.presIndiv,
      dureePresentielCollectif: split.presColl,
      dureeFoadSynchrone: split.foadSync,
      dureeFoadAsynchrone: split.foadAsync,
      formateur: 'Laurent MARX', lieuPostalCode: '06300', lieuVille: 'Nice',
      prixHT: 2500, enEntreprise: false, lieuAdresseComplete: 'EXPERTA, Nice',
      deroulementPedago: 'Présentiel',
    },
    evaluations: ['QUIZ'], evaluationAutreDetail: null, attestation: 'ATTESTATION_STAGE',
    mandat: false, signature: { lieu: 'Cagnes', date: new Date('2026-09-16T00:00:00Z') },
  } as AgeficeFormData;
}

/** Ce que le formulaire OFFICIEL porte, champ par champ, après remplissage. */
async function casesDuCerfa(modality: string | null): Promise<Record<keyof typeof CHAMPS, string>> {
  const pdf = await fillAgeficePdf(formData(splitDureeByModality(modality, TOTAL)));
  const form = (await PDFDocument.load(new Uint8Array(pdf))).getForm();
  const lu = (n: string) => form.getTextField(n).getText() ?? '';
  return { presIndiv: lu(CHAMPS.presIndiv), presColl: lu(CHAMPS.presColl), foadSync: lu(CHAMPS.foadSync), foadAsync: lu(CHAMPS.foadAsync) };
}

// ── Surface 2 — l'attestation d'assiduité ───────────────────────────────────

const LIGNES = {
  presIndiv: 'Durée en présentiel individuel',
  presColl: 'Durée en présentiel collectif',
  foadSync: 'Durée en distanciel synchrone',
  foadAsync: 'Durée en distanciel asynchrone',
} as const;

/** La cellule « Prévue » de la ligne demandée, telle qu'elle est rendue. */
function celluleAssiduite(modality: string | null, ligne: keyof typeof LIGNES): string {
  const s = splitDureeByModality(modality, TOTAL);
  const d: AgeficeAttendanceTemplateData = {
    tenantId: 't', formationIntitule: "Intégrer l'IA",
    formationDateDebut: new Date('2026-10-07T00:00:00Z'), formationDateFin: new Date('2026-12-16T00:00:00Z'),
    formateurNomQualite: 'Laurent MARX', nombreParticipants: 4,
    ofRaisonSociale: 'START ACADEMY', ofNumeroDeclaration: 'RNQ-0001', ofDreetsVille: 'Nice',
    ofResponsablePrenomNom: 'Laurent MARX', ofResponsableQualite: 'PDG', ofLieuDelivrance: 'Cagnes',
    stagiaireNomPrenom: 'Sophie AUGUSTIN', entrepriseRaisonSociale: 'EXPERTA',
    prevuePresIndividuel: s.presIndiv, prevuePresCollectif: s.presColl,
    prevueFoadSync: s.foadSync, prevueFoadAsync: s.foadAsync,
    realiseePresIndividuel: s.presIndiv || null, realiseePresCollectif: s.presColl || null,
    realiseeFoadSync: s.foadSync || null, realiseeFoadAsync: s.foadAsync || null,
    sommeChiffres: 2500, sommeLettres: null, modeReglement: 'Virement bancaire',
    dateReglement: new Date('2026-12-16T00:00:00Z'), dateDelivrance: new Date('2026-12-20T00:00:00Z'),
  };
  const html = renderAgeficeAttendanceHtml(d);
  const re = new RegExp(`${LIGNES[ligne]}<sup>\\d</sup></td>\\s*<td class="center">([^<]*)</td>`);
  const m = re.exec(html);
  expect(m, `ligne « ${LIGNES[ligne]} » introuvable dans le rendu`).not.toBeNull();
  return (m![1] ?? '').trim();
}

// ════════════════════════════════════════════════════════════════════════════

describe('(a) ELEARNING n’est pas du présentiel collectif', () => {
  it('le formulaire officiel ne déclare pas les heures en présentiel collectif', async () => {
    const cases = await casesDuCerfa('ELEARNING');
    expect(
      cases.presColl,
      `ELEARNING est déclaré « ${cases.presColl} h de présentiel collectif » sur le ` +
        'formulaire AGEFICE. Personne ne l’a affirmé : la modalité tombe dans `default`.',
    ).not.toBe(String(TOTAL));
  }, 60_000);

  it('l’attestation d’assiduité non plus', () => {
    expect(celluleAssiduite('ELEARNING', 'presColl')).not.toBe(String(TOTAL));
  });

  it('ELEARNING et PRESENTIEL ne rendent pas la même pièce', async () => {
    const [elearning, presentiel] = await Promise.all([casesDuCerfa('ELEARNING'), casesDuCerfa('PRESENTIEL')]);
    expect(
      elearning,
      'Deux modalités distinctes de l’enum produisent un formulaire identique : ' +
        'le document ne distingue pas ce que la session distingue.',
    ).not.toEqual(presentiel);
  }, 60_000);
});

describe('(b) une modalité absente ou inconnue n’affirme rien', () => {
  for (const { nom, modality } of ENTREES.filter((e) => e.modality === null || e.modality === 'TELEPRESENTIEL')) {
    it(`« ${nom} » ne se rend pas comme un présentiel collectif plein`, async () => {
      const cases = await casesDuCerfa(modality);
      expect(
        cases.presColl,
        `Le formulaire affirme « ${cases.presColl} h de présentiel collectif » pour ` +
          `une modalité « ${nom} ». L'écran ne sait pas, le document affirme.`,
      ).not.toBe(String(TOTAL));
    }, 60_000);
  }

  it('sur l’assiduité non plus', () => {
    expect(celluleAssiduite(null, 'presColl')).not.toBe(String(TOTAL));
    expect(celluleAssiduite('TELEPRESENTIEL', 'presColl')).not.toBe(String(TOTAL));
  });
});

describe('(c) la case FOAD asynchrone peut être remplie', () => {
  it('au moins une modalité de l’enum la remplit sur le formulaire', async () => {
    const rendus = await Promise.all(ENTREES.map((e) => casesDuCerfa(e.modality)));
    const remplies = rendus.filter((c) => c.foadAsync !== '' && c.foadAsync !== '0');
    expect(
      remplies.length,
      'Les six entrées rendent une case FOAD asynchrone vide ou à zéro : ' +
        '`foadAsync` vaut 0 dans les quatre branches. La case ne peut ' +
        'structurellement jamais être remplie — et le Cerfa y écrit « 0 », ' +
        'ce qui est une affirmation, pas un silence.',
    ).toBeGreaterThan(0);
  }, 120_000);

  it('au moins une modalité la remplit sur l’attestation d’assiduité', () => {
    const remplies = ENTREES.map((e) => celluleAssiduite(e.modality, 'foadAsync')).filter((v) => v !== '');
    expect(remplies.length).toBeGreaterThan(0);
  });
});

describe('couverture — les quatre modalités de l’enum sont traitées', () => {
  it('chacune produit une répartition qui lui est propre', () => {
    const vues = new Map<string, string>();
    for (const nom of ['PRESENTIEL', 'DISTANCIEL', 'MIXTE', 'ELEARNING']) {
      vues.set(nom, JSON.stringify(splitDureeByModality(nom, TOTAL)));
    }
    expect(new Set(vues.values()).size, `Répartitions : ${[...vues].map(([k, v]) => `${k}=${v}`).join(' · ')}`).toBe(4);
  });
});
