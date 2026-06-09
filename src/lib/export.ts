import * as XLSX from 'xlsx';
import type { Line } from '../types';

export function exportLines(lines: Line[], filename: string) {
  const wb = XLSX.utils.book_new();

  for (const line of lines) {
    // Main sheet
    const rows: (string | number)[][] = [
      [`Sensor Hit Summary - ${line.name}`, '', ''],
      ['Chronological #', 'Sensor Used', 'Hits'],
    ];

    for (const g of line.geophones) {
      if (g.skipped) continue;
      const hitsStr = g.hits.map((h) => h.invalid ? `${h.hitNumber}X` : String(h.hitNumber)).join(', ');
      rows.push([g.position, g.sensorId, hitsStr]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, line.name);
  }

  // Sensor replacements sheet (combined)
  const repRows: (string | number)[][] = [['Chronological / Failed Sensor', 'Sensor Used / Replacement']];
  for (const line of lines) {
    for (const g of line.geophones) {
      if (g.sensorId !== g.position) {
        repRows.push([g.position, g.sensorId]);
      }
    }
  }
  const repWs = XLSX.utils.aoa_to_sheet(repRows);
  XLSX.utils.book_append_sheet(wb, repWs, 'Sensor Replacements');

  // Field notes sheet (combined)
  const noteRows: (string | number)[][] = [['Type', 'Reference', 'Note']];
  for (const line of lines) {
    for (const n of (line.lineNotes ?? [])) {
      noteRows.push(['General', line.name, n.text]);
    }
    for (const g of line.geophones) {
      for (const n of g.notes) {
        noteRows.push(['Note', `${line.name} / Geophone ${g.position}`, n.text]);
      }
      if (g.skipped) {
        noteRows.push(['Skipped', `${line.name} / Geophone ${g.position}`, 'Skipped']);
      }
    }
  }
  const noteWs = XLSX.utils.aoa_to_sheet(noteRows);
  XLSX.utils.book_append_sheet(wb, noteWs, 'Field Notes');

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
