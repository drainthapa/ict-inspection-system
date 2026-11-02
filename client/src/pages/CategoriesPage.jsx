import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { categoryService } from '../services/equipment.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import { TextField, SelectField } from '../components/ui/FormField.jsx';
import { CHECKLISTS } from '../utils/conditions.js';

function CategoryModal({ open, onClose, category, groups, onSaved }) {
  const toast = useToast();
  const isEdit = !!category;
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (!open) return;
    reset(isEdit ? {
      ...category, type_options: category.type_options.join(', '),
      checklist_group: category.checklist_group || '', description: category.description || '',
    } : {
      name: '', code: '', group_name: groups[0] || '', type_options: '', checklist_group: '',
      description: '', is_active: true,
    });
  }, [open, category, isEdit, groups, reset]);

  const onSubmit = async (d) => {
    const payload = {
      name: d.name, code: d.code, group_name: d.group_name, description: d.description || null,
      checklist_group: d.checklist_group || null,
      type_options: d.type_options.split(',').map((s) => s.trim()).filter(Boolean),
      ...(isEdit ? { is_active: d.is_active, sort_order: Number(d.sort_order) } : {}),
    };
    try {
      const saved = isEdit ? await categoryService.update(category.id, payload) : await categoryService.create(payload);
      toast.success(isEdit ? 'Category saved' : 'Category added');
      onSaved(saved);
      onClose();
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      toast.error(message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${category.name}` : 'Add equipment category'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="category-form" loading={isSubmitting}>{isEdit ? 'Save category' : 'Add category'}</Button>
        </>
      )}>
      <form id="category-form" onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" required className="sm:col-span-2" error={errors.name?.message}
          {...register('name', { required: 'Name is required' })} />
        <TextField label="Code" required autoCapitalize="characters" hint="Used in suggested asset IDs, e.g. PRINTER"
          error={errors.code?.message}
          {...register('code', {
            required: 'Code is required', setValueAs: (v) => (v || '').trim().toUpperCase(),
            pattern: { value: /^[A-Z0-9_]{2,30}$/i, message: '2–30 letters, numbers or _' },
          })} />
        <TextField label="Group" required list="category-groups" error={errors.group_name?.message}
          {...register('group_name', { required: 'Group is required' })} />
        <datalist id="category-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <TextField label="Types" className="sm:col-span-2" placeholder="e.g. Laser, Inkjet"
          hint="Separate with commas. Leave blank if the category has no sub-types." error={errors.type_options?.message}
          {...register('type_options')} />
        <SelectField label="Inspection checklist" error={errors.checklist_group?.message} {...register('checklist_group')}>
          <option value="">None</option>
          {Object.entries(CHECKLISTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        {isEdit && (
          <TextField label="Display order" type="number" inputMode="numeric" min={0} error={errors.sort_order?.message}
            {...register('sort_order')} />
        )}
        <TextField label="Description" as="textarea" rows={2} className="sm:col-span-2" {...register('description')} />
        {isEdit && (
          <label className="flex min-h-touch items-center gap-3 rounded-lg border border-slate-200 px-3 sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-brand-700" {...register('is_active')} />
            <span className="text-sm font-medium text-slate-800">Available for new equipment</span>
          </label>
        )}
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const toast = useToast();
  const [cats, setCats] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => categoryService.list({ include_inactive: 'true' }).then(setCats).catch((e) => toast.error(getApiError(e).message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const grouped = useMemo(() => {
    const m = new Map();
    (cats || []).forEach((c) => m.set(c.group_name, [...(m.get(c.group_name) || []), c]));
    return [...m.entries()];
  }, [cats]);

  const remove = async () => {
    setBusy(true);
    try {
      await categoryService.remove(deleting.id);
      toast.success('Category deleted');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(getApiError(err).message);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Equipment categories" description="The kinds of ICT equipment inspectors can register, and which checklist each uses."
        actions={<Button icon={Plus} onClick={() => setEditing(null)}>Add category</Button>} />
      {!cats ? <PageLoader /> : (
        <div className="space-y-5">
          {grouped.map(([group, items]) => (
            <section key={group}>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">{group}</h2>
              <ul className="card divide-y divide-slate-100">
                {items.map((c) => (
                  <li key={c.id} className={`flex items-center gap-3 px-4 py-3 ${c.is_active ? '' : 'bg-slate-50'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                        {c.name}
                        {!c.is_active && <Badge>Inactive</Badge>}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {c.code}
                        {c.type_options.length > 0 && `, types: ${c.type_options.join(', ')}`}
                        {c.checklist_group && `, ${CHECKLISTS[c.checklist_group]} checklist`}
                      </p>
                    </div>
                    <span className="hidden text-sm text-slate-600 sm:block">{c.equipment_count} in use</span>
                    <Button variant="ghost" icon={Pencil} onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`} />
                    <Button variant="ghost" icon={Trash2} className="text-red-700" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <CategoryModal open={editing !== undefined} onClose={() => setEditing(undefined)} category={editing}
        groups={grouped.map(([g]) => g)} onSaved={load} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} danger
        title={`Delete ${deleting?.name}?`} confirmLabel="Delete category"
        message="Categories that equipment already uses cannot be deleted. Edit the category and turn off “Available for new equipment” instead." />
    </>
  );
}
