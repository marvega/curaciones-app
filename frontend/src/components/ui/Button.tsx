import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

type ButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' };
type ButtonAsAnchor = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a'; href: string };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  secondary:
    'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
  ghost:
    'text-slate-700 hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800',
  link: 'text-blue-600 hover:text-blue-700 underline underline-offset-2',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-lg font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    const {
      variant = 'primary',
      size = 'md',
      loading,
      leftIcon,
      rightIcon,
      children,
      className,
      ...rest
    } = props as ButtonProps & { className?: string };

    const classes = cn(
      BASE_CLASSES,
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      className,
    );

    const inner = (
      <>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </>
    );

    if ((rest as { as?: string }).as === 'a') {
      const { as: _as, ...anchorProps } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a' };
      return (
        <a
          {...anchorProps}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={classes}
          aria-busy={loading || undefined}
        >
          {inner}
        </a>
      );
    }

    const { as: _as, disabled, ...buttonProps } = rest as ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' };
    return (
      <button
        {...buttonProps}
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {inner}
      </button>
    );
  },
);
