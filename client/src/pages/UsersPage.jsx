import { useCallback, useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { UserPlus, Search, Pencil, UserX, Users, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { userService } from '../services/user.service.js';
import { wardService } from '../services/ward.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import { TextField, SelectField } from '../components/ui/FormField.jsx';
import { ROLES, ROLE_LABELS } from '../utils/roles.js';
import { formatDateTime } from '../utils/format.js';

const ROLE_TONE = { super_admin: 'blue', inspector: 'amber', ward_user: 'slate' };

/* ------------------------------------------------------------------ */
/* Ward picker: multi-select chips for inspectors, single for ward users */
/* ------------------------------------------------------------------ */
function WardPicker({ wards, value, onChange, single, error }) {
  const toggle = (id) => {
    if (single) return onChange([id]);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <fieldset>
      <legend className="label">
        {single ? 'Ward office' : 'Assigned wards'}<span className="text-red-700" aria-hidden> *</span>
      </legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {wards.map((w) => {
          const on = value.includes(w.id);
          return (
            <button
              key={w.id}
              type="button"
              role={single ? 'radio' : 'checkbox'}
              aria-checked={on}
              onClick={() => toggle(w.id)}
              className={`min-h-touch rounded-lg border text-sm font-semibold transition-colors ${on
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-brand-400'}`}
            >
              {w.ward_number}
            </button>
          );
        })}
      </div>
      {!single && (
        <div className="mt-2 flex gap-3 text-sm">
          <button type="button" className="min-h-touch font-medium text-brand-700" onClick={() => onChange(wards.map((w) => w.id))}>Select all</button>
          <button type="button" className="min-h-touch font-medium text-slate-600" onClick={() => onChange([])}>Clear</button>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
function UserFormModal({ open, onClose, user, wards, onSaved }) {
  const isEdit = !!user;
  const toast = useToast();
  const { user: me } = useAuth();
  const isSelf = isEdit && user.id === me.id;

  const {
    register, handleSubmit, control, watch, reset, setError, setValue, getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    if (!open) return;
    reset(isEdit ? {
      full_name: user.full_name, username: user.username, email: user.email || '',
      phone: user.phone || '', designation: user.designation || '', role: user.role,
      ward_ids: user.wards.map((w) => w.id), password: '', is_active: user.is_active,
    } : {
      full_name: '', username: '', email: '', phone: '', designation: '',
      role: ROLES.INSPECTOR, ward_ids: [], password: '', is_active: true,
    });
  }, [open, user, isEdit, reset]);

  const role = watch('role');

  // Keep ward selection consistent with the chosen role
  useEffect(() => {
    if (!open) return;
    if (role === ROLES.SUPER_ADMIN) setValue('ward_ids', []);
    if (role === ROLES.WARD_USER) setValue('ward_ids', (getValues('ward_ids') || []).slice(0, 1));
  }, [role, open, setValue, getValues]);

  const onSubmit = async (data) => {
    const payload = { ...data };
    if (payload.role === ROLES.SUPER_ADMIN) payload.ward_ids = [];
    if (payload.role === ROLES.WARD_USER) payload.ward_ids = payload.ward_ids.slice(0, 1);
    if (isEdit && !payload.password) delete payload.password;
    if (!isEdit) delete payload.is_active;

    try {
      const saved = isEdit ? await userService.update(user.id, payload) : await userService.create(payload);
      toast.success(isEdit ? 'User updated' : 'User created');
      onSaved(saved);
      onClose();
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      toast.error(message);
    }
  };

  const wardRule = (v) => {
    if (role === ROLES.SUPER_ADMIN) return true;
    if (role === ROLES.WARD_USER) return v.length === 1 || 'Choose the ward office';
    return v.length > 0 || 'Assign at least one ward';
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${user.full_name}` : 'Add user'}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="user-form" loading={isSubmitting}>{isEdit ? 'Save changes' : 'Create user'}</Button>
        </>
      )}
    >
      <form id="user-form" onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 md:grid-cols-2">
        <TextField label="Full name" required error={errors.full_name?.message}
          {...register('full_name', { required: 'Full name is required', minLength: { value: 2, message: 'Too short' } })} />
        <TextField label="Username" required autoCapitalize="none" autoCorrect="off" spellCheck={false}
          hint="Lowercase letters, numbers, dot, dash or underscore"
          error={errors.username?.message}
          {...register('username', {
            required: 'Username is required',
            setValueAs: (v) => v.trim().toLowerCase(),
            pattern: { value: /^[a-z0-9._-]{3,50}$/, message: '3–50 characters: a–z, 0–9, . _ -' },
          })} />
        <TextField label="Email" type="email" inputMode="email" autoCapitalize="none" error={errors.email?.message}
          {...register('email', { pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' } })} />
        <TextField label="Phone" type="tel" inputMode="tel" error={errors.phone?.message}
          {...register('phone', { pattern: { value: /^[0-9+\-\s]{7,20}$/, message: 'Enter a valid phone number' } })} />
        <TextField label="Designation" placeholder="e.g. IT Officer" error={errors.designation?.message}
          {...register('designation', { maxLength: { value: 100, message: 'Too long' } })} />
        <SelectField label="Role" required disabled={isSelf} error={errors.role?.message}
          hint={isSelf ? 'You cannot change your own role' : undefined}
          {...register('role', { required: 'Choose a role' })}>
          {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>

        <div className="md:col-span-2">
          {role === ROLES.SUPER_ADMIN ? (
            <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">Super Admins can access all 11 wards.</p>
          ) : (
            <Controller
              name="ward_ids"
              control={control}
              rules={{ validate: wardRule }}
              render={({ field }) => (
                <WardPicker wards={wards} value={field.value || []} onChange={field.onChange}
                  single={role === ROLES.WARD_USER} error={errors.ward_ids?.message} />
              )}
            />
          )}
        </div>

        <TextField
          label={isEdit ? 'Set a new password' : 'Password'}
          required={!isEdit}
          type="password"
          autoComplete="new-password"
          hint={isEdit ? 'Leave blank to keep the current password. Changing it signs the user out.' : 'At least 8 characters with a letter and a number'}
          error={errors.password?.message}
          {...register('password', {
            validate: (v) => {
              if (!v) return isEdit || 'Password is required';
              if (v.length < 8) return 'At least 8 characters';
              if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include a letter and a number';
              return true;
            },
          })}
        />

        {isEdit && !isSelf && (
          <label className="flex min-h-touch items-center gap-3 self-end rounded-lg border border-slate-200 px-3">
            <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-brand-700" {...register('is_active')} />
            <span className="text-sm font-medium text-slate-800">Account active</span>
          </label>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function WardList({ wards }) {
  if (!wards.length) return <span className="text-sm text-slate-500">All wards</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {wards.map((w) => <span key={w.id} className="ward-chip h-6 min-w-6">{w.ward_number}</span>)}
    </div>
  );
}

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [wards, setWards] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', role: '', ward_id: '', active: '' });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [deactivating, setDeactivating] = useState(null);
  const [busy, setBusy] = useState(false);
  const search = useDebounce(filters.search);

  useEffect(() => { wardService.list().then(setWards).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      ['role', 'ward_id', 'active'].forEach((k) => { if (filters[k]) params[k] = filters[k]; });
      setData(await userService.list(params));
    } catch (err) {
      toast.error(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters.role, filters.ward_id, filters.active, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filters.role, filters.ward_id, filters.active]);

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const activeFilterCount = ['role', 'ward_id', 'active'].filter((k) => filters[k]).length;

  const confirmDeactivate = async () => {
    setBusy(true);
    try {
      await userService.deactivate(deactivating.id);
      toast.success(`${deactivating.full_name} deactivated`);
      setDeactivating(null);
      load();
    } catch (err) {
      toast.error(getApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <>
      <PageHeader
        title="User management"
        description="Create accounts, assign roles and give inspectors and ward staff access to their wards."
        actions={<Button icon={UserPlus} onClick={() => setEditing(null)}>Add user</Button>}
      />

      {/* Filters */}
      <div className="card mb-4 p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              className="input pl-9"
              placeholder="Search name, username, email or phone"
              value={filters.search}
              onChange={setFilter('search')}
              aria-label="Search users"
            />
          </div>
          <Button variant="secondary" icon={SlidersHorizontal} className="md:hidden" onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters} aria-label="Filters">
            {activeFilterCount > 0 && <span className="ward-chip h-5 min-w-5">{activeFilterCount}</span>}
          </Button>
        </div>
        <div className={`${showFilters ? 'grid' : 'hidden'} mt-3 gap-2 sm:grid-cols-3 md:grid`}>
          <select className="input" value={filters.role} onChange={setFilter('role')} aria-label="Role">
            <option value="">All roles</option>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input" value={filters.ward_id} onChange={setFilter('ward_id')} aria-label="Ward">
            <option value="">All wards</option>
            {wards.map((w) => <option key={w.id} value={w.id}>Ward No. {w.ward_number}</option>)}
          </select>
          <select className="input" value={filters.active} onChange={setFilter('active')} aria-label="Status">
            <option value="">Active and inactive</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>
        {(activeFilterCount > 0 || filters.search) && (
          <button className="mt-2 min-h-touch text-sm font-medium text-brand-700"
            onClick={() => setFilters({ search: '', role: '', ward_id: '', active: '' })}>
            Clear filters
          </button>
        )}
      </div>

      {loading && !data ? <PageLoader /> : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Users} title="No users match these filters"
            action={<Button variant="secondary" onClick={() => setFilters({ search: '', role: '', ward_id: '', active: '' })}>Clear filters</Button>}>
            Try a different search or remove a filter.
          </EmptyState>
        </div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {/* Phone & tablet portrait: cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((u) => (
              <li key={u.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{u.full_name}</p>
                    <p className="truncate text-sm text-slate-600">@{u.username}{u.designation ? `, ${u.designation}` : ''}</p>
                  </div>
                  {!u.is_active && <Badge tone="red">Inactive</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={ROLE_TONE[u.role]}>{u.role_name}</Badge>
                  <WardList wards={u.wards} />
                </div>
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <Button variant="secondary" icon={Pencil} className="flex-1" onClick={() => setEditing(u)}>Edit</Button>
                  {u.is_active && u.id !== me.id && (
                    <Button variant="ghost" icon={UserX} className="flex-1 text-red-700" onClick={() => setDeactivating(u)}>Deactivate</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet landscape & desktop: table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Wards</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => (
                  <tr key={u.id} className={u.is_active ? '' : 'bg-slate-50 text-slate-500'}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{u.full_name}</p>
                      <p className="text-slate-500">@{u.username}{!u.is_active && ', inactive'}</p>
                    </td>
                    <td className="px-4 py-3"><Badge tone={ROLE_TONE[u.role]}>{u.role_name}</Badge></td>
                    <td className="px-4 py-3"><WardList wards={u.wards} /></td>
                    <td className="px-4 py-3">
                      <p>{u.phone || '—'}</p>
                      <p className="text-slate-500">{u.email || ''}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(u.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" icon={Pencil} onClick={() => setEditing(u)} aria-label={`Edit ${u.full_name}`} />
                        {u.is_active && u.id !== me.id && (
                          <Button variant="ghost" icon={UserX} className="text-red-700" onClick={() => setDeactivating(u)} aria-label={`Deactivate ${u.full_name}`} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-600">Page {meta.page} of {meta.totalPages}, {meta.total} users</p>
              <div className="flex gap-2">
                <Button variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" />
                <Button variant="secondary" icon={ChevronRight} disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page" />
              </div>
            </div>
          )}
        </div>
      )}

      <UserFormModal
        open={editing !== undefined}
        user={editing}
        wards={wards}
        onClose={() => setEditing(undefined)}
        onSaved={load}
      />
      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={confirmDeactivate}
        loading={busy}
        danger
        title="Deactivate user?"
        confirmLabel="Deactivate"
        message={deactivating && `${deactivating.full_name} will be signed out and won't be able to log in. Their inspection history is kept. You can reactivate the account later.`}
      />
    </>
  );
}
