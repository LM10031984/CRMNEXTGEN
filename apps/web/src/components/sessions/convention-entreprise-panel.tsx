'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Building2, FileSignature, FileText, Loader2, Check } from 'lucide-react';
import { generateConventionEntreprise } from '@/server/actions/convention-generator';

/**
 * Quick 260817-mm0 — « Convention entreprise » sur la fiche session.
 *
 * Comble le gap constaté en réel sur OPTIMMO (11 salariées, dossier OPCO EP) :
 * la convention au nom de l'entreprise commanditaire devait être produite hors
 * app par script pour être déposée sur le portail.
 *
 * Règle métier figée le 12/08 : payeur personne morale ⇒ UNE convention signée
 * par le chef d'entreprise pour tout le groupe, jamais une par salarié.
 * Générer ici remplace donc les conventions individuelles du groupe — c'est
 * annoncé explicitement dans l'UI pour que ce ne soit pas une surprise.
 *
 * Les commanditaires personnes physiques (auto-payeurs) ne sont PAS listés :
 * ils relèvent du contrat de formation individuel, chantier suivant.
 */
export interface CommanditaireGroupe {
  sponsorOrgId: string;
  sponsorName: string;
  participantCount: number;
  /** true si une convention groupe existe déjà pour ce commanditaire. */
  hasConvention: boolean;
  /**
   * Document de la convention groupe déjà générée, s'il existe.
   *
   * Sans ce lien (constat Laurent du 28/08), le panneau annonçait « convention
   * générée » sans jamais dire où la trouver : le PDF n'était accessible que
   * par la ligne « Convention » de chaque salarié dans l'onglet « Avant ».
   */
  conventionDocId?: string | null;
}

interface Props {
  sessionId: string;
  groupes: CommanditaireGroupe[];
}

export function ConventionEntreprisePanel({ sessionId, groupes }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Session 100 % auto-payeurs : rien à proposer ici.
  if (groupes.length === 0) return null;

  function generate(g: CommanditaireGroupe) {
    setPendingId(g.sponsorOrgId);
    startTransition(async () => {
      const res = await generateConventionEntreprise({
        sessionId,
        sponsorOrgId: g.sponsorOrgId,
      });
      setPendingId(null);
      if (res.ok) {
        toast.success(
          `Convention ${g.sponsorName} générée — ${res.count ?? g.participantCount} stagiaire(s) couvert(s).`,
        );
      } else {
        toast.error(res.error ?? 'Génération impossible');
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h2 className="font-semibold text-sm inline-flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Convention entreprise
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Une convention unique par entreprise commanditaire, signée par le chef
          d&apos;entreprise et couvrant tous ses salariés inscrits. Elle remplace
          les conventions individuelles de ces stagiaires.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {groupes.map((g) => {
          const busy = pending && pendingId === g.sponsorOrgId;
          return (
            <li key={g.sponsorOrgId} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{g.sponsorName}</div>
                <div className="text-xs text-muted-foreground">
                  {g.participantCount} participant{g.participantCount > 1 ? 's' : ''}
                  {g.hasConvention && (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
                      <Check className="h-3 w-3" /> convention générée
                    </span>
                  )}
                  {g.conventionDocId && (
                    <a
                      href={`/api/documents/${g.conventionDocId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:no-underline"
                    >
                      <FileText className="h-3 w-3" /> Ouvrir le PDF
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => generate(g)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Génération…
                  </>
                ) : (
                  <>
                    <FileSignature className="h-4 w-4" />
                    {g.hasConvention ? 'Régénérer' : 'Générer la convention'}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
