'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Upload, Loader2, Check, AlertTriangle, Sparkles } from 'lucide-react';
import { createPerson } from '@/server/actions/crud-edits';
import { extractApprenantDocs } from '@/server/actions/extract-apprenant-docs';

type ExtractedExtras = {
  iban: string | null;
  bic: string | null;
  bankName: string | null;
  siret: string | null;
  activityCode: string | null;
  socialSecurityNb: string | null;
  contributionAmount: number | null;
  contributionYear: number | null;
};

export function CreatePersonButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Champs form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthName, setBirthName] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [professionalStatus, setProfessionalStatus] = useState('');
  const [siret, setSiret] = useState('');
  const [activityCode, setActivityCode] = useState('');
  const [socialSecurityNb, setSocialSecurityNb] = useState('');
  // Uploads
  const [cniFile, setCniFile] = useState<File | null>(null);
  const [ribFile, setRibFile] = useState<File | null>(null);
  const [cfpFile, setCfpFile] = useState<File | null>(null);
  const [extras, setExtras] = useState<ExtractedExtras | null>(null);

  function reset() {
    setFirstName(''); setLastName(''); setCivility(''); setEmail(''); setPhone('');
    setBirthDate(''); setBirthName(''); setAddressStreet(''); setAddressPostalCode(''); setAddressCity('');
    setProfessionalStatus(''); setSiret(''); setActivityCode(''); setSocialSecurityNb('');
    setCniFile(null); setRibFile(null); setCfpFile(null);
    setExtras(null); setError(null); setWarnings([]);
  }

  async function handleExtract() {
    if (!cniFile && !ribFile && !cfpFile) {
      setError('Upload au moins 1 document (CNI, RIB ou CFP) pour pré-remplir.');
      return;
    }
    setExtracting(true);
    setError(null);
    setWarnings([]);
    try {
      const fd = new FormData();
      if (cniFile) fd.append('CNI', cniFile);
      if (ribFile) fd.append('RIB', ribFile);
      if (cfpFile) fd.append('CFP', cfpFile);
      const r = await extractApprenantDocs(fd);
      if (!r.ok || !r.data) {
        setError(r.error ?? 'Extraction échouée.');
        return;
      }
      const d = r.data;
      // Pré-remplit uniquement les champs vides (n'écrase pas la saisie manuelle)
      if (!firstName && d.firstName) setFirstName(d.firstName);
      if (!lastName && d.lastName) setLastName(d.lastName);
      if (!birthName && d.birthName) setBirthName(d.birthName);
      if (!birthDate && d.birthDate) setBirthDate(d.birthDate);
      if (!addressStreet && d.addressStreet) setAddressStreet(d.addressStreet);
      if (!addressPostalCode && d.addressPostalCode) setAddressPostalCode(d.addressPostalCode);
      if (!addressCity && d.addressCity) setAddressCity(d.addressCity);
      if (!siret && d.siret) setSiret(d.siret);
      if (!activityCode && d.activityCode) setActivityCode(d.activityCode);
      if (!socialSecurityNb && d.socialSecurityNb) setSocialSecurityNb(d.socialSecurityNb);
      setExtras({
        iban: d.iban, bic: d.bic, bankName: d.bankName,
        siret: d.siret, activityCode: d.activityCode,
        socialSecurityNb: d.socialSecurityNb,
        contributionAmount: d.contributionAmount, contributionYear: d.contributionYear,
      });
      if (r.warnings && r.warnings.length > 0) setWarnings(r.warnings);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setExtracting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createPerson({
        firstName, lastName,
        civility: civility || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        professionalStatus: professionalStatus.trim() || null,
        birthName: birthName.trim() || null,
        birthDate: birthDate || null,
        addressStreet: addressStreet.trim() || null,
        addressPostalCode: addressPostalCode.trim() || null,
        addressCity: addressCity.trim() || null,
        socialSecurityNb: socialSecurityNb.trim() || null,
        siret: siret.trim() || null,
        activityCode: activityCode.trim() || null,
        cfpAmount: extras?.contributionAmount ?? null,
        cfpYear: extras?.contributionYear ?? null,
      });
      if (r.ok && r.personId) {
        setOpen(false);
        reset();
        router.push(`/app/apprenants/${r.personId}` as any);
      } else {
        setError(r.error ?? 'Erreur inconnue.');
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const fileBox = (
    label: string,
    file: File | null,
    onChange: (f: File | null) => void,
    hint: string,
  ) => (
    <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50">
      <Upload className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {file ? `✓ ${file.name}` : hint}
        </div>
      </div>
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)] transition-all duration-300 ease-out active:scale-[0.97]"
      >
        <UserPlus className="h-4 w-4" /> Nouvel apprenant
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={() => !busy && !extracting && setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-2">Nouvel apprenant</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Upload les documents (CFP, CNI, RIB) pour pré-remplir automatiquement le formulaire,
              ou saisis directement à la main.
            </p>

            {/* Bloc upload + extraction */}
            <div className="bg-muted/30 rounded-xl p-3 mb-4 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {fileBox('Attestation CFP', cfpFile, setCfpFile, 'PDF URSSAF')}
                {fileBox("Carte d'identité", cniFile, setCniFile, 'CNI / Passeport')}
                {fileBox('RIB', ribFile, setRibFile, 'PDF / image')}
              </div>
              <button
                type="button"
                onClick={handleExtract}
                disabled={extracting || (!cniFile && !ribFile && !cfpFile)}
                className="w-full inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {extracting ? 'Extraction en cours…' : 'Pré-remplir avec l\'IA'}
              </button>
              {warnings.length > 0 && (
                <div className="text-[10px] text-amber-700 space-y-0.5">
                  {warnings.slice(0, 3).map((w, i) => (
                    <div key={i} className="inline-flex items-start gap-1">
                      <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" /> {w}
                    </div>
                  ))}
                </div>
              )}
              {extras && (
                <div className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-2 space-y-1">
                  <div className="font-medium text-foreground inline-flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Données extraites :</div>
                  {extras.iban && <div>IBAN : <span className="font-mono">{extras.iban}</span></div>}
                  {extras.bic && <div>BIC : <span className="font-mono">{extras.bic}</span> {extras.bankName && `(${extras.bankName})`}</div>}
                  {extras.contributionAmount !== null && extras.contributionAmount !== undefined && (
                    (() => {
                      const cfp = extras.contributionAmount;
                      const year = extras.contributionYear ?? '';
                      // Règle AGEFICE :
                      // - CFP >= 7€ : plafond 3000€/an (5000€ si RNCP)
                      // - CFP > 0€ et < 7€ : plafond 600€/an
                      // - CFP = 0€ : pas de droit
                      const eligible = cfp >= 7 ? '3000' : cfp > 0 ? '600' : null;
                      const color = !eligible ? 'bg-red-50 border-red-300 text-red-800' : eligible === '3000' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-800';
                      const droitsYear = typeof year === 'number' ? year + 1 : '';
                      return (
                        <div className={`mt-2 px-3 py-2 rounded-md border ${color}`}>
                          <div className="text-xs font-semibold">CFP exercice {year} : {cfp} €</div>
                          {eligible === '3000' && <div className="text-[11px] mt-0.5">→ Droits {droitsYear} : <strong>3 000 €/an</strong> (jusqu'à 5 000 € pour formation RNCP)</div>}
                          {eligible === '600' && <div className="text-[11px] mt-0.5">→ Droits {droitsYear} : <strong>600 €/an</strong> (CFP &lt; 7 €)</div>}
                          {!eligible && <div className="text-[11px] mt-0.5">→ <strong>Aucun droit AGEFICE {droitsYear}</strong> (CFP nulle)</div>}
                        </div>
                      );
                    })()
                  )}
                  <div className="text-[10px] italic mt-1">Le SIRET, code NAF et N° sécu sont reportés dans le formulaire ci-dessous.</div>
                </div>
              )}
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Civilité</label>
                  <select value={civility} onChange={(e) => setCivility(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                    <option value="">—</option>
                    <option value="M.">M.</option>
                    <option value="Mme">Mme</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Prénom *</label>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nom *</label>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Date de naissance</label>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nom de naissance</label>
                  <input type="text" value={birthName} onChange={(e) => setBirthName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Téléphone</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Adresse — rue</label>
                <input type="text" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">CP</label>
                  <input type="text" value={addressPostalCode} onChange={(e) => setAddressPostalCode(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Ville</label>
                  <input type="text" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Statut professionnel</label>
                <input type="text" value={professionalStatus} onChange={(e) => setProfessionalStatus(e.target.value)} placeholder="Ex: Agent commercial" className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">SIRET (auto-entreprise)</label>
                  <input type="text" value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="14 chiffres" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono" />
                  <p className="text-[10px] text-muted-foreground mt-1">Si rempli : crée auto-entreprise + lien EI_SELF</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Code NAF</label>
                  <input type="text" value={activityCode} onChange={(e) => setActivityCode(e.target.value)} placeholder="Ex: 6831Z" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">N° de sécurité sociale</label>
                <input type="text" value={socialSecurityNb} onChange={(e) => setSocialSecurityNb(e.target.value)} placeholder="13 chiffres" className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">Stocké dans table SensitiveData (RGPD)</p>
              </div>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setOpen(false); reset(); }} disabled={busy} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted">Annuler</button>
                <button type="submit" disabled={busy || !firstName || !lastName} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">{busy ? 'Création…' : "Créer l'apprenant"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
