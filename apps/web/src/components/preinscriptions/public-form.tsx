'use client';

import { useEffect, useState, useTransition } from 'react';
import { Upload, Check, Loader2, FileText, CreditCard, Building2, Sparkles, AlertCircle, FileIcon, PenTool, Trash2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { submitPreEnrollmentForm } from '@/server/actions/preinscription-public';
import { SignaturePad } from './signature-pad';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

type FileKind = 'CNI' | 'RIB' | 'CFP';

interface FileSlot {
  kind: FileKind;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  required: boolean;
  file: File | null;
}

const STATUS_OPTIONS = [
  { value: '', label: '— Choisis ton statut —' },
  { value: 'Agent commercial', label: 'Agent commercial (auto-entrepreneur)' },
  { value: 'Salarié', label: 'Salarié' },
  { value: 'Dirigeant', label: 'Dirigeant d\'entreprise' },
];

const DIPLOMA_OPTIONS = [
  { value: '', label: '— Niveau d\'étude —' },
  { value: 'BEP-CAP', label: 'BEP / CAP' },
  { value: 'Bac-Bac pro-BT-BP', label: 'Bac / Bac pro / BT / BP' },
  { value: 'Bac+2 : BTS-DUT-DEUG', label: 'Bac+2 (BTS, DUT, DEUG)' },
  { value: 'Bac+3 : Licence ou maîtrise', label: 'Bac+3 (Licence, maîtrise)' },
  { value: 'Bac+5 : Supérieur à la maîtrise', label: 'Bac+5 ou plus (Master, etc.)' },
];

export function PublicPreEnrollmentForm({
  token,
  prefillFirstName,
  prefillLastName,
  prefillEmail,
}: {
  token: string;
  prefillFirstName?: string;
  prefillLastName?: string;
  prefillEmail?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<'idle' | 'encoding' | 'uploading' | 'done'>('idle');

  const [firstName, setFirstName] = useState(prefillFirstName ?? '');
  const [lastName, setLastName] = useState(prefillLastName ?? '');
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [status, setStatus] = useState('');
  const [diploma, setDiploma] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [experience, setExperience] = useState('');
  const [rgpd, setRgpd] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const [slots, setSlots] = useState<FileSlot[]>([
    {
      kind: 'CNI',
      label: 'Pièce d\'identité',
      description: 'CNI, passeport ou titre de séjour — photo (JPG/PNG) ou PDF',
      icon: CreditCard,
      required: true,
      file: null,
    },
    {
      kind: 'RIB',
      label: 'RIB',
      description: 'PDF ou photo du RIB de ton compte professionnel',
      icon: Building2,
      required: true,
      file: null,
    },
    {
      kind: 'CFP',
      label: 'Attestation CFP AGEFICE',
      description: "Attestation URSSAF de versement de la contribution à la formation pro (recommandée pour pré-remplir le dossier)",
      icon: FileText,
      required: false,
      file: null,
    },
  ]);

  const setSlot = (kind: FileKind, file: File | null) => {
    setSlots(slots.map((s) => (s.kind === kind ? { ...s, file } : s)));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // result = "data:application/pdf;base64,XXX..."
        const base64 = result.split(',')[1] ?? '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Nom, prénom et email sont obligatoires');
      return;
    }
    if (!rgpd) {
      setError('Tu dois accepter le traitement RGPD');
      return;
    }
    const filesToUpload = slots.filter((s) => s.file !== null);
    if (filesToUpload.length === 0) {
      setError('Dépose au moins une pièce justificative');
      return;
    }
    if (!signatureDataUrl) {
      setError('Tu dois signer ta demande pour la valider');
      return;
    }

    startTransition(async () => {
      try {
        setProgressStep('encoding');
        const fileData = await Promise.all(
          filesToUpload.map(async (s) => ({
            kind: s.kind,
            name: s.file!.name,
            contentType: s.file!.type,
            base64: await fileToBase64(s.file!),
          })),
        );

        setProgressStep('uploading');
        // Extrait la partie base64 du data URL signature (sans préfixe data:image/png;base64,)
        const signatureBase64 = signatureDataUrl
          ? signatureDataUrl.split(',')[1] ?? undefined
          : undefined;

        const r = await submitPreEnrollmentForm({
          token,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          birthDate: birthDate || undefined,
          birthPlace: birthPlace.trim() || undefined,
          professionalStatus: status || undefined,
          diploma: diploma || undefined,
          educationLevel: educationLevel.trim() || undefined,
          professionalExperience: experience.trim() || undefined,
          rgpdAccepted: true,
          files: fileData,
          signatureBase64,
        });

        if (r.ok) {
          setProgressStep('done');
          setDone(true);
        } else {
          setProgressStep('idle');
          setError(r.error ?? 'Erreur lors de l\'envoi');
        }
      } catch (e: any) {
        console.error(e);
        setProgressStep('idle');
        const msg = e?.message ? `Erreur : ${e.message}` : 'Erreur technique lors de l\'envoi des fichiers';
        setError(msg);
      }
    });
  };

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-12 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-emerald-100 mx-auto inline-flex items-center justify-center">
          <Check className="h-8 w-8 text-emerald-700" />
        </div>
        <h2 className="text-2xl font-bold text-emerald-900">Dossier envoyé !</h2>
        <p className="text-emerald-800 max-w-md mx-auto">
          Merci {firstName} ! Ton dossier est en cours de traitement automatique.
          Start Academy te recontactera très bientôt par email à <strong>{email}</strong>.
        </p>
        <p className="text-xs text-emerald-700 italic">
          Tu peux fermer cette fenêtre.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section identité */}
      <Section title="Tes informations" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Prénom" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Nom" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Téléphone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLASS}
              placeholder="06 XX XX XX XX"
            />
          </Field>
          <Field label="Date de naissance">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Lieu de naissance">
            <input
              type="text"
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Ville"
            />
          </Field>
        </div>
      </Section>

      {/* Section pro */}
      <Section title="Ta situation professionnelle" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Statut professionnel">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT_CLASS}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Niveau d'étude">
            <select value={diploma} onChange={(e) => setDiploma(e.target.value)} className={INPUT_CLASS}>
              {DIPLOMA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Dernier diplôme obtenu" className="md:col-span-2">
            <input
              type="text"
              value={educationLevel}
              onChange={(e) => setEducationLevel(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Ex: BTS Professions immobilières, Master Marketing…"
            />
          </Field>
          <Field label="Années d'expérience" className="md:col-span-2">
            <input
              type="text"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Ex: 5 ans, 1-3 ans, Plus de 10 ans…"
            />
          </Field>
        </div>
      </Section>

      {/* Section pièces */}
      <Section title="Tes pièces justificatives" icon={Upload}>
        <p className="text-sm text-muted-foreground -mt-1 mb-3">
          Glisse-dépose ou clique pour choisir. PDF, JPG ou PNG. Max 10 Mo par fichier.
        </p>
        <div className="space-y-3">
          {slots.map((s) => (
            <FileDrop
              key={s.kind}
              slot={s}
              onChange={(f) => setSlot(s.kind, f)}
            />
          ))}
        </div>
      </Section>

      {/* Signature électronique */}
      <Section title="Ta signature" icon={PenTool}>
        <p className="text-sm text-muted-foreground -mt-1 mb-3">
          Signe ta demande de pré-inscription pour la valider. Ta signature est horodatée
          et enregistrée avec une valeur probante (hash cryptographique + IP + date).
        </p>
        <SignaturePad
          onChange={setSignatureDataUrl}
          disabled={pending}
        />
      </Section>

      {/* RGPD */}
      <div className={cn(
        'rounded-xl border bg-white shadow-sm p-4 transition-colors',
        rgpd ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300',
      )}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rgpd}
            onChange={(e) => setRgpd(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-100 focus:ring-offset-0"
          />
          <span className="text-xs leading-relaxed text-gray-700">
            J'accepte que Start Academy traite ces informations dans le cadre de ma pré-inscription
            à une formation, conformément au RGPD. Mes données seront conservées pendant la durée
            nécessaire au traitement de mon dossier et à mes obligations légales (Qualiopi, OPCO).
            Je peux à tout moment exercer mes droits d'accès, rectification, effacement.
          </span>
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {pending && progressStep !== 'idle' && (
        <UploadProgress step={progressStep} />
      )}

      <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-200 flex-wrap">
        <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
          <span aria-hidden>🔒</span> Tes données sont stockées en France sur les serveurs de Start Academy
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm transition-all',
            'hover:bg-emerald-700 hover:shadow focus:outline-none focus:ring-2 focus:ring-emerald-200',
            pending && 'opacity-70 cursor-wait',
          )}
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Envoi en cours…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> J'envoie mon dossier
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 inline-flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-base text-gray-900 leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
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
      <label className="text-xs font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// Classes Tailwind partagées par tous les <input>/<select>/<textarea> du formulaire.
// Centralisées ici pour garantir la cohérence : bordure gray-300 → focus bleu avec ring.
const INPUT_CLASS = 'w-full h-11 px-3.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function FileDrop({ slot, onChange }: { slot: FileSlot; onChange: (f: File | null) => void }) {
  const Icon = slot.icon;
  const inputId = `file-${slot.kind}`;
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Object URL pour preview image — recréé à chaque nouveau fichier, libéré au démontage
  useEffect(() => {
    if (slot.file && slot.file.type.startsWith('image/')) {
      const url = URL.createObjectURL(slot.file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [slot.file]);

  const handleFile = (file: File | null) => {
    setLocalError(null);
    if (!file) {
      onChange(null);
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      setLocalError('Format non accepté. PDF, JPG ou PNG uniquement.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setLocalError(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, max 10 Mo).`);
      return;
    }
    onChange(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const isPdf = slot.file?.type === 'application/pdf';

  // Card "FileDrop" — style SaaS moderne (Shadcn / Stripe / Linear).
  // - Bordure SOLIDE par défaut (gray-200), passe en DASHED + bleue uniquement
  //   au hover ou en drag&drop → moins de bruit visuel au repos.
  // - Icône dans un cercle (h-12 w-12) avec fond doux bleu (vide) ou vert (rempli).
  // - Faux bouton "Parcourir" (badge gris) qui s'illumine bleu au hover de la carte.
  // - Rempli → check vert + nom/poids + bouton corbeille rouge pour reset rapide.
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'group flex items-center gap-4 p-4 rounded-xl bg-white shadow-sm cursor-pointer transition-all duration-150',
          slot.file
            ? 'border border-green-200 bg-green-50/40 hover:bg-green-50'
            : dragOver
              ? 'border-2 border-dashed border-blue-500 bg-blue-50 scale-[1.01] shadow-md'
              : 'border border-gray-200 hover:border-2 hover:border-dashed hover:border-blue-400 hover:bg-blue-50/40 hover:shadow',
        )}
      >
        {/* Thumbnail / icône — cercle, fond doux qui passe au vert quand rempli */}
        <div className={cn(
          'h-12 w-12 rounded-full inline-flex items-center justify-center shrink-0 overflow-hidden transition-colors duration-150',
          slot.file
            ? 'bg-green-100 text-green-600'
            : 'bg-blue-100 text-blue-600 group-hover:bg-blue-500 group-hover:text-white',
        )}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Aperçu" className="h-full w-full object-cover" />
          ) : isPdf ? (
            <FileIcon className="h-5 w-5" />
          ) : slot.file ? (
            <Check className="h-5 w-5" strokeWidth={2.5} />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </div>

        {/* Titre + état (description ou nom+taille) */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900">
            {slot.label}{' '}
            {slot.required && <span className="text-red-500">*</span>}
          </div>
          {slot.file ? (
            <div className="text-xs text-green-700 truncate flex items-center gap-1.5 mt-0.5">
              <Check className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium">{slot.file.name}</span>
              <span className="text-green-600/70 shrink-0">· {formatFileSize(slot.file.size)}</span>
            </div>
          ) : (
            <div className="text-xs text-gray-500 mt-0.5">{slot.description}</div>
          )}
        </div>

        {/* CTA droit : corbeille rouge (rempli) OU badge "Parcourir" (vide) */}
        {slot.file ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); handleFile(null); }}
            className="h-9 w-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center shrink-0 transition-colors"
            title="Retirer le fichier"
            aria-label="Retirer le fichier"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors duration-150',
              dragOver
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 group-hover:bg-blue-600 group-hover:text-white',
            )}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{dragOver ? 'Déposer ici' : 'Parcourir'}</span>
          </span>
        )}

        <input
          id={inputId}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </label>

      {localError && (
        <p className="text-xs text-red-600 inline-flex items-center gap-1 pl-1">
          <AlertCircle className="h-3 w-3" /> {localError}
        </p>
      )}
    </div>
  );
}

function UploadProgress({ step }: { step: 'encoding' | 'uploading' | 'done' }) {
  const steps = [
    { id: 'encoding' as const, label: 'Préparation des fichiers' },
    { id: 'uploading' as const, label: 'Envoi sécurisé à Start Academy' },
    { id: 'done' as const, label: "Traitement IA des pièces" },
  ];
  const order: Array<'encoding' | 'uploading' | 'done'> = ['encoding', 'uploading', 'done'];
  const currentIdx = order.indexOf(step);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 shadow-sm p-5">
      <ul className="space-y-3">
        {steps.map((s, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          return (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  'h-7 w-7 rounded-full inline-flex items-center justify-center shrink-0 transition-colors',
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-200 text-gray-400',
                )}
              >
                {isDone ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="text-[11px] font-bold">{idx + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'transition-colors',
                  isDone && 'text-emerald-800 line-through opacity-70',
                  isActive && 'text-blue-900 font-medium',
                  !isDone && !isActive && 'text-gray-500',
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
