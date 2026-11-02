import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from './useDebounce.js';

/** Filters stored in the URL (survive navigation, shareable), with a debounced search box. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') || '');
  const search = useDebounce(searchText);

  const get = (k) => params.get(k) || '';
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if (search !== get('search')) update({ search });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = (keep = []) => {
    setSearchText('');
    const next = new URLSearchParams();
    keep.forEach((k) => params.get(k) && next.set(k, params.get(k)));
    setParams(next, { replace: true });
  };
  return { params, query: params.toString(), get, update, clear, searchText, setSearchText };
}
