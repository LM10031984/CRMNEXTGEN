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
 *    est immédiatement à l'écran, et un clic suffit pour avancer ;
 *  - le diagnostic tourne AUSSI sur l'ordinateur du stand, en continu → l'écran
 *    de remerciement se réarme tout seul pour le visiteur suivant.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ArrowLeft, Check, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import {
  QUESTIONS,
  PROBLEMATIQUES,
  RAPPEL_CHOIX,
  RAPPEL_QUESTION,
  type RappelValue,
} from '@/lib/diagnostic/questions';
import { diagnostiquer } from '@/lib/diagnostic/scoring';
import { choisirJournee } from '@/lib/diagnostic/catalogue-map';
import { soumettreDiagnostic } from '@/server/actions/diagnostic-public';
import { cn } from '@/lib/utils';

type Etape = 'questions' | 'resultat' | 'envoye';

/** Journée du catalogue, chargée côté serveur et passée au navigateur. */
export interface JourneeInfo {
  code: string;
  title: string;
  dureeHeures: number;
}

interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  rgpdAccepted: boolean;
}

const CONTACT_VIDE: Contact = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  rgpdAccepted: false,
};

/** Secondes avant que le stand se réarme tout seul pour le visiteur suivant. */
const RETOUR_AUTO_S = 45;

export function DiagnosticForm({ journees }: { journees: JourneeInfo[] }) {
  const [etape, setEtape] = useState<Etape>('questions');
  const [index, setIndex] = useState(0);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [rappel, setRappel] = useState<RappelValue | null>(null);
  const [contact, setContact] = useState<Contact>(CONTACT_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, demarrer] = useTransition();

  const resultat = useMemo(() => diagnostiquer(reponses), [reponses]);

  // La vraie journée du catalogue, résolue DANS le navigateur à partir des
  // produits chargés au rendu de la page. Zéro appel réseau : l'écran de
  // résultat s'affiche même si le wifi du lieu est tombé.
  const journee = useMemo(() => {
    const sel = choisirJournee(resultat.dominante, reponses);
    if (!sel) return null;
    const dispo = new Map(journees.map((j) => [j.code, j]));
    return dispo.get(sel.code) ?? journees[0] ?? null;
  }, [resultat.dominante, reponses, journees]);

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

  /** Remise à zéro COMPLÈTE — le visiteur suivant ne doit rien voir du précédent. */
  const recommencer = useCallback(() => {
    setEtape('questions');
    setIndex(0);
    setReponses({});
    setRappel(null);
    setContact(CONTACT_VIDE);
    setErreur(null);
  }, []);

  // Un visiteur qui repose le téléphone (ou s'éloigne de l'ordinateur du stand)
  // au milieu du questionnaire laisse ses réponses à l'écran : le suivant
  // reprendrait le diagnostic de quelqu'un d'autre. Au bout de 45 s sans le
  // moindre tap, on repart de la question 1.
  //
  // Volontairement PAS actif sur l'écran de résultat : c'est là qu'on saisit son
  // email, et effacer une saisie en cours serait pire que le mal. Cet écran-là
  // est réarmé par l'envoi, ou par le bouton « Nouveau diagnostic ».
  const enCoursDeQuestions = etape === 'questions' && index > 0;
  useEffect(() => {
    if (!enCoursDeQuestions) return;
    const t = setTimeout(recommencer, RETOUR_AUTO_S * 1000);
    return () => clearTimeout(t);
  }, [enCoursDeQuestions, index, recommencer]);

  function envoyer() {
    setErreur(null);
    demarrer(async () => {
      const r = await soumettreDiagnostic({ reponses, contact, rappel });
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      setEtape('envoye');

      // Le prospect déclenche SON PROPRE email, depuis son téléphone.
      //
      // Pourquoi ici et pas dans l'action : assembler le programme sur mesure
      // prend ~28 s (appel au modèle). On ne fait pas attendre ça à quelqu'un
      // debout devant un stand. L'écran de remerciement est DÉJÀ affiché quand
      // cette requête part — elle ne bloque rien et son échec ne casse rien :
      // la soumission reste en file, le rattrapage la reprendra.
      //
      // `keepalive` : la requête survit à la fermeture de l'onglet ou au
      // verrouillage du téléphone dans la foulée.
      void fetch('/api/diagnostic/traiter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: r.submissionId }),
        keepalive: true,
      }).catch(() => {
        /* silence volontaire : le filet de rattrapage prend le relais */
      });
    });
  }

  if (etape === 'envoye') {
    return <EcranMerci prenom={contact.firstName} onRecommencer={recommencer} />;
  }

  if (etape === 'resultat') {
    return (
      <EcranResultat
        dominante={resultat.dominante}
        secondaire={resultat.secondaire}
        journee={journee}
        rappel={rappel}
        setRappel={setRappel}
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
  journee,
  rappel,
  setRappel,
  contact,
  setContact,
  erreur,
  pending,
  onEnvoyer,
}: {
  dominante: keyof typeof PROBLEMATIQUES;
  secondaire: keyof typeof PROBLEMATIQUES | null;
  journee: JourneeInfo | null;
  rappel: RappelValue | null;
  setRappel: (r: RappelValue) => void;
  contact: Contact;
  setContact: (c: Contact) => void;
  erreur: string | null;
  pending: boolean;
  onEnvoyer: () => void;
}) {
  const p = PROBLEMATIQUES[dominante];
  const s = secondaire ? PROBLEMATIQUES[secondaire] : null;

  // Un lead « chaud » sans numéro est un lead mort : dès qu'il demande à être
  // rappelé cette semaine, le téléphone n'est plus facultatif. Le même contrôle
  // existe côté serveur (Zod) — celui-ci n'est là que pour l'expliquer.
  const telObligatoire = rappel === 'CETTE_SEMAINE';
  const telManquant = telObligatoire && contact.phone.trim() === '';

  const complet =
    rappel !== null &&
    contact.firstName.trim() !== '' &&
    contact.lastName.trim() !== '' &&
    contact.email.trim() !== '' &&
    contact.rgpdAccepted &&
    !telManquant;

  return (
    <div>
      <div className="rounded-2xl border border-primary/30 bg-primary-50/60 p-6 mb-6">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-primary-800 mb-3">
          <Sparkles className="h-3.5 w-3.5" /> Votre priorité
        </div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-2">{p.titre}</h2>
        <p className="text-sm text-slate-700">{p.accroche}</p>
        {journee ? (
          <div className="mt-4 pt-4 border-t border-primary/20">
            <div className="text-xs font-medium text-primary-800 mb-1">
              La journée qu'on vous propose
            </div>
            <div className="font-semibold text-slate-900">{journee.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {journee.dureeHeures} h — une journée
            </div>
          </div>
        ) : null}
        {s ? (
          <p className="text-xs text-muted-foreground mt-4">
            En prolongement, un second axe ressort : « {s.titre} ».
          </p>
        ) : null}
      </div>

      {/* L'engagement de rappel, AVANT le formulaire : un seul tap, aucune
          saisie. C'est ce qui transforme l'appel du lendemain en rendez-vous
          tenu plutôt qu'en démarchage. */}
      <h3 className="font-semibold mb-3">{RAPPEL_QUESTION}</h3>
      <div className="grid gap-3">
        {RAPPEL_CHOIX.map((choix) => {
          const actif = rappel === choix.value;
          return (
            <button
              key={choix.value}
              type="button"
              aria-pressed={actif}
              onClick={() => setRappel(choix.value)}
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

      <h3 className="font-semibold mt-8 mb-1">On vous envoie le programme</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Le programme détaillé de cette journée, avec ce qu'elle change pour vous. Vous le
        recevez par email dans quelques minutes.
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
            label={telObligatoire ? 'Téléphone' : 'Téléphone (facultatif)'}
            type="tel"
            inputMode="tel"
            value={contact.phone}
            onChange={(v) => setContact({ ...contact, phone: v })}
            autoComplete="tel"
            aide={
              telObligatoire
                ? 'On vous rappelle cette semaine — il nous faut un numéro.'
                : undefined
            }
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
        {/*
          « Transmises à personne d'autre » était faux : envoyer cet email, c'est
          par construction passer par des sous-traitants (base, hébergement,
          assemblage du programme, SMTP) — ils sont listés au Traitement 9 du
          registre. Ce qu'on peut promettre sans mentir, c'est ce que le prospect
          craint vraiment un soir de salon : que son email finisse revendu ou sur
          le stand d'à côté. C'est vrai, et c'est vérifiable.
        */}
        <span className="text-slate-700">
          J'accepte que Start Academy m'envoie ce programme et me recontacte à ce sujet. Mes
          données sont hébergées dans l'Union européenne, jamais revendues ni communiquées à un
          autre exposant, et effaçables sur simple demande.
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

function EcranMerci({ prenom, onRecommencer }: { prenom: string; onRecommencer: () => void }) {
  // Le stand tourne en continu, y compris sur l'ordinateur posé sur la table.
  // Sans ce retour automatique, il faut recharger la page entre deux visiteurs —
  // et le visiteur suivant voit le prénom du précédent.
  const [restant, setRestant] = useState(RETOUR_AUTO_S);

  useEffect(() => {
    const tic = setInterval(() => setRestant((s) => s - 1), 1000);
    const fin = setTimeout(onRecommencer, RETOUR_AUTO_S * 1000);
    return () => {
      clearInterval(tic);
      clearTimeout(fin);
    };
  }, [onRecommencer]);

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

      <button
        type="button"
        onClick={onRecommencer}
        className="mt-8 min-h-[56px] px-6 rounded-xl border border-primary text-primary font-semibold inline-flex items-center justify-center gap-2"
      >
        <RotateCcw className="h-4 w-4" />
        Nouveau diagnostic
      </button>
      <p className="text-xs text-muted-foreground mt-3 tabular-nums">
        Retour automatique dans {Math.max(0, restant)} s
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
  aide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'email' | 'tel' | 'text';
  autoComplete?: string;
  aide?: string;
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
      {aide ? <span className="block text-xs text-primary-800 mt-1.5">{aide}</span> : null}
    </label>
  );
}
