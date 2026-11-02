import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { wardScope } from '../middleware/wardAccess.js';

/**
 * Filters: ward_id, category_id, condition, date_from/date_to (inspection and
 * maintenance dates), maintenance_status. Everything is limited to the user's wards.
 */
function buildFilters(req) {
  const f = req.query;
  const params = [];
  const add = (arr, sql, v) => { params.push(v); arr.push(sql.replaceAll('$?', `$${params.length}`)); };

  const eq = [`e.status = 'active'`, wardScope(req, 'e.ward_id', params)];
  if (f.ward_id) add(eq, 'e.ward_id = $?', f.ward_id);
  if (f.category_id) add(eq, 'e.category_id = $?', f.category_id);
  if (f.condition === 'not_inspected') eq.push('e.current_condition IS NULL');
  else if (f.condition) add(eq, 'e.current_condition = $?', f.condition);

  const insp = [`i.status = 'submitted'`];
  if (f.date_from) add(insp, 'i.inspection_date >= $?', f.date_from);
  if (f.date_to) add(insp, 'i.inspection_date <= $?', f.date_to);

  const maint = [];
  if (f.maintenance_status) add(maint, 'm.status = $?', f.maintenance_status);
  if (f.date_from) add(maint, 'm.created_at >= $?::date', f.date_from);
  if (f.date_to) add(maint, `m.created_at < $?::date + INTERVAL '1 day'`, f.date_to);

  const wards = [wardScope(req, 'w.id', params), 'w.is_active'];
  if (f.ward_id) add(wards, 'w.id = $?', f.ward_id);

  return {
    params,
    eq: eq.join(' AND '),
    insp: insp.join(' AND '),
    maint: maint.length ? maint.join(' AND ') : 'TRUE',
    wards: wards.join(' AND '),
  };
}

// CTE: the filtered equipment set, plus whether the latest inspection asked for repair
const base = (w) => `
  WITH eq AS (
    SELECT e.id, e.ward_id, e.category_id, e.current_condition, li.repair_required
      FROM equipment e LEFT JOIN inspections li ON li.id = e.last_inspection_id
     WHERE ${w.eq}
  )`;

// GET /api/dashboard/summary
export const summary = asyncHandler(async (req, res) => {
  const w = buildFilters(req);
  const { rows: [s] } = await query(
    `${base(w)}
     SELECT
       (SELECT COUNT(*) FROM wards w WHERE ${w.wards})::int AS total_wards,
       (SELECT COUNT(*) FROM eq)::int AS total_equipment,
       (SELECT COUNT(DISTINCT i.equipment_id) FROM inspections i JOIN eq ON eq.id = i.equipment_id WHERE ${w.insp})::int AS inspected_equipment,
       (SELECT COUNT(*) FROM eq WHERE current_condition = 'good')::int AS good,
       (SELECT COUNT(*) FROM eq WHERE current_condition = 'partial')::int AS partial,
       (SELECT COUNT(*) FROM eq WHERE current_condition IN ('not_operational','damaged'))::int AS non_operational,
       (SELECT COUNT(*) FROM eq WHERE current_condition IS NULL)::int AS not_inspected,
       (SELECT COUNT(*) FROM eq WHERE repair_required)::int AS repair_required,
       (SELECT COUNT(DISTINCT r.equipment_id) FROM replacement_requests r JOIN eq ON eq.id = r.equipment_id
         WHERE r.status IN ('pending','approved','purchased'))::int AS replacement_required,
       (SELECT COUNT(*) FROM maintenance m JOIN eq ON eq.id = m.equipment_id
         WHERE m.status IN ('pending','under_assessment','approved','in_progress') AND ${w.maint})::int AS pending_maintenance,
       (SELECT COUNT(*) FROM inspections i JOIN eq ON eq.id = i.equipment_id WHERE ${w.insp})::int AS inspections_done`,
    w.params,
  );
  ok(res, s);
});

// GET /api/dashboard/charts
export const charts = asyncHandler(async (req, res) => {
  const w = buildFilters(req);
  const run = (sql) => query(`${base(w)} ${sql}`, w.params).then((r) => r.rows);
  const [byWard, byCondition, byCategory, repairsByWard, maintenanceStatus] = await Promise.all([
    run(`SELECT w.ward_number, COUNT(eq.id)::int AS equipment,
                COUNT(eq.id) FILTER (WHERE eq.current_condition IN ('not_operational','damaged'))::int AS non_operational
           FROM wards w LEFT JOIN eq ON eq.ward_id = w.id
          WHERE ${w.wards} GROUP BY w.ward_number ORDER BY w.ward_number`),
    run(`SELECT COALESCE(current_condition, 'not_inspected') AS condition, COUNT(*)::int AS count
           FROM eq GROUP BY 1`),
    run(`SELECT c.group_name AS category, COUNT(eq.id)::int AS count, MIN(c.sort_order) AS o
           FROM equipment_categories c JOIN eq ON eq.category_id = c.id
          GROUP BY c.group_name ORDER BY o`),
    run(`SELECT w.ward_number,
                COUNT(eq.id) FILTER (WHERE eq.repair_required)::int AS repair_required,
                (SELECT COUNT(*) FROM maintenance m JOIN eq e2 ON e2.id = m.equipment_id
                  WHERE e2.ward_id = w.id AND m.status IN ('pending','under_assessment','approved','in_progress')
                    AND ${w.maint})::int AS open_maintenance
           FROM wards w LEFT JOIN eq ON eq.ward_id = w.id
          WHERE ${w.wards} GROUP BY w.id, w.ward_number ORDER BY w.ward_number`),
    run(`SELECT m.status, COUNT(*)::int AS count FROM maintenance m JOIN eq ON eq.id = m.equipment_id
          WHERE ${w.maint} GROUP BY m.status`),
  ]);
  ok(res, {
    by_ward: byWard,
    by_condition: byCondition,
    by_category: byCategory.map(({ o, ...r }) => r),
    repairs_by_ward: repairsByWard,
    maintenance_status: maintenanceStatus,
  });
});
