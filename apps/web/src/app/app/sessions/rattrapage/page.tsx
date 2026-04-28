import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Sparkles } from 'lucide-react';
import { validateRequest } from '@/lib/auth';
import { getSessionGaps } from '@/server/actions/session-gaps';
import { PageHeader } from '@/components/ui/page-header';
import { GapRow } from '@/components/sessions/gap-row';

export default async function RattrapagePage() {
  const { user } = await validateRequest();
  if (!user) return null;

  let data;
  try {
    data = await getSessionGaps();
  } catch (err) {
    return (
      <div className="space-y-6 max-w-3xl">
        <PageHeader title="Rattrapage des inscriptions" />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <strong>Erreur :</strong> {(err as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href="/app/sessions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux sessions
      </Link>

      <PageHeader
        title="Rattrapage des inscriptions"
        subtitle={
          data.totalMissing === 0
            ? '🎉 Aucun écart détecté entre l\'Excel SmartOF et la base.'
            : `${data.totalMissing} apprenant${data.totalMissing > 1 ? 's' : ''} cité${data.totalMissing > 1 ? 's' : ''} dans l'Excel SmartOF mais non inscrit${data.totalMissing > 1 ? 's' : ''} en base, sur ${data.total} session${data.total > 1 ? 's' : ''}.`
        }
      />

      {data.totalMissing > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary-50/30 p-5 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">Comment ça marche</p>
            <p className="text-muted-foreground">
              Pour chaque apprenant manquant, on te propose les candidats les plus probables (par
              similarité de nom). Clique pour valider l'inscription. Si l'apprenant a plusieurs
              casquettes (cas EI), tu choisis quelle organisation paye. <strong>Tu ne risques jamais
              d'oublier une inscription</strong> — la liste se vide au fur et à mesure.
            </p>
          </div>
        </div>
      )}

      {data.sessions.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="font-semibold text-emerald-900">Rien à rattraper !</h2>
          <p className="text-sm text-emerald-700 mt-1">
            Toutes les inscriptions de l'Excel sont déjà en base.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.sessions.map((gap) => (
            <GapRow key={gap.sessionId} gap={gap} />
          ))}
        </div>
      )}

      {data.sessions.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-6">
          <h3 className="font-semibold mb-2 inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Apprenants candidats absents ?
          </h3>
          <p className="text-sm text-muted-foreground">
            Si un apprenant Excel n'a aucun candidat dans la liste, c'est probablement qu'il n'existe
            pas dans la base contacts. Va sur <Link href="/app/apprenants" className="text-primary hover:underline">
            la page Apprenants</Link> pour le créer manuellement, puis reviens ici.
          </p>
        </div>
      )}
    </div>
  );
}
