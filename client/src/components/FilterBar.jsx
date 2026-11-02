import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import Button from './ui/Button.jsx';

/** Search box plus a filter panel that collapses on phones. */
export default function FilterBar({ searchText, onSearch, placeholder, activeCount, onClear, children, cols = 'lg:grid-cols-5' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-4 p-3">
      <div className="flex gap-2">
        {onSearch && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" value={searchText} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label="Search" />
          </div>
        )}
        <Button variant="secondary" icon={SlidersHorizontal} className={onSearch ? 'lg:hidden' : 'w-full lg:hidden'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {!onSearch && 'Filters'}
          {activeCount > 0 && <span className="ward-chip h-5 min-w-5">{activeCount}</span>}
        </Button>
      </div>
      <div className={`${open ? 'grid' : 'hidden'} mt-3 gap-2 sm:grid-cols-2 lg:grid ${cols}`}>{children}</div>
      {(activeCount > 0 || searchText) && (
        <button type="button" className="mt-2 min-h-touch text-sm font-medium text-brand-700" onClick={onClear}>Clear filters</button>
      )}
    </div>
  );
}
