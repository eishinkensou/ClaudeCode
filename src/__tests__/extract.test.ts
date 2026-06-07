import { describe, it, expect } from "vitest";
import { OPS } from "pdfjs-dist";
import { parseSegmentsFromOps, detectScaleFromTexts, scaleFromDenominator, scaleFromTwoPoints, type OpsTable } from "../pdf/extract";
import { detectRectangles, polygonArea } from "../geometry";
import type { TextItem } from "../types";

const ops = OPS as unknown as OpsTable;

describe("parseSegmentsFromOps (real pdf.js OPS table)", () => {
  it("expands a rectangle op into 4 segments", () => {
    const fn = [ops.constructPath];
    const args = [[[ops.rectangle], [100, 100, 200, 150]]];
    const segs = parseSegmentsFromOps(fn, args, ops);
    expect(segs.length).toBe(4);
    const rects = detectRectangles(segs);
    expect(rects.length).toBe(1);
    // 200×150 = 30000
    expect(polygonArea(rects[0])).toBeCloseTo(30000, 1);
  });

  it("builds segments from moveTo/lineTo/closePath", () => {
    const fn = [ops.constructPath];
    const sub = [ops.moveTo, ops.lineTo, ops.lineTo, ops.lineTo, ops.closePath];
    const coords = [0, 0, 100, 0, 100, 80, 0, 80];
    const segs = parseSegmentsFromOps(fn, [[sub, coords]], ops);
    // 3 lineTo + 1 closePath = 4 segments
    expect(segs.length).toBe(4);
    expect(detectRectangles(segs).length).toBe(1);
  });

  it("applies the current transformation matrix (scale 2)", () => {
    const fn = [ops.save, ops.transform, ops.constructPath, ops.restore];
    const args: unknown[] = [
      [],
      [2, 0, 0, 2, 0, 0], // scale ×2
      [[ops.rectangle], [10, 10, 50, 40]],
      [],
    ];
    const segs = parseSegmentsFromOps(fn, args, ops);
    const rects = detectRectangles(segs);
    expect(rects.length).toBe(1);
    // 元 50×40=2000 が ×2×2 = 8000 に
    expect(polygonArea(rects[0])).toBeCloseTo(8000, 1);
  });

  it("restores the matrix after q/Q so later paths are unscaled", () => {
    const fn = [
      ops.save,
      ops.transform,
      ops.constructPath,
      ops.restore,
      ops.constructPath,
    ];
    const args: unknown[] = [
      [],
      [3, 0, 0, 3, 0, 0],
      [[ops.rectangle], [0, 0, 10, 10]], // ×3 → 30×30
      [],
      [[ops.rectangle], [200, 200, 40, 30]], // 等倍 → 40×30
    ];
    const segs = parseSegmentsFromOps(fn, args, ops);
    const areas = detectRectangles(segs)
      .map((r) => Math.round(polygonArea(r)))
      .sort((a, b) => a - b);
    expect(areas).toContain(900); // 30×30
    expect(areas).toContain(1200); // 40×30
  });
});

describe("detectScaleFromTexts", () => {
  const mk = (str: string): TextItem => ({ str, x: 0, y: 0, width: 10, height: 8 });
  it("reads 1/100 form", () => {
    const s = detectScaleFromTexts([mk("平面図 S=1/100")]);
    expect(s?.label).toBe("1/100");
    expect(s?.realMmPerPt).toBeCloseTo((25.4 / 72) * 100, 5);
  });
  it("reads 1:50 form", () => {
    expect(detectScaleFromTexts([mk("SCALE 1:50")])?.label).toBe("1/50");
  });
  it("returns null when no scale present", () => {
    expect(detectScaleFromTexts([mk("事務所")])).toBeNull();
  });
  it("prefers common architectural denominators", () => {
    const s = detectScaleFromTexts([mk("1/7"), mk("1/100")]);
    expect(s?.label).toBe("1/100");
  });
});

describe("scale helpers", () => {
  it("scaleFromDenominator maps 1/100 to paper mm/pt × 100", () => {
    expect(scaleFromDenominator(100).realMmPerPt).toBeCloseTo((25.4 / 72) * 100, 5);
  });
  it("scaleFromTwoPoints derives mm per pt from a known distance", () => {
    const s = scaleFromTwoPoints({ x: 0, y: 0 }, { x: 0, y: 100 }, 5000);
    expect(s.realMmPerPt).toBeCloseTo(50, 5); // 5000mm / 100pt
  });
});
