/**
 * GARDE — chaque modalité tombe dans SA case du formulaire AGEFICE.
 *
 * ## Les trois défauts corrigés le 16/09/2026
 *
 *   **(a)** `ELEARNING` — valeur de l'enum Prisma `Modality` — n'avait pas de
 *           `case`. Il tombait dans `default` et déclarait **toutes** ses heures
 *           en présentiel collectif, en silence.
 *   **(b)** `MIXTE` inventait un 50/50 que personne n'avait décidé, et que rien
 *           ne permet de déduire.
 *   **(c)** `foadAsync` valait 0 dans les quatre branches : la case FOAD
 *           asynchrone ne pouvait **structurellement jamais** être remplie.
 *
 * Et la fonction vivait en deux exemplaires identiques dans les deux
 * générateurs. Une seule source désormais — §4 bis se referme.
 *
 * ## Le point de vigilance, et c'est lui qui compte
 *
 * `DISTANCIEL` → **FOAD synchrone** (du distanciel en direct).
 * `ELEARNING`  → **FOAD asynchrone** (à son rythme).
 * L'AGEFICE distingue les deux ; les confondre déclare au financeur une nature
 * de prestation qui n'est pas celle qui a été vendue.
 *
 * ## Ce que ces tests NE testent PAS, délibérément
 *
 * Ni `null`, ni `undefined`, ni une chaîne inconnue. `TrainingSession.modality`
 * est un enum **fermé et non nullable** (`schema.prisma:582`) et les deux
 * appelants passent ce champ : **le type les interdit**. Un test qui teste
 * l'impossible est un garde qui ne rougira jamais.
 *
 * Le garde de l'exhaustivité n'est pas ici non plus : c'est le
 * `const _exhaustif: never` de la fonction. Une cinquième valeur de l'enum casse
 * `tsc` **au build**, pas la génération devant un commercial.
 *
 * ## Portée de ce fichier
 *
 * Les tests portent sur le RENDU (§4 quinquies) : les champs du formulaire
 * officiel rempli par `fillAgeficePdf`, et les cellules du tableau de
 * `renderAgeficeAttendanceHtml`. Le raccordement des deux générateurs au refus
 * (`if (!repartition.ok) return { ok: false, error: repartition.motif }`) n'est
 * pas exerçable ici : il demande une base. Ce que ce fichier prouve, c'est
 * qu'une modalité refusée **ne produit aucune pièce à rendre**.
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { Modality } from '@qualiof/db';
import { fillAgeficePdf, type AgeficeFormData } from '@/lib/agefice-form-fill';
import {
  renderAgeficeAttendanceHtml,
  type AgeficeAttendanceTemplateData,
} from '@/lib/closure/agefice-attendance-template';
import {
  repartirHeuresAgefice,
  type HeuresAgefice,
} from '@/lib/agefice/duree-par-modalite';

const TOTAL = 40;

/** La répartition, ou l'échec du test si la modalité refuse. */
function heures(m: Modality): HeuresAgefice {
  const r = repartirHeuresAgefice(m, TOTAL);
  expect(r.ok, `« ${m} » devait rendre une répartition`).toBe(true);
  return r as { ok: true } & HeuresAgefice;
}

// ── Surface 1 — le formulaire officiel ──────────────────────────────────────

const CHAMPS = {
  presIndiv: 'Durée ( Présentiel Individuel - Formation)',
  presColl: 'Durée ( Présentiel Collectif - Formation)',
  foadSync: 'Durée ( FOAD Synchrone - Formation)',
  foadAsync: 'Durée ( FOAD Asynchrone - Formation)',
} as const;

function formData(h: HeuresAgefice): AgeficeFormData {
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
      dureePresentielIndividuel: h.presIndiv, dureePresentielCollectif: h.presColl,
      dureeFoadSynchrone: h.foadSync, dureeFoadAsynchrone: h.foadAsync,
      formateur: 'Laurent MARX', lieuPostalCode: '06300', lieuVille: 'Nice',
      prixHT: 2500, enEntreprise: false, lieuAdresseComplete: 'EXPERTA, Nice',
      deroulementPedago: 'Présentiel',
    },
    evaluations: ['QUIZ'], evaluationAutreDetail: null, attestation: 'ATTESTATION_STAGE',
    mandat: false, signature: { lieu: 'Cagnes', date: new Date('2026-09-16T00:00:00Z') },
  } as AgeficeFormData;
}

/** Ce que le formulaire OFFICIEL porte, case par case, après remplissage. */
async function casesDuCerfa(m: Modality): Promise<Record<keyof typeof CHAMPS, string>> {
  const pdf = await fillAgeficePdf(formData(heures(m)));
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
function celluleAssiduite(m: Modality, ligne: keyof typeof LIGNES): string {
  const s = heures(m);
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
  const re = new RegExp(`${LIGNES[ligne]}<sup>\\d</sup></td>\\s*<td class="center">([^<]*)</td>`);
  const m2 = re.exec(renderAgeficeAttendanceHtml(d));
  expect(m2, `ligne « ${LIGNES[ligne]} » introuvable dans le rendu`).not.toBeNull();
  return (m2![1] ?? '').trim();
}

// ════════════════════════════════════════════════════════════════════════════

/** La case attendue pour chaque modalité qui rend une répartition. */
const ATTENDU: [Modality, keyof typeof CHAMPS][] = [
  [Modality.PRESENTIEL, 'presColl'],
  [Modality.DISTANCIEL, 'foadSync'],
  [Modality.ELEARNING, 'foadAsync'],
];

describe('chaque modalité tombe dans SA case', () => {
  for (const [modalite, caseAttendue] of ATTENDU) {
    it(`${modalite} → ${LIGNES[caseAttendue]}, sur le formulaire officiel`, async () => {
      const cases = await casesDuCerfa(modalite);
      expect(cases[caseAttendue], `${modalite} devait porter ses ${TOTAL} h ici`).toBe(String(TOTAL));
      for (const autre of Object.keys(CHAMPS) as (keyof typeof CHAMPS)[]) {
        if (autre === caseAttendue) continue;
        expect(cases[autre], `${modalite} ne doit RIEN déclarer en « ${LIGNES[autre]} »`).toBe('0');
      }
    }, 60_000);

    it(`${modalite} → ${LIGNES[caseAttendue]}, sur l'attestation d'assiduité`, () => {
      expect(celluleAssiduite(modalite, caseAttendue)).toBe(String(TOTAL));
      for (const autre of Object.keys(LIGNES) as (keyof typeof LIGNES)[]) {
        if (autre === caseAttendue) continue;
        // `fmtH(0)` rend une cellule VIDE — le gabarit n'affirme pas un zéro.
        expect(celluleAssiduite(modalite, autre), `« ${LIGNES[autre]} » doit rester vide`).toBe('');
      }
    });
  }
});

describe('ELEARNING alimente la case FOAD asynchrone, et rien d’autre', () => {
  it('la case cesse d’être morte', async () => {
    const cases = await casesDuCerfa(Modality.ELEARNING);
    expect(
      cases.foadAsync,
      'Avant le 16/09, `foadAsync` valait 0 dans les quatre branches : cette case ' +
        'ne pouvait structurellement jamais être remplie.',
    ).toBe(String(TOTAL));
    expect(cases.presColl, 'ELEARNING déclaré en présentiel collectif — le défaut (a)').toBe('0');
  }, 60_000);

  it('ne se confond pas avec DISTANCIEL — l’AGEFICE distingue synchrone et asynchrone', async () => {
    const [elearning, distanciel] = await Promise.all([
      casesDuCerfa(Modality.ELEARNING),
      casesDuCerfa(Modality.DISTANCIEL),
    ]);
    expect(elearning.foadAsync).toBe(String(TOTAL));
    expect(elearning.foadSync).toBe('0');
    expect(distanciel.foadSync).toBe(String(TOTAL));
    expect(distanciel.foadAsync).toBe('0');
  }, 60_000);
});

describe('MIXTE ne produit aucune pièce', () => {
  it('refuse, et dit ce qui manque et quoi faire', () => {
    const r = repartirHeuresAgefice(Modality.MIXTE, TOTAL);
    expect(r.ok).toBe(false);
    const motif = (r as { ok: false; motif: string }).motif;
    expect(motif).toContain('répartition');
    expect(motif).toContain('PRESENTIEL');
    expect(motif).toContain('DISTANCIEL');
    expect(motif).toContain('ELEARNING');
  });

  it('ne rend aucune heure — rien à imprimer, donc rien d’inventé', () => {
    const r = repartirHeuresAgefice(Modality.MIXTE, TOTAL);
    expect(Object.keys(r).sort()).toEqual(['motif', 'ok']);
  });

  it('les modalités qui rendent une pièce sont exactement les trois autres', () => {
    const rendables = Object.values(Modality).filter(
      (m) => repartirHeuresAgefice(m as Modality, TOTAL).ok,
    );
    expect(rendables.sort()).toEqual(
      [Modality.DISTANCIEL, Modality.ELEARNING, Modality.PRESENTIEL].sort(),
    );
  });
});

describe('la population de l’enum est celle qu’on croit', () => {
  it('`Modality` a quatre membres — le contrôle d’exhaustivité les couvre tous', () => {
    expect(Object.values(Modality).sort()).toEqual(
      ['DISTANCIEL', 'ELEARNING', 'MIXTE', 'PRESENTIEL'],
    );
  });
});
