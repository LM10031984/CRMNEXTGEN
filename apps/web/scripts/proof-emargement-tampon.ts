/**
 * Preuve locale — le tampon de la feuille d'émargement n'est jamais orphelin.
 *
 *   WEASYPRINT_URL=http://127.0.0.1:5001 pnpm --filter @qualiof/web exec tsx scripts/proof-emargement-tampon.ts
 *
 * MOTEUR : WeasyPrint, PAS Gotenberg. L'émargement passe par
 * `renderHtmlToPdfWeasy` (pied de page répété en CSS Paged Media) ; une preuve
 * rendue par Chromium mesurerait la pagination d'un autre moteur et ne
 * prouverait rien. Aucune base, aucun `.env` : données fictives, et le tampon
 * comme la signature viennent de `src/assets/` — donc à leur VRAIE hauteur.
 *
 * LE DÉFAUT (SES-0111, 21/09/2026) : 7 inscrits × 2 jours, le bloc « Certifié
 * exact » + signature + tampon partait SEUL en page 2. Même défaut que
 * l'assiduité corrigée par la PR #100.
 *
 * CE QUI EST EXIGÉ DE CHAQUE FEUILLE (une par stagiaire, une ligne par jour) :
 *   · la DERNIÈRE page porte la certification ET l'avant-dernier jour du
 *     tableau — donc au moins deux lignes accompagnent le tampon ;
 *   · une session de deux jours ou moins tient sur UNE page.
 */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import { renderEmargementHtml } from '../src/lib/closure/emargement-template';
import { formatDateFr, type ClosureContext } from '../src/lib/closure/shared-template';
import { isBusinessDayISO } from '../src/lib/business-days';

const WEASYPRINT = process.env.WEASYPRINT_URL ?? 'http://127.0.0.1:5001';
assert(/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(WEASYPRINT), 'Preuve locale uniquement : WEASYPRINT_URL doit être local.');

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Les jours ouvrés d'une période — même règle que le gabarit. */
function joursOuvres(debut: Date, fin: Date): Date[] {
  const jours: Date[] = [];
  for (const c = new Date(debut); c <= fin; c.setDate(c.getDate() + 1)) {
    if (isBusinessDayISO(iso(c))) jours.push(new Date(c));
  }
  return jours;
}

/** La date de fin qui donne exactement `n` jours ouvrés à partir de `debut`. */
function finPour(debut: Date, n: number): Date {
  const c = new Date(debut);
  for (let vus = 0; ; c.setDate(c.getDate() + 1)) {
    if (isBusinessDayISO(iso(c)) && ++vus === n) return new Date(c);
  }
}

const STAGIAIRES_7 = [
  ['Alex', 'EXEMPLE'], ['Camille', 'DÉMONSTRATION'], ['Sacha', 'FICTIF'], ['Dominique', 'MODÈLE'],
  ['Alexandra-Marie', 'EXEMPLE-DE-LA-DÉMONSTRATION'], ['Lou', 'TEST'], ['Morgan', 'ÉCHANTILLON'],
] as const;
const STAGIAIRES_12 = [
  ...STAGIAIRES_7,
  ['Charlie', 'SPÉCIMEN'], ['Andréa', 'GABARIT'], ['Maxime', 'PROTOTYPE'], ['Noa', 'ESSAI'], ['Jean-Baptiste', 'ILLUSTRATION-FICTIVE'],
] as const;

interface Cas {
  nom: string;
  titre: string;
  debut: Date;
  jours: number;
  stagiaires: ReadonlyArray<readonly [string, string]>;
  lieu: string;
}

const CAS: Cas[] = [
  {
    nom: 'SES-0111 (7 inscrits × 2 jours)',
    titre: 'Du surfeur au pilote — Étape 2',
    debut: new Date(2026, 8, 28),
    jours: 2,
    stagiaires: STAGIAIRES_7,
    lieu: 'Organisme de démonstration — 12 avenue de l’Exemple, 06800 Cagnes-sur-Mer',
  },
  {
    nom: '12 inscrits × 9 jours',
    titre: 'L’intelligence artificielle au service des conseillers immobiliers : prospection, communication et relation client (72 heures)',
    debut: new Date(2026, 10, 2),
    jours: 9,
    stagiaires: STAGIAIRES_12,
    lieu: 'Société de démonstration des professionnels de l’immobilier — 245 boulevard de la Démonstration, bâtiment C, 06800 Cagnes-sur-Mer',
  },
  {
    // Le pire cas d'une session courte : tous les libellés longs à la fois. Le
    // bloc d'information passe sur plus de lignes et mange la place du tampon.
    nom: '2 jours, libellés les plus longs',
    titre: 'L’intelligence artificielle au service des conseillers immobiliers : prospection, communication et relation client (72 heures)',
    debut: new Date(2026, 8, 28),
    jours: 2,
    stagiaires: [STAGIAIRES_7[4], STAGIAIRES_12[11]],
    lieu: 'Société de démonstration des professionnels de l’immobilier — 245 boulevard de la Démonstration, bâtiment C, 06800 Cagnes-sur-Mer',
  },
  {
    nom: '3 jours, libellés les plus longs',
    titre: 'L’intelligence artificielle au service des conseillers immobiliers : prospection, communication et relation client (72 heures)',
    debut: new Date(2026, 10, 2),
    jours: 3,
    stagiaires: [STAGIAIRES_7[4], STAGIAIRES_12[11]],
    lieu: 'Société de démonstration des professionnels de l’immobilier — 245 boulevard de la Démonstration, bâtiment C, 06800 Cagnes-sur-Mer',
  },
  // Le balayage : chaque durée de 1 à 12 jours, avec le nom le plus long.
  ...Array.from({ length: 12 }, (_, i) => ({
    nom: `balayage ${i + 1} jour${i > 0 ? 's' : ''}`,
    titre: 'Formation de démonstration',
    debut: new Date(2026, 10, 2),
    jours: i + 1,
    stagiaires: [STAGIAIRES_7[4]] as const,
    lieu: 'Organisme de démonstration — 12 avenue de l’Exemple, 06800 Cagnes-sur-Mer',
  })),
];

const sortie = await mkdtemp(path.join(tmpdir(), 'qualiof-emargement-'));
console.log(`Artefacts : ${sortie}\nMoteur    : WeasyPrint (${WEASYPRINT})\n`);

const echecs: string[] = [];
for (const cas of CAS) {
  const fin = finPour(cas.debut, cas.jours);
  const jours = joursOuvres(cas.debut, fin);
  assert.equal(jours.length, cas.jours, `${cas.nom} : ${jours.length} jours ouvrés calculés`);

  let pagesMax = 0;
  const avant = echecs.length;
  for (const [i, [prenom, nom]] of cas.stagiaires.entries()) {
    const ctx: ClosureContext = {
      apprenantPrenom: prenom,
      apprenantNom: nom,
      apprenantCivility: null,
      sessionId: 'preuve-locale-fictive',
      sessionCode: 'SES-PREUVE',
      sessionTitle: cas.titre,
      sessionStartDate: cas.debut,
      sessionEndDate: fin,
      sessionLocation: cas.lieu,
      sessionLocationCity: 'Cagnes-sur-Mer',
      sessionTrainers: ['Jean-Guy EXEMPLE'],
      durationHours: cas.jours * 8,
      tenantId: 'preuve-locale-fictive',
    };
    const html = renderEmargementHtml(ctx);
    const reponse = await fetch(`${WEASYPRINT}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    });
    assert(reponse.ok, `WeasyPrint local : ${reponse.status}`);
    const octets = new Uint8Array(await reponse.arrayBuffer());
    const base = `${cas.nom.replace(/[^a-z0-9]+/gi, '-')}-${i + 1}`;
    await writeFile(path.join(sortie, `${base}.pdf`), octets);

    const nbPages = (await PDFDocument.load(octets)).getPageCount();
    pagesMax = Math.max(pagesMax, nbPages);
    const doc = await getDocumentProxy(octets.slice());
    const { text } = await extractText(doc, { mergePages: false });
    await doc.destroy();
    const pages = (text as string[]).map((p) => p.replace(/\s+/g, ' '));
    const derniere = pages[pages.length - 1]!;
    const qui = `${cas.nom} › ${prenom} ${nom}`;

    try {
      assert.match(derniere, /Certifié exact/, `${qui} : la certification n’est pas sur la dernière page (${nbPages} p.)`);
      if (jours.length >= 2) {
        const avantDernier = formatDateFr(jours[jours.length - 2]!);
        assert(
          derniere.includes(avantDernier),
          `${qui} : TAMPON ORPHELIN — la dernière page (${nbPages}/${nbPages}) ne porte pas la ligne du ${avantDernier}`,
        );
      }
      // 3 jours compris depuis que la certification est À CÔTÉ du tampon (21/09).
      if (jours.length <= 3) assert.equal(nbPages, 1, `${qui} : ${nbPages} pages pour ${jours.length} jour(s)`);
    } catch (erreur) {
      echecs.push((erreur as Error).message);
    }
  }
  const verdict = echecs.length === avant ? '✓' : '✗';
  console.log(`${verdict} ${cas.nom.padEnd(34)} ${String(cas.stagiaires.length).padStart(2)} feuille(s) · ${pagesMax} page(s) max`);
}

console.log('');
assert.equal(echecs.length, 0, `${echecs.length} feuille(s) en défaut :\n  - ${echecs.join('\n  - ')}`);
console.log('Aucun tampon orphelin.');
