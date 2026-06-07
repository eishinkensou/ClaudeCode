import type { TakeoffResult } from "../types";

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const f2 = (n: number) => n.toFixed(2);

/** 拾い出し結果を CSV 文字列に変換（室別明細＋合計） */
export function resultToCsv(result: TakeoffResult): string {
  const rows: string[] = [];

  rows.push("■ 室別 拾い出し");
  rows.push(["室", "項目", "種類", "数量", "単位", "根拠"].map(esc).join(","));

  for (const r of result.rooms) {
    rows.push([r.roomName, "天井下地", "", f2(r.ceilingFramingAreaM2), "m2", r.ceilingHeightMm ? `天井高${r.ceilingHeightMm}` : ""].map(esc).join(","));
    for (const b of r.ceilingBoards) {
      rows.push([r.roomName, "天井ボード", b.name, f2(b.areaM2), "m2", ""].map(esc).join(","));
    }
    rows.push([r.roomName, "壁下地", "", f2(r.wallFramingAreaM2), "m2", ""].map(esc).join(","));
    for (const w of r.wallDetails) {
      for (const b of w.boards) {
        rows.push(
          [
            r.roomName,
            "壁ボード",
            b.name,
            f2(b.areaM2),
            "m2",
            `${w.name} ${f2(w.lengthM)}×${f2(w.heightM)}×${b.faces}面`,
          ]
            .map(esc)
            .join(",")
        );
      }
    }
    for (const o of r.openingDetails) {
      rows.push(
        [r.roomName, "開口補強", o.name, f2(o.totalM), "m", o.formula].map(esc).join(",")
      );
    }
  }

  rows.push("");
  rows.push("■ 合計");
  rows.push(["項目", "種類", "数量", "単位"].map(esc).join(","));
  rows.push(["天井下地", "", f2(result.totals.ceilingFramingAreaM2), "m2"].map(esc).join(","));
  for (const b of result.totals.ceilingBoards) {
    rows.push(["天井ボード", b.name, f2(b.areaM2), "m2"].map(esc).join(","));
  }
  rows.push(["壁下地", "", f2(result.totals.wallFramingAreaM2), "m2"].map(esc).join(","));
  for (const b of result.totals.wallBoards) {
    rows.push(["壁ボード", b.name, f2(b.areaM2), "m2"].map(esc).join(","));
  }
  rows.push(["開口補強", "", f2(result.totals.openingReinforceM), "m"].map(esc).join(","));

  // Excel で文字化けしないよう BOM 付き
  return "﻿" + rows.join("\r\n");
}

export function downloadCsv(result: TakeoffResult, filename = "軽天拾い出し.csv"): void {
  const blob = new Blob([resultToCsv(result)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
