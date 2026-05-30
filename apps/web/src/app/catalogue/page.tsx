import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShieldCheck, Mail, Phone, MapPin, GraduationCap } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { loadOfConfig } from '@/lib/of-config';
import { getQualiopiBilan } from '@/lib/qualiopi-bilan-stats';
import {
  DELAI_ACCES,
  ACCESSIBILITE_PSH,
  MENTION_TVA,
} from '@/lib/catalogue-constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalogue formations Start Academy — IA pour conseillers immobiliers',
  description:
    "Découvrez nos formations Qualiopi pour conseillers immobiliers : IA, prospection, négociation. Tarifs, durées, modalités. Référent handicap dédié.",
};

type Modality = 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING';

function formatHours(h: number): string {
  const days = Math.max(1, Math.ceil(h / 8));
  return `${h}h (${days} jour${days > 1 ? 's' : ''})`;
}

function formatModality(m: Modality): string {
  switch (m) {
    case 'PRESENTIEL':
      return 'Présentiel — locaux Start Academy ou sur site client (Vence 06)';
    case 'DISTANCIEL':
      return 'Distanciel synchrone (visio)';
    case 'MIXTE':
      return 'Mixte présentiel + distanciel';
    case 'ELEARNING':
      return 'E-learning asynchrone';
  }
}

function formatPrice(p: number): string {
  if (!p || p <= 0) return 'Tarif sur demande';
  return (
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(p) + ' HT'
  );
}

function parseObjectives(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
  return [];
}

export default async function CataloguePage() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) notFound();

  const products = await prisma.trainingProduct.findMany({
    where: { tenantId: tenant.id, isActive: true },
    include: { modules: { orderBy: { order: 'asc' } } },
    orderBy: { title: 'asc' },
  });

  const of = await loadOfConfig(tenant.id);

  const currentYear = new Date().getFullYear();
  let bilan = await getQualiopiBilan(tenant.id, currentYear);
  if (bilan.total.nbSessions === 0 && bilan.availableYears.length > 0) {
    bilan = await getQualiopiBilan(tenant.id, bilan.availableYears[0]!);
  }
  const showBilan = bilan.total.nbSessions > 0;

  const dateLong = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center">
            S
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900">{of.name}</div>
            <div className="text-xs text-slate-600">
              Organisme de formation enregistré — NDA {of.rnq} — SIRET {of.siret}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Référent handicap : {of.handicapReferent} • Mis à jour le {dateLong}
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
            <ShieldCheck className="h-3.5 w-3.5" /> Certifié Qualiopi
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <section className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Catalogue des formations
          </h1>
          <p className="mt-3 text-slate-700 max-w-3xl">
            Programmes Qualiopi conçus pour les conseillers et agents commerciaux immobilier.
            Tous nos programmes sont éligibles aux financements OPCO / AGEFICE / CPF.
          </p>
        </section>

        {showBilan ? (
          <section className="mb-10" aria-labelledby="resultats-title">
            <h2
              id="resultats-title"
              className="text-2xl font-bold tracking-tight text-slate-900"
            >
              Nos résultats {bilan.year}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Indicateurs de résultats annuels — Qualiopi indicateur 2.
            </p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-3xl font-bold text-slate-900">
                  {bilan.total.nbStagiairesPresents}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-800">
                  Stagiaires formés
                </div>
                <div className="text-xs text-slate-500">
                  ont suivi nos formations
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-3xl font-bold text-slate-900">
                  {bilan.total.nbHeures} h
                </div>
                <div className="mt-1 text-sm font-medium text-slate-800">
                  Heures de formation
                </div>
                <div className="text-xs text-slate-500">
                  dispensées cette année
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-3xl font-bold text-slate-900">
                  {bilan.total.noteMoyenneSatisfaction != null ? (
                    `${bilan.total.noteMoyenneSatisfaction.toFixed(1)} / 5`
                  ) : (
                    <span className="text-base font-medium text-slate-500">
                      Données en cours de consolidation
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-800">
                  Satisfaction moyenne
                </div>
                <div className="text-xs text-slate-500">
                  satisfaction stagiaires à chaud
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-3xl font-bold text-slate-900">
                  {bilan.total.tauxRecommandation != null ? (
                    `${Math.round(bilan.total.tauxRecommandation)}%`
                  ) : (
                    <span className="text-base font-medium text-slate-500">
                      Données en cours de consolidation
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-800">
                  Taux de recommandation
                </div>
                <div className="text-xs text-slate-500">
                  stagiaires nous recommandent
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Données mises à jour automatiquement depuis notre système de gestion
              Qualiopi. Période : année {bilan.year}.
            </p>
          </section>
        ) : null}

        {products.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <GraduationCap className="h-10 w-10 mx-auto text-slate-400" />
            <p className="mt-3 text-slate-700">
              Aucune formation active actuellement. Contactez-nous :{' '}
              <a className="text-primary underline" href={`mailto:${of.email}`}>
                {of.email}
              </a>
              .
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {products.map((product) => {
              const objectives = parseObjectives(product.objectives as unknown);
              const prerequisites = product.prerequisites?.trim() || 'Aucun prérequis spécifique.';
              const publicVise =
                product.targetAudience?.trim() ||
                product.accessConditions?.trim() ||
                'Conseillers et agents commerciaux immobilier.';
              const pedagogicalMethods =
                product.pedagogicalMethods?.trim() ||
                'Apports théoriques, mises en situation pratiques, études de cas, ateliers collectifs.';
              const evaluationMethods =
                product.evaluationMethods?.trim() ||
                "QCM en fin de formation, grille d'observation formateur en continu, satisfaction à chaud (J+0) et à froid (J+30).";
              const accessibility = product.accessibility?.trim() || ACCESSIBILITE_PSH;
              const priceText = formatPrice(Number(product.priceHT));
              const mailto = `mailto:${of.email}?subject=${encodeURIComponent(
                'Devis - ' + product.code + ' - ' + product.title,
              )}`;

              return (
                <article
                  key={product.id}
                  className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col"
                >
                  <header className="mb-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-xl font-semibold text-slate-900">{product.title}</h2>
                      <span className="shrink-0 text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">
                        {product.code}
                      </span>
                    </div>
                    {product.theme ? (
                      <div className="mt-1 text-xs text-slate-500">{product.theme}</div>
                    ) : null}
                  </header>

                  <dl className="space-y-4 text-sm flex-1">
                    <div>
                      <dt className="font-semibold text-slate-800">Objectifs pédagogiques</dt>
                      <dd className="mt-1 text-slate-700">
                        {objectives.length > 0 ? (
                          <ul className="list-disc pl-5 space-y-0.5">
                            {objectives.map((o, i) => (
                              <li key={i}>{o}</li>
                            ))}
                          </ul>
                        ) : (
                          'Objectifs détaillés disponibles sur demande.'
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">Prérequis</dt>
                      <dd className="mt-1 text-slate-700">{prerequisites}</dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">
                        Public visé / Conditions d'accès
                      </dt>
                      <dd className="mt-1 text-slate-700">{publicVise}</dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">Durée</dt>
                      <dd className="mt-1 text-slate-700">{formatHours(product.durationHours)}</dd>
                      {product.modules.length > 0 ? (
                        <details className="mt-2 text-slate-600">
                          <summary className="cursor-pointer text-xs text-primary hover:underline">
                            Programme détaillé ({product.modules.length} module
                            {product.modules.length > 1 ? 's' : ''})
                          </summary>
                          <ol className="mt-2 list-decimal pl-5 space-y-0.5 text-xs">
                            {product.modules.map((m) => (
                              <li key={m.id}>
                                {m.title} — {m.durationMin} min
                              </li>
                            ))}
                          </ol>
                        </details>
                      ) : null}
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">Modalités</dt>
                      <dd className="mt-1 text-slate-700">
                        {formatModality(product.modality as Modality)}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">
                        Méthodes pédagogiques mobilisées
                      </dt>
                      <dd className="mt-1 text-slate-700">{pedagogicalMethods}</dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">Modalités d'évaluation</dt>
                      <dd className="mt-1 text-slate-700">{evaluationMethods}</dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">Délais d'accès</dt>
                      <dd className="mt-1 text-slate-700">{DELAI_ACCES}</dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">Tarif</dt>
                      <dd className="mt-1 text-slate-700">
                        {priceText === 'Tarif sur demande' ? (
                          priceText
                        ) : (
                          <>
                            {priceText} — <span className="text-slate-500">{MENTION_TVA}</span>
                          </>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="font-semibold text-slate-800">
                        Accessibilité aux personnes en situation de handicap
                      </dt>
                      <dd className="mt-1 text-slate-700">{accessibility}</dd>
                    </div>
                  </dl>

                  <footer className="mt-6 pt-4 border-t border-slate-100">
                    <a
                      href={mailto}
                      className="inline-flex items-center justify-center rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90"
                    >
                      Demander un devis
                    </a>
                  </footer>
                </article>
              );
            })}
          </section>
        )}

        <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Contacts &amp; infos pratiques</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-700">
            <div className="inline-flex items-start gap-2">
              <Mail className="h-4 w-4 text-slate-400 mt-0.5" />
              <a className="text-primary hover:underline" href={`mailto:${of.email}`}>
                {of.email}
              </a>
            </div>
            <div className="inline-flex items-start gap-2">
              <Phone className="h-4 w-4 text-slate-400 mt-0.5" />
              <span>{of.phone}</span>
            </div>
            <div className="inline-flex items-start gap-2 sm:col-span-2">
              <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
              <span>{of.addressFull}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Référent handicap : <strong>{of.handicapReferent}</strong> — Adaptations sur demande
            (matériel, rythme, supports). Réseau partenaires : Agefiph, Cap emploi 06, MDPH 06.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-slate-600 space-y-1">
          <div>
            {of.name} — SIRET {of.siret} — NDA {of.rnq}
          </div>
          <div>Certification Qualiopi N° CW202324-1795 — RNQ V9</div>
          <div>{MENTION_TVA}</div>
          <div>CGV disponibles sur demande</div>
        </div>
      </footer>
    </div>
  );
}
