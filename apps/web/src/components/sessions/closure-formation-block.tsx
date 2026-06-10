import Link from 'next/link';
import type { Route } from 'next';
import { ExternalLink, Loader2, Package } from 'lucide-react';
import { TimelineStep, StepDocRow, type StepState } from './timeline-step';
import type { SessionClosureStatus } from '@/server/actions/closure-status';
import { docCompletion } from '@/lib/sessions/doc-completion';
import { buildClosureCompletionItems } from '@/lib/sessions/build-closure-completion-items';
// 09.3-03-fix CORRECTION 1 — SOURCE UNIQUE indicateurs : lecture du catalogue,
// plus aucun littéral « Ind 27 » en dur. `indicLabel` rend la forme courte
// affichée (« Ind 11 » dérivé de « Indicateur 11 »), null = pas de badge.
import { DOC_INDICATORS } from '@/lib/doc-scope';

/** « Indicateur 11 » → « Ind 11 » ; « Légal Art. L6353-1 » → « Légal » ; null → ''. */
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
  status: SessionClosureStatus;
  /** Activation visuelle : si le pack est l'action attendue (session COMPLETED) */
  isActive?: boolean;
  /** Programme produit = doc Support pédagogique (10e doc du process). */
  programmeProductDocId?: string | null;
  /** Expansion initiale (dérivée de stagesState[4] === 'active'). */
  expanded?: boolean;
}

/**
 * Étape 4 du process Qualiopi : Pack fin de formation (10 docs).
 *
 * Symétrique à <PreparationPedagogiqueBlock>. Affiche la vue synthétique
 * « où en est la production » sans obliger à scanner la matrice par
 * participant. CTA primaire = bouton <GenerateClosurePackButton> en barre
 * d'actions de la fiche (pas de doublon ici).
 */
export function ClosureFormationBlock({
  sessionId,
  status,
  isActive = false,
  programmeProductDocId,
  expanded,
}: Props) {
  const N = status.participantsCount;

  const sharedItems: { done: boolean; label: string; indic: string }[] = [
    { done: status.grilleObsSession, label: "Grille d'observation session", indic: indicShort('GRILLE_OBS_SESSION') },
    { done: status.bilanSatisfaction, label: 'Bilan satisfaction session', indic: indicShort('SATISFACTION_SESSION') },
    { done: Boolean(programmeProductDocId), label: 'Support pédagogique (programme final)', indic: indicShort('SUPPORT_PEDAGOGIQUE') },
  ];

  const perParticipantItems: {
    count: number;
    total: number;
    label: string;
    indic: string;
    funder?: string;
    hide?: boolean;
  }[] = [
    { count: status.attestations, total: N, label: 'Attestation de fin de formation', indic: indicShort('ATTESTATION_FIN') },
    { count: status.certificats, total: N, label: 'Certificat de réalisation', indic: indicShort('CERTIFICAT_REALISATION') },
    { count: status.qcm, total: N, label: 'QCM final', indic: indicShort('EVALUATION_ACQUIS') },
    { count: status.positionnements, total: N, label: 'Évaluation acquis (positionnement)', indic: indicShort('POSITIONNEMENT') },
    { count: status.satisfactionChaud, total: N, label: 'Satisfaction à chaud', indic: indicShort('SATISFACTION_CHAUD') },
    { count: status.satisfactionFroid, total: N, label: 'Satisfaction à froid', indic: indicShort('SATISFACTION_FROID') },
    {
      count: status.assiduites,
      total: status.ageficeEligibleCount,
      label: 'Attestation d\'assiduité AGEFICE',
      // CORRECTION 1 (V9) — pièce financeur, AUCUN indicateur Qualiopi
      // (la preuve ind. 12 est l'émargement). Badge financeur « AGEFICE ».
      indic: '',
      funder: 'AGEFICE',
      hide: status.ageficeEligibleCount === 0,
    },
  ];

  const visiblePer = perParticipantItems.filter((p) => !p.hide);

  // Source UNIQUE — items "closure" comptés par `docCompletion`, même fonction
  // que <DocDockDrawer> et <PreparationPedagogiqueBlock>. Garde-fou Laurent
  // 2026-06-05 : "compteur step = état drawer = matrice".
  const completion = docCompletion(
    buildClosureCompletionItems({
      participantsCount: N,
      ageficeEligibleCount: status.ageficeEligibleCount,
      programmeProductDocId,
      grilleObsSession: status.grilleObsSession,
      bilanSatisfaction: status.bilanSatisfaction,
      attestations: status.attestations,
      certificats: status.certificats,
      qcm: status.qcm,
      positionnements: status.positionnements,
      satisfactionChaud: status.satisfactionChaud,
      satisfactionFroid: status.satisfactionFroid,
      assiduites: status.assiduites,
    }),
  );
  const totalDone = completion.ready;
  const totalExpected = completion.total;
  const missing = completion.missing;
  const complete = totalExpected > 0 && missing === 0;
  const inProgress =
    status.latestBatchStatus === 'PROCESSING' || status.latestBatchStatus === 'QUEUED';

  const state: StepState = complete
    ? 'done'
    : inProgress || isActive
      ? 'active'
      : totalDone > 0
        ? 'active'
        : 'todo';

  const badge = inProgress ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-medium">
      <Loader2 className="h-3 w-3 animate-spin" /> Pack en cours
    </span>
  ) : complete ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
      Pack complet · {totalDone}/{totalExpected}
    </span>
  ) : totalDone > 0 ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
      {totalDone}/{totalExpected} · {missing} manquant{missing > 1 ? 's' : ''}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-medium">
      Non démarré
    </span>
  );

  const action = status.latestBatchId ? (
    <Link
      href={`/app/sessions/${sessionId}/closure/${status.latestBatchId}` as Route}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-border bg-white text-sm font-medium hover:bg-muted/40 transition-colors"
    >
      <Package className="h-4 w-4" /> Voir le pack
      <ExternalLink className="h-3 w-3" />
    </Link>
  ) : null;

  return (
    <TimelineStep
      number={4}
      title="Pack fin de formation"
      state={state}
      expanded={expanded}
      caption="10 documents Qualiopi générés en 1 clic"
      // CORRECTION V9 — caption Pack = 8·11·12·30 (validée Laurent, inchangée).
      // Indicateurs réels des docs de l'étape 4 : POSITIONNEMENT→8,
      // CERTIFICAT/QCM/GRILLE_OBS→11, ÉMARGEMENT→12 (preuve d'assiduité ; la pièce
      // « assiduité AGEFICE » elle-même est un dérivé financeur SANS indicateur),
      // SATISFACTION→30.
      qualiopi="Ind 8 · 11 · 12 · 30"
      badge={badge}
      action={action}
    >
      {N === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Aucun apprenant inscrit — ajoute des participants pour suivre la production des
          documents de fin.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Partagés (session)
            </h3>
            <ul className="space-y-1.5">
              {sharedItems.map((it) => (
                <StepDocRow
                  key={it.label}
                  done={it.done}
                  label={it.label}
                  indic={it.indic}
                />
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Par stagiaire ({N})
            </h3>
            <ul className="space-y-1.5">
              {visiblePer.map((p) => (
                <StepDocRow
                  key={p.label}
                  count={p.count}
                  total={p.total}
                  label={p.label}
                  indic={p.indic}
                  funder={p.funder}
                />
              ))}
            </ul>
            {status.ageficeEligibleCount > 0 && status.ageficeEligibleCount < N && (
              <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                Assiduité AGEFICE : {status.ageficeEligibleCount} TNS éligibles sur {N}.
              </p>
            )}
          </div>
        </div>
      )}

      {!inProgress && !complete && N > 0 && (
        <p className="text-[11px] text-muted-foreground mt-4">
          → Le CTA <strong>« Pack fin de formation »</strong> (barre actions ou bloc
          « Prochaine action ») génère les documents manquants en lot.
        </p>
      )}
    </TimelineStep>
  );
}
