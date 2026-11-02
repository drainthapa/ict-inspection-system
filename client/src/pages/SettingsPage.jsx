import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { settingsService } from '../services/equipment.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import { TextField } from '../components/ui/FormField.jsx';

const FIELDS = [
  ['municipality_name', 'Municipality name', 'Printed at the top of every report'],
  ['office_name', 'Office name', 'Printed under the municipality name'],
  ['municipality_address', 'Address', 'Printed on reports'],
  ['currency', 'Currency code', 'Used for repair and replacement costs, e.g. NPR'],
  ['max_photos_per_inspection', 'Photos allowed per inspection', 'From 1 to 30'],
];

export default function SettingsPage() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting, isDirty } } = useForm();

  useEffect(() => {
    settingsService.get().then((rows) => {
      reset(Object.fromEntries(rows.map((r) => [r.key, r.value ?? ''])));
      setLoaded(true);
    }).catch((e) => toast.error(getApiError(e).message));
  }, [reset, toast]);

  const onSubmit = async (values) => {
    try {
      const rows = await settingsService.save(values);
      reset(Object.fromEntries(rows.map((r) => [r.key, r.value ?? ''])));
      toast.success('Settings saved');
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      toast.error(message);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Details used across the system and on printed reports." />
      {!loaded ? <PageLoader /> : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="card max-w-2xl space-y-4 p-5">
          {FIELDS.map(([key, label, hint]) => (
            <TextField key={key} label={label} hint={hint} required error={errors[key]?.message}
              {...register(key, { required: `${label} is required` })} />
          ))}
          <Button type="submit" icon={Save} loading={isSubmitting} disabled={!isDirty} className="w-full sm:w-auto">Save settings</Button>
        </form>
      )}
    </>
  );
}
