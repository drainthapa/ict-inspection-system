import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Save, Send, Search, Plus, CheckCircle2, ArrowLeft, AlertTriangle, ChevronDown, RotateCcw, ClipboardPlus,
} from 'lucide-react';
import { inspectionService } from '../services/workflow.service.js';
import { equipmentService, categoryService } from '../services/equipment.service.js';
import { wardService } from '../services/ward.service.js';
import { getApiError, applyFieldErrors } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import Button from '../components/ui/Button.jsx';
import { TextField, SelectField } from '../components/ui/FormField.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ConditionBadge from '../components/ConditionBadge.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';
import EquipmentFormModal from '../components/EquipmentFormModal.jsx';
import { CONDITIONS } from '../utils/conditions.js';
import { ACTIONS, INSPECTION_TYPES, PHOTO_TYPES, todayISO } from '../utils/workflow.js';

const EMPTY = {
  ward_id: '', equipment_id: null, inspection_date: todayISO(), inspection_type: 'routine', condition: null,
  problem_description: '', technical_fault: '', repair_required: null, required_repair_work: '', required_spare_parts: '',
  estimated_repair_cost: '', recommended_actions: [], recommendation: '', replacement_reason: '',
  technical_justification: '', estimated_replacement_cost: '', inspector_remarks: '', checklist: {},
};
const FIELDS = Object.keys(EMPTY);

const CONDITION_STYLE = {
  good: 'border-emerald-600 bg-emerald-50 text-emerald-900',
  partial: 'border-amber-500 bg-amber-50 text-amber-950',
  not_operational: 'border-red-600 bg-red-50 text-red-900',
  damaged: 'border-red-800 bg-red-100 text-red-950',
};

function Section({ title, children, hint }) {
  return (
    <section className="card p-4 md:p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-600">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Segmented({ options, value, onChange, name }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`min-h-touch rounded-lg border px-2 text-sm font-semibold ${value === v ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Pick equipment from the ward (searchable), or register a new device on the spot. */
function EquipmentPicker({ wardId, value, onChange, error }) {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => { categoryService.list().then(setCategories).catch(() => {}); }, []);
  useEffect(() => {
    if (value && selected?.id !== value) equipmentService.get(value).then(setSelected).catch(() => setSelected(null));
    if (!value) setSelected(null);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!wardId || value) return;
    const params = { ward_id: wardId, limit: 30, sort: 'name' };
    if (categoryId) params.category_id = categoryId;
    if (q) params.search = q;
    equipmentService.list(params).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [wardId, categoryId, q, value]);

  const grouped = useMemo(() => {
    const m = new Map();
    categories.forEach((c) => m.set(c.group_name, [...(m.get(c.group_name) || []), c]));
    return [...m.entries()];
  }, [categories]);

  if (!wardId) return <p className="text-sm text-slate-600">Choose the ward office first.</p>;

  if (selected) {
    return (
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{selected.name}</p>
            <p className="text-sm text-slate-700">{selected.category_name}{selected.equipment_type ? `, ${selected.equipment_type}` : ''}</p>
            <p className="mt-1 break-all text-sm text-slate-600">{selected.asset_id}{selected.serial_number ? `, S/N ${selected.serial_number}` : ''}</p>
            {selected.installation_location && <p className="text-sm text-slate-600">{selected.installation_location}</p>}
          </div>
          <ConditionBadge condition={selected.current_condition} />
        </div>
        <Button variant="ghost" className="-ml-2 mt-1 text-brand-700" onClick={() => onChange(null)}>Choose different equipment</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Equipment category">
        <option value="">All categories</option>
        {grouped.map(([g, cats]) => <optgroup key={g} label={g}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
      </select>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input className={`input pl-9 ${error ? 'input-error' : ''}`} value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search asset ID, serial, name or brand" aria-label="Search equipment" />
      </div>
      {error && <p className="field-error">{error}</p>}
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {results === null && <li className="p-3 text-sm text-slate-500">Loading…</li>}
        {results?.length === 0 && <li className="p-3 text-sm text-slate-600">No matching equipment in this ward.</li>}
        {results?.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => { setSelected(e); onChange(e.id); }} className="flex min-h-touch w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{e.name}</span>
                <span className="block truncate text-xs text-slate-500">{e.asset_id}, {e.category_name}</span>
              </span>
              <ConditionBadge condition={e.current_condition} />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" icon={Plus} className="w-full" onClick={() => setRegistering(true)}>Register new equipment</Button>
      <EquipmentFormModal open={registering} onClose={() => setRegistering(false)} defaultWardId={wardId}
        onSaved={(e) => { setSelected(e); onChange(e.id); }} />
    </div>
  );
}

export default function InspectionFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [wards, setWards] = useState(null);
  const [draft, setDraft] = useState(null); // server copy
  const [checklistItems, setChecklistItems] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [photoType, setPhotoType] = useState('general');
  const [busy, setBusy] = useState(null); // 'draft' | 'submit'
  const [done, setDone] = useState(null);
  const [restored, setRestored] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const loadedRef = useRef(false);

  // Local autosave key follows the draft once it exists on the server
  const newKey = `ict.inspection.${user.id}.new`;
  const storageKey = `ict.inspection.${user.id}.${draft?.id || id || 'new'}`;
  const {
    register, handleSubmit, control, watch, reset, setValue, getValues, setError, clearErrors,
    formState: { errors },
  } = useForm({ defaultValues: EMPTY });

  /* ---------- Load wards, the server draft (if editing), and any unsaved local copy ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await wardService.list({ active: 'true' });
        let base = { ...EMPTY };
        if (id) {
          const d = await inspectionService.get(id);
          if (d.status !== 'draft') { navigate(`/inspections/${id}`, { replace: true }); return; }
          if (cancelled) return;
          setDraft(d);
          FIELDS.forEach((f) => { if (d[f] !== undefined && d[f] !== null) base[f] = d[f]; });
          base.checklist = Object.fromEntries(d.checklist.map((c) => [c.checklist_item_id, { result: c.result, remarks: c.remarks || '' }]));
        } else {
          base.ward_id = searchParams.get('ward_id') || (w.length === 1 ? String(w[0].id) : '');
          base.equipment_id = searchParams.get('equipment_id') ? Number(searchParams.get('equipment_id')) : null;
          if (searchParams.get('type')) base.inspection_type = searchParams.get('type');
        }
        // Unsaved local edits made on this device win over the server copy
        const local = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (local && (!id || new Date(local.savedAt) > new Date(base.updated_at || 0))) {
          base = { ...base, ...local.values };
          setRestored(true);
        }
        if (cancelled) return;
        setWards(w);
        reset({ ...base, ward_id: String(base.ward_id || '') });
        loadedRef.current = true;
      } catch (err) {
        toast.error(getApiError(err).message);
      }
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Keep a local copy while typing, so nothing is lost on navigation or a dropped connection ---------- */
  const values = watch();
  useEffect(() => {
    if (!loadedRef.current) return undefined;
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ savedAt: new Date().toISOString(), values: getValues() })); } catch { /* storage full */ }
    }, 600);
    return () => clearTimeout(t);
  }, [JSON.stringify(values)]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearLocal = () => { try { localStorage.removeItem(storageKey); localStorage.removeItem(newKey); } catch { /* ignore */ } };

  /* ---------- Checklist for the chosen equipment's category ---------- */
  const equipmentId = watch('equipment_id');
  useEffect(() => {
    if (!equipmentId) { setChecklistItems([]); setCategoryId(null); return; }
    equipmentService.get(equipmentId).then((e) => {
      setCategoryId(e.category_id);
      return e.checklist_group ? inspectionService.checklist(e.category_id) : [];
    }).then(setChecklistItems).catch(() => setChecklistItems([]));
  }, [equipmentId]);

  const condition = watch('condition');
  const repairRequired = watch('repair_required');
  const actions = watch('recommended_actions') || [];
  const wardId = watch('ward_id');
  const needsRepairFields = condition && condition !== 'good';
  const replacing = actions.includes('device_replacement');

  // Good condition: hide repair fields and default to "No action required"
  useEffect(() => {
    if (condition === 'good' && actions.length === 0) setValue('recommended_actions', ['no_action']);
    if (condition && condition !== 'good' && actions.length === 1 && actions[0] === 'no_action') setValue('recommended_actions', []);
  }, [condition]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAction = (a) => {
    clearErrors('recommended_actions');
    if (a === 'no_action') return setValue('recommended_actions', actions.includes(a) ? [] : ['no_action']);
    const next = actions.includes(a) ? actions.filter((x) => x !== a) : [...actions.filter((x) => x !== 'no_action'), a];
    setValue('recommended_actions', next);
  };

  /* ---------- Save / submit ---------- */
  const payloadFrom = (v) => {
    const p = {};
    FIELDS.forEach((f) => { if (f !== 'checklist') p[f] = v[f] === '' ? null : v[f]; });
    p.ward_id = Number(v.ward_id);
    p.estimated_repair_cost = v.estimated_repair_cost === '' || v.estimated_repair_cost == null ? null : Number(v.estimated_repair_cost);
    p.estimated_replacement_cost = v.estimated_replacement_cost === '' || v.estimated_replacement_cost == null ? null : Number(v.estimated_replacement_cost);
    p.checklist = Object.entries(v.checklist || {})
      .filter(([itemId, c]) => c?.result && checklistItems.some((it) => it.id === Number(itemId)))
      .map(([itemId, c]) => ({ checklist_item_id: Number(itemId), result: c.result, remarks: c.remarks || null }));
    return p;
  };

  const save = useCallback(async (submit) => {
    const v = getValues();
    if (!v.ward_id) { setError('ward_id', { message: 'Choose the ward office' }); toast.error('Choose the ward office first'); return; }
    setBusy(submit ? 'submit' : 'draft');
    let saved = draft;
    try {
      // 1. Save the draft
      const body = payloadFrom(v);
      saved = saved ? await inspectionService.update(saved.id, body) : await inspectionService.create(body);
      setDraft(saved);
      if (!id) window.history.replaceState(null, '', `/inspections/${saved.id}/edit`);
      // 2. Upload photos taken so far
      if (pendingPhotos.length) {
        await inspectionService.uploadPhotos(saved.id, pendingPhotos, photoType);
        setPendingPhotos([]);
        saved = await inspectionService.get(saved.id);
        setDraft(saved);
      }
      clearLocal();
      // 3. Submit
      if (submit) {
        saved = await inspectionService.update(saved.id, { submit: true });
        setDone(saved);
        window.scrollTo({ top: 0 });
      } else {
        toast.success('Draft saved. You can finish it later from Inspection records.');
      }
    } catch (err) {
      const { message, fieldErrors } = getApiError(err);
      applyFieldErrors(setError, fieldErrors);
      toast.error(Object.keys(fieldErrors).length ? 'Some required details are missing. The draft is saved; complete the highlighted fields.' : message);
      const first = Object.keys(fieldErrors)[0];
      if (first) document.querySelector(`[data-field="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      setBusy(null);
    }
  }, [draft, pendingPhotos, photoType, id, checklistItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeExistingPhoto = async (p) => {
    try {
      await inspectionService.deletePhoto(draft.id, p.id);
      setDraft({ ...draft, photos: draft.photos.filter((x) => x.id !== p.id) });
    } catch (err) { toast.error(getApiError(err).message); }
  };

  /* ---------- Success screen ---------- */
  if (done) {
    const linked = done.linked_records || [];
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-xl font-bold">Inspection submitted</h1>
          <p className="mt-1 text-slate-600">{done.inspection_code} for {done.equipment_name} ({done.asset_id})</p>
          {linked.length > 0 && (
            <ul className="mt-4 space-y-1 text-left text-sm text-slate-700">
              {linked.map((l) => (
                <li key={`${l.kind}${l.id}`} className="rounded-lg bg-slate-50 p-2">
                  {l.kind === 'maintenance' ? `Repair request ${l.code} opened` : `Replacement request ${l.code} sent to the Super Admin for approval`}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 grid gap-2">
            <Button icon={ClipboardPlus} onClick={() => { navigate(`/inspections/new?ward_id=${done.ward_id}`); window.location.reload(); }}>
              Inspect another device in Ward {done.ward_number}
            </Button>
            <Link to={`/inspections/${done.id}`}><Button variant="secondary" className="w-full">View inspection</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  if (!wards) return <PageLoader />;
  if (wards.length === 0) {
    return <div className="card"><EmptyState title="No ward assigned">Ask the Super Admin to assign you to a ward before inspecting.</EmptyState></div>;
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="mx-auto max-w-3xl">
      <Link to="/inspections" className="mb-2 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Inspection records
      </Link>
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{draft ? `Draft ${draft.inspection_code}` : 'New inspection'}</h1>
        <p className="text-sm text-slate-600">Inspector: {user.full_name}. Fields marked * are needed to submit.</p>
      </div>

      {restored && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">Restored unsaved changes from this device.</span>
          <button type="button" className="font-semibold underline" onClick={() => { clearLocal(); window.location.reload(); }}>Discard</button>
        </div>
      )}

      <div className="space-y-4">
        <Section title="Ward and equipment">
          <div data-field="ward_id">
            <SelectField label="Ward office" required error={errors.ward_id?.message} disabled={!!draft}
              {...register('ward_id', { onChange: () => setValue('equipment_id', null) })}>
              <option value="">Choose ward</option>
              {wards.map((w) => <option key={w.id} value={w.id}>Ward No. {w.ward_number}, {w.office_name}</option>)}
            </SelectField>
          </div>
          <div data-field="equipment_id">
            <p className="label">Equipment<span className="text-red-700"> *</span></p>
            <Controller name="equipment_id" control={control} render={({ field }) => (
              <EquipmentPicker wardId={wardId ? Number(wardId) : null} value={field.value}
                onChange={(v) => { field.onChange(v); clearErrors('equipment_id'); }} error={errors.equipment_id?.message} />
            )} />
          </div>
        </Section>

        <Section title="Inspection details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="inspection_date">
              <TextField label="Inspection date" type="date" required max={todayISO()} error={errors.inspection_date?.message} {...register('inspection_date')} />
            </div>
            <div>
              <p className="label">Inspection type</p>
              <Controller name="inspection_type" control={control} render={({ field }) => (
                <Segmented name="Inspection type" options={Object.entries(INSPECTION_TYPES)} value={field.value} onChange={field.onChange} />
              )} />
            </div>
          </div>
        </Section>

        <Section title="Device condition">
          <div data-field="condition">
            <Controller name="condition" control={control} render={({ field }) => (
              <div role="radiogroup" aria-label="Device condition" className="grid grid-cols-2 gap-2">
                {Object.entries(CONDITIONS).map(([v, c]) => (
                  <button key={v} type="button" role="radio" aria-checked={field.value === v}
                    onClick={() => { field.onChange(v); clearErrors('condition'); }}
                    className={`min-h-[64px] rounded-xl border-2 px-3 text-left text-sm font-semibold transition-colors ${field.value === v ? CONDITION_STYLE[v] : 'border-slate-200 bg-white text-slate-700'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            )} />
            {errors.condition && <p className="field-error">{errors.condition.message}</p>}
          </div>

          {needsRepairFields && (
            <>
              <div data-field="problem_description">
                <TextField label="Problem description" required as="textarea" rows={3} placeholder="What is wrong, as observed"
                  error={errors.problem_description?.message} {...register('problem_description')} />
              </div>
              <TextField label="Identified technical fault" as="textarea" rows={2} placeholder="e.g. Failed power supply unit"
                error={errors.technical_fault?.message} {...register('technical_fault')} />
              <div data-field="repair_required">
                <p className="label">Repair required?<span className="text-red-700"> *</span></p>
                <Controller name="repair_required" control={control} render={({ field }) => (
                  <Segmented name="Repair required" options={[[true, 'Yes'], [false, 'No']]} value={field.value}
                    onChange={(v) => { field.onChange(v); clearErrors('repair_required'); }} />
                )} />
                {errors.repair_required && <p className="field-error">{errors.repair_required.message}</p>}
              </div>
              {repairRequired && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2" data-field="required_repair_work">
                    <TextField label="Required repair work" required as="textarea" rows={2} error={errors.required_repair_work?.message} {...register('required_repair_work')} />
                  </div>
                  <TextField label="Required spare parts" as="textarea" rows={2} error={errors.required_spare_parts?.message} {...register('required_spare_parts')} />
                  <TextField label="Estimated repair cost (NPR)" type="number" inputMode="decimal" min={0} step="0.01"
                    error={errors.estimated_repair_cost?.message} {...register('estimated_repair_cost')} />
                </div>
              )}
            </>
          )}
        </Section>

        <Section title="Recommended action" hint="Select all that apply.">
          <div data-field="recommended_actions" className="flex flex-wrap gap-2">
            {Object.entries(ACTIONS).filter(([a]) => !(condition === 'good' && a === 'device_replacement')).map(([a, label]) => {
              const on = actions.includes(a);
              return (
                <button key={a} type="button" aria-pressed={on} onClick={() => toggleAction(a)}
                  className={`min-h-touch rounded-full border px-3 text-sm font-medium ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                  {label}
                </button>
              );
            })}
          </div>
          {errors.recommended_actions && <p className="field-error">{errors.recommended_actions.message}</p>}

          {replacing && (
            <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-start gap-2 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Replacement goes to the Super Admin for approval. The device is not marked replaced until a new one is delivered.
              </p>
              <div data-field="replacement_reason">
                <TextField label="Reason for replacement" required as="textarea" rows={2} error={errors.replacement_reason?.message} {...register('replacement_reason')} />
              </div>
              <div data-field="technical_justification">
                <TextField label="Technical justification" required as="textarea" rows={2} placeholder="Why repair is not practical"
                  error={errors.technical_justification?.message} {...register('technical_justification')} />
              </div>
              <TextField label="Estimated replacement cost (NPR)" type="number" inputMode="decimal" min={0} step="0.01"
                error={errors.estimated_replacement_cost?.message} {...register('estimated_replacement_cost')} />
            </div>
          )}
          <TextField label="Recommendation" as="textarea" rows={2} error={errors.recommendation?.message} {...register('recommendation')} />
          <TextField label="Inspector remarks" as="textarea" rows={2} error={errors.inspector_remarks?.message} {...register('inspector_remarks')} />
        </Section>

        {checklistItems.length > 0 && (
          <section className="card">
            <button type="button" onClick={() => setChecklistOpen((o) => !o)} aria-expanded={checklistOpen}
              className="flex min-h-touch w-full items-center justify-between gap-2 p-4 text-left md:p-5">
              <span>
                <span className="block text-base font-semibold text-slate-900">Technical checklist</span>
                <span className="block text-sm text-slate-600">Optional. {Object.values(values.checklist || {}).filter((c) => c?.result).length} of {checklistItems.length} checked.</span>
              </span>
              <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${checklistOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {checklistOpen && (
              <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4 pb-2 md:px-5">
                {checklistItems.map((it) => (
                  <li key={it.id} className="py-3">
                    <p className="mb-2 text-sm font-medium text-slate-900">{it.label}</p>
                    <Controller name={`checklist.${it.id}.result`} control={control} render={({ field }) => (
                      <Segmented name={it.label} value={field.value || null} onChange={(v) => field.onChange(field.value === v ? null : v)}
                        options={[['good', 'Good'], ['problem', 'Problem'], ['not_applicable', 'N/A']]} />
                    )} />
                    {values.checklist?.[it.id]?.result === 'problem' && (
                      <input className="input mt-2" placeholder="What is the problem?" aria-label={`${it.label} remarks`} {...register(`checklist.${it.id}.remarks`)} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <Section title="Photographs" hint="Device front, serial number label, any damage, installation or cabling.">
          <SelectField label="Photo type for new photos" value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
            {Object.entries(PHOTO_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          <PhotoPicker pending={pendingPhotos} onPendingChange={setPendingPhotos}
            existing={draft?.photos || []} onRemoveExisting={removeExistingPhoto} disabled={!!busy} />
          {pendingPhotos.length > 0 && <p className="text-sm text-amber-800">New photos upload when you save the draft or submit.</p>}
        </Section>
      </div>

      {/* Sticky actions: always reachable, sitting above the phone's bottom navigation */}
      <div className="sticky bottom-[64px] z-20 mt-4 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={Save} loading={busy === 'draft'} disabled={!!busy} onClick={() => save(false)}>Save draft</Button>
          <Button icon={Send} loading={busy === 'submit'} disabled={!!busy} onClick={handleSubmit(() => save(true))}>Submit</Button>
        </div>
      </div>
    </form>
  );
}
