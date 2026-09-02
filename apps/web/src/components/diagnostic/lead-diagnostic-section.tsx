/**
 * Section « Diagnostic du stand » de la fiche lead.
 *
 * Ce qu'elle doit permettre, et qui manquait au test du 01/09 : décrocher son
 * téléphone en ayant SOUS LES YEUX exactement ce que le prospect a reçu. Un
 * appel qui commence par « vous avez dû recevoir un programme » sans savoir
 * lequel ne vaut rien.
 *
 * Elle sert aussi de témoin d'exploitation : une soumission encore « en attente
 * d'envoi » le lendemain de la soirée signifie que plus rien ne traite la file
 * (ni le navigateur du prospect, ni le cron, ni le worker).
 *
 * Composant serveur — pas de `'use client'`. Seul le bouton de relance est
 * client, et il est importé tel quel.
 */

import { AlertTriangle, CheckCircle2, Clock, MailX } from 'lucide-react';
import { PROBLEMATIQUES, type ProblematiqueKey } from '@/lib/diagnostic/questions';
import { lirePersonnalisation } from '@/lib/diagnostic/programme-sur-mesure';
import { RelancerDiagnosticButton } from './relancer-diagnostic-button';

const fmtDateHeure = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
});

const MOMENTS: Record<string, string> = {
  MATIN: 'Matinée (9h - 13h)',
  APRES_MIDI: 'Après-midi (14h - 18h)',
};

export interface SoumissionDiagnostic {
  id: string;
  createdAt: Date;
  dominante: string;
  secondaire: string | null;
  scores: unknown;
  programmeStatus: string;
  programmeSentAt: Date | null;
  lastError: string | null;
  attempts: number;
  personnalisation: unknown;
}

function estProblematique(v: string): v is ProblematiqueKey {
  return Object.prototype.hasOwnProperty.call(PROBLEMATIQUES, v);
}

function titre(cle: string): string {
  return estProblematique(cle) ? PROBLEMATIQUES[cle].titre : cle;
}

/** Scores stockés en `Json` — lecture défensive, jamais de cast aveugle. */
function lireScores(json: unknown): { cle: string; valeur: number }[] {
  if (!json || typeof json !== 'object') return [];
  return Object.entries(json as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === 'number')
    .sort((a, b) => b[1] - a[1])
    .map(([cle, valeur]) => ({ cle, valeur }));
}

function Statut({ sub }: { sub: SoumissionDiagnostic }) {
  if (sub.programmeStatus === 'SENT') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 text-xs font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Programme envoyé
        {sub.programmeSentAt ? ` le ${fmtDateHeure.format(sub.programmeSentAt)}` : ''}
      </span>
    );
  }
  if (sub.programmeStatus === 'PENDING') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-medium">
        <Clock className="h-3.5 w-3.5" />
        En attente d'envoi
        {sub.attempts > 0 ? ` — ${sub.attempts} tentative${sub.attempts > 1 ? 's' : ''}` : ''}
      </span>
    );
  }
  if (sub.programmeStatus === 'SKIPPED') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
        <MailX className="h-3.5 w-3.5" />
        Non envoyé — catégorie d'email décochée dans Paramètres
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 text-red-800 text-xs font-medium">
      <AlertTriangle className="h-3.5 w-3.5" />
      Échec de l'envoi
    </span>
  );
}

export function LeadDiagnosticSection({ soumissions }: { soumissions: SoumissionDiagnostic[] }) {
  if (soumissions.length === 0) return null;

  return (
    <section className="border-t border-border pt-6 space-y-6">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        Diagnostic du stand
      </div>

      {soumissions.map((sub) => {
        const perso = lirePersonnalisation(sub.personnalisation);
        const scores = lireScores(sub.scores);

        return (
          <article key={sub.id} className="rounded-xl border border-border bg-white p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{titre(sub.dominante)}</div>
                <div className="text-xs text-muted-foreground">
                  Rempli le {fmtDateHeure.format(sub.createdAt)}
                  {sub.secondaire ? ` · second axe : ${titre(sub.secondaire)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Statut sub={sub} />
                {sub.programmeStatus === 'FAILED' && (
                  <RelancerDiagnosticButton submissionId={sub.id} />
                )}
              </div>
            </div>

            {sub.lastError && sub.programmeStatus !== 'SENT' && (
              <p className="text-xs text-red-700 bg-red-50 rounded-md px-3 py-2">
                {sub.lastError}
              </p>
            )}

            {scores.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {scores.map((s) => (
                  <span
                    key={s.cle}
                    className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground"
                  >
                    {titre(s.cle)} : <strong className="tabular-nums">{s.valeur}</strong>
                  </span>
                ))}
              </div>
            )}

            {perso.programme ? (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Le programme reçu par le prospect
                  {perso.ancrage !== null
                    ? ` · ancrage ${Math.round(perso.ancrage * 100)} %`
                    : ''}
                </div>
                <p className="text-sm italic text-slate-700">{perso.programme.accroche}</p>
                <ul className="text-sm list-disc pl-5 space-y-0.5">
                  {perso.programme.objectifs.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
                {perso.programme.sequences.map((seq, i) => (
                  <div key={i} className="pl-3 border-l-2 border-primary/30">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {MOMENTS[seq.moment] ?? seq.moment}
                    </div>
                    <div className="text-sm font-medium">{seq.titre}</div>
                    <div className="text-xs italic text-muted-foreground mb-1">
                      {seq.pourquoiVous}
                    </div>
                    <ul className="text-xs list-disc pl-5 space-y-0.5">
                      {seq.points.map((pt, j) => (
                        <li key={j}>{pt.texte}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : perso.repliCatalogue ? (
              <p className="text-xs text-muted-foreground border-t border-border pt-4">
                Programme du catalogue envoyé tel quel — le sur-mesure a été abandonné
                {perso.raison ? ` (${perso.raison})` : ''}. C'est un repli assumé : mieux vaut un
                programme vrai qu'un programme flatteur et inventé.
              </p>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
