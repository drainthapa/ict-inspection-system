import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './ui/Button.jsx';

export default function Pagination({ meta, onPage, noun = 'records' }) {
  if (!meta || meta.total === 0) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      <p className="text-sm text-slate-600">
        {meta.totalPages > 1 ? `Page ${meta.page} of ${meta.totalPages}, ` : ''}{meta.total} {noun}
      </p>
      {meta.totalPages > 1 && (
        <div className="flex gap-2">
          <Button variant="secondary" icon={ChevronLeft} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page" />
          <Button variant="secondary" icon={ChevronRight} disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page" />
        </div>
      )}
    </div>
  );
}
