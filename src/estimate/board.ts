import type { BoardSpec, LineItem } from "../types";

/**
 * ボード（石膏ボード等）の数量算定。
 *
 * @param areaM2 施工面積 m²（壁の場合は片面面積。両面は layers=2 で倍化）
 * @param spec   ボード仕様
 *
 *  - 枚数 = 面積 × 面数 × (1+ロス) / 1枚面積、切上げ
 *  - ビス = 枚数 × ビス本数/枚
 */
export function estimateBoard(areaM2: number, spec: BoardSpec): LineItem[] {
  if (areaM2 <= 0) return [];

  const boardAreaM2 = (spec.widthMm / 1000) * (spec.lengthMm / 1000);
  const effectiveArea = areaM2 * spec.layers * (1 + spec.wasteRatio);
  const boards = Math.ceil(effectiveArea / boardAreaM2);
  const screws = boards * spec.screwsPerBoard;

  return [
    {
      name: "ボード",
      qty: boards,
      unit: `枚(${spec.widthMm}×${spec.lengthMm})`,
      note: `面積 ${Math.round(areaM2 * 100) / 100}m²×${spec.layers}面 ロス${Math.round(
        spec.wasteRatio * 100
      )}%`,
    },
    {
      name: "ボードビス",
      qty: screws,
      unit: "本",
      note: `${spec.screwsPerBoard}本/枚`,
    },
  ];
}
