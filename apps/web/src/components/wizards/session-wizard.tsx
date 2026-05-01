'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  Calendar,
  MapPin,
  Users,
  Package,
  Clock,
  AlertCircle,
  Plus,
  X,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PersonOrOrgPicker, type PickerSelection } from '@/components/pickers/person-or-org-picker';
import { QuickCreateProductButton } from '@/components/wizards/quick-create-product';
import {
  searchProducts,
  createSessionFull,
  type CreateSessionInput,
} from '@/server/actions/sessions-create';

type Modality = 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE';
type FinancingMode = 'OPCO' | 'CPF' | 'ENTREPRISE' | 'AUTOFINANCEMENT' | 'POLE_EMPLOI' | 'AUTRE';

interface Product {
  id: string;
  code: string;
  title: string;
  durationHours: number;
  modality: Modality;
  priceHT: number | string;
  groupFlatPrice: number | string | null;
  theme: string | null;
  capacityMax: number;
}

interface Trainer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface ParticipantRow extends PickerSelection {
  financingMode?: FinancingMode | null;
}

const STEPS = [
  { n: 1, label: 'Produit', icon: Package },
  { n: 2, label: 'Dates & lieu', icon: Calendar },
  { n: 3, label: 'Participants', icon: Users },
  { n: 4, label: 'Récap', icon: Check },
] as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function SessionWizard({
  initialProducts,
  initialTrainers,
}: {
  initialProducts: Product[];
  initialTrainers: Trainer[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Étape 1
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<Product[]>(initialProducts);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Étape 2
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(plusDays(todayISO(), 1));
  const [modality, setModality] = useState<Modality>('PRESENTIEL');
  const [locationName, setLocationName] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [trainerIds, setTrainerIds] = useState<string[]>([]);
  const [pricePerLearner, setPricePerLearner] = useState<string>('');
  const [capacityMax, setCapacityMax] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState('');

  // Étape 3
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Effet : quand on choisit un produit, on prefill modality, capacityMax,
  // prix, ET on avance automatiquement à l'étape 2 (résout la friction
  // "Bouton Suivant introuvable" de l'audit UX du 30/04).
  const handleSelectProduct = (p: Product) => {
    setSelectedProduct(p);
    setModality(p.modality);
    setCapacityMax(String(p.capacityMax));
    setPricePerLearner(String(p.priceHT));
    if (p.durationHours && startDate) {
      const days = Math.max(1, Math.ceil(p.durationHours / 7));
      setEndDate(plusDays(startDate, days - 1));
    }
    // Avance auto à l'étape 2 si on est encore à l'étape 1
    setStep((prev) => (prev === 1 ? 2 : prev));
  };

  const runProductSearch = (q: string) => {
    setProductQuery(q);
    startTransition(async () => {
      const r = await searchProducts(q);
      setProductResults(r as Product[]);
    });
  };

  const validateStep = (s: 1 | 2 | 3): string | null => {
    if (s === 1 && !selectedProduct) return 'Sélectionne un produit';
    if (s === 2) {
      if (!startDate || !endDate) return 'Dates obligatoires';
      if (new Date(endDate) < new Date(startDate)) return 'Date fin doit être ≥ date début';
      if (trainerIds.length === 0) return 'Au moins un formateur est requis';
    }
    if (s === 3 && participants.length === 0) return 'Au moins un participant est requis';
    return null;
  };

  const goNext = () => {
    if (step === 4) return;
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((step + 1) as 1 | 2 | 3 | 4);
  };

  const goPrev = () => {
    setError(null);
    if (step === 1) return;
    setStep((step - 1) as 1 | 2 | 3 | 4);
  };

  const handleSubmit = () => {
    if (!selectedProduct) return;
    const err = validateStep(3);
    if (err) {
      setError(err);
      return;
    }
    setError(null);

    const payload: CreateSessionInput = {
      productId: selectedProduct.id,
      startDate,
      endDate,
      modality,
      locationName: locationName.trim() || null,
      locationCity: locationCity.trim() || null,
      trainerPersonIds: trainerIds,
      capacityMax: capacityMax ? parseInt(capacityMax, 10) : undefined,
      pricePerLearner: pricePerLearner ? parseFloat(pricePerLearner) : null,
      internalNotes: internalNotes.trim() || null,
      participants: participants.map((p) => ({
        personId: p.personId,
        sponsorOrgId: p.sponsorOrgId,
        financingMode: p.financingMode ?? null,
      })),
    };

    startTransition(async () => {
      const r = await createSessionFull(payload);
      if (r.ok && r.sessionId) {
        router.push(`/app/sessions/${r.sessionId}`);
      } else {
        setError(r.error ?? 'Erreur lors de la création');
      }
    });
  };

  const addParticipant = (sel: PickerSelection | null) => {
    if (!sel) return;
    if (participants.some((p) => p.personId === sel.personId)) {
      setError('Cet apprenant est déjà inscrit');
      return;
    }
    setError(null);
    setParticipants([...participants, sel]);
    setPickerOpen(false);
  };

  const removeParticipant = (personId: string) => {
    setParticipants(participants.filter((p) => p.personId !== personId));
  };

  const setParticipantFinancing = (personId: string, mode: FinancingMode) => {
    setParticipants(
      participants.map((p) => (p.personId === personId ? { ...p, financingMode: mode } : p)),
    );
  };

  const totalHT = useMemo(() => {
    const price = parseFloat(pricePerLearner || '0');
    return Number.isFinite(price) ? price * participants.length : 0;
  }, [pricePerLearner, participants.length]);

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <ol className="flex items-center gap-2">
          {STEPS.map(({ n, label, icon: Icon }, i) => (
            <li key={n} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  'h-9 w-9 rounded-full inline-flex items-center justify-center shrink-0 transition-colors',
                  step > n ? 'bg-emerald-500 text-white' : step === n ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {step > n ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Étape {n}
                </div>
                <div className={cn('text-sm font-medium', step === n ? 'text-foreground' : 'text-muted-foreground')}>
                  {label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-full mx-2 transition-colors',
                    step > n ? 'bg-emerald-500' : 'bg-muted',
                  )}
                />
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* Étape 1 — Produit */}
      {step === 1 && (
        <section className="rounded-2xl border border-border bg-white p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-lg">1. Choisis le produit de formation</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Tu peux dérouler la liste ou taper un nom / thème pour filtrer.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={productQuery}
                onChange={(e) => runProductSearch(e.target.value)}
                placeholder="Cherche un produit (titre, code, thème…)"
                className="w-full pl-9 pr-3 h-10 rounded-md border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <QuickCreateProductButton
              onCreated={(p) => {
                // Ajoute en tête de la liste + auto-sélectionne (déclenche
                // l'auto-avancement à l'étape 2)
                setProductResults((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
                handleSelectProduct(p);
              }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[450px] overflow-y-auto">
            {productResults.length === 0 ? (
              <p className="text-sm text-muted-foreground italic col-span-2 py-8 text-center">
                Aucun produit ne correspond.
              </p>
            ) : (
              productResults.map((p) => {
                const selected = selectedProduct?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProduct(p)}
                    className={cn(
                      'text-left rounded-xl border p-4 transition-all',
                      selected
                        ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-200'
                        : 'border-border bg-white hover:border-primary-200',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-medium text-sm">{p.title}</div>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <Badge variant="muted" className="font-mono">{p.code}</Badge>
                      {p.theme && <Badge variant="info">{p.theme}</Badge>}
                      <Badge variant="muted">
                        <Clock className="h-3 w-3" /> {p.durationHours}h
                      </Badge>
                      <Badge variant="muted">{p.modality}</Badge>
                      <Badge variant="muted" className="tabular-nums">
                        {Number(p.priceHT).toFixed(0)} €
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Étape 2 — Dates / lieu / formateurs */}
      {step === 2 && selectedProduct && (
        <section className="rounded-2xl border border-border bg-white p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-lg">2. Dates, lieu et formateurs</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Produit : <strong>{selectedProduct.title}</strong> · {selectedProduct.durationHours}h · {selectedProduct.modality}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Date de début" required>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </Field>
            <Field label="Date de fin" required>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </Field>
            <Field label="Modalité">
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as Modality)}
                className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm"
              >
                <option value="PRESENTIEL">Présentiel</option>
                <option value="DISTANCIEL">Distanciel</option>
                <option value="MIXTE">Mixte</option>
              </select>
            </Field>
            <Field label="Capacité max">
              <input
                type="number"
                min={1}
                value={capacityMax}
                onChange={(e) => setCapacityMax(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm"
              />
            </Field>
            <Field label="Lieu (nom du site)">
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Ex: Salle Start Academy Nice"
                className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm"
              />
            </Field>
            <Field label="Ville">
              <input
                type="text"
                value={locationCity}
                onChange={(e) => setLocationCity(e.target.value)}
                placeholder="Ex: Nice"
                className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm"
              />
            </Field>
            <Field label="Tarif par apprenant (€ HT)" className="md:col-span-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={pricePerLearner}
                onChange={(e) => setPricePerLearner(e.target.value)}
                placeholder={String(Number(selectedProduct.priceHT))}
                className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm"
              />
            </Field>
          </div>

          <Field label="Formateur(s) — au moins 1" required>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {initialTrainers.length === 0 ? (
                <p className="text-sm text-muted-foreground italic col-span-2">
                  Aucun formateur en base. Importe d'abord les formateurs ou crée-en un.
                </p>
              ) : (
                initialTrainers.map((t) => {
                  const selected = trainerIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTrainerIds(
                          selected ? trainerIds.filter((id) => id !== t.id) : [...trainerIds, t.id],
                        );
                      }}
                      className={cn(
                        'flex items-center gap-2 px-3 h-10 rounded-md border text-sm transition-colors',
                        selected
                          ? 'border-primary-300 bg-primary-50 text-primary-800'
                          : 'border-border bg-white hover:border-primary-200',
                      )}
                    >
                      <GraduationCap className="h-4 w-4" />
                      <span className="flex-1 text-left">
                        {t.firstName} {t.lastName}
                      </span>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </Field>

          <Field label="Notes internes (optionnel)">
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm"
              placeholder="Spécificités, consignes formateur, etc."
            />
          </Field>
        </section>
      )}

      {/* Étape 3 — Participants */}
      {step === 3 && (
        <section className="rounded-2xl border border-border bg-white p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-lg">3. Inscrits — apprenants & casquettes</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pour chaque apprenant multi-casquettes, tu choisiras la bonne organisation sponsor (qui paye et reçoit le remboursement).
            </p>
          </div>

          {participants.length > 0 && (
            <ul className="space-y-2">
              {participants.map((p) => (
                <li
                  key={p.personId}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-white"
                >
                  <Users className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{p.personLabel}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.isEi && <span className="text-primary font-semibold">[EI] </span>}
                      via <strong>{p.sponsorLabel}</strong>
                    </div>
                    <select
                      value={p.financingMode ?? ''}
                      onChange={(e) =>
                        setParticipantFinancing(p.personId, e.target.value as FinancingMode)
                      }
                      className="mt-2 h-8 px-2 rounded border border-input bg-white text-xs"
                    >
                      <option value="">— Mode de financement —</option>
                      <option value="OPCO">OPCO</option>
                      <option value="CPF">CPF</option>
                      <option value="ENTREPRISE">Entreprise (paie directement)</option>
                      <option value="AUTOFINANCEMENT">Autofinancement</option>
                      <option value="POLE_EMPLOI">Pôle Emploi</option>
                      <option value="AUTRE">Autre</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeParticipant(p.personId)}
                    className="h-7 w-7 rounded-md hover:bg-red-50 text-red-600 inline-flex items-center justify-center shrink-0"
                    title="Retirer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {pickerOpen ? (
            <div className="rounded-lg border border-primary-200 bg-primary-50/30 p-4">
              <PersonOrOrgPicker
                onChange={addParticipant}
                excludePersonIds={participants.map((p) => p.personId)}
                placeholder="Cherche par nom, prénom, email…"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full h-12 rounded-lg border-2 border-dashed border-border hover:border-primary-300 hover:bg-primary-50/30 inline-flex items-center justify-center gap-2 text-sm font-medium text-primary transition-colors"
            >
              <Plus className="h-4 w-4" /> Ajouter un apprenant
            </button>
          )}

          {participants.length > 0 && pricePerLearner && (
            <div className="rounded-lg bg-primary-50 border border-primary-200 p-4 text-sm">
              <div className="flex items-center gap-2 text-primary-800 font-medium">
                <Sparkles className="h-4 w-4" />
                {participants.length} inscrit{participants.length > 1 ? 's' : ''} ·{' '}
                <span className="tabular-nums">
                  CA prévu : {totalHT.toFixed(0)} € HT
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Étape 4 — Récap */}
      {step === 4 && selectedProduct && (
        <section className="rounded-2xl border border-border bg-white p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-lg">4. Récapitulatif</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Vérifie tout avant de confirmer la création de la session.
            </p>
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <RecapRow icon={Package} label="Produit" value={selectedProduct.title} />
            <RecapRow icon={Clock} label="Durée" value={`${selectedProduct.durationHours}h`} />
            <RecapRow icon={Calendar} label="Dates" value={`du ${new Date(startDate).toLocaleDateString('fr-FR')} au ${new Date(endDate).toLocaleDateString('fr-FR')}`} />
            <RecapRow icon={Calendar} label="Modalité" value={modality} />
            <RecapRow
              icon={MapPin}
              label="Lieu"
              value={locationName || locationCity ? `${locationName}${locationName && locationCity ? ' · ' : ''}${locationCity}` : 'Non précisé'}
            />
            <RecapRow icon={Users} label="Capacité max" value={capacityMax || String(selectedProduct.capacityMax)} />
            <RecapRow
              icon={GraduationCap}
              label="Formateur(s)"
              value={
                trainerIds
                  .map((id) => initialTrainers.find((t) => t.id === id))
                  .filter(Boolean)
                  .map((t) => `${t!.firstName} ${t!.lastName}`)
                  .join(', ') || 'Aucun'
              }
            />
            <RecapRow
              icon={Sparkles}
              label="Tarif / apprenant"
              value={`${parseFloat(pricePerLearner || '0').toFixed(0)} € HT`}
            />
          </dl>

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="font-medium text-sm mb-2">
              Inscrits ({participants.length}) · CA prévu {totalHT.toFixed(0)} € HT
            </h3>
            <ul className="space-y-1 text-sm">
              {participants.map((p) => (
                <li key={p.personId} className="flex items-center gap-2">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{p.personLabel}</span>
                  <span className="text-xs text-muted-foreground">via {p.sponsorLabel}</span>
                  {p.financingMode && (
                    <Badge variant="muted" className="text-[10px]">
                      {p.financingMode}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {internalNotes && (
            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Notes internes
              </div>
              {internalNotes}
            </div>
          )}
        </section>
      )}

      {/* Erreur globale */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Padding bottom pour ne pas chevaucher le footer sticky */}
      <div className="h-20" />

      {/* Footer actions sticky en bas — toujours visible même si l'étape
          contient 20 cartes produits (résout friction "bouton Suivant
          introuvable" de l'audit UX) */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 ml-[var(--sidebar-w,256px)]">
        <div className="max-w-screen-2xl mx-auto px-8 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 1 || pending}
            className={cn(
              'inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-input text-sm font-medium hover:bg-muted/50 transition-colors',
              (step === 1 || pending) && 'opacity-50 cursor-not-allowed',
            )}
          >
            <ChevronLeft className="h-4 w-4" /> Précédent
          </button>
          {step === 1 && selectedProduct && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              ✓ {selectedProduct.code} — {selectedProduct.title.slice(0, 40)}{selectedProduct.title.length > 40 ? '…' : ''}
            </span>
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors shadow-sm"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className={cn(
                'inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm',
                pending && 'opacity-70 cursor-wait',
              )}
            >
              {pending ? 'Création…' : <>Créer la session <Check className="h-4 w-4" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-xs font-medium text-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function RecapRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}
