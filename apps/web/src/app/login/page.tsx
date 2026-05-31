import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const { user } = await validateRequest();
  if (user) redirect('/app');
  return (
    <div className="min-h-screen relative flex items-center justify-center bg-slate-50 p-4 overflow-hidden">
      {/* Décor : 2 blobs gradient floutés en arrière-plan (style Stripe/Linear) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-gradient-to-br from-blue-200/40 to-primary-100/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-gradient-to-br from-violet-200/30 to-primary-100/40 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        {/* Carte de connexion */}
        <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-elevated p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-primary-600 to-primary-800 text-white text-xl font-bold shadow-card ring-1 ring-white/20">
              Q
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">QualiOF</h1>
              <p className="text-sm text-slate-500 mt-1">Connectez-vous pour accéder à votre espace</p>
            </div>
          </div>
          <LoginForm />
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Compte de démonstration : <code className="font-mono bg-white ring-1 ring-slate-200 rounded px-1.5 py-0.5 text-slate-700 shadow-soft">admin@startacademy.fr</code>{' '}
          / <code className="font-mono bg-white ring-1 ring-slate-200 rounded px-1.5 py-0.5 text-slate-700 shadow-soft">admin</code>
        </p>
      </div>
    </div>
  );
}
