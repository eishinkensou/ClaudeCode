import type { Takeoff } from "./types";
import { computeTotals } from "./totals";

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function takeoffToCsv(t: Takeoff): string {
  const rows: string[] = [];
  rows.push(`図面種別,${esc(t.drawingType)}`);
  rows.push(`縮尺,${esc(t.scale)}`);
  rows.push(`信頼度,${esc(t.confidence)}`);
  rows.push("");

  rows.push("■ 室別 拾い出し");
  rows.push(["室", "項目", "種類", "数量", "単位", "根拠/備考"].map(esc).join(","));
  for (const r of t.rooms) {
    if (r.ceilingTakeoff)
      rows.push([r.name, "天井下地", "", f2(r.ceilingAreaM2), "m2", `天井高 ${r.ceilingHeightMm || "?"}`].map(esc).join(","));
    for (const b of r.ceilingBoards)
      rows.push([r.name, "天井ボード", b.type, f2(b.areaM2), "m2", ""].map(esc).join(","));
    if (r.wallFramingAreaM2)
      rows.push([r.name, "壁下地", "", f2(r.wallFramingAreaM2), "m2", `延長 ${f2(r.wallLengthM)}m × H${r.wallFramingHeightMm || "?"}`].map(esc).join(","));
    for (const b of r.wallBoards)
      rows.push([r.name, "壁ボード", b.type, f2(b.areaM2), "m2", `${b.faces}面`].map(esc).join(","));
    for (const o of r.openings)
      rows.push([r.name, "開口補強", `${o.name}(${o.kind})`, f2(o.reinforceM), "m", `${o.widthMm}×${o.heightMm} ×${o.count}`].map(esc).join(","));
    if (r.notes) rows.push([r.name, "備考", "", "", "", r.notes].map(esc).join(","));
  }

  rows.push("");
  rows.push("■ 合計");
  rows.push(["項目", "種類", "数量", "単位"].map(esc).join(","));
  const tot = computeTotals(t);
  rows.push(["天井下地", "", f2(tot.ceilingFramingM2), "m2"].map(esc).join(","));
  for (const b of tot.ceilingBoards) rows.push(["天井ボード", b.type, f2(b.areaM2), "m2"].map(esc).join(","));
  rows.push(["壁下地", "", f2(tot.wallFramingM2), "m2"].map(esc).join(","));
  for (const b of tot.wallBoards) rows.push(["壁ボード", b.type, f2(b.areaM2), "m2"].map(esc).join(","));
  rows.push(["開口補強", "", f2(tot.openingReinforceM), "m"].map(esc).join(","));

  if (t.assumptions) {
    rows.push("");
    rows.push(`前提,${esc(t.assumptions)}`);
  }
  for (const w of t.warnings) rows.push(`注意,${esc(w)}`);

  return "﻿" + rows.join("\r\n");
}

export function downloadCsv(t: Takeoff, filename = "積算AI_拾い出し.csv"): void {
  const blob = new Blob([takeoffToCsv(t)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
