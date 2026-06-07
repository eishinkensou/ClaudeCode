import type { EstimateResult } from "../types";

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 積算結果を CSV 文字列に変換（領域別明細＋合計） */
export function resultToCsv(result: EstimateResult): string {
  const rows: string[] = [];
  rows.push("■ 領域別明細");
  rows.push(["領域", "種別", "面積m2/延長m", "材料", "数量", "単位", "根拠"].map(esc).join(","));
  const kindLabel: Record<string, string> = {
    ceiling: "天井",
    wall: "間仕切壁",
    board: "ボード",
  };
  for (const r of result.perRegion) {
    const measure =
      r.kind === "wall" ? `延長${r.wallLengthM ?? 0}m` : `${r.areaM2 ?? 0}m2`;
    for (const it of r.items) {
      rows.push(
        [r.regionName, kindLabel[r.kind], measure, it.name, it.qty, it.unit, it.note ?? ""]
          .map(esc)
          .join(",")
      );
    }
  }
  rows.push("");
  rows.push("■ 材料別合計");
  rows.push(["材料", "数量", "単位"].map(esc).join(","));
  for (const it of result.totals) {
    rows.push([it.name, it.qty, it.unit].map(esc).join(","));
  }
  // Excel で文字化けしないよう BOM 付き
  return "﻿" + rows.join("\r\n");
}

/** CSV をダウンロードさせる */
export function downloadCsv(result: EstimateResult, filename = "軽天積算.csv"): void {
  const blob = new Blob([resultToCsv(result)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
