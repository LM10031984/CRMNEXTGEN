'use client';

/**
 * Quick task 260525-kl5 — bloc agrégé "Préparation pédagogique".
 *
 * Affiche l'état des 6 catégories de docs pré-formation pour la session :
 *  - Col 1 (partagés) : Programme / Déroulé / Checklist
 *  - Col 2 (par stagiaire) : Convention / Convocation / Analyse besoin
 *
 * 3 états globaux :
 *  - vide      → CTA primaire "Lancer la préparation"
 *  - partiel   → CTA secondaire "Compléter (X manquants)"
 *  - complet   → badge vert + lien discret vers les participants
 *
 * Auto-refresh toutes les 5s tant que des jobs analyse besoin sont
 * PROCESSING ou QUEUED (même pattern que batch-progress-auto-refresh.tsx,
 * mais on update le state local sans router.refresh pour ne pas rerender
 * toute la page).
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  getSessionPreparationStatus,
  prepareSession,
  type SessionPreparationStatus,
} from '@/server/actions/prepare-training';
import { dispatchGenerateDoc } from '@/server/actions/dispatch-generate-doc';
import { docCompletion } from '@/lib/sessions/doc-completion';
import { buildPrepCompletionItems } from '@/lib/sessions/build-prep-completion-items';
import { TimelineStep, StepDocRow, type StepState } from './timeline-step';
// 09.3-03-fix CORRECTION 1 — SOURCE UNIQUE indicateurs : lecture du catalogue
// (constante pure, OK en Client Component). Plus aucun littéral « Ind 27 ».
import { DOC_INDICATORS } from '@/lib/doc-scope';

/** « Indicateur 9 » → « Ind 9 » ; « Légal … » → « Légal » ; null → ''. */
function indicShort(docType: string): string {
  const raw = DOC_INDICATORS[docType] ?? null;
  if (!raw) return '';
  const m = raw.match(/^Indicateur\s+(\d+)$/);
  if (m) return `Ind ${m[1]}`;
  if (raw.startsWith('Légal')) return 'Légal';
  return raw;
}

interface Props {
  sessionId: string;
  initialStatus: SessionPreparationStatus;
  canWrite: boolean;
  /** Visuel : si cette étape est l'action attendue (statut DRAFT/PLANNED) */
  isActive?: boolean;
  /** Expansion initiale (dérivée de stagesState[2] === 'active'). */
  expanded?: boolean;
  /**
   * A8 — hrefs PDF des 3 docs partagés (étape 2 cliquable). Les rows
   * agrégés par stagiaire (Convention/Convocation/Analyse besoin/AGEFICE)
   * restent non-cliquables : un href unique sur un row de N stagiaires
   * serait trompeur, le DocDockDrawer reste le hub per-stagiaire.
   */
  programmePdfHref?: string;
  deroulePdfHref?: string;
  checklistPdfHref?: string;
}

export function PreparationPedagogiqueBlock({
  sessionId,
  initialStatus,
  canWrite,
  isActive = false,
  expanded,
  programmePdfHref,
  deroulePdfHref,
  checklistPdfHref,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionPreparationStatus>(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh tant qu'il reste des jobs analyse besoin in-flight.
  const analyseBesoinInflight = status.analyseBesoinInProgress + status.analyseBesoinPending;
  useEffect(() => {
    if (analyseBesoinInflight <= 0) return;
    const id = setInterval(async () => {
      const fresh = await getSessionPreparationStatus(sessionId);
      if (!fresh.ok) return;
      // Conditionne router.refresh() au CHANGEMENT réel — sinon on
      // refetch tout l'arbre RSC toutes les 5s pour rien (risque flicker).
      // Feedback Laurent ui-e1 2026-06-06.
      setStatus((prev) => {
        const changed =
          prev.analyseBesoinDone !== fresh.analyseBesoinDone ||
          prev.analyseBesoinInProgress !== fresh.analyseBesoinInProgress ||
          prev.analyseBesoinPending !== fresh.analyseBesoinPending;
        if (changed) router.refresh();
        return fresh;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [analyseBesoinInflight, sessionId, router]);

  /**
   * Refaire un document PARTAGÉ déjà produit.
   *
   * « Compléter » ne traite que ce qui MANQUE : un document existant mais
   * devenu faux — le cas typique étant un tarif de session revu après coup —
   * n'avait aucun moyen d'être refait depuis cet écran (constat Laurent 02/09 :
   * « j'ai pas de bouton pour regénérer le programme »).
   *
   * On passe par le MÊME dispatch que l'onglet « Avant » : une seule porte
   * d'entrée pour la génération, deux endroits où l'ouvrir.
   */
  function handleRegenerer(docType: 'PROGRAMME' | 'DEROULE' | 'CHECKLIST', label: string) {
    setError(null);
    startTransition(async () => {
      const r = await dispatchGenerateDoc({ sessionId, docType, force: true });
      if (!r.ok) {
        setError(r.error ?? `Erreur ${label}`);
        toast.error(r.error ?? `Erreur ${label}`);
        return;
      }
      toast.success(`${label} régénéré`);
      const fresh = await getSessionPreparationStatus(sessionId);
      if (fresh.ok) setStatus(fresh);
      router.refresh();
    });
  }

  function BoutonRegenerer({
    docType,
    label,
  }: {
    docType: 'PROGRAMME' | 'DEROULE' | 'CHECKLIST';
    label: string;
  }) {
    return (
      <button
        type="button"
        onClick={() => handleRegenerer(docType, label)}
        disabled={pending}
        aria-label={`Régénérer ${label}`}
        title="Refaire ce document (tarif ou contenu modifié)"
        className="shrink-0 h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 transition-colors"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Régénérer
      </button>
    );
  }

  function handleCompleter() {
    setError(null);
    startTransition(async () => {
      const r = await prepareSession(sessionId);
      if (!r.ok) {
        setError(r.error ?? 'Erreur lors de la préparation');
        toast.error(r.error ?? 'Erreur lors de la préparation');
        return;
      }
      // Re-lire l'état immédiatement après l'action pour rafraîchir l'UI
      // (les generators sync auront mis à jour les Document/PedagogicalAsset).
      const fresh = await getSessionPreparationStatus(sessionId);
      if (fresh.ok) setStatus(fresh);
      // Refresh RSC : sans ça, le drawer + le badge X/Y dérivé de
      // docDockItems restent figés sur le snapshot SSR initial.
      router.refresh();
      const errorCount = r.errors.length;
      if (errorCount === 0) {
        const ageficeMsg = r.ageficeEligible > 0
          ? ` · ${r.ageficeGenerated}/${r.ageficeEligible} demande(s) AGEFICE`
          : '';
        toast.success(
          `Préparation OK : ${r.programmesGenerated} programme · ${r.derouleGenerated ? 'déroulé' : 'pas de déroulé'} · ${r.checklistGenerated ? 'checklist' : 'pas de checklist'} · ${r.conventionsGenerated}/${r.total} convention(s) · ${r.convocationsGenerated}/${r.total} convocation(s) · ${r.analyseBesoinEnqueued} analyse(s) besoin en cours${ageficeMsg}`,
        );
      } else {
        toast.warning(
          `Partiel : ${errorCount} erreur${errorCount > 1 ? 's' : ''}. Voir console serveur.`,
        );
      }
    });
  }

  const N = status.participantsCount;
  const analyseBesoinEntrepriseTotal =
    status.analyseBesoinEntreprisePresente + status.analyseBesoinEntrepriseAttendue;

  // Source UNIQUE — items dérivés du status local, comptés par `docCompletion`.
  // Garde-fou Laurent 2026-06-05 : "compteur step = état drawer = matrice".
  const completion = useMemo(
    () => docCompletion(buildPrepCompletionItems(status)),
    [status],
  );
  const totalDone = completion.ready;
  const totalExpected = completion.total;
  const missingCount = completion.missing;
  const complete = totalExpected > 0 && missingCount === 0;
  const empty = totalDone === 0 && completion.pending === 0;

  const stepState: StepState = complete
    ? 'done'
    : pending || analyseBesoinInflight > 0
      ? 'active'
      : isActive
        ? 'active'
        : totalDone > 0
          ? 'active'
          : 'todo';

  const badge = complete ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
      Préparation complète · {totalDone}/{totalExpected}
    </span>
  ) : analyseBesoinInflight > 0 ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-medium">
      <Loader2 className="h-3 w-3 animate-spin" /> IA en cours · {analyseBesoinInflight} analyse{analyseBesoinInflight > 1 ? 's' : ''}
    </span>
  ) : totalDone > 0 ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
      {totalDone}/{totalExpected} · {missingCount} manquant{missingCount > 1 ? 's' : ''}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-medium">
      Non démarrée
    </span>
  );

  const action = !canWrite ? (
    <span className="text-xs text-muted-foreground">Lecture seule</span>
  ) : complete ? null : empty ? (
    <button
      type="button"
      onClick={handleCompleter}
      disabled={pending || N === 0}
      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      title={N === 0 ? 'Aucun apprenant inscrit' : 'Génère les 7 catégories de docs pré-formation en parallèle'}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
      Lancer la préparation
    </button>
  ) : (
    <button
      type="button"
      onClick={handleCompleter}
      disabled={pending}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors disabled:opacity-60"
      title="Régénère uniquement les docs manquants (idempotent)"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
      Compléter ({missingCount})
    </button>
  );

  return (
    <TimelineStep
      number={2}
      title="Préparation pédagogique"
      state={stepState}
      expanded={expanded}
      caption="Programme · Déroulé · Check-list · Convention · Convocation · Analyse besoin · AGEFICE"
      // CORRECTION 3 (V9 Laurent) — caption d'étape CURATÉE EN DUR (prop string,
      // non dérivée par indicateur primaire). Attendu Préparation = 1·4·5·6·9·17.
      //  - « 8 » (positionnement) RETIRÉ : le positionnement = début de formation,
      //    déjà compté dans la caption Pack (étape 4). Le « 8 » fantôme venait d'une
      //    recopie manuelle erronée des indicateurs primaires des docs de l'étape.
      //  - « 5 » AJOUTÉ : programme + déroulé prouvent AUSSI l'ind. 5 (« objectifs
      //    opérationnels et évaluables » — NC majeure Kaïna). NOTE : aucun doc n'a
      //    l'ind. 5 comme indicateur PRIMAIRE dans le catalogue (programme=1,
      //    déroulé=6), donc une dérivation par indicateur primaire ne produirait
      //    JAMAIS 5 → on cure la caption à la main, adossée au sens métier. Limite
      //    connue : multi-indicateur par doc (5 en secondaire) = chantier futur.
      // Mapping de référence : PROGRAMME→1(+5), ANALYSE_BESOIN→4, DEROULE→6(+5),
      // CONVENTION/CONVOCATION→9, CHECKLIST→17.
      qualiopi="Ind 1 · 4 · 5 · 6 · 9 · 17"
      badge={badge}
      action={action}
    >
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 mb-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Partagés (produit / session)
          </h3>
          <ul className="space-y-1.5">
            <StepDocRow
              done={status.programme}
              label="Programme de formation"
              indic={indicShort('PROGRAMME')}
              pdfHref={programmePdfHref}
              action={
                status.programme ? (
                  <BoutonRegenerer docType="PROGRAMME" label="Programme de formation" />
                ) : undefined
              }
            />
            <StepDocRow
              done={status.deroule}
              label="Déroulé pédagogique (IA)"
              indic={indicShort('DEROULE')}
              pdfHref={deroulePdfHref}
              action={
                status.deroule ? (
                  <BoutonRegenerer docType="DEROULE" label="Déroulé pédagogique" />
                ) : undefined
              }
            />
            <StepDocRow
              done={status.checklist}
              label="Check-list formation"
              indic={indicShort('CHECKLIST_FORMATION')}
              pdfHref={checklistPdfHref}
              action={
                status.checklist ? (
                  <BoutonRegenerer docType="CHECKLIST" label="Check-list formation" />
                ) : undefined
              }
            />
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Par stagiaire ({N})
          </h3>
          <ul className="space-y-1.5">
            <StepDocRow
              count={status.conventionsCount}
              total={N}
              label="Convention (1/payeur)"
              indic={indicShort('CONVENTION')}
            />
            <StepDocRow
              count={status.convocationsCount}
              total={N}
              label="Convocation"
              indic={indicShort('CONVOCATION')}
            />
            {status.analyseBesoinAttendue > 0 && (
              <StepDocRow
                count={status.analyseBesoinDone}
                total={status.analyseBesoinAttendue}
                label="Analyse besoin (IA)"
                indic={indicShort('ANALYSE_BESOIN')}
                pending={analyseBesoinInflight > 0}
              />
            )}
            {/* Règle du 12/08 : payeur personne morale ⇒ l'analyse des besoins
                est celle de l'ENTREPRISE, jamais du salarié. Ligne distincte,
                jamais fondue dans le ratio par stagiaire. */}
            {analyseBesoinEntrepriseTotal > 0 && (
              <StepDocRow
                count={status.analyseBesoinEntreprisePresente}
                total={analyseBesoinEntrepriseTotal}
                label="Analyse besoin entreprise"
                indic={indicShort('ANALYSE_BESOIN')}
              />
            )}
            {status.ageficeEligibleCount > 0 && (
              <StepDocRow
                count={status.ageficeCount}
                total={status.ageficeEligibleCount}
                label="Demande prise en charge AGEFICE"
                indic={indicShort('AGEFICE')}
              />
            )}
          </ul>
          {status.analyseBesoinEntrepriseAttendue > 0 && (
            <p className="text-[11px] text-amber-700 mt-1.5 italic">
              Analyse besoin entreprise à produire hors application : le bouton
              « Compléter » ne la génère pas encore.
            </p>
          )}
          {status.ageficeEligibleCount > 0 && status.ageficeEligibleCount < N && (
            <p className="text-[11px] text-muted-foreground mt-1.5 italic">
              AGEFICE : {status.ageficeEligibleCount} TNS éligibles sur {N}.
            </p>
          )}
        </div>
      </div>

      {analyseBesoinInflight > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Analyse besoin générée par Ollama en arrière-plan · rafraîchissement auto 5s.
        </p>
      )}
    </TimelineStep>
  );
}
