'use client';

import { useState, useTransition } from 'react';
import { Upload, Check, Loader2, FileText, CreditCard, Building2, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createPreEnrollmentUploadUrl,
  confirmPreEnrollmentUpload,
} from '@/server/actions/storage-upload';
import { DirectUploadField } from '@/components/shared/direct-upload-field';

type FileKind = 'CNI' | 'RIB' | 'CFP';

interface UploadSlotMeta {
  kind: FileKind;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  required: boolean;
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

  // Métadonnées des 3 slots — l'upload lui-même est géré par <DirectUploadField>
  // (fichier envoyé DIRECTEMENT à Supabase au choix du fichier, pas à la soumission).
  const slotMeta: UploadSlotMeta[] = [
    {
      kind: 'CNI',
      label: 'Pièce d\'identité',
      description: 'CNI, passeport ou titre de séjour — photo (JPG/PNG) ou PDF',
      icon: CreditCard,
      required: true,
    },
    {
      kind: 'RIB',
      label: 'RIB',
      description: 'PDF ou photo du RIB de ton compte professionnel',
      icon: Building2,
      required: true,
    },
    {
      kind: 'CFP',
      label: 'Attestation CFP AGEFICE',
      description: "Attestation URSSAF de versement de la contribution à la formation pro (recommandée pour pré-remplir le dossier)",
      icon: FileText,
      required: false,
    },
  ];

  // Clés confirmées des fichiers DÉJÀ uploadés directement chez Supabase.
  const [uploadedKeys, setUploadedKeys] = useState<Partial<Record<FileKind, string>>>({});

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
    if (Object.keys(uploadedKeys).length === 0) {
      setError('Dépose au moins une pièce justificative');
      return;
    }

    startTransition(async () => {
      try {
        // Les fichiers sont DÉJÀ uploadés (direct-to-storage au choix du fichier).
        // La soumission ne fait que confirmer les clés + persister les champs texte.
        const r = await confirmPreEnrollmentUpload(token, uploadedKeys, {
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
        });

        if (r.ok) {
          setDone(true);
        } else {
          setError(r.error ?? 'Erreur lors de l\'envoi');
        }
      } catch (e) {
        console.error(e);
        setError('Erreur technique lors de l\'envoi du dossier');
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
          {/* Audit 2026-08-12 : bindings remis à l'endroit — le SELECT de
              niveau alimentait `diploma` et le texte libre `educationLevel`,
              d'où un niveau d'étude en texte libre qui cassait le
              pré-remplissage AGEFICE (liste fermée de niveaux). */}
          <Field label="Niveau d'étude">
            <select value={educationLevel} onChange={(e) => setEducationLevel(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white">
              {DIPLOMA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Dernier diplôme obtenu" className="md:col-span-2">
            <input
              type="text"
              value={diploma}
              onChange={(e) => setDiploma(e.target.value)}
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
          Clique pour choisir. PDF, JPG ou PNG. Max 50 Mo par fichier — l'envoi démarre
          tout de suite (barre de progression), même sur une photo prise au smartphone.
        </p>
        <div className="space-y-3">
          {slotMeta.map((s) => (
            <DirectUploadField
              key={s.kind}
              kind={s.kind}
              label={s.label}
              description={s.description}
              required={s.required}
              icon={s.icon}
              requestUploadUrl={(kind, ext) => createPreEnrollmentUploadUrl(token, kind, ext)}
              onUploaded={(kind, path) =>
                setUploadedKeys((prev) => ({ ...prev, [kind]: path }))
              }
              onCleared={(kind) =>
                setUploadedKeys((prev) => {
                  const next = { ...prev };
                  delete next[kind];
                  return next;
                })
              }
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
            à une formation, conformément au RGPD. Mes données sont hébergées dans l'Union
            européenne et conservées pendant la durée nécessaire au traitement de mon dossier et
            aux obligations légales de l'organisme (Qualiopi, OPCO). Je peux à tout moment exercer
            mes droits d'accès, de rectification et d'effacement à l'adresse contact@start-academy.fr.
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
          🔒 Données hébergées dans l'Union européenne
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

