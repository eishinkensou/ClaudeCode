import type { AppSettings, BoardType } from "../types";

/** よく使うボード種類の初期マスター（UIで追加・編集・削除可） */
export const DEFAULT_BOARD_TYPES: BoardType[] = [
  { id: "pb95", name: "せっこうボード 9.5mm" },
  { id: "pb125", name: "せっこうボード 12.5mm" },
  { id: "fpb125", name: "強化せっこうボード 12.5mm" },
  { id: "rockwool12", name: "岩綿吸音板 12mm" },
  { id: "decopb95", name: "化粧せっこうボード 9.5mm" },
];

/** 既定の設定値。一般値なので物件の仕様書に合わせて調整すること。 */
export const DEFAULT_SETTINGS: AppSettings = {
  defaultSlabHeightMm: 4000,
  defaultCeilingHeightMm: 2700,
  deductOpenings: true,
  boardTypes: DEFAULT_BOARD_TYPES,
};
