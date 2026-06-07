import type {
  EstimateResult,
  EstimateSettings,
  LineItem,
  Region,
  RegionResult,
  Scale,
} from "../types";
import { polygonArea, polygonPerimeter, segLength } from "../geometry";
import { estimateCeiling } from "./ceiling";
import { estimateWall } from "./wall";
import { estimateBoard } from "./board";

export { DEFAULT_SETTINGS } from "./defaults";
export { estimateCeiling, estimateWall, estimateBoard };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** pt → m 係数（実寸） */
function mPerPt(scale: Scale): number {
  return scale.realMmPerPt / 1000;
}

/** 1 領域を積算する */
export function estimateRegion(
  region: Region,
  scale: Scale,
  settings: EstimateSettings
): RegionResult {
  const k = mPerPt(scale);
  const includeBoard = region.includeBoard !== false;
  const items: LineItem[] = [];
  const result: RegionResult = {
    regionId: region.id,
    regionName: region.name,
    kind: region.kind,
    items,
  };

  if (region.kind === "ceiling") {
    const areaM2 = polygonArea(region.polygon) * k * k;
    const periM = polygonPerimeter(region.polygon) * k;
    result.areaM2 = round2(areaM2);
    result.perimeterM = round2(periM);
    items.push(...estimateCeiling(areaM2, settings.ceiling));
    if (includeBoard) {
      // 天井ボードは 1 面
      items.push(...estimateBoard(areaM2, { ...settings.board, layers: 1 }));
    }
  } else if (region.kind === "wall") {
    // 壁延長: 線分があればその合計、無ければポリゴン周長
    const lenPt =
      region.segments && region.segments.length > 0
        ? region.segments.reduce((s, seg) => s + segLength(seg), 0)
        : polygonPerimeter(region.polygon);
    const wallLengthM = lenPt * k;
    const heightM = (region.heightMm ?? settings.wall.defaultHeightMm) / 1000;
    result.wallLengthM = round2(wallLengthM);
    items.push(...estimateWall(wallLengthM, heightM, settings.wall));
    if (includeBoard) {
      // 壁ボードは board.layers 面（両面 = 2）。1 面あたり = 延長×高さ
      const faceAreaM2 = wallLengthM * heightM;
      items.push(...estimateBoard(faceAreaM2, settings.board));
    }
  } else {
    // 単独ボード領域（面積系）
    const areaM2 = polygonArea(region.polygon) * k * k;
    result.areaM2 = round2(areaM2);
    items.push(...estimateBoard(areaM2, settings.board));
  }

  return result;
}

/** 全領域を積算し、材料別合計も出す */
export function estimateAll(
  regions: Region[],
  scale: Scale,
  settings: EstimateSettings
): EstimateResult {
  const perRegion = regions.map((r) => estimateRegion(r, scale, settings));
  const totals = aggregate(perRegion);
  return { perRegion, totals };
}

/** 材料名＋単位で数量を合算 */
function aggregate(results: RegionResult[]): LineItem[] {
  const map = new Map<string, LineItem>();
  for (const r of results) {
    for (const it of r.items) {
      const key = `${it.name}__${it.unit}`;
      const existing = map.get(key);
      if (existing) {
        existing.qty = round2(existing.qty + it.qty);
      } else {
        map.set(key, { name: it.name, qty: it.qty, unit: it.unit });
      }
    }
  }
  return [...map.values()];
}
