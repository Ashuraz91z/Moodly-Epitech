// Export CSV lisible par Excel en français : séparateur « ; », virgule décimale, BOM UTF-8.
type Cell = string | number | null | undefined;

const cell = (v: Cell) => {
  const s = typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 2, useGrouping: false }) : (v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(name: string, rows: Cell[][]) {
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
