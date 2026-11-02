import { forwardRef } from 'react';
import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900 disabled:bg-red-300',
  ghost: 'text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400',
};

const Button = forwardRef(function Button(
  { variant = 'primary', loading = false, icon: Icon, className = '', children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-touch items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
});

export default Button;
