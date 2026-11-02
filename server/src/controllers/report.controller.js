import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/response.js';
import { audit } from '../utils/audit.js';
import { buildReport, REPORT_TYPES } from '../services/report.service.js';
import { renderExcel, renderPdf, exportFileName } from '../services/export.service.js';

const FILTER_KEYS = ['ward_id', 'category_id', 'condition', 'maintenance_status', 'replacement_status', 'date_from', 'date_to'];
const pickFilters = (q) => Object.fromEntries(FILTER_KEYS.filter((k) => q[k]).map((k) => [k, q[k]]));

async function build(req, type) {
  const report = await buildReport(req, type, pickFilters(req.query));
  if (!report) throw ApiError.notFound('Unknown report');
  return report;
}

// GET /api/reports
export const listReports = (_req, res) => ok(res, Object.entries(REPORT_TYPES).map(([type, title]) => ({ type, title })));

// GET /api/reports/:type
export const getReport = asyncHandler(async (req, res) => ok(res, await build(req, req.params.type)));

// GET /api/reports/export/excel?type=
export const exportExcel = asyncHandler(async (req, res) => {
  const report = await build(req, req.query.type);
  const buf = await renderExcel(report);
  await audit(req, 'report.exported', { entityType: 'report', entityId: report.type, details: { format: 'xlsx', rows: report.rows.length } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(report, 'xlsx')}"`);
  res.send(Buffer.from(buf));
});

// GET /api/reports/export/pdf?type=
export const exportPdf = asyncHandler(async (req, res) => {
  const report = await build(req, req.query.type);
  const buf = await renderPdf(report);
  await audit(req, 'report.exported', { entityType: 'report', entityId: report.type, details: { format: 'pdf', rows: report.rows.length } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(report, 'pdf')}"`);
  res.send(buf);
});
