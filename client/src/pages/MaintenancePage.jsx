import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { maintenanceService } from '../services/workflow.service.js';
import { wardService } from '../services/ward.service.js';
import { getApiError } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useUrlFilters } from '../hooks/useUrlFilters.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Pagination from '../components/Pagination.jsx';
import { MaintenanceBadge } from '../components/StatusBadge.jsx';
import { MAINT_STATUS, SOURCE_LABEL, formatDate, formatMoney } from '../utils/workflow.js';

/** mode="requests": open repair requests; mode="records": full maintenance history */
export default function MaintenancePage({ mode = 'records' }) {
  const toast = useToast();
  const f = useUrlFilters();
  const [wards, setWards] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const isRequests = mode === 'requests';

  useEffect(() => { wardService.list().then(setWards).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    const p = Object.fromEntries(new URLSearchParams(f.query));
    if (isRequests && !p.status) p.status = 'open';
    maintenanceService.list({ limit: 20, ...p }).then(setData)
      .catch((e) => toast.error(getApiError(e).message)).finally(() => setLoading(false));
  }, [f.query, isRequests, toast]);

  const statuses = isRequests ? ['pending', 'under_assessment', 'approved', 'in_progress'] : Object.keys(MAINT_STATUS);
  const active = ['ward_id', 'status', 'source', 'date_from', 'date_to'].filter((k) => f.get(k)).length;
  const rows = data?.data ?? [];

  return (
    <>
      <PageHeader
        title={isRequests ? 'Repair requests' : 'Maintenance records'}
        description={isRequests
          ? 'Open repairs from inspections and fault reports, most urgent first.'
          : 'Complete repair history for every device, including spare parts and costs.'} />
      <FilterBar searchText={f.searchText} onSearch={f.setSearchText} placeholder="ID, equipment, asset ID, serial or problem"
        activeCount={active} onClear={() => f.clear()} cols="lg:grid-cols-5">
        {wards.length > 1 && (
          <select className="input" value={f.get('ward_id')} onChange={(e) => f.update({ ward_id: e.target.value })} aria-label="Ward">
            <option value="">All wards</option>
            {wards.map((w) => <option key={w.id} value={w.id}>Ward No. {w.ward_number}</option>)}
          </select>
        )}
        <select className="input" value={f.get('status')} onChange={(e) => f.update({ status: e.target.value })} aria-label="Status">
          <option value="">{isRequests ? 'All open statuses' : 'All statuses'}</option>
          {statuses.map((s) => <option key={s} value={s}>{MAINT_STATUS[s].label}</option>)}
        </select>
        <select className="input" value={f.get('source')} onChange={(e) => f.update({ source: e.target.value })} aria-label="Source">
          <option value="">Any source</option>
          {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="text-sm text-slate-600">From<input type="date" className="input mt-1" value={f.get('date_from')} onChange={(e) => f.update({ date_from: e.target.value })} /></label>
        <label className="text-sm text-slate-600">To<input type="date" className="input mt-1" value={f.get('date_to')} onChange={(e) => f.update({ date_to: e.target.value })} /></label>
      </FilterBar>

      {loading && !data ? <PageLoader /> : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Wrench} title={isRequests ? 'No open repair requests' : 'No maintenance records'}>
            {isRequests ? 'Repairs appear here when an inspection marks repair as required, or a ward office reports a fault.' : 'Try removing a filter.'}
          </EmptyState>
        </div>
      ) : (
        <div className={loading ? 'opacity-60' : ''}>
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((m) => (
              <li key={m.id}>
                <Link to={`/maintenance/${m.id}`} className="card block h-full p-4 hover:border-brand-300">
                  <div className="flex items-start gap-3">
                    <span className="ward-chip">{m.ward_number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-slate-900">{m.equipment_name}</p>
                      <p className="break-all text-sm text-slate-600">{m.asset_id}</p>
                    </div>
                    <MaintenanceBadge status={m.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-800">{m.reported_problem}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {m.maintenance_code}, {SOURCE_LABEL[m.source].toLowerCase()}, {formatDate(m.created_at)}
                    {m.repair_cost != null && `, cost ${formatMoney(m.repair_cost)}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination meta={data.meta} onPage={(p) => f.update({ page: String(p) })} noun="records" />
        </div>
      )}
    </>
  );
}
