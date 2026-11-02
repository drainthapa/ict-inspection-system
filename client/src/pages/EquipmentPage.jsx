import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, Boxes, ArrowUpDown } from 'lucide-react';
import { equipmentService, categoryService } from '../services/equipment.service.js';
import { wardService } from '../services/ward.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Badge from '../components/ui/Badge.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import Pagination from '../components/Pagination.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import EquipmentFormModal from '../components/EquipmentFormModal.jsx';
import { CONDITIONS, EQUIPMENT_STATUS } from '../utils/conditions.js';
import { ROLES } from '../utils/roles.js';

const FILTER_KEYS = ['ward_id', 'category_id', 'condition', 'status'];
const SORTS = [
  ['updated', 'Recently updated'],
  ['condition', 'Condition (worst first)'],
  ['asset_id', 'Asset ID'],
  ['name', 'Name'],
  ['ward', 'Ward'],
  ['category', 'Category'],
];

export default function EquipmentPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canEdit = hasRole(ROLES.SUPER_ADMIN, ROLES.INSPECTOR);
  // Filters live in the URL: they survive navigation, refresh and can be shared
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') || '');
  const search = useDebounce(searchText);
  const [wards, setWards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const get = (k) => params.get(k) || '';
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (search !== get('search')) update({ search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    wardService.list().then(setWards).catch(() => {});
    categoryService.list().then(setCategories).catch(() => {});
  }, []);

  const query = params.toString();
  useEffect(() => {
    setLoading(true);
    const p = Object.fromEntries(new URLSearchParams(query));
    equipmentService.list({ limit: 20, ...p })
      .then(setData)
      .catch((e) => toast.error(getApiError(e).message))
      .finally(() => setLoading(false));
  }, [query, reloadKey, toast]);

  const grouped = useMemo(() => {
    const m = new Map();
    categories.forEach((c) => m.set(c.group_name, [...(m.get(c.group_name) || []), c]));
    return [...m.entries()];
  }, [categories]);

  const activeFilters = FILTER_KEYS.filter((k) => get(k)).length;
  const clearAll = () => { setSearchText(''); setParams({}, { replace: true }); };
  const rows = data?.data ?? [];
  const singleWard = wards.length === 1;

  return (
    <>
      <PageHeader
        title="Equipment inventory"
        description="ICT equipment registered in each ward office, with its latest inspected condition."
        actions={canEdit && <Button icon={Plus} onClick={() => setAdding(true)}>Register equipment</Button>}
      />

      <div className="card mb-4 p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder="Name, asset ID, serial, brand, model or ward no." aria-label="Search equipment" />
          </div>
          <Button variant="secondary" icon={SlidersHorizontal} className="lg:hidden" onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters} aria-label="Filters">
            {activeFilters > 0 && <span className="ward-chip h-5 min-w-5">{activeFilters}</span>}
          </Button>
        </div>
        <div className={`${showFilters ? 'grid' : 'hidden'} mt-3 gap-2 sm:grid-cols-2 lg:grid lg:grid-cols-5`}>
          {!singleWard && (
            <select className="input" value={get('ward_id')} onChange={(e) => update({ ward_id: e.target.value })} aria-label="Ward">
              <option value="">All wards</option>
              {wards.map((w) => <option key={w.id} value={w.id}>Ward No. {w.ward_number}</option>)}
            </select>
          )}
          <select className="input" value={get('category_id')} onChange={(e) => update({ category_id: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {grouped.map(([g, cats]) => (
              <optgroup key={g} label={g}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            ))}
          </select>
          <select className="input" value={get('condition')} onChange={(e) => update({ condition: e.target.value })} aria-label="Condition">
            <option value="">Any condition</option>
            {Object.entries(CONDITIONS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            <option value="not_inspected">Not inspected yet</option>
          </select>
          <select className="input" value={get('status')} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">In use</option>
            <option value="replaced">Replaced</option>
            <option value="disposed">Disposed</option>
            <option value="all">All statuses</option>
          </select>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <select className="input pl-9" value={get('sort') || 'updated'} onChange={(e) => update({ sort: e.target.value, dir: '' })} aria-label="Sort by">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        {(activeFilters > 0 || searchText) && (
          <button className="mt-2 min-h-touch text-sm font-medium text-brand-700" onClick={clearAll}>Clear filters</button>
        )}
      </div>

      {loading && !data ? <PageLoader /> : rows.length === 0 ? (
        <div className="card">
          {activeFilters || searchText ? (
            <EmptyState icon={Boxes} title="No equipment matches these filters"
              action={<Button variant="secondary" onClick={clearAll}>Clear filters</Button>}>
              Try a different search or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState icon={Boxes} title="No equipment registered yet"
              action={canEdit && <Button icon={Plus} onClick={() => setAdding(true)}>Register equipment</Button>}>
              {canEdit ? 'Register the first device to start building the ward inventory.' : 'Equipment will appear here once an inspector registers it.'}
            </EmptyState>
          )}
        </div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          <ul className="space-y-3 lg:hidden">
            {rows.map((e) => (
              <li key={e.id}>
                <Link to={`/equipment/${e.id}`} className="card block p-4 active:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <span className="ward-chip">{e.ward_number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-slate-900">{e.name}</p>
                      <p className="truncate text-sm text-slate-600">{e.category_name}{e.equipment_type ? `, ${e.equipment_type}` : ''}</p>
                    </div>
                    <ConditionBadge condition={e.current_condition} />
                  </div>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-slate-500">Asset ID</dt><dd className="break-all font-medium">{e.asset_id}</dd>
                    {e.serial_number && <><dt className="text-slate-500">Serial</dt><dd className="truncate">{e.serial_number}</dd></>}
                    {e.installation_location && <><dt className="text-slate-500">Location</dt><dd className="truncate">{e.installation_location}</dd></>}
                  </dl>
                  {e.status !== 'active' && <Badge className="mt-2">{EQUIPMENT_STATUS[e.status].label}</Badge>}
                </Link>
              </li>
            ))}
          </ul>

          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Ward</th>
                  <th className="px-4 py-3 font-medium">Asset ID</th>
                  <th className="px-4 py-3 font-medium">Equipment</th>
                  <th className="px-4 py-3 font-medium">Brand / model</th>
                  <th className="px-4 py-3 font-medium">Serial no.</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><span className="ward-chip">{e.ward_number}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <Link to={`/equipment/${e.id}`} className="text-brand-700 hover:underline">{e.asset_id}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{e.name}</p>
                      <p className="text-slate-500">{e.category_name}{e.equipment_type ? `, ${e.equipment_type}` : ''}</p>
                    </td>
                    <td className="px-4 py-3">{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3">{e.serial_number || '—'}</td>
                    <td className="px-4 py-3">{e.installation_location || '—'}</td>
                    <td className="px-4 py-3">
                      <ConditionBadge condition={e.current_condition} />
                      {e.status !== 'active' && <Badge className="ml-1">{EQUIPMENT_STATUS[e.status].label}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={data.meta} onPage={(p) => update({ page: String(p) })} noun="items" />
        </div>
      )}

      <EquipmentFormModal open={adding} onClose={() => setAdding(false)}
        defaultWardId={get('ward_id') || undefined}
        onSaved={() => setReloadKey((k) => k + 1)} />
    </>
  );
}
