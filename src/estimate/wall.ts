import type { WallSpec, LineItem } from "../types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 間仕切壁（LGS）下地の数量算定。
 *
 * @param wallLengthM 壁の水平延長 m
 * @param heightM     壁高さ m
 * @param spec        壁仕様
 *
 * 算定モデル:
 *  - ランナー : 上下2本 → 延長 × 2
 *  - スタッド : 本数 = 延長/ピッチ + 1、各本 = 高さ
 *  - 振れ止め : 段数 = floor(高さ/段ピッチ)、各段 = 延長
 *  - スペーサー: スタッド本数 × (高さ/スペーサーピッチ)
 */
export function estimateWall(
  wallLengthM: number,
  heightM: number,
  spec: WallSpec
): LineItem[] {
  if (wallLengthM <= 0 || heightM <= 0) return [];

  const pStud = spec.studPitchMm / 1000;
  const pBrace = spec.braceRowPitchMm / 1000;
  const pSpacer = spec.spacerPitchMm / 1000;
  const bar = spec.barLengthMm / 1000;
  const w = 1 + spec.wasteRatio;

  const runnerLen = wallLengthM * 2;
  const studCount = Math.floor(wallLengthM / pStud) + 1;
  const studLen = studCount * heightM;
  const braceRows = Math.max(0, Math.floor(heightM / pBrace));
  const braceLen = braceRows * wallLengthM;
  const spacerCount = studCount * Math.max(1, Math.round(heightM / pSpacer));

  const bars = (lenM: number) => Math.ceil((lenM * w) / bar);

  const items: LineItem[] = [
    {
      name: "ランナー",
      qty: bars(runnerLen),
      unit: `本(${spec.barLengthMm}mm)`,
      note: `上下2本 延長 ${round2(runnerLen)}m`,
    },
    {
      name: "スタッド",
      qty: bars(studLen),
      unit: `本(${spec.barLengthMm}mm)`,
      note: `${studCount}本×H${round2(heightM)}m @${spec.studPitchMm}`,
    },
    {
      name: "スペーサー",
      qty: spacerCount,
      unit: "個",
      note: `スタッド${studCount}本 @${spec.spacerPitchMm}`,
    },
  ];

  if (braceRows > 0) {
    items.push({
      name: "振れ止め",
      qty: bars(braceLen),
      unit: `本(${spec.barLengthMm}mm)`,
      note: `${braceRows}段×延長 ${round2(wallLengthM)}m`,
    });
  }

  return items;
}
