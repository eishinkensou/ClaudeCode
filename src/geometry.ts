import type { Point, Segment } from "./types";

const EPS = 1e-6;

/** 2点間距離 */
export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 線分の長さ */
export function segLength(s: Segment): number {
  return dist(s.a, s.b);
}

/** ポリゴン面積（符号なし、シューレース公式）。単位は入力座標の2乗。 */
export function polygonArea(poly: Point[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/** ポリゴン周長 */
export function polygonPerimeter(poly: Point[]): number {
  if (poly.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    sum += dist(poly[i], poly[(i + 1) % poly.length]);
  }
  return sum;
}

/** バウンディングボックス */
export function bbox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** 点がポリゴン内部にあるか（レイキャスティング） */
export function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + EPS) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** ほぼ水平か */
export function isHorizontal(s: Segment, tol = 0.5): boolean {
  return Math.abs(s.a.y - s.b.y) <= tol && Math.abs(s.a.x - s.b.x) > tol;
}

/** ほぼ垂直か */
export function isVertical(s: Segment, tol = 0.5): boolean {
  return Math.abs(s.a.x - s.b.x) <= tol && Math.abs(s.a.y - s.b.y) > tol;
}

/**
 * 軸平行（水平・垂直）の線分群から矩形の部屋を検出する単純なアルゴリズム。
 * 完全なグラフ探索ではなく、「対向する2本の水平線と2本の垂直線が
 * 端点を共有して四角を作る」パターンを総当りで探す。CADエクスポート
 * PDFのような直交主体の図面で実用的に効く。
 */
export function detectRectangles(
  segments: Segment[],
  opts: { minSizePt?: number; tol?: number } = {}
): Point[][] {
  const minSize = opts.minSizePt ?? 20;
  const tol = opts.tol ?? 2.5;

  const horiz = segments.filter((s) => isHorizontal(s, tol));
  const vert = segments.filter((s) => isVertical(s, tol));

  const near = (a: number, b: number) => Math.abs(a - b) <= tol;

  const rects: Point[][] = [];
  const seen = new Set<string>();

  for (let i = 0; i < horiz.length; i++) {
    for (let j = i + 1; j < horiz.length; j++) {
      const h1 = normHoriz(horiz[i]);
      const h2 = normHoriz(horiz[j]);
      // x 範囲がほぼ一致する2本の水平線
      if (!near(h1.x1, h2.x1) || !near(h1.x2, h2.x2)) continue;
      const top = Math.max(h1.y, h2.y);
      const bottom = Math.min(h1.y, h2.y);
      if (top - bottom < minSize) continue;
      const left = Math.min(h1.x1, h2.x1);
      const right = Math.max(h1.x2, h2.x2);
      if (right - left < minSize) continue;

      // 左右の縦線が存在するか
      const hasLeft = vert.some((v) => {
        const nv = normVert(v);
        return near(nv.x, left) && nv.y1 - tol <= bottom && nv.y2 + tol >= top;
      });
      const hasRight = vert.some((v) => {
        const nv = normVert(v);
        return near(nv.x, right) && nv.y1 - tol <= bottom && nv.y2 + tol >= top;
      });
      if (!hasLeft || !hasRight) continue;

      const key = `${Math.round(left)}_${Math.round(bottom)}_${Math.round(
        right
      )}_${Math.round(top)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rects.push([
        { x: left, y: bottom },
        { x: right, y: bottom },
        { x: right, y: top },
        { x: left, y: top },
      ]);
    }
  }

  // 大きい順（外周ほど大きい）に並べ、ネストした重複（同領域の二重線）を抑制
  rects.sort((a, b) => polygonArea(b) - polygonArea(a));
  return dedupeNested(rects, tol * 4);
}

function normHoriz(s: Segment) {
  const y = (s.a.y + s.b.y) / 2;
  const x1 = Math.min(s.a.x, s.b.x);
  const x2 = Math.max(s.a.x, s.b.x);
  return { y, x1, x2 };
}

function normVert(s: Segment) {
  const x = (s.a.x + s.b.x) / 2;
  const y1 = Math.min(s.a.y, s.b.y);
  const y2 = Math.max(s.a.y, s.b.y);
  return { x, y1, y2 };
}

/** 中心がほぼ同じで面積が近い矩形を1つにまとめる（壁の二重線対策） */
function dedupeNested(rects: Point[][], tol: number): Point[][] {
  const out: Point[][] = [];
  for (const r of rects) {
    const rb = bbox(r);
    const rc = { x: (rb.minX + rb.maxX) / 2, y: (rb.minY + rb.maxY) / 2 };
    const dup = out.some((o) => {
      const ob = bbox(o);
      const oc = { x: (ob.minX + ob.maxX) / 2, y: (ob.minY + ob.maxY) / 2 };
      return dist(rc, oc) <= tol && Math.abs(polygonArea(o) - polygonArea(r)) / polygonArea(o) < 0.1;
    });
    if (!dup) out.push(r);
  }
  return out;
}
