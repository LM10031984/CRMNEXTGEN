'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronDown,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import {
  confirmerReponses,
  enregistrerTranscript,
  rejeterReponse,
  supprimerTranscript,
} from '@/server/actions/diagnostic-transcript';

/**
 * L'onglet « Compte rendu » et la revue par exception (spec §6.4).
 *
 * Ce que cet écran doit rendre possible en quelques minutes : coller le compte
 * rendu d'un rendez-vous, lancer l'extraction, puis traiter TROIS files —
 * les réponses douteuses une par une, les sûres par chapitre, et la liste de ce
 * qui reste à demander. On ne re-déroule jamais le questionnaire entier.
 *
 * Chaque réponse affiche l'extrait du compte rendu qui la justifie. C'est ce
 * qui rend la relecture rapide ET sûre : le relecteur n'a pas à se souvenir du
 * rendez-vous, il lit la phrase du dirigeant.
 */

export interface LigneRevueVue {
  questionId: string;
  chapter: number;
  chapterTitle: string;
  question: string;
  valeur: string;
  confidence: number;
  quote: string;
}

export interface ManquanteVue {
  questionId: string;
  chapter: number;
  chapterTitle: string;
  question: string;
  required: boolean;
}

export interface TranscriptWorkspaceProps {
  diagnosticId: string;
  readOnly: boolean;
  transcript: {
    present: boolean;
    longueur: number;
    source: string | null;
    prefillAt: string | null;
    prefillModel: string | null;
  };
  revue: {
    aVerifier: LigneRevueVue[];
    confirmables: LigneRevueVue[];
    manquantes: ManquanteVue[];
    tauxPreRemplissage: number;
    tauxCouverture: number;
    visiblesCount: number;
    aRelireCount: number;
  };
  seuil: number;
}

const EXTENSIONS = '.txt,.md,.vtt,.srt,text/plain';

export function TranscriptWorkspace({
  diagnosticId,
  readOnly,
  transcript,
  revue,
  seuil,
}: TranscriptWorkspaceProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [extraction, setExtraction] = useState(false);
  const [texte, setTexte] = useState('');
  const [edition, setEdition] = useState(!transcript.present);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, succes: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(succes);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Action impossible');
      }
    });
  }

  async function chargerFichier(file: File) {
    const contenu = await file.text();
    setTexte(contenu);
    toast.success(`${file.name} chargé — relire puis enregistrer`);
  }

  /**
   * L'extraction passe par une route plutôt que par la server action : elle
   * dure des dizaines de secondes, et c'est le segment de route qui porte le
   * budget de temps.
   */
  async function lancerExtraction() {
    setExtraction(true);
    try {
      const rep = await fetch('/api/diagnostic-r1/prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosticId }),
      });
      const r = (await rep.json()) as {
        ok: boolean;
        error?: string;
        data?: { retenues: number; rejets: number };
      };
      if (!r.ok) {
        toast.error(r.error ?? "L'extraction a échoué");
        return;
      }
      const { retenues = 0, rejets = 0 } = r.data ?? {};
      toast.success(
        retenues === 0
          ? "Aucune réponse n'a pu être tirée de ce compte rendu"
          : `${retenues} réponse${retenues > 1 ? 's' : ''} extraite${retenues > 1 ? 's' : ''}${
              rejets > 0 ? ` · ${rejets} proposition${rejets > 1 ? 's' : ''} écartée${rejets > 1 ? 's' : ''}` : ''
            }`,
      );
      router.refresh();
    } catch {
      toast.error("Le service n'a pas répondu. Réessayer dans un instant.");
    } finally {
      setExtraction(false);
    }
  }

  const occupe = pending || extraction;

  return (
    <div className="space-y-6">
      <SectionCompteRendu
        transcript={transcript}
        readOnly={readOnly}
        occupe={occupe}
        extraction={extraction}
        edition={edition}
        setEdition={setEdition}
        texte={texte}
        setTexte={setTexte}
        onFichier={chargerFichier}
        onEnregistrer={(source) =>
          run(
            () => enregistrerTranscript({ diagnosticId, transcriptText: texte, transcriptSource: source }),
            'Compte rendu enregistré',
          )
        }
        onSupprimer={() =>
          run(() => supprimerTranscript(diagnosticId), 'Compte rendu supprimé — les réponses restent')
        }
        onExtraire={lancerExtraction}
      />

      {transcript.prefillAt ? (
        <SectionRevue
          diagnosticId={diagnosticId}
          revue={revue}
          seuil={seuil}
          readOnly={readOnly}
          occupe={occupe}
          onConfirmer={(questionIds, succes) =>
            run(() => confirmerReponses({ diagnosticId, questionIds }), succes)
          }
          onRejeter={(questionId) =>
            run(
              () => rejeterReponse({ diagnosticId, questionId }),
              'Réponse écartée — la question redevient à poser',
            )
          }
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionCompteRendu({
  transcript,
  readOnly,
  occupe,
  extraction,
  edition,
  setEdition,
  texte,
  setTexte,
  onFichier,
  onEnregistrer,
  onSupprimer,
  onExtraire,
}: {
  transcript: TranscriptWorkspaceProps['transcript'];
  readOnly: boolean;
  occupe: boolean;
  extraction: boolean;
  edition: boolean;
  setEdition: (v: boolean) => void;
  texte: string;
  setTexte: (v: string) => void;
  onFichier: (f: File) => void;
  onEnregistrer: (source: 'colle' | 'fichier') => void;
  onSupprimer: () => void;
  onExtraire: () => void;
}) {
  const [source, setSource] = useState<'colle' | 'fichier'>('colle');

  return (
    <section className="rounded-lg border border-border p-4 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          Compte rendu du rendez-vous
        </h2>
        {transcript.present && !edition ? (
          <span className="text-xs text-muted-foreground">
            {transcript.longueur.toLocaleString('fr-FR')} caractères
            {transcript.source ? ` · déposé par ${transcript.source === 'colle' ? 'collage' : 'fichier'}` : ''}
          </span>
        ) : null}
      </header>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Le compte rendu ne quitte jamais QualiOF : il n&apos;apparaît sur aucun lien public, dans
        aucun document remis au client, et il est effacé automatiquement 90 jours après le
        rendez-vous. Seules les réponses que vous aurez confirmées lui survivent.
      </p>

      {edition && !readOnly ? (
        <div className="space-y-2">
          <textarea
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              setSource('colle');
            }}
            rows={10}
            placeholder="Coller ici le compte rendu du rendez-vous — verbatim, tel qu'il sort de l'enregistrement."
            className="w-full rounded-md border border-border bg-background p-3 text-sm font-mono leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
              Charger un fichier
              <input
                type="file"
                accept={EXTENSIONS}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setSource('fichier');
                    void onFichier(f);
                  }
                }}
              />
            </label>
            <button
              type="button"
              disabled={occupe || texte.trim().length < 200}
              onClick={() => onEnregistrer(source)}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
            >
              Enregistrer le compte rendu
            </button>
            {transcript.present ? (
              <button
                type="button"
                disabled={occupe}
                onClick={() => setEdition(false)}
                className="text-sm text-muted-foreground hover:underline"
              >
                Annuler
              </button>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {texte.trim().length > 0 && texte.trim().length < 200
                ? `${200 - texte.trim().length} caractères de plus`
                : ''}
            </span>
          </div>
        </div>
      ) : null}

      {transcript.present && !edition ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={occupe || readOnly}
            onClick={onExtraire}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
          >
            {extraction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {extraction
              ? 'Lecture du compte rendu…'
              : transcript.prefillAt
                ? 'Relancer le pré-remplissage'
                : 'Pré-remplir le questionnaire'}
          </button>
          {!readOnly ? (
            <>
              <button
                type="button"
                disabled={occupe}
                onClick={() => setEdition(true)}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                Remplacer
              </button>
              <button
                type="button"
                disabled={occupe}
                onClick={onSupprimer}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </button>
            </>
          ) : null}
          {transcript.prefillAt ? (
            <span className="text-xs text-muted-foreground">
              Dernière lecture le {transcript.prefillAt}
              {transcript.prefillModel ? ` · ${transcript.prefillModel}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      {extraction ? (
        <p className="text-xs text-muted-foreground">
          Une lecture complète prend de trente secondes à deux minutes selon la longueur du compte
          rendu. Ne pas fermer l&apos;onglet.
        </p>
      ) : null}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionRevue({
  diagnosticId,
  revue,
  seuil,
  readOnly,
  occupe,
  onConfirmer,
  onRejeter,
}: {
  diagnosticId: string;
  revue: TranscriptWorkspaceProps['revue'];
  seuil: number;
  readOnly: boolean;
  occupe: boolean;
  onConfirmer: (questionIds: string[], succes: string) => void;
  onRejeter: (questionId: string) => void;
}) {
  const parChapitre = useMemo(() => {
    const carte = new Map<number, { titre: string; lignes: LigneRevueVue[] }>();
    for (const l of revue.confirmables) {
      const entree = carte.get(l.chapter) ?? { titre: l.chapterTitle, lignes: [] };
      entree.lignes.push(l);
      carte.set(l.chapter, entree);
    }
    return [...carte.entries()].sort((a, b) => a[0] - b[0]);
  }, [revue.confirmables]);

  const rien = revue.aRelireCount === 0;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-4">
        <Tuile
          label="Pré-remplissage"
          valeur={`${revue.tauxPreRemplissage} %`}
          detail={`${revue.aRelireCount}/${revue.visiblesCount} questions`}
        />
        <Tuile label="À vérifier" valeur={`${revue.aVerifier.length}`} detail={`confiance < ${Math.round(seuil * 100)} %`} />
        <Tuile label="Confirmables" valeur={`${revue.confirmables.length}`} detail="relecture groupée" />
        <Tuile label="À poser" valeur={`${revue.manquantes.length}`} detail="sans réponse" />
      </section>

      {rien ? (
        <p className="rounded-md border border-border bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
          Tout est relu. Les réponses confirmées comptent désormais dans les synthèses, l&apos;audit
          et la proposition.
        </p>
      ) : null}

      {revue.aVerifier.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            À vérifier — les moins sûres d&apos;abord
          </h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {revue.aVerifier.map((l) => (
              <LigneRevue
                key={l.questionId}
                ligne={l}
                diagnosticId={diagnosticId}
                readOnly={readOnly}
                occupe={occupe}
                onConfirmer={() => onConfirmer([l.questionId], 'Réponse confirmée')}
                onRejeter={() => onRejeter(l.questionId)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {parChapitre.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CheckCheck className="h-4 w-4 text-emerald-600" />
            Confirmables — chapitre par chapitre
          </h2>
          {parChapitre.map(([chapitre, { titre, lignes }]) => (
            <div key={chapitre} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                <span className="text-sm font-medium">
                  Chapitre {chapitre} — {titre}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {lignes.length} réponse{lignes.length > 1 ? 's' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={occupe || readOnly}
                  onClick={() =>
                    onConfirmer(
                      lignes.map((l) => l.questionId),
                      `Chapitre ${chapitre} confirmé — ${lignes.length} réponse${lignes.length > 1 ? 's' : ''}`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Tout confirmer
                </button>
              </div>
              <div className="divide-y divide-border">
                {lignes.map((l) => (
                  <LigneRevue
                    key={l.questionId}
                    ligne={l}
                    diagnosticId={diagnosticId}
                    readOnly={readOnly}
                    occupe={occupe}
                    onConfirmer={() => onConfirmer([l.questionId], 'Réponse confirmée')}
                    onRejeter={() => onRejeter(l.questionId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {revue.manquantes.length > 0 ? <SectionManquantes manquantes={revue.manquantes} diagnosticId={diagnosticId} /> : null}
    </div>
  );
}

function LigneRevue({
  ligne,
  diagnosticId,
  readOnly,
  occupe,
  onConfirmer,
  onRejeter,
}: {
  ligne: LigneRevueVue;
  diagnosticId: string;
  readOnly: boolean;
  occupe: boolean;
  onConfirmer: () => void;
  onRejeter: () => void;
}) {
  const pourcent = Math.round(ligne.confidence * 100);
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto]">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{ligne.question}</p>
        <p className="text-sm">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium dark:bg-slate-800">
            {ligne.valeur}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">confiance {pourcent} %</span>
        </p>
        {/*
          L'extrait n'est pas un ornement : c'est ce qui permet de confirmer sans
          se souvenir du rendez-vous. Il est toujours visible, jamais au survol —
          une information qu'il faut chercher n'est pas lue.
        */}
        <blockquote className="border-l-2 border-border pl-2 text-xs italic leading-relaxed text-muted-foreground">
          « {ligne.quote} »
        </blockquote>
      </div>
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          disabled={occupe || readOnly}
          onClick={onConfirmer}
          title="Confirmer cette réponse"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40"
        >
          <Check className="h-3.5 w-3.5" />
          Confirmer
        </button>
        <Link
          href={`/app/diagnostics/${diagnosticId}/chapitre/${ligne.chapter}` as Route}
          title="Corriger la réponse dans son chapitre"
          className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          Corriger
        </Link>
        <button
          type="button"
          disabled={occupe || readOnly}
          onClick={onRejeter}
          title="Écarter : le modèle a mal lu"
          className="rounded-md border border-border px-2 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function SectionManquantes({
  manquantes,
  diagnosticId,
}: {
  manquantes: ManquanteVue[];
  diagnosticId: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const obligatoires = manquantes.filter((m) => m.required).length;

  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">
          À poser au prochain rendez-vous
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {manquantes.length} question{manquantes.length > 1 ? 's' : ''}
            {obligatoires > 0 ? ` · dont ${obligatoires} obligatoire${obligatoires > 1 ? 's' : ''}` : ''}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert ? (
        <ul className="divide-y divide-border border-t border-border">
          {manquantes.map((m) => (
            <li key={m.questionId} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="text-sm">
                {m.question}
                {m.required ? <span className="ml-1.5 text-xs text-amber-700">obligatoire</span> : null}
              </span>
              <Link
                href={`/app/diagnostics/${diagnosticId}/chapitre/${m.chapter}` as Route}
                className="shrink-0 text-xs text-primary hover:underline"
              >
                Ch. {m.chapter}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Tuile({ label, valeur, detail }: { label: string; valeur: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{valeur}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
