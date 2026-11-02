export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-slate-300" aria-hidden />}
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-600">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
