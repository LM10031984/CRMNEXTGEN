'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@qualiof/shared';
import { loginAction } from './actions';

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (data: LoginInput) => {
    setError(null);
    startTransition(async () => {
      const res = await loginAction(data);
      if (!res.ok) setError(res.error);
    });
  };

  // Style partagé pour les inputs — bord gris doux, focus bleu avec ring.
  const inputClass =
    'w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 shadow-soft transition-all duration-200 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:shadow-card';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          {...register('email')}
          className={inputClass}
          placeholder="vous@startacademy.fr"
        />
        {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-medium text-slate-700">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          className={inputClass}
          placeholder="••••••••"
        />
        {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-700 flex items-start gap-2.5 shadow-soft">
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="
          w-full h-11 rounded-xl
          bg-slate-900 text-white font-medium text-sm shadow-soft
          transition-all duration-300 ease-out
          hover:bg-slate-800 hover:-translate-y-0.5
          hover:shadow-[0_8px_24px_-4px_rgba(15,23,42,0.35),0_0_20px_rgba(15,23,42,0.18)]
          active:scale-[0.97]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-soft disabled:active:scale-100
        "
      >
        {isPending ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
