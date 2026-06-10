import ExcelJS from 'exceljs';
import type { Line } from '../types';

const FONT_TITLE = { name: 'Calibri', size: 14, bold: true };
const FONT_HEADER = { name: 'Calibri', size: 11, bold: true };
const FONT_NORMAL = { name: 'Calibri', size: 11, bold: false };
const FONT_BOLD = { name: 'Calibri', size: 11, bold: true };

export async function exportLines(lines: Line[], filename: string) {
  const wb = new ExcelJS.Workbook();

  for (const line of lines) {
    const ws = wb.addWorksheet(line.name);

    ws.getColumn('A').width = 16.66;
    ws.getColumn('C').width = 48.66;

    // Row 1: title
    const titleRow = ws.addRow([line.name, null, null]);
    titleRow.height = 18;
    titleRow.getCell(1).font = FONT_TITLE;

    // Row 2: headers
    const headerRow = ws.addRow(['Chronological #', 'Sensor Used', 'Hits']);
    headerRow.getCell(1).font = FONT_HEADER;
    headerRow.getCell(2).font = FONT_HEADER;
    headerRow.getCell(3).font = FONT_HEADER;

    // Data rows
    for (const g of line.geophones) {
      if (g.skipped) continue;
      const hitsStr = g.hits.map((h) => h.invalid ? `${h.hitNumber}X` : String(h.hitNumber)).join(', ');
      const dataRow = ws.addRow([g.position, g.sensorId, hitsStr]);
      dataRow.getCell(1).font = FONT_NORMAL;
      dataRow.getCell(2).font = FONT_BOLD;
      dataRow.getCell(3).font = FONT_NORMAL;
    }
  }

  // Sensor Replacements sheet
  const repWs = wb.addWorksheet('Sensor Replacements');
  repWs.getColumn('A').width = 20.66;

  const repTitle = repWs.addRow(['Sensor Replacements', null]);
  repTitle.height = 18;
  repTitle.getCell(1).font = FONT_TITLE;

  const repHeader = repWs.addRow(['Original Sensor', 'Replacement Sensor']);
  repHeader.getCell(1).font = FONT_HEADER;
  repHeader.getCell(2).font = FONT_HEADER;

  const repSub = repWs.addRow(['Column1', 'Column2']);
  repSub.getCell(1).font = FONT_NORMAL;
  repSub.getCell(2).font = FONT_BOLD;

  for (const line of lines) {
    for (const g of line.geophones) {
      if (g.sensorId !== g.position) {
        const r = repWs.addRow([g.position, g.sensorId]);
        r.getCell(1).font = FONT_NORMAL;
        r.getCell(2).font = FONT_BOLD;
      }
    }
  }

  // Field Notes sheet
  const noteWs = wb.addWorksheet('Field Notes');
  noteWs.getColumn('A').width = 8.66;
  noteWs.getColumn('B').width = 70.66;

  const noteTitle = noteWs.addRow(['Field Notes', null]);
  noteTitle.height = 18;
  noteTitle.getCell(1).font = FONT_TITLE;

  const noteHeader = noteWs.addRow(['#', 'Note']);
  noteHeader.getCell(1).font = FONT_HEADER;
  noteHeader.getCell(2).font = FONT_HEADER;

  for (const line of lines) {
    for (const n of (line.lineNotes ?? [])) {
      const r = noteWs.addRow(['GENERAL', n.text]);
      r.getCell(1).font = FONT_NORMAL;
      r.getCell(2).font = FONT_NORMAL;
    }
    for (const g of line.geophones) {
      for (const n of g.notes) {
        const r = noteWs.addRow([line.name, `Geophone ${g.position} — ${n.text}`]);
        r.getCell(1).font = FONT_NORMAL;
        r.getCell(2).font = FONT_NORMAL;
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
