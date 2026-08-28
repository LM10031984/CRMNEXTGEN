'use client';

/**
 * BUG-19 + audit 2026-05-22 — Picker inline pour définir/changer le lieu d'une
 * session. Trois modes :
 *  - sélectionner un Location existant (select natif)
 *  - créer un nouveau Location à la volée (saisie libre)
 *  - compléter le Location déjà rattaché (mentions AGEFICE manquantes)
 *
 * find-or-create insensible à la casse côté server (`createLocationAndAttachToSession`)
 * pour éviter les doublons.
 *
 * AGEFICE 2026-08-28 — raison sociale, code postal et ville sont désormais
 * OBLIGATOIRES : sans elles, la feuille d'émargement est refusée en prise en
 * charge (« Le document Feuille(s) d'émargement est incomplet : raison sociale
 * du lieu de formation »). Le serveur applique la même règle, et le pack de
 * clôture reste bloqué tant que le lieu de la session est incomplet — d'où le
 * mode « compléter », seule porte de sortie pour les lieux créés avant cette
 * date (aucun n'a de raison sociale).
 */

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, MapPin, Pencil, Plus, X } from 'lucide-react';
import {
  listLocations,
  updateSessionLocation,
  createLocationAndAttachToSession,
  updateLocationDetails,
} from '@/server/actions/sessions';
import { mentionsLieuManquantes } from '@/lib/locations/format-lieu';
import { useRouter } from 'next/navigation';

interface LocationLite {
  id: string;
  name: string;
  legalName?: string | null;
  address: unknown;
}

interface Props {
  sessionId: string;
  /**
   * Lieu actuellement rattaché à la session, s'il y en a un. Fourni par la
   * fiche session pour proposer « Compléter ce lieu » quand il manque des
   * mentions AGEFICE.
   */
  currentLocation?: LocationLite | null;
}

function champAdresse(address: unknown, cle: string): string {
  if (address && typeof address === 'object') {
    const v = (address as Record<string, unknown>)[cle];
    if (typeof v === 'string') return v;
  }
  return '';
}

export function SessionLocationPicker({ sessionId, currentLocation }: Props) {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<'pick' | 'create' | 'edit'>('pick');
  const [newName, setNewName] = useState('');
  const [newLegalName, setNewLegalName] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newPostalCode, setNewPostalCode] = useState('');
  const [newCity, setNewCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const manquantesCourant = currentLocation
    ? mentionsLieuManquantes(currentLocation)
    : [];

  useEffect(() => {
    listLocations()
      .then((r) => setLocations(r as LocationLite[]))
      .finally(() => setLoading(false));
  }, []);

  function ouvrirEdition() {
    if (!currentLocation) return;
    setNewName(currentLocation.name);
    setNewLegalName(currentLocation.legalName ?? '');
    setNewStreet(champAdresse(currentLocation.address, 'street'));
    setNewPostalCode(champAdresse(currentLocation.address, 'postalCode'));
    setNewCity(champAdresse(currentLocation.address, 'city'));
    setMode('edit');
  }

  function reinitialiser() {
    setNewName('');
    setNewLegalName('');
    setNewStreet('');
    setNewPostalCode('');
    setNewCity('');
    setMode('pick');
  }

  function handleSave() {
    if (!selected) return;
    startTransition(async () => {
      const r = await updateSessionLocation({ sessionId, locationId: selected });
      if (r.ok) {
        toast.success('Lieu de formation défini');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleCreate() {
    if (!newName.trim()) {
      toast.error('Nom du lieu obligatoire');
      return;
    }
    startTransition(async () => {
      const r = await createLocationAndAttachToSession({
        sessionId,
        name: newName.trim(),
        legalName: newLegalName.trim() || null,
        street: newStreet.trim() || null,
        postalCode: newPostalCode.trim() || null,
        city: newCity.trim() || null,
      });
      if (r.ok) {
        toast.success('Nouveau lieu créé et défini');
        reinitialiser();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleUpdate() {
    if (!currentLocation) return;
    startTransition(async () => {
      const r = await updateLocationDetails({
        locationId: currentLocation.id,
        name: newName,
        legalName: newLegalName,
        street: newStreet,
        postalCode: newPostalCode,
        city: newCity,
      });
      if (r.ok) {
        toast.success('Lieu complété');
        reinitialiser();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground">
        <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Chargement…
      </div>
    );
  }

  if (mode === 'create' || mode === 'edit') {
    const edition = mode === 'edit';
    return (
      <div className="space-y-2 max-w-md">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">
            {edition ? `Compléter « ${currentLocation?.name} »` : 'Nouveau lieu'}
          </p>
          <button
            type="button"
            onClick={reinitialiser}
            disabled={pending}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Annuler
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Raison sociale, code postal et ville sont exigés par l’AGEFICE sur la
          feuille d’émargement.
        </p>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom du lieu (ex : Agence Nice Centre)"
          className="w-full h-9 rounded-md border border-border px-2 text-sm"
          autoFocus={!edition}
        />
        <input
          type="text"
          value={newLegalName}
          onChange={(e) => setNewLegalName(e.target.value)}
          placeholder="Raison sociale (ex : SARL L'Agence Signature)"
          className="w-full h-9 rounded-md border border-border px-2 text-sm"
          autoFocus={edition}
        />
        {edition && (
          <p className="text-xs text-muted-foreground">
            Nettoyez le nom et l’adresse si l’enseigne y figure déjà — elle
            serait répétée sur les documents.
          </p>
        )}
        <input
          type="text"
          value={newStreet}
          onChange={(e) => setNewStreet(e.target.value)}
          placeholder="Adresse (optionnel)"
          className="w-full h-9 rounded-md border border-border px-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={newPostalCode}
            onChange={(e) => setNewPostalCode(e.target.value)}
            placeholder="Code postal"
            className="w-28 h-9 rounded-md border border-border px-2 text-sm"
          />
          <input
            type="text"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            placeholder="Ville"
            className="flex-1 h-9 rounded-md border border-border px-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={edition ? handleUpdate : handleCreate}
          disabled={
            pending ||
            !newName.trim() ||
            !newLegalName.trim() ||
            !newPostalCode.trim() ||
            !newCity.trim()
          }
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {edition ? 'Enregistrer' : 'Créer et définir'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {manquantesCourant.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-orange-300 bg-orange-50 px-2 py-1.5">
          <p className="text-xs text-orange-800">
            <AlertTriangle className="inline h-3.5 w-3.5 mr-1 align-text-bottom" aria-hidden="true" />
            Lieu incomplet ({manquantesCourant.join(', ')}) — le pack de fin de
            formation est bloqué tant qu’il manque une mention.
          </p>
          <button
            type="button"
            onClick={ouvrirEdition}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Compléter
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {locations.length > 0 ? (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={pending}
              className="h-9 rounded-md border border-border px-2 text-sm bg-white"
            >
              <option value="">— Choisir un lieu existant —</option>
              {locations.map((l) => {
                const city = champAdresse(l.address, 'city');
                // ⚠ = lieu incomplet : sélectionnable, mais à compléter avant
                // de générer le pack.
                const incomplet = mentionsLieuManquantes(l).length > 0;
                return (
                  <option key={l.id} value={l.id}>
                    {incomplet ? '⚠ ' : ''}
                    {l.name}
                    {city ? ` — ${city}` : ''}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || !selected}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Définir
            </button>
            <span className="text-xs text-muted-foreground">ou</span>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aucun lieu enregistré pour l'instant.
          </p>
        )}
        <button
          type="button"
          onClick={() => setMode('create')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-dashed border-primary text-primary text-sm font-medium hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Nouveau lieu
        </button>
      </div>
    </div>
  );
}
