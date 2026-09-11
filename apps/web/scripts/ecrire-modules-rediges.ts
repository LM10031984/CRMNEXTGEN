/**
 * Écrit au catalogue les trois modules rédigés par Laurent, et DÉPLACE les
 * signaux depuis les modules de rayon qui n'ont pas de contenu.
 *
 *   pnpm --filter @qualiof/web ecrire:modules:local              # simulation
 *   pnpm --filter @qualiof/web ecrire:modules:local -- --apply   # écriture
 *
 * Source : `~/Documents/nxt-coach/Formation Faros/BROUILLONS-3-MODULES-A-ECRIRE.md`
 * (v3, validé tel quel par Laurent le 11/09/2026). Le contenu est recopié, pas
 * reformulé : un déroulé validé ne se réécrit pas en le rangeant.
 *
 * ## L'étape qui compte : déplacer le signal
 *
 * Créer un module au contenu riche ne change RIEN tant que le signal de la
 * douleur reste posé sur le module de rayon vide. Le composeur suit les
 * signaux : il continuerait d'aller chercher l'étiquette et de laisser
 * « déroulé à compléter ». Le signal doit donc PARTIR de l'un et ARRIVER sur
 * l'autre — le laisser aux deux endroits ferait remonter les deux modules, et
 * le doublon reviendrait par la porte qu'on vient de fermer.
 *
 * ## Ce qu'on déplace, et ce qu'on ne déplace pas
 *
 * Le module « Suivi » (PROD-0680) porte HUIT signaux, dont un seul concerne le
 * suivi vendeur ; les sept autres servent l'acheteur, la négociation, la
 * diffusion, la base dormante. On ne déplace que celui qui nous regarde —
 * emporter les huit casserait sept rapprochements sans rapport avec ce travail.
 *
 * ## Ce que le script ne fait pas
 *
 * Il ne touche ni la durée, ni le titre, ni le contenu d'un module qu'il n'a
 * pas créé — sauf le seul module que Laurent a explicitement demandé de
 * compléter, et dont on retire au passage le point final du titre.
 */
import { prisma } from '@qualiof/db';

import { normalize } from '../src/lib/proposition/programme-matcher';

const APPLY = process.argv.includes('--apply');

// ─────────────────────────────────────────────────────────────────────────────
// Le contenu, recopié du brouillon v3
// ─────────────────────────────────────────────────────────────────────────────

const SUIVI_VENDEUR = `**Objectif.** À l'issue, le stagiaire est capable de monter son système de suivi vendeur — projet dédié par mandat, journal tenu au fil de l'eau, comptes rendus produits à la demande — de tenir un rythme hebdomadaire écrit, et de préparer un ajustement de prix à partir de faits mesurés plutôt que dans l'urgence.

**Prérequis.** Un compte ChatGPT actif ; savoir dicter sur son téléphone.

**Règle qui traverse le module.** L'IA prépare, le conseiller décide. Rien ne part au client sans relecture. Aucune donnée confidentielle dans un outil, aucune réponse publiée sans l'avoir lue.

- **Pourquoi on perd un vendeur après la signature (30 min).** Le conseiller fantôme : ce que vit le vendeur entre la signature et la première offre. Chaque participant prend un mandat en cours et date son dernier contact réel.
- **Le contrat de suivi (40 min).** La promesse posée le jour de la signature : ce qu'on s'engage à faire, à quelle fréquence, par quel canal. Chacun rédige le sien et le teste à voix haute.
- **Monter le projet du mandat (40 min).** Un projet ChatGPT par mandat, pas un chat : la mémoire et les fichiers y restent. Convention de nommage, instructions collées une fois pour toutes. Chacun crée le projet d'un de ses mandats en séance.
- **Journaliser au fil de l'eau, en vocal (40 min).** Trente secondes par action, sinon le système meurt. Les familles d'actions à consigner, la dictée depuis le téléphone — même compte, donc le projet est dans la poche. Trois saisies réelles par participant : une action terrain, une statistique de portail, une visite.
- **Une commande, un livrable (40 min).** Le compte rendu au vendeur après visite, le retour à l'acquéreur — celui que presque tout le monde saute —, le mail hebdomadaire. Chacun fait tourner les commandes sur son propre journal, puis relit et personnalise avant envoi. Comment écrire « elle a trouvé le prix trop élevé » de façon factuelle et sourcée, sans casser la relation.
- **Lire les chiffres et préparer l'ajustement (50 min).** Le rapport du portail collé dans le projet, le taux d'attractivité et ses zones de lecture, le cas piège : beaucoup de vues, aucun contact — c'est un frein prix, pas un problème d'annonce. Puis le bilan complet à partir du journal, mis en forme pour être présenté. Atelier : chacun prépare le bilan d'un de ses mandats et le présente en binôme, de façon que le vendeur conclue lui-même à l'ajustement.
- **Le dossier qui répond tout seul (20 min).** Le mandat, ses diagnostics et ses documents de copropriété rassemblés dans un carnet NotebookLM : les questions trouvent leur réponse sourcée, et le dossier se partage à un confrère ou à un acquéreur sérieux.`;

const AVIS_MANDATS = `**Objectif.** À l'issue, le stagiaire est capable de reconnaître le moment où un avis se demande, de le demander sans friction, d'y répondre — y compris à un avis négatif — dans le cadre légal, de chiffrer le gisement d'avis que représente son portefeuille passé, et de situer sa réputation face aux agences de son secteur.

**Prérequis.** Une fiche Google Business Profile active ; un compte ChatGPT.

**Règle qui traverse le module.** L'IA prépare, le conseiller décide. Rien ne part au client sans relecture. Aucune donnée confidentielle dans un outil, aucune réponse publiée sans l'avoir lue.

- **Ce que pèse un avis, avec des chiffres (20 min).** Une agence accompagnée sur une année : 52 avis au départ, 172 à l'arrivée. Un été : 12 estimations rentrées, dont 8 venues des avis. Et le fait nouveau : quand un vendeur demande à une IA quelle est la meilleure agence de son secteur, ce sont les avis qui répondent.
- **La règle qui change tout (25 min).** Un avis n'est pas la récompense d'une vente réussie et payée. Il se demande au moment où le client verbalise sa satisfaction — y compris en fin d'estimation, avant même qu'il ait choisi son agence. Ce qui se joue alors : quelqu'un qui vient d'écrire publiquement que vous êtes excellent aura du mal à en choisir un autre. Rien n'empêche d'en redemander un second au résultat final — l'un par monsieur, l'autre par madame. Le contre-exemple : demander au moment du déménagement ou de l'emménagement, quand le client n'a la tête à rien. Six demandes, trois avis, alors que cent personnes sont passées dans l'année.
- **Chiffrer son propre gisement (20 min).** Chacun compte les personnes accompagnées depuis ses débuts et estime combien lui ont dit merci à un moment. La moitié est un ordre de grandeur réaliste. On compare au nombre d'avis réellement en ligne. Sans oublier la gestion locative, souvent plus généreuse en avis que la transaction.
- **Demander sans friction (20 min).** Le lien court « Demander des avis » de Google Business Profile, transformé en QR code, posé sur le téléphone, la carte de visite et la signature mail. Puis les messages : ChatGPT rédige un SMS court et un mail, personnalisés au client et au moment — chacun garde deux ou trois variantes enregistrées et ne change que le prénom et la circonstance.
- **Répondre à tous les avis (20 min).** Le positif : court, personnalisé, jamais deux fois le même. Le négatif : accuser réception au calme, ne pas polémiquer, proposer de poursuivre en privé — et le faire même quand l'avis est injuste. ChatGPT propose, le conseiller relit et publie. Atelier sur des avis réels apportés par les participants.
- **Se situer face à son secteur (10 min).** Un carnet NotebookLM au nom de sa ville, une recherche approfondie sur les agences visibles du secteur : volume d'avis, points forts cités, irritants récurrents, positionnement. Ce qui en sort : une table comparative et les irritants des concurrents — qui sont exactement vos arguments de différenciation en rendez-vous. Rituel trimestriel.
- **Le cadre légal, la ligne rouge (5 min).** Jamais de faux avis, jamais d'avis acheté ni obtenu par contrepartie ; on sollicite l'avis et on facilite le geste, on n'écrit pas l'avis du client ; on ne dénigre pas un concurrent nommément — le benchmark sert la stratégie interne, pas l'attaque publique.`;

const ATELIER_AVIS = `**Objectif.** À l'issue, le stagiaire est capable de formuler une demande d'avis adaptée à chaque moment de satisfaction rencontré dans son activité, et de rédiger puis publier une réponse à un avis — positif ou négatif — conforme au cadre légal et fidèle à sa voix.

- **Rappel du cadre (10 min).** Ce qu'on ne fait jamais, et ce qu'on vérifie avant de publier : aucune donnée confidentielle, aucun ton défensif, jamais deux réponses identiques.
- **Série 1 — demander (25 min).** Trois situations tirées de leur semaine réelle : un client qui vient de dire « vous avez fait un travail sérieux » en fin d'estimation, un acquéreur accompagné qui n'a rien acheté chez eux, un propriétaire en gestion depuis des années. Chacun écrit sa demande pour les trois, s'aide de ChatGPT, puis corrige pour que ça sonne comme lui.
- **Série 2 — les avis positifs (25 min).** Trois avis réels de son agence. Réponse courte, personnalisée. Lecture croisée en binôme : on repère les tournures qui se répètent d'une réponse à l'autre.
- **Série 3 — les avis négatifs (40 min).** Trois cas : le reproche fondé, le reproche injuste, et l'avis qui ne concerne pas le conseiller. Écriture, lecture à voix haute, correction collective. On travaille le passage en privé sans se justifier en public.
- **Ce qui se publie (15 min).** Relecture croisée, puis publication accompagnée d'une réponse réelle pour chaque participant.
- **Repartir avec son rituel (5 min).** Ses variantes enregistrées, et la règle qu'il se donne : qui répond, sous quel délai, qui relit.`;

// ─────────────────────────────────────────────────────────────────────────────
// Les signaux
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le signal du suivi vendeur, posé par l'import du catalogue diagnostic sur un
 * module de rayon sans contenu. C'est CE signal qu'on déplace, et lui seul.
 */
const SIGNAL_SUIVI = 'Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives';

/**
 * L'e-réputation n'a AUCUN signal à déplacer : le module de rayon
 * « e réputation » (PROD-0678) en est dépourvu — il remontait par les mots de
 * son intitulé, pas par un signal. On en CRÉE donc un, ancré sur la douleur du
 * barème et portant le vocabulaire du besoin (avis, réputation, visible).
 */
const SIGNAL_EREPUTATION =
  'Réputation — des clients satisfaits mais invisibles en ligne : les avis ne se demandent pas au moment où le client exprime sa satisfaction';

// ─────────────────────────────────────────────────────────────────────────────

const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
if (!tenant) throw new Error('Aucun tenant');

console.log(
  `\n=== Modules rédigés · tenant « ${tenant.name} » · ${APPLY ? 'ÉCRITURE (--apply)' : 'SIMULATION'} ===\n`,
);

const journal: string[] = [];
const echecs: string[] = [];

async function produit(code: string) {
  return prisma.trainingProduct.findFirst({
    where: { tenantId: tenant!.id, code },
    select: {
      id: true,
      code: true,
      title: true,
      modules: {
        select: { id: true, title: true, order: true, durationMin: true, contentMd: true, diagnosticSignals: true },
      },
    },
  });
}

function signauxDe(m: { diagnosticSignals: unknown }): string[] {
  return Array.isArray(m.diagnosticSignals) ? (m.diagnosticSignals as unknown[]).map(String) : [];
}

/** Crée le module s'il manque, complète son contenu s'il existe déjà. */
async function poserModule(opts: {
  code: string;
  titre: string;
  contenu: string;
  duree: number;
  signal: string;
}) {
  const p = await produit(opts.code);
  if (!p) {
    echecs.push(`${opts.code} introuvable — « ${opts.titre} » non écrit.`);
    return;
  }
  const cle = normalize(opts.titre).trim();
  const existant = p.modules.find((m) => normalize(m.title).trim() === cle);

  if (existant) {
    const signaux = signauxDe(existant);
    const aSignal = signaux.some((s) => normalize(s).trim() === normalize(opts.signal).trim());
    const aContenu = (existant.contentMd ?? '').trim() === opts.contenu.trim();
    if (aContenu && aSignal) {
      journal.push(`· ${opts.code} « ${opts.titre} » — déjà écrit, rien à faire`);
      return;
    }
    if (APPLY) {
      await prisma.trainingModule.update({
        where: { id: existant.id },
        data: {
          contentMd: opts.contenu,
          durationMin: opts.duree,
          diagnosticSignals: aSignal ? signaux : [...signaux, opts.signal],
        },
      });
    }
    journal.push(`✅ ${opts.code} « ${opts.titre} » — module EXISTANT complété (contenu + signal)`);
    return;
  }

  const ordre = Math.max(0, ...p.modules.map((m) => m.order)) + 1;
  if (APPLY) {
    await prisma.trainingModule.create({
      data: {
        productId: p.id,
        order: ordre,
        title: opts.titre,
        contentMd: opts.contenu,
        durationMin: opts.duree,
        // Pas de `sourceRef` : ce module ne vient pas du Drive. C'est aussi ce
        // qui le protège — l'import ne reconnaît et ne réécrit que les modules
        // qui portent une source, et ne supprime jamais les autres.
        sourceRef: null,
        targetProfile: 'conseiller',
        isFoundation: false,
        diagnosticSignals: [opts.signal],
      },
    });
  }
  journal.push(
    `✅ ${opts.code} « ${opts.titre} » — module CRÉÉ (ordre ${ordre}, ${opts.duree} min, 1 signal)`,
  );
}

/** Retire un signal d'un module de rayon, pour qu'il ne fasse plus doublon. */
async function retirerSignal(code: string, titreModule: string, signal: string) {
  const p = await produit(code);
  if (!p) {
    echecs.push(`${code} introuvable — signal non retiré de « ${titreModule} ».`);
    return;
  }
  const cle = normalize(titreModule).trim();
  const cibles = p.modules.filter((m) => normalize(m.title).trim() === cle);
  if (cibles.length === 0) {
    echecs.push(`${code} « ${titreModule} » introuvable — signal non retiré.`);
    return;
  }
  for (const m of cibles) {
    const signaux = signauxDe(m);
    const restants = signaux.filter((s) => normalize(s).trim() !== normalize(signal).trim());
    if (restants.length === signaux.length) {
      journal.push(`· ${code} « ${titreModule} » — le signal n'y est plus (déjà déplacé)`);
      continue;
    }
    if (APPLY) {
      await prisma.trainingModule.update({
        where: { id: m.id },
        data: { diagnosticSignals: restants },
      });
    }
    journal.push(
      `✅ ${code} « ${titreModule} » — signal RETIRÉ, ${restants.length} signal(aux) conservé(s) sur ${signaux.length}`,
    );
  }
}

// ── 1 · les deux modules réels ───────────────────────────────────────────────
await poserModule({
  code: 'BIB-D037',
  titre: "Installer un rythme de suivi vendeur qui tient jusqu'à la vente",
  contenu: SUIVI_VENDEUR,
  duree: 240,
  signal: SIGNAL_SUIVI,
});
await poserModule({
  code: 'BIB-D047',
  titre: 'Faire des avis clients une source de mandats',
  contenu: AVIS_MANDATS,
  duree: 120,
  signal: SIGNAL_EREPUTATION,
});

// ── 2 · le module existant, complété ─────────────────────────────────────────
{
  const p = await produit('BIB-D047');
  const ancien = p?.modules.find((m) =>
    normalize(m.title).trim().startsWith('atelier pratique : simulation de reponse aux avis client'),
  );
  if (!ancien) {
    echecs.push("BIB-D047 « Atelier pratique : Simulation… » introuvable.");
  } else {
    const propre = ancien.title.trim().replace(/\.+$/, '');
    const signaux = signauxDe(ancien);
    const aSignal = signaux.some(
      (s) => normalize(s).trim() === normalize(SIGNAL_EREPUTATION).trim(),
    );
    // Sans ce garde, un second passage réécrirait les mêmes valeurs et
    // annoncerait une écriture. Inoffensif en base, trompeur au rapport — et
    // c'est le rapport qu'on lit pour décider s'il reste quelque chose à faire.
    const inchange =
      ancien.title === propre && (ancien.contentMd ?? '').trim() === ATELIER_AVIS.trim() && aSignal;
    if (inchange) {
      journal.push(`· BIB-D047 « ${propre} » — déjà écrit, rien à faire`);
    } else if (APPLY) {
      await prisma.trainingModule.update({
        where: { id: ancien.id },
        data: {
          title: propre,
          contentMd: ATELIER_AVIS,
          diagnosticSignals: aSignal ? signaux : [...signaux, SIGNAL_EREPUTATION],
        },
      });
    }
    if (!inchange) {
      journal.push(
        `✅ BIB-D047 « ${propre} » — déroulé écrit${
          ancien.title !== propre ? ', point final retiré du titre' : ''
        }${aSignal ? '' : ', signal posé'}`,
      );
    }
  }
}

// ── 3 · déplacer le signal depuis le module de rayon vide ────────────────────
await retirerSignal('PROD-0680', 'Suivi', SIGNAL_SUIVI);

// ─────────────────────────────────────────────────────────────────────────────

for (const l of journal) console.log(`  ${l}`);
if (echecs.length > 0) {
  console.log('\n  ❌ Échecs — rien écrit pour ces lignes :');
  for (const e of echecs) console.log(`     ${e}`);
}
console.log(
  `\n  ${journal.filter((l) => l.startsWith('✅')).length} écriture(s) · ${
    journal.filter((l) => l.startsWith('·')).length
  } déjà en place · ${echecs.length} échec(s)`,
);
if (!APPLY) console.log('\n  Simulation : aucune écriture. Relancer avec `-- --apply`.');
console.log('');

await prisma.$disconnect();
process.exit(echecs.length > 0 ? 1 : 0);
