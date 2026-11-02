import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { ArrowLeft, Plus, Trash2, Save, Upload, ClipboardPlus } from 'lucide-react';
import { maintenanceService } from '../services/workflow.service.js';
import { userService } from '../services/user.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import { TextField, SelectField } from '../components/ui/FormField.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';
import PhotoGallery from '../components/PhotoGallery.jsx';
import { MaintenanceBadge } from '../components/StatusBadge.jsx';
import { MAINT_NEXT, MAINT_STATUS, SOURCE_LABEL, formatDate, formatMoney } from '../utils/workflow.js';
import { formatDateTime } from '../utils/format.js';
import { ROLES } from '../utils/roles.js';

const CLOSED = ['completed', 'not_repairable', 'cancelled'];
const ACTION_LABEL = {
  under_assessment: 'Start assessment', approved: 'Approve repair', in_progress: 'Start work',
  completed: 'Mark completed', not_repairable: 'Not repairable', cancelled: 'Cancel request',
};

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm font-medium text-slate-900">{children || '—'}</dd>
    </div>
  );
}

export default function MaintenanceDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(ROLES.SUPER_ADMIN);
  const canWork = hasRole(ROLES.SUPER_ADMIN, ROLES.INSPECTOR);
  const [m, setM] = useState(null);
  const [error, setError] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [stage, setStage] = useState('before');

  const {
    register, control, handleSubmit, reset, getValues, watch, setError: setFieldError, formState: { errors, isSubmitting, isDirty },
  } = useForm({ defaultValues: { spare_parts: [] } });
  const parts = useFieldArray({ control, name: 'spare_parts' });

  const fill = (data) => {
    setM(data);
    reset({
      required_repair: data.required_repair || '', technician_id: data.technician_id ? String(data.technician_id) : '',
      technician_name: data.technician_name || '', maintenance_date: data.maintenance_date || '',
      completion_date: data.completion_date || '', repair_cost: data.repair_cost ?? '', remarks: data.remarks || '',
      spare_parts: data.spare_parts.map((p) => ({ part_name: p.part_name, quantity: p.quantity, unit_cost: p.unit_cost, remarks: p.remarks || '' })),
    });
  };

  useEffect(() => {
    maintenanceService.get(id).then(fill).catch((e) => setError(getApiError(e).message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isAdmin) return;
    userService.list({ role: 'inspector', active: 'true', limit: 100 }).then((r) => setTechnicians(r.data)).catch(() => {});
  }, [isAdmin]);

  const toPayload = (d) => ({
    required_repair: d.required_repair || null,
    technician_id: d.technician_id ? Number(d.technician_id) : null,
    technician_name: d.technician_name || null,
    maintenance_date: d.maintenance_date || null,
    completion_date: d.completion_date || null,
    repair_cost: d.repair_cost === '' || d.repair_cost == null ? null : Number(d.repair_cost),
    remarks: d.remarks || null,
    spare_parts: d.spare_parts.map((p) => ({ part_name: p.part_name, quantity: Number(p.quantity) || 1, unit_cost: Number(p.unit_cost) || 0, remarks: p.remarks || null })),
  });
  // Inspectors cannot reassign the technician field to other people; only admins see that select
  const clean = (p) => { if (!isAdmin) delete p.technician_id; return p; };

  const saveDetails = handleSubmit(async (d) => {
    try {
      fill(await maintenanceService.update(m.id, clean(toPayload(d))));
      toast.success('Maintenance record saved');
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setFieldError, fieldErrors);
      toast.error(message);
    }
  });

  const changeStatus = async () => {
    setBusy(true);
    try {
      // Save any edits together with the status change
      const body = { status: confirm };
      if (isDirty) Object.assign(body, clean(toPayload(getValues())));
      fill(await maintenanceService.update(m.id, body));
      toast.success(`Status: ${MAINT_STATUS[confirm].label}`);
      setConfirm(null);
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setFieldError, fieldErrors);
      toast.error(fieldErrors.status || message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const uploadPhotos = async () => {
    setBusy(true);
    try {
      await maintenanceService.uploadPhotos(m.id, photos, stage);
      setPhotos([]);
      fill(await maintenanceService.get(m.id));
      toast.success('Photos uploaded');
    } catch (err) {
      toast.error(getApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="card"><EmptyState title={error} action={<Link to="/maintenance"><Button variant="secondary">Back</Button></Link>} /></div>;
  if (!m) return <PageLoader />;

  const closed = CLOSED.includes(m.status);
  const editable = canWork && !closed;
  const next = (MAINT_NEXT[m.status] || []).filter(([, adminOnly]) => !adminOnly || isAdmin);
  const partsTotal = (watch('spare_parts') || []).reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unit_cost) || 0), 0);

  return (
    <>
      <Link to="/maintenance/requests" className="mb-3 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Repair requests
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{m.maintenance_code}, {SOURCE_LABEL[m.source].toLowerCase()}</p>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{m.equipment_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ward-chip">{m.ward_number}</span>
            <MaintenanceBadge status={m.status} />
            <span className="text-sm text-slate-600">Device now:</span><ConditionBadge condition={m.current_condition} />
          </div>
        </div>
      </div>

      {canWork && next.length > 0 && (
        <div className="card mb-4 p-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Next step</p>
          <div className="flex flex-wrap gap-2">
            {next.map(([s]) => (
              <Button key={s} variant={['cancelled', 'not_repairable'].includes(s) ? 'secondary' : 'primary'} onClick={() => setConfirm(s)}>
                {ACTION_LABEL[s]}
              </Button>
            ))}
          </div>
          {!isAdmin && ['pending', 'under_assessment'].includes(m.status) && (
            <p className="mt-2 text-sm text-slate-600">The Super Admin approves repairs before work starts.</p>
          )}
        </div>
      )}
      {m.status === 'completed' && canWork && (
        <div className="card mb-4 flex flex-col gap-3 border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-emerald-950">Repair completed. Record a follow-up inspection to update the device's condition.</p>
          <Link to={`/inspections/new?ward_id=${m.ward_id}&equipment_id=${m.equipment_id}&type=follow_up`}><Button icon={ClipboardPlus}>Follow-up inspection</Button></Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="font-semibold">Request</h2>
          <dl className="mt-3 space-y-3">
            <Detail label="Reported problem">{m.reported_problem}</Detail>
            <Detail label="Asset ID / serial"><Link className="text-brand-700" to={`/equipment/${m.equipment_id}`}>{m.asset_id}</Link>{m.serial_number ? `, ${m.serial_number}` : ''}</Detail>
            <Detail label="Category">{m.category_name}</Detail>
            <Detail label="Reported by">{m.reported_by_name ? `${m.reported_by_name}, ${formatDateTime(m.created_at)}` : formatDateTime(m.created_at)}</Detail>
            {m.inspection_code && <Detail label="From inspection"><Link className="text-brand-700" to={`/inspections/${m.inspection_id}`}>{m.inspection_code}</Link></Detail>}
            {m.approved_by_name && <Detail label="Approved by">{`${m.approved_by_name}, ${formatDateTime(m.approved_at)}`}</Detail>}
          </dl>
        </section>

        <form onSubmit={saveDetails} noValidate className="card space-y-4 p-5 lg:col-span-2">
          <h2 className="font-semibold">Repair record</h2>
          {!editable ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Required repair">{m.required_repair}</Detail>
              <Detail label="Technician">{m.technician_display}</Detail>
              <Detail label="Maintenance date">{formatDate(m.maintenance_date)}</Detail>
              <Detail label="Completion date">{formatDate(m.completion_date)}</Detail>
              <Detail label="Repair cost">{formatMoney(m.repair_cost)}</Detail>
              <Detail label="Remarks">{m.remarks}</Detail>
            </dl>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Required repair" as="textarea" rows={2} className="sm:col-span-2" {...register('required_repair')} />
              {isAdmin ? (
                <SelectField label="Technician" {...register('technician_id')}>
                  <option value="">Not assigned</option>
                  {technicians.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </SelectField>
              ) : <Detail label="Technician">{m.technician_display}</Detail>}
              <TextField label="External technician / vendor" placeholder="If repaired outside" {...register('technician_name')} />
              <TextField label="Maintenance date" type="date" error={errors.maintenance_date?.message} {...register('maintenance_date')} />
              <TextField label="Completion date" type="date" error={errors.completion_date?.message} {...register('completion_date')} />
              <TextField label="Repair cost (NPR)" type="number" inputMode="decimal" min={0} step="0.01"
                hint="Leave blank to use the spare parts total" error={errors.repair_cost?.message} {...register('repair_cost')} />
              <TextField label="Remarks" as="textarea" rows={2} {...register('remarks')} />
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Spare parts used</h3>
            {parts.fields.length === 0 && <p className="text-sm text-slate-600">None recorded.</p>}
            <ul className="space-y-2">
              {parts.fields.map((p, idx) => (
                <li key={p.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_6rem_8rem_auto]">
                  <input className="input" placeholder="Part name" disabled={!editable} aria-label="Part name"
                    {...register(`spare_parts.${idx}.part_name`, { required: true })} />
                  <input className="input sm:order-none" type="number" min={1} inputMode="numeric" disabled={!editable} aria-label="Quantity"
                    {...register(`spare_parts.${idx}.quantity`)} />
                  <input className="input" type="number" min={0} step="0.01" inputMode="decimal" disabled={!editable} aria-label="Unit cost" placeholder="Unit cost"
                    {...register(`spare_parts.${idx}.unit_cost`)} />
                  {editable && <Button variant="ghost" icon={Trash2} className="text-red-700" onClick={() => parts.remove(idx)} aria-label="Remove part" />}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between gap-2">
              {editable && <Button variant="ghost" icon={Plus} className="-ml-2 text-brand-700" onClick={() => parts.append({ part_name: '', quantity: 1, unit_cost: 0, remarks: '' })}>Add part</Button>}
              <p className="text-sm text-slate-700">Parts total: <strong>{formatMoney(partsTotal)}</strong></p>
            </div>
          </div>

          {editable && <Button type="submit" icon={Save} loading={isSubmitting} disabled={!isDirty} className="w-full sm:w-auto">Save repair record</Button>}
        </form>

        <section className="card space-y-4 p-5 lg:col-span-3">
          <h2 className="font-semibold">Before and after photographs</h2>
          <PhotoGallery photos={m.photos} labelFor={(p) => (p.stage === 'before' ? 'Before repair' : 'After repair')} />
          {canWork && m.status !== 'cancelled' && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Photo stage">
                {['before', 'after'].map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={stage === s} onClick={() => setStage(s)}
                    className={`min-h-touch rounded-lg border text-sm font-semibold ${stage === s ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300'}`}>
                    {s === 'before' ? 'Before repair' : 'After repair'}
                  </button>
                ))}
              </div>
              <PhotoPicker pending={photos} onPendingChange={setPhotos} existing={m.photos} disabled={busy} />
              {photos.length > 0 && <Button icon={Upload} loading={busy} onClick={uploadPhotos}>Upload {photos.length} photo{photos.length > 1 ? 's' : ''}</Button>}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={changeStatus} loading={busy}
        danger={['cancelled', 'not_repairable'].includes(confirm)}
        title={confirm ? `${ACTION_LABEL[confirm]}?` : ''} confirmLabel={confirm ? ACTION_LABEL[confirm] : ''}
        message={confirm === 'completed'
          ? 'Completion date defaults to today and cost to the spare parts total if left blank. The record is then locked.'
          : CLOSED.includes(confirm) ? 'This closes the record; it cannot be edited afterwards.' : `The status will change to ${confirm ? MAINT_STATUS[confirm].label.toLowerCase() : ''}.`} />
    </>
  );
}
