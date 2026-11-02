import { useForm } from 'react-hook-form';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { authService } from '../services/auth.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/FormField.jsx';
import { formatDateTime } from '../utils/format.js';

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
      <dt className="text-sm text-slate-500 sm:w-40">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children || '—'}</dd>
    </div>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ currentPassword, newPassword }) => {
    try {
      await authService.changePassword(currentPassword, newPassword);
      toast.success('Password changed. Other devices have been signed out.');
      reset();
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      if (!Object.keys(fieldErrors).length) toast.error(message);
    }
  };

  return (
    <>
      <PageHeader title="Account" description="Your profile and password." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">Profile</h2>
          <dl className="mt-2 divide-y divide-slate-100">
            <Row label="Name">{user.full_name}</Row>
            <Row label="Username">@{user.username}</Row>
            <Row label="Role">{user.role_name}</Row>
            <Row label="Designation">{user.designation}</Row>
            <Row label="Email">{user.email}</Row>
            <Row label="Phone">{user.phone}</Row>
            <Row label="Wards">
              {user.wards.length
                ? <span className="flex flex-wrap gap-1">{user.wards.map((w) => <span key={w.id} className="ward-chip">{w.ward_number}</span>)}</span>
                : 'All wards'}
            </Row>
            <Row label="Last login">{formatDateTime(user.last_login_at)}</Row>
          </dl>
          <p className="mt-3 text-xs text-slate-500">To change profile details, contact the Super Admin.</p>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">Change password</h2>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
            <TextField label="Current password" type="password" autoComplete="current-password" required
              error={errors.currentPassword?.message}
              {...register('currentPassword', { required: 'Enter your current password' })} />
            <TextField label="New password" type="password" autoComplete="new-password" required
              hint="At least 8 characters with a letter and a number"
              error={errors.newPassword?.message}
              {...register('newPassword', {
                required: 'Enter a new password',
                minLength: { value: 8, message: 'At least 8 characters' },
                validate: (v) => (/[A-Za-z]/.test(v) && /\d/.test(v)) || 'Include a letter and a number',
              })} />
            <TextField label="Confirm new password" type="password" autoComplete="new-password" required
              error={errors.confirm?.message}
              {...register('confirm', { validate: (v) => v === watch('newPassword') || 'Passwords do not match' })} />
            <Button type="submit" icon={KeyRound} loading={isSubmitting} className="w-full sm:w-auto">Change password</Button>
          </form>
        </section>
      </div>
    </>
  );
}
