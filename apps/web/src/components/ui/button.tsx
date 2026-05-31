import { cn } from '@/lib/utils';
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Système de boutons partagé — SaaS Haut de Gamme (Stripe/Linear/Vercel).
 *
 * Micro-interactions premium :
 *  - Fluidité : `transition-all duration-300 ease-out` (courbe douce)
 *  - Tactile : `active:scale-[0.97]` (enfoncement physique au clic)
 *  - Élévation : `hover:-translate-y-0.5` (le bouton se soulève de 2px)
 *  - Rayonnement (glow) : `hover:shadow-[arbitrary]` projette une lumière
 *    diffuse de la couleur du bouton — slate pour dark, primary pour primary,
 *    emerald pour success, red pour danger, slate-100 ambient pour outline/ghost.
 *
 * Variants :
 *  - `dark`     — CTA primaire SaaS, slate-900 (style Linear/Vercel)
 *  - `primary`  — Charte Start Academy (#00527A), pour actions "métier"
 *  - `outline`  — Secondaire blanc, hover border-slate-400 + glow ambient
 *  - `ghost`    — Sans fond, hover slate-100 + glow subtil
 *  - `success`  — Validation forte (emerald) + glow vert
 *  - `danger`   — Action destructive (red) + glow rouge
 *  - `link`     — Style ancre, primary souligné (pas de transform)
 *
 * Sizes : sm (h-9), default (h-10), lg (h-12), icon (carré).
 *
 * Note layout : `translate-y` et `scale` sont des transforms GPU — ils
 * n'occasionnent PAS de reflow. Le footprint du bouton reste stable.
 */

export type ButtonVariant =
  | 'dark'
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'success'
  | 'danger'
  | 'link';

export type ButtonSize = 'sm' | 'default' | 'lg' | 'icon';

const BASE = [
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
  'font-medium select-none',
  // Fluidité totale : courbe douce qui finit lentement → sensation premium
  'transition-all duration-300 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
  // Tactile : le bouton s'enfonce physiquement au clic
  'active:scale-[0.97]',
  // Disabled : neutralise toutes les micro-interactions
  'disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100',
].join(' ');

const VARIANTS: Record<ButtonVariant, string> = {
  // Glow slate diffus + soulèvement 2px
  dark: [
    'bg-slate-900 text-white shadow-soft',
    'hover:bg-slate-800 hover:-translate-y-0.5',
    'hover:shadow-[0_8px_24px_-4px_rgba(15,23,42,0.35),0_0_20px_rgba(15,23,42,0.18)]',
    'focus-visible:ring-slate-300',
  ].join(' '),
  // Glow primary Start Academy (#00527A → rgba(0,82,122))
  primary: [
    'bg-gradient-to-br from-primary to-primary-700 text-white shadow-soft',
    'hover:from-primary-600 hover:to-primary-800 hover:-translate-y-0.5',
    'hover:shadow-[0_8px_24px_-4px_rgba(0,82,122,0.45),0_0_20px_rgba(0,82,122,0.25)]',
    'focus-visible:ring-primary-200',
  ].join(' '),
  // Outline : adaptation subtile bordure + texte + glow ambient slate-100
  outline: [
    'bg-white text-slate-700 border border-slate-200 shadow-soft',
    'hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 hover:-translate-y-0.5',
    'hover:shadow-[0_0_15px_rgba(241,245,249,0.8),0_4px_12px_-2px_rgba(15,23,42,0.08)]',
    'focus-visible:ring-slate-200',
  ].join(' '),
  // Ghost : changement de couleur + glow ambient discret (pas de translate pour rester ancré)
  ghost: [
    'bg-transparent text-slate-600',
    'hover:bg-slate-100 hover:text-slate-900',
    'hover:shadow-[0_0_15px_rgba(241,245,249,0.8)]',
    'focus-visible:ring-slate-200',
  ].join(' '),
  // Glow emerald
  success: [
    'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-soft',
    'hover:from-emerald-600 hover:to-emerald-700 hover:-translate-y-0.5',
    'hover:shadow-[0_8px_24px_-4px_rgba(16,185,129,0.45),0_0_20px_rgba(16,185,129,0.25)]',
    'focus-visible:ring-emerald-200',
  ].join(' '),
  // Glow red
  danger: [
    'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-soft',
    'hover:from-red-600 hover:to-red-700 hover:-translate-y-0.5',
    'hover:shadow-[0_8px_24px_-4px_rgba(239,68,68,0.45),0_0_20px_rgba(239,68,68,0.25)]',
    'focus-visible:ring-red-200',
  ].join(' '),
  // Link : pas de transform (resterait collé au texte autour)
  link: [
    'bg-transparent text-primary underline-offset-4',
    'hover:underline hover:text-primary-700',
    'focus-visible:ring-primary-200 active:scale-100',
  ].join(' '),
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg',
  default: 'h-10 px-4 text-sm rounded-xl',
  lg: 'h-12 px-6 text-base rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
};

export function buttonStyles({
  variant = 'dark',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'dark', size = 'default', className, children, type = 'button', ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonStyles({ variant, size, className })}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
