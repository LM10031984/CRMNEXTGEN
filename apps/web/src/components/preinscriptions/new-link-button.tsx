'use client';

import { useState, useTransition } from 'react';
import { Plus, Copy, Check, Mail, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPreEnrollmentLink } from '@/server/actions/preinscriptions';

export function NewLinkButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setGeneratedUrl(null);
    setCopied(false);
    setError(null);
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const r = await createPreEnrollmentLink({
        email: email.trim() || undefined,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      if (r.ok && r.url) {
        setGeneratedUrl(r.url);
      } else {
        setError(r.error ?? 'Erreur');
      }
    });
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
      >
        <Plus className="h-4 w-4" /> Nouveau formulaire
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setOpen(false); reset(); }}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                {generatedUrl ? '🎉 Lien généré' : 'Nouveau formulaire de pré-inscription'}
              </h2>
              <button type="button" onClick={() => { setOpen(false); reset(); }} className="h-7 w-7 rounded-md hover:bg-muted inline-flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!generatedUrl ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Renseigne (optionnellement) le contact à qui tu enverras le lien.
                  Tu pourras laisser vide et juste partager le lien généré.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">Prénom</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-md border border-input text-sm"
                      placeholder="Jean"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">Nom</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-md border border-input text-sm"
                      placeholder="DUPONT"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">
                    Email <span className="text-muted-foreground">(optionnel)</span>
                  </label>
                  <div className="mt-1 relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-md border border-input text-sm"
                      placeholder="contact@example.fr"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    L'email n'est pas envoyé automatiquement pour l'instant — tu copieras le lien manuellement.
                  </p>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); reset(); }}
                    className="h-9 px-4 rounded-md border border-input text-sm"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending}
                    className={cn(
                      'h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors',
                      pending && 'opacity-70 cursor-wait',
                    )}
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Générer le lien'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Voici le lien à partager avec ton contact. Il est valable <strong>30 jours</strong>.
                  Le contact pourra y déposer sa CNI, son RIB et son attestation CFP AGEFICE.
                </p>
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    value={generatedUrl}
                    readOnly
                    className="flex-1 h-10 px-3 rounded-md border border-input text-xs bg-muted/30 font-mono"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={cn(
                      'h-10 px-3 rounded-md inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
                      copied ? 'bg-emerald-100 text-emerald-700' : 'bg-primary text-white hover:bg-primary-600',
                    )}
                  >
                    {copied ? <><Check className="h-4 w-4" /> Copié</> : <><Copy className="h-4 w-4" /> Copier</>}
                  </button>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  💡 Une fois le formulaire rempli, l'IA analysera les pièces et tu recevras une notification dans <strong>/app/inscriptions</strong>.
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); reset(); }}
                    className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
