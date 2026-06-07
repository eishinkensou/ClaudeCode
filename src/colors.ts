// 室ごとの色分け（図面オーバーレイと結果表で共通）
export const ROOM_PALETTE = [
  "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2",
  "#65a30d", "#db2777", "#ca8a04", "#4f46e5", "#0d9488",
  "#9333ea", "#c2410c", "#0369a1", "#15803d", "#a21caf",
];

export function roomColor(index: number): string {
  const n = ROOM_PALETTE.length;
  return ROOM_PALETTE[((index % n) + n) % n];
}
