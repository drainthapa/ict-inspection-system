import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, ClipboardList, Wrench, ClipboardPlus, AlertOctagon, RefreshCcw } from 'lucide-react';
import { equipmentService } from '../services/equipment.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import EquipmentFormModal from '../components/EquipmentFormModal.jsx';
import ReportFaultModal from '../components/ReportFaultModal.jsx';
import ReplacementRequestModal from '../components/ReplacementRequestModal.jsx';
import { MaintenanceBadge } from '../components/StatusBadge.jsx';
import { EQUIPMENT_STATUS, conditionInfo } from '../utils/conditions.js';
import { formatDateTime } from '../utils/format.js';
import { ROLES } from '../utils/roles.js';

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{children || '—'}</dd>
    </div>
  );
}

const formatDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null);

export default function EquipmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => equipmentService.get(id).then(setItem).catch((e) => setError(getApiError(e).message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const remove = async () => {
    setDeleting(true);
    try {
      await equipmentService.remove(item.id);
      toast.success('Equipment deleted');
      navigate('/equipment');
    } catch (err) {
      toast.error(getApiError(err).message);
      setModal(null);
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return <div className="card"><EmptyState title={error} action={<Link to="/equipment"><Button variant="secondary">Back to inventory</Button></Link>} /></div>;
  }
  if (!item) return <PageLoader />;

  const cond = conditionInfo(item.current_condition);
  const warrantyExpired = item.warranty_expiry && new Date(item.warranty_expiry) < new Date();

  return (
    <>
      <Link to="/equipment" className="mb-3 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Equipment inventory
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{item.asset_id}</p>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{item.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link to={`/wards/${item.ward_id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-700 hover:text-brand-700">
              <span className="ward-chip">{item.ward_number}</span>{item.ward_office_name}
            </Link>
            {item.status !== 'active' && <Badge>{EQUIPMENT_STATUS[item.status].label}</Badge>}
          </div>
        </div>
        {hasRole(ROLES.WARD_USER) && item.status === 'active' && (
          <Button icon={AlertOctagon} onClick={() => setModal('fault')}>Report a fault</Button>
        )}
        {hasRole(ROLES.SUPER_ADMIN, ROLES.INSPECTOR) && (
          <div className="flex flex-wrap gap-2">
            {item.status === 'active' && (
              <Link to={`/inspections/new?ward_id=${item.ward_id}&equipment_id=${item.id}`} className="flex-1 sm:flex-none">
                <Button icon={ClipboardPlus} className="w-full">Inspect</Button>
              </Link>
            )}
            {item.status === 'active' && <Button variant="secondary" icon={Wrench} onClick={() => setModal('fault')} className="flex-1 sm:flex-none">Log maintenance</Button>}
            {item.status === 'active' && <Button variant="secondary" icon={RefreshCcw} onClick={() => setModal('replace')} className="flex-1 sm:flex-none">Recommend replacement</Button>}
            <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')} className="flex-1 sm:flex-none">Edit</Button>
            {hasRole(ROLES.SUPER_ADMIN) && (
              <Button variant="ghost" icon={Trash2} className="text-red-700" onClick={() => setModal('delete')} aria-label="Delete equipment" />
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`card p-5 ${cond.tone === 'red' ? 'border-red-200' : ''}`}>
          <h2 className="font-semibold text-slate-900">Current condition</h2>
          <div className="mt-3"><ConditionBadge condition={item.current_condition} long /></div>
          <p className="mt-3 text-sm text-slate-600">
            {item.last_inspection_date
              ? `From inspection ${item.last_inspection_code} on ${formatDate(item.last_inspection_date)}.`
              : 'This device has not been inspected yet. Its condition is recorded by submitting an inspection.'}
          </p>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Equipment details</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Detail label="Category">{item.category_name}</Detail>
            <Detail label="Type">{item.equipment_type}</Detail>
            <Detail label="Quantity">{item.quantity}</Detail>
            <Detail label="Brand">{item.brand}</Detail>
            <Detail label="Model">{item.model}</Detail>
            <Detail label="Serial number">{item.serial_number}</Detail>
            <Detail label="Location">{item.installation_location}</Detail>
            <Detail label="Purchased">{formatDate(item.purchase_date)}</Detail>
            <Detail label="Warranty until">
              {item.warranty_expiry && <>{formatDate(item.warranty_expiry)}{warrantyExpired && <span className="ml-1 text-slate-500">(expired)</span>}</>}
            </Detail>
            {item.remarks && <div className="col-span-2 sm:col-span-3"><Detail label="Remarks">{item.remarks}</Detail></div>}
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Registered {formatDateTime(item.created_at)}{item.created_by_name ? ` by ${item.created_by_name}` : ''}. Last changed {formatDateTime(item.updated_at)}.
          </p>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><ClipboardList className="h-5 w-5 text-slate-400" aria-hidden />Inspection history</h2>
          {item.inspections.length === 0 ? <p className="mt-3 text-sm text-slate-600">No submitted inspections yet.</p> : (
            <ol className="mt-3 divide-y divide-slate-100">
              {item.inspections.map((i) => (
                <li key={i.id}>
                  <Link to={`/inspections/${i.id}`} className="flex min-h-touch items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{formatDate(i.inspection_date)}, {i.inspection_code}</p>
                      <p className="truncate text-xs text-slate-500">{i.inspector_name}</p>
                    </div>
                    <ConditionBadge condition={i.condition} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Wrench className="h-5 w-5 text-slate-400" aria-hidden />Maintenance history</h2>
          {item.maintenance.length === 0 ? <p className="mt-3 text-sm text-slate-600">No maintenance recorded.</p> : (
            <ol className="mt-3 divide-y divide-slate-100">
              {item.maintenance.map((m) => (
                <li key={m.id}>
                  <Link to={`/maintenance/${m.id}`} className="flex min-h-touch items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{m.maintenance_code}</span>
                      <span className="block truncate text-xs text-slate-500">{m.reported_problem}</span>
                    </span>
                    <MaintenanceBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ReportFaultModal open={modal === 'fault'} onClose={() => setModal(null)} equipment={item} asTechnician={!hasRole(ROLES.WARD_USER)} />
      <ReplacementRequestModal open={modal === 'replace'} onClose={() => setModal(null)} equipment={item} />
      <EquipmentFormModal open={modal === 'edit'} onClose={() => setModal(null)} item={item} onSaved={() => load()} />
      <ConfirmDialog open={modal === 'delete'} onClose={() => setModal(null)} onConfirm={remove} loading={deleting} danger
        title={`Delete ${item.asset_id}?`} confirmLabel="Delete equipment"
        message="Use this only for equipment registered by mistake. Equipment with inspection or maintenance history cannot be deleted; set its status to Disposed instead." />
    </>
  );
}
