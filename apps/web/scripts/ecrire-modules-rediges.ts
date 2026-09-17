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
 *
 * ## ⛔ L'ORDRE N'EST PAS UNE PRÉFÉRENCE — il conditionne la survie du travail
 *
 * Ce script écrit des déroulés rédigés à la main, qui partent dans des
 * programmes remis à des dirigeants et à des financeurs. Depuis le 17/09/2026,
 * `import-drive-catalog.ts` ne réécrit plus que ce qu'il a lui-même écrit : il
 * compare le contenu en base à l'empreinte qu'il y a laissée
 * (`TrainingModule.contentMdFingerprint`).
 *
 * Mais **une empreinte ABSENTE ne protège rien** — `NULL` veut dire « l'import
 * n'a rien à protéger ici », pas « protégé ». C'est le bon défaut : sans lui, la
 * colonne aurait gelé tout le catalogue le jour de sa naissance. Sa conséquence
 * ne se voit pas venir :
 *
 *   ① import COMPLET   → chaque module porte l'empreinte de ce que l'import a écrit
 *   ② SEULEMENT ENSUITE → ce versement
 *   ③ import suivant   → empreinte ≠ contenu, il refuse et il nomme
 *
 * Inversé, l'ordre ne casse rien bruyamment : **il perd le travail en silence**
 * au prochain import, et le rapport annonce « 400 mis à jour », ce qui a l'air
 * d'une bonne nouvelle. C'est la forme exacte du défaut qu'on traque.
 *
 * Une consigne se perd, une garde non : `ciblesSansEmpreinte` est appelée AVANT
 * toute écriture, et le script REFUSE si une seule de ses cibles gérées par
 * l'import n'a pas d'empreinte. Les modules qu'il CRÉE n'ont pas de `sourceRef`
 * — l'import ne les connaît pas, ne les écrira jamais, ils ne sont pas visés.
 */
import { createPrismaClientForUrl, type Prisma } from '@qualiof/db';
import {
  CibleInattendueError,
  transactionGardee,
  type MarqueursCible,
} from '@qualiof/db/garde-cible';
import { ciblesSansEmpreinte, MOTIF_ORDRE_INVERSE } from '@qualiof/db/empreinte-import';

import { accumulerSignaux } from '../src/lib/proposition/accumulation-signaux';
import { normalize } from '../src/lib/proposition/programme-matcher';

const APPLY = process.argv.includes('--apply');

/**
 * La connexion DIRECTE (`:5432`), jamais la poolée — une seule voie d'écriture
 * dans le dépôt, la même que l'import et que `ecrire-rattachements.ts`.
 */
const CIBLE_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!CIBLE_URL)
  throw new Error('Ni DIRECT_URL ni DATABASE_URL — cible inconnue, on ne devine pas.');
const prisma = createPrismaClientForUrl(CIBLE_URL);
const HOTE = (() => {
  try {
    return new URL(CIBLE_URL).hostname;
  } catch {
    return '(illisible)';
  }
})();

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

/** Les marqueurs de CONTENU — une base s'identifie par eux, jamais par son nom. */
const ATTENDU: MarqueursCible = {
  tenantId: tenant.id,
  tenantNom: tenant.name,
  produits: await prisma.trainingProduct.count({ where: { tenantId: tenant.id } }),
  modules: await prisma.trainingModule.count({ where: { product: { tenantId: tenant.id } } }),
};

async function relireMarqueurs(tx: Prisma.TransactionClient): Promise<MarqueursCible | null> {
  const t = await tx.tenant.findUnique({
    where: { id: ATTENDU.tenantId },
    select: { id: true, name: true },
  });
  if (!t) return null;
  return {
    tenantId: t.id,
    tenantNom: t.name,
    produits: await tx.trainingProduct.count({ where: { tenantId: t.id } }),
    modules: await tx.trainingModule.count({ where: { product: { tenantId: t.id } } }),
  };
}

console.log(
  `\n=== Modules rédigés · tenant « ${tenant.name} » · ${APPLY ? 'ÉCRITURE (--apply)' : 'SIMULATION'} ===\n`,
);
console.log(`🎯 Cible : ${HOTE}`);
console.log(`   tenant : ${tenant.id} « ${tenant.name} »`);
console.log(`   avant  : ${ATTENDU.produits} produits · ${ATTENDU.modules} modules\n`);

const journal: string[] = [];
const echecs: string[] = [];

const CLE = (x: string) => normalize(x).trim();

function signauxDe(m: { diagnosticSignals: unknown }): string[] {
  return Array.isArray(m.diagnosticSignals) ? (m.diagnosticSignals as unknown[]).map(String) : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — DÉCIDER. Aucune écriture ici, et aucune valeur lue ici ne sert à
// calculer une écriture : elle sert à trouver la CIBLE. L'état, lui, est relu
// dans la transaction. C'est la leçon du 17/09 (`drive:020`, puis les
// rattachements) appliquée avant de la revivre une troisième fois.
// ─────────────────────────────────────────────────────────────────────────────

interface ModuleLu {
  id: string;
  title: string;
  order: number;
  sourceRef: string | null;
  contentMd: string;
  contentMdFingerprint: string | null;
  diagnosticSignals: unknown;
}

async function produit(code: string) {
  return prisma.trainingProduct.findFirst({
    where: { tenantId: tenant!.id, code },
    select: {
      id: true,
      code: true,
      modules: {
        select: {
          id: true,
          title: true,
          order: true,
          sourceRef: true,
          contentMd: true,
          contentMdFingerprint: true,
          diagnosticSignals: true,
        },
      },
    },
  });
}

type Intention =
  | {
      genre: 'contenu';
      libelle: string;
      code: string;
      produitId: string;
      /** L'identité du module VISÉ — `null` quand il reste à créer. */
      moduleId: string | null;
      sourceRef: string | null;
      cleTitre: string;
      titre: string;
      contenu: string;
      duree: number;
      signal: string;
    }
  | {
      genre: 'retirer-signal';
      libelle: string;
      code: string;
      moduleId: string;
      signal: string;
    };

const intentions: Intention[] = [];
/** Ce que la garde d'ORDRE doit examiner : les cibles que l'import gère. */
const ciblesGarde: { sourceRef: string | null; titre: string; empreinte: string | null }[] = [];

/** Un module rédigé : créé s'il manque, complété s'il est déjà là. */
async function viserParTitre(opts: {
  code: string;
  titre: string;
  contenu: string;
  duree: number;
  signal: string;
}): Promise<void> {
  const p = await produit(opts.code);
  if (!p) {
    echecs.push(`${opts.code} introuvable — « ${opts.titre} » non écrit.`);
    return;
  }
  // Ces modules-là n'ont PAS de `sourceRef` : ils naissent ici, hors de toute
  // source. Le titre est donc leur seule prise — et c'est acceptable parce que
  // c'est ce script qui les a écrits, lui et personne d'autre.
  const existant = (p.modules as ModuleLu[]).find((m) => CLE(m.title) === CLE(opts.titre));
  if (existant) {
    ciblesGarde.push({
      sourceRef: existant.sourceRef,
      titre: existant.title,
      empreinte: existant.contentMdFingerprint,
    });
  }
  intentions.push({
    genre: 'contenu',
    libelle: `${opts.code} « ${opts.titre} »`,
    code: opts.code,
    produitId: p.id,
    moduleId: existant?.id ?? null,
    sourceRef: existant?.sourceRef ?? null,
    cleTitre: CLE(opts.titre),
    titre: opts.titre,
    contenu: opts.contenu,
    duree: opts.duree,
    signal: opts.signal,
  });
}

/**
 * Le module que Laurent a demandé de compléter — visé par son IDENTITÉ.
 *
 * Il l'était par son titre (« Atelier pratique : Simulation… ») jusqu'au
 * 17/09/2026. Ça ne pouvait plus marcher : l'import applique depuis le 14/09
 * l'arbitrage de titre de Laurent et l'a renommé « Répondre aux avis clients en
 * ligne, positifs comme négatifs ». Le script aurait rendu « introuvable » sur
 * une base à jour — un code n'est pas une adresse, un titre encore moins (§5.4).
 */
async function viserParSourceRef(opts: {
  code: string;
  sourceRef: string;
  contenu: string;
  signal: string;
}): Promise<void> {
  const p = await produit(opts.code);
  const m = p ? (p.modules as ModuleLu[]).find((x) => x.sourceRef === opts.sourceRef) : undefined;
  if (!p || !m) {
    echecs.push(`${opts.code} · ${opts.sourceRef} introuvable — déroulé non écrit.`);
    return;
  }
  ciblesGarde.push({ sourceRef: m.sourceRef, titre: m.title, empreinte: m.contentMdFingerprint });
  intentions.push({
    genre: 'contenu',
    libelle: `${opts.code} « ${m.title.slice(0, 48)} »`,
    code: opts.code,
    produitId: p.id,
    moduleId: m.id,
    sourceRef: m.sourceRef,
    cleTitre: CLE(m.title),
    // Le titre n'est pas réécrit : on retire seulement un point final s'il en
    // reste un. L'arbitrage de Laurent, appliqué par l'import, fait foi.
    titre: m.title.trim().replace(/\.+$/, ''),
    contenu: opts.contenu,
    duree: 0,
    signal: opts.signal,
  });
}

/**
 * Le signal QUITTE le module de rayon vide — il n'est pas copié, il est déplacé.
 *
 * ## Visé par son TITRE, plus par son code — corrigé le 17/09/2026
 *
 * Ce ciblage était `PROD-0680`, en dur. Mesuré le 17/09 en lecture seule, le
 * MÊME produit « Catalogue diagnostic — Vendeur » porte trois codes différents
 * selon la base :
 *
 *   | base    | code        | signaux sur « Suivi » |
 *   |---------|-------------|-----------------------|
 *   | locale  | `PROD-0680` | 7 (déjà déplacé)      |
 *   | PROD    | `PROD-0681` | 8                     |
 *   | vierge  | `PROD-0006` | 8                     |
 *
 * Le code est un compteur par tenant, attribué à l'import : il désigne un rang
 * d'arrivée, pas un produit (§5.4). Lancé en production, ce script aurait rendu
 * « PROD-0680 introuvable — signal non retiré » et serait sorti en échec **sans
 * avoir déplacé le signal** — or l'en-tête de ce fichier appelle ce déplacement
 * « l'étape qui compte ». Le module riche aurait été écrit, et le composeur
 * aurait continué d'aller chercher l'étiquette vide.
 *
 * Le titre du produit, lui, est le même dans les trois bases.
 */
async function viserRetraitDeSignal(titreProduit: string, titreModule: string, signal: string) {
  const produits = await prisma.trainingProduct.findMany({
    where: { tenantId: tenant!.id },
    select: { id: true, code: true, title: true },
  });
  const trouves = produits.filter((x) => CLE(x.title) === CLE(titreProduit));
  if (trouves.length === 0) {
    echecs.push(`« ${titreProduit} » introuvable — signal non retiré.`);
    return;
  }
  if (trouves.length > 1) {
    // On ne devine pas lequel : poser ou retirer un signal sur le mauvais
    // produit se voit dans une proposition client, pas ici.
    echecs.push(
      `« ${titreProduit} » désigne ${trouves.length} produits (${trouves
        .map((x) => x.code)
        .join(', ')}) — signal non retiré, il faut trancher.`,
    );
    return;
  }
  const p = trouves[0]!;
  const modules = await prisma.trainingModule.findMany({
    where: { productId: p.id },
    select: { id: true, title: true },
  });
  const cibles = modules.filter((m) => CLE(m.title) === CLE(titreModule));
  if (cibles.length === 0) {
    echecs.push(`${p.code} « ${titreModule} » introuvable — signal non retiré.`);
    return;
  }
  for (const m of cibles) {
    intentions.push({
      genre: 'retirer-signal',
      libelle: `${p.code} « ${titreModule} »`,
      code: p.code,
      moduleId: m.id,
      signal,
    });
  }
}

// ── 1 · les deux modules rédigés ─────────────────────────────────────────────
await viserParTitre({
  code: 'BIB-D037',
  titre: "Installer un rythme de suivi vendeur qui tient jusqu'à la vente",
  contenu: SUIVI_VENDEUR,
  duree: 240,
  signal: SIGNAL_SUIVI,
});
await viserParTitre({
  code: 'BIB-D047',
  titre: 'Faire des avis clients une source de mandats',
  contenu: AVIS_MANDATS,
  duree: 120,
  signal: SIGNAL_EREPUTATION,
});

// ── 2 · le module existant, complété ─────────────────────────────────────────
await viserParSourceRef({
  code: 'BIB-D047',
  sourceRef: 'drive:047#20',
  contenu: ATELIER_AVIS,
  signal: SIGNAL_EREPUTATION,
});

// ── 3 · déplacer le signal depuis le module de rayon vide ────────────────────
await viserRetraitDeSignal('Catalogue diagnostic — Vendeur', 'Suivi', SIGNAL_SUIVI);

// ─────────────────────────────────────────────────────────────────────────────
// LA GARDE D'ORDRE — avant toute écriture, et elle refuse
// ─────────────────────────────────────────────────────────────────────────────
const sansEmpreinte = ciblesSansEmpreinte(ciblesGarde);
if (sansEmpreinte.length > 0) {
  console.error('\n⛔ REFUS — ce versement est lancé TROP TÔT.\n');
  for (const c of sansEmpreinte) {
    console.error(`   ${c.sourceRef} « ${c.titre.slice(0, 60)} » — aucune empreinte`);
  }
  console.error(`\n   ${MOTIF_ORDRE_INVERSE}\n`);
  console.error("   L'ordre :");
  console.error('     ① pnpm --filter @qualiof/db import:drive-catalog -- --apply');
  console.error('     ② ce script');
  console.error("     ③ l'import suivant refusera de réécrire ce qu'un humain a posé\n");
  await prisma.$disconnect();
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — ÉCRIRE. Une transaction, l'état relu dedans, l'AuditLog dedans.
// ─────────────────────────────────────────────────────────────────────────────

let bilan: {
  crees: number;
  completes: number;
  signaux: number;
  retires: number;
  inchanges: number;
} | null = null;

if (APPLY && intentions.length > 0) {
  bilan = await transactionGardee(prisma, ATTENDU, relireMarqueurs, async (tx) => {
    let crees = 0;
    let completes = 0;
    let signaux = 0;
    let retires = 0;
    let inchanges = 0;

    for (const it of intentions) {
      if (it.genre === 'retirer-signal') {
        const frais = await tx.trainingModule.findUnique({
          where: { id: it.moduleId },
          select: { title: true, diagnosticSignals: true },
        });
        if (!frais) throw new Error(`${it.libelle} a disparu entre la lecture et l'écriture.`);
        const avant = signauxDe(frais);
        const apres = avant.filter((x) => CLE(x) !== CLE(it.signal));
        if (apres.length === avant.length) {
          inchanges += 1;
          journal.push(`· ${it.libelle} — le signal n'y est plus (déjà déplacé)`);
          continue;
        }
        await tx.trainingModule.update({
          where: { id: it.moduleId },
          data: { diagnosticSignals: apres },
        });
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            userId: null,
            entity: 'TrainingModule',
            entityId: it.moduleId,
            action: 'diagnostic.rattachement.retire',
            diff: {
              module: frais.title,
              signal: it.signal,
              before: { diagnosticSignals: avant },
              after: { diagnosticSignals: apres },
              source: 'scripts/ecrire-modules-rediges.ts',
            },
          },
        });
        retires += 1;
        journal.push(
          `✅ ${it.libelle} — signal RETIRÉ, ${apres.length} signal(aux) conservé(s) sur ${avant.length}`,
        );
        continue;
      }

      // L'état est relu DANS la transaction, y compris l'existence du module :
      // c'est ce qui rend le script idempotent en UN passage et non en deux.
      const modules = await tx.trainingModule.findMany({
        where: { productId: it.produitId },
        select: { id: true, title: true, order: true, contentMd: true, diagnosticSignals: true },
      });
      const cible =
        (it.moduleId ? modules.find((m) => m.id === it.moduleId) : undefined) ??
        modules.find((m) => CLE(m.title) === it.cleTitre);

      if (!cible) {
        const ordre = Math.max(0, ...modules.map((m) => m.order)) + 1;
        const cree = await tx.trainingModule.create({
          data: {
            productId: it.produitId,
            order: ordre,
            title: it.titre,
            contentMd: it.contenu,
            durationMin: it.duree,
            diagnosticSignals: [it.signal],
            // PAS de `sourceRef` : ce module ne vient pas du Drive. C'est aussi
            // ce qui le met hors de portée de l'import — il ne le connaît pas,
            // il ne l'écrira jamais.
            sourceRef: null,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            userId: null,
            entity: 'TrainingModule',
            entityId: cree.id,
            action: 'trainingModule.create',
            diff: {
              source: 'scripts/ecrire-modules-rediges.ts',
              programme: it.code,
              titre: it.titre,
              signal: it.signal,
              provenance: 'module rédigé à la main (hors Drive)',
            },
          },
        });
        crees += 1;
        signaux += 1;
        journal.push(`✅ ${it.libelle} — module CRÉÉ (ordre ${ordre}, ${it.duree} min, 1 signal)`);
        continue;
      }

      const avant = signauxDe(cible);
      const { aAjouter } = accumulerSignaux(avant, [it.signal], CLE);
      const apres = [...avant, ...aAjouter];
      const titreChange = cible.title !== it.titre;
      const contenuChange = (cible.contentMd ?? '').trim() !== it.contenu.trim();

      if (!titreChange && !contenuChange && aAjouter.length === 0) {
        inchanges += 1;
        journal.push(`· ${it.libelle} — déjà écrit, rien à faire`);
        continue;
      }

      await tx.trainingModule.update({
        where: { id: cible.id },
        data: {
          title: it.titre,
          contentMd: it.contenu,
          diagnosticSignals: apres,
          // L'empreinte n'est PAS posée ici, et c'est délibéré : elle appartient
          // à l'import et ne décrit que ce que l'IMPORT a écrit. La poser
          // reviendrait à signer son travail du nom de quelqu'un d'autre — et
          // l'import, au passage suivant, croirait ce contenu sien et
          // l'écraserait. C'est exactement ce qu'on protège.
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: null,
          entity: 'TrainingModule',
          entityId: cible.id,
          action: 'moduleRedige.contenu.pose',
          diff: {
            source: 'scripts/ecrire-modules-rediges.ts',
            programme: it.code,
            sourceRef: it.sourceRef,
            before: {
              title: cible.title,
              contentMdLongueur: (cible.contentMd ?? '').trim().length,
              diagnosticSignals: avant,
            },
            after: {
              title: it.titre,
              contentMdLongueur: it.contenu.trim().length,
              diagnosticSignals: apres,
            },
          },
        },
      });
      completes += 1;
      signaux += aAjouter.length;
      journal.push(
        `✅ ${it.libelle} — déroulé écrit${titreChange ? ', titre nettoyé' : ''}${
          aAjouter.length > 0 ? ', signal posé' : ''
        }`,
      );
    }

    return { crees, completes, signaux, retires, inchanges };
  }).catch((e: unknown) => {
    if (e instanceof CibleInattendueError) {
      console.error("\n⛔ ÉCHEC — la base d'écriture n'est PAS celle du relevé.\n");
      for (const ecart of e.ecarts) console.error(`   ${ecart}`);
      console.error(`\n   Connexion d'écriture : ${HOTE}.\n   ROLLBACK. Rien n'a été écrit.\n`);
      process.exitCode = 1;
      return null;
    }
    throw e;
  });
  if (process.exitCode === 1) {
    await prisma.$disconnect();
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

for (const l of journal) console.log(`  ${l}`);
if (echecs.length > 0) {
  console.log('\n  ❌ Échecs — rien écrit pour ces lignes :');
  for (const e of echecs) console.log(`     ${e}`);
}

// Le compte vient de la TRANSACTION, pas des intentions. Un rapport qui compte
// ce qu'il voulait faire au lieu de ce qu'il a fait masque exactement le genre
// de défaut qu'on vient de corriger deux fois (§4 quater ter).
console.log(
  APPLY && bilan
    ? `\n  ${bilan.crees} créé(s) · ${bilan.completes} complété(s) · ${bilan.signaux} signal(aux) posé(s) · ` +
        `${bilan.retires} retiré(s) · ${bilan.inchanges} déjà en place · ${echecs.length} échec(s)` +
        `\n  (compté DANS la transaction, pas déduit de la lecture)`
    : `\n  ${intentions.length} écriture(s) à faire · ${echecs.length} échec(s)`,
);
if (!APPLY) console.log('\n  Simulation : aucune écriture. Relancer avec `-- --apply`.');
console.log('');

await prisma.$disconnect();
process.exit(echecs.length > 0 ? 1 : 0);
