import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Wand2 } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { TextField, SelectField } from './ui/FormField.jsx';
import { PageLoader } from './ui/Spinner.jsx';
import { equipmentService, categoryService } from '../services/equipment.service.js';
import { wardService } from '../services/ward.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../utils/roles.js';
import { EQUIPMENT_STATUS } from '../utils/conditions.js';

const FIELDS = [
  'asset_id', 'ward_id', 'category_id', 'name', 'equipment_type', 'brand', 'model', 'serial_number',
  'installation_location', 'quantity', 'purchase_date', 'warranty_expiry', 'status', 'remarks',
];

export default function EquipmentFormModal({ open, onClose, item, defaultWardId, onSaved }) {
  const toast = useToast();
  const { hasRole } = useAuth();
  const isEdit = !!item;
  const [wards, setWards] = useState(null);
  const [categories, setCategories] = useState(null);
  const [suggesting, setSuggesting] = useState(false);

  const {
    register, handleSubmit, reset, watch, setValue, setError, getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    if (!open) return;
    Promise.all([wardService.list({ active: 'true' }), categoryService.list()])
      .then(([w, c]) => { setWards(w); setCategories(c); })
      .catch((e) => toast.error(getApiError(e).message));
  }, [open, toast]);

  useEffect(() => {
    if (!open || !wards) return;
    reset(isEdit
      ? Object.fromEntries(FIELDS.map((f) => [f, item[f] ?? '']))
      : {
        asset_id: '', ward_id: defaultWardId || (wards.length === 1 ? wards[0].id : ''), category_id: '',
        name: '', equipment_type: '', brand: '', model: '', serial_number: '', installation_location: '',
        quantity: 1, purchase_date: '', warranty_expiry: '', status: 'active', remarks: '',
      });
  }, [open, wards, item, isEdit, defaultWardId, reset]);

  const categoryId = Number(watch('category_id')) || null;
  const wardId = Number(watch('ward_id')) || null;
  const category = categories?.find((c) => c.id === categoryId);

  const grouped = useMemo(() => {
    const m = new Map();
    (categories || []).forEach((c) => m.set(c.group_name, [...(m.get(c.group_name) || []), c]));
    return [...m.entries()];
  }, [categories]);

  // Reset an incompatible type when the category changes
  useEffect(() => {
    const t = getValues('equipment_type');
    if (category && category.type_options.length && t && !category.type_options.includes(t)) {
      setValue('equipment_type', '');
    }
  }, [category, getValues, setValue]);

  const suggestAssetId = async () => {
    if (!wardId || !categoryId) return;
    setSuggesting(true);
    try {
      setValue('asset_id', await equipmentService.nextAssetId(wardId, categoryId), { shouldValidate: true });
    } catch (err) {
      toast.error(getApiError(err).message);
    } finally {
      setSuggesting(false);
    }
  };

  // Offer an ID automatically for new equipment once ward and category are chosen
  useEffect(() => {
    if (!isEdit && open && wardId && categoryId && !getValues('asset_id')) suggestAssetId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardId, categoryId]);

  const onSubmit = async (data) => {
    const payload = {};
    FIELDS.forEach((f) => { payload[f] = data[f] === '' ? null : data[f]; });
    payload.ward_id = Number(payload.ward_id);
    payload.category_id = Number(payload.category_id);
    payload.quantity = Number(payload.quantity) || 1;
    if (!isEdit || !hasRole(ROLES.SUPER_ADMIN)) delete payload.status;
    try {
      const saved = isEdit ? await equipmentService.update(item.id, payload) : await equipmentService.create(payload);
      toast.success(isEdit ? 'Equipment saved' : 'Equipment registered');
      onSaved(saved);
      onClose();
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      toast.error(message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${item.asset_id}` : 'Register equipment'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="equipment-form" loading={isSubmitting} disabled={!wards}>
            {isEdit ? 'Save equipment' : 'Register equipment'}
          </Button>
        </>
      )}
    >
      {!wards || !categories ? <PageLoader /> : (
        <form id="equipment-form" onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 md:grid-cols-2">
          <SelectField label="Ward office" required error={errors.ward_id?.message}
            {...register('ward_id', { required: 'Choose a ward' })}>
            <option value="">Choose ward</option>
            {wards.map((w) => <option key={w.id} value={w.id}>Ward No. {w.ward_number}, {w.office_name}</option>)}
          </SelectField>

          <SelectField label="Category" required error={errors.category_id?.message}
            {...register('category_id', { required: 'Choose a category' })}>
            <option value="">Choose category</option>
            {grouped.map(([group, cats]) => (
              <optgroup key={group} label={group}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </SelectField>

          <div>
            <TextField label="Asset ID" required autoCapitalize="characters" spellCheck={false}
              hint="Suggested from ward and category; you can change it"
              error={errors.asset_id?.message}
              {...register('asset_id', {
                required: 'Asset ID is required',
                setValueAs: (v) => (v || '').trim().toUpperCase(),
                pattern: { value: /^[A-Za-z0-9][A-Za-z0-9\-_/.]{1,49}$/, message: '2–50 letters, numbers, - _ / .' },
              })} />
            <Button variant="ghost" icon={Wand2} onClick={suggestAssetId} loading={suggesting}
              disabled={!wardId || !categoryId} className="-ml-2 mt-1 text-brand-700">
              Suggest ID
            </Button>
          </div>

          <TextField label="Equipment name" required placeholder="e.g. HP LaserJet Pro M404dn"
            error={errors.name?.message} {...register('name', { required: 'Equipment name is required' })} />

          {category?.type_options.length > 0 ? (
            <SelectField label="Type" error={errors.equipment_type?.message} {...register('equipment_type')}>
              <option value="">Not specified</option>
              {category.type_options.map((t) => <option key={t} value={t}>{t}</option>)}
            </SelectField>
          ) : (
            <TextField label="Type" placeholder="Optional" error={errors.equipment_type?.message} {...register('equipment_type')} />
          )}

          <TextField label="Quantity" type="number" inputMode="numeric" min={1}
            hint="Use more than 1 only for identical items tracked together, like cables or connectors"
            error={errors.quantity?.message} {...register('quantity', { min: { value: 1, message: 'At least 1' } })} />
          <TextField label="Brand" error={errors.brand?.message} {...register('brand')} />
          <TextField label="Model" error={errors.model?.message} {...register('model')} />
          <TextField label="Serial number" autoCapitalize="characters" spellCheck={false}
            error={errors.serial_number?.message} {...register('serial_number')} />
          <TextField label="Installation location" placeholder="e.g. Ward secretary's room"
            error={errors.installation_location?.message} {...register('installation_location')} />
          <TextField label="Purchase date" type="date" error={errors.purchase_date?.message} {...register('purchase_date')} />
          <TextField label="Warranty expiry" type="date" error={errors.warranty_expiry?.message} {...register('warranty_expiry')} />

          {isEdit && hasRole(ROLES.SUPER_ADMIN) && (
            <SelectField label="Status" error={errors.status?.message} {...register('status')}
              hint="Replaced or disposed equipment is hidden from the active inventory">
              {Object.entries(EQUIPMENT_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </SelectField>
          )}

          <TextField label="Remarks" as="textarea" rows={3} className="md:col-span-2"
            error={errors.remarks?.message} {...register('remarks')} />
        </form>
      )}
    </Modal>
  );
}
