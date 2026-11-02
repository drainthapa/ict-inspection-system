import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { TextField } from './ui/FormField.jsx';
import { wardService } from '../services/ward.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';

const EMPTY = {
  ward_number: '', office_name: '', address: '', chairperson_name: '', secretary_name: '',
  contact_number: '', email: '', remarks: '', is_active: true,
};

export default function WardFormModal({ open, onClose, ward, onSaved }) {
  const toast = useToast();
  const isEdit = !!ward;
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (open) reset(isEdit ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, ward[k] ?? ''])) : EMPTY);
  }, [open, ward, isEdit, reset]);

  const onSubmit = async (data) => {
    const payload = { ...data, ward_number: Number(data.ward_number) };
    try {
      const saved = isEdit ? await wardService.update(ward.id, payload) : await wardService.create(payload);
      toast.success(isEdit ? 'Ward saved' : 'Ward added');
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
      title={isEdit ? `Edit Ward No. ${ward.ward_number}` : 'Add ward office'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="ward-form" loading={isSubmitting}>{isEdit ? 'Save ward' : 'Add ward'}</Button>
        </>
      )}
    >
      <form id="ward-form" onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 md:grid-cols-2">
        <TextField label="Ward number" required type="number" inputMode="numeric" min={1} max={99}
          error={errors.ward_number?.message}
          {...register('ward_number', { required: 'Ward number is required', min: { value: 1, message: '1–99' }, max: { value: 99, message: '1–99' } })} />
        <TextField label="Ward office name" required error={errors.office_name?.message}
          {...register('office_name', { required: 'Office name is required' })} />
        <TextField label="Address" className="md:col-span-2" error={errors.address?.message} {...register('address')} />
        <TextField label="Ward chairperson" error={errors.chairperson_name?.message} {...register('chairperson_name')} />
        <TextField label="Ward secretary / office representative" error={errors.secretary_name?.message} {...register('secretary_name')} />
        <TextField label="Contact number" type="tel" inputMode="tel" error={errors.contact_number?.message} {...register('contact_number')} />
        <TextField label="Email" type="email" inputMode="email" autoCapitalize="none" error={errors.email?.message} {...register('email')} />
        <TextField label="Remarks" as="textarea" rows={3} className="md:col-span-2" error={errors.remarks?.message} {...register('remarks')} />
        {isEdit && (
          <label className="flex min-h-touch items-center gap-3 rounded-lg border border-slate-200 px-3 md:col-span-2">
            <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-brand-700" {...register('is_active')} />
            <span className="text-sm font-medium text-slate-800">Ward office active</span>
          </label>
        )}
      </form>
    </Modal>
  );
}
