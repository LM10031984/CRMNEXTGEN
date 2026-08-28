'use client';

/**
 * Formulaire public d'inscription à UNE session (spec 2026-08-28).
 *
 * Décalque de `components/preinscriptions/public-form.tsx` (mêmes composants
 * Section/Field, même mise en page), avec trois différences :
 *
 *  1. Un `draftId` stable généré au montage : les pièces montent sous ce
 *     préfixe AVANT qu'aucune ligne n'existe en base. C'est ce qui évite qu'un
 *     lien diffusé largement remplisse la table de dossiers vides.
 *  2. Les champs manquants face à SmartOF : nom de naissance, adresse,
 *     n° de sécurité sociale, entreprise + SIRET, « dirigeant depuis ».
 *  3. Le n° de sécurité sociale est envoyé mais n'est PAS conservé tant que
 *     l'inscription n'est pas validée (minimisation RGPD) — la mention sous le
 *     champ le dit à l'apprenant.
 */

import { useState, useTransition } from 'react';
import { Upload, Check, Loader2, FileText, CreditCard, Building2, Sparkles, AlertCircle, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createSessionEnrollmentUploadUrl,
  submitSessionEnrollmentRequest,
} from '@/server/actions/session-enrollment-public';
import { DirectUploadField } from '@/components/shared/direct-upload-field';

type FileKind = 'CNI' | 'RIB' | 'CFP';

const STATUS_OPTIONS = [
  { value: '', label: '— Choisis ton statut —' },
  { value: 'Agent commercial', label: 'Agent commercial (auto-entrepreneur)' },
  { value: 'Salarié', label: 'Salarié' },
  { value: 'Dirigeant', label: "Dirigeant d'entreprise" },
];

const DIPLOMA_OPTIONS = [
  { value: '', label: "— Niveau d'étude —" },
  { value: 'BEP-CAP', label: 'BEP / CAP' },
  { value: 'Bac-Bac pro-BT-BP', label: 'Bac / Bac pro / BT / BP' },
  { value: 'Bac+2 : BTS-DUT-DEUG', label: 'Bac+2 (BTS, DUT, DEUG)' },
  { value: 'Bac+3 : Licence ou maîtrise', label: 'Bac+3 (Licence, maîtrise)' },
  { value: 'Bac+5 : Supérieur à la maîtrise', label: 'Bac+5 ou plus (Master, etc.)' },
];

const CHAMP = 'w-full h-10 px-3 rounded-md border border-input';

export function SessionEnrollmentForm({ publicToken }: { publicToken: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Généré UNE fois : identifie le brouillon côté Storage et rend la
  // soumission idempotente (double clic, reprise réseau).
  const [draftId] = useState(() => crypto.randomUUID());

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthName, setBirthName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [socialSecurityNb, setSocialSecurityNb] = useState('');
  const [status, setStatus] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [managerSince, setManagerSince] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySiret, setCompanySiret] = useState('');
  const [rgpd, setRgpd] = useState(false);

  const [uploadedKeys, setUploadedKeys] = useState<Partial<Record<FileKind, string>>>({});

  const slotMeta = [
    {
      kind: 'CNI' as const,
      label: "Pièce d'identité en cours de validité",
      description: 'CNI, passeport ou titre de séjour — photo (JPG/PNG) ou PDF',
      icon: CreditCard,
      required: true,
    },
    {
      kind: 'RIB' as const,
      label: 'RIB',
      description: 'PDF ou photo du RIB de ton compte professionnel',
      icon: Building2,
      required: true,
    },
    {
      kind: 'CFP' as const,
      label: 'Attestation CFP (URSSAF)',
      description: 'Attestation URSSAF de versement de la contribution à la formation professionnelle',
      icon: FileText,
      required: true,
    },
  ];

  const handleSubmit = () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Nom, prénom et email sont obligatoires');
      return;
    }
    if (!rgpd) {
      setError('Tu dois accepter le traitement de tes données pour continuer');
      return;
    }
    if (Object.keys(uploadedKeys).length === 0) {
      setError('Dépose au moins une pièce justificative');
      return;
    }

    startTransition(async () => {
      try {
        const r = await submitSessionEnrollmentRequest(publicToken, draftId, uploadedKeys, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthName: birthName.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          birthDate: birthDate || undefined,
          birthPlace: birthPlace.trim() || undefined,
          address: address.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
          city: city.trim() || undefined,
          socialSecurityNb: socialSecurityNb.trim() || undefined,
          educationLevel: educationLevel || undefined,
          managerSince: managerSince.trim() || undefined,
          companyName: companyName.trim() || undefined,
          companySiret: companySiret.trim() || undefined,
          professionalStatus: status || undefined,
          rgpdAccepted: true,
        });
        if (r.ok) setDone(true);
        else setError(r.error ?? "Erreur lors de l'envoi");
      } catch (e) {
        console.error(e);
        setError("Erreur technique lors de l'envoi de ta demande");
      }
    });
  };

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-12 text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-emerald-100 mx-auto inline-flex items-center justify-center">
          <Check className="h-8 w-8 text-emerald-700" />
        </div>
        <h2 className="text-2xl font-bold text-emerald-900">Demande envoyée !</h2>
        <p className="text-sm text-emerald-800 max-w-md mx-auto">
          Start Academy a bien reçu ta demande d'inscription et tes pièces. Tu seras
          recontacté pour la suite de ton dossier.
        </p>
        <p className="text-xs text-emerald-700 italic">Tu peux fermer cette fenêtre.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Informations de l'apprenant" icon={CreditCard}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Prénom" required>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={CHAMP} placeholder="ex. Jean" />
          </Field>
          <Field label="Nom" required>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={CHAMP} placeholder="ex. Martin" />
          </Field>
          <Field label="Nom de naissance">
            <input type="text" value={birthName} onChange={(e) => setBirthName(e.target.value)} className={CHAMP} placeholder="ex. Dupont" />
          </Field>
          <Field label="Date de naissance">
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={CHAMP} />
          </Field>
          <Field label="Adresse e-mail" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={CHAMP} placeholder="ex. jean.martin@mail.com" />
          </Field>
          <Field label="Numéro de téléphone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={CHAMP} placeholder="06 XX XX XX XX" />
          </Field>
          <Field label="Lieu de naissance">
            <input type="text" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} className={CHAMP} placeholder="Ville" />
          </Field>
          <Field label="Niveau d'étude">
            <select value={educationLevel} onChange={(e) => setEducationLevel(e.target.value)} className={cn(CHAMP, 'bg-white')}>
              {DIPLOMA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Ton adresse" icon={MapPin}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Numéro de rue et rue" className="md:col-span-2">
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={CHAMP} placeholder="ex. 6 rue de Bièvre" />
          </Field>
          <Field label="Code postal">
            <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={CHAMP} placeholder="ex. 06800" />
          </Field>
          <Field label="Ville">
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={CHAMP} placeholder="ex. Cagnes-sur-Mer" />
          </Field>
          <Field label="N° de sécurité sociale" className="md:col-span-2">
            <input type="text" value={socialSecurityNb} onChange={(e) => setSocialSecurityNb(e.target.value)} className={CHAMP} placeholder="1 85 05 78 006 084 36" inputMode="numeric" autoComplete="off" />
            <p className="text-[11px] text-muted-foreground mt-1">
              Utilisé uniquement pour ton dossier de financement. Il n'est conservé
              qu'après validation de ton inscription.
            </p>
          </Field>
        </div>
      </Section>

      <Section title="Ta situation professionnelle" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Statut professionnel">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(CHAMP, 'bg-white')}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Dirigeant d'entreprise depuis">
            <input type="text" value={managerSince} onChange={(e) => setManagerSince(e.target.value)} className={CHAMP} placeholder="ex. 2019" />
          </Field>
          <Field label="Nom de l'entreprise">
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={CHAMP} />
          </Field>
          <Field label="SIRET de l'entreprise">
            <input type="text" value={companySiret} onChange={(e) => setCompanySiret(e.target.value)} className={CHAMP} placeholder="14 chiffres" inputMode="numeric" />
          </Field>
        </div>
      </Section>

      <Section title="Documents à fournir" icon={Upload}>
        <p className="text-sm text-muted-foreground -mt-1 mb-3">
          Clique pour choisir. PDF, JPG ou PNG. L'envoi démarre tout de suite, même
          sur une photo prise au smartphone.
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
              requestUploadUrl={(kind, ext) =>
                createSessionEnrollmentUploadUrl(publicToken, draftId, kind, ext)
              }
              onUploaded={(kind, path) => setUploadedKeys((prev) => ({ ...prev, [kind]: path }))}
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

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rgpd}
            onChange={(e) => setRgpd(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span className="text-xs leading-relaxed">
            J'accepte que Start Academy traite ces informations dans le cadre de mon
            inscription à une formation, conformément au RGPD. Mes données sont hébergées
            dans l'Union européenne et conservées pendant la durée nécessaire au traitement
            de mon dossier et aux obligations légales de l'organisme (Qualiopi, OPCO). Je
            peux à tout moment exercer mes droits d'accès, de rectification et d'effacement
            à l'adresse contact@start-academy.fr.
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
              <Sparkles className="h-4 w-4" /> Envoyer ma demande d'inscription
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
