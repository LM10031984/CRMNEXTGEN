'use client';

import { useState, useTransition } from 'react';
import { Plus, Copy, Check, Mail, Loader2, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPreEnrollmentLink } from '@/server/actions/preinscriptions';

export function NewLinkButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'none' | 'sent' | 'dryrun' | 'failed'>('none');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setGeneratedUrl(null);
    setEmailStatus('none');
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
        if (email.trim()) {
          setEmailStatus(r.emailSent ? 'sent' : r.emailDryRun ? 'dryrun' : 'failed');
        } else {
          setEmailStatus('none');
        }
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

  /**
   * Validation sync des 3 champs (Prénom + Nom + Email valide).
   * Utilisé par "Ouvrir directement" → si KO, accès au formulaire refusé.
   */
  const directOpenValidation = (): string | null => {
    if (!firstName.trim()) return 'Renseigne le prénom du contact.';
    if (!lastName.trim()) return 'Renseigne le nom du contact.';
    if (!email.trim()) return "Renseigne l'email du contact.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "L'email n'est pas valide.";
    return null;
  };

  const directOpenInvalidReason = directOpenValidation();

  /**
   * Génère le lien ET ouvre directement le formulaire dans un nouvel onglet.
   * Astuce popup-blocker : on ouvre un onglet `about:blank` AVANT l'await
   * (depuis le click sync), puis on redirige une fois l'URL reçue.
   */
  const handleOpenDirectly = () => {
    const reason = directOpenValidation();
    if (reason) {
      setError(reason);
      return;
    }
    setError(null);
    // Pré-ouvre un onglet vide depuis le user gesture → contourne le popup-blocker
    const win = window.open('about:blank', '_blank', 'noopener,noreferrer');
    startTransition(async () => {
      const r = await createPreEnrollmentLink({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (r.ok && r.url) {
        if (win) win.location.href = r.url;
        setOpen(false);
        reset();
      } else {
        if (win) win.close();
        setError(r.error ?? 'Erreur lors de la génération du lien.');
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)] transition-all duration-300 ease-out active:scale-[0.97]"
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
                <div className="grid grid-cols-2 gap-3">
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
                    Si renseigné, le lien sera <strong>envoyé automatiquement par email</strong> au contact.
                  </p>
                </div>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 inline-flex items-start gap-2">
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                {/* CTA shortcut Aurora — génère + ouvre directement le formulaire */}
                <button
                  type="button"
                  onClick={handleOpenDirectly}
                  disabled={pending}
                  title={directOpenInvalidReason ?? 'Génère le lien et ouvre le formulaire dans un nouvel onglet'}
                  className={cn(
                    'group relative w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ease-out',
                    directOpenInvalidReason
                      // Accès refusé : disabled visuel + curseur not-allowed (Prénom/Nom/Email manquants ou invalides)
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed ring-1 ring-slate-200'
                      // Valide : gradient Aurora violet→bleu + glow violet + lift au hover
                      : 'bg-gradient-to-br from-violet-600 via-blue-600 to-primary text-white shadow-soft hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-4px_rgba(124,58,237,0.5),0_0_24px_rgba(124,58,237,0.3)] active:scale-[0.97]',
                    pending && 'opacity-70 cursor-wait',
                  )}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" strokeWidth={2} />
                      Ouvrir directement le formulaire
                      {!directOpenInvalidReason && (
                        <span aria-hidden className="ml-1 text-white/70 group-hover:translate-x-0.5 transition-transform duration-300">↗</span>
                      )}
                    </>
                  )}
                </button>

                {/* Helper text discret quand l'accès direct est refusé */}
                {directOpenInvalidReason && (
                  <p className="text-[11px] text-slate-500 -mt-1 ml-1">
                    🔒 Renseigne <strong>Prénom + Nom + Email valide</strong> pour ouvrir directement.
                  </p>
                )}

                {/* Séparateur "ou" subtil */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">ou envoyer le lien</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Boutons standards */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); reset(); }}
                    className="inline-flex items-center h-9 px-3.5 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-300 ease-out active:scale-[0.97]"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending}
                    className={cn(
                      'inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)] transition-all duration-300 ease-out active:scale-[0.97]',
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
                {emailStatus === 'sent' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 inline-flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    Email envoyé automatiquement à <strong>{email}</strong>.
                  </div>
                )}
                {emailStatus === 'dryrun' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    ⚠️ SMTP non configuré (mode dry-run). Le lien n'a pas été envoyé par email — copie-le manuellement ci-dessous.
                  </div>
                )}
                {emailStatus === 'failed' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    ⚠️ L'email n'a pas pu être envoyé (erreur SMTP). Copie le lien manuellement ci-dessous.
                  </div>
                )}
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
                      'h-10 px-3 rounded-md inline-flex items-center gap-1.5 text-sm font-medium transition-all duration-300 ease-out active:scale-[0.97]',
                      copied ? 'bg-emerald-100 text-emerald-700' : 'bg-primary text-white hover:bg-primary-600',
                    )}
                  >
                    {copied ? <><Check className="h-4 w-4" /> Copié</> : <><Copy className="h-4 w-4" /> Copier</>}
                  </button>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  💡 Une fois le formulaire rempli, l'IA analysera les pièces et tu recevras une notification dans <strong>/app/preinscriptions</strong>.
                </div>
                <div className="flex items-center justify-between gap-2 pt-2">
                  {/* CTA gauche : ouvre le formulaire dans un nouvel onglet (use-case commercial au tel) */}
                  <a
                    href={generatedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-white text-slate-700 border border-slate-200 text-sm font-medium shadow-soft hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 hover:-translate-y-0.5 hover:shadow-[0_0_15px_rgba(241,245,249,0.8),0_4px_12px_-2px_rgba(15,23,42,0.08)] transition-all duration-300 ease-out active:scale-[0.97]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} /> Ouvrir le formulaire
                  </a>
                  {/* CTA droit : ferme la modale */}
                  <button
                    type="button"
                    onClick={() => { setOpen(false); reset(); }}
                    className="inline-flex items-center h-9 px-4 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(15,23,42,0.35),0_0_20px_rgba(15,23,42,0.18)] transition-all duration-300 ease-out active:scale-[0.97]"
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
