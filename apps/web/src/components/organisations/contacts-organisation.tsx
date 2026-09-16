'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Pencil, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  createOrganizationContact,
  updateOrganizationContact,
  deleteOrganizationContact,
} from '@/server/actions/crud-edits';

/**
 * Les CONTACTS d'une organisation — la section qui manquait.
 *
 * POURQUOI ELLE EXISTE. Le bloc « Responsable — signe les conventions » envoie
 * l'admin « renseigner son adresse sur le contact qui porte ce nom ». Jusqu'ici
 * l'application n'offrait aucun moyen de le faire : la fiche AFFICHAIT les
 * contacts sans jamais permettre d'en créer un. Le message décrivait donc un
 * geste impossible.
 *
 * ⚠ LE NOM EST CE QUI COMPTE. `resoudreEmailRepresentant` ne retient que le
 * contact dont le nom correspond à `representative` — pas de repli sur un autre
 * contact, même joignable, parce qu'un lien de signature envoyé chez quelqu'un
 * d'autre ferait figurer SON email et SON IP dans le certificat. D'où le
 * pré-remplissage depuis `representative` à la création : c'est le geste juste
 * par défaut, plutôt qu'une saisie libre qui ratera d'un caractère.
 *
 * Le rapprochement ignorant la casse, les accents ET l'ordre des mots
 * (`clefDeNom`), découper « Jilbert Nicolas » en prénom/nom dans un sens ou
 * dans l'autre donne le même résultat — d'où l'indication sous le champ.
 */

export interface ContactAffiche {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  function: string | null;
  isPrimary: boolean;
}

interface Props {
  organizationId: string;
  contacts: ContactAffiche[];
  /** `Organization.representative` — sert à pré-remplir le premier contact. */
  representative: string | null;
}

interface Brouillon {
  contactId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fonction: string;
  isPrimary: boolean;
}

/** « Jilbert Nicolas » → prénom « Jilbert », nom « Nicolas ». */
function decouperNom(nom: string | null): { firstName: string; lastName: string } {
  const mots = (nom ?? '').trim().split(/\s+/).filter(Boolean);
  const premier = mots[0] ?? '';
  if (mots.length <= 1) return { firstName: premier, lastName: '' };
  return { firstName: premier, lastName: mots.slice(1).join(' ') };
}

const CHAMP_CLS = 'w-full px-3 py-2 border border-border rounded-lg text-sm';
const LABEL_CLS = 'block text-xs font-medium text-muted-foreground mb-1';

export function ContactsOrganisation({ organizationId, contacts, representative }: Props) {
  const router = useRouter();
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Contact dont la suppression attend un second clic de confirmation. */
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  function ouvrirCreation() {
    const { firstName, lastName } = decouperNom(representative);
    setError(null);
    setBrouillon({
      contactId: null,
      firstName,
      lastName,
      email: '',
      phone: '',
      fonction: '',
      // Le premier contact d'une organisation est son principal par défaut :
      // sans `representative`, c'est lui que le moteur retiendra.
      isPrimary: contacts.length === 0,
    });
  }

  function ouvrirEdition(c: ContactAffiche) {
    setError(null);
    setBrouillon({
      contactId: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email ?? '',
      phone: c.phone ?? '',
      fonction: c.function ?? '',
      isPrimary: c.isPrimary,
    });
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (brouillon === null) return;
    setBusy(true);
    setError(null);
    try {
      const commun = {
        firstName: brouillon.firstName,
        lastName: brouillon.lastName,
        email: brouillon.email,
        phone: brouillon.phone,
        fonction: brouillon.fonction,
        isPrimary: brouillon.isPrimary,
      };
      const r =
        brouillon.contactId === null
          ? await createOrganizationContact({ organizationId, ...commun })
          : await updateOrganizationContact({ contactId: brouillon.contactId, ...commun });
      if (!r.ok) {
        setError(r.error ?? 'Erreur inconnue.');
        return;
      }
      toast.success(brouillon.contactId === null ? 'Contact créé' : 'Contact modifié');
      setBrouillon(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function supprimer(c: ContactAffiche) {
    // Pas de `confirm()` natif : il bloque la page et n'est pas stylable. Deux
    // clics sur le même bouton suffisent à écarter le geste accidentel.
    if (aSupprimer !== c.id) {
      setASupprimer(c.id);
      return;
    }
    setBusy(true);
    try {
      const r = await deleteOrganizationContact({ contactId: c.id });
      if (!r.ok) {
        toast.error(r.error ?? 'Suppression impossible.');
        return;
      }
      toast.success('Contact supprimé');
      setASupprimer(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Contacts
        </h2>
        <button
          type="button"
          onClick={ouvrirCreation}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted text-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Ajouter un contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun contact.{' '}
          {representative
            ? `Ajoutez « ${representative} » avec son adresse email pour que les conventions puissent partir en signature.`
            : 'Sans contact ni responsable, aucune convention ne peut partir en signature.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {c.firstName} {c.lastName}
                  {c.isPrimary && (
                    <span
                      title="Contact principal"
                      className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                    >
                      <Star className="h-3 w-3" aria-hidden="true" />
                      principal
                    </span>
                  )}
                </p>
                {c.function && <p className="text-xs text-muted-foreground">{c.function}</p>}
                <p className="text-xs text-muted-foreground break-all">
                  {c.email ?? <span className="text-red-600">email manquant</span>}
                  {c.phone ? ` — ${c.phone}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => ouvrirEdition(c)}
                  aria-label={`Modifier ${c.firstName} ${c.lastName}`}
                  className="p-1.5 rounded hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void supprimer(c)}
                  disabled={busy}
                  aria-label={`Supprimer ${c.firstName} ${c.lastName}`}
                  className={
                    aSupprimer === c.id
                      ? 'px-2 py-1 rounded text-xs bg-red-600 text-white'
                      : 'p-1.5 rounded hover:bg-red-50 text-red-600'
                  }
                >
                  {aSupprimer === c.id ? (
                    'Confirmer'
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {brouillon !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && setBrouillon(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-4">
              {brouillon.contactId === null ? 'Ajouter un contact' : 'Modifier le contact'}
            </h3>
            <form onSubmit={enregistrer} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="contact-firstName" className={LABEL_CLS}>
                    Prénom<span className="text-red-600 ml-0.5">*</span>
                  </label>
                  <input
                    id="contact-firstName"
                    value={brouillon.firstName}
                    onChange={(e) => setBrouillon({ ...brouillon, firstName: e.target.value })}
                    required
                    className={CHAMP_CLS}
                  />
                </div>
                <div>
                  <label htmlFor="contact-lastName" className={LABEL_CLS}>
                    Nom<span className="text-red-600 ml-0.5">*</span>
                  </label>
                  <input
                    id="contact-lastName"
                    value={brouillon.lastName}
                    onChange={(e) => setBrouillon({ ...brouillon, lastName: e.target.value })}
                    required
                    className={CHAMP_CLS}
                  />
                </div>
              </div>
              {representative && (
                <p className="text-xs text-muted-foreground">
                  Responsable de cette organisation : <strong>{representative}</strong>. Le
                  rapprochement ignore la casse, les accents et l’ordre des mots — prénom et nom
                  peuvent être saisis dans l’ordre qui vous arrange.
                </p>
              )}
              <div>
                <label htmlFor="contact-email" className={LABEL_CLS}>
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={brouillon.email}
                  onChange={(e) => setBrouillon({ ...brouillon, email: e.target.value })}
                  placeholder="prenom.nom@exemple.fr"
                  className={CHAMP_CLS}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Sans elle, aucune convention ne part en signature pour cette organisation.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="contact-phone" className={LABEL_CLS}>
                    Téléphone
                  </label>
                  <input
                    id="contact-phone"
                    value={brouillon.phone}
                    onChange={(e) => setBrouillon({ ...brouillon, phone: e.target.value })}
                    className={CHAMP_CLS}
                  />
                </div>
                <div>
                  <label htmlFor="contact-fonction" className={LABEL_CLS}>
                    Fonction
                  </label>
                  <input
                    id="contact-fonction"
                    value={brouillon.fonction}
                    onChange={(e) => setBrouillon({ ...brouillon, fonction: e.target.value })}
                    placeholder="Responsable d’agence"
                    className={CHAMP_CLS}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={brouillon.isPrimary}
                  onChange={(e) => setBrouillon({ ...brouillon, isPrimary: e.target.checked })}
                />
                Contact principal
              </label>
              <p className="text-xs text-muted-foreground -mt-1">
                Un seul par organisation : cocher ici décoche l’autre. C’est le contact retenu
                quand aucun responsable n’est nommé sur la fiche.
              </p>
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBrouillon(null)}
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
    </section>
  );
}
