import { query } from '../config/db.js';
import { wardScope } from '../middleware/wardAccess.js';

/**
 * Each report returns { title, columns, rows, totals?, signatures }.
 * column.type: text | date | money | number | condition | status
 * The same definition feeds the on-screen preview, Excel and PDF.
 */

export const CONDITION_LABEL = {
  good: 'Good', partial: 'Partially operational', not_operational: 'Not operational', damaged: 'Physically damaged',
};
export const ACTION_LABEL = {
  no_action: 'No action required', general_maintenance: 'General maintenance', hardware_repair: 'Hardware repair',
  software_update: 'Software installation / update', network_configuration: 'Network configuration',
  cctv_configuration: 'CCTV configuration', biometric_configuration: 'Biometric device configuration',
  electrical_repair: 'Electrical repair', spare_parts_replacement: 'Spare parts replacement',
  device_replacement: 'Complete device replacement', new_purchase: 'New equipment purchase',
  further_assessment: 'Further technical assessment',
};

export const REPORT_TYPES = {
  inventory: 'Ward-wise ICT Equipment Inventory',
  inspections: 'Ward-wise Inspection Report',
  condition: 'Equipment Condition Report',
  non_operational: 'Non-Operational Equipment Report',
  repair_required: 'Repair Required Equipment Report',
  replacement: 'Replacement Required Equipment Report',
  maintenance: 'Maintenance History Report',
  repair_cost: 'Estimated Repair Cost Report',
  consolidated: 'Consolidated Municipality ICT Equipment Report',
};
// Aliases matching the API paths in the project specification
export const REPORT_ALIASES = { 'ward-wise': 'consolidated', equipment: 'inventory', 'repair-cost': 'repair_cost' };

const MAX_ROWS = 5000;

/** Build the WHERE clause for equipment-based reports. */
function equipmentWhere(req, f, params) {
  const where = [`e.status = 'active'`, wardScope(req, 'e.ward_id', params)];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };
  if (f.ward_id) add('e.ward_id = $?', f.ward_id);
  if (f.category_id) add('e.category_id = $?', f.category_id);
  if (f.condition === 'not_inspected') where.push('e.current_condition IS NULL');
  else if (f.condition) add('e.current_condition = $?', f.condition);
  return { where, add };
}

const EQ_FROM = `
  FROM equipment e
  JOIN wards w ON w.id = e.ward_id
  JOIN equipment_categories c ON c.id = e.category_id
  LEFT JOIN inspections li ON li.id = e.last_inspection_id
  LEFT JOIN users lu ON lu.id = li.inspector_id`;

const EQ_COLS = `w.ward_number, e.asset_id, e.name, c.name AS category, e.equipment_type,
  CONCAT_WS(' ', e.brand, e.model) AS brand_model, e.serial_number, e.installation_location, e.quantity,
  e.current_condition AS condition, li.inspection_date AS last_inspected, lu.full_name AS inspector,
  li.problem_description, li.recommended_actions, li.estimated_repair_cost, li.inspector_remarks`;

const actions = (arr) => (arr || []).map((a) => ACTION_LABEL[a] || a).join(', ');

const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

const SIGN_INSPECTION = ['Inspector name / signature', 'Ward representative name / signature', 'Approved by (IT section)'];

const builders = {
  async inventory(req, f) {
    const params = [];
    const { where } = equipmentWhere(req, f, params);
    const { rows } = await query(
      `SELECT ${EQ_COLS} ${EQ_FROM} WHERE ${where.join(' AND ')}
        ORDER BY w.ward_number, c.sort_order, e.asset_id LIMIT ${MAX_ROWS}`, params,
    );
    return {
      columns: [
        { key: 'ward_number', label: 'Ward', type: 'number', width: 5 },
        { key: 'asset_id', label: 'Asset ID', width: 16 },
        { key: 'name', label: 'Equipment', width: 20 },
        { key: 'category', label: 'Category', width: 15 },
        { key: 'brand_model', label: 'Brand / model', width: 14 },
        { key: 'serial_number', label: 'Serial no.', width: 13 },
        { key: 'installation_location', label: 'Location', width: 13 },
        { key: 'quantity', label: 'Qty', type: 'number', width: 5 },
        { key: 'condition', label: 'Condition', type: 'condition', width: 12 },
        { key: 'last_inspected', label: 'Last inspected', type: 'date', width: 11 },
      ],
      rows,
      totals: { label: 'Total items', quantity: sum(rows, 'quantity') },
      signatures: SIGN_INSPECTION,
    };
  },

  async inspections(req, f) {
    const params = [];
    const where = [`i.status = 'submitted'`, wardScope(req, 'i.ward_id', params)];
    const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };
    if (f.ward_id) add('i.ward_id = $?', f.ward_id);
    if (f.category_id) add('i.category_id = $?', f.category_id);
    if (f.condition && f.condition !== 'not_inspected') add('i.condition = $?', f.condition);
    if (f.date_from) add('i.inspection_date >= $?', f.date_from);
    if (f.date_to) add('i.inspection_date <= $?', f.date_to);
    const { rows } = await query(
      `SELECT i.inspection_code, i.inspection_date, w.ward_number, e.asset_id, e.serial_number, e.name,
              i.condition, i.problem_description, i.recommended_actions, i.estimated_repair_cost,
              i.inspector_remarks, u.full_name AS inspector
         FROM inspections i JOIN wards w ON w.id = i.ward_id JOIN equipment e ON e.id = i.equipment_id
         JOIN users u ON u.id = i.inspector_id
        WHERE ${where.join(' AND ')}
        ORDER BY w.ward_number, i.inspection_date DESC, i.id DESC LIMIT ${MAX_ROWS}`, params,
    );
    rows.forEach((r) => { r.actions = actions(r.recommended_actions); });
    return {
      columns: [
        { key: 'inspection_date', label: 'Date', type: 'date', width: 10 },
        { key: 'ward_number', label: 'Ward', type: 'number', width: 5 },
        { key: 'name', label: 'Equipment', width: 17 },
        { key: 'asset_id', label: 'Asset ID / serial', width: 16, secondary: 'serial_number' },
        { key: 'condition', label: 'Condition', type: 'condition', width: 11 },
        { key: 'problem_description', label: 'Problem', width: 20 },
        { key: 'actions', label: 'Recommended action', width: 18 },
        { key: 'estimated_repair_cost', label: 'Est. cost', type: 'money', width: 10 },
        { key: 'inspector_remarks', label: 'Remarks', width: 15 },
        { key: 'inspector', label: 'Inspector', width: 12 },
      ],
      rows,
      totals: { label: `${rows.length} inspections`, estimated_repair_cost: sum(rows, 'estimated_repair_cost') },
      signatures: SIGN_INSPECTION,
    };
  },

  async condition(req, f) {
    const params = [];
    const { where } = equipmentWhere(req, f, params);
    const { rows } = await query(
      `SELECT ${EQ_COLS} ${EQ_FROM} WHERE ${where.join(' AND ')}
        ORDER BY CASE e.current_condition WHEN 'damaged' THEN 1 WHEN 'not_operational' THEN 2 WHEN 'partial' THEN 3
                 WHEN 'good' THEN 4 ELSE 5 END, w.ward_number, e.asset_id LIMIT ${MAX_ROWS}`, params,
    );
    rows.forEach((r) => { r.actions = actions(r.recommended_actions); });
    return {
      columns: [
        { key: 'ward_number', label: 'Ward', type: 'number', width: 5 },
        { key: 'name', label: 'Equipment', width: 18 },
        { key: 'asset_id', label: 'Asset ID / serial', width: 16, secondary: 'serial_number' },
        { key: 'category', label: 'Category', width: 14 },
        { key: 'condition', label: 'Condition', type: 'condition', width: 12 },
        { key: 'problem_description', label: 'Problem', width: 20 },
        { key: 'actions', label: 'Recommended action', width: 18 },
        { key: 'last_inspected', label: 'Inspected', type: 'date', width: 10 },
        { key: 'inspector', label: 'Inspector', width: 12 },
      ],
      rows,
      signatures: SIGN_INSPECTION,
    };
  },

  async non_operational(req, f) {
    const r = await builders.condition(req, { ...f, condition: undefined });
    r.rows = r.rows.filter((x) => ['not_operational', 'damaged'].includes(x.condition)
      && (!f.condition || x.condition === f.condition));
    r.totals = { label: `${r.rows.length} devices not working` };
    return r;
  },

  async repair_required(req, f) {
    const params = [];
    const { where } = equipmentWhere(req, f, params);
    where.push('li.repair_required = TRUE');
    const { rows } = await query(
      `SELECT ${EQ_COLS}, li.technical_fault, li.required_repair_work, li.required_spare_parts,
              (SELECT m.status FROM maintenance m WHERE m.equipment_id = e.id ORDER BY m.created_at DESC LIMIT 1) AS maintenance_status
         ${EQ_FROM} WHERE ${where.join(' AND ')}
        ORDER BY w.ward_number, e.asset_id LIMIT ${MAX_ROWS}`, params,
    );
    const filtered = f.maintenance_status ? rows.filter((x) => x.maintenance_status === f.maintenance_status) : rows;
    return {
      columns: [
        { key: 'ward_number', label: 'Ward', type: 'number', width: 5 },
        { key: 'name', label: 'Equipment', width: 17 },
        { key: 'asset_id', label: 'Asset ID / serial', width: 16, secondary: 'serial_number' },
        { key: 'condition', label: 'Condition', type: 'condition', width: 11 },
        { key: 'problem_description', label: 'Problem', width: 18 },
        { key: 'required_repair_work', label: 'Repair required', width: 18 },
        { key: 'required_spare_parts', label: 'Spare parts', width: 14 },
        { key: 'estimated_repair_cost', label: 'Est. cost', type: 'money', width: 10 },
        { key: 'maintenance_status', label: 'Repair status', type: 'status', width: 11 },
      ],
      rows: filtered,
      totals: { label: `${filtered.length} devices`, estimated_repair_cost: sum(filtered, 'estimated_repair_cost') },
      signatures: SIGN_INSPECTION,
    };
  },

  async replacement(req, f) {
    const params = [];
    const where = [wardScope(req, 'r.ward_id', params)];
    const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };
    if (f.ward_id) add('r.ward_id = $?', f.ward_id);
    if (f.category_id) add('e.category_id = $?', f.category_id);
    if (f.replacement_status) add('r.status = $?', f.replacement_status);
    else where.push(`r.status IN ('pending','approved','purchased')`);
    if (f.date_from) add('r.created_at >= $?::date', f.date_from);
    if (f.date_to) add(`r.created_at < $?::date + INTERVAL '1 day'`, f.date_to);
    const { rows } = await query(
      `SELECT r.request_code, w.ward_number, e.asset_id, e.serial_number, e.name, r.current_condition AS condition,
              r.reason, r.technical_recommendation, r.estimated_cost, r.status, r.remarks, r.created_at::date AS requested_on
         FROM replacement_requests r JOIN wards w ON w.id = r.ward_id JOIN equipment e ON e.id = r.equipment_id
        WHERE ${where.join(' AND ')} ORDER BY w.ward_number, r.created_at DESC LIMIT ${MAX_ROWS}`, params,
    );
    return {
      columns: [
        { key: 'ward_number', label: 'Ward', type: 'number', width: 5 },
        { key: 'name', label: 'Device', width: 17 },
        { key: 'asset_id', label: 'Asset ID / serial', width: 16, secondary: 'serial_number' },
        { key: 'condition', label: 'Condition', type: 'condition', width: 11 },
        { key: 'reason', label: 'Reason for replacement', width: 20 },
        { key: 'technical_recommendation', label: 'Technical recommendation', width: 20 },
        { key: 'estimated_cost', label: 'Est. cost', type: 'money', width: 10 },
        { key: 'status', label: 'Approval', type: 'status', width: 10 },
        { key: 'remarks', label: 'Remarks', width: 12 },
      ],
      rows,
      totals: { label: `${rows.length} requests`, estimated_cost: sum(rows, 'estimated_cost') },
      signatures: ['Prepared by', 'Reviewed by (IT section)', 'Approved by (Chief Administrative Officer)'],
    };
  },

  async maintenance(req, f) {
    const params = [];
    const where = [wardScope(req, 'm.ward_id', params)];
    const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('$?', `$${params.length}`)); };
    if (f.ward_id) add('m.ward_id = $?', f.ward_id);
    if (f.category_id) add('e.category_id = $?', f.category_id);
    if (f.maintenance_status) add('m.status = $?', f.maintenance_status);
    if (f.date_from) add('COALESCE(m.maintenance_date, m.created_at::date) >= $?', f.date_from);
    if (f.date_to) add('COALESCE(m.maintenance_date, m.created_at::date) <= $?', f.date_to);
    const { rows } = await query(
      `SELECT m.maintenance_code, w.ward_number, e.asset_id, e.serial_number, e.name, m.reported_problem,
              m.required_repair, COALESCE(m.technician_name, t.full_name) AS technician, m.maintenance_date,
              m.completion_date, m.status, m.repair_cost, m.remarks,
              (SELECT STRING_AGG(p.part_name || ' x' || p.quantity, ', ') FROM maintenance_spare_parts p
                WHERE p.maintenance_id = m.id) AS spare_parts
         FROM maintenance m JOIN wards w ON w.id = m.ward_id JOIN equipment e ON e.id = m.equipment_id
         LEFT JOIN users t ON t.id = m.technician_id
        WHERE ${where.join(' AND ')} ORDER BY w.ward_number, m.created_at DESC LIMIT ${MAX_ROWS}`, params,
    );
    return {
      columns: [
        { key: 'maintenance_code', label: 'ID', width: 13 },
        { key: 'ward_number', label: 'Ward', type: 'number', width: 5 },
        { key: 'name', label: 'Equipment', width: 16, secondary: 'asset_id' },
        { key: 'reported_problem', label: 'Reported problem', width: 18 },
        { key: 'required_repair', label: 'Repair', width: 16 },
        { key: 'spare_parts', label: 'Spare parts used', width: 14 },
        { key: 'technician', label: 'Technician', width: 12 },
        { key: 'maintenance_date', label: 'Started', type: 'date', width: 10 },
        { key: 'completion_date', label: 'Completed', type: 'date', width: 10 },
        { key: 'status', label: 'Status', type: 'status', width: 11 },
        { key: 'repair_cost', label: 'Cost', type: 'money', width: 10 },
      ],
      rows,
      totals: { label: `${rows.length} records`, repair_cost: sum(rows, 'repair_cost') },
      signatures: ['Technician name / signature', 'Ward representative name / signature', 'Approved by (IT section)'],
    };
  },

  async repair_cost(req, f) {
    const params = [];
    const { where, add } = equipmentWhere(req, f, params);
    where.push('li.estimated_repair_cost IS NOT NULL');
    if (f.date_from) add('li.inspection_date >= $?', f.date_from);
    if (f.date_to) add('li.inspection_date <= $?', f.date_to);
    const { rows } = await query(
      `SELECT ${EQ_COLS}, li.required_repair_work,
              (SELECT COALESCE(SUM(m.repair_cost), 0) FROM maintenance m
                WHERE m.equipment_id = e.id AND m.status = 'completed' AND m.inspection_id = li.id)::float AS actual_cost
         ${EQ_FROM} WHERE ${where.join(' AND ')}
        ORDER BY w.ward_number, li.estimated_repair_cost DESC LIMIT ${MAX_ROWS}`, params,
    );
    return {
      columns: [
        { key: 'ward_number', label: 'Ward', type: 'number', width: 5 },
        { key: 'name', label: 'Equipment', width: 18 },
        { key: 'asset_id', label: 'Asset ID / serial', width: 16, secondary: 'serial_number' },
        { key: 'condition', label: 'Condition', type: 'condition', width: 11 },
        { key: 'required_repair_work', label: 'Repair work', width: 22 },
        { key: 'last_inspected', label: 'Inspected', type: 'date', width: 10 },
        { key: 'estimated_repair_cost', label: 'Estimated cost', type: 'money', width: 12 },
        { key: 'actual_cost', label: 'Actual cost', type: 'money', width: 11 },
      ],
      rows,
      totals: {
        label: `${rows.length} devices`,
        estimated_repair_cost: sum(rows, 'estimated_repair_cost'),
        actual_cost: sum(rows, 'actual_cost'),
      },
      signatures: ['Prepared by', 'Checked by (IT section)', 'Approved by (Account section)'],
    };
  },

  async consolidated(req, f) {
    const params = [];
    const eqFilters = [`e.status = 'active'`];
    const add = (arr, sql, v) => { params.push(v); arr.push(sql.replaceAll('$?', `$${params.length}`)); };
    if (f.category_id) add(eqFilters, 'e.category_id = $?', f.category_id);
    const wardWhere = [wardScope(req, 'w.id', params)];
    if (f.ward_id) add(wardWhere, 'w.id = $?', f.ward_id);
    const eq = eqFilters.join(' AND ');
    const { rows } = await query(
      `SELECT w.ward_number, w.office_name,
              COUNT(e.id)::int AS total,
              COUNT(e.id) FILTER (WHERE e.current_condition = 'good')::int AS good,
              COUNT(e.id) FILTER (WHERE e.current_condition = 'partial')::int AS partial,
              COUNT(e.id) FILTER (WHERE e.current_condition = 'not_operational')::int AS not_operational,
              COUNT(e.id) FILTER (WHERE e.current_condition = 'damaged')::int AS damaged,
              COUNT(e.id) FILTER (WHERE e.current_condition IS NULL)::int AS not_inspected,
              COUNT(e.id) FILTER (WHERE li.repair_required)::int AS repair_required,
              COUNT(e.id) FILTER (WHERE EXISTS (SELECT 1 FROM replacement_requests r WHERE r.equipment_id = e.id
                                   AND r.status IN ('pending','approved','purchased')))::int AS replacement,
              COALESCE(SUM(li.estimated_repair_cost) FILTER (WHERE li.repair_required), 0)::float AS est_repair_cost
         FROM wards w
         LEFT JOIN equipment e ON e.ward_id = w.id AND ${eq}
         LEFT JOIN inspections li ON li.id = e.last_inspection_id
        WHERE ${wardWhere.join(' AND ')}
        GROUP BY w.id ORDER BY w.ward_number`, params,
    );
    const keys = ['total', 'good', 'partial', 'not_operational', 'damaged', 'not_inspected', 'repair_required', 'replacement', 'est_repair_cost'];
    const totals = { label: 'Municipality total' };
    keys.forEach((k) => { totals[k] = sum(rows, k); });
    return {
      columns: [
        { key: 'ward_number', label: 'Ward', type: 'number', width: 6 },
        { key: 'office_name', label: 'Ward office', width: 20 },
        { key: 'total', label: 'Total', type: 'number', width: 8 },
        { key: 'good', label: 'Good', type: 'number', width: 8 },
        { key: 'partial', label: 'Partial', type: 'number', width: 8 },
        { key: 'not_operational', label: 'Not operational', type: 'number', width: 10 },
        { key: 'damaged', label: 'Damaged', type: 'number', width: 9 },
        { key: 'not_inspected', label: 'Not inspected', type: 'number', width: 10 },
        { key: 'repair_required', label: 'Repair required', type: 'number', width: 10 },
        { key: 'replacement', label: 'Replacement', type: 'number', width: 10 },
        { key: 'est_repair_cost', label: 'Est. repair cost', type: 'money', width: 12 },
      ],
      rows,
      totals,
      signatures: ['Prepared by (IT section)', 'Checked by', 'Approved by (Chief Administrative Officer)'],
    };
  },
};

export async function getSettingsMap() {
  const { rows } = await query('SELECT key, value FROM system_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Human-readable description of the filters used, printed under the title. */
async function describeFilters(f) {
  const parts = [];
  if (f.ward_id) {
    const { rows } = await query('SELECT ward_number FROM wards WHERE id = $1', [f.ward_id]);
    if (rows[0]) parts.push(`Ward No. ${rows[0].ward_number}`);
  }
  if (f.category_id) {
    const { rows } = await query('SELECT name FROM equipment_categories WHERE id = $1', [f.category_id]);
    if (rows[0]) parts.push(rows[0].name);
  }
  if (f.condition) parts.push(CONDITION_LABEL[f.condition] || 'Not inspected');
  if (f.maintenance_status) parts.push(`Repair status: ${f.maintenance_status.replace('_', ' ')}`);
  if (f.replacement_status) parts.push(`Approval: ${f.replacement_status}`);
  if (f.date_from || f.date_to) parts.push(`${f.date_from || 'start'} to ${f.date_to || 'today'}`);
  return parts.length ? parts.join('; ') : 'All wards and categories';
}

export async function buildReport(req, type, filters) {
  const key = REPORT_ALIASES[type] || type;
  if (!builders[key]) return null;
  const [data, settings, filterText] = await Promise.all([
    builders[key](req, filters), getSettingsMap(), describeFilters(filters),
  ]);
  return {
    type: key,
    title: REPORT_TYPES[key],
    filter_text: filterText,
    generated_at: new Date().toISOString(),
    generated_by: req.user.fullName,
    truncated: data.rows.length >= MAX_ROWS,
    header: {
      municipality: settings.municipality_name || 'Sainamaina Municipality',
      office: settings.office_name || 'Municipal Executive Office',
      address: settings.municipality_address || 'Buddhanagar, Rupandehi, Lumbini Province, Nepal',
      currency: settings.currency || 'NPR',
    },
    ...data,
  };
}
