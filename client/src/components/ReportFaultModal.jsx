import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { TextField } from './ui/FormField.jsx';
import { maintenanceService } from '../services/workflow.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';

/** Ward office users report a fault; inspectors log maintenance directly. */
export default function ReportFaultModal({ open, onClose, equipment, asTechnician }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm();
  useEffect(() => { if (open) reset({ reported_problem: '', required_repair: '', remarks: '' }); }, [open, reset]);

  const onSubmit = async (d) => {
    try {
      const m = await maintenanceService.create({ equipment_id: equipment.id, ...d });
      toast.success(asTechnician ? 'Maintenance record created' : 'Fault reported to the IT section');
      onClose();
      navigate(`/maintenance/${m.id}`);
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      toast.error(message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={asTechnician ? 'Log maintenance' : 'Report a fault'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="fault-form" loading={isSubmitting}>{asTechnician ? 'Create record' : 'Report fault'}</Button>
        </>
      )}>
      <form id="fault-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">{equipment.name}, {equipment.asset_id}</p>
        <TextField label="What is the problem?" required as="textarea" rows={4}
          placeholder="e.g. Printer shows paper jam even when empty" error={errors.reported_problem?.message}
          {...register('reported_problem', { required: 'Describe the problem', minLength: { value: 3, message: 'Describe the problem' } })} />
        {asTechnician && <TextField label="Repair needed" as="textarea" rows={2} {...register('required_repair')} />}
        <TextField label="Remarks" as="textarea" rows={2} {...register('remarks')} />
      </form>
    </Modal>
  );
}
