/**
 * Handler des envois de programme du diagnostic (croner), patron Phase 20.
 *
 * Pourquoi un worker et pas un envoi dans la server action : assembler un
 * programme sur mesure demande un appel au modèle — 5 à 15 secondes. On ne fait
 * pas attendre ça à quelqu'un debout devant un stand, sur le wifi d'une soirée.
 * Le prospect voit son résultat tout de suite, reçoit son programme quelques
 * minutes plus tard.
 *
 * AUCUN import auth/React ici (leçon Phase 11 : `react does not provide an
 * export named 'cache'` au boot du worker).
 */

import { prisma } from '@qualiof/db';
import { sendMail } from '@/lib/mailer';
import { loadOfConfig } from '@/lib/of-config';
import { renderDiagnosticProgrammeEmail } from '@/lib/mailer-templates/diagnostic-programme';
import { choisirJournee } from './catalogue-map';
import { genererProgrammeSurMesure } from './programme-sur-mesure';
import type { ProblematiqueKey } from './questions';
import { PROBLEMATIQUES } from './questions';

/** Au-delà, on arrête d'insister : la soumission passe en FAILED. */
const MAX_TENTATIVES = 3;
/** Traitées par tick. Un stand génère des rafales, pas un flux continu. */
const LOT = 20;

export interface DiagnosticWorkerResult {
  examinees: number;
  envoyees: number;
  suppressed: number;
  echouees: number;
}

function estProblematique(v: string): v is ProblematiqueKey {
  return Object.prototype.hasOwnProperty.call(PROBLEMATIQUES, v);
}

export async function processDiagnosticSends(opts: {
  triggered_by: string;
}): Promise<DiagnosticWorkerResult> {
  const enAttente = await prisma.diagnosticSubmission.findMany({
    where: { programmeStatus: 'PENDING', attempts: { lt: MAX_TENTATIVES } },
    orderBy: { createdAt: 'asc' },
    take: LOT,
    select: {
      id: true, tenantId: true, attempts: true, reponses: true,
      dominante: true, secondaire: true,
      lead: { select: { firstName: true, email: true } },
    },
  });

  const res: DiagnosticWorkerResult = {
    examinees: enAttente.length, envoyees: 0, suppressed: 0, echouees: 0,
  };

  for (const sub of enAttente) {
    // Verrou optimiste : deux instances du worker ne traitent pas la même
    // soumission. Celle qui perd la course voit count === 0 et passe.
    const claim = await prisma.diagnosticSubmission.updateMany({
      where: { id: sub.id, programmeStatus: 'PENDING', attempts: sub.attempts },
      data: { attempts: sub.attempts + 1 },
    });
    if (claim.count !== 1) continue;

    try {
      const echec = async (msg: string) => {
        const definitif = sub.attempts + 1 >= MAX_TENTATIVES;
        await prisma.diagnosticSubmission.update({
          where: { id: sub.id },
          data: { lastError: msg, programmeStatus: definitif ? 'FAILED' : 'PENDING' },
        });
        res.echouees += 1;
        console.error(`[diagnostic-worker] ${sub.id} : ${msg}${definitif ? ' (abandon)' : ''}`);
      };

      if (!sub.lead?.email || !sub.lead.firstName) {
        await echec('lead sans email ou sans prénom');
        continue;
      }
      if (!estProblematique(sub.dominante)) {
        await echec(`problématique inconnue : ${sub.dominante}`);
        continue;
      }

      const reponses = (sub.reponses ?? {}) as Record<string, string>;
      const selection = choisirJournee(sub.dominante, reponses);
      if (!selection) {
        await echec('aucune journée candidate');
        continue;
      }

      const produit = await prisma.trainingProduct.findFirst({
        where: { tenantId: sub.tenantId, code: selection.code, isActive: true },
        select: { title: true, durationHours: true, objectives: true, programMd: true },
      });
      if (!produit) {
        await echec(`produit ${selection.code} introuvable ou inactif`);
        continue;
      }

      const objectifs = Array.isArray(produit.objectives)
        ? (produit.objectives as unknown[]).filter((o): o is string => typeof o === 'string')
        : [];

      // Le sur-mesure est un BONUS : s'il échoue, on envoie le programme du
      // catalogue tel quel plutôt que rien du tout.
      const sm = await genererProgrammeSurMesure({
        reponses,
        dominante: sub.dominante,
        produitTitre: produit.title,
        produitObjectifs: objectifs,
        produitProgrammeMd: produit.programMd,
      });
      if (!sm.ok) {
        console.warn(`[diagnostic-worker] ${sub.id} sur-mesure abandonné (${sm.raison}: ${sm.detail ?? ''}) → programme catalogue`);
      }

      const of = await loadOfConfig(sub.tenantId);
      const { subject, html, text } = renderDiagnosticProgrammeEmail(
        {
          firstName: sub.lead.firstName,
          dominante: sub.dominante,
          secondaire: sub.secondaire && estProblematique(sub.secondaire) ? sub.secondaire : null,
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
        res.suppressed += 1;
        continue;
      }
      if (!envoi.ok) {
        await echec(`envoi échoué : ${envoi.error ?? '?'}`);
        continue;
      }

      await prisma.diagnosticSubmission.update({
        where: { id: sub.id },
        data: {
          programmeStatus: 'SENT',
          programmeSentAt: new Date(),
          lastError: null,
          personnalisation: sm.ok
            ? { ancrage: sm.ancrage, programme: sm.programme }
            : { ancrage: 0, repliCatalogue: true, raison: sm.raison },
        },
      });
      res.envoyees += 1;
    } catch (e) {
      res.echouees += 1;
      console.error(`[diagnostic-worker] ${sub.id} exception`, e);
      await prisma.diagnosticSubmission.update({
        where: { id: sub.id },
        data: {
          lastError: e instanceof Error ? e.message : String(e),
          programmeStatus: sub.attempts + 1 >= MAX_TENTATIVES ? 'FAILED' : 'PENDING',
        },
      });
    }
  }

  console.log(
    `[diagnostic-worker] tick triggered_by=${opts.triggered_by} examinées=${res.examinees} envoyées=${res.envoyees} suppressed=${res.suppressed} échouées=${res.echouees}`,
  );
  return res;
}
