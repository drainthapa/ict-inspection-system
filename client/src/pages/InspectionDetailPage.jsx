import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, ClipboardPlus, Wrench, RefreshCcw } from 'lucide-react';
import { inspectionService } from '../services/workflow.service.js';
import { getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import PhotoGallery from '../components/PhotoGallery.jsx';
import { MaintenanceBadge, ReplacementBadge } from '../components/StatusBadge.jsx';
import { ACTIONS, INSPECTION_TYPES, PHOTO_TYPES, formatDate, formatMoney } from '../utils/workflow.js';
import { formatDateTime } from '../utils/format.js';
import { ROLES } from '../utils/roles.js';

function Detail({ label, children, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm font-medium text-slate-900">{children || '—'}</dd>
    </div>
  );
}

const RESULT = { good: ['Good', 'green'], problem: ['Problem', 'red'], not_applicable: ['N/A', 'slate'] };

export default function InspectionDetailPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [i, setI] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { inspectionService.get(id).then(setI).catch((e) => setError(getApiError(e).message)); }, [id]);

  if (error) return <div className="card"><EmptyState title={error} action={<Link to="/inspections"><Button variant="secondary">Back to inspections</Button></Link>} /></div>;
  if (!i) return <PageLoader />;
  const eq = i.equipment;

  return (
    <article className="print-area">
      <Link to="/inspections" className="no-print mb-3 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Inspection records
      </Link>
      <div className="print-only mb-4 border-b-2 border-brand-800 pb-2 text-center">
        <p className="text-lg font-bold text-brand-800">Sainamaina Municipality</p>
        <p className="text-sm">Municipal Executive Office, Buddhanagar, Rupandehi</p>
        <p className="mt-1 font-semibold">ICT Equipment Inspection Record</p>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{i.inspection_code}</p>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{eq?.name || 'Inspection'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ward-chip">{i.ward_number}</span>
            <ConditionBadge condition={i.condition} long />
            {i.status === 'draft' && <Badge tone="amber">Draft</Badge>}
          </div>
        </div>
        <div className="no-print flex gap-2">
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button>
          {hasRole(ROLES.SUPER_ADMIN, ROLES.INSPECTOR) && eq && (
            <Link to={`/inspections/new?ward_id=${i.ward_id}&equipment_id=${eq.id}&type=follow_up`}>
              <Button icon={ClipboardPlus}>Follow-up</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold">Inspection</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Detail label="Date">{formatDate(i.inspection_date)}</Detail>
            <Detail label="Type">{INSPECTION_TYPES[i.inspection_type]}</Detail>
            <Detail label="Inspector">{i.inspector_name}</Detail>
            <Detail label="Submitted">{i.submitted_at ? formatDateTime(i.submitted_at) : 'Not yet'}</Detail>
            {i.condition !== 'good' && (
              <>
                <Detail label="Problem description" wide>{i.problem_description}</Detail>
                <Detail label="Identified technical fault" wide>{i.technical_fault}</Detail>
                <Detail label="Repair required">{i.repair_required ? 'Yes' : i.repair_required === false ? 'No' : null}</Detail>
                <Detail label="Estimated repair cost">{i.estimated_repair_cost != null ? formatMoney(i.estimated_repair_cost) : null}</Detail>
                {i.repair_required && <Detail label="Required repair work" wide>{i.required_repair_work}</Detail>}
                {i.repair_required && <Detail label="Required spare parts" wide>{i.required_spare_parts}</Detail>}
              </>
            )}
            <Detail label="Recommended action" wide>{i.recommended_actions.map((a) => ACTIONS[a]).join(', ')}</Detail>
            {i.recommended_actions.includes('device_replacement') && (
              <>
                <Detail label="Reason for replacement" wide>{i.replacement_reason}</Detail>
                <Detail label="Technical justification" wide>{i.technical_justification}</Detail>
                <Detail label="Estimated replacement cost">{i.estimated_replacement_cost != null ? formatMoney(i.estimated_replacement_cost) : null}</Detail>
              </>
            )}
            <Detail label="Recommendation" wide>{i.recommendation}</Detail>
            <Detail label="Inspector remarks" wide>{i.inspector_remarks}</Detail>
          </dl>
        </section>

        <div className="space-y-4">
          {eq && (
            <section className="card p-5">
              <h2 className="font-semibold">Equipment</h2>
              <dl className="mt-3 space-y-3">
                <Detail label="Asset ID"><Link to={`/equipment/${eq.id}`} className="text-brand-700">{eq.asset_id}</Link></Detail>
                <Detail label="Category">{eq.category_name}{eq.equipment_type ? `, ${eq.equipment_type}` : ''}</Detail>
                <Detail label="Brand / model">{[eq.brand, eq.model].filter(Boolean).join(' ')}</Detail>
                <Detail label="Serial number">{eq.serial_number}</Detail>
                <Detail label="Location">{eq.installation_location}</Detail>
              </dl>
            </section>
          )}
          {i.linked_records.length > 0 && (
            <section className="card no-print p-5">
              <h2 className="font-semibold">Follow-up records</h2>
              <ul className="mt-3 space-y-2">
                {i.linked_records.map((l) => (
                  <li key={`${l.kind}${l.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={l.kind === 'maintenance' ? `/maintenance/${l.id}` : `/replacements?search=${l.code}`} className="flex items-center gap-2 font-medium text-brand-700">
                      {l.kind === 'maintenance' ? <Wrench className="h-4 w-4" aria-hidden /> : <RefreshCcw className="h-4 w-4" aria-hidden />}{l.code}
                    </Link>
                    {l.kind === 'maintenance' ? <MaintenanceBadge status={l.status} /> : <ReplacementBadge status={l.status} />}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {i.checklist.length > 0 && (
          <section className="card p-5 lg:col-span-3">
            <h2 className="font-semibold">Technical checklist</h2>
            <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
              {i.checklist.map((c) => (
                <li key={c.checklist_item_id} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm">
                  <span>{c.label}{c.remarks && <span className="block text-slate-500">{c.remarks}</span>}</span>
                  <Badge tone={RESULT[c.result][1]}>{RESULT[c.result][0]}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-3 font-semibold">Photographs</h2>
          <PhotoGallery photos={i.photos} labelFor={(p) => PHOTO_TYPES[p.photo_type] || 'Photo'} />
        </section>
      </div>

      <div className="print-only mt-12 grid grid-cols-2 gap-16 text-sm">
        <div className="border-t border-slate-500 pt-1">Inspector: {i.inspector_name}<br />Signature and date</div>
        <div className="border-t border-slate-500 pt-1">Ward representative name<br />Signature and date</div>
      </div>
    </article>
  );
}
