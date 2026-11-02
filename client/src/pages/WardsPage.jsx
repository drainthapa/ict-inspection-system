import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MapPin, Building2, AlertTriangle, ChevronRight } from 'lucide-react';
import { wardService } from '../services/ward.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button from '../components/ui/Button.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Badge from '../components/ui/Badge.jsx';
import WardFormModal from '../components/WardFormModal.jsx';
import { ROLES } from '../utils/roles.js';

export default function WardsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(ROLES.SUPER_ADMIN);
  const [wards, setWards] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () => wardService.list().then(setWards).catch((e) => setError(getApiError(e).message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        title="Ward offices"
        description={isAdmin ? 'Contact details, staff and equipment for every ward office.' : 'The ward offices you are assigned to.'}
        actions={isAdmin && <Button icon={Plus} onClick={() => setAdding(true)}>Add ward</Button>}
      />
      {error && <div role="alert" className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {!wards && !error && <PageLoader />}
      {wards?.length === 0 && (
        <div className="card"><EmptyState icon={Building2} title="No wards assigned to you">Ask the Super Admin to assign you to a ward office.</EmptyState></div>
      )}
      {wards?.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {wards.map((w) => (
            <li key={w.id}>
              <Link to={`/wards/${w.id}`} className="card flex h-full items-start gap-3 p-4 transition-colors hover:border-brand-300">
                <span className="ward-chip h-11 min-w-11 text-base">{w.ward_number}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold text-slate-900">{w.office_name}</h2>
                    {!w.is_active && <Badge>Inactive</Badge>}
                  </div>
                  {w.address && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-slate-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{w.address}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-700">
                    {w.equipment_count} equipment, {w.assigned_users.length} staff
                  </p>
                  {w.faulty_count > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-sm font-medium text-red-700">
                      <AlertTriangle className="h-4 w-4" aria-hidden />{w.faulty_count} not working
                    </p>
                  )}
                </div>
                <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <WardFormModal open={adding} onClose={() => setAdding(false)} onSaved={load} />
    </>
  );
}
