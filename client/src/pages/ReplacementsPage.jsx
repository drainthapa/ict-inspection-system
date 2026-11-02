import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';
import { replacementService } from '../services/workflow.service.js';
import { wardService } from '../services/ward.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUrlFilters } from '../hooks/useUrlFilters.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import { TextField } from '../components/ui/FormField.jsx';
import FilterBar from '../components/FilterBar.jsx';
import Pagination from '../components/Pagination.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import { ReplacementBadge } from '../components/StatusBadge.jsx';
import { REPL_NEXT, REPL_STATUS, formatDate, formatMoney } from '../utils/workflow.js';
import { ROLES } from '../utils/roles.js';

const NEXT_LABEL = { approved: 'Approve', rejected: 'Reject', purchased: 'Mark purchased', delivered: 'Mark delivered' };

function ReviewModal({ request, onClose, onSaved }) {
  const toast = useToast();
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { setRemarks(request?.review_remarks || ''); setErr(''); }, [request]);
  if (!request) return null;

  const act = async (status) => {
    setBusy(status); setErr('');
    try {
      const r = await replacementService.update(request.id, { status, review_remarks: remarks || null });
      toast.success(`${request.request_code}: ${REPL_STATUS[status].label}`);
      onSaved(r); onClose();
    } catch (e) {
      const { message, fieldErrors } = getApiError(e);
      setErr(fieldErrors.review_remarks || fieldErrors.status || message);
    } finally { setBusy(null); }
  };

  const next = REPL_NEXT[request.status] || [];
  return (
    <Modal open onClose={onClose} title={`Review ${request.request_code}`} size="lg"
      footer={next.length ? next.map((s) => (
        <Button key={s} variant={s === 'rejected' ? 'danger' : 'primary'} loading={busy === s} disabled={!!busy} onClick={() => act(s)}>{NEXT_LABEL[s]}</Button>
      )) : <Button variant="secondary" onClick={onClose}>Close</Button>}>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-500">Device</dt><dd className="font-medium">{request.device_name}<span className="block break-all text-sm text-slate-600">{request.asset_id}{request.serial_number ? `, ${request.serial_number}` : ''}</span></dd></div>
        <div><dt className="text-sm text-slate-500">Ward / condition</dt><dd className="flex items-center gap-2"><span className="ward-chip">{request.ward_number}</span><ConditionBadge condition={request.current_condition} /></dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Reason for replacement</dt><dd className="whitespace-pre-line text-sm font-medium">{request.reason}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Technical recommendation</dt><dd className="whitespace-pre-line text-sm font-medium">{request.technical_recommendation}</dd></div>
        <div><dt className="text-sm text-slate-500">Estimated cost</dt><dd className="font-medium">{formatMoney(request.estimated_cost)}</dd></div>
        <div><dt className="text-sm text-slate-500">Requested</dt><dd className="text-sm font-medium">{request.requested_by_name}, {formatDate(request.created_at)}{request.inspection_code && <> (<Link className="text-brand-700" to={`/inspections/${request.inspection_id}`}>{request.inspection_code}</Link>)</>}</dd></div>
      </dl>
      {next.length > 0 && (
        <div className="mt-4">
          <TextField label="Review remarks" as="textarea" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)}
            hint="Required when rejecting" error={err || undefined} />
          {next.includes('delivered') && <p className="mt-2 text-sm text-amber-900">Marking delivered retires the old device from the active inventory.</p>}
        </div>
      )}
      {!next.length && request.review_remarks && <p className="mt-4 text-sm"><span className="text-slate-500">Review remarks: </span>{request.review_remarks}</p>}
    </Modal>
  );
}

export default function ReplacementsPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const isAdmin = hasRole(ROLES.SUPER_ADMIN);
  const f = useUrlFilters();
  const [wards, setWards] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => { wardService.list().then(setWards).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    replacementService.list({ limit: 20, ...Object.fromEntries(new URLSearchParams(f.query)) }).then(setData)
      .catch((e) => toast.error(getApiError(e).message)).finally(() => setLoading(false));
  }, [f.query, reload, toast]);
  const rows = data?.data ?? [];

  return (
    <>
      <PageHeader title="Replacement recommendations"
        description={isAdmin ? 'Approve or reject replacements recommended by inspectors, then track purchase and delivery.' : 'Replacements recommended for your wards and their approval status.'} />
      <FilterBar searchText={f.searchText} onSearch={f.setSearchText} placeholder="Request ID, device, asset ID or serial"
        activeCount={['ward_id', 'status'].filter((k) => f.get(k)).length} onClear={() => f.clear()} cols="lg:grid-cols-2">
        {wards.length > 1 && (
          <select className="input" value={f.get('ward_id')} onChange={(e) => f.update({ ward_id: e.target.value })} aria-label="Ward">
            <option value="">All wards</option>
            {wards.map((w) => <option key={w.id} value={w.id}>Ward No. {w.ward_number}</option>)}
          </select>
        )}
        <select className="input" value={f.get('status')} onChange={(e) => f.update({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(REPL_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
      </FilterBar>
      {loading && !data ? <PageLoader /> : rows.length === 0 ? (
        <div className="card"><EmptyState icon={RefreshCcw} title="No replacement requests">Requests appear here when an inspection recommends complete device replacement.</EmptyState></div>
      ) : (
        <div className={loading ? 'opacity-60' : ''}>
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setReviewing(r)} className="card block h-full w-full p-4 text-left hover:border-brand-300">
                  <div className="flex items-start gap-3">
                    <span className="ward-chip">{r.ward_number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold text-slate-900">{r.device_name}</p>
                      <p className="break-all text-sm text-slate-600">{r.asset_id}</p>
                    </div>
                    <ReplacementBadge status={r.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-800">{r.reason}</p>
                  <p className="mt-2 text-xs text-slate-500">{r.request_code}, {formatDate(r.created_at)}, est. {formatMoney(r.estimated_cost)}</p>
                  {isAdmin && REPL_NEXT[r.status] && <p className="mt-2 text-sm font-semibold text-brand-700">Review</p>}
                </button>
              </li>
            ))}
          </ul>
          <Pagination meta={data.meta} onPage={(p) => f.update({ page: String(p) })} noun="requests" />
        </div>
      )}
      {reviewing && <ReviewModal request={isAdmin ? reviewing : { ...reviewing, status: 'view' }} onClose={() => setReviewing(null)} onSaved={() => setReload((x) => x + 1)} />}
    </>
  );
}
