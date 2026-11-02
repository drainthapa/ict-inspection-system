export const ACTIONS = {
  no_action: 'No action required',
  general_maintenance: 'General maintenance',
  hardware_repair: 'Hardware repair',
  software_update: 'Software installation / update',
  network_configuration: 'Network configuration',
  cctv_configuration: 'CCTV configuration',
  biometric_configuration: 'Biometric device configuration',
  electrical_repair: 'Electrical repair',
  spare_parts_replacement: 'Spare parts replacement',
  device_replacement: 'Complete device replacement',
  new_purchase: 'New equipment purchase',
  further_assessment: 'Further technical assessment',
};

export const INSPECTION_TYPES = { initial: 'Initial', routine: 'Routine', follow_up: 'Follow-up' };

export const PHOTO_TYPES = {
  general: 'General', front_view: 'Device front', serial_number: 'Serial number', damage: 'Damage',
  installation: 'Installation', network_rack: 'Network rack', cable_management: 'Cable management',
};

export const MAINT_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  under_assessment: { label: 'Under assessment', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  in_progress: { label: 'In progress', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  not_repairable: { label: 'Not repairable', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

// Mirrors the server's allowed moves; `admin` marks Super Admin-only moves
export const MAINT_NEXT = {
  pending: [['under_assessment'], ['approved', true], ['not_repairable'], ['cancelled', true]],
  under_assessment: [['approved', true], ['not_repairable'], ['cancelled', true]],
  approved: [['in_progress'], ['cancelled', true]],
  in_progress: [['completed'], ['not_repairable']],
};

export const REPL_STATUS = {
  pending: { label: 'Pending approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'slate' },
  purchased: { label: 'Purchased', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
};

export const REPL_NEXT = { pending: ['approved', 'rejected'], approved: ['purchased', 'rejected'], purchased: ['delivered'] };

export const SOURCE_LABEL = { inspection: 'From inspection', ward_report: 'Reported by ward', manual: 'Logged by technician' };

export function formatMoney(v, currency = 'NPR') {
  if (v === null || v === undefined || v === '') return '—';
  return `${currency} ${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
