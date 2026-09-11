'use client';

/**
 * Lot A — `<SignedDocDropZone>` (spec signature 2026-09-04 §5 lot A).
 *
 * « L'émargement reste signé à la main (feuille papier en salle). Il faut un
 *   endroit visible où déposer le scan — glisser-déposer au niveau session,
 *   pas seulement le menu caché d'une cellule de la matrice. » (décision O-3)
 *
 * Deux modes :
 *  - `assign` : on lâche N PDF, chacun est affecté à un stagiaire. La
 *    pré-affectation par nom de fichier est automatique (helper pur
 *    `autoAssignFiles`), l'admin corrige ce qui n'a pas été reconnu.
 *  - `split` (A.2) : un seul PDF multipages sorti du scanner, une fiche par
 *    page, dans l'ordre de la liste — réordonnable.
 *
 * Écrit via `uploadSignedScans`, qui partage son cœur avec `uploadSignedDoc`
 * (la modale par cellule) : un seul chemin d'écriture des PDF signés.
 */

import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  autoAssignFiles,
  findDuplicateAssignments,
  type MatchCandidate,
} from '@/lib/signed-scan-match';
import { uploadSignedScans } from '@/server/actions/qualiopi-matrix';
import { titreDepotSigne } from '@/lib/sessions/titre-depot-signe';

const MAX_BYTES = 10 * 1024 * 1024;

export interface DropZoneParticipant extends MatchCandidate {
  /**
   * État actuel de la cellule par type de document (« Signé (scan) », « Généré »,
   * « Manquant ») — affiché à droite du nom pour que l'admin voie ce qu'il écrase.
   */
  stateByDocType?: Record<string, string | undefined>;
}

export interface SignedDocDropZoneProps {
  sessionId: string;
  /** Type de document déposé (EMARGEMENT dans l'onglet Après). */
  docType: string;
  participants: DropZoneParticipant[];
  /** Replié par défaut dans l'onglet Avant, déplié dans Après. */
  defaultOpen?: boolean;
  /** Si fourni, l'admin choisit le type de document déposé. */
  docTypeOptions?: Array<{ value: string; label: string }>;
  /**
   * L'en-tête de la section, quand l'appelant en impose un (demande n°4).
   *
   * Le bloc « Signature » y met une QUESTION — « Exemplaire signé à la main ? »
   * — parce que la section n'est plus une rubrique de dépôt mais l'un des deux
   * chemins vers la preuve, présenté à côté de l'autre. Sans `titre`, l'en-tête
   * reste `titreDepotSigne(selectedDocType)` : un appelant isolé continue
   * d'annoncer la pièce qu'il attend.
   */
  titre?: string;
  /**
   * Ce qui se lit AVANT de glisser quoi que ce soit : comment le fichier est
   * rattaché, et pourquoi cette zone ne concerne que le papier. Rendu tel quel.
   */
  aide?: ReactNode;
}

type Row = { file: File; participantId: string | null };

export function SignedDocDropZone({
  sessionId,
  docType,
  participants,
  defaultOpen = true,
  docTypeOptions,
  titre,
  aide,
}: SignedDocDropZoneProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [order, setOrder] = useState<string[]>(participants.map((p) => p.id));
  const [selectedDocType, setSelectedDocType] = useState(docType);
  /**
   * L'en-tête nomme le document RÉELLEMENT sélectionné — sinon l'encadré
   * annonce « Déposer les émargements signés » alors que l'admin a choisi
   * l'attestation d'assiduité.
   *
   * ⚠ IL VIENT D'UNE TABLE, PLUS D'UNE CONCATÉNATION (Laurent, 11/09/2026).
   * `Déposer les ${libellé} signés` produisait « Déposer les convention
   * signés » : le pluriel et l'accord étaient écrits en dur dans le gabarit,
   * donc faux dès que le libellé n'était ni masculin ni déjà au pluriel.
   */
  const titreDeLaPiece = titreDepotSigne(selectedDocType);
  /**
   * L'en-tête : celui imposé par l'appelant, sinon celui de la pièce.
   *
   * Les deux cohabitent volontairement. Quand le bloc « Signature » impose sa
   * question, le titre de la pièce ne disparaît pas : il nomme la zone où les
   * fichiers atterrissent (« Déposer les conventions signées »), donc il SUIT
   * toujours le type sélectionné.
   */
  const enTete = titre ?? titreDeLaPiece;
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const duplicates = useMemo(
    () => findDuplicateAssignments(rows.map((r) => r.participantId)),
    [rows],
  );
  const canSplit = rows.length === 1;
  const effectiveSplit = splitMode && canSplit;

  function addFiles(incoming: FileList | File[] | null) {
    if (!incoming) return;
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (file.type !== 'application/pdf') {
        toast.error(`${file.name} — Format non supporté. Le fichier doit être un PDF.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} — Fichier trop volumineux (max 10 Mo).`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    const assigned = autoAssignFiles(
      accepted.map((f) => f.name),
      participants,
    );
    setRows((prev) => [
      ...prev,
      ...accepted.map((file, i) => ({ file, participantId: assigned[i] ?? null })),
    ]);
  }

  function move(participantId: string, delta: number) {
    setOrder((prev) => {
      const index = prev.indexOf(participantId);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(next, 0, moved!);
      return copy;
    });
  }

  function handleSave() {
    const fd = new FormData();
    fd.append('sessionId', sessionId);
    fd.append('docType', selectedDocType);
    fd.append('mode', effectiveSplit ? 'split' : 'assign');

    if (effectiveSplit) {
      fd.append('files', rows[0]!.file);
      for (const id of order) fd.append('participantIds', id);
    } else {
      for (const row of rows) {
        if (!row.participantId) continue;
        fd.append('files', row.file);
        fd.append('participantIds', row.participantId);
      }
    }

    startTransition(async () => {
      const res = await uploadSignedScans(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.saved > 0) {
        toast.success(
          res.saved === 1 ? '1 scan signé enregistré' : `${res.saved} scans signés enregistrés`,
        );
      }
      for (const failure of res.failures) {
        toast.error(`${failure.filename} — ${failure.error}`);
      }
      if (res.failures.length === 0) {
        setRows([]);
        setSplitMode(false);
      }
      router.refresh();
    });
  }

  const assignedCount = effectiveSplit
    ? order.length
    : rows.filter((r) => r.participantId).length;
  const unassigned = !effectiveSplit && rows.some((r) => !r.participantId);
  const blocked = pending || assignedCount === 0 || duplicates.length > 0 || unassigned;

  return (
    <section className="rounded-lg border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {enTete}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {aide}

          {docTypeOptions && (
            <div>
              <label htmlFor="drop-zone-doctype" className="block text-xs font-medium mb-1">
                Type de document
              </label>
              <select
                id="drop-zone-doctype"
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                disabled={pending}
                className="rounded-md border border-border px-2 py-1.5 text-sm"
              >
                {docTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'cursor-pointer rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors',
              dragging ? 'border-primary bg-primary-50/50' : 'border-border hover:bg-muted/40',
            )}
          >
            {/* La zone d'atterrissage NOMME la pièce attendue, même quand
                l'en-tête porte la question de l'appelant : c'est ici qu'on
                lâche les fichiers, donc ici qu'il faut savoir lesquels. Le
                pluriel et l'accord viennent de la table (correction n°5). */}
            <p className="text-sm font-medium">{titreDeLaPiece}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Un fichier par stagiaire · Format PDF · max 10 Mo
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {rows.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={effectiveSplit}
                  disabled={!canSplit || pending}
                  onChange={(e) => setSplitMode(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className={cn(!canSplit && 'text-muted-foreground')}>
                  Ce PDF contient une fiche par page
                </span>
              </label>

              {effectiveSplit ? (
                <ol className="divide-y divide-border rounded-md border border-border text-sm">
                  {order.map((id, index) => {
                    const p = participants.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <li key={id} className="flex items-center gap-2 px-3 py-2">
                        <span className="w-10 shrink-0 text-xs text-muted-foreground">
                          p. {index + 1}
                        </span>
                        <span className="flex-1 truncate">
                          {p.fullName}
                          {p.stateByDocType?.[selectedDocType] && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {p.stateByDocType[selectedDocType]}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => move(id, -1)}
                          disabled={index === 0 || pending}
                          aria-label={`Monter ${p.fullName}`}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(id, 1)}
                          disabled={index === order.length - 1 || pending}
                          aria-label={`Descendre ${p.fullName}`}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrder((prev) => prev.filter((x) => x !== id))}
                          disabled={pending}
                          aria-label={`Retirer ${p.fullName} de la liste`}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border text-sm">
                  {rows.map((row, index) => (
                    <li key={`${row.file.name}-${index}`} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 truncate" title={row.file.name}>
                        {row.file.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {Math.round(row.file.size / 1024)} Ko
                        </span>
                      </span>
                      <label className="sr-only" htmlFor={`assign-${index}`}>
                        Stagiaire pour {row.file.name}
                      </label>
                      <select
                        id={`assign-${index}`}
                        value={row.participantId ?? ''}
                        disabled={pending}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, participantId: e.target.value || null } : r,
                            ),
                          )
                        }
                        className={cn(
                          'rounded-md border px-2 py-1 text-sm',
                          row.participantId ? 'border-border' : 'border-amber-400 bg-amber-50',
                        )}
                      >
                        <option value="">— Choisir un stagiaire —</option>
                        {participants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                            {p.stateByDocType?.[selectedDocType]
                              ? ` · ${p.stateByDocType[selectedDocType]}`
                              : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                        disabled={pending}
                        aria-label={`Retirer ${row.file.name}`}
                        className="rounded p-1 hover:bg-muted disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {duplicates.length > 0 && (
                <p role="alert" className="text-xs text-red-600">
                  Un même stagiaire est affecté à plusieurs fichiers — le second écraserait le
                  premier. Corrigez avant d’enregistrer.
                </p>
              )}
              {unassigned && (
                <p role="alert" className="text-xs text-amber-700">
                  Un fichier n’est affecté à aucun stagiaire.
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRows([]);
                    setSplitMode(false);
                  }}
                  disabled={pending}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Tout retirer
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={blocked}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Enregistrement…
                    </>
                  ) : (
                    <>
                      Enregistrer {assignedCount} fichier{assignedCount > 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
