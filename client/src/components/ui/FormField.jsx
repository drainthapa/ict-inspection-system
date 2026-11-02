import { forwardRef, useId } from 'react';

/** Label + control + error/hint, wired for accessibility. Spread RHF's register() into it. */
export const TextField = forwardRef(function TextField(
  { label, error, hint, required, className = '', as = 'input', children, ...props }, ref,
) {
  const id = useId();
  const Control = as;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}{required && <span className="text-red-700" aria-hidden> *</span>}
        </label>
      )}
      <Control
        id={id}
        ref={ref}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`input ${as === 'textarea' ? 'min-h-24' : ''} ${error ? 'input-error' : ''}`}
        {...props}
      >
        {children}
      </Control>
      {error ? <p id={`${id}-err`} className="field-error">{error}</p>
        : hint && <p id={`${id}-hint`} className="mt-1.5 text-sm text-slate-500">{hint}</p>}
    </div>
  );
});

export const SelectField = forwardRef(function SelectField(props, ref) {
  return <TextField as="select" ref={ref} {...props} />;
});
