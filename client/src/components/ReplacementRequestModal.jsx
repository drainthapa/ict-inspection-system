import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { TextField } from './ui/FormField.jsx';
import { replacementService } from '../services/workflow.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';

export default function ReplacementRequestModal({ open, onClose, equipment, onSaved }) {
  const toast = useToast();
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset({ reason: '', technical_recommendation: '', estimated_cost: '', remarks: '' }); }, [open, reset]);

  const onSubmit = async (d) => {
    try {
      await replacementService.create({ equipment_id: equipment.id, ...d, estimated_cost: d.estimated_cost === '' ? null : Number(d.estimated_cost) });
      toast.success('Replacement sent to the Super Admin for approval');
      onSaved?.(); onClose();
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      toast.error(message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Recommend replacement"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="repl-form" loading={isSubmitting}>Send for approval</Button>
        </>
      )}>
      <form id="repl-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">{equipment.name}, {equipment.asset_id}. The device stays in the inventory until a replacement is delivered.</p>
        <TextField label="Reason for replacement" required as="textarea" rows={3} error={errors.reason?.message}
          {...register('reason', { required: 'Give the reason', minLength: { value: 3, message: 'Give the reason' } })} />
        <TextField label="Technical recommendation" required as="textarea" rows={3} placeholder="Specification of the replacement"
          error={errors.technical_recommendation?.message}
          {...register('technical_recommendation', { required: 'Give the recommendation', minLength: { value: 3, message: 'Give the recommendation' } })} />
        <TextField label="Estimated cost (NPR)" type="number" inputMode="decimal" min={0} step="0.01" error={errors.estimated_cost?.message} {...register('estimated_cost')} />
        <TextField label="Remarks" as="textarea" rows={2} {...register('remarks')} />
      </form>
    </Modal>
  );
}
