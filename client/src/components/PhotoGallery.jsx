import { useState } from 'react';
import { X } from 'lucide-react';

export default function PhotoGallery({ photos, labelFor }) {
  const [open, setOpen] = useState(null);
  if (!photos?.length) return <p className="text-sm text-slate-600">No photos.</p>;
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p)} className="block aspect-square w-full overflow-hidden rounded-lg bg-slate-100">
              <img src={`/uploads/${p.file_path}`} alt={labelFor?.(p) || 'Photo'} loading="lazy" className="h-full w-full object-cover" />
            </button>
            {labelFor && <p className="mt-1 truncate text-xs text-slate-600">{labelFor(p)}</p>}
          </li>
        ))}
      </ul>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <img src={`/uploads/${open.file_path}`} alt={labelFor?.(open) || 'Photo'} className="max-h-full max-w-full rounded-lg object-contain" />
          <button type="button" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </>
  );
}
