'use client';

/**
 * Le suivi commercial d'un lead du stand, sur sa fiche : le script du coup de
 * fil J+1, et les deux relances écrites J+4 / J+10.
 *
 * Composant CLIENT parce qu'il déclenche des envois — mais les brouillons sont
 * calculés côté serveur et passés en props : la copie commerciale reste dans un
 * module pur et testable (`lib/diagnostic/relances.ts`), pas dans un composant.
 *
 * RIEN NE PART SANS CLIC. Le texte est montré en entier AVANT l'envoi — un
 * bouton « envoyer » qui n'affiche pas ce qu'il envoie finit toujours par
 * envoyer autre chose que ce qu'on croyait. Et le prospect a consenti à être
 * rappelé, pas à recevoir une séquence automatique.
 */

import { useState, useTransition } from 'react';
import { Loader2, Send, Phone, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { envoyerRelanceDiagnostic } from '@/server/actions/diagnostic-relances';
import type { EtapeRelance } from '@/lib/diagnostic/relances';

export interface BrouillonRelance {
  etape: EtapeRelance;
  libelle: string;
  subject: string;
  text: string;
  /** Déjà envoyée : trace trouvée dans l'historique du lead. */
  dejaEnvoyee: boolean;
}

export function SuiviStandPanel({
  leadId,
  script,
  brouillons,
  email,
}: {
  leadId: string;
  script: string;
  brouillons: BrouillonRelance[];
  email: string | null;
}) {
  return (
    <section className="border-t border-border pt-6 space-y-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
        Suivi du stand
      </div>

      <ScriptAppel script={script} />

      <div className="space-y-3">
        {brouillons.map((b) => (
          <CarteRelance key={b.etape} leadId={leadId} brouillon={b} email={email} />
        ))}
      </div>
    </section>
  );
}

function ScriptAppel({ script }: { script: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(script);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      toast.error('Copie impossible — sélectionnez le texte à la main.');
    }
  }

  return (
    <article className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Phone className="h-3.5 w-3.5 text-primary" />
          J+1 — script d'appel
        </div>
        <button
          type="button"
          onClick={copier}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs hover:bg-muted/40"
        >
          {copie ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="text-sm whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
        {script}
      </pre>
    </article>
  );
}

function CarteRelance({
  leadId,
  brouillon,
  email,
}: {
  leadId: string;
  brouillon: BrouillonRelance;
  email: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ouvert, setOuvert] = useState(false);

  function envoyer() {
    startTransition(async () => {
      const r = await envoyerRelanceDiagnostic(leadId, brouillon.etape);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Relance envoyée à ${r.destinataire}`);
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{brouillon.libelle}</div>
        <div className="flex items-center gap-2">
          {brouillon.dejaEnvoyee && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-800 bg-emerald-50 rounded-md px-2 py-1">
              <Check className="h-3 w-3" />
              déjà envoyée
            </span>
          )}
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted/40"
          >
            {ouvert ? 'Masquer' : 'Voir le brouillon'}
          </button>
          <button
            type="button"
            onClick={envoyer}
            disabled={pending || !email}
            title={email ? undefined : 'Ce lead n’a pas d’adresse email'}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {brouillon.dejaEnvoyee ? 'Renvoyer' : 'Envoyer'}
          </button>
        </div>
      </div>

      {ouvert && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="text-xs text-muted-foreground mb-1">
            Objet : <span className="text-slate-700">{brouillon.subject}</span>
          </div>
          <pre className="text-sm whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
            {brouillon.text}
          </pre>
        </div>
      )}
    </article>
  );
}
