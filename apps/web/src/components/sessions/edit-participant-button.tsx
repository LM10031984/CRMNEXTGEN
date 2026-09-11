'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { updateParticipant } from '@/server/actions/sessions';
import {
  changerFinanceurInscription,
  listerFinanceursPossibles,
  type FinanceurPropose,
} from '@/server/actions/participant-sponsor';
import {
  CHAMP_FINANCEUR,
  PARAM_CHAMP,
  PARAM_INSCRIPTION,
  queryApresEdition,
} from '@/lib/sessions/lien-corriger-financeur';

interface EditParticipantButtonProps {
  participantId: string;
  currentPriceHT: number;
  currentStatus: string;
  currentFinancingRequestDate?: Date | string | null;
  currentFinancingMode?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'PRE_ENROLLED', label: 'Pré-inscrit' },
  { value: 'VALIDATED', label: 'Validé (financement OK)' },
  { value: 'IN_PROGRESS', label: 'En formation' },
  { value: 'COMPLETED', label: 'Terminé' },
  { value: 'CANCELLED', label: 'Annulé' },
] as const;

// Miroir exact du wizard session (étape 3) — même libellés, même ordre.
const FINANCING_OPTIONS = [
  { value: '', label: '— Mode de financement —' },
  { value: 'OPCO', label: 'OPCO' },
  { value: 'CPF', label: 'CPF' },
  { value: 'ENTREPRISE', label: 'Entreprise (paie directement)' },
  { value: 'AUTOFINANCEMENT', label: 'Autofinancement' },
  { value: 'POLE_EMPLOI', label: 'Pôle Emploi' },
  { value: 'AUTRE', label: 'Autre' },
] as const;

/**
 * ⚠ DEUX CHAMPS VOISINS QUI NE DISENT PAS LA MÊME CHOSE (Laurent, 11/09/2026).
 * Le MODE dit COMMENT l'inscription est financée ; le FINANCEUR dit PAR QUI elle
 * est portée. Sans ces deux phrases à l'écran, quelqu'un corrigera le mauvais
 * champ — et c'est le financeur, pas le mode, dont dépend le régime de signature
 * (`sponsorOrg.opcoCode`, cf. `lib/signature/participants-regime.ts`).
 */
const AIDE_MODE = "COMMENT l'inscription est financée (OPCO, CPF, entreprise, autofinancement…).";
const AIDE_FINANCEUR =
  "PAR QUI l'inscription est portée : l'organisation commanditaire, celle qui apparaît sur la " +
  'convention et dont dépend le régime de signature.';

function toIsoDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function EditParticipantButton({
  participantId,
  currentPriceHT,
  currentStatus,
  currentFinancingRequestDate,
  currentFinancingMode,
}: EditParticipantButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Ouverture pilotée par l'URL ────────────────────────────────────────────
  // Le lien « Corriger le financeur de l'inscription → » vit dans un AUTRE
  // onglet (bloc Signature de « Avant ») : un `useState` local ne franchit pas
  // cette distance. Cf. `@/lib/sessions/lien-corriger-financeur` pour la forme
  // d'URL publiée.
  const cibleUrl = searchParams?.get(PARAM_INSCRIPTION) ?? null;
  const ouvertParUrl = cibleUrl === participantId;
  const champEnEvidence = ouvertParUrl && searchParams?.get(PARAM_CHAMP) === CHAMP_FINANCEUR;

  const [openLocal, setOpenLocal] = useState(false);
  const open = openLocal || ouvertParUrl;

  const [priceHT, setPriceHT] = useState<string>(String(currentPriceHT));
  const [status, setStatus] = useState<string>(currentStatus);
  const [financingMode, setFinancingMode] = useState<string>(currentFinancingMode ?? '');
  const [financingRequestDate, setFinancingRequestDate] = useState<string>(
    toIsoDate(currentFinancingRequestDate),
  );

  // ── Financeur de l'inscription ────────────────────────────────────────────
  const [financeurs, setFinanceurs] = useState<FinanceurPropose[]>([]);
  const [financeurActuelId, setFinanceurActuelId] = useState<string | null>(null);
  const [financeurId, setFinanceurId] = useState<string>('');
  const [financeurIndispo, setFinanceurIndispo] = useState<string | null>(null);
  const [chargementFinanceurs, setChargementFinanceurs] = useState(false);
  const selectFinanceurRef = useRef<HTMLSelectElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le financeur courant est relu au SERVEUR à l'ouverture, jamais reçu en prop :
  // le formulaire peut s'ouvrir par URL, donc sans que la ligne correspondante
  // ait été rendue avec une donnée à jour.
  useEffect(() => {
    if (!open) return;
    let annule = false;
    setChargementFinanceurs(true);
    setFinanceurIndispo(null);
    listerFinanceursPossibles({ participantId })
      .then((r) => {
        if (annule) return;
        if (r.ok) {
          setFinanceurs(r.financeurs);
          setFinanceurActuelId(r.financeurActuelId);
          setFinanceurId(r.financeurActuelId ?? '');
        } else {
          // Rôle insuffisant (le champ est réservé ADMIN | MANAGER) : on ne rend
          // PAS un sélecteur que le serveur refusera — on dit pourquoi.
          setFinanceurIndispo(r.error);
        }
      })
      .catch((e: unknown) => {
        if (!annule) setFinanceurIndispo(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!annule) setChargementFinanceurs(false);
      });
    return () => {
      annule = true;
    };
  }, [open, participantId]);

  // Champ « en évidence » : focus une fois la liste chargée (avant, le <select>
  // n'existe pas encore).
  useEffect(() => {
    if (!champEnEvidence || chargementFinanceurs) return;
    const el = selectFinanceurRef.current;
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: 'center' });
  }, [champEnEvidence, chargementFinanceurs]);

  /**
   * Refermer : l'état local retombe, ET les paramètres d'URL du formulaire sont
   * effacés — sinon `?inscription=` rouvrirait la modale en boucle. On revient
   * par la même occasion sur l'onglet `?retour=` d'où l'on vient, que
   * l'enregistrement ait eu lieu ou non : l'utilisateur est reposé là où il a
   * cliqué.
   */
  const fermer = useCallback(() => {
    setOpenLocal(false);
    setError(null);
    if (!ouvertParUrl) return;
    const qs = queryApresEdition(new URLSearchParams(searchParams?.toString() ?? ''));
    router.replace((qs.length > 0 ? `${pathname}?${qs}` : pathname) as Route);
  }, [ouvertParUrl, pathname, router, searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const parsedPrice = parseFloat(priceHT.replace(',', '.'));
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Prix HT invalide.');
      setBusy(false);
      return;
    }

    try {
      // ⚠ LE FINANCEUR D'ABORD, ET IL PEUT TOUT ARRÊTER. L'action dédiée oppose
      // deux refus (dossier déjà parti chez le financeur, pièce signée). Enchaîner
      // `updateParticipant` malgré un refus enregistrerait la moitié du
      // formulaire en affichant une erreur : l'admin ne saurait plus ce qui a
      // été écrit.
      if (financeurId && financeurId !== financeurActuelId) {
        const rf = await changerFinanceurInscription({
          participantId,
          sponsorOrgId: financeurId,
        });
        if (!rf.ok) {
          setError(rf.error);
          setBusy(false);
          return;
        }
        setFinanceurActuelId(financeurId);
      }

      const r = await updateParticipant({
        participantId,
        priceHT: parsedPrice,
        enrollmentStatus: status as any,
        financingRequestDate: financingRequestDate || null,
        financingMode: (financingMode || null) as any,
      });
      if (r.ok) {
        toast.success(`Inscription mise à jour — ${parsedPrice.toFixed(2)} €`);
        fermer();
        router.refresh();
      } else {
        setError(r.error ?? 'Erreur inconnue.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const idMode = `mode-financement-${participantId}`;
  const idFinanceur = `financeur-inscription-${participantId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenLocal(true)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground"
        title="Modifier prix HT, statut et financeur"
      >
        <Pencil className="h-3 w-3" />
        Éditer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && fermer()}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-4">Modifier l&apos;inscription</h3>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Prix HT (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceHT}
                  onChange={(e) => setPriceHT(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="ex: 2000"
                  autoFocus={!champEnEvidence}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Statut d&apos;inscription
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor={idMode}
                  className="block text-xs font-medium text-muted-foreground mb-1"
                >
                  Mode de financement
                </label>
                <select
                  id={idMode}
                  value={financingMode}
                  onChange={(e) => setFinancingMode(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                >
                  {FINANCING_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">{AIDE_MODE}</p>
              </div>

              {/* ══ Financeur de l'inscription (décision Laurent 11/09/2026) ══
                  Jusqu'ici, une inscription rattachée à la mauvaise organisation
                  n'était corrigeable qu'en la supprimant et en la recréant. */}
              <div
                data-champ-en-evidence={champEnEvidence ? 'true' : undefined}
                className={
                  champEnEvidence
                    ? 'rounded-lg ring-2 ring-primary ring-offset-2 p-2 -m-2 bg-primary/5'
                    : undefined
                }
              >
                <label
                  htmlFor={idFinanceur}
                  className="block text-xs font-medium text-muted-foreground mb-1"
                >
                  Financeur de l&apos;inscription
                </label>
                {chargementFinanceurs ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Chargement des organisations…
                  </p>
                ) : financeurIndispo !== null ? (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    Financeur non modifiable ici : {financeurIndispo} (réservé aux rôles
                    Administrateur et Manager).
                  </p>
                ) : (
                  <>
                    <select
                      id={idFinanceur}
                      ref={selectFinanceurRef}
                      value={financeurId}
                      onChange={(e) => setFinanceurId(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                    >
                      <option value="">— Aucun financeur —</option>
                      {financeurs.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                          {f.opcoCode ? ` · ${f.opcoCode}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">{AIDE_FINANCEUR}</p>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Date de dépôt du dossier (AGEFICE / OPCO)
                </label>
                <input
                  type="date"
                  value={financingRequestDate}
                  onChange={(e) => setFinancingRequestDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Détermine l&apos;année à laquelle le budget AGEFICE est imputé. Vide = on prend la date de la session par défaut.
                </p>
              </div>
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => fermer()}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
