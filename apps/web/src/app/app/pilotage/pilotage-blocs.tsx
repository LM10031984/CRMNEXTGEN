/**
 * Les blocs ajoutés au pilotage le 2026-09-10 : flux financiers, analyses par
 * axe, et la liste « à corriger ».
 *
 * Composants de rendu PURS (aucune I/O, aucun état) : la page fait les
 * lectures et leur passe des objets déjà calculés. Server Components — rien
 * ici n'a besoin du navigateur.
 */

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { FluxFinanciers, DelaiParFinanceur } from '@/lib/pilotage/flux-financiers';
import type { AxesPilotage, LigneAxe } from '@/lib/pilotage/axes';
import type { FamilleAnomalies } from '@/lib/pilotage/anomalies';

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

function Section({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
        {titre}
      </h2>
      {sousTitre && <p className="text-xs text-muted-foreground mt-1">{sousTitre}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ── Vendu · Facturé · Encaissé ───────────────────────────────────────── */

export function BlocFlux({
  flux,
  delais,
}: {
  flux: FluxFinanciers;
  delais: DelaiParFinanceur[];
}) {
  const max = Math.max(...flux.mensuel.map((m) => Math.max(m.vendu, m.facture, m.encaisse)), 1);
  return (
    <Section
      titre="Vendu · Facturé · Encaissé"
      sousTitre="Ce qui est vendu n'est pas facturé, ce qui est facturé n'est pas encaissé. Les trois, mois par mois."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Total libelle="Vendu" valeur={flux.totalVendu} teinte="text-slate-900" />
        <Total
          libelle="Facturé"
          valeur={flux.totalFacture}
          teinte="text-sky-700"
          note={`reste à facturer ${eur.format(flux.resteAFacturer)}`}
        />
        <Total
          libelle="Encaissé"
          valeur={flux.totalEncaisse}
          teinte="text-emerald-700"
          note={`reste à encaisser ${eur.format(flux.resteAEncaisser)}`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left py-1.5 pr-3 font-medium">Mois</th>
              <th className="text-right py-1.5 px-3 font-medium">Vendu</th>
              <th className="text-right py-1.5 px-3 font-medium">Facturé</th>
              <th className="text-right py-1.5 px-3 font-medium">Encaissé</th>
              <th className="py-1.5 pl-3 font-medium w-1/3">Répartition</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {flux.mensuel.map((m) => (
              <tr key={m.mois} className={m.vendu || m.facture || m.encaisse ? '' : 'opacity-40'}>
                <td className="py-1.5 pr-3 text-muted-foreground">{MOIS[m.mois]}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">{m.vendu ? eur.format(m.vendu) : '—'}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-sky-700">{m.facture ? eur.format(m.facture) : '—'}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-emerald-700">{m.encaisse ? eur.format(m.encaisse) : '—'}</td>
                <td className="py-1.5 pl-3">
                  <div className="space-y-0.5" aria-hidden="true">
                    <Barre valeur={m.vendu} max={max} classe="bg-slate-400" />
                    <Barre valeur={m.facture} max={max} classe="bg-sky-500" />
                    <Barre valeur={m.encaisse} max={max} classe="bg-emerald-500" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {delais.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Délai moyen de paiement
          </h3>
          <div className="flex flex-wrap gap-4">
            {delais.map((d) => (
              <div key={d.financeur} className="text-sm">
                <span className="font-medium">{d.financeur}</span>{' '}
                <span className="tabular-nums">
                  {d.delaiMoyen !== null ? `${d.delaiMoyen} j` : '—'}
                </span>{' '}
                <span className="text-xs text-muted-foreground">
                  ({d.paiements} paiement{d.paiements > 1 ? 's' : ''})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function Total({
  libelle,
  valeur,
  teinte,
  note,
}: {
  libelle: string;
  valeur: number;
  teinte: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{libelle}</div>
      <div className={`text-xl font-semibold tabular-nums ${teinte}`}>{eur.format(valeur)}</div>
      {note && <div className="text-[11px] text-muted-foreground mt-0.5">{note}</div>}
    </div>
  );
}

function Barre({ valeur, max, classe }: { valeur: number; max: number; classe: string }) {
  const largeur = max > 0 ? Math.max(0, Math.round((valeur / max) * 100)) : 0;
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${classe}`} style={{ width: `${largeur}%` }} />
    </div>
  );
}

/* ── Analyses par axe ─────────────────────────────────────────────────── */

export function BlocAxes({ axes }: { axes: AxesPilotage }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section titre="CA par produit">
        <TableAxe lignes={axes.parProduit.slice(0, 8)} />
      </Section>
      <Section titre="CA par financeur" sousTitre="Axe : l'OPCO du commanditaire.">
        <TableAxe lignes={axes.parFinanceur} />
      </Section>
      <Section titre="CA par formateur">
        <TableAxe lignes={axes.parFormateur} />
      </Section>
      <Section
        titre="Clients"
        sousTitre={`Le top 3 pèse ${axes.partTop3Clients} % du chiffre d'affaires.`}
      >
        <TableAxe lignes={axes.parClient.slice(0, 8)} />
      </Section>
      <Section
        titre="Remplissage des sessions"
        sousTitre={
          axes.remplissageMoyen !== null
            ? `${axes.remplissageMoyen} % en moyenne · panier moyen ${axes.panierMoyenParInscrit !== null ? eur.format(axes.panierMoyenParInscrit) : '—'} par inscrit`
            : 'Capacité non exploitable.'
        }
      >
        <ul className="divide-y divide-border text-sm">
          {axes.sessionsMoinsRemplies.map((s) => (
            <li key={s.code} className="flex items-center gap-3 py-1.5">
              <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{s.code}</span>
              <span className="flex-1 min-w-0 truncate">{s.libelle}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {s.inscrits}/{s.capaciteMax} · {s.taux} %
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section
        titre="De la pré-inscription à la présence"
        sousTitre="En nombre d'inscrits et en euros comptés dans le CA."
      >
        <ul className="space-y-1.5 text-sm">
          <EtapeEntonnoir libelle="Pré-inscrits" v={axes.entonnoir.preInscrits} />
          <EtapeEntonnoir libelle="Confirmés" v={axes.entonnoir.confirmes} />
          <EtapeEntonnoir libelle="Présence constatée" v={axes.entonnoir.presents} />
        </ul>
        {axes.entonnoir.preInscritsSurSessionsTerminees.n > 0 && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            {axes.entonnoir.preInscritsSurSessionsTerminees.n} pré-inscrits sont rattachés à des
            sessions déjà terminées, soit{' '}
            {eur.format(axes.entonnoir.preInscritsSurSessionsTerminees.ca)} de CA qu'aucune présence
            n'étaye.
          </p>
        )}
      </Section>
    </div>
  );
}

function EtapeEntonnoir({ libelle, v }: { libelle: string; v: { n: number; ca: number } }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{libelle}</span>
      <span className="tabular-nums text-muted-foreground">
        {v.n} · {eur.format(v.ca)}
      </span>
    </li>
  );
}

function TableAxe({ lignes }: { lignes: LigneAxe[] }) {
  if (lignes.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée sur cette année.</p>;
  }
  return (
    <ul className="divide-y divide-border text-sm">
      {lignes.map((l) => (
        <li key={l.cle} className="py-1.5">
          <div className="flex items-baseline gap-3">
            <span className="flex-1 min-w-0 truncate" title={l.libelle}>
              {l.libelle}
            </span>
            <span className="tabular-nums font-medium shrink-0">{eur.format(l.ca)}</span>
            <span className="tabular-nums text-xs text-muted-foreground w-10 text-right shrink-0">
              {l.part} %
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
            <div className="h-full bg-primary-400" style={{ width: `${l.part}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── À corriger ───────────────────────────────────────────────────────── */

export function BlocAnomalies({ familles }: { familles: FamilleAnomalies[] }) {
  if (familles.length === 0) return null;
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-amber-900 inline-flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" /> À corriger
      </h2>
      <p className="text-xs text-amber-900/80 mt-1">
        Ces montants sont comptés dans les chiffres ci-dessus. Rien n'est corrigé automatiquement —
        chaque ligne mène à sa session.
      </p>
      <div className="mt-4 space-y-4">
        {familles.map((f) => (
          <div key={f.cle}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-medium">{f.titre}</h3>
              <span className="tabular-nums text-sm font-semibold">
                {f.montant >= 0 ? '' : '−'}
                {eur.format(Math.abs(f.montant))}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{f.explication}</p>
            <ul className="mt-1.5 divide-y divide-amber-200/60">
              {f.lignes.slice(0, 6).map((l) => (
                <li key={`${f.cle}-${l.sessionId}`} className="py-1.5">
                  <Link
                    href={`/app/sessions/${l.sessionId}`}
                    className="flex items-baseline gap-3 text-sm hover:underline"
                  >
                    <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">
                      {l.code}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{l.detail}</span>
                    <span className="tabular-nums shrink-0">
                      {l.montant >= 0 ? '' : '−'}
                      {eur.format(Math.abs(l.montant))}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            {f.lignes.length > 6 && (
              <p className="text-xs text-muted-foreground mt-1">
                … et {f.lignes.length - 6} autre{f.lignes.length - 6 > 1 ? 's' : ''}.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
