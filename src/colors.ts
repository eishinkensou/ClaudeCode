// 部屋（室）ごとの塗り分け用カラーパレット。
// 壁の赤（#dc2626）と紛れないよう、赤系は避けた識別しやすい12色。
export const ROOM_PALETTE = [
  "#2563eb", // 青
  "#059669", // 緑
  "#d97706", // オレンジ
  "#7c3aed", // 紫
  "#0891b2", // シアン
  "#65a30d", // 黄緑
  "#db2777", // ピンク
  "#ca8a04", // 金
  "#4f46e5", // 藍
  "#0d9488", // ティール
  "#9333ea", // バイオレット
  "#c2410c", // 焦茶
];

/** インデックスから安定した色を返す */
export function roomColor(index: number): string {
  return ROOM_PALETTE[((index % ROOM_PALETTE.length) + ROOM_PALETTE.length) % ROOM_PALETTE.length];
}
