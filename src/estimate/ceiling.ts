import type { CeilingSpec, LineItem } from "../types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 天井（軽天）下地の数量算定。
 *
 * @param areaM2  天井面積 m²
 * @param spec    天井仕様
 *
 * 算定モデル（一般的な野縁・野縁受け方式）:
 *  - 野縁     : 総延長 = 面積 / 野縁ピッチ
 *  - 野縁受け : 総延長 = 面積 / 野縁受けピッチ
 *  - 吊りボルト/ハンガー/インサート : @P×P 格子 → 面積 / P²
 *  - クリップ : 野縁と野縁受けの交点数 = 面積 / (野縁P × 野縁受けP)
 *  - 各定尺材の本数 = 総延長×(1+ロス) / 定尺長
 */
export function estimateCeiling(areaM2: number, spec: CeilingSpec): LineItem[] {
  if (areaM2 <= 0) return [];

  const pN = spec.noburiPitchMm / 1000; // m
  const pU = spec.noburiUkePitchMm / 1000;
  const pH = spec.hangerPitchMm / 1000;
  const bar = spec.barLengthMm / 1000;
  const w = 1 + spec.wasteRatio;

  const noburiLen = areaM2 / pN;
  const ukeLen = areaM2 / pU;
  const hangerCount = areaM2 / (pH * pH);
  const clipCount = areaM2 / (pN * pU);

  const bars = (lenM: number) => Math.ceil((lenM * w) / bar);

  return [
    {
      name: "野縁",
      qty: bars(noburiLen),
      unit: `本(${spec.barLengthMm}mm)`,
      note: `延長 ${round2(noburiLen)}m / @${spec.noburiPitchMm} ロス${Math.round(
        spec.wasteRatio * 100
      )}%`,
    },
    {
      name: "野縁受け",
      qty: bars(ukeLen),
      unit: `本(${spec.barLengthMm}mm)`,
      note: `延長 ${round2(ukeLen)}m / @${spec.noburiUkePitchMm}`,
    },
    {
      name: "ハンガー",
      qty: Math.ceil(hangerCount),
      unit: "個",
      note: `@${spec.hangerPitchMm}×${spec.hangerPitchMm}格子`,
    },
    {
      name: "吊りボルト(W3/8)",
      qty: Math.ceil(hangerCount),
      unit: "本",
      note: `@${spec.hangerPitchMm}×${spec.hangerPitchMm}格子`,
    },
    {
      name: "インサート",
      qty: Math.ceil(hangerCount),
      unit: "個",
      note: "吊りボルトと同数",
    },
    {
      name: "クリップ",
      qty: Math.ceil(clipCount),
      unit: "個",
      note: `野縁×野縁受け 交点`,
    },
  ];
}
