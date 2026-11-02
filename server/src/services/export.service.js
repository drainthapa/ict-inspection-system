import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { CONDITION_LABEL } from './report.service.js';

const BRAND = '1E3F7C';

/** Cell value as display text (used by PDF; Excel keeps numbers numeric). */
export function formatCell(col, row, currency = 'NPR') {
  const v = row[col.key];
  let text;
  if (v === null || v === undefined || v === '') text = '';
  else if (col.type === 'condition') text = CONDITION_LABEL[v] || String(v);
  else if (col.type === 'status') text = String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  else if (col.type === 'money') text = `${currency} ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  else if (col.type === 'date') text = String(v).slice(0, 10);
  else text = String(v);
  if (col.secondary && row[col.secondary]) text = text ? `${text}\n${row[col.secondary]}` : row[col.secondary];
  if (col.type === 'condition' && !v) text = 'Not inspected';
  return text;
}

const safeName = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
export const exportFileName = (report, ext) => `${safeName(report.title)}-${report.generated_at.slice(0, 10)}.${ext}`;

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */
export async function renderExcel(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = report.header.municipality;
  wb.created = new Date();
  const ws = wb.addWorksheet('Report', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L${report.title}&RPage &P of &N` },
  });
  const n = report.columns.length;
  ws.columns = report.columns.map((c) => ({ key: c.key, width: Math.max(8, c.width * 1.1) }));

  const banner = (text, size, bold = true, color = '0F172A') => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, n);
    row.getCell(1).font = { size, bold, color: { argb: `FF${color}` } };
    row.getCell(1).alignment = { horizontal: 'center' };
  };
  banner(report.header.municipality, 16, true, BRAND);
  banner(report.header.office, 11);
  banner(report.header.address, 10, false, '475569');
  ws.addRow([]);
  banner(report.title, 13);
  banner(`${report.filter_text}. Generated ${report.generated_at.slice(0, 10)} by ${report.generated_by}.`, 9, false, '475569');
  ws.addRow([]);

  const head = ws.addRow(report.columns.map((c) => c.label));
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin' } };
  });
  head.height = 30;
  const headerRow = head.number;
  ws.views = [{ state: 'frozen', ySplit: headerRow }];

  for (const r of report.rows) {
    const values = report.columns.map((c) => {
      const v = r[c.key];
      if (c.type === 'money' || c.type === 'number') return v == null ? null : Number(v);
      if (c.type === 'date') return v ? String(v).slice(0, 10) : null;
      return formatCell(c, r, report.header.currency) || null;
    });
    const row = ws.addRow(values);
    row.alignment = { vertical: 'top', wrapText: true };
    report.columns.forEach((c, i) => {
      if (c.type === 'money') row.getCell(i + 1).numFmt = '#,##0.00';
      row.getCell(i + 1).border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } };
    });
  }
  if (report.rows.length) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + report.rows.length, column: n } };
  }

  if (report.totals) {
    const values = report.columns.map((c, i) => (i === 0 ? report.totals.label : report.totals[c.key] ?? null));
    const row = ws.addRow(values);
    row.font = { bold: true };
    report.columns.forEach((c, i) => {
      if (c.type === 'money') row.getCell(i + 1).numFmt = '#,##0.00';
      row.getCell(i + 1).border = { top: { style: 'thin' } };
      row.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4FB' } };
    });
  }
  if (report.header.currency) {
    const note = ws.addRow([`Amounts in ${report.header.currency}.`]);
    note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF475569' } };
  }

  // Signature block
  ws.addRow([]); ws.addRow([]);
  const per = Math.max(1, Math.floor(n / report.signatures.length));
  const lines = ws.addRow([]);
  const labels = ws.addRow([]);
  report.signatures.forEach((s, i) => {
    const col = i * per + 1;
    lines.getCell(col).value = '______________________________';
    labels.getCell(col).value = s;
    labels.getCell(col).font = { size: 9, color: { argb: 'FF475569' } };
  });

  return wb.xlsx.writeBuffer();
}

/* ------------------------------------------------------------------ */
/* PDF (A4 landscape, repeating table header, page numbers)            */
/* ------------------------------------------------------------------ */
export function renderPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: report.title, Author: report.header.municipality } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom - 20;
    const totalW = report.columns.reduce((s, c) => s + c.width, 0);
    const widths = report.columns.map((c) => (c.width / totalW) * width);
    const PAD = 3;
    const FS = 7.5;

    // Letterhead
    doc.fillColor(`#${BRAND}`).font('Helvetica-Bold').fontSize(15).text(report.header.municipality, left, 36, { width, align: 'center' });
    doc.fillColor('#0f172a').font('Helvetica').fontSize(10).text(report.header.office, { width, align: 'center' });
    doc.fillColor('#475569').fontSize(9).text(report.header.address, { width, align: 'center' });
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(`#${BRAND}`).lineWidth(1.2).stroke();
    doc.moveDown(0.6);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12.5).text(report.title, left, doc.y, { width, align: 'center' });
    doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
      .text(`${report.filter_text}. Generated ${report.generated_at.slice(0, 10)} by ${report.generated_by}.`, { width, align: 'center' });
    doc.moveDown(0.8);

    const cellHeight = (texts, font) => {
      doc.font(font).fontSize(FS);
      return Math.max(...texts.map((t, i) => doc.heightOfString(t || ' ', { width: widths[i] - PAD * 2 }))) + PAD * 2;
    };

    const drawRow = (texts, { font = 'Helvetica', fill, color = '#0f172a', rule = '#e2e8f0' } = {}) => {
      const h = cellHeight(texts, font);
      let x = left;
      const y = doc.y;
      if (fill) doc.rect(left, y, width, h).fill(fill);
      doc.font(font).fontSize(FS).fillColor(color);
      texts.forEach((t, i) => {
        const col = report.columns[i];
        const align = col && (col.type === 'money' || col.type === 'number') ? 'right' : 'left';
        doc.text(t || '', x + PAD, y + PAD, { width: widths[i] - PAD * 2, align });
        x += widths[i];
      });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).strokeColor(rule).lineWidth(0.5).stroke();
      doc.y = y + h;
      return h;
    };

    const headerTexts = report.columns.map((c) => c.label);
    const drawHeader = () => drawRow(headerTexts, { font: 'Helvetica-Bold', fill: `#${BRAND}`, color: '#ffffff', rule: `#${BRAND}` });
    drawHeader();

    if (!report.rows.length) {
      doc.moveDown(1).font('Helvetica').fontSize(10).fillColor('#475569').text('No records match the selected filters.', left, doc.y, { width, align: 'center' });
    }
    report.rows.forEach((r, idx) => {
      const texts = report.columns.map((c) => formatCell(c, r, report.header.currency));
      if (doc.y + cellHeight(texts, 'Helvetica') > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawHeader();
      }
      drawRow(texts, { fill: idx % 2 ? '#f8fafc' : undefined });
    });

    if (report.totals) {
      const texts = report.columns.map((c, i) => {
        if (i === 0) return report.totals.label;
        const v = report.totals[c.key];
        return v === undefined ? '' : formatCell(c, { [c.key]: v }, report.header.currency);
      });
      if (doc.y + cellHeight(texts, 'Helvetica-Bold') > bottom) { doc.addPage(); doc.y = doc.page.margins.top; }
      drawRow(texts, { font: 'Helvetica-Bold', fill: '#eef4fb', rule: `#${BRAND}` });
    }

    // Signatures
    if (doc.y + 80 > bottom) { doc.addPage(); doc.y = doc.page.margins.top; }
    const sigY = doc.y + 45;
    const slot = width / report.signatures.length;
    report.signatures.forEach((s, i) => {
      const x = left + i * slot + 10;
      doc.moveTo(x, sigY).lineTo(x + slot - 30, sigY).strokeColor('#475569').lineWidth(0.7).stroke();
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(s, x, sigY + 4, { width: slot - 30 });
      doc.fontSize(8).fillColor('#64748b').text('Date:', x, sigY + 16, { width: slot - 30 });
    });

    // Page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
      const y = doc.page.height - doc.page.margins.bottom + 8;
      doc.text(report.title, left, y, { width: width / 2, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, left + width / 2, y, { width: width / 2, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
