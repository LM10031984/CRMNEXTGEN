'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { MoreHorizontal, FileText, Receipt, Loader2, ExternalLink, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generateConventionForParticipant } from '@/server/actions/convention-generator';
import { generateProgrammeForParticipant } from '@/server/actions/programme-generator';
import { generateAgeficeForParticipant } from '@/server/actions/agefice-generator';
import { unenrollParticipant } from '@/server/actions/sessions';

interface DocLink {
  type: 'CONVENTION' | 'PROGRAMME' | 'AGEFICE';
  documentId: string;
  label: string;
}

export function ParticipantActionsMenu({
  participantId,
  participantName,
  showAgefice,
  initialDocs,
}: {
  participantId: string;
  participantName: string;
  showAgefice: boolean;
  initialDocs: { CONVENTION?: string | null; PROGRAMME?: string | null; AGEFICE?: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [docs, setDocs] = useState<{ CONVENTION?: string | null; PROGRAMME?: string | null; AGEFICE?: string | null }>(initialDocs);
  const [activeKind, setActiveKind] = useState<DocLink['type'] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleUnenroll() {
    startTransition(async () => {
      try {
        const r = await unenrollParticipant(participantId);
        if (r.ok) {
          toast.success(`${participantName} désinscrit(e) de la session`);
          setConfirmOpen(false);
          router.refresh();
        } else {
          toast.error(r.error ?? 'Erreur lors de la désinscription');
        }
      } catch (e: any) {
        toast.error(`Erreur : ${e?.message ?? String(e)}`);
      }
    });
  }

  function generate(kind: DocLink['type']) {
    setActiveKind(kind);
    startTransition(async () => {
      try {
        const fn =
          kind === 'CONVENTION' ? generateConventionForParticipant
          : kind === 'PROGRAMME' ? generateProgrammeForParticipant
          : generateAgeficeForParticipant;
        const r = await fn(participantId);
        if (r?.ok && r.documentId) {
          setDocs((d) => ({ ...d, [kind]: r.documentId }));
          toast.success(`${kind === 'CONVENTION' ? 'Convention' : kind === 'PROGRAMME' ? 'Programme' : 'AGEFICE'} généré`);
          window.open(`/api/documents/${r.documentId}`, '_blank');
          router.refresh();
        } else {
          toast.error(r?.error ?? 'Erreur génération');
        }
      } catch (e: any) {
        toast.error(`Erreur : ${e?.message ?? String(e)}`);
      } finally {
        setActiveKind(null);
      }
    });
  }

  const chip = (kind: DocLink['type'], icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>, color: string) => {
    const Icon = icon;
    const docId = docs[kind];
    if (!docId) return null;
    return (
      <a
        key={kind}
        href={`/api/documents/${docId}`}
        target="_blank"
        rel="noreferrer"
        title={`${kind === 'CONVENTION' ? 'Convention' : kind === 'PROGRAMME' ? 'Programme' : 'AGEFICE'} prêt — ouvrir`}
        className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md hover:opacity-80 transition-opacity', color)}
      >
        <Icon className="h-3.5 w-3.5" />
      </a>
    );
  };

  // Bouton "Générer" inline pour AGEFICE quand le doc n'existe pas encore.
  // Évite que Laurent doive ouvrir le dropdown "···" pour générer (frustration
  // signalée 03/05 — le bouton AGEFICE était devenu invisible après refonte).
  const generateChip = (kind: DocLink['type'], icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>, color: string, label: string) => {
    const Icon = icon;
    if (docs[kind]) return null; // déjà généré : on affiche le chip de lien à la place
    return (
      <button
        key={`gen-${kind}`}
        type="button"
        disabled={pending}
        onClick={() => generate(kind)}
        title={`${label} — pas encore généré, cliquer pour générer`}
        className={cn(
          'inline-flex items-center justify-center h-7 px-2 gap-1 rounded-md text-[11px] font-medium hover:opacity-80 transition-opacity border border-dashed',
          color,
          pending && 'opacity-60 cursor-wait',
        )}
      >
        {pending && activeKind === kind ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
        {label}
      </button>
    );
  };

  return (
    <>
    <div className="flex items-center gap-1 shrink-0">
      {chip('CONVENTION', FileText, 'bg-sky-100 text-sky-800')}
      {chip('PROGRAMME', FileText, 'bg-amber-100 text-amber-800')}
      {showAgefice && chip('AGEFICE', Receipt, 'bg-amber-100 text-amber-800')}
      {showAgefice && generateChip('AGEFICE', Receipt, 'bg-amber-50 text-amber-700 border-amber-300', 'Générer AGEFICE')}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-300 ease-out active:scale-[0.97]"
            aria-label={`Actions pour ${participantName}`}
            title="Actions"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[220px] rounded-md border border-border bg-white p-1 shadow-lg animate-in fade-in zoom-in-95"
          >
            <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold border-b border-border mb-1">
              Documents
            </div>
            <DropdownMenu.Item
              disabled={pending}
              onSelect={(e) => { e.preventDefault(); generate('CONVENTION'); }}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-sky-700" />
                {docs.CONVENTION ? 'Régénérer convention' : 'Générer convention'}
              </span>
              {docs.CONVENTION && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={pending}
              onSelect={(e) => { e.preventDefault(); generate('PROGRAMME'); }}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-amber-700" />
                {docs.PROGRAMME ? 'Régénérer programme' : 'Générer programme'}
              </span>
              {docs.PROGRAMME && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
            </DropdownMenu.Item>
            {showAgefice && (
              <DropdownMenu.Item
                disabled={pending}
                onSelect={(e) => { e.preventDefault(); generate('AGEFICE'); }}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
              >
                <span className="inline-flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5 text-amber-700" />
                  {docs.AGEFICE ? 'Régénérer AGEFICE' : 'Générer AGEFICE'}
                </span>
                {docs.AGEFICE && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
              </DropdownMenu.Item>
            )}
            {/* Action destructive — Désinscrire le participant (RBAC ADMIN+MANAGER server-side) */}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              disabled={pending}
              onSelect={(e) => {
                // Empêcher la fermeture du dropdown d'avaler l'ouverture du Dialog
                e.preventDefault();
                setConfirmOpen(true);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-sm cursor-pointer outline-none text-red-700 data-[highlighted]:bg-red-50"
            >
              <UserMinus className="h-3.5 w-3.5" />
              Désinscrire
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {activeKind ? <span className="hidden">{activeKind}</span> : null}
    </div>
    {/* Dialog de confirmation — Portal hors flex shrink-0 du conteneur ci-dessus */}
    <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[440px] max-w-[90vw] rounded-lg border border-border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <Dialog.Title className="text-lg font-semibold">
            Désinscrire {participantName} ?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Cette action est définitive. L&apos;inscription sera supprimée de la session.
            Les documents déjà générés (convention, programme, AGEFICE) restent
            disponibles dans la fiche apprenant.
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={pending}
                className="h-9 px-4 rounded-md border border-input bg-white text-sm font-medium hover:bg-muted transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-60"
              >
                Annuler
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={pending}
              onClick={handleUnenroll}
              className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-all duration-300 ease-out active:scale-[0.97] disabled:opacity-60 inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Désinscrire
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}
