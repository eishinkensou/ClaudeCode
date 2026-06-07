import * as pdfjsLib from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import type { PageExtract, Point, Scale, Segment, TextItem, Room } from "../types";
import { detectRectangles, polygonArea, pointInPolygon, bbox } from "../geometry";
import { roomColor } from "../colors";

type PdfPage = PDFPageProxy;

/** pdfjs OPS のうち本モジュールで使う定数の形 */
export interface OpsTable {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  moveTo: number;
  lineTo: number;
  curveTo: number;
  rectangle: number;
  closePath: number;
}

/** PDF 標準: 1pt = 1/72 inch。紙面 mm/pt。 */
const MM_PER_PT_PAPER = 25.4 / 72;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m1: Matrix, m2: Matrix): Matrix {
  // m1 ∘ m2（m2 を先に適用）
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/**
 * オペレータリスト（fnArray / argsArray）を解析して直線（線分）を抽出する純関数。
 * pdfjs に依存せずテスト可能なように OPS テーブルを引数で受け取る。
 * ベクター主体（CADエクスポート）のPDFで有効。曲線は端点を結ぶ直線で近似。
 */
export function parseSegmentsFromOps(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  OPS: OpsTable
): Segment[] {
  const segments: Segment[] = [];

  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];

  const pushPath = (subOps: number[], coords: number[]) => {
    let ci = 0;
    let cur: Point | null = null;
    let start: Point | null = null;
    const next = () => apply(ctm, coords[ci++], coords[ci++]);
    for (const op of subOps) {
      switch (op) {
        case OPS.moveTo: {
          cur = next();
          start = cur;
          break;
        }
        case OPS.lineTo: {
          const p = next();
          if (cur) segments.push({ a: cur, b: p });
          cur = p;
          break;
        }
        case OPS.curveTo: {
          // 6 coords (制御点2 + 終点)。終点まで直線近似。
          ci += 4;
          const p = apply(ctm, coords[ci++], coords[ci++]);
          if (cur) segments.push({ a: cur, b: p });
          cur = p;
          break;
        }
        case OPS.rectangle: {
          const x = coords[ci++],
            y = coords[ci++],
            w = coords[ci++],
            h = coords[ci++];
          const p0 = apply(ctm, x, y);
          const p1 = apply(ctm, x + w, y);
          const p2 = apply(ctm, x + w, y + h);
          const p3 = apply(ctm, x, y + h);
          segments.push({ a: p0, b: p1 }, { a: p1, b: p2 }, { a: p2, b: p3 }, { a: p3, b: p0 });
          cur = p0;
          break;
        }
        case OPS.closePath: {
          if (cur && start) segments.push({ a: cur, b: start });
          cur = start;
          break;
        }
        default:
          break;
      }
    }
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case OPS.transform:
        ctm = mul(ctm, args as unknown as Matrix);
        break;
      case OPS.constructPath: {
        // args = [subOps[], coords[], minMax?]
        const subOps = args[0] as number[];
        const coords = args[1] as number[];
        if (Array.isArray(subOps) && Array.isArray(coords)) pushPath(subOps, coords);
        break;
      }
      default:
        break;
    }
  }
  return segments;
}

/** ページのオペレータリストを取得して線分を抽出 */
async function extractSegments(page: PdfPage): Promise<Segment[]> {
  const opList = await page.getOperatorList();
  return parseSegmentsFromOps(opList.fnArray, opList.argsArray, pdfjsLib.OPS as OpsTable);
}

/** テキスト片を位置つきで抽出（PDF座標系、左下原点） */
async function extractTexts(page: PdfPage): Promise<TextItem[]> {
  const tc = await page.getTextContent();
  const out: TextItem[] = [];
  for (const item of tc.items as Array<Record<string, unknown>>) {
    const str = item.str as string;
    if (!str || !str.trim()) continue;
    const tr = item.transform as number[];
    out.push({
      str,
      x: tr[4],
      y: tr[5],
      width: (item.width as number) ?? 0,
      height: (item.height as number) ?? Math.abs(tr[3]) ?? 0,
    });
  }
  return out;
}

/** テキストから縮尺（1/100 等）を推定 */
export function detectScaleFromTexts(texts: TextItem[]): Scale | null {
  const re = /(?:S\s*[=:]\s*)?1\s*[\/:]\s*(\d{1,4})/i;
  // 縮尺らしい語の近くを優先しつつ、全テキストから 1/N を探す
  const candidates: number[] = [];
  for (const t of texts) {
    const m = t.str.match(re);
    if (m) {
      const denom = parseInt(m[1], 10);
      if (denom >= 5 && denom <= 2000) candidates.push(denom);
    }
  }
  if (candidates.length === 0) return null;
  // 建築図で頻出の分母を優先
  const common = [100, 50, 200, 30, 150, 250, 300, 60, 80, 500];
  candidates.sort((a, b) => {
    const ia = common.indexOf(a);
    const ib = common.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const denom = candidates[0];
  return {
    realMmPerPt: MM_PER_PT_PAPER * denom,
    label: `1/${denom}`,
    source: "auto-text",
  };
}

/** 縮尺分母からスケールを作る */
export function scaleFromDenominator(denom: number): Scale {
  return {
    realMmPerPt: MM_PER_PT_PAPER * denom,
    label: `1/${denom}`,
    source: "default",
  };
}

/** 2点（PDF座標）と実距離(mm)からスケールを作る */
export function scaleFromTwoPoints(a: Point, b: Point, realMm: number): Scale {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return {
    realMmPerPt: d > 0 ? realMm / d : MM_PER_PT_PAPER * 100,
    label: `2点校正 ${realMm}mm`,
    source: "manual-two-point",
  };
}

let roomSeq = 0;
const nextId = () => `r${Date.now().toString(36)}_${roomSeq++}`;

/**
 * 検出した矩形を室（部屋）の候補に変換。天井ポリゴンとして取り込み、
 * 内部のテキスト（部屋名らしきもの）を名前に採用する。
 * 壁・開口・ボード種類は利用者が画面で設定する。
 */
function rectsToRooms(rects: Point[][], texts: TextItem[], pageNumber: number): Room[] {
  const rooms: Room[] = [];
  for (const poly of rects) {
    const inside = texts.filter((t) => pointInPolygon({ x: t.x, y: t.y }, poly));
    // 寸法数値ではなく名称らしいテキストを優先
    const nameText = inside
      .filter((t) => !/^[\d,\.\s]+$/.test(t.str))
      .sort((a, b) => b.height - a.height)[0];
    const areaPt = polygonArea(poly);
    // 信頼度: 面積が大きく、名称テキストを内包するほど高い
    let confidence = 0.5;
    if (nameText) confidence += 0.3;
    if (areaPt > 5000) confidence += 0.1;
    rooms.push({
      id: nextId(),
      name: nameText ? nameText.str.trim() : `室${rooms.length + 1}`,
      page: pageNumber,
      color: roomColor(rooms.length),
      polygon: poly,
      ceilingBoards: [],
      includeCeiling: true,
      walls: [],
      openings: [],
      confidence: Math.min(1, confidence),
      source: "auto",
    });
  }
  return rooms;
}

/** 1 ページを丸ごと抽出して解析する */
export async function extractPage(page: PdfPage, pageNumber: number): Promise<PageExtract> {
  const viewport = page.getViewport({ scale: 1 });
  const [segments, texts] = await Promise.all([extractSegments(page), extractTexts(page)]);

  // ページ枠に近い巨大矩形は除外するため、面積上限を設ける
  const pageArea = viewport.width * viewport.height;
  const rawRects = detectRectangles(segments, { minSizePt: 24, tol: 2.5 });
  const rects = rawRects.filter((r) => {
    const a = polygonArea(r);
    const bb = bbox(r);
    const coversPage = a > pageArea * 0.85;
    const sliver = bb.maxX - bb.minX < 24 || bb.maxY - bb.minY < 24;
    return !coversPage && !sliver;
  });

  const detectedScale = detectScaleFromTexts(texts);
  const rooms = rectsToRooms(rects, texts, pageNumber);

  return {
    pageNumber,
    widthPt: viewport.width,
    heightPt: viewport.height,
    segments,
    texts,
    detectedScale,
    rooms,
  };
}

export { MM_PER_PT_PAPER };
