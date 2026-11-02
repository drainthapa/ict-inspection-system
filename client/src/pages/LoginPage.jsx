import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { getApiError } from '../services/api.js';
import { TextField } from '../components/ui/FormField.jsx';
import Button from '../components/ui/Button.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';

const WARDS = Array.from({ length: 11 }, (_, i) => i + 1);

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const onSubmit = async ({ username, password }) => {
    setFormError('');
    try {
      await login(username.trim(), password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setFormError(getApiError(err).message);
    }
  };

  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Identity panel */}
      <section className="bg-brand-900 px-6 pb-8 pt-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div>
          <p className="text-sm text-brand-200">Municipal Executive Office, Buddhanagar</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Sainamaina Municipality</h1>
          <p className="mt-2 max-w-md text-brand-100 lg:text-lg">
            ICT Inspection &amp; Maintenance Management System
          </p>
        </div>

        {/* The eleven ward offices this system covers */}
        <div className="mt-8 lg:mt-0">
          <p className="mb-3 text-sm text-brand-200">Covering all 11 ward offices</p>
          <div className="grid max-w-md grid-cols-6 gap-2 sm:grid-cols-11 lg:grid-cols-6">
            {WARDS.map((n) => (
              <div key={n} className="flex aspect-square items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white sm:text-base">
                {n}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sign-in form */}
      <section className="flex items-start justify-center px-6 py-10 sm:px-10 lg:items-center">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Log in</h2>
            <p className="mt-1 text-sm text-slate-600">Use the account issued by the municipality IT section.</p>
          </div>

          {formError && (
            <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{formError}
            </div>
          )}

          <TextField
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            error={errors.username?.message}
            {...register('username', { required: 'Enter your username' })}
          />

          <div className="relative">
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="[&_input]:pr-12"
              error={errors.password?.message}
              {...register('password', { required: 'Enter your password' })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-0 top-[1.625rem] flex min-h-touch min-w-touch items-center justify-center text-slate-500 hover:text-slate-800"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <Button type="submit" icon={LogIn} loading={isSubmitting} className="w-full">Log in</Button>

          <p className="text-center text-xs text-slate-500">Forgot your password? Ask the Super Admin to reset it.</p>
        </form>
      </section>
    </div>
  );
}
