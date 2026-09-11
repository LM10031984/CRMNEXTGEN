'use client';

/**
 * BUG-19 + audit 2026-05-22 — Picker inline pour définir/changer le lieu d'une
 * session. Trois modes :
 *  - rechercher puis sélectionner un Location existant (combobox filtrante)
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

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, MapPin, Pencil, Plus, Search, X } from 'lucide-react';
import {
  listLocations,
  updateSessionLocation,
  createLocationAndAttachToSession,
  updateLocationDetails,
} from '@/server/actions/sessions';
import { mentionsLieuManquantes } from '@/lib/locations/format-lieu';
import { filtrerLieux } from '@/lib/locations/filtrer-lieux';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

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
  // Recherche : 59 lieux en base au 11/09/2026, le déroulé natif était
  // devenu impraticable (« la petite loupe », Laurent 11/09).
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [surligne, setSurligne] = useState(0);
  const blocRecherche = useRef<HTMLDivElement>(null);
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

  const resultats = useMemo(() => filtrerLieux(locations, recherche), [locations, recherche]);

  // Un clic hors du bloc referme la liste sans rien choisir.
  useEffect(() => {
    if (!ouvert) return;
    function auClic(e: MouseEvent) {
      if (!blocRecherche.current?.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener('mousedown', auClic);
    return () => document.removeEventListener('mousedown', auClic);
  }, [ouvert]);

  function libelle(l: LocationLite): string {
    const ville = champAdresse(l.address, 'city');
    return `${l.name}${ville ? ` — ${ville}` : ''}`;
  }

  function choisir(l: LocationLite) {
    setSelected(l.id);
    setRecherche(libelle(l));
    setOuvert(false);
  }

  /** Flèches pour parcourir, Entrée pour choisir, Échap pour refermer. */
  function auClavier(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!ouvert) {
        setOuvert(true);
        return;
      }
      const pas = e.key === 'ArrowDown' ? 1 : -1;
      setSurligne((i) => (resultats.length === 0 ? 0 : (i + pas + resultats.length) % resultats.length));
      return;
    }
    if (e.key === 'Enter') {
      const cible = resultats[surligne];
      if (ouvert && cible) {
        e.preventDefault();
        choisir(cible);
      }
      return;
    }
    if (e.key === 'Escape') setOuvert(false);
  }

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
            <div ref={blocRecherche} className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                role="combobox"
                aria-expanded={ouvert}
                aria-controls="liste-lieux"
                aria-autocomplete="list"
                autoComplete="off"
                value={recherche}
                disabled={pending}
                placeholder="Rechercher un lieu (nom, ville, code postal…)"
                onChange={(e) => {
                  setRecherche(e.target.value);
                  // Taper invalide le choix précédent : on ne veut pas
                  // « Définir » un lieu qui n'est plus celui affiché.
                  setSelected('');
                  setSurligne(0);
                  setOuvert(true);
                }}
                onFocus={() => setOuvert(true)}
                onKeyDown={auClavier}
                className="h-9 w-72 rounded-md border border-border bg-white pl-7 pr-7 text-sm"
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => {
                    setRecherche('');
                    setSelected('');
                    setOuvert(true);
                  }}
                  aria-label="Effacer la recherche"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {ouvert && (
                <ul
                  id="liste-lieux"
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-64 w-96 max-w-[80vw] overflow-y-auto rounded-md border border-border bg-white py-1 shadow-lg"
                >
                  {resultats.length === 0 ? (
                    <li className="px-2 py-1.5 text-xs text-muted-foreground">
                      Aucun lieu ne correspond — utilisez « Nouveau lieu ».
                    </li>
                  ) : (
                    resultats.map((l, i) => {
                      const ville = champAdresse(l.address, 'city');
                      const cp = champAdresse(l.address, 'postalCode');
                      // ⚠ = lieu incomplet : sélectionnable, mais à compléter
                      // avant de générer le pack.
                      const incomplet = mentionsLieuManquantes(l).length > 0;
                      return (
                        <li key={l.id} role="option" aria-selected={l.id === selected}>
                          <button
                            type="button"
                            // mousedown, pas click : le blur de l'input
                            // refermerait la liste avant que le clic n'arrive.
                            onMouseDown={(e) => {
                              e.preventDefault();
                              choisir(l);
                            }}
                            onMouseEnter={() => setSurligne(i)}
                            className={cn(
                              'flex w-full flex-col items-start px-2 py-1.5 text-left text-sm hover:bg-muted',
                              i === surligne && 'bg-muted',
                            )}
                          >
                            <span className="font-medium text-foreground">
                              {incomplet && (
                                <span title="Lieu incomplet — à compléter avant le pack de clôture">⚠ </span>
                              )}
                              {l.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {[l.legalName, [cp, ville].filter(Boolean).join(' ')]
                                .filter(Boolean)
                                .join(' · ') || 'Adresse à compléter'}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
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
