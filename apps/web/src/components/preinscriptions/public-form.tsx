'use client';

import { useState, useTransition } from 'react';
import { Upload, Check, X, Loader2, FileText, CreditCard, Building2, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { submitPreEnrollmentForm } from '@/server/actions/preinscription-public';

type FileKind = 'CNI' | 'RIB' | 'CFP';

interface FileSlot {
  kind: FileKind;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
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

    startTransition(async () => {
      try {
        const fileData = await Promise.all(
          filesToUpload.map(async (s) => ({
            kind: s.kind,
            name: s.file!.name,
            contentType: s.file!.type,
            base64: await fileToBase64(s.file!),
          })),
        );

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
        });

        if (r.ok) {
          setDone(true);
        } else {
          setError(r.error ?? 'Erreur lors de l\'envoi');
        }
      } catch (e) {
        console.error(e);
        setError('Erreur technique lors de l\'envoi des fichiers');
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
              className="w-full h-10 px-3 rounded-md border border-input"
            />
          </Field>
          <Field label="Nom" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input"
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input"
            />
          </Field>
          <Field label="Téléphone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input"
              placeholder="06 XX XX XX XX"
            />
          </Field>
          <Field label="Date de naissance">
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input"
            />
          </Field>
          <Field label="Lieu de naissance">
            <input
              type="text"
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input"
              placeholder="Ville"
            />
          </Field>
        </div>
      </Section>

      {/* Section pro */}
      <Section title="Ta situation professionnelle" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Statut professionnel">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white">
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Niveau d'étude">
            <select value={diploma} onChange={(e) => setDiploma(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white">
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
              className="w-full h-10 px-3 rounded-md border border-input"
              placeholder="Ex: BTS Professions immobilières, Master Marketing…"
            />
          </Field>
          <Field label="Années d'expérience" className="md:col-span-2">
            <input
              type="text"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input"
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

      {/* RGPD */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rgpd}
            onChange={(e) => setRgpd(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span className="text-xs leading-relaxed">
            J'accepte que Start Academy traite ces informations dans le cadre de ma pré-inscription
            à une formation, conformément au RGPD. Mes données seront conservées pendant la durée
            nécessaire au traitement de mon dossier et à mes obligations légales (Qualiopi, OPCO).
            Je peux à tout moment exercer mes droits d'accès, rectification, effacement.
          </span>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground italic">
          🔒 Tes données sont stockées en France sur les serveurs de Start Academy
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors',
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
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <h2 className="font-semibold text-base inline-flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
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
    <div className={cn('space-y-1', className)}>
      <label className="text-xs font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function FileDrop({ slot, onChange }: { slot: FileSlot; onChange: (f: File | null) => void }) {
  const Icon = slot.icon;
  const inputId = `file-${slot.kind}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
        slot.file
          ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50'
          : 'border-border hover:border-primary-300 hover:bg-muted/30',
      )}
    >
      <div className={cn(
        'h-10 w-10 rounded-lg inline-flex items-center justify-center shrink-0',
        slot.file ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
      )}>
        {slot.file ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {slot.label}{' '}
          {slot.required && <span className="text-red-500">*</span>}
        </div>
        {slot.file ? (
          <div className="text-xs text-emerald-700 truncate">{slot.file.name} ({(slot.file.size / 1024).toFixed(0)} ko)</div>
        ) : (
          <div className="text-xs text-muted-foreground">{slot.description}</div>
        )}
      </div>
      {slot.file ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onChange(null); }}
          className="h-7 w-7 rounded-md hover:bg-red-50 text-red-600 inline-flex items-center justify-center shrink-0"
          title="Retirer"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <span className="text-xs text-primary font-medium shrink-0">Choisir</span>
      )}
      <input
        id={inputId}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
    </label>
  );
}
