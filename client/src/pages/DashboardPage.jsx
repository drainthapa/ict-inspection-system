import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import {
  Building2, Boxes, ClipboardCheck, CheckCircle2, AlertCircle, XCircle, Wrench, RefreshCcw, Hourglass, ClipboardPlus,
} from 'lucide-react';
import { dashboardService } from '../services/workflow.service.js';
import { wardService } from '../services/ward.service.js';
import { categoryService } from '../services/equipment.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUrlFilters } from '../hooks/useUrlFilters.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import FilterBar from '../components/FilterBar.jsx';
import { CONDITIONS } from '../utils/conditions.js';
import { MAINT_STATUS } from '../utils/workflow.js';
import { ROLES } from '../utils/roles.js';

// Status colours carry meaning; each is paired with a text label in legends and tooltips
const COND_COLORS = { good: '#059669', partial: '#d97706', not_operational: '#dc2626', damaged: '#7f1d1d', not_inspected: '#94a3b8' };
const MAINT_COLORS = { pending: '#d97706', under_assessment: '#f59e0b', approved: '#3463b3', in_progress: '#1e3f7c', completed: '#059669', not_repairable: '#dc2626', cancelled: '#94a3b8' };

function StatCard({ icon: Icon, label, value, tone = 'text-brand-700', to }) {
  const body = (
    <>
      <Icon className={`h-5 w-5 ${tone}`} aria-hidden />
      <p className="mt-2 text-2xl font-bold text-slate-900">{value ?? '—'}</p>
      <p className="text-sm leading-tight text-slate-600">{label}</p>
    </>
  );
  return to ? <Link to={to} className="card block p-4 hover:border-brand-300">{body}</Link> : <div className="card p-4">{body}</div>;
}

function ChartCard({ title, children, empty, className = '' }) {
  return (
    <section className={`card p-4 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {empty ? <p className="flex h-56 items-center justify-center text-sm text-slate-500">No data for these filters yet.</p> : <div className="h-64">{children}</div>}
    </section>
  );
}

const tick = { fontSize: 12, fill: '#475569' };

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const f = useUrlFilters();
  const [summary, setSummary] = useState(null);
  const [charts, setCharts] = useState(null);
  const [wards, setWards] = useState([]);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    wardService.list().then(setWards).catch(() => {});
    categoryService.list().then(setCats).catch(() => {});
  }, []);
  useEffect(() => {
    const p = Object.fromEntries(new URLSearchParams(f.query));
    Promise.all([dashboardService.summary(p), dashboardService.charts(p)])
      .then(([s, c]) => { setSummary(s); setCharts(c); setError(''); })
      .catch((e) => setError(getApiError(e).message));
  }, [f.query]);

  const conditionData = useMemo(() => (charts?.by_condition || [])
    .map((c) => ({ name: c.condition === 'not_inspected' ? 'Not inspected' : CONDITIONS[c.condition].short, key: c.condition, value: c.count }))
    .sort((a, b) => Object.keys(COND_COLORS).indexOf(a.key) - Object.keys(COND_COLORS).indexOf(b.key)), [charts]);
  const maintData = useMemo(() => Object.keys(MAINT_STATUS)
    .map((s) => ({ key: s, name: MAINT_STATUS[s].label, count: charts?.maintenance_status.find((m) => m.status === s)?.count || 0 }))
    .filter((d) => d.count > 0), [charts]);
  const wardLabel = (n) => `W${n}`;
  const active = ['ward_id', 'category_id', 'condition', 'maintenance_status', 'date_from', 'date_to'].filter((k) => f.get(k)).length;
  const s = summary;

  return (
    <>
      <PageHeader title="Overview"
        description={hasRole(ROLES.SUPER_ADMIN) ? 'ICT equipment across all ward offices of Sainamaina Municipality.' : `Your ${user.wards.length === 1 ? 'ward' : 'wards'}: ${user.wards.map((w) => w.ward_number).join(', ')}`}
        actions={hasRole(ROLES.SUPER_ADMIN, ROLES.INSPECTOR) && <Link to="/inspections/new"><Button icon={ClipboardPlus}>New inspection</Button></Link>} />

      <FilterBar activeCount={active} onClear={() => f.clear()} cols="lg:grid-cols-6">
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
          <option value="not_inspected">Not inspected yet</option>
        </select>
        <select className="input" value={f.get('maintenance_status')} onChange={(e) => f.update({ maintenance_status: e.target.value })} aria-label="Maintenance status">
          <option value="">Any maintenance status</option>
          {Object.entries(MAINT_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
        </select>
        <label className="text-sm text-slate-600">Inspected from<input type="date" className="input mt-1" value={f.get('date_from')} onChange={(e) => f.update({ date_from: e.target.value })} /></label>
        <label className="text-sm text-slate-600">to<input type="date" className="input mt-1" value={f.get('date_to')} onChange={(e) => f.update({ date_to: e.target.value })} /></label>
      </FilterBar>

      {error && <div role="alert" className="card mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {!s && !error ? <PageLoader /> : s && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard icon={Building2} label="Ward offices" value={s.total_wards} to="/wards" />
            <StatCard icon={Boxes} label="Registered equipment" value={s.total_equipment} to="/equipment" />
            <StatCard icon={ClipboardCheck} label="Inspected equipment" value={s.inspected_equipment} to="/inspections?status=submitted" />
            <StatCard icon={CheckCircle2} tone="text-emerald-600" label="Fully operational" value={s.good} to="/equipment?condition=good" />
            <StatCard icon={AlertCircle} tone="text-amber-600" label="Partially operational" value={s.partial} to="/equipment?condition=partial" />
            <StatCard icon={XCircle} tone="text-red-600" label="Not operational or damaged" value={s.non_operational} to="/equipment?sort=condition" />
            <StatCard icon={Wrench} tone="text-amber-700" label="Repair required" value={s.repair_required} to="/reports?type=repair_required" />
            <StatCard icon={RefreshCcw} tone="text-red-700" label="Replacement required" value={s.replacement_required} to="/replacements" />
            <StatCard icon={Hourglass} label="Pending maintenance" value={s.pending_maintenance} to="/maintenance/requests" />
            <StatCard icon={Boxes} tone="text-slate-500" label="Not inspected yet" value={s.not_inspected} to="/equipment?condition=not_inspected" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Equipment by ward" empty={!charts.by_ward.some((w) => w.equipment)}>
              <ResponsiveContainer>
                <BarChart data={charts.by_ward} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="ward_number" tickFormatter={wardLabel} tick={tick} interval={0} />
                  <YAxis allowDecimals={false} tick={tick} />
                  <Tooltip labelFormatter={(n) => `Ward No. ${n}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="equipment" name="All equipment" fill="#3463b3" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="non_operational" name="Not working" fill="#dc2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Equipment condition" empty={!conditionData.length}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={conditionData} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={2}>
                    {conditionData.map((d) => <Cell key={d.key} fill={COND_COLORS[d.key]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} devices`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Equipment by category" empty={!charts.by_category.length}>
              <ResponsiveContainer>
                <BarChart data={charts.by_category} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={tick} />
                  <YAxis type="category" dataKey="category" width={120} tick={{ ...tick, fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Devices" fill="#1e3f7c" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Repair requirements by ward" empty={!charts.repairs_by_ward.some((w) => w.repair_required || w.open_maintenance)}>
              <ResponsiveContainer>
                <BarChart data={charts.repairs_by_ward} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="ward_number" tickFormatter={wardLabel} tick={tick} interval={0} />
                  <YAxis allowDecimals={false} tick={tick} />
                  <Tooltip labelFormatter={(n) => `Ward No. ${n}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="repair_required" name="Repair required" fill="#d97706" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="open_maintenance" name="Open maintenance" fill="#1e3f7c" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Maintenance status" empty={!maintData.length} className="lg:col-span-2">
              <ResponsiveContainer>
                <BarChart data={maintData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ ...tick, fontSize: 11 }} interval={0} />
                  <YAxis allowDecimals={false} tick={tick} />
                  <Tooltip />
                  <Bar dataKey="count" name="Records" radius={[3, 3, 0, 0]}>
                    {maintData.map((d) => <Cell key={d.key} fill={MAINT_COLORS[d.key]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}
