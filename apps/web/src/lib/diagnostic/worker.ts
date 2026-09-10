/**
 * Envoi du programme du diagnostic — cœur partagé par TROIS déclencheurs.
 *
 * Pourquoi un traitement différé et pas un envoi dans la server action :
 * assembler un programme sur mesure demande un appel au modèle — 28 secondes
 * mesurées. On ne fait pas attendre ça à quelqu'un debout devant un stand, sur
 * le wifi d'une soirée. Le prospect voit son résultat tout de suite.
 *
 * Les trois déclencheurs, du plus fiable au moins fiable :
 *  1. `processDiagnosticSubmission(id)` — appelé par le NAVIGATEUR du prospect
 *     depuis l'écran de remerciement (`POST /api/diagnostic/traiter`). C'est le
 *     mécanisme PRINCIPAL : il ne dépend d'aucune configuration d'infra, et le
 *     téléphone du prospect déclenche son propre email ;
 *  2. `processDiagnosticSends()` — lot de rattrapage, appelé par le cron Vercel
 *     et par le worker pm2 Railway. C'est un FILET, pas le mécanisme ;
 *  3. le même lot, déclenché à la main depuis le CRM (bouton « Envoyer les
 *     programmes en attente ») quand Laurent voit des soumissions en retard.
 *
 * Les trois passent par le même verrou optimiste : deux déclencheurs simultanés
 * sur la même soumission n'envoient jamais deux emails.
 *
 * AUCUN import auth/React ici (leçon Phase 11 : `react does not provide an
 * export named 'cache'` au boot du worker).
 */

import { prisma } from '@qualiof/db';
import { sendMail } from '@/lib/mailer';
import { loadOfConfig } from '@/lib/of-config';
import { renderDiagnosticProgrammeEmail } from '@/lib/mailer-templates/diagnostic-programme';
import { choisirJournee } from './catalogue-map';
import { MAX_TENTATIVES } from './file-attente';
import { genererProgrammeSurMesure } from './programme-sur-mesure';
import type { ProblematiqueKey } from './questions';
import { PROBLEMATIQUES, lireRole, lireEquipe } from './questions';

/** Traitées par tick. Un stand génère des rafales, pas un flux continu. */
const LOT = 20;

/** Ce que le traitement d'UNE soumission peut donner. */
export type IssueSoumission =
  /** Email parti. */
  | 'ENVOYEE'
  /** Catégorie d'email décochée dans Paramètres — pas une erreur. */
  | 'SUPPRIMEE'
  /** Échec de ce tour ; repassera (ou FAILED si le plafond est atteint). */
  | 'ECHOUEE'
  /** Un autre déclencheur l'a prise en charge à la même seconde. */
  | 'DEJA_PRISE';

export interface DiagnosticWorkerResult {
  examinees: number;
  envoyees: number;
  suppressed: number;
  echouees: number;
}

/** Champs strictement nécessaires au traitement — une seule définition. */
const SELECTION = {
  id: true,
  tenantId: true,
  attempts: true,
  reponses: true,
  dominante: true,
  secondaire: true,
  lead: { select: { firstName: true, email: true } },
} as const;

type SoumissionATraiter = {
  id: string;
  tenantId: string;
  attempts: number;
  reponses: unknown;
  dominante: string;
  secondaire: string | null;
  lead: { firstName: string | null; email: string | null } | null;
};

function estProblematique(v: string): v is ProblematiqueKey {
  return Object.prototype.hasOwnProperty.call(PROBLEMATIQUES, v);
}

/**
 * Traite UNE soumission déjà chargée. Prend le verrou, envoie, écrit l'issue.
 *
 * Ne lève jamais : toute exception est convertie en `ECHOUEE` et tracée dans
 * `lastError`. Un déclencheur (navigateur du prospect, cron, bouton CRM) ne doit
 * pas retourner une 500 parce qu'un modèle a hoqueté.
 */
async function traiterSoumission(sub: SoumissionATraiter): Promise<IssueSoumission> {
  // Verrou optimiste : deux déclencheurs ne traitent pas la même soumission.
  // Celui qui perd la course voit count === 0 et passe.
  const claim = await prisma.diagnosticSubmission.updateMany({
    where: { id: sub.id, programmeStatus: 'PENDING', attempts: sub.attempts },
    data: { attempts: sub.attempts + 1 },
  });
  if (claim.count !== 1) return 'DEJA_PRISE';

  const echec = async (msg: string): Promise<IssueSoumission> => {
    const definitif = sub.attempts + 1 >= MAX_TENTATIVES;
    await prisma.diagnosticSubmission.update({
      where: { id: sub.id },
      data: { lastError: msg, programmeStatus: definitif ? 'FAILED' : 'PENDING' },
    });
    console.error(`[diagnostic-worker] ${sub.id} : ${msg}${definitif ? ' (abandon)' : ''}`);
    return 'ECHOUEE';
  };

  try {
    if (!sub.lead?.email || !sub.lead.firstName) {
      return await echec('lead sans email ou sans prénom');
    }
    if (!estProblematique(sub.dominante)) {
      return await echec(`problématique inconnue : ${sub.dominante}`);
    }

    const reponses = (sub.reponses ?? {}) as Record<string, string>;
    const selection = choisirJournee(sub.dominante, reponses);
    if (!selection) {
      return await echec('aucune journée candidate');
    }

    // `codes` est ordonné : la journée Faros de l'axe, puis ses replis. On prend
    // la première qui EXISTE et qui est active. Un produit désactivé un soir de
    // salon ne doit pas priver le prospect de son programme — c'est justement le
    // moment où personne ne surveille les logs.
    const produits = await prisma.trainingProduct.findMany({
      where: { tenantId: sub.tenantId, code: { in: selection.codes }, isActive: true },
      select: { code: true, title: true, durationHours: true, objectives: true, programMd: true },
    });
    const produit = selection.codes
      .map((code) => produits.find((p) => p.code === code))
      .find((p) => p !== undefined);
    if (!produit) {
      return await echec(`aucun produit actif parmi ${selection.codes.join(', ')}`);
    }
    if (produit.code !== selection.codes[0]) {
      console.warn(
        `[diagnostic-worker] ${sub.id} : ${selection.codes[0]} indisponible, repli sur ${produit.code}`,
      );
    }

    const objectifs = Array.isArray(produit.objectives)
      ? (produit.objectives as unknown[]).filter((o): o is string => typeof o === 'string')
      : [];

    // Le sur-mesure est un BONUS : s'il échoue, on envoie le programme du
    // catalogue tel quel plutôt que rien du tout.
    const sm = await genererProgrammeSurMesure({
      reponses,
      dominante: sub.dominante,
      // Ne départage plus les produits : sert au modèle à ORDONNER la journée
      // (le socle en tête pour un débutant, les agents pour un habitué).
      niveau: selection.niveau,
      produitTitre: produit.title,
      produitObjectifs: objectifs,
      produitProgrammeMd: produit.programMd,
    });
    if (!sm.ok) {
      console.warn(
        `[diagnostic-worker] ${sub.id} sur-mesure abandonné (${sm.raison}: ${sm.detail ?? ''}) → programme catalogue`,
      );
    }

    const of = await loadOfConfig(sub.tenantId);
    const { subject, html, text } = renderDiagnosticProgrammeEmail(
      {
        firstName: sub.lead.firstName,
        dominante: sub.dominante,
        secondaire: sub.secondaire && estProblematique(sub.secondaire) ? sub.secondaire : null,
        // Le bloc financement dépend du STATUT, pas de la formation : annoncer
        // des droits AGEFICE à un conseiller salarié est faux, et ça se retourne
        // au premier appel. Les gardes rendent `null` sur une valeur inconnue,
        // et le gabarit retombe alors sur le bloc individuel.
        role: lireRole(reponses.role),
        equipe: lireEquipe(reponses.equipe),
        produit: {
          title: produit.title,
          dureeHeures: produit.durationHours,
          objectifs,
          programmeMd: produit.programMd,
        },
        surMesure: sm.ok ? sm.programme : null,
      },
      of,
    );

    const envoi = await sendMail({
      to: sub.lead.email,
      subject,
      html,
      text,
      context: { tenantId: sub.tenantId, category: 'diagnostic_program' },
    });

    if (envoi.suppressed) {
      // La catégorie n'est pas cochée dans Paramètres. Ce n'est PAS une
      // erreur : distinguer les deux évite de chercher une panne inexistante.
      await prisma.diagnosticSubmission.update({
        where: { id: sub.id },
        data: { programmeStatus: 'SKIPPED', lastError: 'catégorie email décochée' },
      });
      return 'SUPPRIMEE';
    }
    if (envoi.dryRun) {
      // Couche env du mailer (MAIL_DRY_RUN=true ou SMTP_HOST vide) : rien n'a
      // quitté le serveur. Constaté le 02/09/2026 : ce cas passait pour un
      // succès et la soumission était marquée SENT alors que le prospect
      // n'avait rien reçu. Un dry-run n'est JAMAIS un envoi.
      await prisma.diagnosticSubmission.update({
        where: { id: sub.id },
        data: { programmeStatus: 'SKIPPED', lastError: 'dry-run : MAIL_DRY_RUN=true ou SMTP_HOST vide' },
      });
      return 'SUPPRIMEE';
    }
    if (!envoi.ok) {
      return await echec(`envoi échoué : ${envoi.error ?? '?'}`);
    }

    await prisma.diagnosticSubmission.update({
      where: { id: sub.id },
      data: {
        programmeStatus: 'SENT',
        programmeSentAt: new Date(),
        lastError: null,
        personnalisation: {
          ...(sm.ok
            ? { ancrage: sm.ancrage, programme: sm.programme }
            : { ancrage: 0, repliCatalogue: true, raison: sm.raison }),
          // Preuve d'envoi : l'identifiant retourné par le serveur SMTP. Sans
          // lui, SENT ne prouve qu'un retour ok du mailer.
          envoi: { messageId: envoi.messageId ?? null },
        },
      },
    });
    return 'ENVOYEE';
  } catch (e) {
    console.error(`[diagnostic-worker] ${sub.id} exception`, e);
    await prisma.diagnosticSubmission.update({
      where: { id: sub.id },
      data: {
        lastError: e instanceof Error ? e.message : String(e),
        programmeStatus: sub.attempts + 1 >= MAX_TENTATIVES ? 'FAILED' : 'PENDING',
      },
    });
    return 'ECHOUEE';
  }
}

/** Ce que le déclenchement navigateur renvoie à l'écran de remerciement. */
export type TraitementUnitaire =
  | { ok: true; statut: 'ENVOYEE' | 'SUPPRIMEE' | 'DEJA_TRAITE' | 'DEJA_PRISE' }
  | { ok: false; statut: 'INTROUVABLE' | 'ECHOUEE' };

/**
 * Traite UNE soumission désignée par son id, et rien d'autre.
 *
 * IDEMPOTENT par construction : une soumission qui n'est plus `PENDING` (déjà
 * `SENT`, `SKIPPED` ou abandonnée en `FAILED`) est reconnue et laissée telle
 * quelle. Le prospect peut rafraîchir, revenir en arrière, ou le navigateur
 * rejouer la requête : il ne reçoit jamais deux fois le même programme.
 */
export async function processDiagnosticSubmission(id: string): Promise<TraitementUnitaire> {
  const sub = await prisma.diagnosticSubmission.findUnique({
    where: { id },
    select: { ...SELECTION, programmeStatus: true },
  });
  if (!sub) return { ok: false, statut: 'INTROUVABLE' };

  if (sub.programmeStatus !== 'PENDING') {
    return { ok: true, statut: 'DEJA_TRAITE' };
  }
  if (sub.attempts >= MAX_TENTATIVES) {
    // Plafond atteint sans être passé en FAILED (course entre déclencheurs) :
    // on n'insiste pas, le lot de rattrapage tranchera.
    return { ok: true, statut: 'DEJA_PRISE' };
  }

  const issue = await traiterSoumission(sub);
  console.log(`[diagnostic-worker] unitaire id=${sub.id} issue=${issue}`);

  if (issue === 'ECHOUEE') return { ok: false, statut: 'ECHOUEE' };
  return { ok: true, statut: issue };
}

/**
 * Lot de rattrapage : toutes les soumissions encore en attente.
 *
 * FILET, pas mécanisme principal — il ramasse ce que le navigateur du prospect
 * n'a pas réussi à déclencher (onglet fermé trop vite, 4G coupée, mode avion).
 */
export async function processDiagnosticSends(opts: {
  triggered_by: string;
}): Promise<DiagnosticWorkerResult> {
  const enAttente = await prisma.diagnosticSubmission.findMany({
    where: { programmeStatus: 'PENDING', attempts: { lt: MAX_TENTATIVES } },
    orderBy: { createdAt: 'asc' },
    take: LOT,
    select: SELECTION,
  });

  const res: DiagnosticWorkerResult = {
    examinees: enAttente.length, envoyees: 0, suppressed: 0, echouees: 0,
  };

  for (const sub of enAttente) {
    const issue = await traiterSoumission(sub);
    if (issue === 'ENVOYEE') res.envoyees += 1;
    else if (issue === 'SUPPRIMEE') res.suppressed += 1;
    else if (issue === 'ECHOUEE') res.echouees += 1;
  }

  console.log(
    `[diagnostic-worker] tick triggered_by=${opts.triggered_by} examinées=${res.examinees} envoyées=${res.envoyees} suppressed=${res.suppressed} échouées=${res.echouees}`,
  );
  return res;
}
