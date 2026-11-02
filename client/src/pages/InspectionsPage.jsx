import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPlus, ClipboardList, Image as ImageIcon } from 'lucide-react';
import { inspectionService } from '../services/workflow.service.js';
import { wardService } from '../services/ward.service.js';
import { categoryService } from '../services/equipment.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUrlFilters } from '../hooks/useUrlFilters.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Pagination from '../components/Pagination.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import { CONDITIONS } from '../utils/conditions.js';
import { INSPECTION_TYPES, formatDate, formatMoney } from '../utils/workflow.js';
import { ROLES } from '../utils/roles.js';

const KEYS = ['ward_id', 'category_id', 'condition', 'status', 'inspection_type', 'repair_required', 'date_from', 'date_to'];

export default function InspectionsPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canInspect = hasRole(ROLES.SUPER_ADMIN, ROLES.INSPECTOR);
  const f = useUrlFilters();
  const [wards, setWards] = useState([]);
  const [cats, setCats] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wardService.list().then(setWards).catch(() => {});
    categoryService.list().then(setCats).catch(() => {});
  }, []);
  useEffect(() => {
    setLoading(true);
    inspectionService.list({ limit: 20, ...Object.fromEntries(new URLSearchParams(f.query)) })
      .then(setData).catch((e) => toast.error(getApiError(e).message)).finally(() => setLoading(false));
  }, [f.query, toast]);

  const active = KEYS.filter((k) => f.get(k)).length;
  const rows = data?.data ?? [];
  const link = (i) => (i.status === 'draft' ? `/inspections/${i.id}/edit` : `/inspections/${i.id}`);

  return (
    <>
      <PageHeader title="Inspection records" description="Every inspection is kept as history; submitted records cannot be changed."
        actions={canInspect && <Link to="/inspections/new"><Button icon={ClipboardPlus}>New inspection</Button></Link>} />

      <FilterBar searchText={f.searchText} onSearch={f.setSearchText} placeholder="Inspection ID, equipment, asset ID, serial or inspector"
        activeCount={active} onClear={() => f.clear()} cols="lg:grid-cols-4">
        {wards.length > 1 && (
          <select className="input" value={f.get('ward_id')} onChange={(e) => f.update({ ward_id: e.target.value })} aria-label="Ward">
            <option value="">All wards</option>
            {wards.map((w) => <option key={w.id} value={w.id}>Ward No. {w.ward_number}</option>)}
          </select>
        )}
        <select className="input" value={f.get('category_id')} onChange={(e) => f.update({ category_id: e.target.value })} aria-label="Category">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={f.get('condition')} onChange={(e) => f.update({ condition: e.target.value })} aria-label="Condition">
          <option value="">Any condition</option>
          {Object.entries(CONDITIONS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        {canInspect && (
          <select className="input" value={f.get('status')} onChange={(e) => f.update({ status: e.target.value })} aria-label="Status">
            <option value="">Drafts and submitted</option>
            <option value="draft">Drafts only</option>
            <option value="submitted">Submitted only</option>
          </select>
        )}
        <select className="input" value={f.get('repair_required')} onChange={(e) => f.update({ repair_required: e.target.value })} aria-label="Repair required">
          <option value="">Repair: any</option>
          <option value="true">Repair required</option>
          <option value="false">No repair required</option>
        </select>
        <select className="input" value={f.get('inspection_type')} onChange={(e) => f.update({ inspection_type: e.target.value })} aria-label="Inspection type">
          <option value="">All types</option>
          {Object.entries(INSPECTION_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="text-sm text-slate-600">From<input type="date" className="input mt-1" value={f.get('date_from')} onChange={(e) => f.update({ date_from: e.target.value })} /></label>
        <label className="text-sm text-slate-600">To<input type="date" className="input mt-1" value={f.get('date_to')} onChange={(e) => f.update({ date_to: e.target.value })} /></label>
      </FilterBar>

      {loading && !data ? <PageLoader /> : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={ClipboardList} title={active || f.searchText ? 'No inspections match these filters' : 'No inspections yet'}
            action={canInspect && !active && <Link to="/inspections/new"><Button icon={ClipboardPlus}>Start an inspection</Button></Link>}>
            {active || f.searchText ? 'Try removing a filter.' : canInspect ? 'Inspections you save or submit appear here.' : 'Results appear here once an inspector submits an inspection for your ward.'}
          </EmptyState>
        </div>
      ) : (
        <div className={loading ? 'opacity-60' : ''}>
          <ul className="space-y-3 lg:hidden">
            {rows.map((i) => (
              <li key={i.id}>
                <Link to={link(i)} className="card block p-4 active:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <span className="ward-chip">{i.ward_number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-slate-900">{i.equipment_name || 'Equipment not chosen yet'}</p>
                      <p className="break-all text-sm text-slate-600">{i.asset_id || i.category_name || ''}</p>
                    </div>
                    {i.status === 'draft' ? <Badge tone="amber">Draft</Badge> : <ConditionBadge condition={i.condition} />}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {formatDate(i.inspection_date)}, {INSPECTION_TYPES[i.inspection_type]}, {i.inspector_name}
                    {i.photo_count > 0 && <span className="ml-1 inline-flex items-center gap-0.5"><ImageIcon className="h-3.5 w-3.5" aria-hidden />{i.photo_count}</span>}
                  </p>
                  {i.repair_required && <p className="mt-1 text-sm font-medium text-amber-800">Repair required{i.estimated_repair_cost ? `, est. ${formatMoney(i.estimated_repair_cost)}` : ''}</p>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  {['Inspection', 'Date', 'Ward', 'Equipment', 'Condition', 'Repair', 'Inspector'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link to={link(i)} className="font-medium text-brand-700 hover:underline">{i.inspection_code}</Link>
                      {i.status === 'draft' && <Badge tone="amber" className="ml-2">Draft</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(i.inspection_date)}<p className="text-slate-500">{INSPECTION_TYPES[i.inspection_type]}</p></td>
                    <td className="px-4 py-3"><span className="ward-chip">{i.ward_number}</span></td>
                    <td className="px-4 py-3"><p className="font-medium">{i.equipment_name || '—'}</p><p className="text-slate-500">{i.asset_id}</p></td>
                    <td className="px-4 py-3"><ConditionBadge condition={i.condition} /></td>
                    <td className="px-4 py-3">{i.repair_required ? `Yes${i.estimated_repair_cost ? `, ${formatMoney(i.estimated_repair_cost)}` : ''}` : i.repair_required === false ? 'No' : '—'}</td>
                    <td className="px-4 py-3">{i.inspector_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data.meta} onPage={(p) => f.update({ page: String(p) })} noun="inspections" />
        </div>
      )}
    </>
  );
}
