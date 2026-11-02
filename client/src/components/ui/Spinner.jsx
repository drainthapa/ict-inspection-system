export default function Spinner({ className = 'h-5 w-5', label }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className={label ? 'text-sm text-slate-600' : 'sr-only'}>{label || 'Loading'}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-brand-700">
      <Spinner className="h-6 w-6" label={label} />
    </div>
  );
}
