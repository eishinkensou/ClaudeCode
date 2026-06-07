// アプリ全体で共有する型定義

/** 2次元座標（PDFページ座標系 = pt 単位、左下原点） */
export interface Point {
  x: number;
  y: number;
}

/** 線分 */
export interface Segment {
  a: Point;
  b: Point;
}

/** PDF から抽出したテキスト片（位置つき） */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 拾い対象の種別 */
export type RegionKind = "ceiling" | "wall" | "board";

/**
 * 検出または手入力された「拾い領域」。
 * 天井・ボードは閉じたポリゴン（面積拾い）、
 * 間仕切壁は線分の集合（延長拾い）として扱う。
 */
export interface Region {
  id: string;
  name: string;
  kind: RegionKind;
  /** ポリゴン頂点（面積系）。pt 単位。 */
  polygon: Point[];
  /** 壁などの線分（延長系）。pt 単位。 */
  segments?: Segment[];
  /** 自動検出の信頼度 0..1（手入力は 1）。 */
  confidence: number;
  /** 階高・天井高など、領域ごとの高さ上書き（mm）。未指定なら設定値を使う。 */
  heightMm?: number;
  /** 下地に加えてボード貼りも積算するか（既定 true）。 */
  includeBoard?: boolean;
  /** 自動検出由来か手動作成か。 */
  source: "auto" | "manual";
}

/** 縮尺。realMmPerPt = 図面実寸(mm) / PDF座標(pt) */
export interface Scale {
  realMmPerPt: number;
  /** "1/100" などの表示用ラベル。 */
  label: string;
  /** どうやって決まったか。 */
  source: "auto-text" | "manual-two-point" | "default";
}

/** 1 ページ分の抽出結果 */
export interface PageExtract {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  segments: Segment[];
  texts: TextItem[];
  detectedScale: Scale | null;
  rooms: Region[];
}

// ───────────────────────── 積算設定 ─────────────────────────

/** 天井（軽天）下地の仕様 */
export interface CeilingSpec {
  /** 野縁ピッチ mm（例: 303 / 360 / 455） */
  noburiPitchMm: number;
  /** 野縁受けピッチ mm（例: 900 / 1000） */
  noburiUkePitchMm: number;
  /** 吊りボルト・ハンガー・インサートのピッチ mm（例: 900） */
  hangerPitchMm: number;
  /** 定尺材長さ mm（例: 4000） */
  barLengthMm: number;
  /** 歩掛り割増（端材・ロス） 例 0.05 = 5% */
  wasteRatio: number;
}

/** 間仕切壁（LGS）下地の仕様 */
export interface WallSpec {
  /** スタッドピッチ mm（例: 303 / 455 / 606） */
  studPitchMm: number;
  /** 振れ止めの段ピッチ mm（高さ方向、例: 1200） */
  braceRowPitchMm: number;
  /** スペーサーピッチ mm（スタッドに沿って、例: 600） */
  spacerPitchMm: number;
  /** 標準階高 mm（領域に heightMm が無いとき使用） */
  defaultHeightMm: number;
  /** ランナー・スタッドの定尺材長さ mm（例: 4000） */
  barLengthMm: number;
  wasteRatio: number;
}

/** ボード仕様 */
export interface BoardSpec {
  /** 1 枚の寸法 mm（例: 910 × 1820） */
  widthMm: number;
  lengthMm: number;
  /** 壁は両面=2、片面=1。天井は 1。 */
  layers: number;
  /** ビス本数/枚 */
  screwsPerBoard: number;
  wasteRatio: number;
}

export interface EstimateSettings {
  ceiling: CeilingSpec;
  wall: WallSpec;
  board: BoardSpec;
}

// ───────────────────────── 積算結果 ─────────────────────────

export interface LineItem {
  /** 材料・項目名 */
  name: string;
  /** 数量 */
  qty: number;
  /** 単位（m, 本, 個, 枚 等） */
  unit: string;
  /** 補足（算定根拠） */
  note?: string;
}

export interface RegionResult {
  regionId: string;
  regionName: string;
  kind: RegionKind;
  /** 面積 m²（面積系のみ） */
  areaM2?: number;
  /** 周長 m */
  perimeterM?: number;
  /** 壁延長 m（壁系のみ） */
  wallLengthM?: number;
  items: LineItem[];
}

export interface EstimateResult {
  perRegion: RegionResult[];
  /** 材料名で集約した合計 */
  totals: LineItem[];
}
