'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  FileSignature,
  FileText,
  Loader2,
  Check,
} from 'lucide-react';
import { generateConventionEntreprise } from '@/server/actions/convention-generator';
import { generateAnalyseBesoinEntreprise } from '@/server/actions/analyse-besoin-entreprise';
import { updateOrganization } from '@/server/actions/crud-edits';
import {
  blocagesPourDocument,
  type BlocageDocEntreprise,
} from '@/lib/docs/blocages-docs-entreprise';

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
   * Analyse des besoins d'ENTREPRISE déjà rendue (asset de niveau session).
   *
   * Même règle que la convention : le besoin analysé est celui de la structure
   * qui commande et qui paye, jamais celui d'un salarié pris isolément.
   */
  analyseAssetId?: string | null;
  /** Représentant légal connu — vide, il bloque les deux documents. */
  representant?: string | null;
  /**
   * Ce qui manque AVANT de générer (28/08). Calculé côté serveur par
   * `blocagesDocsEntreprise`, qui énonce les mêmes règles que les cœurs :
   * on l'apprenait jusqu'ici par un message d'erreur, après avoir cliqué et
   * attendu — et, pour l'analyse, après un appel IA payé pour rien.
   */
  blocages?: BlocageDocEntreprise[];
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
  const [analysePendingId, setAnalysePendingId] = useState<string | null>(null);
  const [analysePending, startAnalyse] = useTransition();
  // Saisie express du représentant, là où son absence bloque : pas d'aller-retour
  // vers la fiche entreprise pour un seul champ.
  const [saisieRepId, setSaisieRepId] = useState<string | null>(null);
  const [repValue, setRepValue] = useState('');
  const [repBusy, setRepBusy] = useState(false);

  async function enregistrerRepresentant(g: CommanditaireGroupe) {
    const nom = repValue.trim();
    if (!nom) return;
    setRepBusy(true);
    const r = await updateOrganization({ organizationId: g.sponsorOrgId, representative: nom });
    setRepBusy(false);
    if (r.ok) {
      setSaisieRepId(null);
      setRepValue('');
      toast.success(`Représentant de ${g.sponsorName} enregistré : ${nom}`);
    } else {
      toast.error(r.error ?? 'Enregistrement impossible');
    }
  }

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

  function generateAnalyse(g: CommanditaireGroupe) {
    setAnalysePendingId(g.sponsorOrgId);
    startAnalyse(async () => {
      const res = await generateAnalyseBesoinEntreprise({
        sessionId,
        sponsorOrgId: g.sponsorOrgId,
      });
      setAnalysePendingId(null);
      if (res.ok) {
        toast.success(
          `Analyse des besoins ${g.sponsorName} générée — ${res.count ?? g.participantCount} salarié(s) couvert(s).`,
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
          <Building2 className="h-4 w-4" /> Documents d&apos;entreprise
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quand l&apos;entreprise paye, les documents amont sont établis à SON nom :
          une convention unique signée par le chef d&apos;entreprise, et une analyse
          des besoins de la structure. Elles remplacent les documents individuels
          de ces stagiaires.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {groupes.map((g) => {
          const busy = pending && pendingId === g.sponsorOrgId;
          const analyseBusy = analysePending && analysePendingId === g.sponsorOrgId;
          const blocages = g.blocages ?? [];
          const blocConvention = blocagesPourDocument(blocages, 'convention');
          const blocAnalyse = blocagesPourDocument(blocages, 'analyse');
          const manqueRepresentant = blocages.some((b) => b.key === 'representant_manquant');
          return (
            <li key={g.sponsorOrgId} className="px-5 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
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
                      <FileText className="h-3 w-3" /> Convention (PDF)
                    </a>
                  )}
                  {g.analyseAssetId && (
                    <a
                      href={`/api/pedagogical-assets/${g.analyseAssetId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:no-underline"
                    >
                      <ClipboardList className="h-3 w-3" /> Analyse des besoins (PDF)
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => generateAnalyse(g)}
                  disabled={analysePending || blocAnalyse.length > 0}
                  title={
                    blocAnalyse.length > 0
                      ? `À compléter d'abord : ${blocAnalyse.map((b) => b.label).join(' · ')}`
                      : "Analyse des besoins au nom de l'entreprise (indicateur 4)"
                  }
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyseBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Analyse…
                    </>
                  ) : (
                    <>
                      <ClipboardList className="h-4 w-4" />
                      {g.analyseAssetId ? 'Régénérer l’analyse' : 'Générer l’analyse'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => generate(g)}
                  disabled={pending || blocConvention.length > 0}
                  title={
                    blocConvention.length > 0
                      ? `À compléter d'abord : ${blocConvention.map((b) => b.label).join(' · ')}`
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
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
              </div>
              </div>

              {blocages.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> À compléter avant de générer
                  </div>
                  <ul className="space-y-1">
                    {blocages.map((b) => (
                      <li key={b.key} className="text-xs text-amber-900">
                        <span className="font-medium">{b.label}</span>{' '}
                        <span className="text-amber-800/80">{b.hint}</span>{' '}
                        {b.href && (
                          <a
                            href={b.href}
                            target={b.href.startsWith('#') ? undefined : '_blank'}
                            rel="noreferrer"
                            className="text-primary underline underline-offset-2 hover:no-underline"
                          >
                            Ouvrir
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                  {manqueRepresentant &&
                    (saisieRepId === g.sponsorOrgId ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={repValue}
                          onChange={(e) => setRepValue(e.target.value)}
                          placeholder="Prénom NOM du représentant"
                          aria-label="Représentant légal"
                          className="h-8 px-2 rounded-md border border-border bg-white text-xs flex-1 min-w-0"
                        />
                        <button
                          type="button"
                          disabled={repBusy || !repValue.trim()}
                          onClick={() => enregistrerRepresentant(g)}
                          className="h-8 px-2.5 rounded-md bg-primary text-white text-xs font-medium disabled:opacity-50"
                        >
                          Enregistrer
                        </button>
                        <button
                          type="button"
                          onClick={() => setSaisieRepId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSaisieRepId(g.sponsorOrgId);
                          setRepValue(g.representant ?? '');
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Saisir le représentant ici
                      </button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
