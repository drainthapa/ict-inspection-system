import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Printer, FileBarChart } from 'lucide-react';
import { reportService } from '../services/workflow.service.js';
import { wardService } from '../services/ward.service.js';
import { categoryService } from '../services/equipment.service.js';
import { getApiError } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useUrlFilters } from '../hooks/useUrlFilters.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import { CONDITIONS } from '../utils/conditions.js';
import { MAINT_STATUS, REPL_STATUS, formatDate, formatMoney } from '../utils/workflow.js';

const FILTERS = ['ward_id', 'category_id', 'condition', 'maintenance_status', 'replacement_status', 'date_from', 'date_to'];
const USES = {
  condition: ['inventory', 'inspections', 'condition', 'non_operational', 'repair_required', 'repair_cost'],
  maintenance_status: ['maintenance', 'repair_required'],
  replacement_status: ['replacement'],
  dates: ['inspections', 'maintenance', 'replacement', 'repair_cost'],
};

function cellText(col, row, currency) {
  const v = row[col.key];
  if (col.type === 'money') return v == null ? '' : formatMoney(v, currency);
  if (col.type === 'date') return v ? formatDate(v) : '';
  if (col.type === 'status') return v ? (MAINT_STATUS[v]?.label || REPL_STATUS[v]?.label || v) : '';
  return v == null ? '' : String(v);
}

function Cell({ col, row, currency }) {
  if (col.type === 'condition') return <ConditionBadge condition={row[col.key]} />;
  return (
    <>
      <span className="whitespace-pre-line">{cellText(col, row, currency)}</span>
      {col.secondary && row[col.secondary] && <span className="block text-slate-500">{row[col.secondary]}</span>}
    </>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const f = useUrlFilters();
  const [types, setTypes] = useState(null);
  const [wards, setWards] = useState([]);
  const [cats, setCats] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const type = f.get('type') || 'consolidated';

  useEffect(() => {
    reportService.types().then(setTypes).catch(() => {});
    wardService.list().then(setWards).catch(() => {});
    categoryService.list().then(setCats).catch(() => {});
  }, []);

  const filterParams = () => Object.fromEntries(FILTERS.filter((k) => f.get(k)).map((k) => [k, f.get(k)]));
  useEffect(() => {
    setLoading(true);
    reportService.get(type, filterParams()).then(setReport)
      .catch((e) => toast.error(getApiError(e).message)).finally(() => setLoading(false));
  }, [f.query]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (format) => {
    setDownloading(format);
    try { await reportService.download(format, type, filterParams()); } catch (e) { toast.error(getApiError(e).message); } finally { setDownloading(null); }
  };

  const changeType = (t) => {
    const keep = { type: t };
    FILTERS.forEach((k) => { keep[k] = ''; });
    ['ward_id', 'category_id'].forEach((k) => { keep[k] = f.get(k); });
    f.update(keep);
  };
  const cur = report?.header?.currency || 'NPR';

  return (
    <>
      <div className="no-print">
        <PageHeader title="Reports" description="Preview on screen, then download for Excel or PDF, or print on A4." />
        <div className="card mb-4 space-y-3 p-3">
          <select className="input font-medium" value={type} onChange={(e) => changeType(e.target.value)} aria-label="Report">
            {(types || []).map((t) => <option key={t.type} value={t.type}>{t.title}</option>)}
          </select>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            {USES.condition.includes(type) && (
              <select className="input" value={f.get('condition')} onChange={(e) => f.update({ condition: e.target.value })} aria-label="Condition">
                <option value="">Any condition</option>
                {Object.entries(CONDITIONS).filter(([v]) => type !== 'non_operational' || ['not_operational', 'damaged'].includes(v))
                  .map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                {['inventory', 'condition'].includes(type) && <option value="not_inspected">Not inspected yet</option>}
              </select>
            )}
            {USES.maintenance_status.includes(type) && (
              <select className="input" value={f.get('maintenance_status')} onChange={(e) => f.update({ maintenance_status: e.target.value })} aria-label="Repair status">
                <option value="">Any repair status</option>
                {Object.entries(MAINT_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            )}
            {USES.replacement_status.includes(type) && (
              <select className="input" value={f.get('replacement_status')} onChange={(e) => f.update({ replacement_status: e.target.value })} aria-label="Approval status">
                <option value="">Open requests</option>
                {Object.entries(REPL_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            )}
            {USES.dates.includes(type) && (
              <>
                <label className="text-sm text-slate-600">From<input type="date" className="input mt-1" value={f.get('date_from')} onChange={(e) => f.update({ date_from: e.target.value })} /></label>
                <label className="text-sm text-slate-600">To<input type="date" className="input mt-1" value={f.get('date_to')} onChange={(e) => f.update({ date_to: e.target.value })} /></label>
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 sm:flex">
            <Button variant="secondary" icon={FileSpreadsheet} loading={downloading === 'excel'} disabled={!report} onClick={() => download('excel')}>Excel</Button>
            <Button variant="secondary" icon={FileText} loading={downloading === 'pdf'} disabled={!report} onClick={() => download('pdf')}>PDF</Button>
            <Button variant="secondary" icon={Printer} disabled={!report} onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </div>

      {loading && !report ? <PageLoader label="Preparing report…" /> : report && (
        <article className={`card print-area overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <header className="border-b-2 border-brand-800 px-4 py-4 text-center">
            <p className="text-lg font-bold text-brand-800">{report.header.municipality}</p>
            <p className="text-sm text-slate-800">{report.header.office}</p>
            <p className="text-xs text-slate-600">{report.header.address}</p>
            <h2 className="mt-3 text-base font-bold text-slate-900">{report.title}</h2>
            <p className="text-xs text-slate-600">{report.filter_text}. Generated {formatDate(report.generated_at)} by {report.generated_by}.</p>
          </header>

          {report.rows.length === 0 ? (
            <EmptyState icon={FileBarChart} title="No records match these filters" />
          ) : (
            <>
              {/* Phones: each row as a card */}
              <ul className="divide-y divide-slate-100 md:hidden print:hidden">
                {report.rows.map((r, idx) => (
                  <li key={idx} className="p-4">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      {report.columns.map((c) => (
                        <div key={c.key} className="contents">
                          <dt className="text-slate-500">{c.label}</dt>
                          <dd className="break-words font-medium text-slate-900"><Cell col={c} row={r} currency={cur} /></dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              {/* Tablet, desktop and print: table */}
              <div className="hidden overflow-x-auto md:block print:block">
                <table className="report-table w-full text-left text-xs">
                  <thead className="bg-brand-800 text-white">
                    <tr>{report.columns.map((c) => <th key={c.key} className={`px-2 py-2 font-semibold ${['money', 'number'].includes(c.type) ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.rows.map((r, idx) => (
                      <tr key={idx} className="align-top even:bg-slate-50">
                        {report.columns.map((c) => (
                          <td key={c.key} className={`px-2 py-1.5 ${['money', 'number'].includes(c.type) ? 'text-right tabular-nums' : ''}`}><Cell col={c} row={r} currency={cur} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {report.totals && (
                    <tfoot className="border-t-2 border-brand-800 bg-brand-50 font-semibold">
                      <tr>
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={`px-2 py-2 ${['money', 'number'].includes(c.type) ? 'text-right' : ''}`}>
                            {i === 0 ? report.totals.label : report.totals[c.key] !== undefined ? cellText(c, report.totals, cur) : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {report.totals && (
                <p className="border-t border-slate-200 bg-brand-50 p-4 text-sm font-semibold md:hidden print:hidden">
                  {report.totals.label}
                  {report.columns.filter((c) => c.type === 'money' && report.totals[c.key] !== undefined)
                    .map((c) => <span key={c.key} className="block font-normal">{c.label}: {formatMoney(report.totals[c.key], cur)}</span>)}
                </p>
              )}
              {report.truncated && <p className="p-4 text-sm text-amber-800">Showing the first 5,000 rows. Narrow the filters for a complete report.</p>}
            </>
          )}

          <footer className="grid grid-cols-1 gap-8 px-6 pb-6 pt-12 text-sm sm:grid-cols-3">
            {report.signatures.map((s) => (
              <div key={s} className="border-t border-slate-500 pt-1 text-slate-700">{s}<span className="block text-xs text-slate-500">Date:</span></div>
            ))}
          </footer>
        </article>
      )}
    </>
  );
}
