// アプリ全体で共有する型定義（拾い出し＝面積・延長ベース）

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

/** 縮尺。realMmPerPt = 図面実寸(mm) / PDF座標(pt) */
export interface Scale {
  realMmPerPt: number;
  label: string;
  source: "auto-text" | "manual-two-point" | "default";
}

// ───────────────────────── マスター ─────────────────────────

/** ボード種類のマスター（例: せっこうボード9.5、岩綿吸音板12 など） */
export interface BoardType {
  id: string;
  name: string;
}

// ───────────────────────── 部屋モデル ─────────────────────────

/** 天井ボードの1層（重ね貼り対応・天井は室内側1面） */
export interface CeilingBoardLayer {
  boardTypeId: string;
}

/** 壁ボードの1層（重ね貼り・面数指定） */
export interface WallBoardLayer {
  boardTypeId: string;
  /** 面数（片面=1 / 両面=2） */
  faces: number;
}

/** 1本の間仕切壁 */
export interface Wall {
  id: string;
  name: string;
  /** 作図された線分（pt）。あれば縮尺換算で延長を出す。 */
  segment?: Segment;
  /** 手入力の延長（mm）。segment が無いときに使用。 */
  lengthMmManual?: number;
  /** 壁高さ（mm）。未指定なら設定の既定値。 */
  heightMm?: number;
  /** 壁ボード（重ね貼り・複数種類） */
  boards: WallBoardLayer[];
  /** 壁下地（軽量鉄骨下地）を計上するか */
  includeFraming: boolean;
}

/** 建具などの開口（開口補強の算定＋下地/ボードの開口控除に使用） */
export interface Opening {
  id: string;
  /** 建具記号など（SD-1, AW-2 等） */
  name: string;
  kind: "door" | "window";
  widthMm: number;
  heightMm: number;
  count: number;
  /** 控除対象の壁ID（この壁の下地・ボードから開口面積を差し引く）。未指定なら控除しない。 */
  wallId?: string;
}

/** 室（拾い出しの基本単位）。天井＋壁＋開口を持つ。 */
export interface Room {
  id: string;
  name: string;
  /** この室のジオメトリ（天井ポリゴン・壁）が属するPDFページ番号 */
  page: number;
  /** 図面上の塗り分け色（部屋ごと） */
  color?: string;

  // ── 天井 ──
  /** 天井ポリゴン（pt）。面積はここから算出。空なら手入力面積を使う。 */
  polygon: Point[];
  /** 手入力の天井面積（m²）。polygon が空のとき使用。 */
  ceilingAreaM2Manual?: number;
  /** 天井高（mm・参考/根拠表示用） */
  ceilingHeightMm?: number;
  /** 天井ボード（重ね貼り） */
  ceilingBoards: CeilingBoardLayer[];
  /** 天井下地を計上するか */
  includeCeiling: boolean;

  // ── 壁 ──
  walls: Wall[];

  // ── 開口 ──
  openings: Opening[];

  // ── 由来 ──
  source: "auto" | "manual";
  confidence: number;
}

/** 1 ページ分の抽出結果 */
export interface PageExtract {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  segments: Segment[];
  texts: TextItem[];
  detectedScale: Scale | null;
  rooms: Room[];
}

// ───────────────────────── 設定 ─────────────────────────

export interface AppSettings {
  /** 既定の壁高さ（mm） */
  defaultWallHeightMm: number;
  /** 既定の天井高（mm） */
  defaultCeilingHeightMm: number;
  /** 壁下地・壁ボード面積から開口面積を差し引くか（既定: 差し引かない） */
  deductOpenings: boolean;
  /** ボード種類マスター */
  boardTypes: BoardType[];
}

// ───────────────────────── 拾い出し結果 ─────────────────────────

/** 種類別の面積（ボード集計用） */
export interface TypedArea {
  /** ボード種類名 */
  name: string;
  areaM2: number;
}

/** 壁ごとの明細（根拠表示用） */
export interface WallDetail {
  name: string;
  lengthM: number;
  heightM: number;
  /** 開口控除前の壁面積 m²（延長×高さ） */
  grossAreaM2: number;
  /** この壁で控除した開口面積 m²（1面あたり） */
  openingDeductM2: number;
  /** 開口控除後の壁下地面積 m² */
  framingAreaM2: number;
  /** この壁のボード（種類名・面数・控除後面積） */
  boards: { name: string; faces: number; areaM2: number }[];
}

/** 開口ごとの明細（根拠表示用） */
export interface OpeningDetail {
  name: string;
  kind: "door" | "window";
  widthM: number;
  heightM: number;
  count: number;
  /** 1か所あたりの補強延長 m */
  perUnitM: number;
  /** 合計補強延長 m */
  totalM: number;
  /** 算定式の文字列 */
  formula: string;
}

/** 室ごとの拾い出し */
export interface RoomTakeoff {
  roomId: string;
  roomName: string;
  color?: string;

  ceilingFramingAreaM2: number;
  ceilingHeightMm?: number;
  /** 天井ボード 種類別面積 */
  ceilingBoards: TypedArea[];

  wallFramingAreaM2: number;
  /** 壁ボード 種類別面積 */
  wallBoards: TypedArea[];
  wallDetails: WallDetail[];

  openingReinforceM: number;
  openingDetails: OpeningDetail[];
}

/** 全体の拾い出し結果 */
export interface TakeoffResult {
  rooms: RoomTakeoff[];
  totals: {
    ceilingFramingAreaM2: number;
    wallFramingAreaM2: number;
    /** 天井ボード 種類別 合計 */
    ceilingBoards: TypedArea[];
    /** 壁ボード 種類別 合計 */
    wallBoards: TypedArea[];
    openingReinforceM: number;
  };
}
