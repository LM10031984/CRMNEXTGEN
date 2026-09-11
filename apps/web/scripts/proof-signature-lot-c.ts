/**
 * Preuve du lot C.2c — les CINQ gabarits de la chaîne de signature, rendus.
 *
 *   pnpm -F @qualiof/web exec tsx scripts/proof-signature-lot-c.ts
 *
 * SANS RÉSEAU, SANS BASE, SANS `.env`. Le script n'envoie rien : il rend. Et il
 * rend avec une configuration d'organisme FICTIVE et FIGÉE, délibérément — une
 * preuve qui change selon le `.env` chargé prouve moins qu'une preuve que
 * n'importe qui régénère à l'identique. Aucune donnée de production n'entre
 * dans un fichier versionné : ni email réel, ni SIRET réel, ni nom d'une
 * personne existante.
 *
 * TROIS DES CINQ GABARITS N'ONT AUCUN APPELANT (relances J+3/J+7, exemplaire
 * signé) : leur déclencheur est le cron et le webhook du lot C.3. C'est
 * exactement ce que ces fichiers servent à établir — ce que le gabarit COMPOSE,
 * pas qu'un email soit parti. Le README le dit en toutes lettres.
 *
 * LE SCRIPT REFUSE D'ÉCRIRE si l'un des rendus contient « dirigeant » (casse et
 * accents normalisés). Une preuve qui contredit la règle du vocabulaire n'est
 * pas une preuve : c'est un constat de régression versionné.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OfConfig } from '../src/lib/of-config';
import {
  renderSignatureDemandeClient,
  renderSignatureDemandeOf,
  type SignatureDemandeInput,
} from '../src/lib/mailer-templates/signature-demande';
import { renderSignatureRelance } from '../src/lib/mailer-templates/signature-relance';
import { renderSignatureExemplaire } from '../src/lib/mailer-templates/signature-exemplaire';

const ICI = dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.PROOF_OUT ?? resolve(ICI, '../../../.planning/specs/evidence/signature-C');

/** Organisme FICTIF et FIGÉ — voir l'en-tête. Aucune valeur réelle. */
const OF: OfConfig = {
  name: 'Start Academy',
  siret: '000 000 000 00000 (fictif)',
  rnq: '00 00 00000 00 (fictif)',
  addressFull: '1 rue de la Preuve, 00000 Exemple',
} as unknown as OfConfig;

/** Dates FIGÉES : une preuve qui bouge avec l'horloge n'est pas comparable. */
const ENVOYEE_LE = new Date('2026-09-11T09:00:00.000Z');
const DATE_LIMITE = new Date('2026-10-11T09:00:00.000Z');
const SIGNEE_LE = new Date('2026-09-20T14:30:00.000Z');

const CONVENTION: SignatureDemandeInput = {
  signataireNom: 'Claire DUPONT',
  qualiteSignataire: 'responsable-organisation',
  libellePiece: 'Convention — AGENCE MARTIN & FILS (2 participants)',
  formationTitre: "L'IA au service de l'agent commercial immobilier",
  sessionCode: 'SES-0000',
  signUrl: 'https://docuseal.eu/s/EXEMPLE-CLIENT',
  dateLimite: DATE_LIMITE,
};

const AGEFICE: SignatureDemandeInput = {
  ...CONVENTION,
  signataireNom: 'Marie EXEMPLE',
  qualiteSignataire: 'stagiaire',
  libellePiece: 'Dossier AGEFICE — Marie EXEMPLE',
  signUrl: 'https://docuseal.eu/s/EXEMPLE-STAGIAIRE',
};

const POUR_OF: SignatureDemandeInput = {
  ...CONVENTION,
  signataireNom: 'Laurent MARX',
  signUrl: 'https://docuseal.eu/s/EXEMPLE-OF',
};

interface Piece {
  fichier: string;
  gabarit: string;
  branche: boolean;
  destinataire: string;
  rendu: { subject: string; html: string; text: string };
  piecesJointes: string[];
}

const PIECES: Piece[] = [
  {
    fichier: 'signature-demande-client-responsable.html',
    gabarit: '1. Demande de signature — bénéficiaire (responsable de l’organisation)',
    branche: true,
    destinataire: 'responsable@agence-fictive.fr',
    rendu: renderSignatureDemandeClient(CONVENTION, OF),
    piecesJointes: [],
  },
  {
    fichier: 'signature-demande-client-stagiaire.html',
    gabarit: '1 bis. Demande de signature — bénéficiaire (stagiaire, il signe pour lui-même)',
    branche: true,
    destinataire: 'stagiaire@exemple-fictif.fr',
    rendu: renderSignatureDemandeClient(AGEFICE, OF),
    piecesJointes: [],
  },
  {
    fichier: 'signature-demande-of.html',
    gabarit: '2. « À votre tour de signer » — organisme (cas signatoryOrder = BEFORE)',
    branche: true,
    destinataire: 'signataire@of-fictif.fr',
    rendu: renderSignatureDemandeOf(POUR_OF, OF),
    piecesJointes: [],
  },
  {
    fichier: 'signature-relance-j3.html',
    gabarit: '3. Relance J+3',
    branche: false,
    destinataire: 'responsable@agence-fictive.fr',
    rendu: renderSignatureRelance({ ...CONVENTION, rang: 1, envoyeeLe: ENVOYEE_LE }, OF),
    piecesJointes: [],
  },
  {
    fichier: 'signature-relance-j7.html',
    gabarit: '4. Relance J+7 (dernier rappel)',
    branche: false,
    destinataire: 'responsable@agence-fictive.fr',
    rendu: renderSignatureRelance({ ...CONVENTION, rang: 2, envoyeeLe: ENVOYEE_LE }, OF),
    piecesJointes: [],
  },
  {
    fichier: 'signature-exemplaire-signe.html',
    gabarit: '5. « Voici votre exemplaire signé »',
    branche: false,
    destinataire: 'responsable@agence-fictive.fr',
    rendu: renderSignatureExemplaire(
      {
        signataireNom: 'Claire DUPONT',
        qualiteSignataire: 'responsable-organisation',
        libellePiece: 'Convention — AGENCE MARTIN & FILS (2 participants)',
        formationTitre: "L'IA au service de l'agent commercial immobilier",
        sessionCode: 'SES-0000',
        signeLe: SIGNEE_LE,
        piecesJointes: [
          'convention-agence-martin.pdf',
          'convention-agence-martin.audit-trail.pdf',
        ],
      },
      OF,
    ),
    piecesJointes: ['convention-agence-martin.pdf', 'convention-agence-martin.audit-trail.pdf'],
  },
];

/** Casse + accents normalisés : « Dirigeant » et « dirigeants » comptent. */
function contientDirigeant(texte: string): boolean {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .includes('dirigeant');
}

/** La phrase du corps qui NOMME le destinataire — ce que le README cite. */
function phraseDeQualite(text: string): string {
  return (
    text.split('\n').find((l) => l.includes('en qualité de'))?.trim() ??
    '(aucune phrase de qualité trouvée)'
  );
}

function main(): void {
  // ── Le refus, AVANT toute écriture ────────────────────────────────────────
  const fautifs = PIECES.filter(
    (p) =>
      contientDirigeant(p.rendu.subject) ||
      contientDirigeant(p.rendu.html) ||
      contientDirigeant(p.rendu.text),
  );
  if (fautifs.length > 0) {
    console.error(
      '\n⛔ Rien n’a été écrit. Ces rendus contiennent « dirigeant », interdit par la\n' +
        '   spec §3 ter : le champ `Organization.representative` dit qui représente\n' +
        '   l’organisation et signe ses conventions, pas une qualité juridique.\n',
    );
    for (const f of fautifs) console.error(`   - ${f.fichier}`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });

  const lignes: string[] = [
    '<!-- GÉNÉRÉ par apps/web/scripts/proof-signature-lot-c.ts — ne pas éditer à la main. -->',
    '<!-- Une preuve recopiée ne prouve que la recopie. -->',
    '',
    '# Enveloppes — ce que chaque gabarit compose',
    '',
    '| Fichier | Gabarit | Branché ? | Destinataire | Objet | Pièces jointes |',
    '|---|---|---|---|---|---|',
  ];

  for (const p of PIECES) {
    writeFileSync(resolve(OUT, p.fichier), p.rendu.html, 'utf-8');
    const jointes = p.piecesJointes.length === 0 ? '**aucune**' : p.piecesJointes.join('<br>');
    const branche = p.branche ? '✅ lot C.2c' : '⬜ **non — lot C.3**';
    lignes.push(
      `| \`${p.fichier}\` | ${p.gabarit} | ${branche} | \`${p.destinataire}\` | ${p.rendu.subject} | ${jointes} |`,
    );
  }

  lignes.push('');
  lignes.push('## La phrase qui nomme le destinataire');
  lignes.push('');
  lignes.push(
    'C’est elle qui porte la règle du vocabulaire (spec §3 ter). Aucune n’emploie le mot ' +
      'que cette règle interdit — le script refuse d’écrire si l’une le fait.',
  );
  lignes.push('');
  lignes.push('| Fichier | Phrase exacte |');
  lignes.push('|---|---|');
  for (const p of PIECES) {
    lignes.push(`| \`${p.fichier}\` | ${phraseDeQualite(p.rendu.text)} |`);
  }
  lignes.push('');

  writeFileSync(resolve(OUT, 'enveloppes.md'), lignes.join('\n'), 'utf-8');

  // ── Le récapitulatif à l'écran, pour un `pnpm` en CI ──────────────────────
  console.log(`\n✅ ${PIECES.length} rendus écrits dans ${OUT}\n`);
  for (const p of PIECES) {
    console.log(`   ${p.branche ? '✅' : '⬜'} ${p.fichier}`);
    console.log(`      destinataire : ${p.destinataire}`);
    console.log(`      objet        : ${p.rendu.subject}`);
    console.log(
      `      pièces       : ${p.piecesJointes.length === 0 ? 'aucune' : p.piecesJointes.join(', ')}`,
    );
  }
  console.log(
    '\n   ⬜ = gabarit écrit et rendu, mais AUCUN appelant avant le lot C.3.' +
      '\n   Ces fichiers prouvent ce que le gabarit compose, jamais qu’un email soit parti.\n',
  );
}

main();
