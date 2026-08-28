'use client';

/**
 * Modale "Nouveau programme" — création d'un produit de formation complet.
 *
 * Tous les champs Qualiopi, le programme éditable avant enregistrement, et un
 * bouton « Pré-remplir avec l'IA ».
 *
 * 28/08 — elle ne vivait QUE dans le wizard de session : pour obtenir un
 * programme travaillé, il fallait commencer une session (« je voudrais pouvoir
 * générer un programme sans générer de session »). La page Produits n'offrait
 * qu'un formulaire minimal, sans champ programme ni relecture. `onCreated` est
 * donc devenu optionnel : sans lui, on ouvre la fiche du programme créé.
 *
 * Le champ « Ce que j'ai proposé au client » bascule l'IA en TRANSCRIPTION :
 * elle met en forme la proposition au lieu d'inventer un programme.
 */

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';
import { createTrainingProduct } from '@/server/actions/crud-edits';
import { aiPreFillProduct } from '@/server/actions/ai-fill-product';

type Modality = 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING';

interface NewProduct {
  id: string;
  code: string;
  title: string;
  durationHours: number;
  modality: 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE';
  priceHT: number | string;
  groupFlatPrice: number | string | null;
  theme: string | null;
  capacityMax: number;
}

export function QuickCreateProductButton({
  onCreated,
  label = 'Nouveau produit',
}: {
  /**
   * Fourni par le wizard de session, qui enchaîne sur l'inscription. Absent
   * depuis la page Produits : on ouvre alors la fiche du programme créé.
   */
  onCreated?: (p: NewProduct) => void;
  label?: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiApplied, setAiApplied] = useState(false);

  // Bloc essentiel
  const [title, setTitle] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [priceHT, setPriceHT] = useState('');
  const [modality, setModality] = useState<Modality>('PRESENTIEL');
  const [theme, setTheme] = useState('');
  const [capacityMax, setCapacityMax] = useState('12');

  // Bloc Qualiopi (alignés sur la modale d'édition)
  const [objectives, setObjectives] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [pedagogicalMethods, setPedagogicalMethods] = useState('');
  const [pedagogicalSupport, setPedagogicalSupport] = useState(
    'Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.',
  );
  const [evaluationMethods, setEvaluationMethods] = useState('');
  const [trainerProfile, setTrainerProfile] = useState('');
  const [accessibility, setAccessibility] = useState('');
  const [accessConditions, setAccessConditions] = useState('');
  const [programMd, setProgramMd] = useState('');
  // Retranscription de ce qui a déjà été proposé au client (modules négociés).
  const [propositionClient, setPropositionClient] = useState('');

  const reset = () => {
    setTitle('');
    setDurationHours('');
    setPriceHT('');
    setModality('PRESENTIEL');
    setTheme('');
    setCapacityMax('12');
    setObjectives('');
    setTargetAudience('');
    setPrerequisites('');
    setPedagogicalMethods('');
    setPedagogicalSupport(
      'Un livret de formation sera remis à chaque participant en début de formation. Le formateur déroulera sa formation avec une présentation Canva projetée.',
    );
    setEvaluationMethods('');
    setTrainerProfile('');
    setAccessibility('');
    setAccessConditions('');
    setProgramMd('');
    setPropositionClient('');
    setError(null);
    setAiApplied(false);
  };

  async function onAiFill() {
    setError(null);
    if (!title.trim()) {
      setError("L'intitulé est nécessaire pour pré-remplir avec l'IA.");
      return;
    }
    const dh = parseInt(durationHours, 10);
    if (!dh || dh <= 0) {
      setError("La durée en heures est nécessaire pour pré-remplir avec l'IA.");
      return;
    }
    setAiBusy(true);
    const t = toast.loading('IA en cours — génération du programme Start Academy…');
    try {
      const r = await aiPreFillProduct({
        title: title.trim(),
        theme: theme.trim() || null,
        durationHours: dh,
        modality,
        priceHT: parseFloat(priceHT.replace(',', '.')) || 0,
        // Fournie ⇒ l'IA transcrit la proposition au lieu de rédiger : elle ne
        // peut plus ajouter un module que le client n'a pas accepté.
        propositionClient: propositionClient.trim() || null,
      });
      if (r.ok && r.draft) {
        setObjectives(r.draft.objectives.join('\n'));
        setTargetAudience(r.draft.targetAudience);
        setPrerequisites(r.draft.prerequisites);
        setPedagogicalMethods(r.draft.pedagogicalMethods);
        setPedagogicalSupport(r.draft.pedagogicalSupport);
        setEvaluationMethods(r.draft.evaluationMethods);
        setTrainerProfile(r.draft.trainerProfile);
        setAccessibility(r.draft.accessibility);
        setAccessConditions(r.draft.accessConditions);
        setProgramMd(r.draft.programMd);
        setAiApplied(true);
        toast.success('Brouillon IA appliqué — relis et ajuste si besoin', {
          id: t,
          duration: 4000,
        });
      } else {
        toast.error(r.error ?? "Échec de la génération IA", { id: t });
        setError(r.error ?? null);
      }
    } catch (e: any) {
      toast.error(`Erreur IA : ${e?.message ?? e}`, { id: t });
      setError(e?.message ?? String(e));
    } finally {
      setAiBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const dh = parseInt(durationHours, 10);
    const price = parseFloat(priceHT.replace(',', '.')) || 0;
    const cap = parseInt(capacityMax, 10) || 12;
    if (!title.trim() || !dh || dh <= 0) {
      setError('Intitulé et durée (heures) sont obligatoires.');
      return;
    }
    setBusy(true);
    try {
      const objectivesList = objectives
        .split('\n')
        .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
        .filter(Boolean);

      const r = await createTrainingProduct({
        title: title.trim(),
        durationHours: dh,
        priceHT: price,
        modality,
        theme: theme.trim() || null,
        capacityMax: cap,
        objectives: objectivesList,
        programMd: programMd.trim() || undefined,
        targetAudience: targetAudience.trim() || null,
        prerequisites: prerequisites.trim() || null,
        pedagogicalMethods: pedagogicalMethods.trim() || null,
        pedagogicalSupport: pedagogicalSupport.trim() || null,
        evaluationMethods: evaluationMethods.trim() || null,
        trainerProfile: trainerProfile.trim() || null,
        accessibility: accessibility.trim() || null,
        accessConditions: accessConditions.trim() || null,
      });

      if (r.ok && r.productId && r.code) {
        toast.success(`Produit ${r.code} créé`);
        const m = modality === 'ELEARNING' ? 'DISTANCIEL' : modality;
        if (!onCreated) {
          // Création autonome : on ouvre le programme, seul endroit où on le
          // relit et le fige.
          setOpen(false);
          reset();
          router.push(`/app/produits/${r.productId}?tab=programme`);
          return;
        }
        onCreated({
          id: r.productId,
          code: r.code,
          title: title.trim(),
          durationHours: dh,
          modality: m,
          priceHT: price,
          groupFlatPrice: null,
          theme: theme.trim() || null,
          capacityMax: cap,
        });
        setOpen(false);
        reset();
      } else {
        setError(r.error ?? 'Erreur lors de la création.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <Plus className="h-4 w-4" /> {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && !aiBusy && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-3xl w-full shadow-xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">Créer un produit de formation</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Programme conforme Qualiopi — pré-remplissage IA disponible
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              {/* Bloc essentiel */}
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor={`${ids}-title`}
                    className="block text-xs font-medium text-muted-foreground mb-1"
                  >
                    Intitulé *
                  </label>
                  <input
                    id={`${ids}-title`}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    placeholder="ex: L'IA au service des conseillers immobiliers"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor={`${ids}-duration`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      Durée (heures) *
                    </label>
                    <input
                      id={`${ids}-duration`}
                      type="number"
                      min="1"
                      value={durationHours}
                      onChange={(e) => setDurationHours(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder="21"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Prix HT / stagiaire (€)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={priceHT}
                      onChange={(e) => setPriceHT(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder="3024"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Capacité max
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={capacityMax}
                      onChange={(e) => setCapacityMax(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Modalité
                    </label>
                    <select
                      value={modality}
                      onChange={(e) => setModality(e.target.value as Modality)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                    >
                      <option value="PRESENTIEL">Présentiel</option>
                      <option value="DISTANCIEL">Distanciel</option>
                      <option value="MIXTE">Mixte</option>
                      <option value="ELEARNING">E-learning</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Thème
                    </label>
                    <input
                      type="text"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                      placeholder="IA, Immobilier, Management…"
                    />
                  </div>
                </div>
              </div>

              {/* Contexte donné à l'IA (28/08) — ce qui a déjà été proposé au
                  client. Rempli, il bascule la génération en TRANSCRIPTION :
                  l'IA met en forme ces modules et n'a plus le droit d'en
                  inventer d'autres pour « remplir » la durée. */}
              <div>
                <label
                  htmlFor={`${ids}-proposition`}
                  className="block text-xs font-medium text-muted-foreground mb-1"
                >
                  Ce que j&apos;ai déjà proposé au client (facultatif)
                </label>
                <textarea
                  id={`${ids}-proposition`}
                  value={propositionClient}
                  onChange={(e) => setPropositionClient(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono"
                  placeholder={
                    'Collez ici les modules proposés (mail, devis, notes de rendez-vous)…\n\nModule 1 : audit du portefeuille de mandats\nModule 2 : relance des mandats expirés'
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Rempli, l&apos;IA <strong>transcrit</strong> ces modules en programme conforme
                  au lieu d&apos;en rédiger un : elle n&apos;ajoute rien que le client n&apos;ait
                  accepté. Vide, elle rédige à partir du titre et du thème.
                </p>
              </div>

              {/* Bouton IA */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-purple-200 bg-purple-50">
                <div className="flex items-start gap-2 text-xs">
                  <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <strong className="block text-purple-900">
                      {propositionClient.trim()
                        ? 'Transcription de votre proposition'
                        : 'Pré-remplissage IA'}
                    </strong>
                    <span className="text-purple-700">
                      {propositionClient.trim()
                        ? 'Vos modules sont mis en forme en programme Qualiopi (journées, horaires, verbes d’action évaluables), sans ajout ni retrait.'
                        : 'Renseigne titre + durée + thème puis clique pour générer un brouillon Qualiopi conforme Start Academy (objectifs, public, programme jour-par-jour…).'}
                      {' '}Le style s’appuie sur vos programmes déjà validés dans QualiOF.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onAiFill}
                  disabled={aiBusy || busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 shrink-0"
                >
                  {aiBusy ? (
                    'Génération…'
                  ) : aiApplied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Régénérer
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> Pré-remplir avec l’IA
                    </>
                  )}
                </button>
              </div>

              {/* Champs Qualiopi */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Objectifs pédagogiques (un par ligne)
                  </label>
                  <textarea
                    value={objectives}
                    onChange={(e) => setObjectives(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm font-sans"
                    placeholder="Comprendre les fondamentaux…&#10;Maîtriser les outils…&#10;Intégrer l'IA dans la stratégie…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Public visé
                  </label>
                  <textarea
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Prérequis
                  </label>
                  <input
                    type="text"
                    value={prerequisites}
                    onChange={(e) => setPrerequisites(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Méthodes pédagogiques
                  </label>
                  <textarea
                    value={pedagogicalMethods}
                    onChange={(e) => setPedagogicalMethods(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Supports pédagogiques (livret, Canva…)
                  </label>
                  <textarea
                    value={pedagogicalSupport}
                    onChange={(e) => setPedagogicalSupport(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Programme détaillé (Markdown — ## titres, listes à puces)
                  </label>
                  <textarea
                    value={programMd}
                    onChange={(e) => setProgramMd(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 border border-border rounded-lg text-xs font-mono"
                    placeholder="## Jour 1 : Introduction&#10;### Matin (9h-12h)&#10;- Accueil et présentation&#10;- ..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Modalités d'évaluation
                  </label>
                  <textarea
                    value={evaluationMethods}
                    onChange={(e) => setEvaluationMethods(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Profil du formateur
                  </label>
                  <textarea
                    value={trainerProfile}
                    onChange={(e) => setTrainerProfile(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Accessibilité PMR
                  </label>
                  <textarea
                    value={accessibility}
                    onChange={(e) => setAccessibility(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Conditions d'accès et délais
                  </label>
                  <textarea
                    value={accessConditions}
                    onChange={(e) => setAccessConditions(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy || aiBusy}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? 'Création…' : 'Créer le produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
