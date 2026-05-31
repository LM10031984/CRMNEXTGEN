import Link from 'next/link';
import { Inbox, Clock, Sparkles, CheckCircle2, XCircle, AlertCircle, ChevronRight, Mail } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { NewLinkButton } from '@/components/preinscriptions/new-link-button';
import { DocsCompletionBadge } from '@/components/preinscriptions/docs-completion-badge';

export const dynamic = 'force-dynamic';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_LABEL: Record<string, { label: string; variant: 'muted' | 'info' | 'warning' | 'success' | 'danger'; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING_FORM: { label: 'Lien envoyé · attente', variant: 'muted', icon: Clock },
  SUBMITTED: { label: 'Reçu · à analyser', variant: 'info', icon: Inbox },
  EXTRACTING: { label: 'IA en cours…', variant: 'info', icon: Sparkles },
  EXTRACTED: { label: 'À valider', variant: 'warning', icon: AlertCircle },
  VALIDATED: { label: 'Validé', variant: 'success', icon: CheckCircle2 },
  CONVERTED: { label: 'Converti en apprenant', variant: 'success', icon: CheckCircle2 },
  EXPIRED: { label: 'Expiré', variant: 'danger', icon: XCircle },
  REJECTED: { label: 'Rejeté', variant: 'danger', icon: XCircle },
};

export default async function PreinscriptionsPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const [rows, counts] = await Promise.all([
    prisma.preEnrollment.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        token: true,
        status: true,
        firstName: true,
        lastName: true,
        email: true,
        sentAt: true,
        submittedAt: true,
        expiresAt: true,
        createdAt: true,
        validatedAt: true,
        convertedAt: true,
        cniKey: true,
        ribKey: true,
        cfpKey: true,
      },
    }),
    prisma.preEnrollment.groupBy({
      by: ['status'],
      where: { tenantId: user.tenantId },
      _count: true,
    }),
  ]);

  const counter = (status: string) =>
    counts.find((c) => c.status === status)?._count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pré-inscriptions"
        subtitle="Génère un lien à envoyer à tes contacts. Ils déposent leurs pièces, l'IA extrait les données, tu valides en 1 clic."
        actions={<NewLinkButton />}
      />

      {/* Bandeau KPI — cartes icône cercle, cohérent avec PrioCard du dashboard */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiPill icon={Clock} label="Liens envoyés" value={counter('PENDING_FORM')} tone="default" />
        <KpiPill icon={AlertCircle} label="À valider" value={counter('SUBMITTED') + counter('EXTRACTING') + counter('EXTRACTED')} tone="warning" />
        <KpiPill icon={CheckCircle2} label="Convertis" value={counter('CONVERTED')} tone="success" />
        <KpiPill icon={XCircle} label="Expirés / rejetés" value={counter('EXPIRED') + counter('REJECTED')} tone="muted" />
      </section>

      {/* Liste — cartes empilées avec avatar initiales, plus humain qu'un tableau dense */}
      <section className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex h-10 w-10 mb-3 rounded-lg bg-slate-100 text-slate-400 items-center justify-center">
              <Inbox className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-sm font-medium text-slate-900">Aucune pré-inscription</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Clique sur <span className="font-medium text-slate-700">Nouveau formulaire</span> pour générer un lien à partager avec un contact.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const s = STATUS_LABEL[r.status];
              const Icon = s?.icon ?? Inbox;
              const expired = r.status === 'PENDING_FORM' && r.expiresAt < new Date();
              return (
                <li key={r.id}>
                  <Link
                    href={`/app/preinscriptions/${r.id}`}
                    className="group flex items-center gap-4 py-3 px-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {/* Avatar initiales avec couleur déterministe (hash sur seed) */}
                    <div className={cardAvatar(r.firstName, r.lastName)}>
                      {initials(r.firstName, r.lastName)}
                    </div>

                    {/* Nom + email */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {r.firstName || r.lastName ? (
                          <>{r.firstName} {r.lastName}</>
                        ) : (
                          <span className="text-slate-400 italic">— anonyme —</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        {r.email ? (
                          <>
                            <Mail className="h-3 w-3 shrink-0 text-slate-400" strokeWidth={1.75} />
                            <span className="truncate">{r.email}</span>
                          </>
                        ) : (
                          <span className="italic text-slate-400">pas d&apos;email</span>
                        )}
                      </div>
                    </div>

                    {/* Documents — masqué sur mobile */}
                    <div className="hidden md:block shrink-0">
                      <DocsCompletionBadge
                        cni={!!r.cniKey}
                        rib={!!r.ribKey}
                        cfp={!!r.cfpKey}
                        variant="compact"
                      />
                    </div>

                    {/* Date contextuelle — texte simple sans label uppercase */}
                    <div className="hidden lg:block text-right shrink-0 min-w-[120px]">
                      <div className="text-xs text-slate-500">
                        {r.submittedAt ? 'Reçu' : 'Émis'} <span className="tabular-nums text-slate-700">{fmtDate.format(r.submittedAt ?? r.createdAt)}</span>
                      </div>
                    </div>

                    {/* Statut */}
                    <div className="shrink-0">
                      <Badge variant={expired ? 'danger' : (s?.variant ?? 'muted')}>
                        <Icon className="h-3 w-3" /> {expired ? 'Expiré' : (s?.label ?? r.status)}
                      </Badge>
                    </div>

                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" strokeWidth={1.75} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {rows.length > 0 && (
        <p className="text-xs text-slate-500 italic">
          💡 Un lien expiré peut être régénéré par sécurité. Une pré-inscription validée crée
          automatiquement un Person + une Organization EI + un AgeficeProfile pré-rempli.
        </p>
      )}
    </div>
  );
}

// ───────── helpers locaux ─────────

function initials(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? '').trim().charAt(0).toUpperCase();
  const b = (lastName ?? '').trim().charAt(0).toUpperCase();
  return (a + b) || '?';
}

/** Avatar circulaire avec couleur déterministe (hash sur initiales). */
function cardAvatar(firstName?: string | null, lastName?: string | null): string {
  const base = 'inline-flex items-center justify-center h-11 w-11 rounded-full text-sm font-bold shrink-0 shadow-card ring-2 ring-white text-white bg-gradient-to-br';
  const seed = ((firstName ?? '') + (lastName ?? '')).toLowerCase();
  if (!seed) return `${base} from-slate-300 to-slate-400`;
  // Palette pastel cohérente avec le reste du CRM.
  const palettes = [
    'from-blue-400 to-blue-600',
    'from-violet-400 to-violet-600',
    'from-emerald-400 to-emerald-600',
    'from-rose-400 to-rose-600',
    'from-amber-400 to-amber-600',
    'from-sky-400 to-sky-600',
    'from-fuchsia-400 to-fuchsia-600',
    'from-teal-400 to-teal-600',
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `${base} ${palettes[Math.abs(h) % palettes.length]}`;
}

function KpiPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: number;
  tone: 'default' | 'success' | 'warning' | 'muted';
}) {
  // KPI Folk-style : carte sobre border-slate-200 + shadow-sm, icône en haut
  // à droite, chiffre dominant, label discret. Tone ne change que la couleur
  // d'icône (cohérent avec le minimalisme Folk).
  const iconColor = {
    success: 'text-green-600',
    warning: 'text-amber-600',
    muted: 'text-slate-400',
    default: 'text-blue-600',
  }[tone];

  return (
    <div className="rounded-2xl ring-1 ring-slate-200/70 bg-white shadow-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={1.75} />
      </div>
      <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
