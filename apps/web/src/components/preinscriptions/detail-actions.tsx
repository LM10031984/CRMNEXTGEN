'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, X, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { convertPreEnrollment, rejectPreEnrollment } from '@/server/actions/preinscription-convert';
import { retriggerExtraction } from '@/server/actions/preinscription-public';

interface ExtractedData {
  cni?: any;
  rib?: any;
  cfp?: any;
  warnings?: string[];
}

export function PreEnrollmentActions({
  preEnrollmentId,
  status,
  saved,
  extracted,
}: {
  preEnrollmentId: string;
  status: string;
  saved: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    birthDate: Date | null;
    birthPlace: string | null;
    professionalStatus: string | null;
  };
  extracted: ExtractedData | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Champs éditables — pré-remplis avec saved (manuel) puis IA si manquant
  const cni = extracted?.cni ?? {};
  const rib = extracted?.rib ?? {};
  const cfp = extracted?.cfp ?? {};

  const [firstName, setFirstName] = useState(saved.firstName ?? cni.firstName ?? '');
  const [lastName, setLastName] = useState(saved.lastName ?? cni.lastName ?? '');
  const [birthName, setBirthName] = useState(cni.birthName ?? '');
  const [email, setEmail] = useState(saved.email ?? '');
  const [phone, setPhone] = useState(saved.phone ?? '');
  const [birthDate, setBirthDate] = useState(
    saved.birthDate ? saved.birthDate.toISOString().slice(0, 10) : (cni.birthDate ?? ''),
  );
  const [birthPlace, setBirthPlace] = useState(saved.birthPlace ?? cni.birthPlace ?? '');
  const [professionalStatus, setProfessionalStatus] = useState(saved.professionalStatus ?? '');

  const [createEiOrg, setCreateEiOrg] = useState(true);
  const [eiSiret, setEiSiret] = useState('');
  const [eiLegalName, setEiLegalName] = useState('');
  const [eiNaf, setEiNaf] = useState(cfp.activityCode ?? '');
  const [eiAddress, setEiAddress] = useState(rib.rawAddress ?? '');
  const [eiCity, setEiCity] = useState('');
  const [eiPostalCode, setEiPostalCode] = useState('');

  const [iban, setIban] = useState(rib.iban ?? '');
  const [bic, setBic] = useState(rib.bic ?? '');
  const [bankName, setBankName] = useState(rib.bankName ?? '');

  const [socialSecurityNb, setSocialSecurityNb] = useState(cfp.socialSecurityNb ?? '');
  const [paName, setPaName] = useState(cfp.paName ?? '');
  const [paAddress, setPaAddress] = useState(cfp.paAddress ?? '');
  const [affiliationUrssaf, setAffiliationUrssaf] = useState(cfp.affiliationUrssaf ?? '');

  const handleConvert = () => {
    setError(null);
    startTransition(async () => {
      const r = await convertPreEnrollment({
        preEnrollmentId,
        firstName,
        lastName,
        birthName: birthName || null,
        email,
        phone: phone || null,
        birthDate: birthDate || null,
        birthPlace: birthPlace || null,
        professionalStatus: professionalStatus || null,
        createEiOrg,
        eiSiret: eiSiret || null,
        eiLegalName: eiLegalName || null,
        eiNaf: eiNaf || null,
        eiAddress: eiAddress || null,
        eiCity: eiCity || null,
        eiPostalCode: eiPostalCode || null,
        iban: iban || null,
        bic: bic || null,
        bankName: bankName || null,
        socialSecurityNb: socialSecurityNb || null,
        paName: paName || null,
        paAddress: paAddress || null,
        affiliationUrssaf: affiliationUrssaf || null,
      });
      if (r.ok && r.personId) {
        router.push(`/app/apprenants/${r.personId}`);
      } else {
        setError(r.error ?? 'Erreur lors de la conversion');
      }
    });
  };

  const handleReExtract = () => {
    setError(null);
    startTransition(async () => {
      const r = await retriggerExtraction(preEnrollmentId);
      if (r.ok) {
        // Recharge la page pour voir l'update
        router.refresh();
      } else {
        setError(r.error ?? 'Erreur');
      }
    });
  };

  const handleReject = () => {
    const reason = window.prompt('Raison du rejet ?');
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const r = await rejectPreEnrollment(preEnrollmentId, reason);
      if (r.ok) {
        router.push('/app/preinscriptions');
      } else {
        setError(r.error ?? 'Erreur');
      }
    });
  };

  if (status === 'CONVERTED') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 inline-flex items-center gap-2">
        <Check className="h-4 w-4" /> Cette pré-inscription a déjà été convertie en apprenant.
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 inline-flex items-center gap-2">
        <X className="h-4 w-4" /> Cette pré-inscription a été rejetée.
      </div>
    );
  }

  const isEi = professionalStatus === 'Agent commercial' || professionalStatus === 'Dirigeant' || createEiOrg;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-white p-6 space-y-5">
        <h2 className="font-semibold text-base">Identité à créer</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Prénom" required>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
          </Field>
          <Field label="Nom" required>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
          </Field>
          <Field label="Nom de naissance">
            <input value={birthName} onChange={(e) => setBirthName(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
          </Field>
          <Field label="Email" required>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
          </Field>
          <Field label="Téléphone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
          </Field>
          <Field label="Date de naissance">
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
          </Field>
          <Field label="Lieu de naissance">
            <input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
          </Field>
          <Field label="Statut professionnel">
            <select value={professionalStatus} onChange={(e) => setProfessionalStatus(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm">
              <option value="">— Choisir —</option>
              <option value="Agent commercial">Agent commercial (auto-entrepreneur)</option>
              <option value="Salarié">Salarié</option>
              <option value="Dirigeant">Dirigeant</option>
            </select>
          </Field>
          <Field label="N° Sécurité sociale" className="md:col-span-2">
            <input value={socialSecurityNb} onChange={(e) => setSocialSecurityNb(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white font-mono text-xs" />
          </Field>
        </div>
      </div>

      {isEi && (
        <div className="rounded-2xl border border-border bg-white p-6 space-y-5">
          <h2 className="font-semibold text-base inline-flex items-center gap-3">
            Auto-entreprise / Org EI à créer
            <label className="text-xs font-normal inline-flex items-center gap-1.5 ml-auto">
              <input type="checkbox" checked={createEiOrg} onChange={(e) => setCreateEiOrg(e.target.checked)} />
              Créer
            </label>
          </h2>
          {createEiOrg && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="SIRET">
                <input value={eiSiret} onChange={(e) => setEiSiret(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm font-mono" />
              </Field>
              <Field label="Raison sociale">
                <input value={eiLegalName} onChange={(e) => setEiLegalName(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" placeholder={`${firstName} ${lastName.toUpperCase()}`} />
              </Field>
              <Field label="Code APE/NAF">
                <input value={eiNaf} onChange={(e) => setEiNaf(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm font-mono" />
              </Field>
              <Field label="Adresse">
                <input value={eiAddress} onChange={(e) => setEiAddress(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
              </Field>
              <Field label="Code postal">
                <input value={eiPostalCode} onChange={(e) => setEiPostalCode(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
              </Field>
              <Field label="Ville">
                <input value={eiCity} onChange={(e) => setEiCity(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
              </Field>
              <Field label="IBAN" className="md:col-span-2">
                <input value={iban} onChange={(e) => setIban(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm font-mono" />
              </Field>
              <Field label="BIC">
                <input value={bic} onChange={(e) => setBic(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm font-mono" />
              </Field>
              <Field label="Banque">
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
              </Field>
              <Field label="N° affiliation URSSAF">
                <input value={affiliationUrssaf} onChange={(e) => setAffiliationUrssaf(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
              </Field>
              <Field label="Nom du PA AGEFICE rattaché">
                <input value={paName} onChange={(e) => setPaName(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
              </Field>
              <Field label="Adresse du PA AGEFICE" className="md:col-span-2">
                <input value={paAddress} onChange={(e) => setPaAddress(e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-white text-sm" />
              </Field>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleConvert}
          disabled={pending}
          className={cn(
            'inline-flex items-center gap-2 h-10 px-5 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors',
            pending && 'opacity-70 cursor-wait',
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Convertir en apprenant
        </button>
        <button
          type="button"
          onClick={handleReExtract}
          disabled={pending}
          className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-white text-sm hover:bg-muted/30 transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Re-extraire avec l'IA
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={pending}
          className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-red-200 bg-white text-sm text-red-700 hover:bg-red-50 transition-colors ml-auto"
        >
          <X className="h-4 w-4" /> Rejeter
        </button>
      </div>
    </div>
  );
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="text-xs font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
