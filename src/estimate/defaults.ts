import type { EstimateSettings } from "../types";

/**
 * 一般的な軽天工事の標準仕様にもとづく初期値。
 * 現場・仕様書に応じて UI から調整できる。あくまで一般値であり、
 * 確定積算では物件の仕様書を優先すること。
 */
export const DEFAULT_SETTINGS: EstimateSettings = {
  ceiling: {
    noburiPitchMm: 303, // 野縁 @303（19形・ボード下地の標準的な値）
    noburiUkePitchMm: 900, // 野縁受け @900
    hangerPitchMm: 900, // 吊りボルト・ハンガー・インサート @900×900
    barLengthMm: 4000, // 定尺 4m
    wasteRatio: 0.05, // ロス 5%
  },
  wall: {
    studPitchMm: 303, // スタッド @303（ボード下地の標準的な値）
    braceRowPitchMm: 1200, // 振れ止め 高さ方向 @1200
    spacerPitchMm: 600, // スペーサー @600
    defaultHeightMm: 2700, // 標準階高 2700
    barLengthMm: 4000,
    wasteRatio: 0.05,
  },
  board: {
    widthMm: 910,
    lengthMm: 1820, // 3×6 板
    layers: 1, // 壁は UI で 2（両面）に切替可能
    screwsPerBoard: 35,
    wasteRatio: 0.1, // ボードはロス 10%
  },
};
