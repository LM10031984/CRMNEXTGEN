'use client';

import { useState, useTransition } from 'react';
import { updateLegalLink } from '@/server/actions/legal-links';
import { calendarDay } from '@/lib/persons/legal-link-period';

const roles = [
  ['DIRIGEANT', 'Dirigeant'], ['SALARIE', 'Salarié'], ['EI_SELF', 'Auto-entrepreneur (EI)'],
  ['AGENT_COMMERCIAL', 'Agent commercial'], ['ALTERNANT', 'Alternant'], ['STAGIAIRE', 'Stagiaire'],
  ['CONTACT', 'Contact'], ['FINANCEUR_CONTACT', 'Contact financeur'], ['FORMATEUR', 'Formateur'],
] as const;
type Props = { link: { id: string; role: string; startDate: Date | string | null; endDate: Date | string | null; function: string | null } };
type EditInput = Parameters<typeof updateLegalLink>[0];
type Preview = Extract<Awaited<ReturnType<typeof updateLegalLink>>, { ok: true }>;
const fieldClass = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm';

export function LegalLinkPeriodEditor({ link }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('dates');
  const [role, setRole] = useState<NonNullable<EditInput['changeRole']>['role']>(link.role === 'SALARIE' ? 'DIRIGEANT' : 'SALARIE');
  const [startDate, setStartDate] = useState(link.startDate ? calendarDay(link.startDate) : '');
  const [endDate, setEndDate] = useState(link.endDate ? calendarDay(link.endDate) : '');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [job, setJob] = useState(link.function ?? '');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ result: Preview; input: EditInput } | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(apply: boolean) {
    const input: EditInput = apply && review ? review.input : mode === 'role'
      ? { linkId: link.id, changeRole: { role, effectiveDate } }
      : { linkId: link.id, startDate: startDate || null, endDate: endDate || null, function: job || null };
    setError(null);
    startTransition(async () => {
      const result = await updateLegalLink({ ...input, apply, confirmationKey: apply ? review?.result.confirmationKey : undefined });
      if (!result.ok) { setError(result.error); setReview(null); return; }
      if (apply || !result.preview) { setOpen(false); setReview(null); return; }
      setReview({ result, input });
    });
  }
  const label = (role: string) => roles.find(([value]) => value === role)?.[1] ?? role;
  if (!open) return <button type="button" className="mt-2 text-xs font-medium text-primary" onClick={() => setOpen(true)}>Modifier le rattachement</button>;
  return <div className="mt-3 space-y-3 rounded-md border border-border p-3">
    <p className="text-sm font-medium">Période du rattachement</p>
    <p className="text-xs text-muted-foreground">Un changement de rôle termine l’ancienne période et en ouvre une nouvelle dans la même organisation.</p>
    <fieldset disabled={pending || !!review} className="space-y-3 disabled:opacity-60">
      <label className="block text-xs">Opération<select className={fieldClass} value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="dates">Modifier les dates ou terminer le rattachement</option><option value="role">Changer de rôle</option>
      </select></label>
      {mode === 'role' ? <>
        <label className="block text-xs">Nouveau rôle<select className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          {roles.filter(([value]) => value !== link.role).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        <label className="block text-xs">À partir du<input type="date" className={fieldClass} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label>
      </> : <>
        <label className="block text-xs">Début de période<input type="date" className={fieldClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label className="block text-xs">Fin de période incluse<input type="date" className={fieldClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label className="block text-xs">Fonction<input className={fieldClass} value={job} onChange={(e) => setJob(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">Une date vide laisse cette borne ouverte.</p>
      </>}
    </fieldset>
    {review?.result.preview && <div className="rounded bg-muted p-3 text-sm" role="status">
      <p>{label(review.result.preview.after.role)} : {review.result.preview.after.startDate ?? 'début non renseigné'} → {review.result.preview.after.endDate ?? 'sans fin'}</p>
      {review.result.preview.next && <p>{label(review.result.preview.next.role)} : à partir du {review.result.preview.next.startDate}</p>}
      <p className="mt-1 text-xs">L’historique sera conservé. Aucun document ni dossier existant ne sera réécrit.</p>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={pending} className="text-sm text-primary" onClick={() => submit(!!review)}>{pending ? 'Vérification…' : review ? 'Confirmer les changements' : 'Vérifier les changements'}</button>
      {review && <button type="button" className="text-sm" onClick={() => setReview(null)}>Revenir aux dates</button>}
      <button type="button" className="text-sm text-muted-foreground" onClick={() => { setOpen(false); setReview(null); }}>Annuler</button>
    </div>
  </div>;
}
