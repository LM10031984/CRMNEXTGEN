'use client';

/**
 * Diagnostic express du stand — 25 ans du MLS.
 *
 * Contraintes de terrain qui expliquent chaque choix visuel :
 *  - rempli DEBOUT, sur téléphone, dans le bruit → une question par écran,
 *    cibles tactiles hautes (min-h-[64px]), aucune saisie libre avant la fin ;
 *  - le wifi d'une soirée d'anniversaire n'est pas fiable → le résultat est
 *    calculé ICI, par le module pur `diagnostiquer()`. Zéro appel réseau entre
 *    la première question et l'écran de résultat ;
 *  - 90 secondes montre en main → pas d'écran d'accueil à lire, la question 1
 *    est immédiatement à l'écran, et un clic suffit pour avancer.
 */

import { useMemo, useState, useTransition } from 'react';
import { ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react';
import { QUESTIONS, PROBLEMATIQUES } from '@/lib/diagnostic/questions';
import { diagnostiquer } from '@/lib/diagnostic/scoring';
import { soumettreDiagnostic } from '@/server/actions/diagnostic-public';
import { cn } from '@/lib/utils';

type Etape = 'questions' | 'resultat' | 'envoye';

export function DiagnosticForm() {
  const [etape, setEtape] = useState<Etape>('questions');
  const [index, setIndex] = useState(0);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    rgpdAccepted: false,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, demarrer] = useTransition();

  const resultat = useMemo(() => diagnostiquer(reponses), [reponses]);
  const question = QUESTIONS[index];

  function repondre(valeur: string) {
    const suivantes = { ...reponses, [question!.id]: valeur };
    setReponses(suivantes);
    if (index + 1 < QUESTIONS.length) {
      setIndex(index + 1);
    } else {
      setEtape('resultat');
    }
  }

  function reculer() {
    if (index > 0) setIndex(index - 1);
  }

  function envoyer() {
    setErreur(null);
    demarrer(async () => {
      const r = await soumettreDiagnostic({ reponses, contact });
      if (r.ok) setEtape('envoye');
      else setErreur(r.error);
    });
  }

  if (etape === 'envoye') {
    return <EcranMerci prenom={contact.firstName} />;
  }

  if (etape === 'resultat') {
    return (
      <EcranResultat
        dominante={resultat.dominante}
        secondaire={resultat.secondaire}
        contact={contact}
        setContact={setContact}
        erreur={erreur}
        pending={pending}
        onEnvoyer={envoyer}
      />
    );
  }

  const progression = Math.round((index / QUESTIONS.length) * 100);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={reculer}
          disabled={index === 0}
          aria-label="Question précédente"
          className="h-10 w-10 shrink-0 rounded-full border border-border inline-flex items-center justify-center disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progression}%` }}
            />
          </div>
        </div>
        <div className="text-sm font-medium text-muted-foreground tabular-nums shrink-0">
          {index + 1}/{QUESTIONS.length}
        </div>
      </div>

      <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-1">{question!.label}</h2>
      {question!.aide ? (
        <p className="text-sm text-muted-foreground mb-5">{question!.aide}</p>
      ) : (
        <div className="mb-5" />
      )}

      <div className="grid gap-3">
        {question!.choix.map((choix) => {
          const actif = reponses[question!.id] === choix.value;
          return (
            <button
              key={choix.value}
              type="button"
              onClick={() => repondre(choix.value)}
              className={cn(
                'w-full min-h-[64px] px-5 py-4 rounded-xl border text-left text-base font-medium',
                'transition-colors active:scale-[0.99]',
                actif
                  ? 'border-primary bg-primary-50 text-primary-900'
                  : 'border-border bg-white hover:border-primary/50',
              )}
            >
              {choix.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EcranResultat({
  dominante,
  secondaire,
  contact,
  setContact,
  erreur,
  pending,
  onEnvoyer,
}: {
  dominante: keyof typeof PROBLEMATIQUES;
  secondaire: keyof typeof PROBLEMATIQUES | null;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    rgpdAccepted: boolean;
  };
  setContact: (c: typeof contact) => void;
  erreur: string | null;
  pending: boolean;
  onEnvoyer: () => void;
}) {
  const p = PROBLEMATIQUES[dominante];
  const s = secondaire ? PROBLEMATIQUES[secondaire] : null;
  const complet =
    contact.firstName.trim() !== '' &&
    contact.lastName.trim() !== '' &&
    contact.email.trim() !== '' &&
    contact.rgpdAccepted;

  return (
    <div>
      <div className="rounded-2xl border border-primary/30 bg-primary-50/60 p-6 mb-6">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-primary-800 mb-3">
          <Sparkles className="h-3.5 w-3.5" /> Votre priorité
        </div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-2">{p.titre}</h2>
        <p className="text-sm text-slate-700">{p.accroche}</p>
        <p className="text-sm text-slate-700 mt-3">
          <span className="font-medium">La journée qu'on vous propose : </span>
          {p.axePedagogique}
        </p>
        {s ? (
          <p className="text-xs text-muted-foreground mt-4">
            En prolongement, un second axe ressort : « {s.titre} ».
          </p>
        ) : null}
      </div>

      <h3 className="font-semibold mb-1">On vous envoie votre programme</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Un programme construit sur cette priorité, à votre nom. Vous le recevez par email.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Champ
          label="Prénom"
          value={contact.firstName}
          onChange={(v) => setContact({ ...contact, firstName: v })}
          autoComplete="given-name"
        />
        <Champ
          label="Nom"
          value={contact.lastName}
          onChange={(v) => setContact({ ...contact, lastName: v })}
          autoComplete="family-name"
        />
        <div className="sm:col-span-2">
          <Champ
            label="Email"
            type="email"
            inputMode="email"
            value={contact.email}
            onChange={(v) => setContact({ ...contact, email: v })}
            autoComplete="email"
          />
        </div>
        <div className="sm:col-span-2">
          <Champ
            label="Téléphone (facultatif)"
            type="tel"
            inputMode="tel"
            value={contact.phone}
            onChange={(v) => setContact({ ...contact, phone: v })}
            autoComplete="tel"
          />
        </div>
      </div>

      <label className="flex items-start gap-3 mt-5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={contact.rgpdAccepted}
          onChange={(e) => setContact({ ...contact, rgpdAccepted: e.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-border"
        />
        <span className="text-slate-700">
          J'accepte que Start Academy m'envoie ce programme et me recontacte à ce sujet. Mes
          données sont hébergées dans l'Union européenne et ne sont transmises à personne d'autre.
        </span>
      </label>

      {erreur ? <p className="text-sm text-red-600 mt-4">{erreur}</p> : null}

      <button
        type="button"
        onClick={onEnvoyer}
        disabled={!complet || pending}
        className={cn(
          'w-full mt-5 min-h-[56px] rounded-xl bg-primary text-white font-semibold text-base',
          'inline-flex items-center justify-center gap-2 disabled:opacity-40',
        )}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Recevoir mon programme
      </button>
    </div>
  );
}

function EcranMerci({ prenom }: { prenom: string }) {
  return (
    <div className="text-center py-10">
      <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center mb-4">
        <Check className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold tracking-tight mb-2">
        C'est noté{prenom ? `, ${prenom}` : ''}.
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Votre programme part par email. Passez nous voir sur le stand si vous voulez en parler tout
        de suite.
      </p>
    </div>
  );
}

function Champ({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'email' | 'tel' | 'text';
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[52px] px-4 rounded-xl border border-border bg-white text-base focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}
