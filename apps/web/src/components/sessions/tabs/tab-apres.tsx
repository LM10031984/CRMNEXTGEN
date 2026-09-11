'use client';

/**
 * Phase 15 Lot 2 (15-02) — Onglet « Après la formation » (le pack).
 *
 * Réembarque DANS l'onglet (plus de bandeau page-wide) :
 *   - le CTA « Générer le pack » + le bloc pack `<ClosureFormationBlock>`
 *     (pré-rendus côté serveur, passés en slots `packCta` / `closureBlock` /
 *     `pendantBlock` — pattern RSC : nœuds React en props, pas de fonction
 *     importée d'un module client).
 *   - le suivi du batch en cours via `<BatchProgressAutoRefresh>`.
 *   - les 4 docs « niveau session » (Déroulé · Grille obs session · Checklist ·
 *     Bilan satisfaction session) repris de `SessionOnlyDocsBlock` (supprimé),
 *     une LIGNE par doc, chacune câblée sur SA server action.
 *
 * Source unique (LOCKED) : le compteur « manquants » dérive de
 * `apresMissingCount` → `docCompletion(closureItems)` (même source que la
 * matrice). AUCUN recompte local.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, ExternalLink, FileText, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { BatchProgressAutoRefresh } from '../batch-progress-auto-refresh';
import { LearnerPhaseActions } from '../learner-phase-actions';
import { docCompletion, type CompletionItem, type DocState } from '@/lib/sessions/doc-completion';
import { apresMissingCount } from './tab-apres-helpers';
import { closureKindsForPhase, phaseLabel, type DocPhase } from '@/lib/docs/doc-phase';
import type { PhaseParticipantGroup } from '@/lib/sessions/participant-phase-items';
import { generateClosurePack } from '@/server/actions/closure-pack';
import { dispatchGenerateDoc } from '@/server/actions/dispatch-generate-doc';
import { generateDerouleForProduct } from '@/server/actions/deroule-product-generator';
import { generateGrilleObsSessionForSession } from '@/server/actions/generate-grille-obs-session';
import { generateChecklistForSession } from '@/server/actions/generate-checklist-formation';
import { generateSatisfactionSessionForSession } from '@/server/actions/generate-satisfaction-session';
import {
  SignedDocDropZone,
  type DropZoneParticipant,
} from '../qualiopi-matrix/signed-doc-drop-zone';
import { BlocSignature } from '../signature/bloc-signature';
import type { VueSignature } from '@/lib/sessions/bloc-signature-vue';

type SessionDocKey = 'deroule' | 'grilleObs' | 'checklist' | 'satisfactionSession';

interface SessionDocRef {
  state: DocState;
  /** URL d'ouverture du PDF si généré. */
  pdfUrl?: string;
}

interface Props {
  sessionId: string;
  productId: string | null;
  canWrite: boolean;
  /**
   * État des 4 docs niveau session (source : getSessionClosureStatus +
   * proxy grilleObsAssetCount, dérivé côté page).
   */
  sessionDocs: Record<SessionDocKey, SessionDocRef>;
  /**
   * Items « closure » comptés par `docCompletion` — MÊME source que la matrice.
   * Le compteur « manquants » de l'onglet en dérive (jamais recompté).
   */
  closureItems: CompletionItem[];
  /** Suivi du dernier batch closure (rendu DANS l'onglet). */
  batch?: {
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
    totalDocs: number;
    doneDocs: number;
    errorDocs: number;
  } | null;
  /**
   * Lot A signature (spec 2026-09-04 §5 A) — stagiaires de la session, pour la
   * zone de dépôt des émargements signés. L'émargement est signé à la main en
   * salle (décision O-3) : le scan revient ici, participant par participant.
   */
  dropZoneParticipants?: DropZoneParticipant[];
  /** Slots pré-rendus côté serveur (nœuds React, pas de fonction client). */
  packCta?: React.ReactNode;
  pendantBlock?: React.ReactNode;
  closureBlock?: React.ReactNode;
  /**
   * Blocs NOMINATIFS des phases « pendant » et « après » (Laurent 2026-09-10).
   * L'onglet n'en avait aucun : il n'affichait que les documents de niveau
   * session et le bloc pack, donc il n'y avait aucune ligne « nom d'apprenant »
   * sur laquelle poser un bouton par apprenant.
   * Dérivés côté serveur par `buildParticipantPhaseGroups` — même
   * `deriveCellState` que la matrice, donc jamais un état divergent.
   */
  pendantGroups?: PhaseParticipantGroup[];
  apresGroups?: PhaseParticipantGroup[];
  /**
   * Lot C.2b-2 — la vue du bloc « Signature » pour le scope APRÈS
   * (l'attestation d'assiduité). Calculée côté serveur par
   * `construireVueSignature` : l'onglet ne décide RIEN, il met en page.
   */
  vueSignature?: VueSignature;
}

const SESSION_CARDS: Array<{
  key: SessionDocKey;
  title: string;
  shortLabel: string;
}> = [
  { key: 'deroule', title: 'Déroulé pédagogique', shortLabel: 'Déroulé' },
  { key: 'grilleObs', title: "Grille d'observation session", shortLabel: 'Grille observation' },
  { key: 'checklist', title: 'Checklist formation', shortLabel: 'Checklist' },
  { key: 'satisfactionSession', title: 'Bilan satisfaction session', shortLabel: 'Bilan satisfaction' },
];

export function TabApres({
  sessionId,
  productId,
  canWrite,
  sessionDocs,
  closureItems,
  batch,
  dropZoneParticipants,
  packCta,
  pendantBlock,
  closureBlock,
  pendantGroups = [],
  apresGroups = [],
  vueSignature,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** Apprenant dont la génération est en cours (une ligne à la fois). */
  const [busyParticipant, setBusyParticipant] = useState<string | null>(null);

  // Source unique : compteur dérivé de docCompletion (via apresMissingCount).
  const completion = docCompletion(closureItems);
  const missing = apresMissingCount(closureItems);

  function runGenerate(label: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) {
          toast.success(`${label} généré`);
          router.refresh();
        } else {
          toast.error(res.error ?? `Erreur génération ${label}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Erreur génération ${label}`);
      }
    });
  }

  /**
   * « Tout générer » pour UN apprenant, sur UNE phase.
   *
   * Deux moteurs, parce que les documents d'après-formation en ont deux :
   *  - le pack `generateClosurePack` en mode mono-participant (attestation,
   *    certificat, QCM, positionnement, satisfactions, émargement) — il saute
   *    de lui-même ce qui existe déjà, donc rien n'est écrasé ;
   *  - `dispatchGenerateDoc` pour l'attestation d'assiduité AGEFICE, qui a son
   *    générateur synchrone dédié et ne fait PAS partie du pack.
   */
  function handleGenerateForLearner(group: PhaseParticipantGroup, phase: DocPhase) {
    const kinds = closureKindsForPhase(phase);
    const assiduiteManquante = group.items.some(
      (i) => i.docType === 'ASSIDUITE' && i.state === 'missing',
    );
    if (kinds.length === 0 && !assiduiteManquante) return;

    setBusyParticipant(group.participantId);
    startTransition(async () => {
      try {
        let lance = 0;
        if (kinds.length > 0) {
          const r = await generateClosurePack(sessionId, {
            participantIds: [group.participantId],
            kinds: kinds as never,
          });
          if (!r.ok) {
            toast.error(r.error ?? `Erreur génération pour ${group.fullName}`);
            return;
          }
          if (r.alreadyComplete) {
            toast.info(`${group.fullName} — tout est déjà généré`);
          } else {
            lance += r.total ?? 0;
          }
        }
        if (assiduiteManquante) {
          const r = await dispatchGenerateDoc({
            sessionId,
            docType: 'ASSIDUITE_AGEFICE',
            participantId: group.participantId,
          });
          if (r.ok) lance += 1;
          else toast.error(r.error ?? "Erreur attestation d'assiduité AGEFICE");
        }
        if (lance > 0) {
          toast.success(
            `${group.fullName} — ${lance} document${lance > 1 ? 's' : ''} en cours de génération`,
          );
        }
        router.refresh();
      } finally {
        setBusyParticipant(null);
      }
    });
  }

  /**
   * L'attestation d'assiduité AGEFICE, seule, pour un apprenant.
   *
   * Elle a son générateur synchrone dédié (`ASSIDUITE_AGEFICE`) : elle ne fait
   * pas partie du pack de fin de formation, donc « Tout générer » ne suffit pas
   * à la REgénérer quand elle existe déjà. Ce bouton de ligne remplace celui
   * qu'elle avait dans l'onglet « Avant », d'où elle vient d'être retirée
   * (elle y faisait doublon et faussait le compteur de l'archive).
   */
  function handleGenerateAssiduite(participantId: string, fullName: string, force: boolean) {
    setBusyParticipant(participantId);
    startTransition(async () => {
      try {
        const r = await dispatchGenerateDoc({
          sessionId,
          docType: 'ASSIDUITE_AGEFICE',
          participantId,
          force,
        });
        if (r.ok) {
          toast.success(
            `${fullName} — attestation d'assiduité ${force ? 'régénérée' : 'générée'}`,
          );
          router.refresh();
        } else {
          toast.error(r.error ?? "Erreur attestation d'assiduité AGEFICE");
        }
      } finally {
        setBusyParticipant(null);
      }
    });
  }

  function handleGenerate(key: SessionDocKey, label: string, force = false) {
    if (key === 'deroule') {
      if (!productId) {
        toast.error('Produit lié manquant');
        return;
      }
      runGenerate(label, () => generateDerouleForProduct(productId, { force }));
    } else if (key === 'grilleObs') {
      runGenerate(label, () => generateGrilleObsSessionForSession(sessionId, { force }));
    } else if (key === 'checklist') {
      runGenerate(label, () => generateChecklistForSession(sessionId, { force }));
    } else {
      // satisfactionSession — pas de `force` (re-génère systématiquement,
      // déterministe à partir des satisfactions SessionParticipant).
      runGenerate(label, () => generateSatisfactionSessionForSession(sessionId));
    }
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Suivi du batch en cours — DANS l'onglet (plus de bandeau page-wide). */}
      {batch && (
        <BatchProgressAutoRefresh
          status={batch.status}
          totalDocs={batch.totalDocs}
          doneDocs={batch.doneDocs}
          errorDocs={batch.errorDocs}
        />
      )}

      {/* CTA « Générer le pack » (slot serveur). */}
      {packCta && (
        <section className="rounded-2xl border border-border bg-white p-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-base">Pack fin de formation</h2>
            <p className="text-sm text-muted-foreground">
              {completion.ready}/{completion.total} prêts
              {missing > 0 && <> · {missing} manquant{missing > 1 ? 's' : ''}</>}
            </p>
          </div>
          {packCta}
        </section>
      )}

      {/* « Pendant » fondu dans Après (slot serveur). */}
      {pendantBlock}

      {/* Bloc pack détaillé (slot serveur). */}
      {closureBlock}

      {/* Par apprenant — la ligne du nom porte SES actions de phase
          (Laurent 2026-09-10 : « ici un bouton par apprenant »). */}
      <PhaseLearnerBlocks
        phase="pendant"
        groups={pendantGroups}
        sessionId={sessionId}
        canWrite={canWrite}
        busyParticipant={busyParticipant}
        onGenerateAll={handleGenerateForLearner}
      />
      <PhaseLearnerBlocks
        phase="apres"
        groups={apresGroups}
        sessionId={sessionId}
        canWrite={canWrite}
        busyParticipant={busyParticipant}
        onGenerateAll={handleGenerateForLearner}
        onGenerateAssiduite={handleGenerateAssiduite}
      />

      {/* Lot C.2b-2 — envoi en signature électronique, JUSTE AU-DESSUS du dépôt
          de scans : les deux gestes se lisent d'un coup d'œil et ne se
          cherchent pas dans deux endroits. L'un fait signer à distance, l'autre
          récupère la feuille signée en salle ; sur une pièce nominative ils
          coexistent, et s'excluent dès qu'un signé existe (décision n°4). */}
      {vueSignature && (
        <BlocSignature sessionId={sessionId} scope="AFTER" vue={vueSignature} />
      )}

      {/* Lot A signature — dépôt des émargements signés à la main (O-3).
          Le geste doit être visible ici, pas caché dans le menu d'une cellule.
          Placé sous les lignes par apprenant : c'est le geste de masse qui les
          complète, une fois les feuilles récupérées en salle. */}
      {canWrite && dropZoneParticipants && dropZoneParticipants.length > 0 && (
        <SignedDocDropZone
          sessionId={sessionId}
          docType="EMARGEMENT"
          participants={dropZoneParticipants}
          // L'attestation d'assiduité se signe le plus souvent EN PRÉSENTIEL,
          // en fin de session : même geste que l'émargement — on ramasse, on
          // scanne, on dépose. L'envoi en signature électronique (lot C) sera
          // l'exception, pour le distanciel. L'émargement reste le défaut,
          // c'est le dépôt le plus fréquent.
          docTypeOptions={[
            { value: 'EMARGEMENT', label: 'Émargements' },
            { value: 'ASSIDUITE', label: "Attestations d'assiduité" },
          ]}
        />
      )}

      {/* 4 docs niveau session — une ligne par doc, câblée sur SA server action. */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 inline-flex items-center gap-2">
          <FileText className="h-4 w-4" aria-hidden="true" /> Documents niveau session
        </h3>
        <ul className="divide-y divide-border">
          {SESSION_CARDS.map((card) => {
            const ref = sessionDocs[card.key];
            const has = ref.state === 'generated';
            const disabled = pending || (card.key === 'deroule' && !productId);
            return (
              <li key={card.key} className="flex items-center gap-3 py-2.5">
                {has ? (
                  <span className="h-4 w-4 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    className="h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-50 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{card.title}</span>

                {has && ref.pdfUrl && (
                  <a
                    href={ref.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-primary hover:bg-primary-50 transition-colors shrink-0"
                  >
                    Ouvrir <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleGenerate(card.key, card.shortLabel, has)}
                    disabled={disabled}
                    // Nom accessible = titre du doc → ciblé par les tests
                    // (/déroulé/i, /grille/i, /checklist/i, /bilan satisfaction/i).
                    aria-label={`${has ? 'Régénérer' : 'Générer'} ${card.title}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-semibold shrink-0 transition-colors disabled:opacity-60 disabled:cursor-wait shadow-sm bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : has ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {has ? 'Régénérer' : 'Générer'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ── Blocs nominatifs d'une phase ─────────────────────────────────────── */

/**
 * Un bloc par apprenant : son nom, ses actions de phase, puis ses documents.
 *
 * Volontairement calqué sur l'onglet « Avant » (une section arrondie, un titre
 * en petites capitales, une ligne par document) : Laurent passe d'un onglet à
 * l'autre pour le même dossier, deux mises en page différentes lui feraient
 * chercher deux fois.
 */
function PhaseLearnerBlocks({
  phase,
  groups,
  sessionId,
  canWrite,
  busyParticipant,
  onGenerateAll,
  onGenerateAssiduite,
}: {
  phase: DocPhase;
  groups: PhaseParticipantGroup[];
  sessionId: string;
  canWrite: boolean;
  busyParticipant: string | null;
  onGenerateAll: (group: PhaseParticipantGroup, phase: DocPhase) => void;
  /** Générateur dédié de l'attestation d'assiduité AGEFICE (hors pack). */
  onGenerateAssiduite?: (participantId: string, fullName: string, force: boolean) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {phaseLabel(phase)} · par apprenant
      </h3>
      {groups.map((group) => (
        <section
          key={group.participantId}
          className="rounded-2xl border border-border bg-white p-5"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.fullName}
              {group.sponsorOrgLabel && (
                <span className="normal-case font-normal"> ({group.sponsorOrgLabel})</span>
              )}
            </h4>
            <LearnerPhaseActions
              sessionId={sessionId}
              participantId={group.participantId}
              participantName={group.fullName}
              phase={phase}
              readyCount={group.readyCount}
              readyLabels={group.items
                .filter((it) => it.state === 'generated')
                .map((it) => it.label)}
              missingCount={group.missingCount}
              canGenerate={canWrite}
              onGenerateAll={() => onGenerateAll(group, phase)}
              busy={busyParticipant === group.participantId}
            />
          </div>
          <ul className="divide-y divide-border">
            {group.items.map((item) => (
              <li key={item.docType} className="flex items-center gap-3 py-2.5">
                {item.state === 'generated' ? (
                  <span className="h-4 w-4 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    className="h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-50 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.label}</span>
                {item.pdfUrl && (
                  <div className="inline-flex items-center gap-1 shrink-0">
                    <a
                      href={item.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-primary hover:bg-primary-50 transition-colors"
                    >
                      Ouvrir <ExternalLink className="h-3 w-3" />
                    </a>
                    {/* Seul ce lien porte `?dl=1`, donc un nom parlant. */}
                    <a
                      href={item.downloadUrl}
                      aria-label={`Télécharger ${item.label} de ${group.fullName}`}
                      title="Télécharger avec un nom de fichier lisible"
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" /> Télécharger
                    </a>
                  </div>
                )}
                {!item.pdfUrl && !(item.docType === 'ASSIDUITE' && canWrite && onGenerateAssiduite) && (
                  <span className="text-xs text-muted-foreground shrink-0">À générer</span>
                )}
                {item.docType === 'ASSIDUITE' && canWrite && onGenerateAssiduite && (
                  <button
                    type="button"
                    onClick={() =>
                      onGenerateAssiduite(group.participantId, group.fullName, !!item.pdfUrl)
                    }
                    disabled={busyParticipant === group.participantId}
                    aria-label={`${item.pdfUrl ? 'Régénérer' : 'Générer'} l'attestation d'assiduité de ${group.fullName}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-semibold shrink-0 transition-colors disabled:opacity-60 disabled:cursor-wait shadow-sm bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {busyParticipant === group.participantId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : item.pdfUrl ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {item.pdfUrl ? 'Régénérer' : 'Générer'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
