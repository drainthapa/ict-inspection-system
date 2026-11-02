import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Users, Phone, Mail, Boxes, Trash2, ChevronRight } from 'lucide-react';
import { wardService } from '../services/ward.service.js';
import { userService } from '../services/user.service.js';
import { equipmentService } from '../services/equipment.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import WardFormModal from '../components/WardFormModal.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import { ROLES, ROLE_LABELS } from '../utils/roles.js';

function StaffModal({ open, onClose, ward, onSaved }) {
  const toast = useToast();
  const [people, setPeople] = useState(null);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSelected(ward.assigned_users.map((u) => u.id));
    Promise.all([
      userService.list({ role: ROLES.INSPECTOR, active: 'true', limit: 100 }),
      userService.list({ role: ROLES.WARD_USER, active: 'true', limit: 100 }),
    ]).then(([a, b]) => setPeople([...a.data, ...b.data]))
      .catch((e) => setError(getApiError(e).message));
  }, [open, ward]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await wardService.setUsers(ward.id, selected);
      toast.success('Ward staff updated');
      onSaved(updated);
      onClose();
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      setError(fieldErrors.user_ids || message);
    } finally {
      setSaving(false);
    }
  };

  const groups = [ROLES.INSPECTOR, ROLES.WARD_USER].map((role) => ({
    role, items: (people || []).filter((p) => p.role === role),
  }));

  return (
    <Modal open={open} onClose={onClose} title={`Staff for Ward No. ${ward.ward_number}`} size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!people}>Save staff</Button>
        </>
      )}>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {!people ? <PageLoader /> : groups.map(({ role, items }) => (
        <fieldset key={role} className="mb-5">
          <legend className="mb-2 text-sm font-semibold text-slate-900">{role === ROLES.INSPECTOR ? 'Inspectors / technicians' : 'Ward office users'}</legend>
          {role === ROLES.WARD_USER && (
            <p className="mb-2 text-sm text-slate-600">A ward office user belongs to one ward. Selecting someone from another ward moves them here.</p>
          )}
          {items.length === 0 ? <p className="text-sm text-slate-500">No active accounts. Create them in User management.</p> : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {items.map((p) => {
                const elsewhere = p.wards.filter((w) => w.id !== ward.id);
                return (
                  <li key={p.id}>
                    <label className="flex min-h-touch cursor-pointer items-center gap-3 px-3 py-2">
                      <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-brand-700"
                        checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{p.full_name}</span>
                        <span className="block truncate text-xs text-slate-500">@{p.username}{p.designation ? `, ${p.designation}` : ''}</span>
                      </span>
                      {elsewhere.length > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                          Also
                          {elsewhere.slice(0, 4).map((w) => <span key={w.id} className="ward-chip h-6 min-w-6">{w.ward_number}</span>)}
                          {elsewhere.length > 4 && `+${elsewhere.length - 4}`}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ))}
    </Modal>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children || '—'}</dd>
    </div>
  );
}

export default function WardDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(ROLES.SUPER_ADMIN);
  const [ward, setWard] = useState(null);
  const [equipment, setEquipment] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'edit' | 'staff' | 'delete'
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    wardService.get(id).then(setWard).catch((e) => setError(getApiError(e).message));
    equipmentService.list({ ward_id: id, sort: 'condition', limit: 5 }).then(setEquipment).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    setDeleting(true);
    try {
      await wardService.remove(ward.id);
      toast.success('Ward deleted');
      navigate('/wards');
    } catch (err) {
      toast.error(getApiError(err).message);
      setModal(null);
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="card">
        <EmptyState title={error} action={<Link to="/wards"><Button variant="secondary">Back to ward offices</Button></Link>} />
      </div>
    );
  }
  if (!ward) return <PageLoader />;

  return (
    <>
      <Link to="/wards" className="mb-3 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Ward offices
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="ward-chip h-12 min-w-12 text-lg">{ward.ward_number}</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{ward.office_name}</h1>
            <p className="text-sm text-slate-600">{ward.address || 'No address recorded'}</p>
          </div>
          {!ward.is_active && <Badge>Inactive</Badge>}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')} className="flex-1 sm:flex-none">Edit</Button>
            <Button variant="ghost" icon={Trash2} onClick={() => setModal('delete')} className="text-red-700" aria-label="Delete ward" />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Office details</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Detail label="Ward chairperson">{ward.chairperson_name}</Detail>
            <Detail label="Ward secretary / representative">{ward.secretary_name}</Detail>
            <Detail label="Contact number">
              {ward.contact_number && (
                <a href={`tel:${ward.contact_number}`} className="inline-flex items-center gap-1 text-brand-700">
                  <Phone className="h-4 w-4" aria-hidden />{ward.contact_number}
                </a>
              )}
            </Detail>
            <Detail label="Email">
              {ward.email && (
                <a href={`mailto:${ward.email}`} className="inline-flex items-center gap-1 break-all text-brand-700">
                  <Mail className="h-4 w-4 shrink-0" aria-hidden />{ward.email}
                </a>
              )}
            </Detail>
            {ward.remarks && <div className="sm:col-span-2"><Detail label="Remarks">{ward.remarks}</Detail></div>}
          </dl>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
            <div><dt className="text-sm text-slate-500">Equipment</dt><dd className="text-xl font-bold">{ward.equipment_count}</dd></div>
            <div><dt className="text-sm text-slate-500">Not working</dt><dd className={`text-xl font-bold ${ward.faulty_count ? 'text-red-700' : ''}`}>{ward.faulty_count}</dd></div>
            <div><dt className="text-sm text-slate-500">Inspections</dt><dd className="text-xl font-bold">{ward.inspection_count}</dd></div>
          </dl>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Assigned staff</h2>
            {isAdmin && <Button variant="ghost" icon={Users} onClick={() => setModal('staff')} className="-mr-2">Manage</Button>}
          </div>
          {ward.assigned_users.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No inspector or ward office user is assigned yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {ward.assigned_users.map((u) => (
                <li key={u.id} className="py-2.5">
                  <p className="text-sm font-medium text-slate-900">{u.full_name}</p>
                  <p className="text-xs text-slate-500">{ROLE_LABELS[u.role]}{u.phone ? `, ${u.phone}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Equipment needing attention first</h2>
            <Link to={`/equipment?ward_id=${ward.id}`} className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-brand-700">
              All {ward.equipment_count} <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {equipment?.data.length === 0 && (
            <EmptyState icon={Boxes} title="No equipment registered for this ward" />
          )}
          {equipment?.data.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100">
              {equipment.data.map((e) => (
                <li key={e.id}>
                  <Link to={`/equipment/${e.id}`} className="flex min-h-touch items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{e.name}</span>
                      <span className="block truncate text-xs text-slate-500">{e.asset_id}, {e.category_name}</span>
                    </span>
                    <ConditionBadge condition={e.current_condition} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <WardFormModal open={modal === 'edit'} onClose={() => setModal(null)} ward={ward} onSaved={setWard} />
      <StaffModal open={modal === 'staff'} onClose={() => setModal(null)} ward={ward} onSaved={setWard} />
      <ConfirmDialog open={modal === 'delete'} onClose={() => setModal(null)} onConfirm={remove} loading={deleting} danger
        title={`Delete Ward No. ${ward.ward_number}?`} confirmLabel="Delete ward"
        message="A ward can only be deleted if no equipment or inspections have been recorded for it. Otherwise, edit the ward and mark it inactive." />
    </>
  );
}
