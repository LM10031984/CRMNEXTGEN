/**
 * Phase 8 RBAC-02 — Page publique `/invitation/[token]`.
 *
 * Server Component force-dynamic (jamais cache, lecture token fraîche à chaque requête).
 * Pattern miroir `/preinscription/[token]/page.tsx` : Server Component qui lit la
 * BDD, calcule 3 états (expired / used / fresh) et délègue le rendu :
 *   - notFound() si le token n'existe pas du tout
 *   - <ExpiredState />     si invitation.expiresAt < now()
 *   - <AlreadyUsedState /> si invitation.usedAt != null
 *   - <SetPasswordForm />  sinon (case nominale)
 *
 * Sécurité : aucune vérif `validateRequest()` — la route est publique, le token
 * EST l'authentification. L'action `acceptInvitation` re-valide atomiquement.
 *
 * Brand cohérente avec `/preinscription/[token]` : header "S" + footer Qualiopi/RGPD.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import { prisma } from '@qualiof/db';
import { SetPasswordForm } from '@/components/users/set-password-form';

export const dynamic = 'force-dynamic';

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invitation = await prisma.userInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      email: true,
      role: true,
      expiresAt: true,
      usedAt: true,
      userId: true,
      user: { select: { firstName: true } },
    },
  });

  if (!invitation) notFound();

  const expired = invitation.expiresAt < new Date();
  const used = invitation.usedAt != null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50/30">
      <header className="border-b border-border bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-white font-bold inline-flex items-center justify-center">
            S
          </div>
          <div>
            <div className="font-semibold">QualiOF — Start Academy</div>
            <div className="text-xs text-muted-foreground">Activation de votre compte</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {expired ? (
          <ExpiredState />
        ) : used ? (
          <AlreadyUsedState />
        ) : (
          <SetPasswordForm
            token={invitation.token}
            email={invitation.email}
            firstName={invitation.user?.firstName ?? null}
            role={invitation.role}
          />
        )}
      </main>

      <footer className="border-t border-border bg-white py-5 mt-10">
        <div className="max-w-3xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Données stockées en France · Qualiopi · RGPD
          </div>
          <div>© Start Academy {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}

function ExpiredState() {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-12 text-center space-y-4">
      <Clock className="h-12 w-12 text-red-600 mx-auto" />
      <h1 className="text-xl font-bold text-red-900">Ce lien a expiré</h1>
      <p className="text-sm text-red-800 max-w-md mx-auto">
        Le lien d'invitation n'est plus valable (les liens expirent après 7 jours).
        Contactez votre administrateur pour recevoir un nouveau lien.
      </p>
    </div>
  );
}

function AlreadyUsedState() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-12 text-center space-y-4">
      <CheckCircle2 className="h-12 w-12 text-emerald-700 mx-auto" />
      <h1 className="text-xl font-bold text-emerald-900">Invitation déjà acceptée</h1>
      <p className="text-sm text-emerald-800 max-w-md mx-auto">
        Vous avez déjà défini votre mot de passe via ce lien. Connectez-vous normalement
        avec votre email et le mot de passe que vous aviez choisi.
      </p>
      <Link
        href="/login"
        className="inline-block text-sm font-medium text-primary underline"
      >
        Aller à la page de connexion
      </Link>
    </div>
  );
}
