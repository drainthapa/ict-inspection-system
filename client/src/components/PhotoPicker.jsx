import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = 5;

/**
 * Camera + gallery picker with previews.
 * `pending`: File[] not yet uploaded; `existing`: uploaded photos [{id, file_path}].
 */
export default function PhotoPicker({ pending, onPendingChange, existing = [], onRemoveExisting, max = 10, disabled }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const urls = pending.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [pending]);

  const add = (list) => {
    setError('');
    const files = [...list];
    const bad = files.find((f) => !ACCEPT.split(',').includes(f.type));
    if (bad) { setError(`${bad.name}: use a JPG, PNG or WEBP photo`); return; }
    const big = files.find((f) => f.size > MAX_MB * 1048576);
    if (big) { setError(`${big.name} is larger than ${MAX_MB} MB`); return; }
    const room = max - existing.length - pending.length;
    if (files.length > room) setError(`Only ${max} photos are allowed per record; extra photos were not added.`);
    onPendingChange([...pending, ...files.slice(0, Math.max(0, room))]);
  };

  const total = existing.length + pending.length;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || total >= max} onClick={() => cameraRef.current.click()}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand-300 bg-brand-50 text-sm font-semibold text-brand-800 disabled:opacity-50">
          <Camera className="h-5 w-5" aria-hidden /> Take photo
        </button>
        <button type="button" disabled={disabled || total >= max} onClick={() => galleryRef.current.click()}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-50">
          <ImagePlus className="h-5 w-5" aria-hidden /> From gallery
        </button>
      </div>
      <input ref={cameraRef} type="file" accept={ACCEPT} capture="environment" className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept={ACCEPT} multiple className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      {error && <p className="field-error">{error}</p>}
      <p className="mt-2 text-xs text-slate-500">{total} of {max} photos. JPG, PNG or WEBP, up to {MAX_MB} MB each.</p>

      {total > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {existing.map((p) => (
            <li key={`e${p.id}`} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
              <img src={`/uploads/${p.file_path}`} alt={p.caption || p.original_name || 'Inspection photo'} className="h-full w-full object-cover" loading="lazy" />
              {onRemoveExisting && !disabled && (
                <button type="button" onClick={() => onRemoveExisting(p)} aria-label="Remove photo"
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
          {pending.map((f, i) => (
            <li key={`p${i}`} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-2 ring-amber-400">
              {previews[i] && <img src={previews[i]} alt={`New photo ${i + 1}`} className="h-full w-full object-cover" />}
              <span className="absolute bottom-1 left-1 rounded bg-amber-400 px-1 text-[10px] font-semibold text-amber-950">Not saved</span>
              {!disabled && (
                <button type="button" onClick={() => onPendingChange(pending.filter((_, j) => j !== i))} aria-label="Remove photo"
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white">
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
