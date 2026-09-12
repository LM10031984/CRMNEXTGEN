/**
 * GARDE — les phrases ADMIN ne franchissent pas la frontière participant.
 *
 * ## Ce qui a rendu ce test nécessaire (11/09/2026)
 *
 * La page publique `/rdv/[token]` affichait « 1 demi-journée · 4 h sur site ·
 * 8 h conventionnées ». Les heures conventionnées sont une mécanique INTERNE :
 * deux formateurs sur site, donc une assiette financeur double des heures
 * réellement passées. Pour le client, ce sont deux chiffres qui se contredisent
 * pour le même créneau — au mieux du jargon, au pire un doute sur la facture.
 *
 * Le correctif a scindé chaque phrase en deux :
 *   • `decrireCreneau` / `decrireDureeProduit`                    → ADMIN
 *   • `decrireCreneauParticipant` / `decrireDureeProduitParticipant` → PARTICIPANT
 *
 * et la version admin est CONSTRUITE sur la version participant, pour qu'il
 * n'existe qu'une source. Mais rien, dans le code, n'empêche le prochain écran
 * public d'appeler la variante admin : les deux sont exportées du même module,
 * à une lettre près dans l'autocomplétion. C'est exactement le genre de
 * régression qui ne se voit pas en relecture de diff et qui se découvre sur la
 * capture d'écran d'un client.
 *
 * Ce garde-ci tient la FRONTIÈRE. Même famille que `chemins-en-dur.test.ts` et
 * `scripts-sous-tsc.test.ts` : on ne se fie pas à la vigilance, on outille.
 *
 * ## Ce qu'il interdit
 *
 * Tout import — direct ou par alias — de `decrireCreneau` et
 * `decrireDureeProduit` dans une zone dont le lecteur est un PARTICIPANT, un
 * prospect ou un client. Et l'accès par espace de noms (`creneaux.decrireCreneau`),
 * qui contourne l'import nommé.
 *
 * Les variantes `…Participant` sont, elles, parfaitement légitimes : c'est tout
 * l'objet de la distinction. Le test du prédicat, plus bas, le VÉRIFIE — sans
 * quoi ce garde interdirait précisément ce qu'il est censé encourager.
 *
 * ## Sa limite, écrite pour qu'on ne la redécouvre pas
 *
 * Le balayage passe par `git ls-files` : un fichier CRÉÉ mais pas encore indexé
 * est invisible, et le garde reste vert. Vérifié le 12/09/2026 en posant un
 * `app/rdv/confirmation/page.tsx` qui importait `decrireCreneau` — vert tant
 * qu'il n'était pas indexé, rouge dès `git add -N`. C'est le même piège qui
 * avait rendu VERTE la première mutation de `chemins-en-dur.test.ts`.
 *
 * Ce n'est pas un défaut à corriger : en CI le garde tourne sur du code
 * commité, donc indexé par construction. Mais en local, un `git add` avant de
 * conclure « c'est vert » n'est pas une formalité.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');

/** Les deux phrases qui portent « h conventionnées ». */
const PHRASES_ADMIN = ['decrireCreneau', 'decrireDureeProduit'] as const;

/**
 * Les ARBORESCENCES participant — balayées en entier, donc un écran public
 * ajouté demain est couvert sans que personne n'ait à y penser. C'est la
 * différence entre un garde et une liste de courses.
 */
const ZONES_ARBORESCENCES = ['apps/web/src/app/rdv', 'apps/web/src/app/preinscription'];

/**
 * Les fichiers participant ISOLÉS, qui vivent dans un dossier par ailleurs
 * admin. `components/campagne/` porte les deux publics : `campagne-actions.tsx`
 * et `nouvelle-campagne-form.tsx` sont des écrans admin et ont légitimement
 * besoin de la phrase longue — seul `rdv-form.tsx` est lu par le participant.
 */
const ZONES_FICHIERS = [
  'apps/web/src/components/campagne/rdv-form.tsx',
  // Emails dont le destinataire est un participant, un prospect ou un client.
  'apps/web/src/lib/preinscription-reminder-template.ts',
  'apps/web/src/lib/mailer-templates/diagnostic-programme.ts',
  'apps/web/src/lib/mailer-templates/proposition-remise.ts',
  // Chaîne de signature (lot C.2c) : le gabarit 1 part au signataire côté
  // BÉNÉFICIAIRE, les relances aussi, et l'exemplaire signé revient chez lui.
  // Le mail d'accompagnement n'est pas la convention : les heures
  // conventionnées vivent dans la PIÈCE JOINTE, où elles font foi, pas dans le
  // corps du message. `signature-email-commun.ts` est leur mise en page
  // partagée — ce qu'il produit sort de l'organisme, il suit donc la règle.
  'apps/web/src/lib/mailer-templates/signature-demande.ts',
  'apps/web/src/lib/mailer-templates/signature-email-commun.ts',
  'apps/web/src/lib/mailer-templates/signature-exemplaire.ts',
  'apps/web/src/lib/mailer-templates/signature-relance.ts',
];

/**
 * Les templates d'email dont le destinataire est INTERNE (ou le payeur, qui lit
 * une facture et pas une invitation) : la phrase admin y serait légitime.
 *
 * Cette liste n'est pas décorative — elle rend la classification EXHAUSTIVE.
 * Le dernier test échoue si un template n'est ni ici ni dans `ZONES_FICHIERS`,
 * ce qui force à trancher « qui lit ça ? » à la création, pas après l'incident.
 */
const TEMPLATES_INTERNES = [
  'apps/web/src/lib/mailer-templates/alerte-interne.ts',
  'apps/web/src/lib/mailer-templates/invoice-reminder.ts',
  'apps/web/src/lib/mailer-templates/lead-assigned.ts',
  'apps/web/src/lib/mailer-templates/user-invitation.ts',
  'apps/web/src/lib/mailer-templates/user-password-reset.ts',
];

/** Les noms tirés de tous les imports nommés du fichier, alias résolus. */
function symbolesImportes(contenu: string): string[] {
  const noms: string[] = [];
  for (const bloc of contenu.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g,
  )) {
    for (const spec of (bloc[1] ?? '').split(',')) {
      // « decrireCreneau as x » importe bien decrireCreneau : c'est le nom de
      // GAUCHE qui compte, sinon un alias suffirait à passer sous le garde.
      const nom = (spec.split(/\s+as\s+/)[0] ?? '').replace(/^\s*type\s+/, '').trim();
      if (nom) noms.push(nom);
    }
  }
  return noms;
}

/**
 * Les phrases admin qu'un fichier utilise. La frontière `\b` fait tout le
 * travail délicat : `decrireCreneau` ne matche PAS dans
 * `decrireCreneauParticipant`, puisque le « P » qui suit est un caractère de
 * mot. C'est vérifié explicitement plus bas.
 */
function phrasesAdminUtilisees(contenu: string): string[] {
  const importes = new Set(symbolesImportes(contenu));
  return PHRASES_ADMIN.filter(
    (p) => importes.has(p) || new RegExp(`\\.${p}\\b`).test(contenu),
  );
}

function suivisParGit(pathspecs: string[]): string[] {
  if (pathspecs.length === 0) return [];
  return execFileSync('git', ['ls-files', '--', ...pathspecs], {
    cwd: RACINE,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.includes('__tests__'));
}

/** Tous les fichiers dont le lecteur est un participant, un prospect ou un client. */
function fichiersParticipant(): string[] {
  return [...new Set([...suivisParGit(ZONES_ARBORESCENCES), ...ZONES_FICHIERS])].sort();
}

describe('le prédicat sait distinguer la phrase admin de la phrase participant', () => {
  /**
   * Le test le plus important du fichier. Un garde qui confondrait
   * `decrireCreneauParticipant` avec `decrireCreneau` rougirait sur la page
   * publique CORRIGÉE — il interdirait le remède en croyant traquer le mal, et
   * la seule issue serait de le désactiver.
   */
  it('attrape la phrase admin, importée ou aliasée', () => {
    expect(
      phrasesAdminUtilisees(`import { decrireCreneau } from '@/lib/campagne/creneaux';`),
    ).toEqual(['decrireCreneau']);
    expect(
      phrasesAdminUtilisees(`import { decrireDureeProduit } from '@/lib/campagne/creneaux';`),
    ).toEqual(['decrireDureeProduit']);
    // L'alias ne sauve pas.
    expect(
      phrasesAdminUtilisees(`import { decrireCreneau as phrase } from '@/lib/campagne/creneaux';`),
    ).toEqual(['decrireCreneau']);
    // L'espace de noms non plus.
    expect(
      phrasesAdminUtilisees(
        `import * as c from '@/lib/campagne/creneaux';\nconst s = c.decrireCreneau(m);`,
      ),
    ).toEqual(['decrireCreneau']);
  });

  it('laisse passer la phrase participant — sinon le garde interdirait le remède', () => {
    expect(
      phrasesAdminUtilisees(
        `import {\n  decrireCreneauParticipant,\n  decrireDureeProduitParticipant,\n} from '@/lib/campagne/creneaux';`,
      ),
    ).toEqual([]);
    expect(
      phrasesAdminUtilisees(
        `import * as c from '@/lib/campagne/creneaux';\nconst s = c.decrireCreneauParticipant(m);`,
      ),
    ).toEqual([]);
  });
});

describe('GARDE — aucune phrase admin sur un chemin participant', () => {
  it('aucun fichier lu par un participant n’importe decrireCreneau ni decrireDureeProduit', () => {
    const coupables = fichiersParticipant()
      .map((f) => ({ f, phrases: phrasesAdminUtilisees(fs.readFileSync(path.join(RACINE, f), 'utf8')) }))
      .filter(({ phrases }) => phrases.length > 0);

    expect(
      coupables.map(({ f, phrases }) => `${f} → ${phrases.join(', ')}`),
      `Ces fichiers sont lus par un participant, un prospect ou un client, et\n` +
        `emploient une phrase ADMIN — celle qui dit « h conventionnées ».\n` +
        `Utiliser decrireCreneauParticipant / decrireDureeProduitParticipant :\n`,
    ).toEqual([]);
  });
});

describe('le garde se garde lui-même', () => {
  it('le recensement dit vrai — il balaie bien les écrans publics connus', () => {
    // Un garde qui ne balaie plus rien passerait au vert en ne gardant rien.
    const fichiers = fichiersParticipant();
    expect(fichiers).toContain('apps/web/src/app/rdv/[token]/page.tsx');
    expect(fichiers).toContain('apps/web/src/app/preinscription/[token]/page.tsx');
    expect(fichiers.length).toBeGreaterThanOrEqual(ZONES_FICHIERS.length + 2);
  });

  it('la racine du dépôt est bien celle qu’on croit', () => {
    // Si RACINE dérape, `git ls-files` rend une liste vide et tout devient vert.
    expect(fs.existsSync(path.join(RACINE, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('aucune zone périmée — chaque fichier nommé existe encore', () => {
    const disparus = [...ZONES_FICHIERS, ...TEMPLATES_INTERNES].filter(
      (f) => !fs.existsSync(path.join(RACINE, f)),
    );
    expect(
      disparus,
      `Ces fichiers n’existent plus — mettre la liste à jour :\n  ${disparus.join('\n  ')}\n`,
    ).toEqual([]);
  });

  it('les deux phrases admin existent toujours sous ce nom', () => {
    // Un renommage silencieux viderait le garde de son objet sans le faire rougir.
    const src = fs.readFileSync(path.join(RACINE, 'apps/web/src/lib/campagne/creneaux.ts'), 'utf8');
    for (const p of PHRASES_ADMIN) expect(src).toMatch(new RegExp(`export function ${p}\\b`));
  });

  it('tout template d’email est classé — participant ou interne, jamais ni l’un ni l’autre', () => {
    const classes = new Set([...ZONES_FICHIERS, ...TEMPLATES_INTERNES]);
    const orphelins = suivisParGit(['apps/web/src/lib/mailer-templates']).filter(
      (f) => !classes.has(f),
    );
    expect(
      orphelins,
      `Ces templates ne sont classés nulle part. Décider QUI les lit, puis les\n` +
        `ajouter à ZONES_FICHIERS (participant/prospect/client) ou à\n` +
        `TEMPLATES_INTERNES (collègue, payeur) :\n  ${orphelins.join('\n  ')}\n`,
    ).toEqual([]);
  });
});
