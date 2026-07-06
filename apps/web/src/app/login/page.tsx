import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const { user } = await validateRequest();
  if (user) redirect('/app');
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-background to-primary-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-border p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white text-xl font-bold">
              Q
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">QualiOF</h1>
            <p className="text-sm text-muted-foreground">Connectez-vous pour accéder à votre espace</p>
          </div>
          <LoginForm />
        </div>
        {/* Indice de compte réservé au dev local : ne JAMAIS afficher l'email
            admin sur une URL publique (staging/prod Vercel). */}
        {process.env.NODE_ENV === 'development' && (
          <p className="text-center text-xs text-muted-foreground mt-6">
            Compte de démonstration : <code className="font-mono">admin@startacademy.fr</code> /{' '}
            <code className="font-mono">admin</code>
          </p>
        )}
      </div>
    </div>
  );
}
